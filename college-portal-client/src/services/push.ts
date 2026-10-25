import { pushApi } from './api';

export type PushState = 'unsupported' | 'disabled' | 'denied' | 'inactive' | 'active';

export interface PushUiState {
  state: PushState;
  /** iOS Safari before 16.4 needs the PWA installed on the home screen. */
  iosNeedsInstall: boolean;
}

export interface EnablePushResult {
  ok: boolean;
  state: PushUiState;
}

/** Thrown when the server exposes a VAPID public key that the browser rejects. */
export class PushConfigError extends Error {
  constructor() {
    super('Ключи VAPID на сервере настроены неверно — обратитесь к администратору');
    this.name = 'PushConfigError';
  }
}

/** P-256 application server key: 65 bytes, '04' uncompressed point prefix. */
export function isValidVapidPublicKey(base64UrlKey: string | null | undefined): boolean {
  if (!base64UrlKey || /\s/.test(base64UrlKey)) return false;
  try {
    const bytes = urlBase64ToUint8Array(base64UrlKey);
    return bytes.length === 65 && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as macOS, so touch support is the tell.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof window.Notification !== 'undefined'
  );
}

function unsupportedState(): PushUiState {
  return {
    state: 'unsupported',
    iosNeedsInstall: isIos() && !isStandalone(),
  };
}

// `navigator.serviceWorker.ready` never resolves when no worker is registered
// (e.g. a dev server with PWA disabled), so never await it unbounded.
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 5000);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Push subscription is missing endpoint or keys');
  }

  await pushApi.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh, auth },
  });
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  if (!registration) return null;

  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Resolves the current push state for the profile UI:
 * - `unsupported` — no Push API (or iOS Safari outside an installed PWA);
 * - `disabled` — the server has no VAPID keys configured;
 * - `denied` — the user blocked notifications in the browser;
 * - `inactive` — ready to subscribe;
 * - `active` — subscription exists in this browser and is bound on the server.
 */
export async function getPushUiState(): Promise<PushUiState> {
  // On iOS every browser uses WebKit, and Web Push is only available to web
  // apps added to the home screen (iOS 16.4+). Show the install hint instead
  // of a button that cannot work.
  if (!isPushSupported() || (isIos() && !isStandalone())) return unsupportedState();

  let config: { enabled: boolean; publicKey: string | null };
  try {
    const response = await pushApi.getPublicKey();
    config = response.data;
  } catch {
    // Without the API we cannot subscribe; surface it as "not configured".
    return { state: 'disabled', iosNeedsInstall: false };
  }

  if (!config.enabled || !config.publicKey) {
    return { state: 'disabled', iosNeedsInstall: false };
  }

  if (Notification.permission === 'denied') {
    return { state: 'denied', iosNeedsInstall: false };
  }

  const subscription = await getExistingSubscription();
  return {
    state: subscription ? 'active' : 'inactive',
    iosNeedsInstall: false,
  };
}

/** Requests permission, subscribes in the browser and binds it on the server. */
export async function enablePush(): Promise<EnablePushResult> {
  const initial = await getPushUiState();
  if (initial.state !== 'inactive') {
    return { ok: initial.state === 'active', state: initial };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = 'denied';
  }

  if (permission !== 'granted') {
    return { ok: false, state: await getPushUiState() };
  }

  const registration = await getRegistration();
  if (!registration) {
    return { ok: false, state: unsupportedState() };
  }

  const { data } = await pushApi.getPublicKey();
  if (!data.enabled || !data.publicKey) {
    return { ok: false, state: { state: 'disabled', iosNeedsInstall: false } };
  }

  // A malformed key fails deep inside PushManager.subscribe with
  // InvalidAccessError; catch it up front and explain what to fix.
  if (!isValidVapidPublicKey(data.publicKey)) {
    throw new PushConfigError();
  }
  const expectedKey = urlBase64ToUint8Array(data.publicKey);

  // A subscription may already exist (e.g. created before logout). Reuse it —
  // subscribing again with the same key throws InvalidStateError in Chrome —
  // but drop it when it was created with a different server key: the browser
  // would otherwise keep a subscription the server can never encrypt for.
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const subscriptionKey = new Uint8Array(
      subscription.options?.applicationServerKey as ArrayBuffer ?? new ArrayBuffer(0),
    );
    if (!bytesEqual(subscriptionKey, expectedKey)) {
      await subscription.unsubscribe().catch(() => undefined);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
      });
    }
  } else {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
      });
    } catch (error) {
      if (error instanceof Error && /InvalidAccessError|applicationServerKey/i.test(error.message)) {
        throw new PushConfigError();
      }
      throw error;
    }
  }

  await saveSubscription(subscription);
  return { ok: true, state: { state: 'active', iosNeedsInstall: false } };
}

/** Removes the server binding and drops the browser subscription. */
export async function disablePush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  try {
    await pushApi.unsubscribe(subscription.endpoint);
  } catch {
    // The server row may already be gone; the browser subscription is still
    // ours to remove, and the API drops dead endpoints on the next 410.
  }

  await subscription.unsubscribe();
}

/**
 * Re-binds an existing browser subscription to the signed-in account. Called
 * after login because a shared browser keeps its subscription between users.
 */
export async function syncPushBinding(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;

  const subscription = await getExistingSubscription();
  if (!subscription) return;

  try {
    await saveSubscription(subscription);
  } catch (error) {
    console.warn('Не удалось перепривязать push-подписку', error);
  }
}

/**
 * Forgets the server binding on logout while keeping the browser subscription
 * intact, so the next sign-in can re-bind it via {@link syncPushBinding}.
 */
export async function removePushBinding(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  try {
    await pushApi.unsubscribe(subscription.endpoint);
  } catch (error) {
    console.warn('Не удалось отвязать push-подписку', error);
  }
}

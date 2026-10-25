/// <reference lib="webworker" />

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Vite внедрит сюда список файлов для кеширования
precacheAndRoute(self.__WB_MANIFEST);

// SPA-fallback: все навигационные запросы (кроме /api/) отдают index.html
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/api\//],
});
registerRoute(navigationRoute);

const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5221/api' : '/api');
const DEFAULT_ICON = '/pwa-192x192.png';

interface PushNotificationPayload {
  id?: string;
  title: string;
  body: string;
  url: string;
  type: string;
  tag: string;
}

interface PushMessageData {
  title: string;
  body: string;
  data: {
    url: string;
    notificationId?: string;
    type: string;
    tag: string;
  };
}

interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly oldSubscription?: PushSubscription;
  readonly newSubscription?: PushSubscription;
}

// Only same-origin relative SPA paths are opened: a notification payload is
// untrusted input, and "//host" would navigate off-site. Browsers normalize
// "/\host" to "//host", so backslashes are rejected too.
function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

function parsePushPayload(event: PushEvent): PushNotificationPayload {
  let raw: unknown;
  try {
    raw = event.data?.json();
  } catch {
    raw = null;
  }

  const payload = (raw && typeof raw === 'object' ? raw : {}) as Partial<PushMessageData>;
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Partial<
    PushMessageData['data']
  >;

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'Новое уведомление';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const notificationId =
    typeof data.notificationId === 'string' && data.notificationId
      ? data.notificationId
      : undefined;
  const type = typeof data.type === 'string' && data.type ? data.type : 'System';
  const tag =
    typeof data.tag === 'string' && data.tag
      ? data.tag
      : notificationId
        ? `cp-${notificationId}`
        : 'cp-notification';

  return {
    id: notificationId,
    title,
    body,
    url: safeUrl(data.url),
    type,
    tag,
  };
}

// Обработка push-сообщения от сервера
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const payload = parsePushPayload(event);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // An open visible tab shows an in-app toast; do not duplicate it with an
      // OS notification. The page answers via NotificationsContext.
      const visibleClients = windowClients.filter(
        (client) => (client as WindowClient).visibilityState === 'visible',
      );

      if (visibleClients.length > 0) {
        for (const client of visibleClients) {
          client.postMessage({
            type: 'push',
            notification: {
              id: payload.id,
              title: payload.title,
              body: payload.body,
              url: payload.url,
              type: payload.type,
            },
          });
        }
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: DEFAULT_ICON,
        badge: DEFAULT_ICON,
        tag: payload.tag,
        data: {
          url: payload.url,
          notificationId: payload.id,
          type: payload.type,
          tag: payload.tag,
        },
      });
    })(),
  );
});

// Клик по уведомлению — открываем нужную страницу
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const notificationData = event.notification.data as { url?: unknown } | undefined;
  const urlToOpen = safeUrl(notificationData?.url);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (!('focus' in client)) continue;
        try {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(urlToOpen);
          }
          return;
        } catch {
          // The tab may be controlled by an older worker; try the next one.
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(urlToOpen);
      }
    })(),
  );
});

// The browser rotates push subscriptions on its own schedule. Re-register the
// new endpoint so delivery keeps working without a page being open.
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const changeEvent = event as PushSubscriptionChangeEvent;

  changeEvent.waitUntil(
    (async () => {
      try {
        let subscription = changeEvent.newSubscription ?? null;

        if (!subscription) {
          const applicationServerKey =
            changeEvent.oldSubscription?.options?.applicationServerKey ?? null;
          if (!applicationServerKey) return;

          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        const json = subscription.toJSON();
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;
        if (!json.endpoint || !p256dh || !auth) return;

        await fetch(`${API_BASE_URL}/push/subscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh, auth },
          }),
        });
      } catch (error) {
        console.warn('Не удалось обновить push-подписку', error);
      }
    })(),
  );
});

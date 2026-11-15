import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';

// The browser fires `beforeinstallprompt` once, often long before the profile
// page mounts. Keep the deferred event in a module-level store so every
// consumer (the global banner and the profile card) can use it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function publishPrompt(event: BeforeInstallPromptEvent | null): void {
  deferredPrompt = event;
  promptListeners.forEach((listener) => listener(event));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // The browser shows its native prompt only once: take control and show
    // our own UI instead.
    event.preventDefault();
    publishPrompt(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => publishPrompt(null));
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Отслеживает событие beforeinstallprompt и даёт компонентам возможность
 * показать нативный диалог установки PWA.
 */
export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(deferredPrompt);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    promptListeners.add(setPromptEvent);

    const onInstalled = () => {
      setInstalled(true);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('appinstalled', onInstalled);
    return () => {
      promptListeners.delete(setPromptEvent);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      // The event can be used only once, so clear it for every consumer.
      publishPrompt(null);
      if (outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      // Already consumed elsewhere (for example by the global banner).
      publishPrompt(null);
    }
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  // The profile card is an explicit install action, so it ignores the banner
  // dismissal and only needs the browser prompt to be available.
  const promptAvailable = !installed && promptEvent !== null;
  const canInstall = promptAvailable && !dismissed;

  return { canInstall, promptAvailable, installed, install, dismiss };
}

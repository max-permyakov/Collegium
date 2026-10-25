import { usePwaInstall } from '../../hooks/usePwaInstall';
import { Button } from '../ui/Button';

/**
 * Баннер «Установить приложение»: показывается один раз, когда браузер
 * разрешает установку PWA (событие beforeinstallprompt). Пользователь может
 * закрыть его — тогда больше не показываем.
 */
export function InstallPrompt() {
  const { canInstall, install, dismiss } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2">
      <div className="card border-primary-500/40 shadow-lg shadow-primary-500/10 p-4 flex items-center gap-3">
        <img
          src="/pwa-192x192.png"
          alt=""
          className="h-12 w-12 rounded-xl shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dark-text">
            Установите KKEP.ka
          </p>
          <p className="text-xs text-dark-textMuted mt-0.5">
            Расписание и оценки как в обычном приложении — с ярлыка на экране.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" onClick={install}>
            Установить
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Не предлагать установку"
            className="p-1.5 rounded-lg text-dark-textMuted hover:text-dark-text hover:bg-dark-border/40 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

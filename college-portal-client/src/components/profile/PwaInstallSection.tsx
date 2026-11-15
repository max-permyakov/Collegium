import { usePwaInstall } from '../../hooks/usePwaInstall';
import { Button } from '../../components/ui/Button';

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as macOS, so touch support is the tell.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Explicit "install the app" control without card chrome, used inside the
 * settings modal. The browser shows its native prompt only after
 * `beforeinstallprompt`, so unsupported browsers get short instructions.
 */
export function PwaInstallSection() {
  const { promptAvailable, installed, install } = usePwaInstall();
  const ios = isIos();

  if (installed) {
    return (
      <p className="text-sm text-dark-textMuted">
        Приложение уже установлено — запускайте его с ярлыка на экране.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-dark-textMuted">
        Установите KKEP.ka на телефон или компьютер: расписание и оценки откроются
        в отдельном окне, как в обычном приложении.
      </p>
      {promptAvailable ? (
        <Button onClick={() => void install()}>Скачать приложение</Button>
      ) : ios ? (
        <p className="text-sm text-dark-text">
          В Safari нажмите «Поделиться» → «На экран “Домой”».
        </p>
      ) : (
        <p className="text-xs text-dark-textMuted">
          Если кнопки нет, установите портал через меню браузера:
          «Установить приложение» или «Добавить на главный экран».
        </p>
      )}
    </div>
  );
}

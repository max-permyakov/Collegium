import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { disablePush, enablePush, getPushUiState, PushConfigError, type PushUiState } from '../../services/push';
import { Button } from '../../components/ui/Button';

function pushStateText(state: PushUiState | null): string {
  switch (state?.state) {
    case 'active':
      return 'Уведомления включены в этом браузере.';
    case 'inactive':
      return 'Включите, чтобы получать новости, задания и сообщения прямо в браузере.';
    case 'denied':
      return 'Браузер заблокировал уведомления. Разрешите их в настройках сайта и обновите страницу.';
    case 'unsupported':
      return state.iosNeedsInstall
        ? 'На iPhone уведомления работают только после установки портала на главный экран.'
        : 'Этот браузер не поддерживает push-уведомления.';
    case 'disabled':
      return 'Push-уведомления не настроены на сервере. Обратитесь к администратору.';
    default:
      return 'Проверяем настройки уведомлений…';
  }
}

/** Push on/off control without card chrome, used inside the settings modal. */
export function PushNotificationsSection() {
  const [state, setState] = useState<PushUiState | null>(null);
  const [pending, setPending] = useState(false);

  const loadState = useCallback(async () => {
    setState(await getPushUiState());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getPushUiState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (!state) return;
    setPending(true);
    try {
      if (state.state === 'active') {
        await disablePush();
        toast.success('Уведомления выключены');
      } else {
        const result = await enablePush();
        if (result.ok) {
          toast.success('Уведомления включены');
        } else if (result.state.state === 'denied') {
          toast.error('Браузер заблокировал уведомления');
        } else if (result.state.state === 'unsupported') {
          toast.error('Этот браузер не поддерживает push-уведомления');
        } else {
          toast.error('Не удалось включить уведомления');
        }
      }
    } catch (error) {
      toast.error(
        error instanceof PushConfigError
          ? error.message
          : 'Не удалось изменить настройки уведомлений',
      );
    } finally {
      setPending(false);
      await loadState();
    }
  };

  const active = state?.state === 'active';
  const toggleDisabled =
    !state || pending || state.state === 'unsupported' || state.state === 'disabled';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-dark-text">{pushStateText(state)}</p>
          <p className="text-xs text-dark-textMuted">
            Уведомления о рефералах, новостях и новых сообщениях приходят, даже если вкладка закрыта.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Push-уведомления"
          disabled={toggleDisabled}
          onClick={() => void toggle()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 ${
            active ? 'bg-primary-500' : 'bg-dark-border'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {(state?.state === 'denied' || state?.state === 'disabled') && (
        <Button variant="ghost" size="sm" onClick={() => void loadState()}>
          Проверить снова
        </Button>
      )}
    </div>
  );
}

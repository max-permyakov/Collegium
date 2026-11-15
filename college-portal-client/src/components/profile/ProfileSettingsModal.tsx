import { Modal } from '../../components/ui/Modal';
import { PwaInstallSection } from './PwaInstallSection';
import { PushNotificationsSection } from './PushNotificationsSection';

/** Profile settings opened from the gear button in the profile header. */
export function ProfileSettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Настройки" onClose={onClose}>
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-textMuted">
            Приложение
          </h3>
          <PwaInstallSection />
        </section>

        <div className="border-t border-dark-border" />

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-textMuted">
            Уведомления
          </h3>
          <PushNotificationsSection />
        </section>
      </div>
    </Modal>
  );
}

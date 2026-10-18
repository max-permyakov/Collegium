import { useEffect, useState } from 'react';
import { permissionsApi } from '../../services/api';
import { Button } from '../ui/Button';
import type { Permission } from '../../types';
import { ALL_PERMISSIONS, PERMISSION_LABELS } from '../../types';

interface PermissionsModalProps {
  userId: string;
  displayName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function PermissionsModal({ userId, displayName, onClose, onSaved }: PermissionsModalProps) {
  const [values, setValues] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    permissionsApi
      .getForUser(userId)
      .then((res) => {
        if (!cancelled) setValues(res.data.permissions ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить права пользователя');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = (permission: Permission, checked: boolean) => {
    setValues((prev) =>
      checked ? [...new Set([...prev, permission])] : prev.filter((p) => p !== permission)
    );
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await permissionsApi.setForUser(userId, values);
      onSaved?.();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Не удалось сохранить права');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      onClick={() => (!saving ? onClose() : undefined)}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-dark-card border border-dark-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div>
            <h3 className="text-lg font-semibold text-dark-text">Права администратора</h3>
            <p className="text-sm text-dark-textMuted">{displayName}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>✕</Button>
        </div>

        <div className="p-4 space-y-2">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <div className="skeleton h-40" />
          ) : (
            ALL_PERMISSIONS.map((permission) => (
              <label
                key={permission}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-dark-border/50 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-500"
                  checked={values.includes(permission)}
                  disabled={saving}
                  onChange={(e) => toggle(permission, e.target.checked)}
                />
                <span className="text-sm text-dark-text">{PERMISSION_LABELS[permission]}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-dark-border">
          <p className="text-xs text-dark-textMuted">Доступно только первичному администратору</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              Отмена
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { adminApi } from '../../services/api';
import { Button } from '../ui/Button';
import type { DiaryCredentialsDto } from '../../types';

/**
 * Служебная панель безопасности в админке: показывает данные дневникового
 * аккаунта пользователя — логин дневника и хеш пароля (SHA-256 base64, ровно
 * то, что дневник принимает как «пароль»; открытый пароль на сервер не
 * приходит вовсе — браузер клиента сам его хеширует). Хеш позволяет админу
 * убедиться в принадлежности аккаунта или воспроизвести вход.
 */
export function DiarySecurityPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<DiaryCredentialsDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'login' | 'hash' | null>(null);

  const load = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await adminApi.getDiaryCredentials(userId);
      setData(res.data);
    } catch {
      setError('Не удалось получить данные дневника');
    } finally {
      setIsLoading(false);
    }
  };

  const copy = async (text: string, which: 'login' | 'hash') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Обмен через буфер недоступен — текст и так виден, выделяется вручную.
    }
  };

  return (
    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-sm space-y-2">
      <p className="text-red-400 font-medium">
        ⚠ Проверка безопасности: аккаунт дневника без студенческой роли
      </p>
      <p className="text-dark-textMuted text-xs leading-relaxed">
        Дневник не вернул студенческую привязку (это признак преподавателя или сотрудника),
        но пользователь прошёл через него на портал. Аккаунт работает в штатном режиме,
        этот блок — только для проверки администратором.
      </p>

      {!data && !error && (
        <Button size="sm" variant="secondary" loading={isLoading} onClick={() => void load()}>
          Показать данные дневника
        </Button>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-xs">{error}</span>
          <Button size="sm" variant="ghost" onClick={() => void load()}>Повторить</Button>
        </div>
      )}

      {data && (
        <div className="space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-dark-bg border border-dark-border px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="text-dark-textMuted">логин дневника: </span>
              <span className="text-dark-text break-all">{data.diaryLogin || '—'}</span>
            </div>
            {data.diaryLogin && (
              <button
                className="text-primary-400 hover:text-primary-300 shrink-0 font-sans"
                onClick={() => void copy(data.diaryLogin!, 'login')}
              >
                {copied === 'login' ? '✓' : 'копировать'}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-dark-bg border border-dark-border px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="text-dark-textMuted">хеш пароля (SHA-256): </span>
              <span className="text-dark-text break-all">{data.passwordHash || '—'}</span>
            </div>
            {data.passwordHash && (
              <button
                className="text-primary-400 hover:text-primary-300 shrink-0 font-sans"
                onClick={() => void copy(data.passwordHash!, 'hash')}
              >
                {copied === 'hash' ? '✓' : 'копировать'}
              </button>
            )}
          </div>
          <p className="text-dark-textMuted text-[11px] leading-relaxed">
            Привязан: {data.linkedAt ? new Date(data.linkedAt).toLocaleString('ru-RU') : '—'} ·
            studentId: {data.externalStudentId ?? '—'} ·
            открытый пароль на сервер не поступает (браузер шлёт только SHA-256, как требует дневник)
          </p>
        </div>
      )}
    </div>
  );
}

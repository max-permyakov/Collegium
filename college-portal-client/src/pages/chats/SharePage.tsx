import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { CHAT_TEXT_LIMIT, MAX_MESSAGE_PARTS } from '../../utils/text';
import type { ChatListItemDto } from '../../types/chats';

const SavedIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
  </svg>
);

/**
 * Страница приёма контента из Android «Поделиться → KKEP.ka» (manifest
 * share_target): текст/ссылка попадают в textarea, дальше пользователь
 * выбирает чат и отправляет как обычное текстовое сообщение.
 */
export function SharePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  const sharedText = useMemo(() => {
    const parts = [params.get('text'), params.get('title'), params.get('url')]
      .filter((p): p is string => Boolean(p && p.trim()))
      .map((p) => p.trim());
    // Заголовок и текст часто дублируют друг друга (например, «URL — URL»).
    return Array.from(new Set(parts)).join('\n').slice(0, MAX_MESSAGE_PARTS * CHAT_TEXT_LIMIT);
  }, [params]);

  const [text, setText] = useState(sharedText);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const { data: chats } = useQuery<ChatListItemDto[]>({
    queryKey: ['chats'],
    queryFn: async () => (await chatsApi.list()).data,
  });

  const targets = (chats ?? []).filter((c) => c.kind === 'Direct' || c.kind === 'Saved');

  const sendMutation = useMutation({
    mutationFn: (target: ChatListItemDto) =>
      chatsApi.send(target.id, { text: text.trim() }),
    onSuccess: (_data, target) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', target.id] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      setSentTo(target.kind === 'Saved' ? 'Избранное' : target.otherUser.displayName);
      window.setTimeout(() => navigate(`/chats/${target.id}`), 1200);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось отправить');
    },
  });

  const canSend = text.trim().length > 0 && !sendMutation.isPending && sentTo === null;
  const tooLong = text.trim().length > MAX_MESSAGE_PARTS * CHAT_TEXT_LIMIT;

  return (
    <div className="max-w-md mx-auto p-3 lg:p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h1 className="text-lg font-semibold text-dark-text">Поделиться в KKEP.ka</h1>
      <p className="text-sm text-dark-textMuted mt-1">
        Выберите чат, в который отправить принятый текст.
      </p>

      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input mt-3 w-full resize-none"
        placeholder="Текст для отправки..."
        maxLength={MAX_MESSAGE_PARTS * CHAT_TEXT_LIMIT}
      />
      {tooLong && (
        <p className="mt-1 text-xs text-red-400">
          Слишком длинный текст — сократите его.
        </p>
      )}

      {sentTo && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          Отправлено в «{sentTo}». Открываем чат…
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-1">
        {targets.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!canSend}
            onClick={() => sendMutation.mutate(c)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-dark-card border border-transparent hover:border-dark-border text-left disabled:opacity-50"
          >
            {c.kind === 'Saved' ? (
              <span className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/15 text-amber-400">
                <SavedIcon className="w-5 h-5" />
              </span>
            ) : (
              <Avatar src={c.otherUser.avatarDataUrl || undefined} name={c.otherUser.displayName} size="md" />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-dark-text truncate">
                {c.kind === 'Saved' ? 'Избранное' : c.otherUser.displayName}
              </span>
              <span className="block text-xs text-dark-textMuted truncate">
                {c.kind === 'Saved' ? 'Личные заметки' : 'Личный чат'}
              </span>
            </span>
          </button>
        ))}
        {chats && targets.length === 0 && (
          <p className="px-3 py-6 text-sm text-dark-textMuted text-center">
            Чатов пока нет — начните переписку со страницы поиска в «Чатах».
          </p>
        )}
        {!chats && (
          <div className="skeleton h-12 w-full" />
        )}
      </div>

      {!sharedText && (
        <p className="mt-4 text-xs text-dark-textMuted">
          Совет: на телефоне нажмите «Поделиться» в другом приложении и выберите KKEP.ka — текст попадёт сюда.
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-4"
        onClick={() => navigate('/chats')}
      >
        → К списку чатов
      </Button>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminSupportApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Input } from '../../components/ui/Input';
import { itemTime, messagePreview } from '../../utils/chatPreview';
import { ChatConversation } from '../chats/ChatDetailPage';
import type { ChatListItemDto } from '../../types/chats';

const INBOX_POLL_MS = 5000;

/**
 * Shared admin inbox for support requests. Every user has exactly one Support
 * thread, so the list is effectively «users who wrote to support», newest
 * activity first. Replies are sent as the current admin account.
 */
export function SupportInboxTab() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const inboxQuery = useQuery<ChatListItemDto[]>({
    queryKey: ['admin-support'],
    queryFn: async () => (await adminSupportApi.list()).data,
    refetchInterval: INBOX_POLL_MS,
  });

  const chats = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const totalUnread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleChats = normalizedQuery
    ? chats.filter((chat) =>
        `${chat.otherUser.displayName} ${chat.otherUser.studyGroupName ?? ''}`.toLowerCase().includes(normalizedQuery),
      )
    : chats;

  if (inboxQuery.isLoading) {
    return <div className="skeleton h-64" />;
  }

  if (inboxQuery.isError) {
    return (
      <div className="p-6 text-center text-dark-textMuted rounded-xl border border-dark-border bg-dark-card">
        Не удалось загрузить обращения. Обновите страницу.
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-4 h-[70vh] min-h-[26rem]">
      {/* Список обращений */}
      <div
        className={`flex flex-col min-w-0 min-h-0 overflow-hidden rounded-2xl border border-dark-border bg-dark-card ${
          selectedId ? 'hidden lg:flex' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-dark-border">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-dark-text">Поддержка</h2>
            <p className="text-xs text-dark-textMuted">
              {chats.length === 0
                ? 'Обращений пока нет'
                : `${chats.length} ${chats.length === 1 ? 'обращение' : chats.length < 5 ? 'обращения' : 'обращений'}`}
            </p>
          </div>
          {totalUnread > 0 && (
            <span className="flex-shrink-0 min-w-6 h-6 px-2 inline-flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-semibold">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>

        <div className="px-3 pt-2 pb-2 border-b border-dark-border">
          <Input
            label="Поиск по имени или группе"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Иван или ИС-21"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2 space-y-1">
          {visibleChats.length === 0 && (
            <p className="text-sm text-dark-textMuted text-center py-8 px-3">
              {chats.length === 0
                ? 'Пользователи ещё не обращались в поддержку.'
                : 'Ничего не найдено.'}
            </p>
          )}

          {visibleChats.map((chat) => {
            const active = chat.id === selectedId;
            const unread = chat.unreadCount;
            const last = chat.lastMessage;

            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => setSelectedId(chat.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                  active
                    ? 'bg-primary-500/15 border border-primary-500/30'
                    : 'border border-transparent hover:bg-dark-border/60'
                }`}
              >
                <Avatar
                  src={chat.otherUser.avatarDataUrl || undefined}
                  name={chat.otherUser.displayName}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-sm truncate ${unread > 0 ? 'font-semibold text-dark-text' : 'font-medium text-dark-text'}`}>
                      {chat.otherUser.displayName}
                    </p>
                    {last && <span className="text-xs text-dark-textMuted shrink-0">{itemTime(last.createdAt)}</span>}
                  </div>
                  {chat.otherUser.studyGroupName && (
                    <p className="text-[11px] text-dark-textMuted/80 truncate">{chat.otherUser.studyGroupName}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread > 0 ? 'text-dark-text font-medium' : 'text-dark-textMuted'}`}>
                      {messagePreview(last, user?.id) || 'Нет сообщений'}
                    </p>
                    {unread > 0 && (
                      <span className="flex-shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary-500 text-white text-[11px] font-semibold">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Переписка с выбранным пользователем */}
      <div
        className={`min-w-0 min-h-0 overflow-hidden rounded-2xl border border-dark-border bg-dark-card/40 lg:col-span-2 ${
          selectedId ? 'flex flex-col h-[70vh] min-h-[26rem] lg:h-full' : 'hidden lg:flex lg:h-full'
        }`}
      >
        {selectedId ? (
          <ChatConversation
            key={selectedId}
            chatId={selectedId}
            adminView
            onBack={() => setSelectedId(null)}
            hideBackOnDesktop
            backLabel="К обращениям"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-10 m-3 rounded-xl border border-dashed border-dark-border">
            <svg className="w-10 h-10 text-dark-textMuted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="3.5" strokeWidth={1.5} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4" />
            </svg>
            <p className="text-dark-textMuted font-medium">Выберите обращение</p>
            <p className="text-xs text-dark-textMuted/70">
              Слева — пользователи, написавшие в поддержку. Ответьте им от лица администрации.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

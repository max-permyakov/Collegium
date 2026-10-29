import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { itemTime, messagePreview } from '../../utils/chatPreview';
import type { ChatKind, ChatListItemDto, ChatUserDto } from '../../types/chats';

const LIST_POLL_MS = 5000;

const SPECIAL_HINTS: Record<Exclude<ChatKind, 'Direct'>, string> = {
  Saved: 'Заметки и файлы только для вас',
  Support: 'Опишите проблему — мы поможем',
};

const SPECIAL_LABELS: Record<Exclude<ChatKind, 'Direct'>, string> = {
  Saved: 'Избранное',
  Support: 'Поддержка',
};

const SavedIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
  </svg>
);

const SupportIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4" />
  </svg>
);

export function ChatsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const listQuery = useQuery<ChatListItemDto[]>({
    queryKey: ['chats'],
    queryFn: async () => (await chatsApi.list()).data,
    refetchInterval: LIST_POLL_MS,
  });

  const searchQuery = useQuery({
    queryKey: ['chats', 'search', debouncedQuery],
    queryFn: async () => (await chatsApi.search(debouncedQuery)).data,
    enabled: searchOpen && debouncedQuery.length > 0,
  });

  const startChatMutation = useMutation({
    mutationFn: (otherUserId: string) => chatsApi.findOrCreate(otherUserId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      setSearchOpen(false);
      setQuery('');
      navigate(`/chats/${res.data.id}`);
    },
  });

  const openSpecialMutation = useMutation({
    mutationFn: (kind: Exclude<ChatKind, 'Direct'>) =>
      kind === 'Saved' ? chatsApi.openSaved() : chatsApi.openSupport(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      setSearchOpen(false);
      setQuery('');
      navigate(`/chats/${res.data.id}`);
    },
  });

  const chats = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const savedChat = chats.find((c) => c.kind === 'Saved');
  const supportChat = chats.find((c) => c.kind === 'Support');
  const directChats = chats.filter((c) => c.kind === 'Direct');
  const search = searchQuery.data;
  const hasQuery = debouncedQuery.length > 0;

  const openChat = (id: string) => navigate(`/chats/${id}`);

  const openSpecial = (kind: Exclude<ChatKind, 'Direct'>) => {
    const existing = kind === 'Saved' ? savedChat : supportChat;
    if (existing) openChat(existing.id);
    else openSpecialMutation.mutate(kind);
  };

  const toggleSearch = () => {
    setSearchOpen((open) => !open);
    setQuery('');
  };

  const renderSpecialRow = (kind: Exclude<ChatKind, 'Direct'>, chat: ChatListItemDto | undefined) => {
    const active = chat?.id === chatId;
    const preview = chat?.lastMessage ? messagePreview(chat.lastMessage, user?.id) : SPECIAL_HINTS[kind];
    const creating = openSpecialMutation.isPending && openSpecialMutation.variables === kind;

    return (
      <button
        key={kind}
        type="button"
        onClick={() => openSpecial(kind)}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
          active ? 'bg-primary-500/15 border border-primary-500/30' : 'border border-transparent hover:bg-dark-border/60'
        }`}
      >
        <span
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            kind === 'Saved' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'
          }`}
        >
          {kind === 'Saved' ? <SavedIcon className="w-5 h-5" /> : <SupportIcon className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-text truncate">{SPECIAL_LABELS[kind]}</p>
          <p className="text-sm text-dark-textMuted truncate">{creating ? 'Открываем...' : preview}</p>
        </div>
      </button>
    );
  };

  // Левая панель — список чатов (на телефоне на всю ширину и высоту экрана).
  const chatList = (
    <div
      className={`flex flex-col min-w-0 min-h-0 overflow-hidden bg-dark-card -mx-4 sm:-mx-6 -mb-20 -mt-4 h-[100dvh] rounded-none border-0 lg:mx-0 lg:mb-0 lg:mt-0 lg:h-full lg:rounded-2xl lg:border lg:border-dark-border ${
        chatId ? 'hidden lg:flex' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-dark-border lg:pt-3">
        <h1 className="text-xl font-bold text-dark-text">Чаты</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSearch}
          aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск чатов и пользователей'}
          title="Поиск"
          className="p-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            {searchOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            )}
          </svg>
        </Button>
      </div>

      {searchOpen && (
        <div className="px-3 py-3 border-b border-dark-border space-y-3 max-h-[50%] overflow-y-auto overscroll-contain">
          <Input
            autoFocus
            label="Поиск"
            value={query}
            maxLength={200}
            placeholder="Имя или сообщение..."
            onChange={(e) => setQuery(e.target.value)}
          />
          {startChatMutation.isPending && <p className="text-sm text-dark-textMuted">Открываем чат...</p>}
          {startChatMutation.isError && <p className="text-sm text-red-400">Не удалось создать чат</p>}
          {hasQuery && searchQuery.isFetching && <p className="text-sm text-dark-textMuted">Поиск...</p>}
          {hasQuery && !searchQuery.isFetching && (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-dark-textMuted">Чаты</p>
                {search && search.chats.length > 0 ? (
                  search.chats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => openChat(chat.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-dark-border/60 transition-colors text-left"
                    >
                      <Avatar src={chat.otherUser.avatarDataUrl || undefined} name={chat.otherUser.displayName} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-dark-text truncate">{chat.otherUser.displayName}</p>
                        {chat.otherUser.studyGroupName && (
                          <p className="text-xs text-dark-textMuted truncate">{chat.otherUser.studyGroupName}</p>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-dark-textMuted">Ничего не найдено</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-dark-textMuted">Пользователи</p>
                {search && search.users.length > 0 ? (
                  search.users.reduce<ChatUserDto[]>((acc, u) => {
                    if (!acc.some((existing) => existing.id === u.id)) acc.push(u);
                    return acc;
                  }, []).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => startChatMutation.mutate(u.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-dark-border/60 transition-colors text-left"
                    >
                      <Avatar src={u.avatarDataUrl || undefined} name={u.displayName} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-dark-text truncate">{u.displayName}</p>
                        {u.studyGroupName && (
                          <p className="text-xs text-dark-textMuted truncate">{u.studyGroupName}</p>
                        )}
                      </div>
                      <span className="text-xs text-primary-400 shrink-0">Написать</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-dark-textMuted">Ничего не найдено</p>
                )}
              </div>
            </>
          )}
          {!hasQuery && (
            <p className="text-sm text-dark-textMuted">Введите имя пользователя или текст сообщения</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-1">
        {listQuery.isLoading && <div className="skeleton h-20" />}

        {!listQuery.isLoading && (
          <div className="space-y-1">
            {renderSpecialRow('Saved', savedChat)}
            {renderSpecialRow('Support', supportChat)}
          </div>
        )}

        {!listQuery.isLoading && directChats.length === 0 && !searchOpen && (
          <p className="text-sm text-dark-textMuted text-center py-6 px-3">
            Личных чатов пока нет. Найдите пользователя через поиск и напишите ему!
          </p>
        )}

        {directChats.map((chat: ChatListItemDto) => {
          const last = chat.lastMessage;
          const unread = chat.unreadCount;
          const active = chat.id === chatId;
          return (
            <Link
              key={chat.id}
              to={`/chats/${chat.id}`}
              className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                active ? 'bg-primary-500/15 border border-primary-500/30' : 'border border-transparent hover:bg-dark-border/60'
              }`}
            >
              <Avatar src={chat.otherUser.avatarDataUrl || undefined} name={chat.otherUser.displayName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm truncate ${unread > 0 ? 'font-semibold text-dark-text' : 'font-medium text-dark-text'}`}>
                    {chat.otherUser.displayName}
                  </p>
                  {last && <span className="text-xs text-dark-textMuted shrink-0">{itemTime(last.createdAt)}</span>}
                </div>
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
            </Link>
          );
        })}
      </div>
    </div>
  );

  // Правая панель — открытый чат (2/3 ширины) или подсказка «Открыть чат».
  // На телефоне переписка занимает весь экран (без «окна» с полями и рамкой).
  const chatPane = (
    <div
      className={`min-w-0 min-h-0 overflow-hidden bg-dark-card lg:col-span-2 lg:rounded-2xl lg:border lg:border-dark-border lg:bg-dark-card/40 ${
        chatId
          ? 'fixed inset-0 z-40 flex h-[100dvh] w-full flex-col lg:static lg:z-auto lg:h-full'
          : 'hidden lg:flex lg:h-full'
      }`}
    >
      {chatId ? (
        <Outlet />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-10 m-3 rounded-xl border border-dashed border-dark-border">
          <svg className="w-10 h-10 text-dark-textMuted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-dark-textMuted font-medium">Открыть чат</p>
          <p className="text-xs text-dark-textMuted/70">Выберите чат слева или найдите пользователя через поиск</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-4 lg:h-[calc(100dvh-2rem)]">
      {chatList}
      {chatPane}
    </div>
  );
}

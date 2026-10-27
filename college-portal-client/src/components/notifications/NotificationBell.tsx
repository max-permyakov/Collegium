import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNotifications } from '../../context/NotificationsContext';
import { formatMoscowDate } from '../../utils/datetime';
import type { AppNotification, AppNotificationType } from '../../types';

const BellIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

const NewsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
    />
  </svg>
);

const AssignmentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
    />
  </svg>
);

const ClubIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const CommentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const SystemIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ChatMessageIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const TYPE_STYLES: Record<AppNotificationType, { icon: ReactNode; className: string }> = {
  News: { icon: <NewsIcon className="w-4 h-4" />, className: 'bg-sky-500/15 text-sky-400' },
  Assignment: { icon: <AssignmentIcon className="w-4 h-4" />, className: 'bg-amber-500/15 text-amber-400' },
  ClubMessage: { icon: <ClubIcon className="w-4 h-4" />, className: 'bg-emerald-500/15 text-emerald-400' },
  Comment: { icon: <CommentIcon className="w-4 h-4" />, className: 'bg-violet-500/15 text-violet-400' },
  ChatMessage: { icon: <ChatMessageIcon className="w-4 h-4" />, className: 'bg-rose-500/15 text-rose-400' },
  System: { icon: <SystemIcon className="w-4 h-4" />, className: 'bg-primary-500/15 text-primary-400' },
};

function relativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';

  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;

  return formatMoscowDate(iso);
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.System;

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        notification.isRead ? 'hover:bg-dark-border/60' : 'bg-primary-500/5 hover:bg-primary-500/10'
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${style.className}`}
        aria-hidden="true"
      >
        {style.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 flex-1 text-sm font-medium text-dark-text">
            {notification.title}
          </span>
          {!notification.isRead && (
            <span
              className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary-400"
              aria-label="Не прочитано"
            />
          )}
        </span>
        {notification.body && (
          <span className="mt-0.5 block line-clamp-2 text-xs text-dark-textMuted">
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-dark-textMuted">
          {relativeTime(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    markAllRead,
    open,
    refresh,
  } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) void refresh().catch(() => undefined);
  };

  const handleOpen = (notification: AppNotification) => {
    setIsOpen(false);
    open(notification);
    onNavigate?.();
  };

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={containerRef} className="lg:relative">
      <button
        type="button"
        onClick={toggle}
        className="btn-ghost relative p-2"
        aria-label={
          unreadCount > 0 ? `Уведомления, непрочитанных: ${unreadCount}` : 'Уведомления'
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Уведомления"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {badgeText}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className="absolute right-0 top-16 z-50 flex max-h-[min(28rem,calc(100vh-6rem))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-xl lg:top-full lg:mt-2"
        >
          <div className="flex items-center justify-between gap-3 border-b border-dark-border px-4 py-3">
            <p className="text-sm font-semibold text-dark-text">Уведомления</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead().catch(() => undefined)}
                className="text-xs font-medium text-primary-400 transition-colors hover:text-primary-300"
              >
                Прочитать все
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading && (
              <div className="space-y-2 p-1" aria-label="Загрузка уведомлений">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex animate-pulse gap-3 rounded-xl px-3 py-3">
                    <span className="h-8 w-8 flex-shrink-0 rounded-full bg-dark-border" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-3/4 rounded bg-dark-border" />
                      <span className="block h-2.5 w-full rounded bg-dark-border/70" />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && isError && (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-dark-textMuted">Не удалось загрузить уведомления</p>
                <button
                  type="button"
                  onClick={() => void refresh().catch(() => undefined)}
                  className="mt-2 text-xs font-medium text-primary-400 hover:text-primary-300"
                >
                  Повторить
                </button>
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="px-3 py-10 text-center">
                <BellIcon className="mx-auto h-8 w-8 text-dark-textMuted/50" />
                <p className="mt-2 text-sm text-dark-textMuted">Пока нет уведомлений</p>
                <p className="mt-1 text-xs text-dark-textMuted/70">
                  Здесь появятся новости, задания и другие события
                </p>
              </div>
            )}

            {!isLoading && !isError && notifications.length > 0 && (
              <ul className="space-y-1" role="list">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow notification={notification} onOpen={handleOpen} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

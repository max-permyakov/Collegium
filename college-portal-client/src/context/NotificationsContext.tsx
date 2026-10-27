import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notificationsApi } from '../services/api';
import { useAuth } from './AuthContext';
import type { AppNotification, AppNotificationType, PushMessagePayload } from '../types';

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 30;

const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  open: (notification: AppNotification) => void;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Only relative SPA paths are opened; the server already rejects unsafe
// values, but the push payload is untrusted data as well. Browsers normalize
// "/\host" to "//host", so a backslash must never appear in the path.
function isSafePath(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.startsWith('/') &&
    !url.includes('\\') &&
    !url.startsWith('//')
  );
}

interface ToastNotification {
  id?: string;
  title: string;
  body?: string;
  url?: string;
  type?: AppNotificationType;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAuthenticated = Boolean(user);

  const listQuery = useQuery({
    queryKey: notificationKeys.list,
    queryFn: async () => (await notificationsApi.get({ limit: PAGE_SIZE })).data,
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const unreadQuery = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => (await notificationsApi.getUnreadCount()).data.count,
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const notifications = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const unreadCount = unreadQuery.data ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previousList = queryClient.getQueryData<AppNotification[]>(notificationKeys.list);
      const previousCount = queryClient.getQueryData<number>(notificationKeys.unreadCount);
      const wasUnread = previousList?.some((item) => item.id === id && !item.isRead);

      queryClient.setQueryData<AppNotification[]>(notificationKeys.list, (current) =>
        current?.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );

      if (wasUnread) {
        queryClient.setQueryData<number>(notificationKeys.unreadCount, (current) =>
          current === undefined ? current : Math.max(0, current - 1),
        );
      }

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(notificationKeys.list, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unreadCount, context.previousCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previousList = queryClient.getQueryData<AppNotification[]>(notificationKeys.list);
      const previousCount = queryClient.getQueryData<number>(notificationKeys.unreadCount);

      queryClient.setQueryData<AppNotification[]>(notificationKeys.list, (current) =>
        current?.map((item) => ({ ...item, isRead: true })),
      );
      queryClient.setQueryData<number>(notificationKeys.unreadCount, 0);

      return { previousList, previousCount };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(notificationKeys.list, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unreadCount, context.previousCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previousList = queryClient.getQueryData<AppNotification[]>(notificationKeys.list);
      const previousCount = queryClient.getQueryData<number>(notificationKeys.unreadCount);
      const wasUnread = previousList?.some((item) => item.id === id && !item.isRead);

      queryClient.setQueryData<AppNotification[]>(notificationKeys.list, (current) =>
        current?.filter((item) => item.id !== id),
      );

      if (wasUnread) {
        queryClient.setQueryData<number>(notificationKeys.unreadCount, (current) =>
          current === undefined ? current : Math.max(0, current - 1),
        );
      }

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(notificationKeys.list, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unreadCount, context.previousCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markRead = useCallback(
    async (id: string) => {
      await markReadMutation.mutateAsync(id);
    },
    [markReadMutation],
  );

  const markAllRead = useCallback(async () => {
    await markAllReadMutation.mutateAsync();
  }, [markAllReadMutation]);

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation],
  );

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  }, [isAuthenticated, queryClient]);

  const openNotification = useCallback(
    (notification: AppNotification) => {
      if (!notification.isRead) {
        void markRead(notification.id).catch(() => {
          // The navigation is more important than a failed read receipt.
        });
      }
      if (isSafePath(notification.url)) {
        navigate(notification.url);
      }
    },
    [markRead, navigate],
  );

  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Reset dedupe state when the signed-in account changes.
  useEffect(() => {
    seenIds.current = new Set();
    initialized.current = false;
  }, [user?.id]);

  const showToast = useCallback(
    (notification: ToastNotification) => {
      const openPayload = () => {
        if (notification.id) {
          void markRead(notification.id).catch(() => undefined);
        }
        if (isSafePath(notification.url)) {
          navigate(notification.url);
        }
      };

      toast(notification.title, {
        description: notification.body || undefined,
        duration: 8000,
        action: isSafePath(notification.url)
          ? { label: 'Открыть', onClick: openPayload }
          : undefined,
      });
    },
    [markRead, navigate],
  );

  // Toast new unread items that appear via polling. The first successful load
  // only primes the seen-set, so opening the app does not replay old items.
  useEffect(() => {
    if (!listQuery.data) return;

    const ordered = [...listQuery.data].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (!initialized.current) {
      ordered.forEach((item) => seenIds.current.add(item.id));
      initialized.current = true;
      return;
    }

    for (const item of ordered) {
      if (seenIds.current.has(item.id)) continue;
      seenIds.current.add(item.id);
      if (!item.isRead) {
        showToast({
          id: item.id,
          title: item.title,
          body: item.body,
          url: item.url ?? undefined,
          type: item.type,
        });
      }
    }
  }, [listQuery.data, showToast]);

  // Foreground push arrives through the service worker; show it as a toast
  // instead of the OS notification the worker already suppressed.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as PushMessagePayload | undefined;
      if (!payload || payload.type !== 'push' || !payload.notification) return;

      const notification = payload.notification;
      if (notification.id) {
        if (seenIds.current.has(notification.id)) return;
        seenIds.current.add(notification.id);
      }

      showToast({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        url: notification.url,
        type: notification.type,
      });

      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      // Письмо в личный чат — обновляем список чатов и счётчик непрочитанных.
      if (notification.type === 'ChatMessage') {
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [isAuthenticated, queryClient, showToast]);

  const value = useMemo<NotificationsContextType>(
    () => ({
      notifications,
      unreadCount,
      isLoading: isAuthenticated && listQuery.isLoading,
      isError: listQuery.isError,
      markRead,
      markAllRead,
      remove,
      open: openNotification,
      refresh,
    }),
    [
      notifications,
      unreadCount,
      isAuthenticated,
      listQuery.isLoading,
      listQuery.isError,
      markRead,
      markAllRead,
      remove,
      openNotification,
      refresh,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}

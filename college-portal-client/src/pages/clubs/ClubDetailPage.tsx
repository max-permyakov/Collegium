import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Textarea } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { Lightbox } from '../../components/ui/Lightbox';
import { formatMoscowDateTime } from '../../utils/datetime';
import type { ClubDetailDto, ClubMessageDto, UpdateClubDto } from '../../types';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_CLUB_NAME_LENGTH = 20;
const MAX_CLUB_DESCRIPTION_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_PAGE_SIZE = 100;

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

const formatDateTime = (value: string) =>
  formatMoscowDateTime(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const toForm = (club: ClubDetailDto): UpdateClubDto => ({
  name: club.name,
  description: club.description ?? '',
  avatarDataUrl: club.avatarDataUrl ?? null,
  isPrivate: club.isPrivate,
  joinByLink: club.joinByLink,
});

interface MessageRowProps {
  message: ClubMessageDto;
  canManage: boolean;
  currentUserId?: string;
  onDelete: (messageId: string) => void;
  onAvatarClick: (src: string) => void;
}

const MessageRow = memo(function MessageRow({
  message,
  canManage,
  currentUserId,
  onDelete,
  onAvatarClick,
}: MessageRowProps) {
  const canDelete = canManage || message.userId === currentUserId;

  return (
    <div className="flex items-start gap-2">
      <Avatar
        src={message.userAvatar || undefined}
        name={message.userName}
        size="sm"
        onImageClick={() => message.userAvatar && onAvatarClick(message.userAvatar)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <Link to={`/users/${message.userId}`} className="text-sm font-medium text-dark-text hover:text-primary-400">{message.userName}</Link>
          <span className="text-xs text-dark-textMuted">{formatDateTime(message.createdAt)}</span>
          {canDelete && (
            <button
              className="text-xs text-red-400 hover:underline"
              onClick={() => onDelete(message.id)}
            >
              удалить
            </button>
          )}
        </div>
        <p className="text-sm text-dark-text whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
      </div>
    </div>
  );
});

export function ClubDetailPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite') ?? undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateClubDto | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [hasOlder, setHasOlder] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const pendingPrependRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const sendingRef = useRef(false);
  const sendQueueRef = useRef<string[]>([]);
  const deleteMessageRef = useRef<(messageId: string) => void>(() => {});

  const { data: club, isLoading, error: loadError } = useQuery<ClubDetailDto>({
    queryKey: ['club', clubId, invite],
    queryFn: async () => (await clubsApi.getClub(clubId!, invite)).data,
    enabled: Boolean(clubId),
    retry: false,
  });

  const canSeeChat = Boolean(club && (club.isMember || club.canManage));

  const { data: messages } = useQuery<ClubMessageDto[]>({
    queryKey: ['club-messages', clubId],
    queryFn: async () => {
      const cached = queryClient.getQueryData<ClubMessageDto[]>(['club-messages', clubId]);
      if (!cached || cached.length === 0) {
        const res = await clubsApi.getMessages(clubId!, { latest: MESSAGE_PAGE_SIZE });
        setHasOlder(res.data.length >= MESSAGE_PAGE_SIZE);
        if (!cached) return res.data;
        const ids = new Set(cached.map((m) => m.id));
        return [...cached, ...res.data.filter((m) => !ids.has(m.id))];
      }
      const cursor = cached[cached.length - 1];
      const res = await clubsApi.getMessages(clubId!, { after: cursor.createdAt, limit: MESSAGE_PAGE_SIZE });
      const current = queryClient.getQueryData<ClubMessageDto[]>(['club-messages', clubId]) ?? cached;
      const ids = new Set(current.map((m) => m.id));
      return [...current, ...res.data.filter((m) => !ids.has(m.id))];
    },
    enabled: Boolean(clubId) && canSeeChat,
    refetchInterval: canSeeChat ? 5000 : false,
  });

  useEffect(() => {
    if (club) setForm(toForm(club));
  }, [club]);

  const invalidateClub = () => {
    queryClient.invalidateQueries({ queryKey: ['club', clubId] });
    queryClient.invalidateQueries({ queryKey: ['clubs'] });
  };
  const appendMessage = (message: ClubMessageDto) => {
    queryClient.setQueryData<ClubMessageDto[]>(['club-messages', clubId], (old) => {
      if (!old) return [message];
      if (old.some((m) => m.id === message.id)) return old;
      return [...old, message];
    });
  };

  const removeMessageFromCache = (messageId: string) => {
    queryClient.setQueryData<ClubMessageDto[]>(['club-messages', clubId], (old) =>
      old ? old.filter((m) => m.id !== messageId) : old
    );
  };

  const joinMutation = useMutation({
    mutationFn: () => clubsApi.join(clubId!, invite),
    onSuccess: invalidateClub,
    onError: (err) => setError(getError(err)),
  });

  const leaveMutation = useMutation({
    mutationFn: () => clubsApi.leave(clubId!),
    onSuccess: () => { invalidateClub(); queryClient.invalidateQueries({ queryKey: ['club-messages', clubId] }); },
    onError: (err) => setError(getError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateClubDto) => clubsApi.update(clubId!, data),
    onSuccess: () => { invalidateClub(); setEditing(false); },
    onError: (err) => setError(getError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => clubsApi.delete(clubId!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clubs'] }); navigate('/clubs'); },
    onError: (err) => setError(getError(err)),
  });

  const leaderMutation = useMutation({
    mutationFn: ({ userId, isLeader }: { userId: string; isLeader: boolean }) => clubsApi.setLeader(clubId!, userId, isLeader),
    onSuccess: invalidateClub,
    onError: (err) => setError(getError(err)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => clubsApi.removeMember(clubId!, userId),
    onSuccess: invalidateClub,
    onError: (err) => setError(getError(err)),
  });

  const postMutation = useMutation({
    mutationFn: (text: string) => clubsApi.postMessage(clubId!, text),
    onSuccess: (res) => {
      sendingRef.current = false;
      appendMessage(res.data);
      isAtBottomRef.current = true;
      drainQueue();
    },
    onError: (err) => {
      sendingRef.current = false;
      setError(getError(err));
      drainQueue();
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => clubsApi.deleteMessage(messageId),
    onSuccess: (_data, messageId) => removeMessageFromCache(messageId),
    onError: (err) => setError(getError(err)),
  });

  const drainQueue = () => {
    if (sendingRef.current) return;
    const next = sendQueueRef.current.shift();
    setQueuedCount(sendQueueRef.current.length);
    if (next !== undefined) {
      sendingRef.current = true;
      postMutation.mutate(next);
    }
  };

  const sendText = (text: string) => {
    if (!text) return;
    sendQueueRef.current.push(text);
    setQueuedCount(sendQueueRef.current.length);
    if (!sendingRef.current) drainQueue();
  };

  useEffect(() => {
    deleteMessageRef.current = (messageId: string) => deleteMessageMutation.mutate(messageId);
  }, [deleteMessageMutation]);

  const handleDeleteMessage = useCallback((messageId: string) => deleteMessageRef.current(messageId), []);
  const handleAvatarClick = useCallback((src: string) => setPreviewImage(src), []);

  const loadOlder = async () => {
    if (olderLoading) return;
    const current = queryClient.getQueryData<ClubMessageDto[]>(['club-messages', clubId]);
    if (!current || current.length === 0) return;

    setOlderLoading(true);
    try {
      const oldest = current[0];
      const res = await clubsApi.getMessages(clubId!, { before: oldest.createdAt, limit: MESSAGE_PAGE_SIZE });
      const ids = new Set(current.map((m) => m.id));
      const added = res.data.filter((m) => !ids.has(m.id));
      if (res.data.length < MESSAGE_PAGE_SIZE) setHasOlder(false);
      if (added.length === 0) return;

      const el = chatContainerRef.current;
      pendingPrependRef.current = { prevHeight: el?.scrollHeight ?? 0, prevTop: el?.scrollTop ?? 0 };
      queryClient.setQueryData<ClubMessageDto[]>(['club-messages', clubId], (old) => {
        if (!old) return old;
        const oldIds = new Set(old.map((m) => m.id));
        const toAdd = added.filter((m) => !oldIds.has(m.id));
        return toAdd.length > 0 ? [...toAdd, ...old] : old;
      });
    } catch (err) {
      setError(getError(err));
    } finally {
      setOlderLoading(false);
    }
  };

  useEffect(() => {
    const el = chatContainerRef.current;
    if (el && isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  useLayoutEffect(() => {
    const pending = pendingPrependRef.current;
    const el = chatContainerRef.current;
    if (!pending || !el) return;
    pendingPrependRef.current = null;
    el.scrollTop = el.scrollHeight - pending.prevHeight + pending.prevTop;
  }, [messages]);

  const inviteLink = useMemo(() => {
    if (!club?.inviteToken) return '';
    return `${window.location.origin}/clubs/${club.id}?invite=${club.inviteToken}`;
  }, [club?.id, club?.inviteToken]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setError('Ссылка скопирована');
      setTimeout(() => setError(''), 2000);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  };

  if (isLoading) return <div className="skeleton h-64" />;

  if (loadError || !club) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <p className="text-dark-textMuted">Группа не найдена или доступ закрыт</p>
          <Link to="/clubs"><Button variant="secondary">К списку кружков</Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/clubs" className="text-sm text-dark-textMuted hover:text-dark-text">← Кружки</Link>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Avatar
              src={club.avatarDataUrl || undefined}
              name={club.name}
              size="xl"
              className="rounded-2xl w-24 h-24"
              onImageClick={() => club.avatarDataUrl && setPreviewImage(club.avatarDataUrl)}
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-dark-text">{club.name}</h1>
                <Badge variant={club.isPrivate ? 'warning' : 'success'}>{club.isPrivate ? 'Приватная' : 'Публичная'}</Badge>
                {club.joinByLink && <Badge variant="info">По ссылке</Badge>}
              </div>
              <p className="text-sm text-dark-textMuted">
                Глава: <Link to={`/users/${club.ownerId}`} className="text-dark-text hover:text-primary-400">{club.ownerName}</Link> · Участников: {club.memberCount}
              </p>
              {club.description && <p className="text-dark-text whitespace-pre-wrap">{club.description}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!club.isMember && (
              club.canJoin ? (
                <Button loading={joinMutation.isPending} onClick={() => joinMutation.mutate()}>Вступить</Button>
              ) : (
                <Badge variant="warning">Вступление по приглашению главы</Badge>
              )
            )}
            {club.isMember && club.ownerId !== user?.id && (
              <Button variant="secondary" loading={leaveMutation.isPending} onClick={() => leaveMutation.mutate()}>
                Покинуть
              </Button>
            )}
            {club.canManage && (
              <>
                <Button variant="secondary" onClick={() => { setForm(toForm(club)); setEditing((v) => !v); }}>
                  {editing ? 'Отменить редактирование' : 'Редактировать'}
                </Button>
                <Button variant="danger" loading={deleteMutation.isPending} onClick={() => {
                  if (confirm('Удалить группу со всеми сообщениями?')) deleteMutation.mutate();
                }}>
                  Удалить
                </Button>
              </>
            )}
            {inviteLink && (
              <Button variant="ghost" onClick={copyInvite}>Скопировать ссылку-приглашение</Button>
            )}
          </div>

          {editing && form && (
            <div className="border-t border-dark-border pt-4 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar src={form.avatarDataUrl || undefined} name={form.name || '?'} size="xl" className="rounded-2xl" />
                  <label className="btn-ghost text-sm cursor-pointer">
                    Фото группы
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (!file.type.startsWith('image/')) { alert('Можно загрузить только изображение'); return; }
                        if (file.size > MAX_AVATAR_SIZE) { alert('Файл слишком большой. Максимум 2 МБ'); return; }
                        const reader = new FileReader();
                        reader.onload = () => setForm((f) => (f ? { ...f, avatarDataUrl: reader.result as string } : f));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
                <div className="flex-1 space-y-4">
                  <Input
                    label="Название"
                    value={form.name}
                    maxLength={MAX_CLUB_NAME_LENGTH}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <Textarea
                    label="Описание"
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    maxLength={MAX_CLUB_DESCRIPTION_LENGTH}
                    rows={3}
                  />
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-dark-text">
                      <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} />
                      Приватная группа
                    </label>
                    <label className="flex items-center gap-2 text-sm text-dark-text">
                      <input type="checkbox" checked={form.joinByLink} onChange={(e) => setForm({ ...form, joinByLink: e.target.checked })} />
                      Вступление по ссылке
                    </label>
                  </div>
                  <Button
                    loading={updateMutation.isPending}
                    onClick={() => {
                      const name = form.name.trim();
                      if (!name) {
                        setError('Введите название группы');
                        return;
                      }
                      if (name.length > MAX_CLUB_NAME_LENGTH) {
                        setError(`Название группы — не более ${MAX_CLUB_NAME_LENGTH} символов`);
                        return;
                      }
                      if ((form.description ?? '').trim().length > MAX_CLUB_DESCRIPTION_LENGTH) {
                        setError(`Описание группы — не более ${MAX_CLUB_DESCRIPTION_LENGTH} символов`);
                        return;
                      }
                      updateMutation.mutate({ ...form, name });
                    }}
                  >
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Чат группы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canSeeChat ? (
              <>
                <div
                  ref={chatContainerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  }}
                  className="h-72 max-h-72 overflow-y-auto overscroll-contain space-y-3 pr-1"
                >
                  {hasOlder && (messages?.length ?? 0) >= MESSAGE_PAGE_SIZE && (
                    <div className="text-center">
                      <Button variant="ghost" size="sm" loading={olderLoading} onClick={loadOlder}>
                        Показать более ранние сообщения
                      </Button>
                    </div>
                  )}
                  {messages && messages.length > 0 ? (
                    messages.map((m) => (
                      <MessageRow
                        key={m.id}
                        message={m}
                        canManage={club.canManage}
                        currentUserId={user?.id}
                        onDelete={handleDeleteMessage}
                        onAvatarClick={handleAvatarClick}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-dark-textMuted text-center py-8">Пока нет сообщений</p>
                  )}
                </div>
                {club.isMember ? (
                  <div className="space-y-2">
                    <textarea
                      className="input h-24 resize-none"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Написать сообщение..."
                      maxLength={MAX_MESSAGE_LENGTH}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          const text = messageText.trim();
                          if (text) {
                            setMessageText('');
                            sendText(text);
                          }
                        }
                      }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-dark-textMuted min-w-0 truncate">
                        {messageText.length}/{MAX_MESSAGE_LENGTH}
                        {queuedCount > 0 && ` · в очереди: ${queuedCount}`}
                        <span className="hidden sm:inline"> · Enter — отправить, Shift+Enter — перенос строки</span>
                      </span>
                      <Button
                        className="shrink-0"
                        loading={postMutation.isPending || queuedCount > 0}
                        disabled={!messageText.trim()}
                        onClick={() => {
                          const text = messageText.trim();
                          if (text) {
                            setMessageText('');
                            sendText(text);
                          }
                        }}
                      >
                        Отправить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-dark-textMuted">Писать могут только участники группы.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-dark-textMuted text-center py-8">Чат доступен только участникам группы.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Участники ({club.memberCount})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {club.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3">
                <Avatar
                  src={m.avatarDataUrl || undefined}
                  name={m.displayName}
                  size="sm"
                  onImageClick={() => m.avatarDataUrl && setPreviewImage(m.avatarDataUrl)}
                />
                <div className="flex-1 min-w-0">
                  <Link to={`/users/${m.userId}`} className="block text-sm text-dark-text truncate hover:text-primary-400">{m.displayName}</Link>
                  {m.isLeader && <span className="text-xs text-primary-400">Глава</span>}
                </div>
                {club.canManage && m.userId !== club.ownerId && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={leaderMutation.isPending}
                      onClick={() => leaderMutation.mutate({ userId: m.userId, isLeader: !m.isLeader })}
                    >
                      {m.isLeader ? 'Снять главу' : 'Сделать главой'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400"
                      onClick={() => removeMemberMutation.mutate(m.userId)}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Lightbox src={previewImage} alt="Фото группы" onClose={() => setPreviewImage(null)} />
    </div>
  );
}

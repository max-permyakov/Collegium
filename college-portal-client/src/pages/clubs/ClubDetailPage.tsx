import { useEffect, useMemo, useState } from 'react';
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
import type { ClubDetailDto, UpdateClubDto } from '../../types';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

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

  const { data: club, isLoading, error: loadError } = useQuery<ClubDetailDto>({
    queryKey: ['club', clubId, invite],
    queryFn: async () => (await clubsApi.getClub(clubId!, invite)).data,
    enabled: Boolean(clubId),
    retry: false,
  });

  const canSeeChat = Boolean(club && (club.isMember || club.canManage));

  const { data: messages } = useQuery({
    queryKey: ['club-messages', clubId],
    queryFn: async () => (await clubsApi.getMessages(clubId!)).data,
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
  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: ['club-messages', clubId] });

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
    onSuccess: () => { setMessageText(''); invalidateMessages(); },
    onError: (err) => setError(getError(err)),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => clubsApi.deleteMessage(messageId),
    onSuccess: invalidateMessages,
    onError: (err) => setError(getError(err)),
  });

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
              <p className="text-sm text-dark-textMuted">Глава: {club.ownerName} · Участников: {club.memberCount}</p>
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
                  <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Textarea label="Описание" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
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
                  <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate(form)}>Сохранить</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <Card>
          <CardHeader>
            <CardTitle>Чат группы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canSeeChat ? (
              <>
                <div className="h-72 overflow-y-auto space-y-3 pr-1">
                  {messages && messages.length > 0 ? (
                    messages.map((m) => (
                      <div key={m.id} className="flex items-start gap-2">
                        <Avatar
                          src={m.userAvatar || undefined}
                          name={m.userName}
                          size="sm"
                          onImageClick={() => m.userAvatar && setPreviewImage(m.userAvatar)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-dark-text">{m.userName}</span>
                            <span className="text-xs text-dark-textMuted">{formatDateTime(m.createdAt)}</span>
                            {(club.canManage || m.userId === user?.id) && (
                              <button
                                className="text-xs text-red-400 hover:underline"
                                onClick={() => deleteMessageMutation.mutate(m.id)}
                              >
                                удалить
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-dark-text whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-dark-textMuted text-center py-8">Пока нет сообщений</p>
                  )}
                </div>
                {club.isMember ? (
                  <div className="flex gap-2">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Написать сообщение..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && messageText.trim()) {
                          postMutation.mutate(messageText.trim());
                        }
                      }}
                    />
                    <Button
                      loading={postMutation.isPending}
                      disabled={!messageText.trim()}
                      onClick={() => messageText.trim() && postMutation.mutate(messageText.trim())}
                    >
                      Отправить
                    </Button>
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
                  <p className="text-sm text-dark-text truncate">{m.displayName}</p>
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

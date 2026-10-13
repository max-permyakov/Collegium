import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, clubsApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Lightbox } from '../../components/ui/Lightbox';
import { formatMoscowDateTime } from '../../utils/datetime';
import type { ClubListDto } from '../../types';

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

const formatDateTime = (value: string) =>
  formatMoscowDateTime(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function ClubsTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { data: clubs, isLoading } = useQuery<ClubListDto[]>({
    queryKey: ['admin', 'clubs'],
    queryFn: async () => (await adminApi.getClubs()).data,
  });

  const { data: detail } = useQuery({
    queryKey: ['admin', 'club', selectedId],
    queryFn: async () => (await adminApi.getClub(selectedId!)).data,
    enabled: Boolean(selectedId),
  });

  const { data: messages } = useQuery({
    queryKey: ['admin', 'club-messages', selectedId],
    queryFn: async () => (await adminApi.getClubMessages(selectedId!)).data,
    enabled: Boolean(selectedId),
  });

  const deleteClubMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteClub(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] });
      setSelectedId(null);
    },
    onError: (err) => setError(getError(err)),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => clubsApi.deleteMessage(messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'club-messages', selectedId] }),
    onError: (err) => setError(getError(err)),
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <div className="space-y-2">
          <p className="text-sm text-dark-textMuted">Всего групп: {clubs?.length ?? 0}</p>
          {isLoading ? (
            <div className="skeleton h-40" />
          ) : clubs && clubs.length > 0 ? (
            clubs.map((club) => (
              <button
                key={club.id}
                onClick={() => setSelectedId(club.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedId === club.id ? 'border-primary-500/40 bg-primary-500/10' : 'border-dark-border hover:bg-dark-border/50'}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    src={club.avatarDataUrl || undefined}
                    name={club.name}
                    size="md"
                    className="rounded-2xl"
                    onImageClick={() => club.avatarDataUrl && setPreviewImage(club.avatarDataUrl)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-text truncate">{club.name}</p>
                    <p className="text-xs text-dark-textMuted truncate">{club.ownerName} · {club.memberCount} участн.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant={club.isPrivate ? 'warning' : 'success'} size="sm">{club.isPrivate ? 'Приватная' : 'Публичная'}</Badge>
                  {club.joinByLink && <Badge variant="info" size="sm">По ссылке</Badge>}
                </div>
              </button>
            ))
          ) : (
            <Card variant="hover" className="text-center py-8">
              <p className="text-dark-textMuted">Нет групп</p>
            </Card>
          )}
        </div>

        <div>
          {!selectedId ? (
            <Card variant="hover" className="text-center py-16">
              <p className="text-dark-textMuted">Выберите группу для просмотра содержимого</p>
            </Card>
          ) : !detail ? (
            <div className="skeleton h-64" />
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={detail.avatarDataUrl || undefined}
                        name={detail.name}
                        size="lg"
                        className="rounded-2xl"
                        onImageClick={() => detail.avatarDataUrl && setPreviewImage(detail.avatarDataUrl)}
                      />
                      <div>
                        <CardTitle>{detail.name}</CardTitle>
                        <p className="text-sm text-dark-textMuted">Группа: {detail.ownerName} · {detail.memberCount} участников</p>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleteClubMutation.isPending}
                      onClick={() => { if (confirm('Удалить группу и все её сообщения?')) deleteClubMutation.mutate(detail.id); }}
                    >
                      Удалить группу
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {detail.description && <p className="text-sm text-dark-text whitespace-pre-wrap">{detail.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={detail.isPrivate ? 'warning' : 'success'}>{detail.isPrivate ? 'Приватная' : 'Публичная'}</Badge>
                    {detail.joinByLink && <Badge variant="info">По ссылке</Badge>}
                    <Badge variant="default">Создана {formatDateTime(detail.createdAt)}</Badge>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-dark-text mb-2">Участники</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {detail.members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2">
                          <Avatar src={m.avatarDataUrl || undefined} name={m.displayName} size="sm" />
                          <span className="text-sm text-dark-text truncate">{m.displayName}</span>
                          {m.isLeader && <Badge variant="primary" size="sm">Глава</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Сообщения ({messages?.length ?? 0})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                  {messages && messages.length > 0 ? (
                    messages.map((m) => (
                      <div key={m.id} className="flex items-start gap-2">
                        <Avatar src={m.userAvatar || undefined} name={m.userName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-dark-text">{m.userName}</span>
                            <span className="text-xs text-dark-textMuted">{formatDateTime(m.createdAt)}</span>
                            <button
                              className="text-xs text-red-400 hover:underline"
                              onClick={() => deleteMessageMutation.mutate(m.id)}
                            >
                              удалить
                            </button>
                          </div>
                          <p className="text-sm text-dark-text whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-dark-textMuted text-center py-6">Нет сообщений</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Lightbox src={previewImage} alt="Фото группы" onClose={() => setPreviewImage(null)} />
    </div>
  );
}

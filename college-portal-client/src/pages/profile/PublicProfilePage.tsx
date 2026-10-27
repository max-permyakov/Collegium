import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi, profileApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Lightbox } from '../../components/ui/Lightbox';
import type { PublicProfileDto } from '../../types';

const headmanLabel = (role: string): string | null =>
  role === 'Headman' ? 'Староста' : role === 'Deputy' ? 'Зам. старосты' : null;

export function PublicProfilePage({ userId }: { userId: string }) {
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const startChatMutation = useMutation({
    mutationFn: () => chatsApi.findOrCreate(userId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      navigate(`/chats/${res.data.id}`);
    },
  });

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  const { data: profile, isLoading, error } = useQuery<PublicProfileDto | null>({
    queryKey: ['user-public', userId],
    queryFn: async () => (await profileApi.getUser(userId)).data,
  });

  if (isLoading) {
    return <div className="skeleton h-64" />;
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-dark-textMuted">
          Не удалось загрузить профиль
        </CardContent>
      </Card>
    );
  }

  const headman = headmanLabel(profile.headmanRole);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-dark-textMuted hover:text-dark-text"
        >
          ← Назад
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <Avatar
              src={profile.avatarDataUrl || undefined}
              name={profile.displayName}
              size="xl"
              className="rounded-2xl w-32 h-32"
              onImageClick={() => profile.avatarDataUrl && setPreviewAvatar(profile.avatarDataUrl)}
            />
            <div className="flex-1 space-y-3">
              <h2 className="text-xl font-semibold text-dark-text">{profile.displayName}</h2>
              <div className="flex flex-wrap gap-2">
                {headman && <Badge variant="info">{headman}</Badge>}
                {profile.studyGroupName && <Badge variant="primary">Группа: {profile.studyGroupName}</Badge>}
              </div>
              {user && user.id !== profile.id && (
                <div>
                  <Button
                    size="sm"
                    loading={startChatMutation.isPending}
                    onClick={() => startChatMutation.mutate()}
                  >
                    Написать сообщение
                  </Button>
                  {startChatMutation.isError && (
                    <p className="mt-1 text-xs text-red-400">Не удалось открыть чат</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-dark-text">О себе</h3>
            <p className="text-dark-textMuted whitespace-pre-wrap">{profile.bio || 'Био не заполнено'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Кружки ({profile.clubs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.clubs.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {profile.clubs.map((club) => (
                <Link
                  key={club.id}
                  to={`/clubs/${club.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors"
                >
                  <Avatar src={club.avatarDataUrl || undefined} name={club.name} size="sm" />
                  <span className="font-medium text-dark-text truncate">{club.name}</span>
                  {club.isPrivate && <Badge variant="warning">Приватная</Badge>}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-dark-textMuted text-center py-6">Не состоит в кружках</p>
          )}
        </CardContent>
      </Card>

      <Lightbox src={previewAvatar} alt="Фото профиля" onClose={() => setPreviewAvatar(null)} />
    </div>
  );
}

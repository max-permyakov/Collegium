import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi, adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Lightbox } from '../../components/ui/Lightbox';
import { formatMoscowDate, formatMoscowDateTime } from '../../utils/datetime';
import type { ProfileDto } from '../../types';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const isAdminView = Boolean(userId);
  const targetUserId = userId;
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  const { data: profile, isLoading, error } = useQuery<ProfileDto | null>({
    queryKey: isAdminView ? ['admin', 'user', targetUserId] : ['profile', 'me', user?.id],
    queryFn: async () => {
      if (isAdminView && targetUserId) {
        const res = await adminApi.getUser(targetUserId);
        return res.data;
      }
      const res = await profileApi.getMe();
      return res.data;
    },
    enabled: !isAdminView || Boolean(targetUserId),
  });

  const isViewerAdmin = profile?.isViewerAdmin === true || user?.role === 'Admin';

  const updateMutation = useMutation({
    mutationFn: (data: { bio?: string | null; email?: string | null; phoneNumber?: string | null }) => profileApi.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      if (isAdminView && targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (dataUrl?: string | null) => profileApi.setAvatar(dataUrl),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      if (isAdminView && targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      }
      if (!isAdminView) {
        await refreshUser();
      }
    },
  });

  const roleMutation = useMutation({
    mutationFn: (role: 'Student' | 'Admin') => adminApi.setRole(targetUserId!, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const banMutation = useMutation({
    mutationFn: (isActive: boolean) => adminApi.setIsActive(targetUserId!, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const headmanMutation = useMutation({
    mutationFn: (role: string) => adminApi.setHeadman(targetUserId!, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: () => adminApi.recomputeGrades(targetUserId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Профиль {isAdminView ? 'пользователя' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3">
              <div className="w-32 h-32 rounded-2xl bg-dark-bg border border-dark-border overflow-hidden flex items-center justify-center">
                {profile.avatarDataUrl ? (
                  <img
                    src={profile.avatarDataUrl}
                    alt="avatar"
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setPreviewAvatar(profile.avatarDataUrl || null)}
                    role="button"
                  />
                ) : (
                  <span className="text-3xl font-semibold text-dark-textMuted">{profile.displayName.slice(0,2).toUpperCase()}</span>
                )}
              </div>
              {!isAdminView && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-wrap justify-center gap-2">
                    <label className="btn-ghost text-sm cursor-pointer">
                      Загрузить фото
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                          alert('Можно загрузить только изображение');
                          return;
                        }
                        if (file.size > MAX_AVATAR_SIZE) {
                          alert('Файл слишком большой. Максимум 2 МБ');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => avatarMutation.mutate(reader.result as string);
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                    {profile.avatarDataUrl && (
                      <Button variant="ghost" size="sm" onClick={() => avatarMutation.mutate(null)}>Удалить фото</Button>
                    )}
                  </div>
                  <p className="text-xs text-dark-textMuted text-center max-w-[220px]">
                    До 2 МБ. За нецензурные фото — бан.
                  </p>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-xl font-semibold text-dark-text">{profile.displayName}</h2>
                <p className="text-dark-textMuted">{profile.login}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={profile.role === 'Admin' ? 'primary' : 'default'}>{profile.role}</Badge>
                {profile.headmanRole && profile.headmanRole !== 'None' && (
                  <Badge variant="info">{profile.headmanRole === 'Headman' ? 'Староста' : 'Зам. старосты'}</Badge>
                )}
                <Badge variant={profile.isActive ? 'success' : 'danger'}>{profile.isActive ? 'Активен' : 'Заблокирован'}</Badge>
                {profile.isProtected && <Badge variant="warning">Защищённый</Badge>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm text-dark-textMuted">
                {profile.studyGroupName && (
                  <div>
                    <span className="text-dark-text">Группа:</span> {profile.studyGroupName}
                  </div>
                )}
                {/* {profile.email && <div><span className="text-dark-text">Email:</span> {profile.email}</div>}
                {profile.phoneNumber && <div><span className="text-dark-text">Телефон:</span> {profile.phoneNumber}</div>} */}
                {profile.averageMark != null && (
                  <div><span className="text-dark-text">Средний балл:</span> {profile.averageMark.toFixed(2)} {profile.gradesCachedAt && `(кэш ${formatMoscowDate(profile.gradesCachedAt)})`}</div>
                )}
                {profile.lastLoginAt && <div><span className="text-dark-text">Последний вход:</span> {formatMoscowDateTime(profile.lastLoginAt)}</div>}
                <div><span className="text-dark-text">Дата регистрации:</span> {formatMoscowDate(profile.createdAt)}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-dark-text">О себе</h3>
            {isAdminView ? (
              <p className="text-dark-textMuted whitespace-pre-wrap">{profile.bio || 'Био не заполнено'}</p>
            ) : (
              <div className="space-y-3">
                <textarea
                  className="input"
                  rows={4}
                  defaultValue={profile.bio || ''}
                  placeholder="Краткое био"
                  onBlur={(e) => {
                    if (e.target.value !== (profile.bio || '')) {
                      updateMutation.mutate({ bio: e.target.value || null });
                    }
                  }}
                />
                
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isAdminView && isViewerAdmin && !profile.isProtected && (
        <Card>
          <CardHeader>
            <CardTitle>Действия администратора</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant={profile.role === 'Admin' ? 'ghost' : 'primary'}
              size="sm"
              loading={roleMutation.isPending}
              onClick={() => roleMutation.mutate(profile.role === 'Admin' ? 'Student' : 'Admin')}
            >
              {profile.role === 'Admin' ? 'Снять админку' : 'Назначить админом'}
            </Button>
            <Button
              variant={profile.isActive ? 'ghost' : 'primary'}
              size="sm"
              loading={banMutation.isPending}
              onClick={() => banMutation.mutate(!profile.isActive)}
            >
              {profile.isActive ? 'Заблокировать' : 'Разблокировать'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={headmanMutation.isPending}
              onClick={() => headmanMutation.mutate('None')}
            >
              Снять старосту
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={headmanMutation.isPending}
              onClick={() => headmanMutation.mutate('Headman')}
            >
              Назначить старостой
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={headmanMutation.isPending}
              onClick={() => headmanMutation.mutate('Deputy')}
            >
              Назначить замом
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={recomputeMutation.isPending}
              onClick={() => recomputeMutation.mutate()}
            >
              Пересчитать средний балл
            </Button>
          </CardContent>
        </Card>
      )}

      <Lightbox src={previewAvatar} alt="Фото профиля" onClose={() => setPreviewAvatar(null)} />
    </div>
  );
}
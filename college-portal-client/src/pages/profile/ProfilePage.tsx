import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi, adminApi, authApi, notificationsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { disablePush, enablePush, getPushUiState, type PushUiState } from '../../services/push';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Lightbox } from '../../components/ui/Lightbox';
import { PermissionsModal } from '../../components/admin/PermissionsModal';
import { formatMoscowDate, formatMoscowDateTime } from '../../utils/datetime';
import type { AppNotificationType, NotificationPreference, ProfileDto } from '../../types';
import { toast } from 'sonner';
import { notifyFailure, notifySuccess } from '../../utils/notify';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_BIO_LENGTH = 200;

const PREFERENCE_LABELS: Record<string, string> = {
  News: 'Новости',
  Assignment: 'Задания',
  ClubMessage: 'Сообщения клубов',
  Comment: 'Комментарии',
};

/** Per-type notification delivery toggles backed by the server. */
function NotificationPreferenceToggles() {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: async () => (await notificationsApi.getPreferences()).data.preferences,
    staleTime: 60_000,
  });

  const setPreference = useMutation({
    mutationFn: async (input: { type: AppNotificationType; enabled: boolean }) =>
      (await notificationsApi.setPreference(input.type, input.enabled)).data,
    onMutate: async (input) => {
      const queryKey = ['notifications', 'preferences'] as const;
      const previous = queryClient.getQueryData<NotificationPreference[]>(queryKey);
      queryClient.setQueryData<NotificationPreference[]>(queryKey, (current) =>
        current?.map((item) =>
          item.type === input.type ? { ...item, enabled: input.enabled } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData<NotificationPreference[]>(
        ['notifications', 'preferences'],
        context?.previous,
      );
      toast.error('Не удалось сохранить настройку');
    },
    onSuccess: (preference) => {
      toast.success(
        preference.enabled
          ? `Уведомления «${PREFERENCE_LABELS[preference.type] ?? preference.type}» включены`
          : `Уведомления «${PREFERENCE_LABELS[preference.type] ?? preference.type}» отключены`,
      );
    },
  });

  const preferences = preferencesQuery.data;
  if (preferencesQuery.isLoading || !preferences) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-dark-textMuted">
        Типы уведомлений
      </p>
      {preferences.map((preference) => (
        <label
          key={preference.type}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-dark-border/40"
        >
          <span className="text-sm text-dark-text">
            {PREFERENCE_LABELS[preference.type] ?? preference.type}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary-500"
            checked={preference.enabled}
            disabled={setPreference.isPending}
            onChange={(event) =>
              setPreference.mutate({ type: preference.type as AppNotificationType, enabled: event.target.checked })
            }
            aria-label={`${PREFERENCE_LABELS[preference.type] ?? preference.type} — ${preference.enabled ? 'включено' : 'отключено'}`}
          />
        </label>
      ))}
    </div>
  );
}

function describePushState(state: PushUiState): string {
  switch (state.state) {
    case 'active':
      return 'Уведомления включены на этом устройстве.';
    case 'inactive':
      return 'Получайте уведомления о новостях, заданиях и сообщениях в клубах даже при закрытой вкладке.';
    case 'denied':
      return 'Уведомления заблокированы в настройках браузера.';
    case 'disabled':
      return 'Push-уведомления не настроены на сервере.';
    case 'unsupported':
      return state.iosNeedsInstall
        ? 'На iPhone уведомления работают только после установки приложения на экран «Домой».'
        : 'Этот браузер не поддерживает push-уведомления.';
  }
}

export function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user, refreshUser, linkDiary } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const queryClient = useQueryClient();
  const isAdminView = Boolean(userId);
  const targetUserId = userId;
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [bioError, setBioError] = useState('');
  const [bioValue, setBioValue] = useState<string | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ login: '', password: '' });
  const [linkError, setLinkError] = useState('');
  const [linkPending, setLinkPending] = useState(false);
  const [groupSelection, setGroupSelection] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [pushState, setPushState] = useState<PushUiState | null>(null);
  const [loadingPush, setLoadingPush] = useState(false);

  const refreshPushState = async () => {
    if (isAdminView) return;
    try {
      setPushState(await getPushUiState());
    } catch {
      setPushState({ state: 'unsupported', iosNeedsInstall: false });
    }
  };

  const handleTogglePush = async () => {
    setLoadingPush(true);
    try {
      if (pushState?.state === 'active') {
        await disablePush();
        toast.success('Уведомления отключены');
      } else {
        const result = await enablePush();
        if (result.ok) {
          toast.success('Уведомления включены');
        } else if (result.state.state === 'denied') {
          toast.error('Разрешите уведомления в настройках браузера');
        } else if (result.state.state === 'disabled') {
          toast.error('Push-уведомления не настроены на сервере');
        } else if (result.state.state === 'unsupported') {
          toast.error(
            result.state.iosNeedsInstall
              ? 'На iPhone сначала добавьте приложение на экран «Домой»'
              : 'Браузер не поддерживает push-уведомления',
          );
        } else {
          toast.error('Не удалось включить уведомления');
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка при настройке уведомлений');
    } finally {
      setLoadingPush(false);
      await refreshPushState();
    }
  };

  const handleTestPush = async () => {
    try {
      await notificationsApi.sendTest();
      toast.success('Тестовое уведомление отправлено');
      void refreshNotifications().catch(() => undefined);
    } catch {
      toast.error('Не удалось отправить тестовое уведомление');
    }
  };

  useEffect(() => {
    if (isAdminView) return;
    let cancelled = false;
    getPushUiState()
      .then((state) => {
        if (!cancelled) setPushState(state);
      })
      .catch(() => {
        if (!cancelled) setPushState({ state: 'unsupported', iosNeedsInstall: false });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminView]);

  const { data: groups = [] } = useQuery<string[]>({
    queryKey: ['auth', 'groups'],
    queryFn: async () => (await authApi.getGroups()).data.groups ?? [],
    enabled: !isAdminView,
    staleTime: 30 * 60 * 1000,
  });

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

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
      setBioError('');
      notifySuccess('Профиль сохранён');
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      if (isAdminView && targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } } };
      setBioError(e.response?.data?.message || 'Не удалось сохранить био');
      notifyFailure(err, 'Не удалось сохранить био');
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (dataUrl?: string | null) => profileApi.setAvatar(dataUrl),
    onSuccess: async () => {
      notifySuccess('Аватар обновлён');
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      if (isAdminView && targetUserId) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      }
      if (!isAdminView) {
        await refreshUser();
      }
    },
    onError: (err) => notifyFailure(err, 'Не удалось обновить аватар'),
  });

  const roleMutation = useMutation({
    mutationFn: (role: 'Student' | 'Admin') => adminApi.setRole(targetUserId!, role),
    onSuccess: (_data, role) => {
      notifySuccess(role === 'Admin' ? 'Пользователь назначен админом' : 'У пользователя сняты права админа');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => notifyFailure(err, 'Не удалось изменить роль'),
  });

  const banMutation = useMutation({
    mutationFn: (isActive: boolean) => adminApi.setIsActive(targetUserId!, isActive),
    onSuccess: (_data, isActive) => {
      notifySuccess(isActive ? 'Пользователь разблокирован' : 'Пользователь заблокирован');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => notifyFailure(err, 'Не удалось изменить статус'),
  });

  const headmanMutation = useMutation({
    mutationFn: (role: string) => adminApi.setHeadman(targetUserId!, role),
    onSuccess: () => {
      notifySuccess('Права старосты обновлены');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => notifyFailure(err, 'Не удалось обновить права старосты'),
  });

  const changeGroupMutation = useMutation({
    mutationFn: (groupName: string) => profileApi.changeGroup(groupName),
    onSuccess: async () => {
      setGroupError('');
      setGroupSuccess('Группа обновлена');
      notifySuccess('Группа обновлена');
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      queryClient.invalidateQueries({ queryKey: ['rating'] });
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } } };
      setGroupSuccess('');
      setGroupError(e.response?.data?.message || 'Не удалось изменить группу');
      notifyFailure(err, 'Не удалось изменить группу');
    },
  });

  const handleLinkDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError('');
    setLinkPending(true);
    try {
      await linkDiary(linkForm.login, linkForm.password);
      setLinkForm({ login: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      queryClient.invalidateQueries({ queryKey: ['rating'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      notifySuccess('Дневник привязан');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setLinkError(e.response?.data?.message || 'Не удалось привязать дневник');
      notifyFailure(err, 'Не удалось привязать дневник');
    } finally {
      setLinkPending(false);
    }
  };

  const recomputeMutation = useMutation({
    mutationFn: () => adminApi.recomputeGrades(targetUserId!),
    onSuccess: () => {
      notifySuccess('Оценки пересчитаны');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => notifyFailure(err, 'Не удалось пересчитать оценки'),
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
      {isAdminView && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="text-sm text-dark-textMuted hover:text-dark-text"
          >
            ← Назад
          </button>
        </div>
      )}

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
                <Badge variant={profile.isActive ? 'success' : 'danger'}>{profile.isActive ? 'Не заблокирован' : 'Заблокирован'}</Badge>
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
              {!isAdminView && (
                <div className="pt-3 border-t border-dark-border space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dark-text">Уведомления</p>
                      <p className="text-xs text-dark-textMuted">
                        {pushState
                          ? describePushState(pushState)
                          : 'Проверяем настройки уведомлений…'}
                      </p>
                    </div>
                    {pushState?.state === 'active' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={loadingPush}
                        onClick={handleTogglePush}
                      >
                        Отключить
                      </Button>
                    )}
                    {pushState?.state === 'inactive' && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={loadingPush}
                        onClick={handleTogglePush}
                      >
                        Включить
                      </Button>
                    )}
                    {pushState?.state === 'denied' && (
                      <Badge variant="warning">Заблокировано</Badge>
                    )}
                    {pushState?.state === 'disabled' && (
                      <Badge variant="default">Недоступно</Badge>
                    )}
                    {pushState?.state === 'unsupported' && (
                      <Badge variant="default">Не поддерживается</Badge>
                    )}
                  </div>
                  {pushState?.state === 'denied' && (
                    <p className="text-xs text-dark-textMuted">
                      Откройте настройки сайта в браузере и разрешите уведомления, затем обновите страницу.
                    </p>
                  )}
                  {pushState?.state === 'disabled' && (
                    <p className="text-xs text-dark-textMuted">
                      Администратор должен указать VAPID-ключи в конфигурации сервера.
                    </p>
                  )}
                  {user?.role === 'Admin' && (
                    <Button type="button" variant="secondary" size="sm" onClick={handleTestPush}>
                      Тест уведомления
                    </Button>
                  )}
                  <div className="pt-2 border-t border-dark-border/60">
                    <NotificationPreferenceToggles />
                  </div>
                </div>
              )}
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
                  maxLength={MAX_BIO_LENGTH}
                  onChange={(e) => setBioValue(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value !== (profile.bio || '')) {
                      updateMutation.mutate({ bio: e.target.value || null });
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-dark-textMuted">
                    {(bioValue ?? profile.bio ?? '').length}/{MAX_BIO_LENGTH}
                  </span>
                  {bioError && <span className="text-xs text-red-400">{bioError}</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!isAdminView && profile.hasDiaryLink === false && (
        <Card>
          <CardHeader>
            <CardTitle>Учебная группа</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="w-full">
                <label htmlFor="profile-group" className="block text-sm font-medium text-dark-text mb-1.5">
                  Группа
                </label>
                <select
                  id="profile-group"
                  className="input"
                  value={groupSelection || profile.studyGroupName || ''}
                  onChange={(e) => { setGroupSelection(e.target.value); setGroupError(''); setGroupSuccess(''); }}
                >
                  <option value="">Выберите группу</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={changeGroupMutation.isPending}
                disabled={!groupSelection || groupSelection === profile.studyGroupName}
                onClick={() => changeGroupMutation.mutate(groupSelection)}
              >
                Изменить группу
              </Button>
            </div>
            {groupError && <p className="text-sm text-red-400" role="alert">{groupError}</p>}
            {groupSuccess && <p className="text-sm text-green-400" role="status">{groupSuccess}</p>}
            <p className="text-xs text-dark-textMuted">
              Группу можно менять не чаще одного раза в 3 дня.
            </p>
          </CardContent>
        </Card>
      )}
      
      {!isAdminView && profile.hasDiaryLink === false && (
        <Card>
          <CardHeader>
            <CardTitle>Привязка дневника</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-dark-textMuted mb-4">
              Привяжите электронный дневник, чтобы видеть оценки, успеваемость и рейтинг.
            </p>
            <form id="link-diary-form" onSubmit={handleLinkDiary} className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Логин дневника"
                value={linkForm.login}
                onChange={(e) => { setLinkForm(prev => ({ ...prev, login: e.target.value })); setLinkError(''); }}
                autoComplete="username"
                required
              />
              <Input
                label="Пароль дневника"
                type="password"
                value={linkForm.password}
                onChange={(e) => { setLinkForm(prev => ({ ...prev, password: e.target.value })); setLinkError(''); }}
                autoComplete="current-password"
                required
              />
            </form>
            {linkError && <p className="mt-3 text-sm text-red-400" role="alert">{linkError}</p>}
            <Button type="submit" form="link-diary-form" className="mt-4" loading={linkPending}>
              Привязать дневник
            </Button>
          </CardContent>
        </Card>
      )}

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
            {profile.role !== 'Admin' && (
              <Button
                variant="secondary"
                size="sm"
                disabled={user?.isProtected !== true}
                title={user?.isProtected ? 'Настроить права администратора' : 'Выдавать права может только первичный админ'}
                onClick={() => setPermissionsOpen(true)}
              >
                Управлять правами
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isAdminView && targetUserId && permissionsOpen && profile && (
        <PermissionsModal
          userId={targetUserId}
          displayName={profile.displayName}
          onClose={() => setPermissionsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', targetUserId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      )}

      <Lightbox src={previewAvatar} alt="Фото профиля" onClose={() => setPreviewAvatar(null)} />
    </div>
  );
}
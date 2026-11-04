import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi, adminApi, authApi, achievementsApi, chatsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Lightbox } from '../../components/ui/Lightbox';
import { Modal } from '../../components/ui/Modal';
import { PermissionsModal } from '../../components/admin/PermissionsModal';
import { formatMoscowDate } from '../../utils/datetime';
import type { AchievementDto, ProfileDto } from '../../types';
import { notifyFailure, notifySuccess } from '../../utils/notify';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_BIO_LENGTH = 200;

const PencilIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2m3 0h3a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h3m2 0V4a1 1 0 011-1h0a1 1 0 011 1v1zm3.5 3.5L9 14v2h2l6.5-6.5a1.41 1.41 0 00-2-2z" />
  </svg>
);

/** Contacts the user can edit; diary accounts may not have an email yet. */
interface EditableContacts {
  displayName: string;
  telegramUserName: string;
  email: string;
  phoneNumber: string;
  bio: string;
}

function EditProfileModal({
  profile,
  open,
  onClose,
  onSaved,
}: {
  profile: ProfileDto;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<EditableContacts>({
    displayName: profile.displayName ?? '',
    telegramUserName: profile.telegramUserName ?? '',
    email: profile.email ?? '',
    phoneNumber: profile.phoneNumber ?? '',
    bio: profile.bio ?? '',
  });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: Partial<EditableContacts>) =>
      profileApi.updateMe({
        bio: patch.bio === undefined ? undefined : (patch.bio || null),
        email: patch.email === undefined ? undefined : (patch.email || null),
        phoneNumber: patch.phoneNumber === undefined ? undefined : (patch.phoneNumber || null),
        displayName: patch.displayName ?? undefined,
        telegramUserName: patch.telegramUserName === undefined ? undefined : (patch.telegramUserName || null),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      onSaved('Профиль сохранён');
      onClose();
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось сохранить профиль');
    },
  });

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    // Only the fields the user actually changed go to the server.
    const patch: Partial<EditableContacts> = {};
    if (form.displayName.trim() && form.displayName.trim() !== profile.displayName) {
      patch.displayName = form.displayName.trim();
    }
    const telegram = form.telegramUserName.trim().replace(/^@+/, '');
    if (telegram !== (profile.telegramUserName ?? '')) patch.telegramUserName = telegram;
    if (form.email.trim() !== (profile.email ?? '')) patch.email = form.email.trim();
    if (form.phoneNumber.trim() !== (profile.phoneNumber ?? '')) patch.phoneNumber = form.phoneNumber.trim();
    if (form.bio !== (profile.bio ?? '')) patch.bio = form.bio;

    mutation.mutate(patch);
  };

  return (
    <Modal title="Редактирование профиля" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Отображаемое имя"
          value={form.displayName}
          onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
          maxLength={200}
          required
        />
        <Input
          label="Telegram"
          value={form.telegramUserName}
          onChange={(e) => setForm((prev) => ({ ...prev, telegramUserName: e.target.value }))}
          placeholder="@durov"
          maxLength={100}
        />
        <Input
          label="Почта"
          type="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          maxLength={200}
        />
        <Input
          label="Телефон"
          value={form.phoneNumber}
          onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
          maxLength={50}
        />
        <div>
          <label htmlFor="edit-bio" className="block text-sm font-medium text-dark-text mb-1.5">
            О себе
          </label>
          <textarea
            id="edit-bio"
            className="input"
            rows={3}
            value={form.bio}
            maxLength={MAX_BIO_LENGTH}
            placeholder="Краткое био"
            onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={mutation.isPending}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Achievement catalog with locked/unlocked states for the viewing user. */
function AchievementsSection({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<AchievementDto[]>({
    queryKey: ['achievements', userId],
    queryFn: async () => (await achievementsApi.getMe()).data.achievements,
    staleTime: 60_000,
  });

  const unlockedCount = useMemo(
    () => (data ?? []).filter((a) => a.unlocked).length,
    [data],
  );

  if (isLoading) {
    return <div className="skeleton h-32" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Достижения{' '}
          {data && data.length > 0 && (
            <span className="text-sm font-normal text-dark-textMuted">
              {unlockedCount} из {data.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data?.length ?? 0) === 0 ? (
          <p className="text-sm text-dark-textMuted">Достижения появятся, когда вы начнёте пользоваться порталом</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {data!.map((achievement) => (
              <div
                key={achievement.code}
                title={`${achievement.description}${achievement.unlocked ? '' : ' — ещё не получено'}`}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                  achievement.unlocked
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-dark-border bg-dark-bg opacity-60'
                }`}
              >
                <span className="text-2xl shrink-0" aria-hidden="true">
                  {achievement.unlocked ? achievement.icon : '🔒'}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-dark-text truncate">
                    {achievement.title}
                  </span>
                  {!achievement.unlocked && (
                    <span className="block text-[10px] text-dark-textMuted">не получено</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user, refreshUser, linkDiary } = useAuth();
  const queryClient = useQueryClient();
  const isAdminView = Boolean(userId);
  const targetUserId = userId;
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ login: '', password: '' });
  const [linkError, setLinkError] = useState('');
  const [linkPending, setLinkPending] = useState(false);
  const [groupSelection, setGroupSelection] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  // Administrators browse profiles through this management view, so they get
  // the same "open chat" shortcut as the public profile page.
  const startChatMutation = useMutation({
    mutationFn: () => chatsApi.findOrCreate(targetUserId!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      navigate(`/chats/${res.data.id}`);
    },
  });

  // Editing (name, contacts, bio) happens inside the pencil modal, which owns
  // its own mutation; the avatar keeps its dedicated one.
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

  const contacts = [
    profile.telegramUserName && { label: 'Telegram', value: `@${profile.telegramUserName.replace(/^@+/, '')}` },
    profile.phoneNumber && { label: 'Телефон', value: profile.phoneNumber },
    profile.email && { label: 'Почта', value: profile.email },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

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
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-dark-text">{profile.displayName}</h2>
                  <p className="text-dark-textMuted">{profile.login}</p>
                </div>
                {/* Pencil edit: name, contacts and bio in one place */}
                {!isAdminView && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="w-9 h-9 shrink-0 rounded-full border border-dark-border bg-dark-card flex items-center justify-center text-dark-textMuted hover:text-primary-400 hover:border-primary-500/40 transition-colors"
                    title="Редактировать профиль"
                    aria-label="Редактировать профиль"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.role === 'Admin' && <Badge variant="primary">Админ</Badge>}
                {profile.headmanRole && profile.headmanRole !== 'None' && (
                  <Badge variant="info">{profile.headmanRole === 'Headman' ? 'Староста' : 'Зам. старосты'}</Badge>
                )}
                {profile.isProtected && isViewerAdmin && <Badge variant="warning">Защищённый</Badge>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm text-dark-textMuted">
                {profile.studyGroupName && (
                  <div>
                    <span className="text-dark-text">Группа:</span> {profile.studyGroupName}
                  </div>
                )}
                {profile.averageMark != null && (
                  <div><span className="text-dark-text">Средний балл:</span> {profile.averageMark.toFixed(2)}</div>
                )}
                {contacts.map((contact) => (
                  <div key={contact.label}>
                    <span className="text-dark-text">{contact.label}:</span> {contact.value}
                  </div>
                ))}
                {isAdminView && (
                  <div><span className="text-dark-text">Регистрация:</span> {formatMoscowDate(profile.createdAt)}</div>
                )}
              </div>
              {isAdminView && targetUserId !== user?.id && (
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={startChatMutation.isPending}
                    onClick={() => startChatMutation.mutate()}
                  >
                    Открыть чат
                  </Button>
                  {startChatMutation.isError && (
                    <p className="mt-1 text-xs text-red-400">Не удалось открыть чат</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {profile.bio && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-dark-text">О себе</h3>
              <p className="text-dark-textMuted whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!isAdminView && user?.id && (
        <AchievementsSection userId={user.id} />
      )}

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

      <EditProfileModal
        profile={profile}
        open={!isAdminView && editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={notifySuccess}
      />

      <Lightbox src={previewAvatar} alt="Фото профиля" onClose={() => setPreviewAvatar(null)} />
    </div>
  );
}

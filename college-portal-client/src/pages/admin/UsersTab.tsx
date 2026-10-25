import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { shortName } from '../../utils/names';
import { notifyFailure, notifySuccess } from '../../utils/notify';
import { formatMoscowDateTime } from '../../utils/datetime';
import { PermissionsModal } from '../../components/admin/PermissionsModal';
import type { AdminUserDto, AdminUsersPageDto } from '../../types/admin';

const PAGE_SIZE = 25;

const headmanLabel: Record<string, string> = {
  None: '—',
  Headman: 'Староста',
  Deputy: 'Зам. старосты',
};

// Must match ActivityTracking.OnlineWindow on the backend.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function activityLabel(lastActivityAt?: string | null): { online: boolean; text: string } {
  if (!lastActivityAt) return { online: false, text: 'активность не зафиксирована' };
  const diff = Date.now() - new Date(lastActivityAt).getTime();
  if (diff < ONLINE_WINDOW_MS) return { online: true, text: 'онлайн' };
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return { online: false, text: `был ${minutes} мин назад` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, text: `был ${hours} ч назад` };
  const days = Math.floor(hours / 24);
  if (days < 7) return { online: false, text: `был ${days} дн. назад` };
  return { online: false, text: `был ${formatMoscowDateTime(lastActivityAt)}` };
}

function ActivityLine({ lastActivityAt }: { lastActivityAt?: string | null }) {
  const activity = activityLabel(lastActivityAt);
  return (
    <div
      className={`text-xs flex items-center gap-1.5 ${
        activity.online ? 'text-green-400' : 'text-dark-textMuted'
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          activity.online ? 'bg-green-500' : 'bg-dark-textMuted/50'
        }`}
      />
      {activity.text}
    </div>
  );
}

const authSourceLabels: Record<string, string> = {
  Diary: 'Дневник',
  Email: 'Почта',
  Google: 'Google',
  GitHub: 'GitHub',
  Yandex: 'Яндекс',
  Vk: 'VK',
};

function RoleBadges({ user }: { user: AdminUserDto }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={user.role === 'Admin' ? 'primary' : 'default'}>{user.role}</Badge>
      {user.isProtected && <Badge variant="warning">Защищён</Badge>}
      {user.registrationSource && (
        <Badge variant="info">{authSourceLabels[user.registrationSource] ?? user.registrationSource}</Badge>
      )}
      {user.hasDiaryLink === false && <Badge variant="warning">Без дневника</Badge>}
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>
      {isActive ? 'Активен' : 'Заблокирован'}
    </Badge>
  );
}

export function UsersTab() {
  const queryClient = useQueryClient();
  const { user: viewer } = useAuth();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [permTarget, setPermTarget] = useState<AdminUserDto | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { data, isLoading, isFetching, error, refetch } = useQuery<AdminUsersPageDto>({
    queryKey: ['admin', 'users', page, debouncedSearch],
    queryFn: async () =>
      (
        await adminApi.getUsers({
          page,
          pageSize: PAGE_SIZE,
          q: debouncedSearch || undefined,
        })
      ).data,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (data && page > totalPages) setPage(totalPages);
  }, [data, page, totalPages]);

  const isPrimaryAdmin = viewer?.isProtected === true;

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
  };

  const run = async (id: string, fn: () => Promise<unknown>, successMessage = 'Действие выполнено') => {
    setBusyId(id);
    setActionError('');
    try {
      await fn();
      afterChange();
      if (successMessage) notifySuccess(successMessage);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err.response?.data?.message || 'Не удалось выполнить действие');
      notifyFailure(e, 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const renderActions = (u: AdminUserDto) => {
    const busy = busyId === u.id;
    const isSelf = viewer?.id === u.id;
    const canManageRole = isPrimaryAdmin && !u.isProtected;
    const canBan = !u.isProtected && !isSelf;
    const canManagePermissions = isPrimaryAdmin && !u.isProtected && u.role !== 'Admin';

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {u.role === 'Admin' && u.isProtected && (
          <span className="text-xs text-dark-textMuted">все права</span>
        )}
        {!u.isProtected && (
          <>
            <Button
              variant={u.role === 'Admin' ? 'ghost' : 'secondary'}
              size="sm"
              disabled={busy || !canManageRole}
              title={!isPrimaryAdmin ? 'Только первичный админ может менять роли' : undefined}
              onClick={() =>
                run(
                  u.id,
                  () => adminApi.setRole(u.id, u.role === 'Admin' ? 'Student' : 'Admin'),
                  u.role === 'Admin' ? 'У пользователя сняты права админа' : 'Пользователь назначен админом',
                )
              }
            >
              {u.role === 'Admin' ? 'Снять админа' : 'Админ'}
            </Button>
            <Button
              variant={u.isActive ? 'ghost' : 'primary'}
              size="sm"
              disabled={busy || !canBan}
              title={isSelf ? 'Нельзя забанить себя' : undefined}
              onClick={() =>
                run(
                  u.id,
                  () => adminApi.setIsActive(u.id, !u.isActive),
                  u.isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
                )
              }
            >
              {u.isActive ? 'Бан' : 'Разбан'}
            </Button>
            {u.role !== 'Admin' && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || !canManagePermissions}
                title={
                  !canManagePermissions
                    ? 'Выдавать права может только первичный админ'
                    : 'Настроить права'
                }
                onClick={() => setPermTarget(u)}
              >
                Права
              </Button>
            )}
          </>
        )}
      </div>
    );
  };

  const renderHeadmanSelect = (u: AdminUserDto) => (
    <select
      className="input py-1 text-sm"
      value={u.headmanRole}
      disabled={busyId === u.id}
      aria-label={`Староста: ${u.displayName}`}
      onChange={(e) =>
        run(
          u.id,
          () => adminApi.setHeadman(u.id, e.target.value),
          'Права старосты обновлены',
        )
      }
    >
      <option value="None">{headmanLabel.None}</option>
      <option value="Headman">{headmanLabel.Headman}</option>
      <option value="Deputy">{headmanLabel.Deputy}</option>
    </select>
  );

  const showError = Boolean(error) && users.length === 0;
  const status = (error as { response?: { status?: number } } | null)?.response?.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          type="search"
          aria-label="Поиск пользователей"
          placeholder="Поиск по ФИО, логину, группе, почте, телефону"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-sm text-dark-textMuted whitespace-nowrap" aria-live="polite">
          Всего: {isLoading ? '—' : total}
          {isFetching && !isLoading ? ' · обновление…' : ''}
        </span>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionError('')}>
            ✕
          </Button>
        </div>
      )}

      {error && users.length > 0 && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between gap-3">
          <span>
            Не удалось обновить список{status ? ` (HTTP ${status})` : ''}. Показаны ранее
            загруженные данные.
          </span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      )}

      {showError ? (
        <Card variant="hover" className="text-center py-12">
          <p className="text-red-400">
            Не удалось загрузить пользователей{status ? ` (HTTP ${status})` : ''}
          </p>
          <Button className="mt-4" onClick={() => refetch()}>
            Попробовать снова
          </Button>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card variant="hover" className="text-center py-12">
          <p className="text-dark-textMuted">
            {debouncedSearch ? 'Пользователи не найдены' : 'Пользователей пока нет'}
          </p>
        </Card>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-dark-textMuted border-b border-dark-border">
                  <th className="py-2 px-3 font-medium">ФИО / логин</th>
                  <th className="py-2 px-3 font-medium">Группа</th>
                  <th className="py-2 px-3 font-medium">Балл</th>
                  <th className="py-2 px-3 font-medium">Контакты</th>
                  <th className="py-2 px-3 font-medium">Роль</th>
                  <th className="py-2 px-3 font-medium">Статус</th>
                  <th className="py-2 px-3 font-medium">Староста</th>
                  <th className="py-2 px-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="text-dark-text border-b border-dark-border align-top">
                    <td className="py-2 px-3">
                      <Link
                        to={`/users/${u.id}`}
                        className="font-medium text-dark-text hover:text-primary-400"
                      >
                        {shortName(u.displayName)}
                      </Link>
                      <div className="text-xs text-dark-textMuted">{u.login}</div>
                      <ActivityLine lastActivityAt={u.lastActivityAt} />
                    </td>
                    <td className="py-2 px-3 text-dark-textMuted">
                      {u.studyGroupName || '—'}
                      {u.course ? <span className="block text-xs">курс {u.course}</span> : null}
                    </td>
                    <td className="py-2 px-3 text-dark-text">
                      {u.averageMark != null ? (
                        u.averageMark.toFixed(2)
                      ) : (
                        <span className="text-dark-textMuted">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-dark-textMuted text-xs">
                      {u.email ? <div className="truncate max-w-[180px]">{u.email}</div> : <div>—</div>}
                      {u.phoneNumber ? <div>{u.phoneNumber}</div> : null}
                    </td>
                    <td className="py-2 px-3">
                      <RoleBadges user={u} />
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge isActive={u.isActive} />
                    </td>
                    <td className="py-2 px-3">{renderHeadmanSelect(u)}</td>
                    <td className="py-2 px-3">
                      <div className="flex justify-end">{renderActions(u)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {users.map((u) => (
              <Card key={u.id} variant="hover" padding="sm" className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/users/${u.id}`}
                      className="font-medium text-dark-text hover:text-primary-400 break-words"
                    >
                      {shortName(u.displayName)}
                    </Link>
                    <div className="text-xs text-dark-textMuted">{u.login}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <RoleBadges user={u} />
                    <StatusBadge isActive={u.isActive} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-dark-textMuted">
                    <span className="text-dark-text">Группа: </span>
                    {u.studyGroupName || '—'}
                    {u.course ? ` · курс ${u.course}` : ''}
                  </div>
                  <div className="text-dark-textMuted">
                    <span className="text-dark-text">Балл: </span>
                    {u.averageMark != null ? u.averageMark.toFixed(2) : '—'}
                  </div>
                </div>

                {(u.email || u.phoneNumber) && (
                  <div className="text-xs text-dark-textMuted space-y-0.5">
                    {u.email && <div className="truncate">{u.email}</div>}
                    {u.phoneNumber && <div>{u.phoneNumber}</div>}
                  </div>
                )}

                <ActivityLine lastActivityAt={u.lastActivityAt} />

                <div className="space-y-2">
                  {renderHeadmanSelect(u)}
                  {renderActions(u)}
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-sm text-dark-textMuted">
              Показано {from}–{to} из {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Назад
              </Button>
              <span className="text-sm text-dark-textMuted whitespace-nowrap">
                Стр. {page} из {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Вперёд →
              </Button>
            </div>
          </div>
        </>
      )}

      {permTarget && (
        <PermissionsModal
          userId={permTarget.id}
          displayName={permTarget.displayName}
          onClose={() => setPermTarget(null)}
          onSaved={afterChange}
        />
      )}
    </div>
  );
}

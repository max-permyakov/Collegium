import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { shortName } from '../../utils/names';
import { PermissionsModal } from '../../components/admin/PermissionsModal';
import type { AdminUserDto } from '../../types/admin';

const headmanLabel: Record<string, string> = {
  None: '—',
  Headman: 'Староста',
  Deputy: 'Зам. старосты',
};

export function UsersTab() {
  const queryClient = useQueryClient();
  const { user: viewer } = useAuth();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [permTarget, setPermTarget] = useState<AdminUserDto | null>(null);

  const { data: users, isLoading, error } = useQuery<AdminUserDto[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await adminApi.getUsers()).data,
  });

  const isPrimaryAdmin = viewer?.isProtected === true;

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.displayName, u.login, u.email, u.phoneNumber, u.studyGroupName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [users, search]);

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
  };

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError('');
    try {
      await fn();
      afterChange();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err.response?.data?.message || 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  }

  if (error || !users) {
    return (
      <Card variant="hover" className="text-center py-12">
        <p className="text-red-400">Не удалось загрузить пользователей</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="Поиск по ФИО, логину, группе, почте, телефону"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-dark-textMuted whitespace-nowrap">
          Найдено: {filtered.length} из {users.length}
        </span>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionError('')}>✕</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-dark-textMuted border-b border-dark-border">
              <th className="py-2 px-3 font-medium">ФИО / логин</th>
              <th className="py-2 px-3 font-medium">Группа</th>
              <th className="py-2 px-3 font-medium">Средний балл</th>
              <th className="py-2 px-3 font-medium">Контакты</th>
              <th className="py-2 px-3 font-medium">Роль</th>
              <th className="py-2 px-3 font-medium">Статус</th>
              <th className="py-2 px-3 font-medium">Староста</th>
              <th className="py-2 px-3 font-medium">Права</th>
              <th className="py-2 px-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const busy = busyId === u.id;
              const isSelf = viewer?.id === u.id;
              const canManageRole = isPrimaryAdmin && !u.isProtected;
              const canBan = !u.isProtected && !isSelf;
              const canManagePermissions = isPrimaryAdmin && !u.isProtected && u.role !== 'Admin';
              return (
                <tr key={u.id} className="text-dark-text border-b border-dark-border">
                  <td className="py-2 px-3">
                    <Link to={`/users/${u.id}`} className="font-medium text-dark-text hover:text-primary-400">
                      {shortName(u.displayName)}
                    </Link>
                    <div className="text-xs text-dark-textMuted">{u.login}</div>
                  </td>
                  <td className="py-2 px-3 text-dark-textMuted">
                    {u.studyGroupName || '—'}
                    {u.course ? <span className="block text-xs">курс {u.course}</span> : null}
                  </td>
                  <td className="py-2 px-3 text-dark-text">
                    {u.averageMark != null ? u.averageMark.toFixed(2) : <span className="text-dark-textMuted">—</span>}
                  </td>
                  <td className="py-2 px-3 text-dark-textMuted text-xs">
                    {u.email ? <div className="truncate max-w-[180px]">{u.email}</div> : <div>—</div>}
                    {u.phoneNumber ? <div>{u.phoneNumber}</div> : null}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant={u.role === 'Admin' ? 'primary' : 'default'}>{u.role}</Badge>
                    {u.isProtected && <Badge variant="warning" className="ml-1">Защищён</Badge>}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant={u.isActive ? 'success' : 'danger'}>
                      {u.isActive ? 'Активен' : 'Заблокирован'}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    <select
                      className="input py-1 text-sm"
                      value={u.headmanRole}
                      disabled={busy}
                      onChange={(e) => run(u.id, () => adminApi.setHeadman(u.id, e.target.value))}
                    >
                      <option value="None">{headmanLabel.None}</option>
                      <option value="Headman">{headmanLabel.Headman}</option>
                      <option value="Deputy">{headmanLabel.Deputy}</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    {u.role === 'Admin' ? (
                      <span className="text-xs text-dark-textMuted">все права</span>
                    ) : u.isProtected ? (
                      <span className="text-xs text-dark-textMuted">—</span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || !canManagePermissions}
                        title={!canManagePermissions ? 'Выдавать права может только первичный админ' : 'Настроить права'}
                        onClick={() => setPermTarget(u)}
                      >
                        Управлять
                      </Button>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Button
                        variant={u.role === 'Admin' ? 'ghost' : 'secondary'}
                        size="sm"
                        disabled={busy || !canManageRole}
                        title={!isPrimaryAdmin ? 'Только первичный админ может менять роли' : undefined}
                        onClick={() => run(u.id, () => adminApi.setRole(u.id, u.role === 'Admin' ? 'Student' : 'Admin'))}
                      >
                        {u.role === 'Admin' ? 'Снять админа' : 'Админ'}
                      </Button>
                      <Button
                        variant={u.isActive ? 'ghost' : 'primary'}
                        size="sm"
                        disabled={busy || !canBan}
                        title={u.isProtected ? 'Защищённый пользователь' : isSelf ? 'Нельзя забанить себя' : undefined}
                        onClick={() => run(u.id, () => adminApi.setIsActive(u.id, !u.isActive))}
                      >
                        {u.isActive ? 'Бан' : 'Разбан'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <Card variant="hover" className="text-center py-12">
          <p className="text-dark-textMuted">Пользователи не найдены</p>
        </Card>
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

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminReferralsApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { FunLoader } from '../../components/ambient/FunLoader';
import { ADMIN } from '../../components/ambient/loadPhrases';
import { notifyFailure, notifySuccess } from '../../utils/notify';
import { formatMoscowDateTime } from '../../utils/datetime';
import type { AdminReferralDashboardDto, AdminReferralDailyPointDto } from '../../types';

function formatDate(value: string) {
  return formatMoscowDateTime(value, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({ label, value, accent = 'text-dark-text' }: { label: string; value: number | string; accent?: string }) {
  return (
    <Card variant="hover">
      <CardContent className="p-4">
        <p className="text-sm text-dark-textMuted">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

/** Daily invite inflow as simple columns; no chart library is used anywhere else either. */
function InvitesChart({ points }: { points: AdminReferralDailyPointDto[] }) {
  const { max, total } = useMemo(
    () => ({
      max: Math.max(1, ...points.map((p) => p.count)),
      total: points.reduce((sum, p) => sum + p.count, 0),
    }),
    [points],
  );

  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Приглашения по дням">
        {points.map((point) => (
          <div
            key={point.date}
            title={`${point.date}: ${point.count}`}
            className="flex-1 rounded-t bg-primary-500/70 hover:bg-primary-400 transition-colors"
            style={{ height: `${Math.max(point.count > 0 ? 3 : 0, (point.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-dark-textMuted">
        <span>{points[0]?.date.slice(5)}</span>
        <span>
          Всего: <span className="text-dark-text font-medium">{total}</span>
        </span>
        <span>{points[points.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-dark-textMuted">
        {text}
      </td>
    </tr>
  );
}

/** Admin referral reporting plus manual KepkaCoin accrual. */
export function ReferralsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<{ id: string; displayName: string } | null>(null);
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');

  const { data, isLoading, error } = useQuery<AdminReferralDashboardDto>({
    queryKey: ['admin', 'referrals'],
    queryFn: async () => (await adminReferralsApi.getDashboard()).data,
  });

  const trimmedSearch = search.trim();
  const { data: searchResults } = useQuery({
    queryKey: ['admin', 'users', 'search', trimmedSearch],
    queryFn: async () => (await adminApi.getUsers({ page: 1, pageSize: 6, q: trimmedSearch })).data,
    enabled: trimmedSearch.length >= 2 && !selectedUser,
    staleTime: 30_000,
  });

  const grantMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('user is required');
      return (await adminReferralsApi.grantCoins({
        userId: selectedUser.id,
        amount: Number(amount),
        reason: reason.trim() || undefined,
      })).data;
    },
    onSuccess: (result) => {
      notifySuccess(`Начислено ${amount} KepkaCoin. Баланс: ${result.kepkaCoins}`);
      setSelectedUser(null);
      setSearch('');
      setAmount('1');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      notifyFailure(err, message || 'Не удалось начислить коины');
    },
  });

  if (isLoading) {
    return <FunLoader pool={ADMIN} label="Загрузка статистики рефералов" />;
  }

  if (error || !data) {
    return (
      <Card variant="hover" className="text-center py-12">
        <p className="text-red-400">Не удалось загрузить статистику рефералов</p>
      </Card>
    );
  }

  const canGrant =
    selectedUser !== null &&
    Number(amount) >= 1 &&
    Number(amount) <= 1000 &&
    !grantMutation.isPending;

  const pickUser = (user: { id: string; displayName: string }) => {
    setSelectedUser({ id: user.id, displayName: user.displayName });
    setSearch('');
    // Used both by the search dropdown and by the "Начислить" row action, so
    // keep the form in view when the pick came from a table far below.
    document
      .getElementById('admin-grant-coins')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Всего приглашений" value={data.totalInvites} accent="text-primary-400" />
        <StatCard label="Приглашающих" value={data.activeInviters} />
        <StatCard label="Заработано коинов" value={data.totalCoinsEarned} accent="text-amber-400" />
        <StatCard label="Потрачено в магазине" value={data.totalCoinsSpent} accent="text-rose-400" />
        <StatCard label="Начислено админами" value={data.totalGrantedCoins} accent="text-sky-400" />
        <StatCard label="В обороте" value={data.coinsInCirculation} />
        <StatCard label="Владельцев наград" value={data.rewardOwners} />
        <StatCard
          label="Среднее на приглашающего"
          value={
            data.activeInviters > 0
              ? (data.totalInvites / data.activeInviters).toFixed(1).replace('.', ',')
              : '0'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="admin-grant-coins">
          <CardHeader>
            <CardTitle>Начисление KepkaCoin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedUser ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary-500/30 bg-primary-500/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-dark-text">{selectedUser.displayName}</p>
                  <p className="text-xs text-dark-textMuted">Пользователь выбран</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                  Сменить
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  label="Получатель"
                  placeholder="Имя, логин или email (мин. 2 символа)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {trimmedSearch.length >= 2 && (
                  <div className="space-y-1">
                    {(searchResults?.items.length ?? 0) > 0 ? (
                      searchResults?.items.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => pickUser(user)}
                          className="w-full rounded-lg border border-dark-border px-3 py-2 text-left text-sm text-dark-text hover:border-primary-500/40 hover:bg-dark-border/40 transition-colors"
                        >
                          <span className="block truncate">{user.displayName}</span>
                          <span className="block truncate text-xs text-dark-textMuted">
                            {user.login}
                            {user.studyGroupName ? ` · ${user.studyGroupName}` : ''}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-dark-textMuted">Никого не нашли</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <Input
                label="Коины"
                type="number"
                min={1}
                max={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input
                label="Причина"
                placeholder="Например, победитель конкурса"
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <Button
              loading={grantMutation.isPending}
              disabled={!canGrant}
              onClick={() => grantMutation.mutate()}
            >
              Начислить коины
            </Button>
            <p className="text-xs text-dark-textMuted">
              Пользователь получит уведомление, а действие попадёт в журнал аудита.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Приглашения за 30 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitesChart points={data.invitesPerDay} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Кто сколько пригласил</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-left text-xs uppercase tracking-wide text-dark-textMuted">
                  <th className="px-4 py-2 font-medium">Пользователь</th>
                  <th className="px-4 py-2 font-medium">Группа</th>
                  <th className="px-4 py-2 font-medium">Код</th>
                  <th className="px-4 py-2 font-medium text-right">Пригласил</th>
                  <th className="px-4 py-2 font-medium text-right">Коинов</th>
                  <th className="px-4 py-2 font-medium">Последнее</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.topInviters.length > 0 ? (
                  data.topInviters.map((row) => (
                    <tr key={row.userId} className="border-b border-dark-border/60 last:border-0">
                      <td className="px-4 py-2 text-dark-text">{row.displayName}</td>
                      <td className="px-4 py-2 text-dark-textMuted">{row.groupName ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-dark-textMuted">
                        {row.referralCode ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-primary-400">
                        {row.invitedCount}
                      </td>
                      <td className="px-4 py-2 text-right text-amber-400">{row.coinsEarned}</td>
                      <td className="px-4 py-2 text-dark-textMuted">
                        {row.lastInviteAt ? formatDate(row.lastInviteAt) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => pickUser({ id: row.userId, displayName: row.displayName })}
                        >
                          Начислить
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={7} text="Пока никто никого не пригласил" />
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Кто что купил</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.shopStats.map((item) => {
              const share = data.rewardOwners > 0 ? item.purchasedCount / data.rewardOwners : 0;
              return (
                <div key={item.code} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-dark-text">{item.title}</span>
                    <span className="shrink-0 text-dark-textMuted">
                      {item.purchasedCount} шт. · {item.coinsSpent} коинов
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-border">
                    <div
                      className="h-1.5 rounded-full bg-primary-500/80"
                      style={{ width: `${Math.min(100, share * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Последние покупки</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-left text-xs uppercase tracking-wide text-dark-textMuted">
                    <th className="px-4 py-2 font-medium">Кто</th>
                    <th className="px-4 py-2 font-medium">Награда</th>
                    <th className="px-4 py-2 font-medium text-right">Цена</th>
                    <th className="px-4 py-2 font-medium">Когда</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPurchases.length > 0 ? (
                    data.recentPurchases.map((row, index) => (
                      <tr key={`${row.userId}-${row.itemCode}-${index}`} className="border-b border-dark-border/60 last:border-0">
                        <td className="px-4 py-2 text-dark-text">{row.userName}</td>
                        <td className="px-4 py-2 text-dark-textMuted">
                          {row.itemTitle}
                          {row.pricePaid === 0 && (
                            <Badge variant="success" className="ml-2">
                              подарок
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-amber-400">{row.pricePaid}</td>
                        <td className="px-4 py-2 text-dark-textMuted">{formatDate(row.purchasedAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={4} text="Покупок ещё не было" />
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Последние приглашения</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-left text-xs uppercase tracking-wide text-dark-textMuted">
                    <th className="px-4 py-2 font-medium">Пригласил</th>
                    <th className="px-4 py-2 font-medium">Пришёл</th>
                    <th className="px-4 py-2 font-medium text-right">Коинов</th>
                    <th className="px-4 py-2 font-medium">Когда</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInvites.length > 0 ? (
                    data.recentInvites.map((row, index) => (
                      <tr key={`${row.inviteeUserId}-${index}`} className="border-b border-dark-border/60 last:border-0">
                        <td className="px-4 py-2 text-dark-text">{row.inviterName}</td>
                        <td className="px-4 py-2 text-dark-textMuted">
                          {row.inviteeName}
                          {row.inviteeGroupName ? ` · ${row.inviteeGroupName}` : ''}
                        </td>
                        <td className="px-4 py-2 text-right text-amber-400">+{row.coinsAwarded}</td>
                        <td className="px-4 py-2 text-dark-textMuted">{formatDate(row.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={4} text="Приглашений ещё не было" />
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Движение коинов</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-left text-xs uppercase tracking-wide text-dark-textMuted">
                    <th className="px-4 py-2 font-medium">Кто</th>
                    <th className="px-4 py-2 font-medium">Операция</th>
                    <th className="px-4 py-2 font-medium text-right">Коины</th>
                    <th className="px-4 py-2 font-medium">Когда</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.length > 0 ? (
                    data.recentTransactions.map((row) => (
                      <tr key={row.id} className="border-b border-dark-border/60 last:border-0">
                        <td className="px-4 py-2 text-dark-text">{row.userName}</td>
                        <td className="px-4 py-2 text-dark-textMuted">{row.reason}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            row.amount > 0 ? 'text-green-400' : 'text-rose-400'
                          }`}
                        >
                          {row.amount > 0 ? `+${row.amount}` : row.amount}
                        </td>
                        <td className="px-4 py-2 text-dark-textMuted">{formatDate(row.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={4} text="Операций ещё не было" />
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

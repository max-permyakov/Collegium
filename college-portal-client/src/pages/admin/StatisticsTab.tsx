import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { shortName } from '../../utils/names';
import type { StatisticsDto } from '../../types/admin';

interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
}

function StatCard({ label, value, accent = 'text-dark-text' }: StatCardProps) {
  return (
    <Card variant="hover">
      <CardContent className="p-4">
        <p className="text-sm text-dark-textMuted">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function StatisticsTab() {
  const { data, isLoading, error } = useQuery<StatisticsDto>({
    queryKey: ['admin', 'statistics'],
    queryFn: async () => (await adminApi.getStatistics()).data,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card variant="hover" className="text-center py-12">
        <p className="text-red-400">Не удалось загрузить статистику</p>
      </Card>
    );
  }

  const maxGroup = Math.max(1, ...data.groups.map((g) => g.studentCount));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Всего пользователей" value={data.totalUsers} />
        <StatCard label="Онлайн" value={data.onlineUsers} accent="text-green-400" />
        <StatCard label="Активных (7 дн.)" value={data.activeUsers} accent="text-primary-400" />
        <StatCard label="Админов" value={data.adminUsers} accent="text-primary-400" />
        <StatCard label="Защищённых админов" value={data.protectedAdmins} accent="text-yellow-400" />
        <StatCard label="Учебных групп" value={data.totalGroups} />
        <StatCard label="Новостей" value={data.totalAnnouncements} />
        <StatCard label="Заданий" value={data.totalAssignments} />
        <StatCard label="Входов за 7 / 30 дней" value={`${data.logins.last7Days} / ${data.logins.last30Days}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Студенты по группам</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.groups.length === 0 ? (
              <p className="text-dark-textMuted text-sm">Нет данных</p>
            ) : (
              data.groups.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-dark-text truncate">{g.name}</span>
                    <span className="text-dark-textMuted shrink-0 ml-2">{g.studentCount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-dark-bg overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${(g.studentCount / maxGroup) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Топ студентов по среднему баллу</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topStudents.length === 0 ? (
              <p className="text-dark-textMuted text-sm">Нет данных об оценках</p>
            ) : (
              data.topStudents.map((s, i) => (
                <div key={s.userId} className="flex items-center justify-between py-1.5 border-b border-dark-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-dark-textMuted shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-dark-text truncate">{shortName(s.displayName)}</p>
                      <p className="text-xs text-dark-textMuted truncate">{s.groupName}</p>
                    </div>
                  </div>
                  <span className="text-primary-400 font-semibold shrink-0 ml-2">{s.averageMark.toFixed(2)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

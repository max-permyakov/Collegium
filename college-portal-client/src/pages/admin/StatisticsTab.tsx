import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { shortName } from '../../utils/names';
import type { StatisticsDailyPoint, StatisticsDto } from '../../types/admin';

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

const CHART_W = 640;
const CHART_H = 220;
const PAD = { top: 14, right: 10, bottom: 26, left: 10 };

/**
 * Registration inflow for the last 30 days as animated SVG columns
 * (no chart libraries — same approach as the grades trend chart).
 */
function RegistrationsChart({ points }: { points: StatisticsDailyPoint[] }) {
  const { bars, labels, totalCount } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.count));
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const step = points.length > 0 ? innerW / points.length : innerW;
    const barW = Math.max(4, step * 0.55);

    return {
      bars: points.map((p, i) => {
        const x = PAD.left + step * i + (step - barW) / 2;
        const h = (p.count / max) * innerH;
        return {
          x,
          y: PAD.top + innerH - h,
          w: barW,
          h: Math.max(p.count > 0 ? 2 : 0, h),
          count: p.count,
          date: p.date,
        };
      }),
      labels: points
        .filter((_, i) => i % 7 === 0 || i === points.length - 1)
        .map((p, i, arr) => {
          // Axis labels roughly every 7 days (+последний день).
          const idx = points.indexOf(p);
          const x = PAD.left + step * idx + step / 2;
          const anchor: 'end' | 'middle' = i === arr.length - 1 ? 'end' : 'middle';
          const label = p.date.replace(/(\d{4}-)?(\d{2}-\d{2}).*/, '$2'); // MM-DD
          return { x, label, anchor };
        }),
      totalCount: points.reduce((sum, p) => sum + p.count, 0),
    };
  }, [points]);

  return (
    <div role="img" aria-label="График регистрации пользователей за 30 дней">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto select-none">
        {/* horizontal gridlines at 0 / 50% / max */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + (CHART_H - PAD.top - PAD.bottom) * (1 - t);
          return <line key={t} x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y} stroke="currentColor" className="text-dark-border" strokeWidth={1} strokeDasharray={t > 0 ? '4 6' : undefined} />;
        })}
        {bars.map((b, i) => (
          <g key={i}>
            <title>{`${b.date}: ${b.count} reg.`}</title>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={2}
              className="fill-primary-500/80 hover:fill-primary-400 transition-colors"
            />
          </g>
        ))}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={CHART_H - 6}
            textAnchor={l.anchor}
            className="fill-dark-textMuted"
            fontSize={10}
          >
            {l.label}
          </text>
        ))}
      </svg>
      <p className="text-xs text-dark-textMuted mt-1">
        Всего за 30 дней: <span className="text-dark-text font-medium">{totalCount}</span>
      </p>
    </div>
  );
}

const CONTENT_CARDS: Array<{
  key: keyof StatisticsDto['content'];
  label: string;
  accent: string;
}> = [
  { key: 'chatMessages', label: 'Сообщений в чатах', accent: 'text-primary-400' },
  { key: 'clubMessages', label: 'Сообщений в кружках', accent: 'text-primary-400' },
  { key: 'newsComments', label: 'Комментариев в новостях', accent: 'text-emerald-400' },
  { key: 'chats', label: 'Чатов в базе', accent: 'text-sky-400' },
  { key: 'clubs', label: 'Кружков в базе', accent: 'text-sky-400' },
  { key: 'pushSubscriptions', label: 'Push-подписок', accent: 'text-amber-400' },
];

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
            <CardTitle>Приток пользователей (30 дней)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.registrationsPerDay && data.registrationsPerDay.length > 0 ? (
              <RegistrationsChart points={data.registrationsPerDay} />
            ) : (
              <p className="text-dark-textMuted text-sm">Нет данных о регистрациях</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Контент и активность</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {CONTENT_CARDS.map((c) => (
                <div
                  key={c.key}
                  className="p-3 rounded-xl border border-dark-border bg-dark-bg/40"
                >
                  <p className="text-xs text-dark-textMuted leading-tight">{c.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${c.accent}`}>
                    {data.content ? data.content[c.key] : 0}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { scheduleApi } from '../../services/api';
import { gradesApi } from '../../services/api';
import { newsApi } from '../../services/api';
import { assignmentsApi } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { RoomButton } from '../../components/college/RoomButton';
import { NewsViewerModal } from '../../components/news/NewsViewerModal';
import { GradeCalendar } from '../../components/grades/GradeCalendar';
import { buildDayIndex } from '../../utils/gradeCalendar';
import { formatMoscowDate, formatMoscowTime, moscowDateISO, moscowNowTimeHMS, moscowWeekStartISO } from '../../utils/datetime';
import { shortName } from '../../utils/names';
import { pageCache } from '../../utils/pageCache';
import { FunLoader } from '../../components/ambient/FunLoader';
import { HOME } from '../../components/ambient/loadPhrases';
import type { Lesson, KkepikScheduleResponse, AnnouncementListItem, AssignmentListItem, PerformanceResponse } from '../../types';

interface DashboardData {
  remainingToday?: Lesson[];
  todaySource?: 'kkepik';
  kkepik?: KkepikScheduleResponse;
  performance?: PerformanceResponse | null;
  news?: AnnouncementListItem[];
  assignments?: AssignmentListItem[];
}

const teacherShort = (teacher: Lesson['teacher']) => {
  if (!teacher) return '';
  const initials = [teacher.firstName, teacher.middleName]
    .filter(Boolean)
    .map(n => `${(n || '').replace('.', '').charAt(0).toUpperCase()}.`)
    .join('');
  return `${teacher.lastName} ${initials}`.trim();
};

export function HomePage() {
  const { user } = useAuth();
  const cacheKey = `home:dashboard:${user?.id ?? 'guest'}`;
  const cachedDashboard = pageCache.get<DashboardData>(cacheKey);
  const [dashboardData, setDashboardData] = useState<DashboardData>(cachedDashboard ?? {});
  const [isLoading, setIsLoading] = useState(!cachedDashboard);
  const [viewNews, setViewNews] = useState<AnnouncementListItem | null>(null);

  const gradeDayIndex = useMemo(() => buildDayIndex(dashboardData.performance ?? null), [dashboardData.performance]);

  const _formatDate = (dateStr: string) =>
    formatMoscowDate(dateStr, { day: 'numeric', month: 'short', weekday: 'short' });

  const _formatTime = (time: string) => time.slice(0, 5);

  const loadDashboard = async () => {
    if (!user?.studentProfile) {
      setIsLoading(false);
      return;
    }

    try {
      const todayStr = moscowDateISO();
      const weekStartStr = moscowWeekStartISO();
      const nowTime = moscowNowTimeHMS();

      const [scheduleRes, kkepikRes, newsRes, assignmentsRes, perfRes] = await Promise.allSettled([
        scheduleApi.getWeek(weekStartStr),
        scheduleApi.getKkepik(),
        newsApi.getNews(user.studentProfile?.studyGroupId),
        assignmentsApi.getMyAssignments(),
        gradesApi.getPerformance(),
      ]);

      let remainingToday: Lesson[] = [];
      let todaySource: 'kkepik' | undefined = undefined;
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.data?.days) {
        const todayDay = scheduleRes.value.data.days.find(
          d => d.date === todayStr || d.date.slice(0, 10) === todayStr
        );
        if (todayDay) {
          remainingToday = todayDay.lessons.filter(l => l.startTime > nowTime);
          if (todayDay.source === 'kkepik') todaySource = 'kkepik';
        }
      }

      const nextData: DashboardData = {
        remainingToday,
        todaySource,
        kkepik: kkepikRes.status === 'fulfilled' ? kkepikRes.value.data : undefined,
        performance: perfRes.status === 'fulfilled' ? perfRes.value.data : null,
        news: newsRes.status === 'fulfilled' ? newsRes.value.data?.slice(0, 3) : [],
        assignments: assignmentsRes.status === 'fulfilled' ? assignmentsRes.value.data?.slice(0, 3) : [],
      };
      pageCache.set(cacheKey, nextData);
      setDashboardData(nextData);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  if (isLoading) {
    return <FunLoader pool={HOME} label="Загрузка главной" />;
  }

  const displayName = (() => {
    const parts = (user?.displayName || '').split(/\s+/).filter(Boolean);
    return parts[1] || parts[0] || 'Студент';
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">
            Привет, {displayName}!
          </h1>
          <p className="text-dark-textMuted">Вот ваша сводка на сегодня</p>
        </div>
        <Avatar src={user?.studentProfile?.avatarDataUrl || undefined} name={user?.displayName || ''} size="lg" />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card variant="hover" className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 min-w-0">
              <span className="truncate">Оставшиеся пары сегодня</span>
              {dashboardData.todaySource === 'kkepik' && (
                <Badge variant="primary" className="text-[10px] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1" />
                  от kkepik
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.remainingToday && dashboardData.remainingToday.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.remainingToday.map((lesson, i) => (
                  <div key={i} className="min-w-0 p-3 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="primary">
                        {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                      </Badge>
                    </div>
                    <p className="font-medium text-dark-text break-words">{lesson.name}</p>
                    {lesson.classroom && lesson.classroom.name && (
                      <RoomButton
                        roomName={lesson.classroom.name}
                        lessonName={lesson.name}
                        teacherName={teacherShort(lesson.teacher)}
                        className="block text-sm text-primary-400 hover:text-primary-300 hover:underline mt-1 disabled:opacity-60 text-left break-words"
                      />
                    )}
                    {lesson.teacher && (
                      <p className="text-sm text-dark-textMuted break-words">{teacherShort(lesson.teacher)}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Сегодня пар больше нет</p>
            )}
          </CardContent>
          <CardFooter>
            <Link to="/schedule" className="w-full">
              <Button variant="ghost" className="w-full">Открыть расписание</Button>
            </Link>
          </CardFooter>
        </Card>

        <Card variant="hover" className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-1 min-w-0">
              <span className="truncate">Актуальное расписание kkepik</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsLoading(true); loadDashboard(); }}
                aria-label="Обновить расписание на завтра"
                className="shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </CardTitle>
            {dashboardData.kkepik?.date && (
              <Badge variant="info">{_formatDate(dashboardData.kkepik.date)}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {dashboardData.kkepik && dashboardData.kkepik.lessons.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.kkepik.lessons.slice(0, 5).map((lesson, i) => (
                  <div key={i} className="min-w-0 p-3 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="primary">
                        {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                      </Badge>
                      <span className="text-xs text-dark-textMuted">пара {i + 1}</span>
                    </div>
                    <p className="font-medium text-dark-text break-words">{lesson.name}</p>
                    {lesson.classroom && lesson.classroom.name && (
                      <RoomButton
                        roomName={lesson.classroom.name}
                        lessonName={lesson.name}
                        teacherName={teacherShort(lesson.teacher)}
                        className="block text-sm text-primary-400 hover:text-primary-300 hover:underline mt-1 disabled:opacity-60 text-left break-words"
                      />
                    )}
                    {lesson.teacher && (
                      <p className="text-sm text-dark-textMuted break-words">{teacherShort(lesson.teacher)}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Расписания пока нет</p>
            )}
          </CardContent>
          {dashboardData.kkepik?.updatedAt && (
            <CardFooter>
              <p className="text-xs text-dark-textMuted flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block flex-shrink-0" />
                Обновлено от kkepik в {formatMoscowTime(dashboardData.kkepik.updatedAt, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </CardFooter>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Календарь оценок</CardTitle>
            <Link to="/grades">
              <Button variant="ghost" size="sm">Все оценки</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {gradeDayIndex.size > 0 ? (
              <GradeCalendar dayIndex={gradeDayIndex} />
            ) : (
              <p className="text-dark-textMuted text-center py-8">
                Нет оценок за период.{' '}
                <Link to="/grades" className="text-primary-400 hover:underline">Обновить из дневника</Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card variant="hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Задания</CardTitle>
            <Link to="/assignments">
              <Button variant="ghost" size="sm">Все задания</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {dashboardData.assignments && dashboardData.assignments.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.assignments.map(assignment => (
                  <Link key={assignment.id} to="/assignments" className="block">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-dark-text truncate">{assignment.title}</p>
                        <p className="text-sm text-dark-textMuted">{assignment.studyGroupName} • {_formatDate(assignment.dueAt)}</p>
                      </div>
                      <Badge variant={new Date(assignment.dueAt) < new Date() ? 'danger' : 'warning'}>
                        {new Date(assignment.dueAt) < new Date() ? 'Просрочено' : 'Активно'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Нет активных заданий</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card variant="hover">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Новости</CardTitle>
          <Link to="/news">
            <Button variant="ghost" size="sm">Все новости</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {dashboardData.news && dashboardData.news.length > 0 ? (
            <div className="space-y-2">
              {dashboardData.news.map(news => (
                <button
                  key={news.id}
                  type="button"
                  onClick={() => setViewNews(news)}
                  className="block w-full text-left"
                >
                  <div className="p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors">
                    <p className="font-medium text-dark-text line-clamp-1">{news.title}</p>
                    <p className="text-sm text-dark-textMuted mt-1 line-clamp-2">{news.body}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar src={news.authorAvatar || undefined} name={news.authorName} size="xs" />
                      <span className="text-xs text-dark-textMuted truncate">{shortName(news.authorName)}</span>
                      <span className="text-xs text-dark-textMuted ml-auto shrink-0">{_formatDate(news.publishedAt)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-dark-textMuted text-center py-8">Нет новостей</p>
          )}
        </CardContent>
      </Card>

      <NewsViewerModal announcement={viewNews} onClose={() => setViewNews(null)} />
    </div>
  );
}
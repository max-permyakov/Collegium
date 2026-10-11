import { useEffect, useState } from 'react';
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
import type { Lesson, KkepikScheduleResponse, SubjectGrade, AnnouncementListItem, AssignmentListItem } from '../../types';

interface DashboardData {
  remainingToday?: Lesson[];
  kkepik?: KkepikScheduleResponse;
  grades?: SubjectGrade[];
  news?: AnnouncementListItem[];
  assignments?: AssignmentListItem[];
}

const toDateInputValue = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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
  const [dashboardData, setDashboardData] = useState<DashboardData>({});
  const [isLoading, setIsLoading] = useState(true);

  const _formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
  };

  const _formatTime = (time: string) => time.slice(0, 5);

  const loadDashboard = async () => {
    if (!user?.studentProfile) return;

    try {
      const now = new Date();
      const todayStr = toDateInputValue(now);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      const weekStartStr = toDateInputValue(weekStart);
      const nowTime = now.toTimeString().slice(0, 8);

      const [scheduleRes, kkepikRes, gradesRes, newsRes, assignmentsRes] = await Promise.allSettled([
        scheduleApi.getWeek(weekStartStr),
        scheduleApi.getKkepik(),
        gradesApi.getGrades(),
        newsApi.getNews(user.studentProfile?.studyGroupId),
        assignmentsApi.getMyAssignments(),
      ]);

      let remainingToday: Lesson[] = [];
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.data?.days) {
        const todayDay = scheduleRes.value.data.days.find(
          d => d.date === todayStr || d.date.slice(0, 10) === todayStr
        );
        if (todayDay) {
          remainingToday = todayDay.lessons.filter(l => l.startTime > nowTime);
        }
      }

      setDashboardData({
        remainingToday,
        kkepik: kkepikRes.status === 'fulfilled' ? kkepikRes.value.data : undefined,
        grades: gradesRes.status === 'fulfilled' ? gradesRes.value.data?.subjects?.slice(0, 4) : [],
        news: newsRes.status === 'fulfilled' ? newsRes.value.data?.slice(0, 3) : [],
        assignments: assignmentsRes.status === 'fulfilled' ? assignmentsRes.value.data?.slice(0, 3) : [],
      });
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
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map(i => <div key={i} className="skeleton h-40" />)}
        </div>
      </div>
    );
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
        <Avatar name={user?.displayName || ''} size="lg" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="hover">
          <CardHeader>
            <CardTitle>Оставшиеся пары сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.remainingToday && dashboardData.remainingToday.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.remainingToday.map((lesson, i) => (
                  <div key={i} className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="primary">
                        {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                      </Badge>
                    </div>
                    <p className="font-medium text-dark-text">{lesson.name}</p>
                    {lesson.classroom && lesson.classroom.name && (
                      <p className="text-sm text-dark-textMuted mt-1">Ауд. {lesson.classroom.name}</p>
                    )}
                    {lesson.teacher && (
                      <p className="text-sm text-dark-textMuted">{teacherShort(lesson.teacher)}</p>
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

        <Card variant="hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Расписание на завтра</CardTitle>
            {dashboardData.kkepik?.date && (
              <Badge variant="info">{_formatDate(dashboardData.kkepik.date)}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {dashboardData.kkepik && dashboardData.kkepik.lessons.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.kkepik.lessons.slice(0, 5).map((lesson, i) => (
                  <div key={i} className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="primary">
                        {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                      </Badge>
                      <span className="text-xs text-dark-textMuted">пара {i + 1}</span>
                    </div>
                    <p className="font-medium text-dark-text">{lesson.name}</p>
                    {lesson.classroom && lesson.classroom.name && (
                      <p className="text-sm text-dark-textMuted mt-1">Ауд. {lesson.classroom.name}</p>
                    )}
                    {lesson.teacher && (
                      <p className="text-sm text-dark-textMuted">{teacherShort(lesson.teacher)}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Данных от kkepik пока нет</p>
            )}
          </CardContent>
          {dashboardData.kkepik?.updatedAt && (
            <CardFooter>
              <p className="text-xs text-dark-textMuted flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block flex-shrink-0" />
                Обновлено от kkepik в {_formatTime(new Date(dashboardData.kkepik.updatedAt).toTimeString())}
              </p>
            </CardFooter>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="hover">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Оценки</CardTitle>
            <Link to="/grades">
              <Button variant="ghost" size="sm">Все оценки</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {dashboardData.grades && dashboardData.grades.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.grades.map(subject => (
                  <Link key={subject.id} to="/grades" className="block">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors">
                      <div>
                        <p className="font-medium text-dark-text">{subject.name}</p>
                        <p className="text-sm text-dark-textMuted">{subject.id} предмет</p>
                      </div>
                      <Badge variant={subject.averageMark >= 4.5 ? 'success' : subject.averageMark >= 3.5 ? 'warning' : 'danger'}>
                        {subject.averageMark.toFixed(2)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Нет данных об оценках</p>
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
                <Link key={news.id} to={`/news/${news.id}`} className="block">
                  <div className="p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors">
                    <p className="font-medium text-dark-text line-clamp-1">{news.title}</p>
                    <p className="text-sm text-dark-textMuted mt-1 line-clamp-2">{news.body}</p>
                    <p className="text-xs text-dark-textMuted mt-2">{_formatDate(news.publishedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-dark-textMuted text-center py-8">Нет новостей</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
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
import type { SubjectGrade, AnnouncementListItem, AssignmentListItem } from '../../types';

interface DashboardData {
  nextLesson?: { lesson: any; date: string };
  grades?: SubjectGrade[];
  news?: AnnouncementListItem[];
  assignments?: AssignmentListItem[];
}

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
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const [scheduleRes, gradesRes, newsRes, assignmentsRes] = await Promise.allSettled([
        scheduleApi.getWeek(weekStartStr),
        gradesApi.getGrades(),
        newsApi.getNews(user.studentProfile?.studyGroupId),
        assignmentsApi.getMyAssignments(),
      ]);

      let nextLesson: DashboardData['nextLesson'];
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.data?.days) {
        const days = scheduleRes.value.data.days;
        for (const day of days) {
          if (day.lessons.length > 0) {
            const upcoming = day.lessons.find(l => {
              const lessonTime = new Date(`${day.date}T${l.startTime}`);
              return lessonTime > new Date();
            });
            if (upcoming) {
              nextLesson = { lesson: upcoming, date: day.date };
              break;
            }
            if (!nextLesson) {
              nextLesson = { lesson: day.lessons[0], date: day.date };
            }
          }
        }
      }

      setDashboardData({
        nextLesson,
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">
            Привет, {user?.displayName?.split(' ')[0] || 'Студент'}! 👋
          </h1>
          <p className="text-dark-textMuted">Вот ваша сводка на сегодня</p>
        </div>
        <Avatar name={user?.displayName || ''} size="lg" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card variant="hover" className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-dark-textMuted">Следующая пара</p>
              <p className="font-medium text-dark-text">
                {dashboardData.nextLesson
                  ? `${dashboardData.nextLesson.lesson.name} (${_formatTime(dashboardData.nextLesson.lesson.startTime)})`
                  : 'Пар нет'}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="hover" className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-dark-textMuted">Средний балл</p>
              <p className="font-medium text-dark-text">
                {dashboardData.grades && dashboardData.grades.length > 0
                  ? (dashboardData.grades.reduce((sum, s) => sum + s.averageMark, 0) / dashboardData.grades.length).toFixed(2)
                  : '—'}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="hover" className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-dark-textMuted">Заданий</p>
              <p className="font-medium text-dark-text">{dashboardData.assignments?.length || 0}</p>
            </div>
          </div>
        </Card>

        <Card variant="hover" className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-dark-textMuted">Новостей</p>
              <p className="font-medium text-dark-text">{dashboardData.news?.length || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="hover">
          <CardHeader>
            <CardTitle>Следующая пара</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.nextLesson ? (
              <Link to="/schedule" className="block">
                <div className="p-4 rounded-xl bg-dark-bg border border-dark-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="primary">{_formatDate(dashboardData.nextLesson.date)}</Badge>
                    <Badge variant="info">{_formatTime(dashboardData.nextLesson.lesson.startTime)} - {_formatTime(dashboardData.nextLesson.lesson.endTime)}</Badge>
                  </div>
                  <h3 className="font-medium text-dark-text">{dashboardData.nextLesson.lesson.name}</h3>
                  {dashboardData.nextLesson.lesson.classroom && (
                    <p className="text-sm text-dark-textMuted mt-1">
                      📍 Ауд. {dashboardData.nextLesson.lesson.classroom.name}, Корп. {dashboardData.nextLesson.lesson.classroom.buildingName}
                    </p>
                  )}
                  {dashboardData.nextLesson.lesson.teacher && (
                    <p className="text-sm text-dark-textMuted">
                      👨‍🏫 {dashboardData.nextLesson.lesson.teacher.lastName} {dashboardData.nextLesson.lesson.teacher.firstName[0]}.{dashboardData.nextLesson.lesson.teacher.middleName[0]}.'
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <p className="text-dark-textMuted text-center py-8">Пар на ближайшее время нет</p>
            )}
          </CardContent>
          <CardFooter>
            <Link to="/schedule">
              <Button variant="ghost" className="w-full">Открыть расписание</Button>
            </Link>
          </CardFooter>
        </Card>

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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
    </div>
  );
}
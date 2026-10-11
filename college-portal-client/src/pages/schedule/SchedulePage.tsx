import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { scheduleApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import type { WeekScheduleResponse } from '../../types';

const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function _getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d;
}

function _formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
}

function _formatTime(time: string) {
  return time.slice(0, 5);
}

export function SchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [weekSchedule, setWeekSchedule] = useState<WeekScheduleResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(searchParams.get('date') || new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedule = async () => {
    setIsLoading(true);
    try {
      const startDate = searchParams.get('startDate') || _getWeekStart(new Date()).toISOString().split('T')[0];
      const response = await scheduleApi.getWeek(startDate);
      setWeekSchedule(response.data);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [searchParams.get('startDate')]);

  useEffect(() => {
    if (selectedDate) {
      setSearchParams({ date: selectedDate }, { replace: true });
    }
  }, [selectedDate, setSearchParams]);

  const formatDateLocal = (dateStr: string) => _formatDate(dateStr);
  const formatTimeLocal = (time: string) => _formatTime(time);

  const navigateWeek = (delta: number) => {
    if (!weekSchedule) return;
    const currentStart = new Date(weekSchedule.startDate);
    currentStart.setDate(currentStart.getDate() + delta * 7);
    setSearchParams({ startDate: currentStart.toISOString().split('T')[0] });
  };

  const today = new Date().toISOString().split('T')[0];
  const selectedDay = weekSchedule?.days.find(d => d.date === selectedDate);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {[...Array(7)].map((_, i) => <div key={i} className="skeleton h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Расписание</h1>
          <p className="text-dark-textMuted">
            {weekSchedule
              ? `${formatDateLocal(weekSchedule.startDate)} — ${formatDateLocal(weekSchedule.endDate)}`
              : 'Загрузка...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigateWeek(-1)} aria-label="Предыдущая неделя">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigateWeek(1)} aria-label="Следующая неделя">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSearchParams({ startDate: _getWeekStart(new Date()).toISOString().split('T')[0] })}>
            Эта неделя
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {weekSchedule?.days.map((day) => {
          const date = new Date(day.date);
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          const hasLessons = day.lessons.length > 0;

          return (
            <Card
              key={day.date}
              variant="hover"
              className={`relative ${isToday ? 'ring-2 ring-primary-500' : ''} ${isSelected ? 'ring-2 ring-primary-500 bg-primary-500/5' : ''}`}
              onClick={() => setSelectedDate(day.date)}
            >
              <div className={`flex items-center justify-between mb-3 ${isToday ? 'text-primary-400' : ''}`}>
                <span className="text-sm font-medium text-dark-textMuted">{dayNames[date.getDay()]}</span>
                <span className={`font-semibold ${isToday ? 'text-primary-400' : 'text-dark-text'}`}>{date.getDate()}</span>
              </div>
              {day.isHoliday && (
                <Badge variant="warning" className="mb-2">Выходной</Badge>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {hasLessons ? (
                  day.lessons.map((lesson, i) => (
                    <Link key={`${day.date}-${i}`} to={`/schedule?date=${day.date}`} className="block">
                      <div className="p-3 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="info">{formatTimeLocal(lesson.startTime)}</Badge>
                          <Badge variant="primary">{formatTimeLocal(lesson.endTime)}</Badge>
                        </div>
                        <p className="font-medium text-dark-text line-clamp-1">{lesson.name}</p>
                        {lesson.classroom && (
                          <p className="text-xs text-dark-textMuted mt-1">📍 Ауд. {lesson.classroom.name}</p>
                        )}
                        {lesson.teacher && (
                          <p className="text-xs text-dark-textMuted">{lesson.teacher.lastName} {lesson.teacher.firstName[0]}.</p>
                        )}
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-dark-textMuted text-center py-4 text-sm">Пар нет</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {selectedDay && (
        <Card variant="hover" className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Пары на {formatDateLocal(selectedDate)}</CardTitle>
            <Badge variant={selectedDay.isHoliday ? 'warning' : 'primary'}>
              {selectedDay.isHoliday ? 'Выходной' : 'Учебный день'}
            </Badge>
          </CardHeader>
          <CardContent>
            {selectedDay.lessons.length > 0 ? (
              <div className="space-y-3">
                {selectedDay.lessons.map((lesson, index) => (
                  <div key={`${selectedDate}-${index}`} className="p-4 rounded-xl bg-dark-bg border border-dark-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="info">{_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}</Badge>
                        <h3 className="font-medium text-dark-text">{lesson.name}</h3>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 text-sm">
                      {lesson.classroom && (
                        <div className="flex items-center gap-2 text-dark-textMuted">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span>Ауд. {lesson.classroom.name}, Корп. {lesson.classroom.buildingName}</span>
                        </div>
                      )}
                      {lesson.teacher && (
                        <div className="flex items-center gap-2 text-dark-textMuted">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          <span>{lesson.teacher.lastName} {lesson.teacher.firstName[0]}.{lesson.teacher.middleName[0]}.</span>
                        </div>
                      )}
                      {lesson.gradebook?.themes?.length && (
                        <div className="flex items-center gap-2 text-dark-textMuted">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          <span className="flex-1">{lesson.gradebook.themes.join(', ')}</span>
                        </div>
                      )}
                    </div>
                    {lesson.gradebook?.tasks?.length && (
                      <div className="mt-3 pt-3 border-t border-dark-border">
                        <p className="text-sm font-medium text-dark-text mb-2">Задания:</p>
                        <div className="space-y-1">
                          {lesson.gradebook.tasks.map((task, ti) => (
                            <div key={`${selectedDate}-${index}-${ti}`} className="flex items-center gap-2 text-sm text-dark-textMuted">
                              <Badge variant={task.isRequired ? 'danger' : 'default'} className="text-xs">{task.type}</Badge>
                              <span className="flex-1">{task.topic}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-textMuted text-center py-8">В этот день пар нет</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
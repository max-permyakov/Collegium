import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scheduleApi } from '../../services/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { addDaysISO, formatMoscowTime, moscowDateISO, moscowWeekStartISO } from '../../utils/datetime';
import type { WeekScheduleResponse, KkepikScheduleResponse } from '../../types';

const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function _formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${dayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`;
}

function _formatTime(time: string) {
  return time.slice(0, 5);
}

const teacherShort = (teacher: WeekScheduleResponse['days'][number]['lessons'][number]['teacher']) => {
  if (!teacher) return '';
  const initials = [teacher.firstName, teacher.middleName]
    .filter(Boolean)
    .map(n => `${(n || '').replace('.', '').charAt(0).toUpperCase()}.`)
    .join('');
  return `${teacher.lastName} ${initials}`.trim();
};

export function SchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [weekSchedule, setWeekSchedule] = useState<WeekScheduleResponse | null>(null);
  const [kkepik, setKkepik] = useState<KkepikScheduleResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedule = async () => {
    setIsLoading(true);
    try {
      const startDate = searchParams.get('startDate') || moscowWeekStartISO();
      const [scheduleRes, kkepikRes] = await Promise.allSettled([
        scheduleApi.getWeek(startDate),
        scheduleApi.getKkepik(),
      ]);
      if (scheduleRes.status === 'fulfilled') {
        setWeekSchedule(scheduleRes.value.data);
      }
      if (kkepikRes.status === 'fulfilled') {
        setKkepik(kkepikRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [searchParams.get('startDate')]);

  const navigateWeek = (delta: number) => {
    if (!weekSchedule) return;
    setSearchParams({ startDate: addDaysISO(weekSchedule.startDate, delta * 7) });
  };

  const today = moscowDateISO();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-48" />)}
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
              ? `${_formatDate(weekSchedule.startDate)} — ${_formatDate(weekSchedule.endDate)}`
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
          <Button variant="secondary" size="sm" onClick={() => setSearchParams({ startDate: moscowWeekStartISO() })}>
            Эта неделя
          </Button>
        </div>
      </div>

      {kkepik && kkepik.lessons.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-primary-500/10 border border-primary-500/30">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <p className="text-sm text-dark-text truncate">
              {kkepik.updatedAt
                ? `Расписание на завтра актуально: обновлено от kkepik в ${formatMoscowTime(kkepik.updatedAt, { hour: '2-digit', minute: '2-digit' })}`
                : 'Расписание на завтра актуально'}
            </p>
          </div>
          {kkepik.date && (
            <Badge variant="primary" className="flex-shrink-0">{_formatDate(kkepik.date)}</Badge>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {weekSchedule?.days.map((day) => {
          const date = new Date(day.date);
          const isToday = day.date.slice(0, 10) === today;

          return (
            <Card
              key={day.date}
              variant="hover"
              className={`relative ${isToday ? 'ring-2 ring-primary-500' : ''}`}
            >
              <div className={`flex items-center justify-between mb-3 ${isToday ? 'text-primary-400' : ''}`}>
                <span className="text-sm font-medium text-dark-textMuted">{dayNames[date.getDay()]}</span>
                <span className={`font-semibold ${isToday ? 'text-primary-400' : 'text-dark-text'}`}>{date.getDate()}</span>
              </div>
              {day.isHoliday && (
                <Badge variant="warning" className="mb-2">Выходной</Badge>
              )}
              <div className="space-y-2">
                {day.lessons.length > 0 ? (
                  day.lessons.map((lesson, i) => (
                    <div key={`${day.date}-${i}`} className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="primary">
                          {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                        </Badge>
                      </div>
                      <p className="font-medium text-dark-text line-clamp-1">{lesson.name}</p>
                      {lesson.classroom && lesson.classroom.name && (
                        <p className="text-xs text-dark-textMuted mt-1">Ауд. {lesson.classroom.name}</p>
                      )}
                      {lesson.teacher && (
                        <p className="text-xs text-dark-textMuted">{teacherShort(lesson.teacher)}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-dark-textMuted text-center py-6 text-sm">Пар нет</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
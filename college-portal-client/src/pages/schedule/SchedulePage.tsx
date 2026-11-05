import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scheduleApi, gradesApi } from '../../services/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RoomButton } from '../../components/college/RoomButton';
import { addDaysISO, formatMoscowTime, moscowDateISO, moscowWeekStartISO } from '../../utils/datetime';
import { pageCache } from '../../utils/pageCache';
import { FunLoader } from '../../components/ambient/FunLoader';
import { SCHEDULE } from '../../components/ambient/loadPhrases';
import { buildDayIndex } from '../../utils/gradeCalendar';
import { markDigitClass, absenceClass } from '../../components/grades/GradeCalendar';
import { getMarkValue } from '../../utils/performance';
import type { WeekScheduleResponse, KkepikScheduleResponse, PerformanceResponse } from '../../types';

const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function _formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${dayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`;
}

function _formatTime(time: string) {
  return time.slice(0, 5);
}

/** Monday-first week start (ISO 'YYYY-MM-DD') for an arbitrary date. */
function weekStartOfISO(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
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
  // Прямой переход из календаря: выделяем и скроллим конкретный день.
  const highlightParam = searchParams.get('highlight')?.slice(0, 10) || null;
  const startDate =
    searchParams.get('startDate') ||
    (highlightParam ? weekStartOfISO(highlightParam) : moscowWeekStartISO());
  const cacheKey = `schedule:week:${startDate}`;
  const cached = pageCache.get<{ weekSchedule: WeekScheduleResponse | null; kkepik?: KkepikScheduleResponse }>(cacheKey);
  const [weekSchedule, setWeekSchedule] = useState<WeekScheduleResponse | null>(cached?.weekSchedule ?? null);
  const [kkepik, setKkepik] = useState<KkepikScheduleResponse | undefined>(cached?.kkepik);
  const [isLoading, setIsLoading] = useState(!cached);

  // Оценки/неявки из дневника — показываем рядом с уроками расписания.
  const [performance, setPerformance] = useState<PerformanceResponse | null>(
    pageCache.get<PerformanceResponse>('performance:overview') ?? null,
  );

  const marksByDay = useMemo(() => buildDayIndex(performance), [performance]);

  const loadSchedule = async () => {
    const cachedWeek = pageCache.get<{ weekSchedule: WeekScheduleResponse | null; kkepik?: KkepikScheduleResponse }>(cacheKey);
    setIsLoading(!cachedWeek);
    // Show the cached week immediately when navigating between weeks that were
    // already visited, instead of the previous week's cards.
    if (cachedWeek) {
      setWeekSchedule(cachedWeek.weekSchedule);
      setKkepik(cachedWeek.kkepik);
    }
    try {
      const [scheduleRes, kkepikRes, perfRes] = await Promise.allSettled([
        scheduleApi.getWeek(startDate),
        scheduleApi.getKkepik(),
        gradesApi.getPerformance(),
      ]);
      const nextKkepik = kkepikRes.status === 'fulfilled' ? kkepikRes.value.data : undefined;
      if (scheduleRes.status === 'fulfilled') {
        setWeekSchedule(scheduleRes.value.data);
      }
      setKkepik(nextKkepik);
      if (perfRes.status === 'fulfilled') {
        pageCache.set('performance:overview', perfRes.value.data);
        setPerformance(perfRes.value.data);
      }
      if (scheduleRes.status === 'fulfilled') {
        pageCache.set(cacheKey, { weekSchedule: scheduleRes.value.data, kkepik: nextKkepik });
      }
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  // При переходе из календаря прокручиваем страницу к нужному дню.
  useEffect(() => {
    if (!highlightParam || !weekSchedule) return;
    const el = document.getElementById(`schedule-day-${highlightParam}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightParam, weekSchedule]);

  const navigateWeek = (delta: number) => {
    if (!weekSchedule) return;
    setSearchParams({ startDate: addDaysISO(weekSchedule.startDate, delta * 7) });
  };

  const today = moscowDateISO();

  if (isLoading) {
    return <FunLoader pool={SCHEDULE} label="Загрузка расписания" />;
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
                ? `Актуальное расписание от kkepik: обновлено в ${formatMoscowTime(kkepik.updatedAt, { hour: '2-digit', minute: '2-digit' })}`
                : 'Актуальное расписание от kkepik'}
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
          const dayIso = day.date.slice(0, 10);
          const isToday = dayIso === today;
          const isHighlighted = highlightParam === dayIso;

          // Оценки и неявки этого дня, сопоставленные с уроками по названию.
          const dayMarks = marksByDay.get(dayIso) ?? [];
          const matched = new Set<number>();
          const lessonMarksMap = new Map<number, typeof dayMarks>();
          day.lessons.forEach((lesson, lessonIndex) => {
            const name = lesson.name.trim().toLowerCase();
            const found: typeof dayMarks = [];
            dayMarks.forEach((entry, index) => {
              if (matched.has(index)) return;
              if (entry.subjectName.trim().toLowerCase() === name) {
                matched.add(index);
                found.push(entry);
              }
            });
            lessonMarksMap.set(lessonIndex, found);
          });
          const unmatchedMarks = dayMarks.filter((_, index) => !matched.has(index));

          return (
            <Card
              key={day.date}
              variant="hover"
              id={`schedule-day-${dayIso}`}
              className={`relative scroll-mt-20 ${isToday ? 'ring-2 ring-primary-500' : ''} ${isHighlighted ? 'ring-2 ring-amber-400/70' : ''}`}
            >
              <div className={`flex items-center justify-between mb-3 ${isToday ? 'text-primary-400' : ''}`}>
                <span className="text-sm font-medium text-dark-textMuted">{dayNames[date.getDay()]}</span>
                <div className="flex items-center gap-2">
                  {day.source === 'kkepik' && (
                    <Badge variant="primary" className="text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1" />
                      от kkepik
                    </Badge>
                  )}
                  <span className={`font-semibold ${isToday ? 'text-primary-400' : 'text-dark-text'}`}>{date.getDate()}</span>
                </div>
              </div>
              {day.isHoliday && (
                <Badge variant="warning" className="mb-2">Выходной</Badge>
              )}
              <div className="space-y-2">
                {day.lessons.length > 0 ? (
                  day.lessons.map((lesson, i) => {
                    const lessonMarks = lessonMarksMap.get(i) ?? [];
                    const hasAbsence = lessonMarks.some((e) => e.absenceType);
                    return (
                      <div key={`${day.date}-${i}`} className="p-3 rounded-xl bg-dark-bg border border-dark-border">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="primary">
                            {_formatTime(lesson.startTime)} - {_formatTime(lesson.endTime)}
                          </Badge>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-dark-text line-clamp-1 flex-1 min-w-0">{lesson.name}</p>
                          {/* Оценки дня по этому предмету цветными цифрами */}
                          {lessonMarks.length > 0 && (
                            <span className="flex flex-wrap items-center gap-1 shrink-0 leading-none mt-0.5">
                              {lessonMarks.flatMap((entry, ei) => [
                                ...entry.markValues.map((mark, mi) => (
                                  <span
                                    key={`m-${ei}-${mi}`}
                                    className={`text-base font-bold ${markDigitClass(mark)}`}
                                    title={`${entry.subjectName}: оценка ${getMarkValue(mark)}`}
                                  >
                                    {getMarkValue(mark)}
                                  </span>
                                )),
                                entry.absenceType && (
                                  <span
                                    key={`a-${ei}`}
                                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${
                                      entry.absenceType === 'IsAbsentByNotValidReason'
                                        ? 'text-red-400 border-red-400/50'
                                        : 'text-sky-400 border-sky-400/50'
                                    }`}
                                    title={entry.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                                  >
                                    Неявка
                                  </span>
                                ),
                              ])}
                            </span>
                          )}
                        </div>
                        {lesson.classroom && lesson.classroom.name && (
                          <RoomButton
                            roomName={lesson.classroom.name}
                            lessonName={lesson.name}
                            teacherName={teacherShort(lesson.teacher)}
                          />
                        )}
                        {lesson.teacher && (
                          <p className="text-xs text-dark-textMuted">{teacherShort(lesson.teacher)}</p>
                        )}
                        {hasAbsence && (
                          <p className={`text-[11px] mt-0.5 ${lessonMarks.every((e) => e.absenceType === 'IsAbsentByNotValidReason') ? 'text-red-400' : 'text-sky-400'}`}>
                            {lessonMarks.some((e) => e.absenceType === 'IsAbsentByNotValidReason') ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-dark-textMuted text-center py-6 text-sm">Пар нет</p>
                )}
              </div>

              {/* Оценки/неявки, чьи предметы не нашлись среди уроков этого дня */}
              {unmatchedMarks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dark-border">
                  <p className="text-[10px] uppercase tracking-wide text-dark-textMuted mb-1">Оценки за день</p>
                  <div className="space-y-1">
                    {unmatchedMarks.map((entry, ei) => (
                      <div key={ei} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-dark-textMuted truncate min-w-0">{entry.subjectName}</span>
                        <span className="flex items-center gap-1 shrink-0 leading-none">
                          {entry.markValues.map((mark, mi) => (
                            <span key={mi} className={`text-sm font-bold ${markDigitClass(mark)}`} title={`Оценка ${getMarkValue(mark)}`}>
                              {getMarkValue(mark)}
                            </span>
                          ))}
                          {entry.markValues.length === 0 && entry.absenceType && (
                            <span className={`text-[11px] font-bold ${absenceClass(entry.absenceType)}`}>Н</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
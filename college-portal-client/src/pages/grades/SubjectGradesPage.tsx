import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { gradesApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DiaryRequiredNotice } from '../../components/DiaryRequiredNotice';
import { MarkTrendChart } from '../../components/grades/MarkTrendChart';
import { GradeCalendar } from '../../components/grades/GradeCalendar';
import { pageCache } from '../../utils/pageCache';
import {
  buildAverageSeries,
  buildDayIndex,
  subjectsWithMarks,
} from '../../utils/gradeCalendar';
import { getMarkValue, getMarkVariant } from '../../utils/performance';
import { formatMoscowDate } from '../../utils/datetime';
import type { PerformanceResponse } from '../../types';

const PERFORMANCE_CACHE_KEY = 'performance:overview';

const formatDate = (dateStr: string): string =>
  formatMoscowDate(dateStr, { day: 'numeric', month: 'long', year: 'numeric' });

/** Detail page for a single subject: trend chart, per-day list and its own calendar. */
export function SubjectGradesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cachedPerformance = pageCache.get<PerformanceResponse>(PERFORMANCE_CACHE_KEY);
  const [performance, setPerformance] = useState<PerformanceResponse | null>(cachedPerformance ?? null);
  const [isLoading, setIsLoading] = useState(!cachedPerformance);
  const [error, setError] = useState('');
  const [diaryRequired, setDiaryRequired] = useState(false);

  const loadPerformance = async () => {
    setIsLoading(!pageCache.get(PERFORMANCE_CACHE_KEY));
    setError('');
    setDiaryRequired(false);
    try {
      const response = await gradesApi.getPerformance();
      pageCache.set(PERFORMANCE_CACHE_KEY, response.data);
      setPerformance(response.data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string; code?: string } } };
      if (e.response?.data?.code === 'diary_required') {
        setDiaryRequired(true);
      } else {
        setError(e.response?.data?.message || 'Не удалось загрузить оценки');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjects = useMemo(() => subjectsWithMarks(performance), [performance]);

  const activeSubject = useMemo(() => {
    if (subjects.length === 0) return null;
    const target = searchParams.get('subject')?.trim().toLowerCase();
    return subjects.find((s) => s.subjectName.trim().toLowerCase() === target) ?? subjects[0];
  }, [subjects, searchParams]);

  const series = useMemo(() => buildAverageSeries(performance, activeSubject), [performance, activeSubject]);
  const dayIndex = useMemo(
    () => (activeSubject ? buildDayIndex({ monthsWithDays: [], subjects: [activeSubject] }) : new Map()),
    [activeSubject],
  );

  const dayList = useMemo(
    () => (activeSubject ? [...activeSubject.daysWithMarks].sort((a, b) => b.day.localeCompare(a.day)) : []),
    [activeSubject],
  );

  const selectSubject = (name: string) => {
    setSearchParams({ subject: name }, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (diaryRequired) {
    return <DiaryRequiredNotice />;
  }

  if (error) {
    return (
      <Card variant="hover" className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Button onClick={() => void loadPerformance()}>Попробовать снова</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">{activeSubject?.subjectName ?? 'Оценки по предмету'}</h1>
          {activeSubject && (
            <p className="text-dark-textMuted text-sm">
              Средний балл: <span className="text-dark-text font-semibold">{activeSubject.averageMark.toFixed(2)}</span>
            </p>
          )}
        </div>
        <Link to="/grades" className="shrink-0 text-sm text-dark-textMuted hover:text-dark-text" title="Все оценки">
          ← Все оценки
        </Link>
      </div>

      {subjects.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {subjects.map((subject) => {
            const isActive = subject.subjectName === activeSubject?.subjectName;
            return (
              <button
                key={subject.subjectName}
                type="button"
                onClick={() => selectSubject(subject.subjectName)}
                className={`snap-start flex-shrink-0 rounded-full border px-3 py-1.5 text-sm max-w-[180px] truncate transition-colors ${
                  isActive
                    ? 'bg-primary-500/20 border-primary-500/40 text-primary-300'
                    : 'bg-dark-card border-dark-border text-dark-textMuted hover:text-dark-text'
                }`}
              >
                {subject.subjectName}
              </button>
            );
          })}
        </div>
      )}

      {!activeSubject ? (
        <Card variant="hover" className="text-center py-12">
          <p className="text-dark-textMuted">Нет оценок в текущем периоде</p>
        </Card>
      ) : (
        <>
          <Card variant="hover">
            <CardHeader>
              <CardTitle>Средний балл по предмету</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkTrendChart points={series} height={180} />
            </CardContent>
          </Card>

          <Card variant="hover">
            <CardHeader>
              <CardTitle>Календарь предмета</CardTitle>
            </CardHeader>
            <CardContent>
              <GradeCalendar dayIndex={dayIndex} compact />
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-dark-textMuted px-1">Оценки по дням</h2>
            {dayList.map((dayMarks) => (
              <Card key={`${activeSubject.subjectName}-${dayMarks.day}`} variant="hover">
                <CardHeader className="flex flex-row items-center justify-between gap-2 mb-2">
                  <CardTitle className="text-base">{formatDate(dayMarks.day)}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {dayMarks.absenceType && (
                      <Badge variant="danger">
                        {dayMarks.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                      </Badge>
                    )}
                    <Badge variant="primary">{dayMarks.markValues.length} оценок</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {dayMarks.markValues.map((mark, mi) => (
                      <Badge key={mi} variant={getMarkVariant(mark)} className="px-3 py-1.5 text-base">
                        {getMarkValue(mark)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

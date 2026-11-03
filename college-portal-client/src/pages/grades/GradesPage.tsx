import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { gradesApi, ratingApi } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DiaryRequiredNotice } from '../../components/DiaryRequiredNotice';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MarkTrendChart } from '../../components/grades/MarkTrendChart';
import { GradeCalendar } from '../../components/grades/GradeCalendar';
import { pageCache } from '../../utils/pageCache';
import {
  buildAverageSeries,
  buildDayIndex,
  overallAverage,
  subjectsWithMarks,
} from '../../utils/gradeCalendar';
import type { GroupRating, PerformanceResponse } from '../../types';

const PERFORMANCE_CACHE_KEY = 'performance:overview';

export function GradesPage() {
  const navigate = useNavigate();
  const cachedPerformance = pageCache.get<PerformanceResponse>(PERFORMANCE_CACHE_KEY);
  const [performance, setPerformance] = useState<PerformanceResponse | null>(cachedPerformance ?? null);
  const [isLoading, setIsLoading] = useState(!cachedPerformance);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [diaryRequired, setDiaryRequired] = useState(false);

  const [rating, setRating] = useState<GroupRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSubject, setRatingSubject] = useState<string | null>(null);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [participationPending, setParticipationPending] = useState(false);

  const loadPerformance = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(!pageCache.get(PERFORMANCE_CACHE_KEY));
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
  }, []);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  /** Small icon-button refresh: recompute average from the diary → save to DB → reload. */
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const response = await gradesApi.refresh();
      if (!response.data?.averageMark) {
        toast.error('Дневник не вернул данные для пересчёта');
      } else {
        toast.success(`Средний балл обновлён: ${response.data.averageMark.toFixed(2)}`);
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string; code?: string } } };
      if (e.response?.data?.code === 'diary_required') {
        toast.error('Сначала привяжите электронный дневник');
      } else {
        toast.error(e.response?.data?.message || 'Не удалось обновить средний балл');
      }
      return;
    } finally {
      setIsRefreshing(false);
    }
    // Fresh diary data: drop the cached overview and reload everything.
    await loadPerformance({ silent: true });
  };

  // ------- rating (lazy: loads on first expand, stays untouched afterwards) -------
  const loadRating = useCallback(async (subject: string | null) => {
    setRatingLoading(true);
    try {
      const response = await ratingApi.getGroup(subject);
      setRating(response.data);
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Не удалось загрузить рейтинг группы');
    } finally {
      setRatingLoading(false);
    }
  }, []);

  const toggleRating = () => {
    const next = !ratingOpen;
    setRatingOpen(next);
    setShowAllRanking(false);
    if (next && !rating && !ratingLoading) void loadRating(ratingSubject);
  };

  const selectRatingSubject = (subject: string | null) => {
    setRatingSubject(subject);
    setShowAllRanking(false);
    void loadRating(subject);
  };

  const toggleParticipation = async () => {
    if (!rating || participationPending) return;
    setParticipationPending(true);
    try {
      await ratingApi.participate(!rating.optedIn);
      await loadRating(ratingSubject);
    } catch {
      toast.error('Не удалось изменить участие в рейтинге');
    } finally {
      setParticipationPending(false);
    }
  };

  const subjects = useMemo(() => subjectsWithMarks(performance), [performance]);
  const totalSeries = useMemo(() => buildAverageSeries(performance), [performance]);
  const average = useMemo(() => overallAverage(performance), [performance]);
  const dayIndex = useMemo(() => buildDayIndex(performance), [performance]);
  const marksCount = useMemo(
    () => subjects.reduce((sum, s) => sum + s.daysWithMarks.reduce((n, d) => n + d.markValues.length, 0), 0),
    [subjects],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24" />
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
    <div className="space-y-6">
      {/* Header: big live average + tiny manual refresh icon */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Оценки</h1>
          <p className="text-dark-textMuted text-sm">
            Оценок за период: {marksCount}
            {average != null && <> · средний балл&nbsp;<span className="text-dark-text font-semibold">{average.toFixed(2)}</span></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className={`w-10 h-10 rounded-full border border-dark-border bg-dark-card flex items-center justify-center text-dark-textMuted hover:text-primary-400 hover:border-primary-500/40 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
          title="Обновить средний балл из дневника"
          aria-label="Обновить средний балл из дневника"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Average tall trend chart */}
      <Card variant="hover">
        <CardHeader>
          <CardTitle>Средний балл по дням</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkTrendChart points={totalSeries} height={200} />
        </CardContent>
      </Card>

      {/* Horizontal scroll of subject chips with their own sparkline pages */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dark-textMuted">Предметы</h2>
          <span className="text-xs text-dark-textMuted">листайте →</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {subjects.map((subject) => {
            const color =
              subject.averageMark >= 4.5 ? 'bg-emerald-500/20 text-emerald-400'
              : subject.averageMark >= 3.5 ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400';
            const count = subject.daysWithMarks.reduce((n, d) => n + d.markValues.length, 0);
            return (
              <button
                key={subject.subjectName}
                type="button"
                onClick={() => navigate(`/grades/subject?subject=${encodeURIComponent(subject.subjectName)}`)}
                className="snap-start flex-shrink-0 max-w-[190px] rounded-xl border border-dark-border bg-dark-card px-3 py-2.5 text-left hover:border-primary-500/40 transition-colors"
                title={`${subject.subjectName} — средний балл ${subject.averageMark.toFixed(2)}`}
              >
                <p className="text-sm font-medium text-dark-text truncate">{subject.subjectName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
                    {subject.averageMark.toFixed(2)}
                  </span>
                  <span className="text-xs text-dark-textMuted">{count} оценок</span>
                </div>
              </button>
            );
          })}
          {subjects.length === 0 && (
            <p className="text-sm text-dark-textMuted">Нет оценок в текущем периоде</p>
          )}
        </div>
      </div>

      {/* Group rating, lazy section */}
      <div>
        <button
          type="button"
          onClick={toggleRating}
          className="w-full flex items-center justify-between rounded-xl border border-dark-border bg-dark-card px-4 py-3 text-left hover:border-primary-500/30 transition-colors"
        >
          <span className="font-medium text-dark-text">Рейтинг группы{rating?.groupName ? ` — ${rating.groupName}` : ''}</span>
          <span className={`text-dark-textMuted transition-transform ${ratingOpen ? 'rotate-180' : ''}`}>⌄</span>
        </button>

        {ratingOpen && (
          <div className="mt-3">
            {ratingLoading && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
              </div>
            )}
            {!ratingLoading && rating && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <select
                    value={ratingSubject ?? ''}
                    onChange={(e) => selectRatingSubject(e.target.value || null)}
                    className="input w-auto max-w-full"
                    aria-label="Предмет рейтинга"
                  >
                    <option value="">Общий рейтинг</option>
                    {rating.subjects.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                  <Button
                    variant={rating.optedIn ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => void toggleParticipation()}
                    loading={participationPending}
                  >
                    {rating.optedIn ? 'Выйти из рейтинга' : 'Участвовать'}
                  </Button>
                </div>

                {rating.entries.length === 0 ? (
                  <Card variant="hover" className="text-center py-8">
                    <p className="text-dark-textMuted">
                      {rating.optedIn ? 'В рейтинге пока нет участников с оценками' : 'Пока никто не участвует в рейтинге'}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {(showAllRanking ? rating.entries : rating.entries.slice(0, 5)).map((entry, index) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                          entry.isCurrentUser ? 'border-primary-500/40 bg-primary-500/10' : 'border-dark-border bg-dark-bg'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            index === 0 ? 'bg-amber-500/20 text-amber-400'
                              : index === 1 ? 'bg-slate-400/20 text-slate-300'
                              : index === 2 ? 'bg-orange-600/20 text-orange-400'
                              : 'bg-dark-border text-dark-textMuted'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-dark-text">{entry.displayName}</span>
                        {entry.isCurrentUser && <Badge variant="primary">Это вы</Badge>}
                        <span className="text-sm font-semibold text-dark-textMuted shrink-0">
                          {entry.averageMark != null ? entry.averageMark.toFixed(2) : '—'}
                        </span>
                      </div>
                    ))}
                    {rating.entries.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllRanking((v) => !v)}
                        className="w-full rounded-xl border border-dark-border bg-dark-bg px-4 py-2 text-sm text-dark-textMuted transition-colors hover:text-dark-text"
                      >
                        {showAllRanking ? 'Свернуть' : `Показать весь рейтинг (${rating.entries.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Calendar of all grades */}
      <Card variant="hover">
        <CardHeader>
          <CardTitle>Календарь оценок</CardTitle>
        </CardHeader>
        <CardContent>
          <GradeCalendar dayIndex={dayIndex} />
        </CardContent>
      </Card>
    </div>
  );
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { gradesApi, ratingApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { DiaryRequiredNotice } from '../../components/DiaryRequiredNotice';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { MarkTrendChart } from '../../components/grades/MarkTrendChart';
import { GradeCalendar, type CalendarDayEntry } from '../../components/grades/GradeCalendar';
import { pageCache } from '../../utils/pageCache';
import { FunLoader } from '../../components/ambient/FunLoader';
import { GRADES } from '../../components/ambient/loadPhrases';
import {
  buildAverageSeries,
  buildDayIndex,
  subjectsWithMarks,
} from '../../utils/gradeCalendar';
import type { GroupRating, PerformanceResponse } from '../../types';

const PERFORMANCE_CACHE_KEY = 'performance:overview';

export function GradesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const cachedPerformance = pageCache.get<PerformanceResponse>(PERFORMANCE_CACHE_KEY);
  const [performance, setPerformance] = useState<PerformanceResponse | null>(cachedPerformance ?? null);
  const [isLoading, setIsLoading] = useState(!cachedPerformance);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Выбранный предмет — состояние той же страницы: дизайн не меняется,
  // подставляется только график и календарь.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(() => searchParams.get('subject'));

  const [rating, setRating] = useState<GroupRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSubject, setRatingSubject] = useState<string | null>(null);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [participationPending, setParticipationPending] = useState(false);

  // Без привязки к дневнику оценки достать неоткуда: показываем пояснение
  // вместо пустых данных (админы — исключение, им оценки не тренирует дневник).
  const noDiary = !!user && user.role !== 'Admin' && user.hasDiaryLink === false;

  const loadPerformance = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(!pageCache.get(PERFORMANCE_CACHE_KEY));
    try {
      const res = await gradesApi.getPerformance();
      pageCache.set(PERFORMANCE_CACHE_KEY, res.data);
      setPerformance(res.data);
      setError('');
    } catch (err: any) {
      if (err.response?.status === 502) {
        setError('Сервис дневника недоступен. Попробуйте позже');
      } else if (err.response?.status !== 403) {
        setError(err.response?.data?.message || 'Не удалось загрузить оценки');
      }
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await gradesApi.refresh();
      await loadPerformance({ silent: true });
      toast.success('Оценки обновлены из дневника');
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.data?.code === 'diary_required') {
        toast.error('Сначала привяжите электронный дневник в профиле');
      } else if (err.response?.status === 502) {
        toast.error('Сервис дневника недоступен');
      } else {
        toast.error(err.response?.data?.message || 'Не удалось обновить оценки');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadRating = async (subject: string | null) => {
    setRatingLoading(true);
    try {
      const res = await ratingApi.getGroup(subject);
      setRating(res.data);
    } catch {
      setRating(null);
    } finally {
      setRatingLoading(false);
    }
  };

  const toggleRating = async () => {
    if (!ratingOpen && rating === null) await loadRating(null);
    setRatingOpen((open) => !open);
  };

  const selectRatingSubject = async (subject: string | null) => {
    setRatingSubject(subject);
    await loadRating(subject);
  };

  const toggleParticipation = async () => {
    if (!rating) return;
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
  const dayIndex = useMemo(() => buildDayIndex(performance), [performance]);

  const selectedEntry = subjects.find((s) => s.subjectName === selectedSubject) ?? null;
  const subjectSeries = useMemo(
    () => (selectedEntry ? buildAverageSeries(performance, selectedEntry) : null),
    [performance, selectedEntry],
  );
  const subjectDayIndex = useMemo(() => {
    if (!selectedSubject) return dayIndex;
    const filtered: Map<string, CalendarDayEntry[]> = new Map();
    for (const [day, entries] of dayIndex) {
      const mine = entries.filter((e) => e.subjectName === selectedSubject);
      if (mine.length > 0) filtered.set(day, mine);
    }
    return filtered;
  }, [dayIndex, selectedSubject]);

  const marksCount = useMemo(
    () => selectedEntry
      ? selectedEntry.daysWithMarks.reduce((sum, s) => sum + s.markValues.length, 0)
      : subjects.reduce((sum, s) => sum + s.daysWithMarks.reduce((n, d) => n + d.markValues.length, 0), 0),
    [subjects, selectedEntry],
  );

  if (noDiary) {
    return (
      <div className="max-w-xl mx-auto">
        <DiaryRequiredNotice
          title="Оценки живут в дневнике"
          text="Без привязки к электронному дневнику мы не можем достать ваши оценки. Привяжите дневник в профиле — и здесь появятся календарь с оценками, средний балл и график.Да, это точно никуда не идет, кому нужны ваши оценки?"
          buttonLabel="Привязать дневник"
        />
      </div>
    );
  }

  if (isLoading) {
    return <FunLoader pool={GRADES} label="Загрузка оценок" />;
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
            {selectedEntry && selectedEntry.averageMark != null && (
              <> · по предмету&nbsp;<span className="text-dark-text font-semibold">{selectedEntry.averageMark.toFixed(2)}</span></>
            )}
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

      {/* Average tall trend chart — общий или по выбранному предмету */}
      <Card variant="hover">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="truncate">
              {selectedEntry ? `Средний балл — ${selectedEntry.subjectName}` : 'Средний балл по дням'}
            </span>
            {selectedEntry && (
              <Badge
                variant={selectedEntry.averageMark >= 4.5 ? 'success' : selectedEntry.averageMark >= 3.5 ? 'warning' : 'danger'}
              >
                {selectedEntry.averageMark.toFixed(2)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarkTrendChart
            key={selectedEntry ? selectedEntry.subjectName : 'all'}
            points={selectedEntry ? (subjectSeries ?? []) : buildAverageSeries(performance)}
            height={200}
          />
          
        </CardContent>
      </Card>

      {/* Horizontal scroll of subject chips; клик остаётся на этой странице */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dark-textMuted">Предметы</h2>
          <span className="text-xs text-dark-textMuted">листайте →</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {subjects.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedSubject(null)}
              className={`snap-start flex-shrink-0 self-stretch rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                !selectedEntry
                  ? 'border-primary-500/60 bg-primary-500/10 text-primary-300'
                  : 'border-dark-border bg-dark-card text-dark-textMuted hover:border-primary-500/40'
              }`}
              aria-label="Показать все предметы"
            >
              По всем предметам
            </button>
          )}
          {subjects.map((subject) => {
            const color =
              subject.averageMark >= 4.5 ? 'bg-emerald-500/20 text-emerald-400'
              : subject.averageMark >= 3.5 ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400';
            const count = subject.daysWithMarks.reduce((n, d) => n + d.markValues.length, 0);
            const active = selectedEntry?.subjectName === subject.subjectName;
            return (
              <button
                key={subject.subjectName}
                type="button"
                onClick={() => setSelectedSubject((current) => (current === subject.subjectName ? null : subject.subjectName))}
                className={`snap-start flex-shrink-0 max-w-[190px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-primary-500/60 bg-primary-500/10'
                    : 'border-dark-border bg-dark-card hover:border-primary-500/40'
                }`}
                title={`${subject.subjectName} — средний балл ${subject.averageMark.toFixed(2)}`}
                aria-pressed={active}
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

      {/* Календарь оценок — цифры оценок прямо в днях */}
      <Card variant="hover">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Календарь {selectedEntry ? `— ${selectedEntry.subjectName}` : 'оценок'}</span>
            <span className="flex items-center gap-2 text-[11px] font-normal text-dark-textMuted">
              <span className="text-emerald-400">5</span>
              <span className="text-amber-400">4</span>
              <span className="text-orange-400">3</span>
              <span className="text-red-400">2</span>
              <span className="text-sky-400">Н(ув.)</span>
              <span className="text-red-400">Н(неув.)</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GradeCalendar dayIndex={subjectDayIndex} />
        </CardContent>
      </Card>
    </div>
  );
}

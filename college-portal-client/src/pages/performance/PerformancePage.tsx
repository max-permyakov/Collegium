import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { gradesApi, ratingApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { getMarkValue, getMarkVariant, getRecentMarks } from '../../utils/performance';
import { formatMoscowDate } from '../../utils/datetime';
import type { GroupRating, PerformanceResponse, SubjectPerformance } from '../../types';

const formatDate = (dateStr: string): string =>
  formatMoscowDate(dateStr, { day: 'numeric', month: 'long', year: 'numeric' });

const averageClasses = (avg: number) => {
  if (avg >= 4.5) return 'bg-green-500/20 text-green-400';
  if (avg >= 3.5) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
};

const positionClasses = (position: number) => {
  if (position === 1) return 'bg-amber-500/20 text-amber-400';
  if (position === 2) return 'bg-slate-400/20 text-slate-300';
  if (position === 3) return 'bg-orange-600/20 text-orange-400';
  return 'bg-dark-border text-dark-textMuted';
};

const totalMarks = (subject: SubjectPerformance) =>
  subject.daysWithMarks.reduce((sum, d) => sum + d.markValues.length, 0);

export function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(() => searchParams.get('subject'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState<GroupRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingSubject, setRatingSubject] = useState<string | null>(null);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [participationPending, setParticipationPending] = useState(false);

  const loadPerformance = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await gradesApi.getPerformance();
      setPerformance(response.data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось загрузить успеваемость');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPerformance();
  }, []);

  const loadRating = async (subject: string | null) => {
    setRatingLoading(true);
    setRatingError('');
    try {
      const response = await ratingApi.getGroup(subject);
      setRating(response.data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setRatingError(e.response?.data?.message || 'Не удалось загрузить рейтинг группы');
    } finally {
      setRatingLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    if (value === 'rating' && !rating && !ratingLoading && !ratingError) {
      loadRating(ratingSubject);
    }
  };

  const selectRatingSubject = (subject: string | null) => {
    setRatingSubject(subject);
    setShowAllRanking(false);
    loadRating(subject);
  };

  const toggleParticipation = async () => {
    if (!rating || participationPending) return;
    setParticipationPending(true);
    try {
      await ratingApi.participate(!rating.optedIn);
      await loadRating(ratingSubject);
    } catch {
      setRatingError('Не удалось изменить участие в рейтинге');
    } finally {
      setParticipationPending(false);
    }
  };

  const subjectsWithData = useMemo(
    () => (performance?.subjects ?? []).filter((s) => s.daysWithMarks?.length > 0),
    [performance]
  );

  const activeSubject = useMemo(() => {
    if (subjectsWithData.length === 0) return null;
    const target = selectedSubject?.trim().toLowerCase();
    const found = subjectsWithData.find((s) => s.subjectName.trim().toLowerCase() === target);
    return found ?? subjectsWithData[0];
  }, [subjectsWithData, selectedSubject]);

  const selectSubject = (name: string) => {
    setSelectedSubject(name);
    setSearchParams({ subject: name }, { replace: true });
  };

  const recentMarks = useMemo(() => getRecentMarks(performance, 12), [performance]);

  const activeSubjectDays = useMemo(() => {
    if (!activeSubject) return [];
    return [...activeSubject.daysWithMarks].sort(
      (a, b) => new Date(b.day).getTime() - new Date(a.day).getTime()
    );
  }, [activeSubject]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="hover" className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Button onClick={loadPerformance}>Попробовать снова</Button>
      </Card>
    );
  }

  const visibleRankingEntries = rating
    ? showAllRanking
      ? rating.entries
      : rating.entries.slice(0, 5)
    : [];

  const hasPerformanceData = !!performance && subjectsWithData.length > 0;

  const gradedSubjects = subjectsWithData.filter((s) => totalMarks(s) > 0);
  const avgMark = gradedSubjects.length
    ? gradedSubjects.reduce((sum, s) => sum + s.averageMark, 0) / gradedSubjects.length
    : 0;
  const marksCount = gradedSubjects.reduce((sum, s) => sum + totalMarks(s), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Детальная успеваемость</h1>
        <p className="text-dark-textMuted">Оценки по дням и предметам</p>
      </div>

      <Tabs defaultValue="detailed" onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="detailed">Детальная успеваемость</TabsTrigger>
          <TabsTrigger value="recent">Последние оценки</TabsTrigger>
          <TabsTrigger value="rating">Топ 5 по группе</TabsTrigger>
        </TabsList>

        <TabsContent value="detailed">
          {hasPerformanceData && performance ? (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20 text-center">
                <p className="text-3xl font-bold text-primary-400">{performance.subjects.length}</p>
                <p className="text-sm text-dark-textMuted">Предметов всего</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-3xl font-bold text-emerald-400">{gradedSubjects.length}</p>
                <p className="text-sm text-dark-textMuted">С оценками</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-3xl font-bold text-amber-400">{marksCount}</p>
                <p className="text-sm text-dark-textMuted">Всего оценок</p>
              </div>
              <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-center">
                <p className="text-3xl font-bold text-violet-400">{avgMark.toFixed(2)}</p>
                <p className="text-sm text-dark-textMuted">Средний балл</p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Предметы</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {subjectsWithData.map((subject) => {
                    const isActive = activeSubject?.subjectName === subject.subjectName;
                    return (
                      <button
                        key={subject.subjectName}
                        type="button"
                        onClick={() => selectSubject(subject.subjectName)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-500/20 border-primary-500/40 text-primary-300'
                            : 'bg-dark-bg border-dark-border text-dark-textMuted hover:border-primary-500/30 hover:text-dark-text'
                        }`}
                      >
                        <span className="font-medium max-w-[180px] truncate">{subject.subjectName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${averageClasses(subject.averageMark)}`}>
                          {subject.averageMark.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {activeSubject && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-lg font-semibold text-dark-text">{activeSubject.subjectName}</h2>
                  <Badge variant="primary">Средний балл: {activeSubject.averageMark.toFixed(2)}</Badge>
                </div>

                {activeSubjectDays.map((dayMarks, index) => (
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
                          <Badge key={`${index}-${mi}`} variant={getMarkVariant(mark)} className="px-3 py-1.5 text-base">
                            {getMarkValue(mark)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          ) : (
            <Card variant="hover" className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-dark-textMuted">Недостаточно оценок для анализа успеваемости</p>
              <p className="text-sm text-dark-textMuted mt-1">Данные появятся после первых выставленных оценок</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recent">
          <div className="space-y-3">
            <p className="text-sm text-dark-textMuted px-1">
              {recentMarks.length > 0 ? `Последние ${recentMarks.length} оценок по всем предметам` : 'Оценки по всем предметам'}
            </p>

            {recentMarks.length === 0 && (
              <Card variant="hover" className="text-center py-12">
                <p className="text-dark-textMuted">Данные появятся после первых выставленных оценок</p>
              </Card>
            )}

            {recentMarks.map((entry, index) => (
              <Card key={`${entry.subjectName}-${entry.day}-${index}`} variant="hover">
                <CardHeader className="flex flex-row items-center justify-between gap-2 mb-2">
                  <CardTitle className="text-base">{entry.subjectName}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.absenceType && (
                      <Badge variant="danger">
                        {entry.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                      </Badge>
                    )}
                    <span className="text-sm text-dark-textMuted">{formatDate(entry.day)}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {entry.markValues.map((mark, mi) => (
                      <Badge key={`${index}-${mi}`} variant={getMarkVariant(mark)} className="px-3 py-1.5 text-base">
                        {getMarkValue(mark)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rating">
          <div className="space-y-4">
            {ratingLoading && (
              <div className="space-y-4">
                <div className="skeleton h-24" />
                <div className="skeleton h-64" />
              </div>
            )}

            {ratingError && !ratingLoading && (
              <Card variant="hover" className="text-center py-10">
                <div className="text-red-400 mb-4">{ratingError}</div>
                <Button onClick={() => loadRating(ratingSubject)}>Попробовать снова</Button>
              </Card>
            )}

            {!ratingLoading && !ratingError && rating && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{rating.groupName ? `Рейтинг — ${rating.groupName}` : 'Рейтинг группы'}</CardTitle>
                      <p className="text-sm text-dark-textMuted mt-1">
                        Участников: {rating.entries.length} из {rating.groupSize}
                      </p>
                    </div>
                    <Button
                      variant={rating.optedIn ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={toggleParticipation}
                      loading={participationPending}
                    >
                      {rating.optedIn ? 'Выйти из рейтинга' : 'Участвовать в рейтинге'}
                    </Button>
                  </CardHeader>
                  {!rating.optedIn && (
                    <CardContent>
                      <p className="text-sm text-dark-textMuted">
                        Вы не участвуете в рейтинге. Нажмите «Участвовать», чтобы появиться в списке.
                      </p>
                    </CardContent>
                  )}
                </Card>

                <div className="px-1">
                  <select
                    value={ratingSubject ?? ''}
                    onChange={(e) => selectRatingSubject(e.target.value || null)}
                    className="input w-auto max-w-full"
                    aria-label="Предмет рейтинга"
                  >
                    <option value="">Общий рейтинг</option>
                    {rating.subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>

                {rating.entries.length === 0 ? (
                  <Card variant="hover" className="text-center py-10">
                    <p className="text-dark-textMuted">
                      {rating.optedIn
                        ? 'В рейтинге пока нет участников с оценками'
                        : 'Пока никто не участвует в рейтинге. Станьте первым!'}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {visibleRankingEntries.map((entry, index) => {
                      const position = index + 1;
                      return (
                        <div
                          key={entry.userId}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                            entry.isCurrentUser
                              ? 'border-primary-500/40 bg-primary-500/10'
                              : 'border-dark-border bg-dark-bg'
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${positionClasses(position)}`}
                          >
                            {position}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-dark-text">
                            {entry.displayName}
                          </span>
                          {entry.isCurrentUser && <Badge variant="primary">Это вы</Badge>}
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${
                              entry.averageMark != null
                                ? averageClasses(entry.averageMark)
                                : 'bg-dark-border text-dark-textMuted'
                            }`}
                          >
                            {entry.averageMark != null ? entry.averageMark.toFixed(2) : '—'}
                          </span>
                        </div>
                      );
                    })}

                    {rating.entries.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllRanking((v) => !v)}
                        className="w-full rounded-xl border border-dark-border bg-dark-bg px-4 py-2 text-sm text-dark-textMuted transition-colors hover:border-primary-500/30 hover:text-dark-text"
                      >
                        {showAllRanking ? 'Свернуть' : `Показать весь рейтинг (${rating.entries.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
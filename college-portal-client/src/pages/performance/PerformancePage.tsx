import { useEffect, useMemo, useState } from 'react';
import { gradesApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { getMarkValue, getMarkVariant, getRecentMarks } from '../../utils/performance';
import type { PerformanceResponse, SubjectPerformance } from '../../types';

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const averageClasses = (avg: number) => {
  if (avg >= 4.5) return 'bg-green-500/20 text-green-400';
  if (avg >= 3.5) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
};

const totalMarks = (subject: SubjectPerformance) =>
  subject.daysWithMarks.reduce((sum, d) => sum + d.markValues.length, 0);

export function PerformancePage() {
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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

  const subjectsWithData = useMemo(
    () => (performance?.subjects ?? []).filter((s) => s.daysWithMarks?.length > 0),
    [performance]
  );

  const activeSubject = useMemo(() => {
    if (subjectsWithData.length === 0) return null;
    const found = subjectsWithData.find((s) => s.subjectName === selectedSubject);
    return found ?? subjectsWithData[0];
  }, [subjectsWithData, selectedSubject]);

  const recentMarks = useMemo(() => getRecentMarks(performance, 12), [performance]);

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

  if (!performance || subjectsWithData.length === 0) {
    return (
      <Card variant="hover" className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-dark-textMuted">Недостаточно оценок для анализа успеваемости</p>
        <p className="text-sm text-dark-textMuted mt-1">Данные появятся после первых выставленных оценок</p>
      </Card>
    );
  }

  const avgMark =
    subjectsWithData.reduce((sum, s) => sum + s.averageMark, 0) / subjectsWithData.length;
  const marksCount = subjectsWithData.reduce((sum, s) => sum + totalMarks(s), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Детальная успеваемость</h1>
        <p className="text-dark-textMuted">Оценки по дням и предметам</p>
      </div>

      <Tabs defaultValue="detailed">
        <TabsList>
          <TabsTrigger value="detailed">Детальная успеваемость</TabsTrigger>
          <TabsTrigger value="recent">Последние оценки</TabsTrigger>
        </TabsList>

        <TabsContent value="detailed">
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20 text-center">
                <p className="text-3xl font-bold text-primary-400">{performance.subjects.length}</p>
                <p className="text-sm text-dark-textMuted">Предметов всего</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-3xl font-bold text-emerald-400">{subjectsWithData.length}</p>
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
                        onClick={() => setSelectedSubject(subject.subjectName)}
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

                {activeSubject.daysWithMarks.map((dayMarks, index) => (
                  <Card key={`${activeSubject.subjectName}-${index}`} variant="hover">
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
        </TabsContent>

        <TabsContent value="recent">
          <div className="space-y-3">
            <p className="text-sm text-dark-textMuted px-1">Последние {recentMarks.length} оценок по всем предметам</p>

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
      </Tabs>
    </div>
  );
}
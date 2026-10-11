import { useEffect, useState } from 'react';
import { gradesApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import type { PerformanceResponse } from '../../types';

export function PerformancePage() {
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const _formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
  };

  const _getMarkColor = (mark: string) => {
    switch (mark) {
      case 'Five': return 'success';
      case 'Four': return 'warning';
      case 'Three': return 'danger';
      case 'Two': return 'danger';
      default: return 'default';
    }
  };

  const _getMarkValue = (mark: string) => {
    switch (mark) {
      case 'Five': return '5';
      case 'Four': return '4';
      case 'Three': return '3';
      case 'Two': return '2';
      default: return mark;
    }
  };

  const loadPerformance = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await gradesApi.getPerformance();
      setPerformance(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось загрузить успеваемость');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPerformance();
  }, []);

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

  if (!performance || !performance.subjects?.length) {
    return (
      <Card variant="hover" className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-dark-textMuted">Нет данных об успеваемости</p>
      </Card>
    );
  }

  const subjectsWithData = performance.subjects.filter(s => s.daysWithMarks && s.daysWithMarks.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Детальная успеваемость</h1>
          <p className="text-dark-textMuted">Оценки по дням и предметам</p>
        </div>
      </div>

      <Card variant="hover">
        <CardHeader>
          <CardTitle>Предметы</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={subjectsWithData[0]?.subjectName || ''} onValueChange={setSelectedSubject}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-1">
              {subjectsWithData.map((subject) => (
                <TabsTrigger key={subject.subjectName} value={subject.subjectName} className="px-3 py-2 text-sm">
                  <div className="text-center">
                    <p className="font-medium truncate">{subject.subjectName}</p>
                    <Badge variant={subject.averageMark >= 4.5 ? 'success' : subject.averageMark >= 3.5 ? 'warning' : 'danger'} className="mt-1">
                      {subject.averageMark.toFixed(2)}
                    </Badge>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {selectedSubject && (
              <TabsContent value={selectedSubject}>
                {performance.subjects.find(s => s.subjectName === selectedSubject)?.daysWithMarks.map((dayMarks, index) => (
                  <Card key={`${selectedSubject}-${index}`} variant="hover" className="mb-3">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{_formatDate(dayMarks.day)}</CardTitle>
                      <div className="flex items-center gap-2">
                        {dayMarks.absenceType && (
                          <Badge variant="danger">{dayMarks.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}</Badge>
                        )}
                        <Badge variant="primary">{dayMarks.markValues.length} оценок</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {dayMarks.markValues.map((mark, mi) => (
                          <Badge key={`${selectedSubject}-${index}-${mi}`} variant={_getMarkColor(mark)} className="px-3 py-1.5 text-base">
                            {_getMarkValue(mark)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            )}
            {!selectedSubject && subjectsWithData.length > 0 && (
              <TabsContent value={subjectsWithData[0].subjectName}>
                {performance.subjects.find(s => s.subjectName === subjectsWithData[0].subjectName)?.daysWithMarks.map((dayMarks, index) => (
                  <Card key={`${subjectsWithData[0].subjectName}-${index}`} variant="hover" className="mb-3">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{_formatDate(dayMarks.day)}</CardTitle>
                      <div className="flex items-center gap-2">
                        {dayMarks.absenceType && (
                          <Badge variant="danger">{dayMarks.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}</Badge>
                        )}
                        <Badge variant="primary">{dayMarks.markValues.length} оценок</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {dayMarks.markValues.map((mark, mi) => (
                          <Badge key={`${subjectsWithData[0].subjectName}-${index}-${mi}`} variant={_getMarkColor(mark)} className="px-3 py-1.5 text-base">
                            {_getMarkValue(mark)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <Card variant="hover">
        <CardHeader>
          <CardTitle>Общая статистика</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20 text-center">
              <p className="text-3xl font-bold text-primary-400">{performance.subjects.length}</p>
              <p className="text-sm text-dark-textMuted">Предметов всего</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-3xl font-bold text-emerald-400">{subjectsWithData.length}</p>
              <p className="text-sm text-dark-textMuted">С оценками</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-3xl font-bold text-amber-400">
                {performance.subjects.reduce((sum, s) => sum + (s.daysWithMarks?.length || 0), 0)}
              </p>
              <p className="text-sm text-dark-textMuted">Всего оценок</p>
            </div>
            <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-center">
              <p className="text-3xl font-bold text-violet-400">
                {performance.subjects.length > 0
                  ? (performance.subjects.reduce((sum, s) => sum + s.averageMark, 0) / performance.subjects.length).toFixed(2)
                  : '—'}
              </p>
              <p className="text-sm text-dark-textMuted">Средний балл</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
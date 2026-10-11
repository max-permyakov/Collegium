import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gradesApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import type { SubjectGrade } from '../../types';

export function GradesPage() {
  const [grades, setGrades] = useState<SubjectGrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadGrades = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await gradesApi.getGrades();
      setGrades(response.data?.subjects || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось загрузить оценки');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGrades();
  }, []);

  const _getGradeColor = (mark: number) => {
    if (mark >= 4.5) return 'success';
    if (mark >= 3.5) return 'warning';
    return 'danger';
  };

  const _getGradeLabel = (mark: number) => {
    if (mark >= 4.5) return 'Отлично';
    if (mark >= 3.5) return 'Хорошо';
    if (mark >= 2.5) return 'Удовл.';
    return 'Неудовл.';
  };

  const averageMark = grades.length > 0
    ? (grades.reduce((sum, s) => sum + s.averageMark, 0) / grades.length).toFixed(2)
    : '—';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="hover" className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Button onClick={loadGrades}>Попробовать снова</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Мои оценки</h1>
          <p className="text-dark-textMuted">Средние баллы по предметам за текущий период</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary-500/20 flex items-center justify-center">
            <span className="text-3xl font-bold text-primary-400">{averageMark}</span>
          </div>
          <div>
            <p className="text-sm text-dark-textMuted">Средний балл</p>
            <p className="text-2xl font-bold text-dark-text">{averageMark}</p>
          </div>
        </div>
      </div>

      <Card variant="hover">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Предметы</CardTitle>
          <div className="flex items-center gap-2 text-sm text-dark-textMuted">
            <span>Предметов: {grades.length}</span>
          </div>
        </CardHeader>
        <CardContent>
          {grades.length > 0 ? (
            <div className="space-y-2">
              {grades.map((subject) => (
                <Link key={subject.id} to="/performance" className="block">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark-text truncate">{subject.name}</p>
                      <p className="text-sm text-dark-textMuted mt-0.5">ID предмета: {subject.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={_getGradeColor(subject.averageMark)}>
                        {subject.averageMark.toFixed(2)}
                      </Badge>
                      <Badge variant="default">{_getGradeLabel(subject.averageMark)}</Badge>
                      <svg className="w-5 h-5 text-dark-textMuted group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-dark-textMuted">Нет данных об оценках</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Link to="/performance">
            <Button variant="primary" className="w-full sm:w-auto">Подробная успеваемость</Button>
          </Link>
        </CardFooter>
      </Card>

      <Card variant="hover">
        <CardHeader>
          <CardTitle>Легенда</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <Badge variant="success">4.50 - 5.00</Badge>
              <span className="text-sm text-dark-text">Отлично</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Badge variant="warning">3.50 - 4.49</Badge>
              <span className="text-sm text-dark-text">Хорошо</span>
            </div>
            <div className="flex items_center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <Badge variant="danger">0 - 3.49</Badge>
              <span className="text-sm text-dark-text">Удовл. / Неудовл.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assignmentsApi } from '../../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatMoscowDate } from '../../utils/datetime';
import type { AssignmentListItem } from '../../types';

export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'overdue'>('all');

  const loadAssignments = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await assignmentsApi.getMyAssignments();
      setAssignments(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось загрузить задания');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const filteredAssignments = assignments.filter(a => {
    const isOverdue = new Date(a.dueAt) < new Date();
    if (filter === 'active') return !isOverdue;
    if (filter === 'overdue') return isOverdue;
    return true;
  });

  const _formatDate = (dateStr: string) =>
    formatMoscowDate(dateStr, { day: 'numeric', month: 'short', weekday: 'short' });

  const _getDaysLeft = (dueAt: string) => {
    const due = new Date(dueAt);
    const now = new Date();
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="hover" className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Button onClick={loadAssignments}>Попробовать снова</Button>
      </Card>
    );
  }

  const stats = {
    total: assignments.length,
    active: assignments.filter(a => new Date(a.dueAt) >= new Date()).length,
    overdue: assignments.filter(a => new Date(a.dueAt) < new Date()).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Мои задания</h1>
          <p className="text-dark-textMuted">Список заданий по вашей группе</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="input appearance-none w-auto"
            aria-label="Фильтр заданий"
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="overdue">Просроченные</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card variant="hover" className="p-4 text-center">
          <p className="text-2xl font-bold text-dark-text">{stats.total}</p>
          <p className="text-sm text-dark-textMuted">Всего заданий</p>
        </Card>
        <Card variant="hover" className="p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
          <p className="text-sm text-dark-textMuted">Активных</p>
        </Card>
        <Card variant="hover" className="p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.overdue}</p>
          <p className="text-sm text-dark-textMuted">Просроченных</p>
        </Card>
      </div>

      <Card variant="hover">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Задания ({filteredAssignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length > 0 ? (
            <div className="space-y-2">
              {filteredAssignments.map((assignment) => {
                const isOverdue = new Date(assignment.dueAt) < new Date();
                const daysLeft = _getDaysLeft(assignment.dueAt);

                return (
                  <Link key={assignment.id} to="/assignments" className="block">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-dark-bg border border-dark-border hover:border-primary-500/50 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-dark-text truncate">{assignment.title}</h3>
                          <Badge variant={isOverdue ? 'danger' : daysLeft <= 2 ? 'warning' : 'success'}>
                            {isOverdue ? 'Просрочено' : daysLeft <= 2 ? `${daysLeft} дн.` : 'Активно'}
                          </Badge>
                        </div>
                        <p className="text-sm text-dark-textMuted line-clamp-2">{assignment.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-dark-textMuted">
                          <span>📚 {assignment.studyGroupName}</span>
                          <span>👨‍🏫 {assignment.createdByName}</span>
                          <span>📅 {_formatDate(assignment.dueAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="primary" className="text-sm">{_getDaysLeft(assignment.dueAt) > 0 ? `${daysLeft} дн.` : 'Просрочено'}</Badge>
                        <svg className="w-5 h-5 text-dark-textMuted group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-dark-textMuted mb-4">
                {filter === 'all' ? 'Заданий пока нет' : filter === 'active' ? 'Нет активных заданий' : 'Нет просроченных заданий'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
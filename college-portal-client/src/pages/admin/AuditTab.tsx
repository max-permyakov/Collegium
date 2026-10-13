import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatMoscowDateTime } from '../../utils/datetime';
import type { AuditLogDto } from '../../types/admin';

const actionLabels: Record<string, string> = {
  SetRole: 'Изменение роли',
  SetIsActive: 'Бан / разбан',
  SetHeadman: 'Староста / зам',
  Block: 'Блокировка',
  Unblock: 'Разблокировка',
  RecomputeGrades: 'Пересчёт оценок',
};

function formatDateTime(value: string) {
  return formatMoscowDateTime(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AuditTab() {
  const { data, isLoading, error } = useQuery<AuditLogDto[]>({
    queryKey: ['admin', 'audit'],
    queryFn: async () => (await adminApi.getAudit(200)).data,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-14" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card variant="hover" className="text-center py-12">
        <p className="text-red-400">Не удалось загрузить журнал аудита</p>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card variant="hover" className="text-center py-12">
        <p className="text-dark-textMuted">Журнал пуст</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((log) => (
        <Card key={log.id} variant="hover">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="info">{actionLabels[log.action] || log.action}</Badge>
                <span className="text-sm text-dark-text">{log.adminName}</span>
                {log.targetName && (
                  <>
                    <span className="text-dark-textMuted">→</span>
                    <span className="text-sm text-dark-text">{log.targetName}</span>
                  </>
                )}
              </div>
              <span className="text-xs text-dark-textMuted whitespace-nowrap">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            {log.details && <p className="text-sm text-dark-textMuted mt-2">{log.details}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

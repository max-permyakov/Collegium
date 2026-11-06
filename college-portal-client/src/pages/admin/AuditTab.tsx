import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatMoscowDateTime } from '../../utils/datetime';
import { shortName } from '../../utils/names';
import type { AuditLogDto } from '../../types/admin';
import { FunLoader } from '../../components/ambient/FunLoader';
import { ADMIN } from '../../components/ambient/loadPhrases';

const actionLabels: Record<string, string> = {
  SetRole: 'Изменение роли',
  SetIsActive: 'Бан / разбан',
  SetHeadman: 'Староста / зам',
  Block: 'Блокировка',
  Unblock: 'Разблокировка',
  RecomputeGrades: 'Пересчёт оценок',
  'diary-nonstudent-login': '⚠ Вход без студенческой роли',
};

/** Разбор Details записи о не-студентном входе через дневник. */
interface NonStudentDetails {
  reason?: string;
  displayName?: string;
  portalEmail?: string | null;
  diaryLogin?: string;
  diaryPasswordHash?: string;
  organization?: string;
}

function parseNonStudent(details: string): NonStudentDetails | null {
  try {
    const parsed = JSON.parse(details) as NonStudentDetails;
    return typeof parsed.diaryLogin === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

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
    return <FunLoader pool={ADMIN} label="Загрузка журнала аудита" />;
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
        <Card key={log.id} variant="hover" className={log.action === 'diary-nonstudent-login' ? 'border-red-500/40' : undefined}>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={log.action === 'diary-nonstudent-login' ? 'danger' : 'info'}>
                  {actionLabels[log.action] || log.action}
                </Badge>
                <span className="text-sm text-dark-text">{shortName(log.adminName)}</span>
                {log.targetName && (
                  <>
                    <span className="text-dark-textMuted">→</span>
                    <span className="text-sm text-dark-text">{shortName(log.targetName)}</span>
                  </>
                )}
              </div>
              <span className="text-xs text-dark-textMuted whitespace-nowrap">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            {(() => {
              if (log.action === 'diary-nonstudent-login') {
                const nd = parseNonStudent(log.details);
                if (nd) {
                  return (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-red-400 text-xs">{nd.reason}</p>
                      <p className="text-dark-text text-xs font-mono">
                        ФИО в дневнике/портале: {nd.displayName || '—'}
                      </p>
                      {nd.portalEmail && (
                        <p className="text-dark-text text-xs font-mono">почта портала: {nd.portalEmail}</p>
                      )}
                      <p className="text-dark-text text-xs font-mono">
                        логин дневника: {nd.diaryLogin}
                      </p>
                      <p className="text-dark-text text-[11px] font-mono break-all">
                        хеш пароля (SHA-256): {nd.diaryPasswordHash || '—'}
                      </p>
                      {nd.organization && (
                        <p className="text-dark-textMuted text-xs">организация: {nd.organization}</p>
                      )}
                    </div>
                  );
                }
              }
              return log.details ? <p className="text-sm text-dark-textMuted mt-2">{log.details}</p> : null;
            })()}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import type { AuditoriumDto } from '../../types';
import { Badge } from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';

interface AuditoriumPanelProps {
  auditorium: AuditoriumDto | null;
}

export function AuditoriumPanel({ auditorium }: AuditoriumPanelProps) {
  if (!auditorium) {
    return (
      <Card variant="hover" className="text-center py-10">
        <CardContent>
          <p className="text-dark-textMuted text-sm">
            Выберите аудиторию на карте или найдите её через поиск.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="hover">
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-dark-text">Аудитория {auditorium.number}</h2>
            {auditorium.hasComputers && <Badge variant="info">🖥 С компьютерами</Badge>}
          </div>
          {auditorium.displayName && (
            <p className="text-dark-textMuted text-sm mt-0.5">{auditorium.displayName}</p>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-dark-textMuted w-24 shrink-0">Корпус</span>
            <span className="text-dark-text">{auditorium.buildingName}</span>
          </div>
          {auditorium.floor != null && (
            <div className="flex items-start gap-2">
              <span className="text-dark-textMuted w-24 shrink-0">Этаж</span>
              <span className="text-dark-text">{auditorium.floor}</span>
            </div>
          )}
          {auditorium.locationHint && (
            <div className="flex items-start gap-2">
              <span className="text-dark-textMuted w-24 shrink-0">Ориентир</span>
              <span className="text-dark-text">{auditorium.locationHint}</span>
            </div>
          )}
        </div>

        {auditorium.disciplines.length > 0 && (
          <div>
            <p className="text-sm font-medium text-dark-text mb-1.5">Дисциплины</p>
            <div className="flex flex-wrap gap-1.5">
              {auditorium.disciplines.map((d) => (
                <Badge key={d} variant="primary">{d}</Badge>
              ))}
            </div>
          </div>
        )}

        {auditorium.teachers.length > 0 && (
          <div>
            <p className="text-sm font-medium text-dark-text mb-1.5">Преподаватели</p>
            <div className="space-y-1.5">
              {auditorium.teachers.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-dark-text">{t.fullName}</span>
                  {t.position && <span className="text-xs text-dark-textMuted">{t.position}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {auditorium.disciplines.length === 0 && auditorium.teachers.length === 0 && (
          <p className="text-xs text-dark-textMuted">Дисциплины и преподаватели не привязаны.</p>
        )}
      </CardContent>
    </Card>
  );
}

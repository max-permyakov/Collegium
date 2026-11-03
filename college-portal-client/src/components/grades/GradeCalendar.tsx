import { useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { getMarkVariant, getMarkValue } from '../../utils/performance';

export interface CalendarDayEntry {
  subjectName: string;
  markValues: string[];
  absenceType?: string;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Months that actually contain entries, as 'YYYY-MM' keys. */
function buildMonthKeys(dayIndex: Map<string, CalendarDayEntry[]>): string[] {
  const months = new Set<string>();
  for (const day of dayIndex.keys()) months.add(day.slice(0, 7));
  return [...months].sort();
}

/** Expanded ISO day display like «3 ноября, понедельник». */
const formatDayLong = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });

/**
 * Month grid with tiny per-day marks. Clicking a day with entries opens a
 * detail overlay listing every subject, its marks and any absence.
 */
export function GradeCalendar({
  dayIndex,
  compact = false,
}: {
  dayIndex: Map<string, CalendarDayEntry[]>;
  /** Renders a tighter grid for subject pages. */
  compact?: boolean;
}) {
  const monthKeys = useMemo(() => buildMonthKeys(dayIndex), [dayIndex]);
  const [monthCursor, setMonthCursor] = useState(() => (monthKeys.length ? monthKeys.length - 1 : -1));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const activeMonth = monthCursor >= 0 ? monthKeys[monthCursor] : null;

  const cells = useMemo(() => {
    if (!activeMonth) return null;
    const year = Number(activeMonth.slice(0, 4));
    const month = Number(activeMonth.slice(5, 7));
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    // Monday-first grid offset (Mon..Sun → 0..6).
    const offset = (firstDay.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const list: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < offset; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${activeMonth}-${String(day).padStart(2, '0')}`;
      list.push({ day, iso });
    }
    return list;
  }, [activeMonth]);

  const dayEntries = (iso: string): CalendarDayEntry[] => dayIndex.get(iso) ?? [];
  const dayHasAbsenceOnly = (iso: string): boolean => {
    const entries = dayEntries(iso);
    return entries.length > 0 && entries.every((e) => e.markValues.length === 0);
  };

  if (monthKeys.length === 0 || !activeMonth || !cells) {
    return (
      <div className="text-sm text-dark-textMuted text-center py-8">
        Здесь появятся оценки по дням
      </div>
    );
  }

  const openDayEntries = openDay ? dayEntries(openDay) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={monthCursor <= 0}
          onClick={() => setMonthCursor((c) => Math.max(0, c - 1))}
          aria-label="Предыдущий месяц с оценками"
        >
          ‹
        </Button>
        <p className="text-sm font-medium text-dark-text text-center">
          {MONTH_NAMES[Number(activeMonth.slice(5, 7)) - 1]} {activeMonth.slice(0, 4)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={monthCursor >= monthKeys.length - 1}
          onClick={() => setMonthCursor((c) => Math.min(monthKeys.length - 1, c + 1))}
          aria-label="Следующий месяц с оценками"
        >
          ›
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-dark-textMuted">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className={`grid grid-cols-7 ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} aria-hidden="true" />;

          const entries = dayEntries(cell.iso);
          const clickable = entries.length > 0;
          const todayIso = new Date().toISOString().slice(0, 10);
          const isToday = cell.iso === todayIso;

          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setOpenDay(cell.iso)}
              className={`rounded-lg border p-1 min-h-11 flex flex-col items-center gap-0.5 transition-colors ${
                clickable
                  ? 'border-dark-border bg-dark-bg hover:border-primary-500/40 cursor-pointer'
                  : 'border-transparent'
            } ${isToday ? 'ring-1 ring-primary-500/60' : ''}`}
              aria-label={
                clickable
                  ? `Оценки за ${cell.day} ${MONTH_NAMES[Number(activeMonth.slice(5, 7)) - 1].toLowerCase()}`
                  : cell.day
              }
            >
              <span className="text-[10px] leading-none text-dark-textMuted">{cell.day}</span>
              <span className="flex flex-wrap justify-center gap-0.5 max-w-full overflow-hidden">
                {entries.flatMap((entry, ei) =>
                  entry.markValues.slice(0, 3).map((mark, mi) => (
                    <span
                      key={`${ei}-${mi}`}
                      className={markClasses(getMarkVariant(mark))}
                    >
                      {getMarkValue(mark)}
                    </span>
                  )),
                )}
                {dayHasAbsenceOnly(cell.iso) && (
                  <span className="text-[10px] font-bold text-red-400">Н</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {openDay && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Оценки за ${formatDayLong(openDay)}`}
          onClick={() => setOpenDay(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-dark-card border border-dark-border p-4 space-y-3 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-dark-text capitalize">{formatDayLong(openDay)}</h3>
              <button
                type="button"
                onClick={() => setOpenDay(null)}
                className="text-dark-textMuted hover:text-dark-text px-2 py-1"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {openDayEntries.map((entry) => (
              <div key={entry.subjectName} className="rounded-xl border border-dark-border bg-dark-bg p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-medium text-dark-text truncate">{entry.subjectName}</p>
                  {entry.absenceType && (
                    <Badge variant="danger">
                      {entry.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                    </Badge>
                  )}
                </div>
                {entry.markValues.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.markValues.map((mark, mi) => (
                      <Badge key={mi} variant={getMarkVariant(mark)} className="px-3 py-1 text-base">
                        {getMarkValue(mark)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-dark-textMuted">В этот день только отметка о неявке</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const markClasses = (variant: keyof typeof variantClasses): string => variantClasses[variant];

const variantClasses: Record<string, string> = {
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  default: 'text-dark-textMuted',
};

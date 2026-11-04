import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMarkValue } from '../../utils/performance';

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

/** Month keys that actually contain entries, as 'YYYY-MM'. */
function buildMonthKeys(dayIndex: Map<string, CalendarDayEntry[]>): string[] {
  const months = new Set<string>();
  for (const day of dayIndex.keys()) months.add(day.slice(0, 7));
  return [...months].sort();
}

/** Monday-first week start of an ISO date, as 'YYYY-MM-DD'. */
const weekStartOfISO = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
};

/** Цвет цифры оценки: 5 зелёный, 4 жёлтый, 3 оранжевый, 2 красный. */
export function markDigitClass(mark: string): string {
  switch (mark) {
    case 'Five': return 'text-emerald-400';
    case 'Four': return 'text-amber-400';
    case 'Three': return 'text-orange-400';
    case 'Two': return 'text-red-400';
    default: return 'text-dark-textMuted';
  }
}

/** Цвет отметки о неявке: по уважительной — синий, неуважительной — красный. */
export function absenceClass(absenceType?: string): string {
  return absenceType === 'IsAbsentByNotValidReason' ? 'text-red-400' : 'text-sky-400';
}

/**
 * Месячная сетка оценок: в каждой клетке сверху число, под ним — маленькие
 * цветные цифры оценок этого дня (и «Н» для неявок). Клик по любому дню
 * открывает его на странице расписания, где оценки и неявки показаны
 * рядом с уроками.
 */
export function GradeCalendar({
  dayIndex,
  onDayClick,
}: {
  dayIndex: Map<string, CalendarDayEntry[]>;
  /** Переопределяет переход на расписание (например, для тестов). */
  onDayClick?: (iso: string) => void;
}) {
  const navigate = useNavigate();
  const dataMonths = useMemo(() => buildMonthKeys(dayIndex), [dayIndex]);

  const [monthCursor, setMonthCursor] = useState<number>(() => (dataMonths.length ? dataMonths.length - 1 : -1));

  // Если за период совсем нет оценок — показываем текущий месяц, чтобы
  // календарь оставался доступным (клик по любому дню ведёт в расписание).
  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = dataMonths.length > 0 ? dataMonths : [currentMonth];
  const cursor = monthCursor >= 0 && monthCursor < months.length ? monthCursor : months.length - 1;
  const activeMonth = months[cursor];

  const cells = useMemo(() => {
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

  const handleDayClick = (iso: string) => {
    if (onDayClick) {
      onDayClick(iso);
      return;
    }
    navigate(`/schedule?startDate=${weekStartOfISO(iso)}&highlight=${iso}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={cursor <= 0}
          onClick={() => setMonthCursor(cursor - 1)}
          className="px-2 py-1 rounded-lg text-sm text-dark-textMuted hover:text-dark-text hover:bg-dark-border/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <p className="text-sm font-medium text-dark-text text-center">
          {MONTH_NAMES[Number(activeMonth.slice(5, 7)) - 1]} {activeMonth.slice(0, 4)}
        </p>
        <button
          type="button"
          disabled={cursor >= months.length - 1}
          onClick={() => setMonthCursor(cursor + 1)}
          className="px-2 py-1 rounded-lg text-sm text-dark-textMuted hover:text-dark-text hover:bg-dark-border/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-dark-textMuted">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} aria-hidden="true" />;

          const entries = dayEntries(cell.iso);
          const todayIso = new Date().toISOString().slice(0, 10);
          const isToday = cell.iso === todayIso;
          const hasData = entries.length > 0;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => handleDayClick(cell.iso)}
              title="Открыть этот день в расписании"
              className={`rounded-lg border px-0.5 py-1 min-h-12 flex flex-col items-center gap-0.5 transition-colors ${
                hasData
                  ? 'border-dark-border bg-dark-bg hover:border-primary-500/50 hover:bg-primary-500/5 cursor-pointer'
                  : 'border-transparent hover:bg-dark-border/40 cursor-pointer'
              } ${isToday ? 'ring-1 ring-primary-500/60' : ''}`}
              aria-label={`${cell.day} ${MONTH_NAMES[Number(activeMonth.slice(5, 7)) - 1].toLowerCase()}${hasData ? ' — есть оценки' : ''}`}
            >
              <span className={`text-[11px] leading-none ${isToday ? 'text-primary-400 font-semibold' : 'text-dark-textMuted'}`}>
                {cell.day}
              </span>
              {hasData && (
                <span className="flex flex-wrap justify-center gap-0.5 max-w-full overflow-hidden leading-none">
                  {entries.flatMap((entry, ei) => {
                    const digits = entry.markValues.map((mark, mi) => (
                      <span
                        key={`m-${ei}-${mi}`}
                        className={`text-[11px] font-bold ${markDigitClass(mark)}`}
                      >
                        {getMarkValue(mark)}
                      </span>
                    ));
                    if (entry.markValues.length === 0 && entry.absenceType) {
                      digits.push(
                        <span
                          key={`a-${ei}`}
                          className={`text-[10px] font-bold ${absenceClass(entry.absenceType)}`}
                          title={entry.absenceType === 'IsAbsentByNotValidReason' ? 'Неявка (неув.)' : 'Неявка (ув.)'}
                        >
                          Н
                        </span>,
                      );
                    }
                    return digits;
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {dataMonths.length > 0 && (
        <p className="text-xs text-dark-textMuted">
          Нажмите на день, чтобы увидеть оценки и неявки в расписании
        </p>
      )}
    </div>
  );
}

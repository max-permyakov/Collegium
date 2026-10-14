export const MOSCOW_TZ = 'Europe/Moscow';

type DateInput = string | number | Date;

// yyyy-MM-dd date formatter for the Moscow time zone (en-CA yields ISO order).
const moscowIsoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MOSCOW_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatMoscowDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleDateString('ru-RU', { timeZone: MOSCOW_TZ, ...options });
}

export function formatMoscowDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleString('ru-RU', { timeZone: MOSCOW_TZ, ...options });
}

export function formatMoscowTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleTimeString('ru-RU', { timeZone: MOSCOW_TZ, ...options });
}

// yyyy-MM-dd of the given instant as seen in Moscow.
export function moscowDateISO(value: Date = new Date()): string {
  return moscowIsoFormatter.format(value);
}

// Current time in Moscow as "HH:MM:SS".
export function moscowNowTimeHMS(value: Date = new Date()): string {
  // en-GB gives HH:MM:SS in 24h format.
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MOSCOW_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

// Monday of the week containing the given instant, as yyyy-MM-dd in Moscow.
export function moscowWeekStartISO(value: Date = new Date()): string {
  const iso = moscowDateISO(value);
  const [y, m, d] = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return utc.toISOString().split('T')[0];
}

// Adds days to a yyyy-MM-dd string, returning yyyy-MM-dd.
export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().split('T')[0];
}

// Value for <input type="datetime-local"> in Moscow time: yyyy-MM-ddTHH:mm.
export function moscowDateTimeInputValue(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(value)
    .replace(', ', 'T');
}

// Moscow is UTC+3 all year round (no DST since 2014), so a <input
// type="datetime-local"> value can be converted to UTC by subtracting 3h.
export function moscowInputToUtc(value: string): string {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm)).toISOString();
}

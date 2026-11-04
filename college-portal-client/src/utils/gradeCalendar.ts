import type { PerformanceResponse, SubjectPerformance } from '../types';

export interface DayEntries {
  /** ISO date 'YYYY-MM-DD'. */
  day: string;
  subjectName: string;
  markValues: string[];
  absenceType?: string;
}

/**
 * One flat entry per subject-day: «день → все отметки по предметам».
 * `markValues` entries plus the absence type the diary reported for that day.
 */
export function buildDayIndex(performance: PerformanceResponse | null): Map<string, DayEntries[]> {
  const index = new Map<string, DayEntries[]>();
  if (!performance) return index;

  for (const subject of performance.subjects ?? []) {
    for (const day of subject.daysWithMarks ?? []) {
      const hasMarks = (day.markValues?.length ?? 0) > 0;
      if (!hasMarks && !day.absenceType) continue;
      // Дневник отдаёт полную метку времени ('2026-10-03T00:00:00.0000000Z'),
      // календарь и расписание работают с коротким ISO 'YYYY-MM-DD'.
      const iso = day.day.slice(0, 10);
      const list = index.get(iso) ?? [];
      list.push({
        day: iso,
        subjectName: subject.subjectName,
        markValues: day.markValues ?? [],
        absenceType: day.absenceType ?? undefined,
      });
      index.set(iso, list);
    }
  }
  return index;
}

/** Months (first-day ISO keys) that contain at least one mark or absence. */
export function getActiveMonths(dayIndex: Map<string, DayEntries[]>): string[] {
  const months = new Set<string>();
  for (const day of dayIndex.keys()) months.add(day.slice(0, 7) + '-01');
  return [...months].sort();
}

export function countMarksForMonth(dayIndex: Map<string, DayEntries[]>, monthIso: string): number {
  let count = 0;
  const prefix = monthIso.slice(0, 7);
  for (const [day, entries] of dayIndex) {
    if (!day.startsWith(prefix)) continue;
    for (const entry of entries) count += entry.markValues.length;
  }
  return count;
}

/**
 * Chronological series of the running (cumulative) average across every mark.
 * Powers the animated trend chart on the grades page.
 */
export function buildAverageSeries(
  performance: PerformanceResponse | null,
  subject?: SubjectPerformance | null,
): Array<{ day: string; value: number }> {
  const days: DayEntries[] = subject
    ? (subject.daysWithMarks ?? [])
        .filter((d) => d.markValues?.length > 0)
        .map((d) => ({
          day: d.day,
          subjectName: subject.subjectName,
          markValues: d.markValues,
        }))
    : [...buildDayIndex(performance).values()].flat();

  const ordered = days
    .sort((a, b) => a.day.localeCompare(b.day));

  let sum = 0;
  let count = 0;
  const series: Array<{ day: string; value: number }> = [];
  for (const dayEntry of ordered) {
    for (const mark of dayEntry.markValues) {
      const value = parseMarkValue(mark);
      if (value == null) continue;
      sum += value;
      count += 1;
    }
    if (count > 0) series.push({ day: dayEntry.day, value: Math.round((sum / count) * 100) / 100 });
  }
  return series;
}

export function parseMarkValue(mark: string): number | null {
  const map: Record<string, number> = { Five: 5, Four: 4, Three: 3, Two: 2 };
  if (mark in map) return map[mark];
  const parsed = Number(mark.replace('+', ''));
  return Number.isFinite(parsed) && parsed >= 2 && parsed <= 5 ? parsed : null;
}

/** All subjects that have at least one mark, sorted like the diary reports them. */
export function subjectsWithMarks(performance: PerformanceResponse | null): SubjectPerformance[] {
  return (performance?.subjects ?? []).filter((s) => (s.daysWithMarks ?? []).some((d) => (d.markValues ?? []).length > 0));
}

/** Latest cumulative average across everything (the number shown in the hero). */
export function overallAverage(performance: PerformanceResponse | null): number | null {
  const series = buildAverageSeries(performance);
  return series.length ? series[series.length - 1].value : null;
}

export const isoToName = (iso: string, locale = 'ru'): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale === 'ru' ? 'ru-RU' : locale, {
    month: 'long',
    year: 'numeric',
  });

import type { PerformanceResponse } from '../types';

export interface RecentMarkEntry {
  subjectName: string;
  day: string;
  markValues: string[];
  absenceType?: string;
}

export type MarkVariant = 'success' | 'warning' | 'danger' | 'default';

export const getMarkValue = (mark: string) => {
  switch (mark) {
    case 'Five': return '5';
    case 'Four': return '4';
    case 'Three': return '3';
    case 'Two': return '2';
    default: return mark;
  }
};

export const getMarkVariant = (mark: string): MarkVariant => {
  switch (mark) {
    case 'Five': return 'success';
    case 'Four': return 'warning';
    case 'Three':
    case 'Two': return 'danger';
    default: return 'default';
  }
};

export const getRecentMarks = (performance: PerformanceResponse | null, limit: number): RecentMarkEntry[] => {
  if (!performance) return [];

  const entries: RecentMarkEntry[] = [];
  for (const subject of performance.subjects ?? []) {
    for (const day of subject.daysWithMarks ?? []) {
      if (day.markValues?.length > 0) {
        entries.push({
          subjectName: subject.subjectName,
          day: day.day,
          markValues: day.markValues,
          absenceType: day.absenceType,
        });
      }
    }
  }

  return entries
    .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime())
    .slice(0, limit);
};
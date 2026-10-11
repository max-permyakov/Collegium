export interface CollegeCatalog {
  groups: string[];
  teachers: string[];
  audiences: string[];
}

export interface CollegeLessonItem {
  startTime: string;
  endTime: string;
  name: string;
  teacherName?: string | null;
  audience?: string | null;
}

export interface CollegeScheduleSearchResult {
  type: 'group' | 'teacher' | 'audience';
  query: string;
  date: string;
  lessons: CollegeLessonItem[];
}

export interface CollegeTeacher {
  id: string;
  fullName: string;
  position?: string | null;
  pageUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  disciplines: string[];
  updatedAt: string;
}
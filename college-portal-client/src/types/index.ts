export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'Student' | 'Admin';
  isActive: boolean;
  studentProfile?: StudentProfile;
}

export interface StudentProfile {
  id: string;
  studyGroupId: string;
  studyGroupName: string;
  externalStudentId: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface DiaryLoginRequestDto {
  login: string;
  passwordHash: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: 'Student' | 'Admin';
}

export interface ScheduleDay {
  date: string;
  isHoliday: boolean;
  isShort: boolean;
  lessons: Lesson[];
}

export interface Lesson {
  startTime: string;
  endTime: string;
  name: string;
  classroom?: Classroom;
  teacher?: Teacher;
  gradebook?: Gradebook;
}

export interface Classroom {
  buildingName: string;
  buildingId: number;
  name: string;
  id: number;
}

export interface Teacher {
  firstName: string;
  lastName: string;
  middleName: string;
  id: number;
}

export interface Gradebook {
  id: number;
  themes: string[];
  lessonType: string;
  tasks: Task[];
}

export interface Task {
  id: number;
  type: string;
  topic: string;
  isRequired: boolean;
  condition?: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: number;
  name: string;
  url: string;
}

export interface SubjectGrade {
  id: number;
  name: string;
  averageMark: number;
}

export interface GradesResponse {
  subjects: SubjectGrade[];
}

export interface PerformanceResponse {
  monthsWithDays: MonthWithDays[];
  subjects: SubjectPerformance[];
}

export interface MonthWithDays {
  month: {
    number: number;
    name: string;
  };
  daysWithLessons: string[];
}

export interface SubjectPerformance {
  subjectName: string;
  daysWithMarks: DayWithMarks[];
  averageMark: number;
}

export interface DayWithMarks {
  day: string;
  markValues: string[];
  absenceType?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  authorId: string;
  authorName: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;
  studyGroupId?: string;
  studyGroupName?: string;
}

export interface AnnouncementListItem {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  authorName: string;
  isPublished: boolean;
  createdAt: string;
  studyGroupId?: string;
  studyGroupName?: string;
}

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  publishedAt: string;
  studyGroupId?: string;
}

export interface UpdateAnnouncementDto {
  title: string;
  body: string;
  publishedAt: string;
  isPublished: boolean;
  studyGroupId?: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  studyGroupId: string;
  studyGroupName: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AssignmentListItem {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  studyGroupId: string;
  studyGroupName: string;
  createdByName: string;
  createdAt: string;
}

export interface CreateAssignmentDto {
  title: string;
  description: string;
  dueAt: string;
  studyGroupId: string;
}

export interface UpdateAssignmentDto {
  title: string;
  description: string;
  dueAt: string;
  studyGroupId: string;
}

export interface WeekScheduleResponse {
  startDate: string;
  endDate: string;
  days: ScheduleDay[];
}
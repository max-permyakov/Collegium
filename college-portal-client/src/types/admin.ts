export type HeadmanRole = 'None' | 'Headman' | 'Deputy';

export type AuthMethod = 'Diary' | 'Email' | 'Google' | 'GitHub' | 'Yandex' | 'Vk';

export type Permission =
  | 'UsersManage'
  | 'NewsManage'
  | 'AssignmentsManage'
  | 'ClubsManage'
  | 'CollegeInfoManage'
  | 'MapManage'
  | 'AuditView';

export const ALL_PERMISSIONS: Permission[] = [
  'UsersManage',
  'NewsManage',
  'AssignmentsManage',
  'ClubsManage',
  'CollegeInfoManage',
  'MapManage',
  'AuditView',
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  UsersManage: 'Пользователи и статистика',
  NewsManage: 'Новости',
  AssignmentsManage: 'Задания',
  ClubsManage: 'Кружки',
  CollegeInfoManage: 'Информация о колледже',
  MapManage: 'Карта и аудитории',
  AuditView: 'Журнал аудита',
};

export interface AdminPermissionsDto {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  permissions: Permission[];
}

export interface AdminUserDto {
  id: string;
  login: string;
  displayName: string;
  email?: string | null;
  phoneNumber?: string | null;
  studyGroupId?: string | null;
  studyGroupName?: string | null;
  course?: number | null;
  role: 'Student' | 'Admin';
  isActive: boolean;
  isProtected: boolean;
  headmanRole: string;
  averageMark?: number | null;
  gradesCachedAt?: string | null;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  registrationSource?: AuthMethod;
  lastAuthMethod?: AuthMethod | null;
  hasDiaryLink?: boolean;
}

export interface AdminUsersPageDto {
  items: AdminUserDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatisticsDto {
  totalUsers: number;
  onlineUsers: number;
  activeUsers: number;
  adminUsers: number;
  protectedAdmins: number;
  totalGroups: number;
  totalAnnouncements: number;
  totalAssignments: number;
  groups: StatisticsGroupDto[];
  logins: StatisticsLoginsDto;
  topStudents: StatisticsTopStudentDto[];
}

export interface StatisticsGroupDto {
  id: string;
  name: string;
  course: number;
  studentCount: number;
}

export interface StatisticsLoginsDto {
  last7Days: number;
  last30Days: number;
}

export interface StatisticsTopStudentDto {
  userId: string;
  displayName: string;
  groupName: string;
  averageMark: number;
}

export interface AuditLogDto {
  id: string;
  adminUserId: string;
  adminName: string;
  action: string;
  targetUserId?: string | null;
  targetName?: string | null;
  details: string;
  createdAt: string;
}

export interface ProfileDto {
  id: string;
  login: string;
  displayName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role: 'Student' | 'Admin';
  isActive: boolean;
  isProtected: boolean;
  studyGroupId?: string | null;
  studyGroupName?: string | null;
  course?: number | null;
  headmanRole: string;
  bio?: string | null;
  avatarDataUrl?: string | null;
  averageMark?: number | null;
  gradesCachedAt?: string | null;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  isViewerAdmin: boolean;
  hasDiaryLink?: boolean;
  lastGroupChangedAt?: string | null;
  studentProfile?: {
    id: string;
    studyGroupId: string;
    studyGroupName: string;
    externalStudentId: number | null;
    bio?: string | null;
    avatarDataUrl?: string | null;
    headmanRole?: string | null;
    averageMark?: number | null;
    gradesCachedAt?: string | null;
  } | null;
}
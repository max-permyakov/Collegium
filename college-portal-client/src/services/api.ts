import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { LoginRequest, ScheduleDay, WeekScheduleResponse, KkepikScheduleResponse, GradesResponse, PerformanceResponse, AnnouncementListItem, Announcement, CreateAnnouncementDto, UpdateAnnouncementDto, NewsCommentDto, AssignmentListItem, Assignment, CreateAssignmentDto, UpdateAssignmentDto, User, AdminUserDto, StatisticsDto, AuditLogDto, ProfileDto, PublicProfileDto, ClubListDto, ClubDetailDto, ClubMessageDto, CreateClubDto, UpdateClubDto, CollegeCatalog, CollegeScheduleSearchResult, CollegeTeacher, CollegeMapDto, BuildingDto, DisciplineDto, MapSearchResultDto, AuditoriumDto, CreateBuildingDto, UpdateBuildingDto, CreateAuditoriumDto, UpdateAuditoriumDto, Permission, AdminPermissionsDto, GroupRating, RatingParticipation } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5221/api';

// The access token is stored in an HttpOnly cookie set by the API, so it is
// never exposed to JavaScript. It is short-lived; when it expires the 401
// interceptor below silently exchanges the long-lived refresh cookie (scoped
// to /api/auth) for a fresh pair via POST /auth/refresh. Requests must send
// cookies cross-origin.
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 30000,
});

// Auth endpoints whose 401 must not trigger a token refresh (wrong password,
// failed refresh itself, ...), otherwise they would loop.
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/diary-login',
  '/auth/claim-primary-admin',
  '/auth/refresh',
  '/auth/logout',
  '/auth/diary-relogin',
];

let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => config,
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest?.url ?? '';
    const isNoRefreshPath = NO_REFRESH_PATHS.some((path) => url.includes(path));

    if (error.response?.status === 401 && !originalRequest?._retry && !isNoRefreshPath) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // The access-token cookie expired (or was revoked together with the
        // refresh rotation). Exchange the refresh cookie for a fresh pair and
        // retry the original request.
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });

        processQueue(null);
        return api(originalRequest);
      } catch (err) {
        processQueue(err as Error);
        window.dispatchEvent(new Event('auth:unauthorized'));
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (data: LoginRequest) => api.post<User>('/auth/login', data),
  diaryLogin: (login: string, passwordHash: string) => api.post<User>('/auth/diary-login', { login, passwordHash }),
  diaryRelogin: () => api.post<User>('/auth/diary-relogin'),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  claimPrimaryAdmin: (password: string) => api.post<User>('/auth/claim-primary-admin', { password }),
  assignProfile: (data: { userId: string; externalStudentId: number; studyGroupId: string }) =>
    api.post('/auth/assign-profile', data),
};

export const scheduleApi = {
  getDay: (date: string) => api.get<ScheduleDay>(`/schedule/day`, { params: { date } }),
  getWeek: (startDate: string) => api.get<WeekScheduleResponse>(`/schedule/week`, { params: { startDate } }),
  getGroupWeek: (group: string, startDate: string) => api.get<WeekScheduleResponse>(`/schedule/group/week`, { params: { group, startDate } }),
  getKkepik: (date?: string) => api.get<KkepikScheduleResponse>(`/schedule/kkepik`, { params: { date } }),
};

export const gradesApi = {
  getGrades: () => api.get<GradesResponse>('/grades'),
  getPerformance: () => api.get<PerformanceResponse>('/grades/performance'),
};

export const ratingApi = {
  getGroup: (subject?: string | null) =>
    api.get<GroupRating>('/rating/group', { params: subject ? { subject } : {} }),
  participate: (enabled: boolean) => api.post<RatingParticipation>('/rating/participate', { enabled }),
};

export const newsApi = {
  getNews: (group?: string) => api.get<AnnouncementListItem[]>('/news', { params: { group } }),
  getById: (id: string) => api.get<Announcement>(`/news/${id}`),
  create: (data: CreateAnnouncementDto) => api.post<Announcement>('/news', data),
  update: (id: string, data: UpdateAnnouncementDto) => api.put<Announcement>(`/news/${id}`, data),
  delete: (id: string) => api.delete(`/news/${id}`),
  togglePublished: (id: string) => api.patch(`/news/${id}/toggle-published`),
  getComments: (id: string) => api.get<NewsCommentDto[]>(`/news/${id}/comments`),
  postComment: (id: string, text: string) => api.post<NewsCommentDto>(`/news/${id}/comments`, { text }),
  deleteComment: (commentId: string) => api.delete(`/news/comments/${commentId}`),
  updateComment: (commentId: string, text: string) => api.put(`/news/comments/${commentId}`, { text }),
};

export const assignmentsApi = {
  getMyAssignments: () => api.get<AssignmentListItem[]>(`/assignments`),
  getAssignment: (id: string) => api.get<Assignment>(`/assignments/${id}`),
  createAssignment: (data: CreateAssignmentDto) => api.post<Assignment>(`/assignments`, data),
  updateAssignment: (id: string, data: UpdateAssignmentDto) => api.put<Assignment>(`/assignments/${id}`, data),
  deleteAssignment: (id: string) => api.delete(`/assignments/${id}`),
  delete: (id: string) => api.delete(`/assignments/${id}`),
};

export const profileApi = {
  getMe: () => api.get<ProfileDto>('/profile/me'),
  getUser: (id: string) => api.get<PublicProfileDto>(`/profile/${id}`),
  updateMe: (data: { bio?: string | null; email?: string | null; phoneNumber?: string | null }) => api.put('/profile/me', data),
  setAvatar: (dataUrl?: string | null) => api.post('/profile/me/avatar', { dataUrl }),
  clearAvatar: () => api.delete('/profile/me/avatar'),
};

export const adminApi = {
  getStatistics: () => api.get<StatisticsDto>('/admin/statistics'),
  getUsers: () => api.get<AdminUserDto[]>('/admin/users', { timeout: 60000 }),
  getUser: (id: string) => api.get<ProfileDto>(`/admin/users/${id}`),
  setRole: (id: string, role: 'Student' | 'Admin') => api.post(`/admin/users/${id}/role`, { role }),
  setIsActive: (id: string, isActive: boolean) => api.post(`/admin/users/${id}/is-active`, { isActive }),
  setHeadman: (id: string, headmanRole: string) => api.post(`/admin/users/${id}/headman`, { headmanRole }),
  recomputeGrades: (id: string) => api.post(`/admin/users/${id}/recompute-grades`),
  getAudit: (limit = 100) => api.get<AuditLogDto[]>(`/admin/audit`, { params: { limit } }),
  exportUsersCsv: () => api.get<Blob>('/admin/users.csv', { responseType: 'blob', timeout: 120000 }),
  getClubs: () => api.get<ClubListDto[]>('/admin/clubs'),
  getClub: (id: string) => api.get<ClubDetailDto>(`/admin/clubs/${id}`),
  getClubMessages: (id: string) => api.get<ClubMessageDto[]>(`/admin/clubs/${id}/messages`),
  deleteClub: (id: string) => api.delete(`/admin/clubs/${id}`),
  refreshCollegeCatalog: () => api.post('/admin/college-info/catalog/refresh'),
  refreshCollegeTeachers: () => api.post('/admin/college-info/teachers/refresh'),
};

export const permissionsApi = {
  getMine: () => api.get<{ permissions: Permission[] }>('/permissions/me'),
  getForUser: (userId: string) => api.get<AdminPermissionsDto>(`/admin/permissions/${userId}`),
  setForUser: (userId: string, permissions: Permission[]) =>
    api.put(`/admin/permissions/${userId}`, { permissions }),
};

export const clubsApi = {
  getClubs: () => api.get<ClubListDto[]>('/clubs'),
  getClub: (id: string, invite?: string) => api.get<ClubDetailDto>(`/clubs/${id}`, { params: invite ? { invite } : undefined }),
  create: (data: CreateClubDto) => api.post<ClubDetailDto>('/clubs', data),
  update: (id: string, data: UpdateClubDto) => api.put(`/clubs/${id}`, data),
  delete: (id: string) => api.delete(`/clubs/${id}`),
  join: (id: string, token?: string) => api.post(`/clubs/${id}/join`, { token: token ?? null }),
  leave: (id: string) => api.post(`/clubs/${id}/leave`),
  setLeader: (id: string, userId: string, isLeader: boolean) => api.post(`/clubs/${id}/members/${userId}/leader`, { isLeader }),
  removeMember: (id: string, userId: string) => api.delete(`/clubs/${id}/members/${userId}`),
  getMessages: (id: string, params?: { after?: string; before?: string; latest?: number; limit?: number }) =>
    api.get<ClubMessageDto[]>(`/clubs/${id}/messages`, { params }),
  postMessage: (id: string, text: string) => api.post<ClubMessageDto>(`/clubs/${id}/messages`, { text }),
  updateMessage: (messageId: string, text: string) => api.put<ClubMessageDto>(`/clubs/messages/${messageId}`, { text }),
  deleteMessage: (messageId: string) => api.delete(`/clubs/messages/${messageId}`),
  setPinned: (id: string, isPinned: boolean) => api.post(`/clubs/${id}/pin`, { isPinned }),
};

export const collegeInfoApi = {
  getCatalog: () => api.get<CollegeCatalog>('/college-info/catalog'),
  searchSchedule: (type: string, query: string, date?: string) =>
    api.get<CollegeScheduleSearchResult>('/college-info/schedule/search', { params: { type, query, date } }),
  getTeachers: () => api.get<CollegeTeacher[]>('/college-info/teachers'),
};

export const collegeMapApi = {
  getMap: () => api.get<CollegeMapDto>('/college-map'),
  getBuildings: () => api.get<BuildingDto[]>('/college-map/buildings'),
  getDisciplines: () => api.get<DisciplineDto[]>('/college-map/disciplines'),
  search: (query: string) => api.get<MapSearchResultDto>('/college-map/search', { params: { query } }),
  createBuilding: (data: CreateBuildingDto) => api.post<BuildingDto>('/admin/college-map/buildings', data),
  updateBuilding: (id: string, data: UpdateBuildingDto) => api.put(`/admin/college-map/buildings/${id}`, data),
  deleteBuilding: (id: string) => api.delete(`/admin/college-map/buildings/${id}`),
  createAuditorium: (data: CreateAuditoriumDto) => api.post<AuditoriumDto>('/admin/college-map/auditoriums', data),
  updateAuditorium: (id: string, data: UpdateAuditoriumDto) => api.put(`/admin/college-map/auditoriums/${id}`, data),
  deleteAuditorium: (id: string) => api.delete(`/admin/college-map/auditoriums/${id}`),
};


export default api;
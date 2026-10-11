import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { LoginRequest, LoginResponse, ScheduleDay, WeekScheduleResponse, KkepikScheduleResponse, GradesResponse, PerformanceResponse, AnnouncementListItem, Announcement, CreateAnnouncementDto, UpdateAnnouncementDto, AssignmentListItem, Assignment, CreateAssignmentDto, UpdateAssignmentDto, User, AdminUserDto, StatisticsDto, AuditLogDto, ProfileDto, ClubListDto, ClubDetailDto, ClubMessageDto, CreateClubDto, UpdateClubDto, CollegeCatalog, CollegeScheduleSearchResult, CollegeTeacher, CollegeMapDto, BuildingDto, DisciplineDto, MapSearchResultDto, AuditoriumDto, CreateBuildingDto, UpdateBuildingDto, CreateAuditoriumDto, UpdateAuditoriumDto } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5221/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Try diary relogin first
        const diaryReloginResponse = await axios.post(`${API_BASE_URL}/auth/diary-relogin`, {}, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
        });
        
        const { accessToken, refreshToken } = diaryReloginResponse.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return api(originalRequest);
      } catch (err) {
        processQueue(err as Error, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data),
  diaryLogin: (login: string, passwordHash: string) => api.post<LoginResponse>('/auth/diary-login', { login, passwordHash }),
  diaryRelogin: () => api.post<LoginResponse>('/auth/diary-relogin'),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
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

export const newsApi = {
  getNews: (group?: string) => api.get<AnnouncementListItem[]>('/news', { params: { group } }),
  getById: (id: string) => api.get<Announcement>(`/news/${id}`),
  create: (data: CreateAnnouncementDto) => api.post<Announcement>('/news', data),
  update: (id: string, data: UpdateAnnouncementDto) => api.put<Announcement>(`/news/${id}`, data),
  delete: (id: string) => api.delete(`/news/${id}`),
  togglePublished: (id: string) => api.patch(`/news/${id}/toggle-published`),
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
  updateMe: (data: { bio?: string | null; email?: string | null; phoneNumber?: string | null }) => api.put('/profile/me', data),
  setAvatar: (dataUrl?: string | null) => api.post('/profile/me/avatar', { dataUrl }),
  clearAvatar: () => api.delete('/profile/me/avatar'),
};

export const adminApi = {
  getStatistics: () => api.get<StatisticsDto>('/admin/statistics'),
  getUsers: () => api.get<AdminUserDto[]>('/admin/users'),
  getUser: (id: string) => api.get<ProfileDto>(`/admin/users/${id}`),
  setRole: (id: string, role: 'Student' | 'Admin') => api.post(`/admin/users/${id}/role`, { role }),
  setIsActive: (id: string, isActive: boolean) => api.post(`/admin/users/${id}/is-active`, { isActive }),
  setHeadman: (id: string, headmanRole: string) => api.post(`/admin/users/${id}/headman`, { headmanRole }),
  recomputeGrades: (id: string) => api.post(`/admin/users/${id}/recompute-grades`),
  getAudit: (limit = 100) => api.get<AuditLogDto[]>(`/admin/audit`, { params: { limit } }),
  exportUsersCsv: () => api.get<Blob>('/admin/users.csv', { responseType: 'blob' }),
  getClubs: () => api.get<ClubListDto[]>('/admin/clubs'),
  getClub: (id: string) => api.get<ClubDetailDto>(`/admin/clubs/${id}`),
  getClubMessages: (id: string) => api.get<ClubMessageDto[]>(`/admin/clubs/${id}/messages`),
  deleteClub: (id: string) => api.delete(`/admin/clubs/${id}`),
  refreshCollegeCatalog: () => api.post('/admin/college-info/catalog/refresh'),
  refreshCollegeTeachers: () => api.post('/admin/college-info/teachers/refresh'),
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
  getMessages: (id: string) => api.get<ClubMessageDto[]>(`/clubs/${id}/messages`),
  postMessage: (id: string, text: string) => api.post<ClubMessageDto>(`/clubs/${id}/messages`, { text }),
  deleteMessage: (messageId: string) => api.delete(`/clubs/messages/${messageId}`),
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
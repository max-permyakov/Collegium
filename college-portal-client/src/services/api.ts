import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { LoginRequest, LoginResponse, ScheduleDay, WeekScheduleResponse, GradesResponse, PerformanceResponse, AnnouncementListItem, Announcement, CreateAnnouncementDto, UpdateAnnouncementDto, AssignmentListItem, Assignment, CreateAssignmentDto, UpdateAssignmentDto, User } from '../types';

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
  getMyAssignments: () => api.get<AssignmentListItem[]>('/assignments'),
  getById: (id: string) => api.get<Assignment>(`/assignments/${id}`),
  create: (data: CreateAssignmentDto) => api.post<Assignment>('/assignments', data),
  update: (id: string, data: UpdateAssignmentDto) => api.put<Assignment>(`/assignments/${id}`, data),
  delete: (id: string) => api.delete(`/assignments/${id}`),
};

export default api;
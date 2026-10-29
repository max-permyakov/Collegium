import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { Layout, AuthLayout } from './components/layout/Layout';
import { PageFallback } from './components/layout/PageFallback';
import { InstallPrompt } from './components/layout/InstallPrompt';
import { Toaster } from 'sonner';

// Routes are split per page so the initial bundle only carries the shell and
// the current page. Chunks are prefetched while the browser is idle, which
// makes the first visit to each page feel instant without bloating startup.
const loadLoginPage = () => import('./pages/auth/LoginPage').then(m => ({ default: m.LoginPage }));
const loadCompleteProfilePage = () => import('./pages/auth/CompleteProfilePage').then(m => ({ default: m.CompleteProfilePage }));
const loadClaimPrimaryAdminPage = () => import('./pages/auth/ClaimPrimaryAdminPage').then(m => ({ default: m.ClaimPrimaryAdminPage }));
const loadHomePage = () => import('./pages/home/HomePage').then(m => ({ default: m.HomePage }));
const loadSchedulePage = () => import('./pages/schedule/SchedulePage').then(m => ({ default: m.SchedulePage }));
const loadGradesPage = () => import('./pages/grades/GradesPage').then(m => ({ default: m.GradesPage }));
const loadPerformancePage = () => import('./pages/performance/PerformancePage').then(m => ({ default: m.PerformancePage }));
const loadAssignmentsPage = () => import('./pages/assignments/AssignmentsPage').then(m => ({ default: m.AssignmentsPage }));
const loadNewsPage = () => import('./pages/news/NewsPage').then(m => ({ default: m.NewsPage }));
const loadAdminPage = () => import('./pages/admin/AdminPage').then(m => ({ default: m.AdminPage }));
const loadProfilePage = () => import('./pages/profile/ProfilePage').then(m => ({ default: m.ProfilePage }));
const loadPublicProfilePage = () => import('./pages/profile/PublicProfilePage').then(m => ({ default: m.PublicProfilePage }));
const loadClubsPage = () => import('./pages/clubs/ClubsPage').then(m => ({ default: m.ClubsPage }));
const loadClubDetailPage = () => import('./pages/clubs/ClubDetailPage').then(m => ({ default: m.ClubDetailPage }));
const loadChatsPage = () => import('./pages/chats/ChatsPage').then(m => ({ default: m.ChatsPage }));
const loadChatDetailPage = () => import('./pages/chats/ChatDetailPage').then(m => ({ default: m.ChatDetailPage }));
const loadCollegeInfoPage = () => import('./pages/college/CollegeInfoPage').then(m => ({ default: m.CollegeInfoPage }));
const loadCollegeMapPage = () => import('./pages/college/CollegeMapPage').then(m => ({ default: m.CollegeMapPage }));
const loadGamesPage = () => import('./pages/games/GamesPage').then(m => ({ default: m.GamesPage }));
const loadEscapeGamePage = () => import('./pages/games/escape/EscapeGamePage');

const LoginPage = lazy(loadLoginPage);
const CompleteProfilePage = lazy(loadCompleteProfilePage);
const ClaimPrimaryAdminPage = lazy(loadClaimPrimaryAdminPage);
const HomePage = lazy(loadHomePage);
const SchedulePage = lazy(loadSchedulePage);
const GradesPage = lazy(loadGradesPage);
const PerformancePage = lazy(loadPerformancePage);
const AssignmentsPage = lazy(loadAssignmentsPage);
const NewsPage = lazy(loadNewsPage);
const AdminPage = lazy(loadAdminPage);
const ProfilePage = lazy(loadProfilePage);
const PublicProfilePage = lazy(loadPublicProfilePage);
const ClubsPage = lazy(loadClubsPage);
const ClubDetailPage = lazy(loadClubDetailPage);
const ChatsPage = lazy(loadChatsPage);
const ChatDetailPage = lazy(loadChatDetailPage);
const CollegeInfoPage = lazy(loadCollegeInfoPage);
const CollegeMapPage = lazy(loadCollegeMapPage);
const GamesPage = lazy(loadGamesPage);
const EscapeGamePage = lazy(loadEscapeGamePage);

// The heavy game engine loads on demand only, everything else is warmed up.
const PREFETCHED_ROUTES = [
  loadHomePage,
  loadSchedulePage,
  loadGradesPage,
  loadPerformancePage,
  loadAssignmentsPage,
  loadNewsPage,
  loadClubsPage,
  loadChatsPage,
  loadCollegeInfoPage,
  loadProfilePage,
];
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: ('Student' | 'Admin')[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.requiresProfileSetup && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, hasAnyPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Full admins and users with at least one granted admin right may enter.
  if (user && user.role !== 'Admin' && !hasAnyPermission) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={user?.requiresProfileSetup ? '/complete-profile' : '/'} replace />;
  }

  return <>{children}</>;
}

function UserProfileRoute() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();

  // Administrators keep the full management view; everyone else sees the
  // contact-free public profile.
  if (userId && user && user.role !== 'Admin') {
    return <PublicProfilePage userId={userId} />;
  }

  return <ProfilePage />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  // Warm the route chunks in the background once the app shell is ready. This
  // turns later navigations into an instant render instead of a network wait.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      for (const load of PREFETCHED_ROUTES) {
        void load().catch(() => undefined);
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated]);

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        </PublicRoute>
      } />

      <Route path="/complete-profile" element={
        <ProtectedRoute>
          <CompleteProfilePage />
        </ProtectedRoute>
      } />

      <Route element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<HomePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="grades" element={<GradesPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="clubs" element={<ClubsPage />} />
        <Route path="clubs/:clubId" element={<ClubDetailPage />} />
        <Route path="chats" element={<ChatsPage />}>
          <Route path=":chatId" element={<ChatDetailPage />} />
        </Route>
        <Route path="games" element={<GamesPage />} />
        <Route path="games/escape" element={<EscapeGamePage />} />
        <Route path="college-info" element={<CollegeInfoPage />} />
        <Route path="college-info/map" element={<CollegeMapPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="users/:userId" element={<UserProfileRoute />} />
        <Route path="admin" element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        } />
      </Route>

      <Route path="YesIAmAdmin" element={
        <ProtectedRoute>
          <ClaimPrimaryAdminPage />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" richColors closeButton />
      <InstallPrompt />
      <BrowserRouter>
        <AuthProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
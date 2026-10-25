import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { Layout, AuthLayout } from './components/layout/Layout';
import { LoginPage } from './pages/auth/LoginPage';
import { CompleteProfilePage } from './pages/auth/CompleteProfilePage';
import { ClaimPrimaryAdminPage } from './pages/auth/ClaimPrimaryAdminPage';
import { HomePage } from './pages/home/HomePage';
import { SchedulePage } from './pages/schedule/SchedulePage';
import { GradesPage } from './pages/grades/GradesPage';
import { PerformancePage } from './pages/performance/PerformancePage';
import { AssignmentsPage } from './pages/assignments/AssignmentsPage';
import { NewsPage } from './pages/news/NewsPage';
import { AdminPage } from './pages/admin/AdminPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { PublicProfilePage } from './pages/profile/PublicProfilePage';
import { ClubsPage } from './pages/clubs/ClubsPage';
import { ClubDetailPage } from './pages/clubs/ClubDetailPage';
import { CollegeInfoPage } from './pages/college/CollegeInfoPage';
import { CollegeMapPage } from './pages/college/CollegeMapPage';
import { GamesPage } from './pages/games/GamesPage';
import EscapeGamePage from './pages/games/escape/EscapeGamePage';
import { Toaster } from 'sonner';
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
  return (
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" richColors closeButton />
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
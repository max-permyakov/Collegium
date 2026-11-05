import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { Layout, AuthLayout } from './components/layout/Layout';
import { PageFallback } from './components/layout/PageFallback';
import { InstallPrompt } from './components/layout/InstallPrompt';
import { SecretTerminal } from './components/ambient/SecretTerminal';
import { DiaryRequiredNotice } from './components/DiaryRequiredNotice';
import { Toaster } from 'sonner';

// Routes are split per page so the initial bundle only carries the shell and
// the current page. Chunks are prefetched while the browser is idle, which
// makes the first visit to each page feel instant without bloating startup.
const loadLoginPage = () => import('./pages/auth/LoginPage').then(m => ({ default: m.LoginPage }));
const loadWelcomePage = () => import('./pages/auth/WelcomePage').then(m => ({ default: m.WelcomePage }));
const loadCompleteProfilePage = () => import('./pages/auth/CompleteProfilePage').then(m => ({ default: m.CompleteProfilePage }));
const loadClaimPrimaryAdminPage = () => import('./pages/auth/ClaimPrimaryAdminPage').then(m => ({ default: m.ClaimPrimaryAdminPage }));
const loadHomePage = () => import('./pages/home/HomePage').then(m => ({ default: m.HomePage }));
const loadSchedulePage = () => import('./pages/schedule/SchedulePage').then(m => ({ default: m.SchedulePage }));
const loadGradesPage = () => import('./pages/grades/GradesPage').then(m => ({ default: m.GradesPage }));
const loadAssignmentsPage = () => import('./pages/assignments/AssignmentsPage').then(m => ({ default: m.AssignmentsPage }));
const loadNewsPage = () => import('./pages/news/NewsPage').then(m => ({ default: m.NewsPage }));
const loadAdminPage = () => import('./pages/admin/AdminPage').then(m => ({ default: m.AdminPage }));
const loadProfilePage = () => import('./pages/profile/ProfilePage').then(m => ({ default: m.ProfilePage }));
const loadPublicProfilePage = () => import('./pages/profile/PublicProfilePage').then(m => ({ default: m.PublicProfilePage }));
const loadClubsPage = () => import('./pages/clubs/ClubsPage').then(m => ({ default: m.ClubsPage }));
const loadClubDetailPage = () => import('./pages/clubs/ClubDetailPage').then(m => ({ default: m.ClubDetailPage }));
const loadChatsPage = () => import('./pages/chats/ChatsPage').then(m => ({ default: m.ChatsPage }));
const loadChatDetailPage = () => import('./pages/chats/ChatDetailPage').then(m => ({ default: m.ChatDetailPage }));
const loadSharePage = () => import('./pages/chats/SharePage').then(m => ({ default: m.SharePage }));
const loadCollegeInfoPage = () => import('./pages/college/CollegeInfoPage').then(m => ({ default: m.CollegeInfoPage }));
const loadCollegeMapPage = () => import('./pages/college/CollegeMapPage').then(m => ({ default: m.CollegeMapPage }));
const loadGamesPage = () => import('./pages/games/GamesPage').then(m => ({ default: m.GamesPage }));
const loadEscapeGamePage = () => import('./pages/games/escape/EscapeGamePage');

const LoginPage = lazy(loadLoginPage);
const WelcomePage = lazy(loadWelcomePage);
const CompleteProfilePage = lazy(loadCompleteProfilePage);
const ClaimPrimaryAdminPage = lazy(loadClaimPrimaryAdminPage);
const HomePage = lazy(loadHomePage);
const SchedulePage = lazy(loadSchedulePage);
const GradesPage = lazy(loadGradesPage);
const AssignmentsPage = lazy(loadAssignmentsPage);
const NewsPage = lazy(loadNewsPage);
const AdminPage = lazy(loadAdminPage);
const ProfilePage = lazy(loadProfilePage);
const PublicProfilePage = lazy(loadPublicProfilePage);
const ClubsPage = lazy(loadClubsPage);
const ClubDetailPage = lazy(loadClubDetailPage);
const ChatsPage = lazy(loadChatsPage);
const ChatDetailPage = lazy(loadChatDetailPage);
const SharePage = lazy(loadSharePage);
const CollegeInfoPage = lazy(loadCollegeInfoPage);
const CollegeMapPage = lazy(loadCollegeMapPage);
const GamesPage = lazy(loadGamesPage);
const EscapeGamePage = lazy(loadEscapeGamePage);

// The heavy game engine loads on demand only, everything else is warmed up.
const PREFETCHED_ROUTES = [
  loadHomePage,
  loadSchedulePage,
  loadGradesPage,
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
    return <Navigate to="/welcome" replace />;
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
    return <Navigate to="/welcome" replace />;
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

/** Старый адрес страницы предмета → /grades с тем же выбранным предметом. */
function GradesSubjectRedirect() {
  const [searchParams] = useSearchParams();
  const subject = searchParams.get('subject');
  return <Navigate to={subject ? `/grades?subject=${encodeURIComponent(subject)}` : '/grades'} replace />;
}

/** Кружки открываются как обычный чат: старый адрес /clubs/:id → панель чатов. */
function ClubChatRedirect() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite');
  sessionStorage.setItem('chats-page:tab', 'clubs');
  const target = clubId ? `/chats/club/${clubId}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}` : '/chats';
  return <Navigate to={target} replace />;
}

/**
 * Разделы, доступные только пользователям с привязанным электронным дневником.
 * Дневник подтверждает статус студента колледжа (игры с рейтингом —
 * только для студентов); администратору вход не требуется.
 */
function DiaryGate({ children, title, text }: { children: React.ReactNode; title: string; text: string }) {
  const { user } = useAuth();
  if (user && (user.hasDiaryLink || user.role === 'Admin')) return <>{children}</>;
  return (
    <div className="max-w-xl mx-auto">
      <DiaryRequiredNotice title={title} text={text} />
    </div>
  );
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

      <Route path="/welcome" element={
        <PublicRoute>
          <WelcomePage />
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
        {/* Старый адрес страницы предмета: выбор предмета живёт внутри /grades. */}
        <Route path="grades/subject" element={<GradesSubjectRedirect />} />
        {/* Объединённая страница оценок/успеваемости; старый alias остаётся. */}
        <Route path="performance" element={<Navigate to="/grades" replace />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="clubs" element={<ClubsPage />} />
        {/* Старый адрес кружка: чат кружка живёт внутри вкладки чатов. */}
        <Route path="clubs/:clubId" element={<ClubChatRedirect />} />
        <Route path="chats" element={<ChatsPage />}>
          <Route path=":chatId" element={<ChatDetailPage />} />
          {/* Кружок в той же правой панели: слева список, справа чат. */}
          <Route path="club/:clubId" element={<ClubDetailPage />} />
        </Route>
        {/* Android «Поделиться → KKEP.ka» (manifest share_target) приёмник */}
        <Route path="share" element={<SharePage />} />
        <Route path="games" element={
          <DiaryGate
            title="Игры — только для студентов"
            text="Чтобы играть, привяжите электронный дневник в профиле. Он нужен, чтобы мы могли проверить, что вы студент колледжа: рейтинг игр ведётся среди реальных студентов."
          >
            <GamesPage />
          </DiaryGate>
        } />
        <Route path="games/escape" element={
          <DiaryGate
            title="Игры — только для студентов"
            text="Чтобы играть, привяжите электронный дневник в профиле. Он нужен, чтобы мы могли проверить, что вы студент колледжа: рейтинг игр ведётся среди реальных студентов."
          >
            <EscapeGamePage />
          </DiaryGate>
        } />
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
            {/* Пасхалка: терминал по клавише ~ — доступен везде в портале */}
            <SecretTerminal />
            <AppRoutes />
          </NotificationsProvider>
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
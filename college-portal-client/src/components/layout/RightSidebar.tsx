import { NavLink } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import type { ReactNode } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles?: ('Student' | 'Admin')[];
}

const HomeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const AwardIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const ClipboardIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const NewspaperIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
  </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LogoutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const CollegeLogo = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v4m-4 4h8" />
  </svg>
);

const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const navItems: NavItem[] = [
  { path: '/', label: 'Главная', icon: <HomeIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/schedule', label: 'Расписание', icon: <CalendarIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/grades', label: 'Оценки', icon: <AwardIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/performance', label: 'Успеваемость', icon: <TrendingUpIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/assignments', label: 'Задания', icon: <ClipboardIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/news', label: 'Новости', icon: <NewspaperIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/profile', label: 'Профиль', icon: <UserIcon className="w-5 h-5" />, roles: ['Student', 'Admin'] },
  { path: '/admin', label: 'Админка', icon: <SettingsIcon className="w-5 h-5" />, roles: ['Admin'] },
];

interface RightSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function RightSidebar({ collapsed, onToggle }: RightSidebarProps) {
  const { user, logout } = useAuth();

  const filteredNavItems = navItems.filter(item =>
    !item.roles || (user && item.roles.includes(user.role))
  );

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Desktop: collapsible right panel */}
      <aside
        className={`fixed right-0 top-0 h-full z-40 hidden lg:flex flex-col bg-dark-card border-l border-dark-border transition-[width] duration-300 ${collapsed ? 'w-16' : 'w-64'}`}
        aria-label="Навигация"
      >
        <div className={`flex items-center h-16 border-b border-dark-border flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <div className={`flex items-center gap-3 ${collapsed ? 'hidden' : ''}`}>
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <CollegeLogo className="w-6 h-6 text-primary-400" />
            </div>
            <span className="text-lg font-semibold text-dark-text">KKEP.ka</span>
          </div>
          {collapsed && (
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <CollegeLogo className="w-6 h-6 text-primary-400" />
            </div>
          )}
          <button
            onClick={onToggle}
            className="btn-ghost p-2"
            aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          >
            <ChevronIcon className={`w-5 h-5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2" aria-label="Основная навигация">
          <ul className="space-y-1" role="list">
            {filteredNavItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => `
                    flex items-center rounded-xl text-sm font-medium transition-all duration-200
                    ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'}
                    ${isActive
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-dark-textMuted hover:bg-dark-border hover:text-dark-text border border-transparent'}
                  `}
                >
                  <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
                  {!collapsed && item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`p-4 border-t border-dark-border ${collapsed ? 'flex flex-col items-center gap-3' : 'space-y-3'}`}>
          {user && (
            collapsed ? (
              <Avatar src={user.studentProfile?.avatarDataUrl || undefined} name={user.displayName} size="md" />
            ) : (
              <div className="flex items-center gap-3">
                <Avatar src={user.studentProfile?.avatarDataUrl || undefined} name={user.displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark-text truncate">{user.displayName}</p>
                  <p className="text-xs text-dark-textMuted capitalize">{user.role}</p>
                </div>
              </div>
            )
          )}
          <Button
            variant="ghost"
            className={`text-red-400 hover:bg-red-500/10 ${collapsed ? 'w-10 h-10 p-0 justify-center' : 'w-full justify-start gap-3'}`}
            onClick={handleLogout}
            title="Выйти"
          >
            <LogoutIcon className="w-5 h-5" />
            {!collapsed && 'Выйти'}
          </Button>
        </div>
      </aside>

      {/* Mobile: icon-only bottom navigation bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-dark-card/95 backdrop-blur border-t border-dark-border safe-bottom"
        aria-label="Основная навигация"
      >
        <div className="flex items-stretch justify-around">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `
                relative flex flex-col flex-1 min-w-0 items-center justify-center gap-1.5 py-3 transition-colors
                ${isActive ? 'text-primary-400' : 'text-dark-textMuted'}
              `}
              aria-label={item.label}
            >
              {({ isActive }) => (
                <>
                  <span className={`absolute top-0 h-0.5 w-8 rounded-full bg-primary-400 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="w-5 h-5">{item.icon}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="relative flex flex-col flex-1 min-w-0 items-center justify-center gap-1.5 py-3 text-red-400"
            aria-label="Выйти"
            title="Выйти"
          >
            <span className="w-5 h-5"><LogoutIcon className="w-5 h-5" /></span>
          </button>
        </div>
      </nav>
    </>
  );
}
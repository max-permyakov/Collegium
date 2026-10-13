import { useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { RightSidebar } from './RightSidebar';

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className={`min-h-screen transition-[padding] duration-300 ${sidebarCollapsed ? 'lg:pr-16' : 'lg:pr-64'}`}>
        <main className="page-container pb-20 lg:pb-4">
          {children || <Outlet />}
        </main>
      </div>
      <RightSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4 safe-top safe-bottom">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
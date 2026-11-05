import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { RightSidebar } from './RightSidebar';
import { PageFallback } from './PageFallback';
import { MatrixRain } from '../ambient/MatrixRain';

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className={`min-h-screen transition-[padding] duration-300 ${sidebarCollapsed ? 'lg:pr-16' : 'lg:pr-64'}`}>
        <main className="page-container pb-20 lg:pb-4">
          <Suspense fallback={<PageFallback />}>
            {children || <Outlet />}
          </Suspense>
        </main>
      </div>
      <RightSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-dark-bg flex items-center justify-center p-4 safe-top safe-bottom overflow-hidden">
      {/* Едва заметный дождик символов за формой входа */}
      <MatrixRain className="absolute inset-0 w-full h-full opacity-30" columnGap={24} />
      <div className="relative z-10 w-full max-w-md">
        <Suspense fallback={<PageFallback />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
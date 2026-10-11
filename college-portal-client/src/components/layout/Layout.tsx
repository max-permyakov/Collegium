import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { RightSidebar } from './RightSidebar';

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="lg:pr-64 min-h-screen">
        <main className="page-container safe-bottom">
          {children || <Outlet />}
        </main>
      </div>
      <RightSidebar />
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
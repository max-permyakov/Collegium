import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api';
import type { User, LoginRequest } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // True when an active session was rejected by the API (expired / revoked);
  // lets the login page explain why the user landed there.
  sessionExpired: boolean;
  login: (data: LoginRequest) => Promise<void>;
  diaryLogin: (login: string, password: string) => Promise<void>;
  claimPrimaryAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The diary API expects the password pre-hashed (SHA-256, base64) so the raw
// diary password is never sent to (or stored by) the portal server.
async function hashDiaryPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // The session lives in an HttpOnly cookie; ask the server who we are.
        await refreshUser();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [refreshUser]);

  // When the API rejects our session (expired / revoked), drop local state.
  // The handler only flags "session expired" when a user was actually signed
  // in, so a failed bootstrap check on a fresh visit stays silent.
  useEffect(() => {
    const onUnauthorized = () => {
      if (user) {
        setSessionExpired(true);
      }
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [queryClient, user]);

  const login = async (data: LoginRequest) => {
    const response = await authApi.login(data);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
  };

  const diaryLogin = async (login: string, password: string) => {
    const passwordHash = await hashDiaryPassword(password);
    const response = await authApi.diaryLogin(login, passwordHash);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
  };

  const claimPrimaryAdmin = async (password: string) => {
    const response = await authApi.claimPrimaryAdmin(password);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      queryClient.clear();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, sessionExpired, login, diaryLogin, claimPrimaryAdmin, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

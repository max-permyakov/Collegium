import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, permissionsApi } from '../services/api';
import { removePushBinding, syncPushBinding } from '../services/push';
import type { User, LoginRequest, Permission } from '../types';
import { ALL_PERMISSIONS } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Effective admin rights of the signed-in user (empty for plain students).
  // Full admins receive every permission from the API.
  permissions: Permission[];
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: boolean;
  // True when an active session was rejected by the API (expired / revoked);
  // lets the login page explain why the user landed there.
  sessionExpired: boolean;
  login: (data: LoginRequest) => Promise<void>;
  diaryLogin: (login: string, password: string) => Promise<void>;
  requestEmailCode: (email: string) => Promise<{ sent: boolean; message: string; retryAfterSeconds?: number }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ success: boolean; requiresRegistration: boolean; registrationToken?: string | null; error?: string | null; user?: User | null }>;
  completeEmailRegistration: (data: { registrationToken: string; lastName: string; firstName: string; middleName?: string | null; groupName: string }) => Promise<void>;
  completeProfile: (data: { lastName: string; firstName: string; middleName?: string | null; groupName: string }) => Promise<void>;
  linkDiary: (login: string, password: string) => Promise<void>;
  claimPrimaryAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The diary API expects the password pre-hashed (SHA-256, base64). The portal
// stores only an encrypted copy of this hash for diary re-login.
async function hashDiaryPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();

  const loadPermissions = useCallback(async () => {
    try {
      const perms = await permissionsApi.getMine();
      setPermissions(perms.data.permissions ?? []);
    } catch {
      setPermissions([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      // The session lives in an HttpOnly cookie; ask the server who we are.
      const response = await authApi.me();
      setUser(response.data);
      await loadPermissions();
    } catch {
      setUser(null);
      setPermissions([]);
    }
  }, [loadPermissions]);

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
      setPermissions([]);
      queryClient.clear();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [queryClient, user]);

  // Re-bind an existing browser push subscription to the account that just
  // signed in (a shared browser keeps its subscription between users).
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void syncPushBinding();
  }, [userId]);

  const login = async (data: LoginRequest) => {
    const response = await authApi.login(data);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const diaryLogin = async (login: string, password: string) => {
    const passwordHash = await hashDiaryPassword(password);
    const response = await authApi.diaryLogin(login, passwordHash);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const requestEmailCode = async (email: string) => {
    const response = await authApi.requestEmailCode(email);
    return response.data;
  };

  const verifyEmailCode = async (email: string, code: string) => {
    const response = await authApi.verifyEmailCode(email, code);
    if (response.data.user) {
      queryClient.clear();
      setUser(response.data.user);
      setSessionExpired(false);
      await loadPermissions();
    }
    return response.data;
  };

  const completeEmailRegistration = async (data: {
    registrationToken: string;
    lastName: string;
    firstName: string;
    middleName?: string | null;
    groupName: string;
  }) => {
    const response = await authApi.completeEmailRegistration(data);
    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const completeProfile = async (data: {
    lastName: string;
    firstName: string;
    middleName?: string | null;
    groupName: string;
  }) => {
    const response = await authApi.completeProfile(data);
    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const linkDiary = async (login: string, password: string) => {
    const passwordHash = await hashDiaryPassword(password);
    const response = await authApi.linkDiary(login, passwordHash);
    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const claimPrimaryAdmin = async (password: string) => {
    const response = await authApi.claimPrimaryAdmin(password);

    queryClient.clear();
    setUser(response.data);
    setSessionExpired(false);
    await loadPermissions();
  };

  const logout = async () => {
    try {
      // Forget the server binding while the session cookie is still valid.
      // The browser subscription stays, so the next login can re-bind it.
      await removePushBinding();
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      queryClient.clear();
      setUser(null);
      setPermissions([]);
    }
  };

  // Full admins implicitly hold every permission (mirrors the server), and we
  // keep that fallback client-side so the admin UI never depends on a fragile
  // extra request succeeding.
  const effectivePermissions = user?.role === 'Admin' ? ALL_PERMISSIONS : permissions;
  const hasPermission = (permission: Permission) => effectivePermissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        permissions: effectivePermissions,
        hasPermission,
        hasAnyPermission: effectivePermissions.length > 0,
        sessionExpired,
        login,
        diaryLogin,
        requestEmailCode,
        verifyEmailCode,
        completeEmailRegistration,
        completeProfile,
        linkDiary,
        claimPrimaryAdmin,
        logout,
        refreshUser,
      }}
    >
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

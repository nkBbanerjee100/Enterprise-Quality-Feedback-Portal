/**
 * Authentication store (Zustand)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole } from '../types/auth.types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setAccessToken: (token: string) => void;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),

      setAccessToken: (token) => set({ accessToken: token }),

      hasRole: (role) => {
        const { user } = get();
        if (!user) return false;
        const roles = Array.isArray(role) ? role : [role];
        return roles.includes(user.role);
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;

        const permissions: Record<UserRole, string[]> = {
          [UserRole.QUALITY]:           ['*'],
          [UserRole.DELIVERY]:            ['view_projects', 'send_feedback', 'view_feedback', 'view_reports'],
          [UserRole.MANAGER]:            ['view_projects', 'send_feedback', 'view_feedback', 'view_reports'],
          [UserRole.SALES]:         ['view_reports', 'view_dashboard', 'export_reports'],
          [UserRole.CUSTOMER]:                ['submit_feedback'],
        };

        const userPermissions = permissions[user.role] || [];
        return userPermissions.includes('*') || userPermissions.includes(permission);
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

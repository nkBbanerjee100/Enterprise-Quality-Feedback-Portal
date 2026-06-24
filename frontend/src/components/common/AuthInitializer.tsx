/**
 * AuthInitializer
 *
 * Per doc §5.1:
 *  - On app startup, call /api/auth/me
 *  - Do not render protected pages before auth state is known
 *  - Show "Loading Quality workspace..." until resolved
 *
 * Wraps the entire app so that auth state is always resolved before
 * any route renders. Prevents wrong-page flash and broken refresh.
 */
import React, { useEffect, useState } from 'react';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import { BRAND } from '../../utils/constants';

interface AuthInitializerProps {
  children: React.ReactNode;
}

export const AuthInitializer: React.FC<AuthInitializerProps> = ({ children }) => {
  const { accessToken, setAuth, clearAuth, isAuthenticated } = useAuthStore();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (!accessToken) {
        // No stored token — definitely unauthenticated, no need to call API
        setResolving(false);
        return;
      }

      try {
        // Rehydrate user from token stored in Zustand persist
        const user = await authApi.getCurrentUser(accessToken);
        // Token still valid — re-set auth (refreshes user data from server)
        setAuth(user, accessToken, useAuthStore.getState().refreshToken ?? '');
      } catch {
        // Token expired or invalid — clear auth, let ProtectedRoute redirect to /login
        clearAuth();
      } finally {
        setResolving(false);
      }
    };

    init();
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (resolving) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.surface,
        gap: '16px',
      }}>
        {/* Spinner */}
        <div style={{
          width: '36px', height: '36px',
          border: `3px solid ${BRAND.greenMuted}`,
          borderTop: `3px solid ${BRAND.green}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />

        <p style={{ fontSize: '14px', color: BRAND.textMid, fontWeight: 500 }}>
          Loading Quality workspace…
        </p>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
};
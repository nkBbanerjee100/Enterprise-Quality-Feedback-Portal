/**
 * Custom hook for authentication
 *
 * Fixes from original:
 *   - authState.token → authState.accessToken  (store field is accessToken)
 *   - Uses user.defaultRoute from /api/auth/me when available (doc §5.1)
 *   - Falls back to ROLE_REDIRECT map if defaultRoute not present
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { LoginRequest, UserRole } from '../types/auth.types';

const ROLE_REDIRECT: Record<string, string> = {
  [UserRole.QUALITY]:           '/admin',
  [UserRole.DELIVERY]:            '/dashboard',
  [UserRole.MANAGER]:            '/admin',
  [UserRole.SALES]:         '/reports',
  [UserRole.CUSTOMER]:                '/feedback',
};

export const useAuth = () => {
  const navigate = useNavigate();
  const { setAuth, clearAuth, ...authState } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginRequest) => authApi.login(credentials),
    onSuccess: async (data) => {
      // Pass token directly — store isn't updated yet at this point
      const user = await authApi.getCurrentUser(data.access_token);
      setAuth(user, data.access_token, data.refresh_token);
      // Prefer the route the backend tells us (doc §5.1), fall back to our map
      const redirect = user.defaultRoute ?? ROLE_REDIRECT[user.role] ?? '/dashboard';
      navigate(redirect, { replace: true });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearAuth();
      navigate('/login');
    },
  });


  const currentUserQuery = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => authApi.getCurrentUser(authState.accessToken),
    enabled: authState.isAuthenticated,
  });

  return {
    ...authState,
    login:       loginMutation.mutateAsync,
    logout:      logoutMutation.mutate,
    isLoading:   loginMutation.isPending || logoutMutation.isPending,
    isError:     loginMutation.isError   || logoutMutation.isError,
    errorMessage: loginMutation.error?.message ?? logoutMutation.error?.message ?? null,
    currentUser: currentUserQuery.data,
  };
};
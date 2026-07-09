/**
 * Authentication API endpoints
 *
 * getCurrentUser maps the raw /api/auth/me response (doc §5.1 MeResponse shape)
 * into the flat User type used everywhere in the app.
 *
 * The backend may return either:
 *   A) { user: { id, email, displayName, ... }, role, permissions, defaultRoute }
 *   B) The flat user object directly: { id, email, emp_id, first_name, ... }
 * We handle both so the app doesn't break regardless of backend version.
 */
import { api } from './client';
import { LoginRequest, TokenResponse, User, MeResponse } from '../types/auth.types';

interface RegisterPayload {
  emp_id:           string;
  emp_first_name:   string;
  emp_middle_name?: string;
  emp_last_name:    string;
  gender:           string;
  email:            string;
  role:             string;
  password:         string;
  confirm_password: string;
}

export const authApi = {
  login: async (credentials: LoginRequest): Promise<TokenResponse> => {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/api/auth/logout');
  },

  refreshToken: async (refreshToken: string): Promise<TokenResponse> => {
    const response = await api.post('/api/auth/refresh', { refreshToken });
    return response.data;
  },

  /**
   * Fetch current user from /api/auth/me and normalise into flat User.
   * Handles the nested MeResponse shape (doc §5.1) and flat fallback.
   */
  getCurrentUser: async (token?: string | null): Promise<User> => {
    const response = await api.get('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    const data = response.data as MeResponse | User;

    // Shape A: { user: {...}, role, permissions, defaultRoute }
    if ('user' in data && data.user && typeof data.user === 'object') {
      const me = data as MeResponse;
      return {
        id:           me.user.id,
        email:        me.user.email,
        displayName:  me.user.displayName ?? `${me.user.first_name ?? ''} ${me.user.last_name ?? ''}`.trim(),
        role:         me.role,
        emp_id:       me.user.emp_id     ?? me.user.id ?? '',
        first_name:   me.user.first_name ?? me.user.displayName?.split(' ')[0] ?? '',
        last_name:    me.user.last_name  ?? me.user.displayName?.split(' ').slice(1).join(' ') ?? '',
        is_active:    me.user.is_active  ?? true,
        permissions:  me.permissions,
        defaultRoute: me.defaultRoute,
      };
    }

    // Shape B: flat user object returned directly
    const flat = data as any;
    return {
      id:           flat.id          ?? flat.emp_id ?? '',
      email:        flat.email       ?? '',
      displayName:  flat.displayName ?? `${flat.first_name ?? ''} ${flat.last_name ?? ''}`.trim(),
      role:         flat.role,
      emp_id:       flat.emp_id      ?? flat.id ?? '',
      first_name:   flat.first_name  ?? '',
      last_name:    flat.last_name   ?? '',
      is_active:    flat.is_active   ?? true,
      permissions:  flat.permissions,
      defaultRoute: flat.defaultRoute,
    };
  },

  register: async (payload: RegisterPayload): Promise<any> => {
    const response = await api.post('/api/auth/register', payload);
    return response.data;
  },
};
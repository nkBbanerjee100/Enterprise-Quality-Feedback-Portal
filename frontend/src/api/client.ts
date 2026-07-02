/**
 * API client configuration with Axios and interceptors
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { API_BASE_URL } from '../utils/constants';

// React Query Client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Endpoints that are public by definition. A 401 here means "wrong
// credentials" or "invalid refresh token" — not "your session expired" —
// so they must never trigger the silent refresh-and-redirect flow below.
const PUBLIC_AUTH_PATHS = ['/api/auth/login', '/api/auth/register-self', '/api/auth/refresh'];
const isPublicAuthRequest = (url?: string) =>
  !!url && PUBLIC_AUTH_PATHS.some((path) => url.includes(path));

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use((config) => {
      // If a caller already set an explicit Authorization header (e.g. the
      // getCurrentUser call right after login, which passes the brand-new
      // token directly), never overwrite it with whatever is sitting in the
      // store. Doing so was the cause of "Invalid or expired token" right
      // after a successful login: a stale/expired token from a previous
      // session was still in the persisted store and silently replaced the
      // fresh one on this request.
      if (config.headers?.Authorization) {
        return config;
      }

      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;

        // A wrong-password login (or a bad register/refresh call) returns
        // 401 from the backend, but that's not an expired session — it's
        // just bad input. Previously this fell into the branch below, which
        // tried a silent token refresh, failed (there's no /api/auth/refresh
        // route yet, or no refresh token at all), and then ran
        // `window.location.href = '/login'` — a hard page reload — within
        // a few hundred ms. That's exactly why the error message flashed
        // and then the page "refreshed": the whole app was being reloaded
        // out from under the error state.
        if (isPublicAuthRequest(originalRequest?.url)) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && originalRequest) {
          const { refreshToken, clearAuth, setAccessToken } = useAuthStore.getState();

          if (refreshToken) {
            try {
              // Attempt token refresh
              const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
                refreshToken,
              });

              const { access_token } = response.data;
              setAccessToken(access_token);

              // Retry original request
              return this.client(originalRequest);
            } catch (refreshError) {
              // Refresh failed, clear auth
              clearAuth();
              window.location.href = '/login';
            }
          } else {
            clearAuth();
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient();
export const api = apiClient.getInstance();
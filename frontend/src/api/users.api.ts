/**
 * Users API — currently just the Quality-only login-activity audit view.
 */
import { api } from './client';
import { LoginActivityEntry } from '../types/audit.types';

export const usersApi = {
  listLoginActivity: async (): Promise<LoginActivityEntry[]> => {
    const r = await api.get('/api/users/login-activity');
    return r.data;
  },
};

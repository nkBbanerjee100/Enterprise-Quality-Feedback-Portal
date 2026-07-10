/**
 * Audit Logs API — the full event trail (separate from usersApi.listLoginActivity,
 * which only ever returns each user's single most-recent login).
 */
import { api } from './client';
import { AuditLogListResponse, AuditLogFilters, AuditAction } from '../types/audit.types';

export const auditApi = {
  list: async (filters: AuditLogFilters): Promise<AuditLogListResponse> => {
    const r = await api.get('/api/audit-logs', { params: filters });
    return r.data;
  },

  listActionTypes: async (): Promise<AuditAction[]> => {
    const r = await api.get('/api/audit-logs/actions');
    return r.data;
  },
};
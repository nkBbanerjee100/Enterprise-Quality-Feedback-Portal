/**
 * CSAT Cycles API endpoints
 */
import { api } from './client';
import { CSATCycle, PaginatedResponse } from '../types/common.types';
import {
  EnrolledProject, EnrollProjectsRequest, SetEligibilityRequest,
  RequestManagerApprovalRequest, ManagerDecisionRequest,
  CycleProjectsResponse,
} from '../types/csat-cycle.types';

export const csatCyclesApi = {
  // ── Cycle CRUD ──────────────────────────────────────────────────────────
  list: async (
    skip = 0,
    limit = 10,
    isActive?: boolean,
  ): Promise<PaginatedResponse<CSATCycle>> => {
    const params: Record<string, unknown> = { skip, limit };
    if (isActive !== undefined) params.is_active = isActive;
    const r = await api.get('/api/csat-cycles', { params });
    return r.data;
  },

  getById: async (id: number): Promise<CSATCycle> => {
    const r = await api.get(`/api/csat-cycles/${id}`);
    return r.data;
  },

  create: async (payload: {
    cycle_name: string;
    description?: string;
    year: number;
    half: 'H1' | 'H2';
  }): Promise<CSATCycle> => {
    const r = await api.post('/api/csat-cycles', payload);
    return r.data;
  },

  update: async (id: number, payload: Partial<CSATCycle>): Promise<CSATCycle> => {
    const r = await api.patch(`/api/csat-cycles/${id}`, payload);
    return r.data;
  },

  // ── Enrollment ───────────────────────────────────────────────────────────
  listProjects: async (
    cycleId: number,
    params: {
      skip?: number;
      limit?: number;
      status?: string;
      project_status?: string;  // 'active' | 'completed' | 'all'
      active_first?: boolean;
    } = {},
  ): Promise<CycleProjectsResponse> => {
    const r = await api.get(`/api/csat-cycles/${cycleId}/projects`, { params });
    return r.data;
  },

  enrollProjects: async (
    cycleId: number,
    payload: EnrollProjectsRequest,
  ): Promise<{ enrolled: number[]; skipped: { tms_project_id: number; reason: string }[] }> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/enroll`, payload);
    return r.data;
  },

  setEligibility: async (
    cycleId: number,
    enrollmentId: number,
    payload: SetEligibilityRequest,
  ): Promise<EnrolledProject> => {
    const r = await api.patch(
      `/api/csat-cycles/${cycleId}/projects/${enrollmentId}/eligibility`,
      payload,
    );
    return r.data;
  },

  requestManagerApproval: async (
    cycleId: number,
    enrollmentId: number,
    payload: RequestManagerApprovalRequest = {},
  ): Promise<EnrolledProject> => {
    const r = await api.post(
      `/api/csat-cycles/${cycleId}/projects/${enrollmentId}/request-approval`,
      payload,
    );
    return r.data;
  },

  managerDecision: async (
    cycleId: number,
    enrollmentId: number,
    payload: ManagerDecisionRequest,
  ): Promise<EnrolledProject> => {
    const r = await api.post(
      `/api/csat-cycles/${cycleId}/projects/${enrollmentId}/manager-decision`,
      payload,
    );
    return r.data;
  },

  deleteCycle: async (cycleId: number): Promise<void> => {
    await api.delete(`/api/csat-cycles/${cycleId}`);
  },

  removeProject: async (cycleId: number, enrollmentId: number): Promise<void> => {
    await api.delete(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}`);
  },
};
/**
 * CSAT Cycles API endpoints
 */
import { api } from './client';
import { CSATCycle, PaginatedResponse } from '../types/common.types';
import {
  EnrolledProject, EnrollProjectsRequest, SetEligibilityRequest,
  CycleProjectsResponse, DeclineAdditionRequest, EnrollTriageAction,
  AuditReportResponse,
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
  ): Promise<{ enrolled: number[]; skipped: { tms_project_id: number; reason: string }[]; warnings: { tms_project_id: number; reason: string }[] }> => {
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

  deleteCycle: async (cycleId: number): Promise<void> => {
    await api.delete(`/api/csat-cycles/${cycleId}`);
  },

  // ── Second-level exemption approval (separate from the eligibility flow
  // above) — Management confirming/rejecting an exemption QM already
  // approved. Approving EXEMPTS the project for good; rejecting sends it
  // back to the Manager. Both require a reason. ─────────────────────────────
  approveAddition: async (
    cycleId: number,
    enrollmentId: number,
    payload: DeclineAdditionRequest = {},
  ): Promise<EnrolledProject> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}/approve-addition`, payload);
    return r.data;
  },

  declineAddition: async (
    cycleId: number,
    enrollmentId: number,
    payload: DeclineAdditionRequest = {},
  ): Promise<EnrolledProject> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}/decline-addition`, payload);
    return r.data;
  },

  /** The project's own Manager reviewing an enrollment sitting in
   * pending_manager_review. exempted requires a reason and sends it back
   * to Quality to recheck; eligible is final. */
  managerDecide: async (
    cycleId: number, enrollmentId: number, decision: EnrollTriageAction, exemptionReason?: string,
  ): Promise<EnrolledProject> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}/manager-decide`, {
      decision, exemption_reason: exemptionReason,
    });
    return r.data;
  },

  /** Quality rechecking an enrollment the Manager just exempted. exempted
   * requires a reason and is final; eligible sends it to Management. */
  qualityRecheck: async (
    cycleId: number, enrollmentId: number, decision: EnrollTriageAction, exemptionReason?: string,
  ): Promise<EnrolledProject> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}/quality-recheck`, {
      decision, exemption_reason: exemptionReason,
    });
    return r.data;
  },

  /** Management approving/rejecting Quality's exemption request. Reject
   * sends the project on to its Manager (or straight to Approved if it has
   * no Manager) instead of finalizing it as exempt. */
  decideExemption: async (
    cycleId: number, enrollmentId: number, approve: boolean, remarks?: string,
  ): Promise<EnrolledProject> => {
    const r = await api.post(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}/decide-exemption`, { approve, remarks });
    return r.data;
  },

  removeProject: async (cycleId: number, enrollmentId: number): Promise<void> => {
    await api.delete(`/api/csat-cycles/${cycleId}/projects/${enrollmentId}`);
  },

  /** Every project in this cycle — added AND exempted — each with its
   * final outcome and a full chronological reason trail (who decided
   * what, when, and why) for auditing purposes. */
  getAuditReport: async (cycleId: number, outcome?: 'added' | 'exempted'): Promise<AuditReportResponse> => {
    const r = await api.get(`/api/csat-cycles/${cycleId}/audit-report`, { params: outcome ? { outcome } : {} });
    return r.data;
  },
};
/**
 * Project staging API — pre-cycle project selection and triage.
 */
import { api } from './client';
import {
  StagedProject, SelectProjectItem, CreateCycleFromStagingRequest,
  CandidatesResponse, ProjectManagerOption, TriageAction, MyProjectItem,
} from '../types/project-staging.types';

export interface ListCandidatesParams {
  search?: string;
  pm?: string;          // emp_id
  year?: number;
  activeSkip?: number;
  activeLimit?: number;
  completedSkip?: number;
  completedLimit?: number;
}

export const projectStagingApi = {
  listCandidates: async (params: ListCandidatesParams = {}): Promise<CandidatesResponse> => {
    const r = await api.get('/api/project-staging/candidates', {
      params: {
        search: params.search || undefined,
        pm: params.pm || undefined,
        year: params.year || undefined,
        active_skip: params.activeSkip ?? 0,
        active_limit: params.activeLimit ?? 50,
        completed_skip: params.completedSkip ?? 0,
        completed_limit: params.completedLimit ?? 50,
      },
    });
    return r.data;
  },

  listManagers: async (): Promise<ProjectManagerOption[]> => {
    const r = await api.get('/api/project-staging/managers');
    return r.data;
  },

  listPool: async (status?: string): Promise<StagedProject[]> => {
    const r = await api.get('/api/project-staging/', { params: status ? { status } : {} });
    return r.data;
  },

  /** Quality's (or Management's) first pass: eligible -> routed to the
   * project's own Manager; exempted -> mandatory reason, final immediately. */
  select: async (items: SelectProjectItem[]): Promise<{ selected: number[]; skipped: { tms_project_id: number; reason: string }[]; warnings: { tms_project_id: number; reason: string }[] }> => {
    const r = await api.post('/api/project-staging/select', { items });
    return r.data;
  },

  /** Management approving/rejecting Quality's exemption request. Reject
   * sends the project on to its Manager (or straight to Eligible if it has
   * no Manager) instead of finalizing it as exempt. */
  decideExemption: async (stagingId: number, approve: boolean, remarks?: string): Promise<StagedProject> => {
    const r = await api.post(`/api/project-staging/${stagingId}/decide-exemption`, { approve, remarks });
    return r.data;
  },

  /** Every TMS project a Manager is assigned to (PmId), merged with
   * current staging status if any — not just ones Quality already routed. */
  listMyProjects: async (): Promise<MyProjectItem[]> => {
    const r = await api.get('/api/project-staging/my-projects');
    return r.data;
  },

  /** A Manager deciding directly on one of their own projects, whether or
   * not Quality has touched it yet. eligible -> final immediately;
   * exempted -> mandatory reason, goes to Quality to recheck. */
  managerSelect: async (tmsProjectId: number, action: TriageAction, exemptionReason?: string): Promise<{ selected: number[]; skipped: { tms_project_id: number; reason: string }[]; warnings: { tms_project_id: number; reason: string }[] }> => {
    const r = await api.post('/api/project-staging/manager-select', {
      items: [{ tms_project_id: tmsProjectId, action, exemption_reason: exemptionReason }],
    });
    return r.data;
  },

  /** The project's own Manager reviewing a project sitting in
   * pending_manager_review. exempted requires a reason and sends it back
   * to Quality to recheck; eligible is final. */
  managerDecide: async (stagingId: number, decision: TriageAction, exemptionReason?: string): Promise<StagedProject> => {
    const r = await api.post(`/api/project-staging/${stagingId}/manager-decide`, {
      decision, exemption_reason: exemptionReason,
    });
    return r.data;
  },

  /** Quality rechecking a project the Manager just exempted. exempted
   * requires a reason and is final; eligible sends it to Management. */
  qualityRecheck: async (stagingId: number, decision: TriageAction, exemptionReason?: string): Promise<StagedProject> => {
    const r = await api.post(`/api/project-staging/${stagingId}/quality-recheck`, {
      decision, exemption_reason: exemptionReason,
    });
    return r.data;
  },

  /** Management's final call on a project Quality reaffirmed eligible
   * after a Manager exemption. Declining requires remarks (the exemption
   * reason). */
  decide: async (stagingId: number, approve: boolean, remarks?: string): Promise<StagedProject> => {
    const r = await api.post(`/api/project-staging/${stagingId}/decide`, { approve, remarks });
    return r.data;
  },

  createCycle: async (payload: CreateCycleFromStagingRequest): Promise<{ id: number; projects_enrolled: number }> => {
    const r = await api.post('/api/project-staging/create-cycle', payload);
    return r.data;
  },
};

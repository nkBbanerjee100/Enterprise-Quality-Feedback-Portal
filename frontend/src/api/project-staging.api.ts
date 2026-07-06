/**
 * Project staging API — pre-cycle project selection and triage.
 */
import { api } from './client';
import {
  StagedProject, SelectProjectItem, CreateCycleFromStagingRequest,
  CandidatesResponse, ProjectManagerOption,
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

  select: async (items: SelectProjectItem[]): Promise<{ selected: number[]; skipped: { tms_project_id: number; reason: string }[] }> => {
    const r = await api.post('/api/project-staging/select', { items });
    return r.data;
  },

  decide: async (stagingId: number, approve: boolean, remarks?: string): Promise<StagedProject> => {
    const r = await api.post(`/api/project-staging/${stagingId}/decide`, { approve, remarks });
    return r.data;
  },

  createCycle: async (payload: CreateCycleFromStagingRequest): Promise<{ id: number; projects_enrolled: number }> => {
    const r = await api.post('/api/project-staging/create-cycle', payload);
    return r.data;
  },
};

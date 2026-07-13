/**
 * Projects API — reads from TMS via /api/tms/projects
 * All data is live from tsms_projects (read-only TMS DB).
 */
import { api } from './client';
import { TMSProject, TMSProjectListResponse } from '../types/project.types';

export const projectsApi = {
  /** All projects — paginated, searchable, filterable */
  list: async (
    skip     = 0,
    limit    = 20,
    search?:   string,
    isActive?: boolean,
    pm?:       string,
    year?:     number,
    includeCount = true,
  ): Promise<TMSProjectListResponse> => {
    const params: Record<string, unknown> = { skip, limit, include_count: includeCount };
    if (search   !== undefined && search !== '') params.search    = search;
    if (isActive !== undefined)                  params.is_active = isActive;
    if (pm       !== undefined && pm !== '')      params.pm        = pm;
    if (year     !== undefined)                  params.year      = year;
    const res = await api.get('/api/tms/projects', { params });
    return res.data;
  },

  /** Completed / feedback-eligible projects only */
  listCompleted: async (
    skip   = 0,
    limit  = 20,
    search?: string,
  ): Promise<TMSProjectListResponse> => {
    const params: Record<string, unknown> = { skip, limit };
    if (search) params.search = search;
    const res = await api.get('/api/tms/projects/completed', { params });
    return res.data;
  },

  /** Single project by TMS Id */
  getById: async (projectId: number): Promise<TMSProject> => {
    const res = await api.get(`/api/tms/projects/${projectId}`);
    return res.data;
  },

  /** TMS connectivity status */
  getStatus: async (): Promise<{ status: string; database: string; checked_at: string }> => {
    const res = await api.get('/api/tms/status');
    return res.data;
  },
};

// ── People / employee types ───────────────────────────────────────────────────
export interface PersonDetail {
  emp_id:            string;
  full_name:         string;
  email:             string | null;
  gender:            string | null;
  is_active:         boolean | null;
  doj:               string | null;   // ISO datetime
  level:             string | null;
  grade:             string | null;
  reporting_mgr:     string | null;
  delivery_mgr:      string | null;
}

export interface ProjectPeople {
  project_manager:  PersonDetail | null;
  delivery_manager: PersonDetail | null;
  additional_pm:    PersonDetail | null;
  additional_dm:    PersonDetail | null;
}

export const peopleApi = {
  /** All four personnel for a project in one JOIN query */
  getProjectPeople: async (projectId: number): Promise<ProjectPeople> => {
    const res = await api.get(`/api/tms/projects/${projectId}/people`);
    return res.data;
  },
};
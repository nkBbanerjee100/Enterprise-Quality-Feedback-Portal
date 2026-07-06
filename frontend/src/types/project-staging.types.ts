/**
 * Project staging types — the pre-cycle project selection/triage workflow.
 */

export type StagingStatus = 'eligible' | 'pending_management_review' | 'exempted';

export type TriageAction = 'eligible' | 'not_sure' | 'exempted';

export interface StagingCandidate {
  project_ext_id: string;
  project_name: string;
  is_active: boolean;
  end_date?: string;
  start_date?: string;
  bucket: 'active' | 'completed';
  staging_status?: StagingStatus;
  staging_id?: number;
  project_manager_emp_id?: string;
  project_manager_name?: string;
}

export interface CandidatesResponse {
  active: StagingCandidate[];
  active_total: number;
  completed: StagingCandidate[];
  completed_total: number;
  completed_window: { start: string; end: string };
}

export interface ProjectManagerOption {
  emp_id: string;
  name: string;
}

export interface StagedProject {
  staging_id: number;
  project_id: number;
  project_ext_id: string;
  project_name: string;
  is_active: boolean;
  status: StagingStatus;
  selected_by: string;
  selected_at: string;
  decided_by?: string;
  decided_at?: string;
  decision_remarks?: string;
}

export interface SelectProjectItem {
  tms_project_id: number;
  action: TriageAction;
}

export interface CreateCycleFromStagingRequest {
  cycle_name: string;
  description?: string;
  year: number;
  half: 'H1' | 'H2';
}

export const STAGING_STATUS_META: Record<StagingStatus, { label: string; bg: string; text: string }> = {
  eligible:                   { label: 'Eligible',           bg: '#E8F2EC', text: '#1A5C3A' },
  pending_management_review:  { label: 'With Management',    bg: '#EEF4FF', text: '#2563EB' },
  exempted:                   { label: 'Exempted',           bg: '#F3F4F6', text: '#6B7280' },
};

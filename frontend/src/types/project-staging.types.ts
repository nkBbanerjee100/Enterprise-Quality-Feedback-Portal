/**
 * Project staging types — the pre-cycle project selection/triage workflow.
 *
 * State machine (mandatory exemption reason at every exempt step):
 *   Quality: eligible -> pending_manager_review | exempted -> mandatory reason; final
 *   Manager: eligible -> final (ready for cycle) | exempted -> pending_quality_recheck; mandatory reason
 *   Quality recheck: eligible -> pending_management_review | exempted -> mandatory reason; final
 *   Management: approve -> eligible (final) | decline -> mandatory reason; exempted (final)
 */

export type StagingStatus =
  | 'pending_management_exemption_review'
  | 'pending_manager_review'
  | 'pending_quality_recheck'
  | 'pending_management_review'
  | 'eligible'
  | 'exempted';

export type TriageAction = 'eligible' | 'exempted';

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
  manager_emp_id?: string;
  manager_name?: string;
  manager_decided_by?: string;
  manager_decided_at?: string;
  quality_recheck_by?: string;
  quality_recheck_at?: string;
  decided_by?: string;
  decided_at?: string;
  decision_remarks?: string;
  exemption_reason?: string;
}

export interface MyProjectItem {
  project_ext_id: string;
  project_name: string;
  staging_id: number | null;
  status: StagingStatus | null;   // null = no staging row yet — fully actionable
  selected_by: string | null;
  exemption_reason: string | null;
}

export interface SelectProjectItem {
  tms_project_id: number;
  action: TriageAction;
  exemption_reason?: string;   // required when action === 'exempted'
}

export interface CreateCycleFromStagingRequest {
  cycle_name: string;
  description?: string;
  year: number;
  half: 'H1' | 'H2';
}

export const STAGING_STATUS_META: Record<StagingStatus, { label: string; bg: string; text: string }> = {
  pending_management_exemption_review: { label: 'Exemption — with Management', bg: '#EEF4FF', text: '#2563EB' },
  pending_manager_review:    { label: 'With Manager',        bg: '#FDF6E3', text: '#9B7C2A' },
  pending_quality_recheck:   { label: 'Back with Quality',   bg: '#FDF6E3', text: '#9B7C2A' },
  pending_management_review: { label: 'With Management',     bg: '#EEF4FF', text: '#2563EB' },
  eligible:                  { label: 'Eligible',            bg: '#E8F2EC', text: '#1A5C3A' },
  exempted:                  { label: 'Exempted',            bg: '#F3F4F6', text: '#6B7280' },
};

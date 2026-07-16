/**
 * CSAT Cycle domain types
 */

// 'pending_approval' / 'approved' / 'declined' are legacy values only — they
// were produced by the old manager exemption-escalation flow, which has been
// removed. No new enrollment can reach those states anymore (declining an
// addition or exempting a project both go straight to 'exempted'), but they're
// kept in the type so any pre-existing rows created before this change still
// render correctly instead of falling through to an unhandled case.
export type EligibilityStatus =
  | 'eligible'
  | 'exempted'
  | 'pending_approval'
  | 'approved'
  | 'declined';

export type CycleHalf = 'H1' | 'H2';

// Separate from EligibilityStatus — gates the act of adding a project to a
// cycle at all. Mirrors the exact Quality -> Manager -> Quality ->
// Management chain as the pre-cycle staging pool (see
// project-staging.types.ts's StagingStatus — same literal values for the
// four pending states by design).
export type AdditionApprovalStatus =
  | 'pending_management_exemption_review'
  | 'pending_manager_review'
  | 'pending_quality_recheck'
  | 'pending_management_review'
  | 'approved'
  | 'declined'
  | 'pending';   // legacy — no longer set by new code

export interface EnrolledProject {
  enrollment_id: number;
  project_id: number;
  project_ext_id: string;
  project_name: string;
  is_active: boolean;
  eligibility_status: EligibilityStatus;
  exemption_reason?: string;
  notes?: string;
  enrolled_by?: string;
  enrolled_by_name?: string;
  enrolled_at: string;
  approval_requested_at?: string;
  manager_remarks?: string;
  approved_or_declined_at?: string;

  // ── Addition-approval (separate from the exemption flow above) ─────────
  addition_approval_status: AdditionApprovalStatus;
  addition_approved_by?: string;
  addition_approved_by_name?: string;
  addition_approved_at?: string;
  addition_decision_remarks?: string;
  project_manager_emp_id?: string;
  project_manager_name?: string;
  can_approve_addition: boolean;   // computed server-side for the current user

  // ── Chain tracking — mirrors project-staging.types.ts's StagedProject ──
  manager_emp_id?: string;
  manager_decided_by?: string;
  manager_decided_by_name?: string;
  manager_decided_at?: string;
  quality_recheck_by?: string;
  quality_recheck_by_name?: string;
  quality_recheck_at?: string;

  // ── Feedback Request Status ──────────────────────────────────────────────
  feedback_request_id?: number | null;
  feedback_status?: string | null;      // 'pending', 'sent', 'completed'
  pm_approval_status?: string | null;   // 'draft', 'pending_pm', 'approved', 'rejected'
}

export interface DeclineAdditionRequest {
  remarks?: string;
}

export interface CycleProjectsResponse {
  data: EnrolledProject[];
  total: number;
  skip: number;
  limit: number;
  summary: Record<EligibilityStatus, number>;
  ready_count: number;   // eligible/approved AND addition itself confirmed — matches getRowStatus()'s "Ready" bucket
}

export type EnrollTriageAction = 'eligible' | 'exempted';

export interface EnrollProjectItem {
  tms_project_id: number;
  action: EnrollTriageAction;
  exemption_reason?: string;   // required when action === 'exempted'
}

export interface EnrollProjectsRequest {
  // Modern per-project eligible/exempt form (mirrors project-staging's
  // /select) — use this for Quality/Management triage.
  items?: EnrollProjectItem[];
  // Legacy all-eligible shorthand — still used for a Manager adding their
  // own project directly (auto-approved, no triage decision needed).
  tms_project_ids?: number[];
}

export interface SetEligibilityRequest {
  eligibility_status: EligibilityStatus;
  exemption_reason?: string;
  notes?: string;
}

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  eligible: 'Eligible for Review',
  exempted: 'Not Eligible / Exempted',
  pending_approval: 'Pending Manager Approval',
  approved: 'Manager Approved',
  declined: 'Manager Declined',
};

export const ELIGIBILITY_COLORS: Record<EligibilityStatus, { bg: string; text: string; border: string }> = {
  eligible:         { bg: '#D1FAE5', text: '#065F46', border: '#34D399' },
  exempted:         { bg: '#FEF3C7', text: '#92400E', border: '#FBBF24' },
  pending_approval: { bg: '#DBEAFE', text: '#1E40AF', border: '#60A5FA' },
  approved:         { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
  declined:         { bg: '#FEE2E2', text: '#991B1B', border: '#F87171' },
};

export const ADDITION_APPROVAL_LABELS: Record<AdditionApprovalStatus, string> = {
  pending:  'Pending Addition Approval',
  approved: 'Addition Approved',
  declined: 'Addition Declined',
};

export const ADDITION_APPROVAL_COLORS: Record<AdditionApprovalStatus, { bg: string; text: string; border: string }> = {
  pending:  { bg: '#FDF6E3', text: '#9B7C2A', border: '#EACD82' },
  approved: { bg: '#D1FAE5', text: '#065F46', border: '#34D399' },
  declined: { bg: '#FEE2E2', text: '#991B1B', border: '#F87171' },
};
/**
 * CSAT Cycle domain types
 */

export type EligibilityStatus =
  | 'eligible'
  | 'exempted'
  | 'pending_approval'
  | 'approved'
  | 'declined';

export type CycleHalf = 'H1' | 'H2';

// Separate from EligibilityStatus — gates the act of adding a project to a
// cycle at all. Set when Quality/Management enrolls a project; Management
// or that project's Manager (PM) must approve/decline it.
export type AdditionApprovalStatus = 'pending' | 'approved' | 'declined';

export interface EnrolledProject {
  enrollment_id: number;
  project_id: number;
  project_ext_id: string;
  project_name: string;
  is_active: boolean;
  eligibility_status: EligibilityStatus;
  exemption_reason?: string;
  notes?: string;
  enrolled_at: string;
  approval_requested_at?: string;
  manager_remarks?: string;
  approved_or_declined_at?: string;

  // ── Addition-approval (separate from the exemption flow above) ─────────
  addition_approval_status: AdditionApprovalStatus;
  addition_approved_by?: string;
  addition_approved_at?: string;
  addition_decision_remarks?: string;
  project_manager_emp_id?: string;
  project_manager_name?: string;
  can_approve_addition: boolean;   // computed server-side for the current user

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
}

export interface EnrollProjectsRequest {
  tms_project_ids: number[];  // TMS tsms_projects.Id values
}

export interface SetEligibilityRequest {
  eligibility_status: EligibilityStatus;
  exemption_reason?: string;
  notes?: string;
}

export interface RequestManagerApprovalRequest {
  exemption_reason?: string;
}

export interface ManagerDecisionRequest {
  decision: 'approved' | 'declined';
  manager_remarks?: string;
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

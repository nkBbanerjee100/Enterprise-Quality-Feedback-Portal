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

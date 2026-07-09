/**
 * Audit types.
 *
 * Two distinct shapes on purpose:
 * - LoginActivityEntry: one row per user, their MOST RECENT login only.
 *   Backed by csat_users.last_login_at (unchanged, existing behavior).
 * - AuditLogEntry: one row per EVENT, full history. Backed by the new
 *   `audit_logs` table — every login, role change, cycle-eligibility
 *   change, etc. is its own row, newest first.
 */
export interface LoginActivityEntry {
  emp_id: string;
  name: string;
  role: string;
  last_login_at: string | null;
}

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'CSAT_CYCLE_CREATED'
  | 'PROJECT_ENROLLED'
  | 'CYCLE_ELIGIBILITY_CHANGED'
  | 'CYCLE_ADDITION_APPROVED'
  | 'CYCLE_ADDITION_DECLINED'
  | 'PROJECT_STAGING_TRIAGED'
  | 'FEEDBACK_SENT';
  // NOTE: ROLE_CHANGED and PROJECT_SOFT_DELETED removed — no endpoint
  // anywhere in the backend can fire them (no "change role" or "delete
  // project" feature exists yet), so they only ever showed up as
  // permanently-empty filter options. Add them back only alongside
  // actually building those features.
  //
  // STAGING_REVIEW_APPROVED/DECLINED also removed — Management's decision
  // on a "not sure" staged project now logs under CYCLE_ADDITION_APPROVED/
  // CYCLE_ADDITION_DECLINED instead of its own near-duplicate pair. Both
  // represent "someone approved/declined a project" from the reader's
  // perspective; which workflow triggered it is still in `details`.

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: 'Login',
  LOGIN_FAILED: 'Failed Login',
  LOGOUT: 'Logout',
  REGISTRATION_APPROVED: 'Registration Approved',
  REGISTRATION_REJECTED: 'Registration Rejected',
  CSAT_CYCLE_CREATED: 'CSAT Cycle Created',
  PROJECT_ENROLLED: 'Project Added to Cycle',
  CYCLE_ELIGIBILITY_CHANGED: 'Eligibility Changed',
  CYCLE_ADDITION_APPROVED: 'Project Addition Approved',
  CYCLE_ADDITION_DECLINED: 'Project Addition Declined',
  PROJECT_STAGING_TRIAGED: 'Project Triaged (Staging)',
  FEEDBACK_SENT: 'Feedback Sent',
};

export interface AuditLogEntry {
  id: number;
  actor_emp_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: AuditAction | string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;   // JSON string; parse on demand for the detail view
  ip_address: string | null;
  success: boolean;
  created_at: string;
}

export interface AuditLogListResponse {
  data: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

export interface AuditLogFilters {
  skip: number;
  limit: number;
  action?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  success?: boolean;
}
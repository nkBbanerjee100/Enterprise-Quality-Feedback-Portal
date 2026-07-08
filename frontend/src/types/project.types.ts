/**
 * Project types — sourced from TMS (tsms_projects)
 *
 * Field mapping (TMS column → JSON snake_case):
 *   Id                         → project_id
 *   OcnId                      → customer_id
 *   Name                       → project_name
 *   StartDate / EndDate        → start_date / end_date
 *   PmId / DMId                → project_manager_id / delivery_manager_id
 *   AdditionalPmId/DMId        → additional_pm_id / additional_dm_id
 *   LocId / SubLocId           → location_id / sub_location_id
 *   IsInternalProject          → is_internal
 *   IsCustomerApprovalRequired → is_customer_approval_required
 *   CreditTerms                → credit_terms
 *   TSATValue                  → tsat_value
 *   RiskRYG                    → risk_status  ("Red" | "Yellow" | "Green" | null)
 *   IsProjectActive            → is_active
 */

export interface TMSProject {
  project_id:                   number;
  customer_id:                  number | null;
  project_name:                 string;
  start_date:                   string | null;   // ISO datetime string
  end_date:                     string | null;
  project_manager_id:           string | null;
  delivery_manager_id:          string | null;
  additional_pm_id:             string | null;
  additional_dm_id:             string | null;
  location_id:                  number | null;
  sub_location_id:              number | null;
  is_internal:                  boolean;
  is_customer_approval_required: boolean;
  credit_terms:                 string | null;
  tsat_value:                   number | null;
  risk_status:                  'Red' | 'Yellow' | 'Green' | null;
  is_active:                    boolean;
  // Resolved via TMS's PmId -> EmpId/FinanceId/UserId match — project_manager_id
  // above is the raw, possibly-ambiguous PmId; these are the actual person.
  project_manager_name?:        string | null;
  project_manager_emp_id?:      string | null;
  project_manager_email?:       string | null;
}

export interface TMSProjectListResponse {
  total:    number;
  skip:     number;
  limit:    number;
  projects: TMSProject[];
}

export interface TMSProjectFilters {
  search?:    string;
  is_active?: boolean;
}

export type RiskStatus = 'Red' | 'Yellow' | 'Green';
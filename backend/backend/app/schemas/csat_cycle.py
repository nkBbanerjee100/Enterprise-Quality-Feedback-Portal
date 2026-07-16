"""CSAT Cycle schemas"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class CycleHalf(str, Enum):
    H1 = "H1"   # APR–SEP
    H2 = "H2"   # OCT–MAR (next year)


class EligibilityStatus(str, Enum):
    ELIGIBLE = "eligible"
    EXEMPTED = "exempted"
    # The three values below are legacy-only — produced by the old manager
    # exemption-escalation flow, which has been removed. Kept so any
    # enrollment rows created before this change still deserialize/display
    # correctly; no new row can reach these states anymore.
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    DECLINED = "declined"


class AdditionApprovalStatus(str, Enum):
    """Separate from EligibilityStatus — gates adding a project to a cycle
    at all. Mirrors the exact chain in app/models/cycle_project_enrollment.py."""
    PENDING_MANAGEMENT_EXEMPTION_REVIEW = "pending_management_exemption_review"
    PENDING_MANAGER_REVIEW = "pending_manager_review"
    PENDING_QUALITY_RECHECK = "pending_quality_recheck"
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"
    APPROVED = "approved"
    DECLINED = "declined"
    PENDING = "pending"   # legacy — no longer set by new code


# ─── CSAT Cycle CRUD ──────────────────────────────────────────────────────────

class CSATCycleCreate(BaseModel):
    cycle_name: str
    description: Optional[str] = None
    year: int
    half: CycleHalf                 # H1 or H2 — drives start/end date


class CSATCycleUpdate(BaseModel):
    cycle_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CSATCycleResponse(BaseModel):
    id: int
    cycle_name: str
    description: Optional[str]
    start_date: datetime
    end_date: datetime
    is_active: bool
    year: Optional[int]
    half: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Project inside a cycle ───────────────────────────────────────────────────

class EnrolledProjectResponse(BaseModel):
    enrollment_id: int
    project_id: int
    project_ext_id: str          # TMS project_id string
    project_name: str
    is_active: bool              # project active status (from dim_projects)
    eligibility_status: EligibilityStatus
    exemption_reason: Optional[str]
    notes: Optional[str]
    enrolled_by: Optional[str] = None
    enrolled_at: datetime
    approval_requested_at: Optional[datetime]
    manager_remarks: Optional[str]
    approved_or_declined_at: Optional[datetime]

    # ── Addition-approval (separate from the exemption flow above) ─────────
    addition_approval_status: AdditionApprovalStatus
    addition_approved_by: Optional[str] = None
    addition_approved_at: Optional[datetime] = None
    addition_decision_remarks: Optional[str] = None
    project_manager_emp_id: Optional[str] = None
    project_manager_name: Optional[str] = None
    can_approve_addition: bool = False   # computed per-request based on the caller

    # ── Chain tracking — mirrors project_staging's fields exactly ──────────
    manager_emp_id: Optional[str] = None
    manager_decided_by: Optional[str] = None
    manager_decided_at: Optional[datetime] = None
    quality_recheck_by: Optional[str] = None
    quality_recheck_at: Optional[datetime] = None

    # ── Feedback — whether a survey has already gone out/come back for
    # this project in THIS cycle, so the UI can stop offering to re-send
    # once a customer has actually submitted it. ───────────────────────────
    feedback_request_id: Optional[int] = None
    feedback_status: Optional[str] = None       # 'draft' | 'sent' | 'completed' | 'expired' | 'cancelled'
    pm_approval_status: Optional[str] = None     # 'pending_pm' | 'approved' | 'rejected'

    class Config:
        from_attributes = True


class DeclineAdditionRequest(BaseModel):
    remarks: Optional[str] = None


# ─── Enrollment actions ───────────────────────────────────────────────────────

class EnrollTriageAction(str, Enum):
    """What Quality/Management decides for each project being enrolled —
    mirrors project_staging.TriageAction exactly."""
    ELIGIBLE = "eligible"
    EXEMPTED = "exempted"


class EnrollProjectItem(BaseModel):
    tms_project_id: int
    action: EnrollTriageAction = EnrollTriageAction.ELIGIBLE
    exemption_reason: Optional[str] = None   # required when action == exempted


class EnrollProjectsRequest(BaseModel):
    """Enroll one or more projects into a cycle. `items` is the modern
    per-project eligible/exempt form (mirrors project_staging's /select);
    `tms_project_ids` is kept as a fallback for simple all-eligible adds
    (e.g. a Manager adding their own project) — provide exactly one of the
    two."""
    tms_project_ids: Optional[List[int]] = None
    items: Optional[List[EnrollProjectItem]] = None


class ManagerCycleDecisionRequest(BaseModel):
    """The project's own Manager deciding an enrollment sitting in
    pending_manager_review."""
    decision: EnrollTriageAction
    exemption_reason: Optional[str] = None   # required when decision == exempted


class QualityCycleRecheckRequest(BaseModel):
    """Quality rechecking an enrollment the Manager just exempted."""
    decision: EnrollTriageAction
    exemption_reason: Optional[str] = None   # required when decision == exempted


class ManagementCycleExemptionDecisionRequest(BaseModel):
    """Management approving/rejecting Quality's initial exemption request."""
    approve: bool
    remarks: Optional[str] = None


class SetEligibilityRequest(BaseModel):
    """Set a project's eligibility (eligible / exempted). Final — no further
    review step; the Manager has no role in this decision."""
    eligibility_status: EligibilityStatus
    exemption_reason: Optional[str] = None
    notes: Optional[str] = None


class RequestManagerApprovalRequest(BaseModel):
    """Request manager approval for an exempted project"""
    exemption_reason: Optional[str] = None


class ManagerDecisionRequest(BaseModel):
    """Manager approves or declines a pending-approval project"""
    decision: EligibilityStatus     # must be APPROVED or DECLINED
    manager_remarks: Optional[str] = None
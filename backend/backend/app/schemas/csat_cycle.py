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
    """Separate from EligibilityStatus — gates adding a project to a cycle at all."""
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


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

    class Config:
        from_attributes = True


class DeclineAdditionRequest(BaseModel):
    remarks: Optional[str] = None


# ─── Enrollment actions ───────────────────────────────────────────────────────

class EnrollProjectsRequest(BaseModel):
    """Enroll one or more projects into a cycle"""
    tms_project_ids: List[int]      # TMS tsms_projects.Id list (auto-synced to dim_projects)


class SetEligibilityRequest(BaseModel):
    """Set a project's eligibility (eligible / exempted). Final — no further
    review step; the Manager has no role in this decision."""
    eligibility_status: EligibilityStatus
    exemption_reason: Optional[str] = None
    notes: Optional[str] = None
"""Project staging schemas — the pre-cycle project triage pool.

See app/models/project_staging.py for the full Quality -> Manager ->
Quality -> Management state machine these schemas drive.
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class StagingStatus(str, Enum):
    PENDING_MANAGEMENT_EXEMPTION_REVIEW = "pending_management_exemption_review"
    PENDING_MANAGER_REVIEW = "pending_manager_review"
    PENDING_QUALITY_RECHECK = "pending_quality_recheck"
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"
    ELIGIBLE = "eligible"
    EXEMPTED = "exempted"


class TriageAction(str, Enum):
    """What Quality decides when first selecting a candidate project.
    Eligible routes to the project's Manager; Exempt is final immediately
    (mandatory reason required)."""
    ELIGIBLE = "eligible"
    EXEMPTED = "exempted"


class SelectProjectItem(BaseModel):
    tms_project_id: int
    action: TriageAction
    exemption_reason: Optional[str] = None   # required when action == exempted


class SelectProjectsRequest(BaseModel):
    items: list[SelectProjectItem]


class ManagerStagingDecisionRequest(BaseModel):
    """The project's own Manager deciding a project sitting in
    pending_manager_review."""
    decision: TriageAction   # eligible | exempted
    exemption_reason: Optional[str] = None   # required when decision == exempted


class QualityRecheckRequest(BaseModel):
    """Quality rechecking a project the Manager just exempted."""
    decision: TriageAction   # eligible | exempted
    exemption_reason: Optional[str] = None   # required when decision == exempted


class ManagementStagingDecisionRequest(BaseModel):
    approve: bool
    remarks: Optional[str] = None   # required (as the exemption reason) when approve=False


class StagedProjectResponse(BaseModel):
    staging_id: int
    project_id: int
    project_ext_id: str
    project_name: str
    is_active: bool
    status: StagingStatus
    selected_by: str
    selected_at: datetime
    manager_emp_id: Optional[str] = None
    manager_name: Optional[str] = None
    manager_decided_by: Optional[str] = None
    manager_decided_at: Optional[datetime] = None
    quality_recheck_by: Optional[str] = None
    quality_recheck_at: Optional[datetime] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_remarks: Optional[str] = None
    exemption_reason: Optional[str] = None
    # A plain-language note explaining a conflict in this project's chain —
    # e.g. "Quality and Management chose to keep this project despite ...'s
    # exemption" or "Quality wanted to exempt this, but Management
    # disagreed — it's your call." None when there's no conflict to explain.
    conflict_note: Optional[str] = None

    class Config:
        from_attributes = True


class StagingCandidateResponse(BaseModel):
    """A TMS project available to be selected, merged with its current
    staging status if it's already been picked up by someone."""
    project_ext_id: str
    project_name: str
    is_active: bool
    end_date: Optional[str] = None
    start_date: Optional[str] = None
    bucket: str   # 'active' | 'completed'
    staging_status: Optional[StagingStatus] = None   # None = not yet selected
    staging_id: Optional[int] = None
    project_manager_emp_id: Optional[str] = None
    project_manager_name: Optional[str] = None


class CreateCycleFromStagingRequest(BaseModel):
    cycle_name: str
    description: Optional[str] = None
    year: int
    half: str          # 'H1' | 'H2' — drives start/end date, same as CSATCycleCreate
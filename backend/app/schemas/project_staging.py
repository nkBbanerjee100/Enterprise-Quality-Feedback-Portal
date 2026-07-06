"""Project staging schemas — the pre-cycle project triage pool."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class StagingStatus(str, Enum):
    ELIGIBLE = "eligible"
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"
    EXEMPTED = "exempted"


class TriageAction(str, Enum):
    """What Quality decides when selecting a candidate project."""
    ELIGIBLE = "eligible"      # sure it belongs — goes straight in
    NOT_SURE = "not_sure"      # send to Management to decide
    EXEMPTED = "exempted"      # sure it doesn't belong — excluded


class SelectProjectItem(BaseModel):
    tms_project_id: int
    action: TriageAction


class SelectProjectsRequest(BaseModel):
    items: list[SelectProjectItem]


class ManagementStagingDecisionRequest(BaseModel):
    approve: bool
    remarks: Optional[str] = None


class StagedProjectResponse(BaseModel):
    staging_id: int
    project_id: int
    project_ext_id: str
    project_name: str
    is_active: bool
    status: StagingStatus
    selected_by: str
    selected_at: datetime
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_remarks: Optional[str] = None

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

"""
Project staging — the pre-cycle triage pool.

Before a CSAT cycle exists, Quality selects candidate TMS projects and
triages each one:
  - eligible                  → ready to go straight into the next cycle
  - pending_management_review → Quality wasn't sure; Management decides
  - exempted                  → Quality is sure it doesn't belong; excluded

This is intentionally separate from CycleProjectEnrollment's own
addition-approval flow — that one gates adding MORE projects to an
ALREADY-EXISTING cycle later, and still goes to Management or the specific
project's Manager (PM). This one is a Management-only review of the initial
project pool, before any cycle exists at all.
"""
import enum
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.models import Base


class StagingStatus(str, enum.Enum):
    ELIGIBLE = "eligible"
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"
    EXEMPTED = "exempted"


class ProjectStaging(Base):
    """One row per TMS project a Quality user has pulled into the staging pool."""
    __tablename__ = "project_staging"

    id = Column(Integer, primary_key=True)

    project_id = Column(Integer, nullable=False, index=True)      # dim_projects.id (local)
    project_ext_id = Column(String(50), nullable=False, index=True)  # TMS project id, as string

    status = Column(String(30), default=StagingStatus.ELIGIBLE, nullable=False)

    selected_by = Column(String(50), nullable=False)   # emp_id of the Quality/Management user who triaged it
    selected_at = Column(DateTime, server_default=func.now())

    decided_by = Column(String(50), nullable=True)     # Management emp_id who approved/declined a "not sure"
    decided_at = Column(DateTime, nullable=True)
    decision_remarks = Column(Text, nullable=True)

    # Set once this staged project has been enrolled into a real cycle via
    # the "create cycle from staging" step — excluded from the active pool
    # after that, so it doesn't show up again for a future round.
    converted_cycle_id = Column(Integer, nullable=True)
    converted_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ProjectStaging project_ext_id={self.project_ext_id} status={self.status}>"

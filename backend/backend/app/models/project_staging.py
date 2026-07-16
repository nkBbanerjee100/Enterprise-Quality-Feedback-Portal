"""
Project staging — the pre-cycle triage pool.

Workflow (each exemption anywhere in this chain requires a mandatory
reason):

  1. Quality reviews a candidate project:
       - Eligible  -> goes to the project's own Manager (PM) for review.
       - Exempt    -> mandatory reason; goes to Management to approve or
                      reject the exemption.

  1b. Management decides Quality's exemption request:
       - Approve exemption -> final Exempt.
       - Reject exemption  -> project is now Eligible; goes to the
                               project's own Manager for review, same as
                               if Quality had marked it Eligible directly.

  2. The project's Manager reviews it (only they can — matched against the
     TMS PmId):
       - Eligible  -> final. Added straight in — no further Quality/
                      Management review needed.
       - Exempt    -> mandatory reason; goes BACK to Quality to recheck.

  3. Quality rechecks (only reached after a Manager exemption):
       - Exempt    -> mandatory reason; OUT of the cycle immediately, final.
       - Eligible  -> goes to Management for a final decision.

  4. Management makes the final call (only reached after Quality reaffirms
     eligible post-Manager-exemption):
       - Approve   -> final Eligible.
       - Decline   -> mandatory reason; final Exempt.

This is intentionally separate from CycleProjectEnrollment's own
addition-approval flow — that one gates adding MORE projects to an
ALREADY-EXISTING cycle later (see csat_cycles.py's enroll_projects), and a
Manager there can also add their own projects directly, auto-approved. This
one is the pre-cycle triage of the initial project pool, before any cycle
exists at all.
"""
import enum
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.models import Base


class StagingStatus(str, enum.Enum):
    PENDING_MANAGEMENT_EXEMPTION_REVIEW = "pending_management_exemption_review"  # Quality requested exempt; Management approves/rejects the exemption
    PENDING_MANAGER_REVIEW = "pending_manager_review"        # Quality said eligible (or Management rejected an exemption); waiting on the project's Manager
    PENDING_QUALITY_RECHECK = "pending_quality_recheck"      # Manager exempted (with reason); back to Quality
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"  # Quality reaffirmed eligible after a Manager exemption; Management has the final call
    ELIGIBLE = "eligible"      # final — ready for the cycle
    EXEMPTED = "exempted"      # final — excluded; always carries exemption_reason


class ProjectStaging(Base):
    """One row per TMS project a Quality user has pulled into the staging pool."""
    __tablename__ = "project_staging"

    id = Column(Integer, primary_key=True)

    project_id = Column(Integer, nullable=False, index=True)      # dim_projects.id (local)
    project_ext_id = Column(String(50), nullable=False, index=True)  # TMS project id, as string

    status = Column(String(30), default=StagingStatus.PENDING_MANAGER_REVIEW, nullable=False)

    selected_by = Column(String(50), nullable=False)   # emp_id of the Quality user who triaged it
    selected_at = Column(DateTime, server_default=func.now())

    # The project's assigned Manager (TMS PmId), resolved and cached the
    # moment Quality marks it eligible — so the manager-decide endpoint can
    # check "is this you?" without a fresh TMS round trip, and so the pool
    # listing can show/filter "awaiting review from" without one either.
    manager_emp_id = Column(String(50), nullable=True)
    manager_decided_by = Column(String(50), nullable=True)
    manager_decided_at = Column(DateTime, nullable=True)

    quality_recheck_by = Column(String(50), nullable=True)
    quality_recheck_at = Column(DateTime, nullable=True)

    decided_by = Column(String(50), nullable=True)     # Management emp_id who made the final approve/decline
    decided_at = Column(DateTime, nullable=True)
    decision_remarks = Column(Text, nullable=True)

    # Mandatory whenever status becomes EXEMPTED, regardless of which stage
    # (Quality's initial pass, Quality's recheck, or Management's final
    # decline) produced it — always reflects the reason for the CURRENT
    # exemption, not necessarily the first one along the way.
    exemption_reason = Column(Text, nullable=True)

    # Set once this staged project has been enrolled into a real cycle via
    # the "create cycle from staging" step — excluded from the active pool
    # after that, so it doesn't show up again for a future round.
    converted_cycle_id = Column(Integer, nullable=True)
    converted_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ProjectStaging project_ext_id={self.project_ext_id} status={self.status}>"

"""Cycle-Project Enrollment model
Tracks which projects are enrolled in a CSAT cycle and their eligibility status.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.models import Base


class EligibilityStatus(str, enum.Enum):
    ELIGIBLE = "eligible"
    EXEMPTED = "exempted"          # marked not-eligible by quality team — final, no further review
    # The three values below are legacy-only, from the now-removed manager
    # exemption-escalation flow (exempted → pending_approval → manager
    # approve/decline). No new enrollment can reach these anymore; kept only
    # so pre-existing rows still deserialize/display correctly.
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    DECLINED = "declined"


class AdditionApprovalStatus(str, enum.Enum):
    """
    Separate from EligibilityStatus / the exemption-approval flow above.
    Gates the *addition* of a project to a cycle — mirrors the exact same
    Quality -> Manager chain as the pre-cycle project_staging pool (see
    app/models/project_staging.py), just scoped to a project being added to
    an ALREADY-EXISTING cycle instead:

      Quality/Management enrolls a project:
        eligible -> pending_manager_review (project's own Manager reviews)
        exempted -> mandatory reason; pending_management_exemption_review
                    (Management approves/rejects the exemption)
      Management decides an exemption request:
        approve -> final DECLINED
        reject  -> final APPROVED, straight onto the eligible list — no
                   Manager hand-off, Management's reject IS the decision
      The project's Manager decides (pending_manager_review, reached only
      via Quality marking eligible directly) — FINAL, no further review:
        eligible -> final APPROVED
        exempted -> mandatory reason; final DECLINED

    A Manager adding one of their OWN projects directly (see enroll_projects)
    skips this whole chain — instantly APPROVED, no review needed.

    PENDING_QUALITY_RECHECK and PENDING_MANAGEMENT_REVIEW are legacy values
    only — no longer set by new code. Previously a Manager's exemption
    bounced to Quality, who could reaffirm eligible and send it to
    Management for a second final call; that three-role ping-pong is gone,
    the Manager's own call is now final. Kept so pre-existing rows already
    in one of these states still deserialize/display correctly.
    """
    PENDING_MANAGEMENT_EXEMPTION_REVIEW = "pending_management_exemption_review"
    PENDING_MANAGER_REVIEW = "pending_manager_review"
    APPROVED = "approved"   # final — added to the cycle
    DECLINED = "declined"   # final — excluded (eligibility_status becomes EXEMPTED)
    PENDING_QUALITY_RECHECK = "pending_quality_recheck"      # legacy
    PENDING_MANAGEMENT_REVIEW = "pending_management_review"  # legacy
    # Legacy value — no longer set by new code, kept only so pre-existing
    # rows from before this chain existed still deserialize/display fine.
    PENDING = "pending"


class CycleProjectEnrollment(Base):
    """Join table: csat_cycles ↔ dim_projects with eligibility tracking"""
    __tablename__ = "cycle_project_enrollments"

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("csat_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("dim_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    eligibility_status = Column(
        String(30),
        default=EligibilityStatus.ELIGIBLE,
        nullable=False,
    )
    exemption_reason = Column(Text, nullable=True)   # reason if exempted
    notes = Column(Text, nullable=True)
    enrolled_by = Column(String(50), nullable=True)  # emp_id of who enrolled
    enrolled_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    # Manager approval fields (exemption → pending_approval → approved/declined flow)
    approval_requested_at = Column(DateTime, nullable=True)
    approval_requested_by = Column(String(50), nullable=True)
    approved_or_declined_by = Column(String(50), nullable=True)
    approved_or_declined_at = Column(DateTime, nullable=True)
    manager_remarks = Column(Text, nullable=True)

    # ── Addition-approval fields (separate flow — gates the act of adding a
    #    project to the cycle at all, not its eligibility) ─────────────────
    addition_approval_status = Column(
        String(40),
        default=AdditionApprovalStatus.PENDING,
        nullable=False,
    )
    addition_approved_by = Column(String(50), nullable=True)   # emp_id of Management/Manager who decided
    addition_approved_at = Column(DateTime, nullable=True)
    addition_decision_remarks = Column(Text, nullable=True)

    # ── Chain-tracking columns — mirror project_staging's Manager/Quality
    #    recheck fields exactly, same purpose here. ─────────────────────────
    manager_emp_id = Column(String(50), nullable=True)         # the project's assigned Manager (TMS PmId), cached
    manager_decided_by = Column(String(50), nullable=True)
    manager_decided_at = Column(DateTime, nullable=True)
    quality_recheck_by = Column(String(50), nullable=True)
    quality_recheck_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<CycleProjectEnrollment cycle={self.cycle_id} project={self.project_id} status={self.eligibility_status}>"
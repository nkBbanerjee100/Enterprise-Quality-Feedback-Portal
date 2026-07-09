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
    Gates the *addition* of a project to a cycle: whenever Quality/Management
    enrolls a project, Management + the project's Manager (PM) are notified
    and must approve the addition itself before it's considered confirmed.
    """
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


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
        String(30),
        default=AdditionApprovalStatus.PENDING,
        nullable=False,
    )
    addition_approved_by = Column(String(50), nullable=True)   # emp_id of Management/Manager who decided
    addition_approved_at = Column(DateTime, nullable=True)
    addition_decision_remarks = Column(Text, nullable=True)

    def __repr__(self):
        return f"<CycleProjectEnrollment cycle={self.cycle_id} project={self.project_id} status={self.eligibility_status}>"

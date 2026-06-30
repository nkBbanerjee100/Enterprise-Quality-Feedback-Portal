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
    EXEMPTED = "exempted"          # marked not-eligible by quality team
    PENDING_APPROVAL = "pending_approval"   # exempted → awaiting manager approval
    APPROVED = "approved"          # manager approved → becomes eligible
    DECLINED = "declined"          # manager declined → removed from cycle


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

    # Manager approval fields
    approval_requested_at = Column(DateTime, nullable=True)
    approval_requested_by = Column(String(50), nullable=True)
    approved_or_declined_by = Column(String(50), nullable=True)
    approved_or_declined_at = Column(DateTime, nullable=True)
    manager_remarks = Column(Text, nullable=True)

    def __repr__(self):
        return f"<CycleProjectEnrollment cycle={self.cycle_id} project={self.project_id} status={self.eligibility_status}>"

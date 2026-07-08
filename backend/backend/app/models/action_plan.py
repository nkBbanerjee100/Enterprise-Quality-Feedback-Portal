"""Action Plan and RCA model"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base


class ActionPlan(Base):
    """Action plans and Root Cause Analysis"""
    __tablename__ = "action_plans"

    id = Column(Integer, primary_key=True)
    feedback_response_id = Column(Integer, ForeignKey("fact_feedback_response.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    root_cause = Column(Text)
    proposed_action = Column(Text)
    owner = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_completion_date = Column(DateTime)
    status = Column(String(50), default="open", nullable=False)  # open, in_progress, closed
    is_closed = Column(Boolean, default=False, nullable=False)
    closed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    def __repr__(self):
        return f"<ActionPlan {self.title}>"

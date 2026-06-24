"""Feedback Status History model (fact_feedback_status_history)"""
from sqlalchemy import Column, Integer, DateTime, ForeignKey, String, Text
from sqlalchemy.sql import func
from app.models import Base


class FeedbackStatusHistory(Base):
    """Fact table for feedback status tracking"""
    __tablename__ = "fact_feedback_status_history"

    id = Column(Integer, primary_key=True)
    feedback_request_id = Column(Integer, ForeignKey("fact_feedback_request.id"), nullable=False)
    old_status = Column(String(50))
    new_status = Column(String(50), nullable=False)
    reason = Column(Text)
    changed_by = Column(Integer, ForeignKey("users.id"))
    changed_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<FeedbackStatusHistory {self.id}>"

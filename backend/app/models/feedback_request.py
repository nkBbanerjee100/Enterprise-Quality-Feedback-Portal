"""Feedback Request model (fact_feedback_request)"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base


class FeedbackRequest(Base):
    """Fact table for feedback requests"""
    __tablename__ = "fact_feedback_request"

    id = Column(Integer, primary_key=True)
    csat_cycle_id = Column(Integer, ForeignKey("csat_cycles.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("dim_projects.id"), nullable=False)
    recipient_email = Column(String(255), nullable=False, index=True)
    recipient_name = Column(String(255), nullable=False)
    feedback_url = Column(String(500))
    request_sent_at = Column(DateTime)
    reminder_sent_at = Column(DateTime)
    status = Column(String(50), default="pending", nullable=False)  # pending, sent, completed
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<FeedbackRequest {self.recipient_email}>"

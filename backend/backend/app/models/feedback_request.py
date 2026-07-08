"""Feedback Request model (fact_feedback_request)"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base
 
 
class FeedbackRequest(Base):
    """Fact table for feedback requests"""
    __tablename__ = "fact_feedback_request"
 
    id = Column(Integer, primary_key=True)
    csat_cycle_id = Column(Integer, ForeignKey("csat_cycles.id"), nullable=True)   # nullable for standalone sends
    project_id = Column(Integer, ForeignKey("dim_projects.id"), nullable=False)
    recipient_email = Column(String(255), nullable=False, index=True)
    recipient_name = Column(String(255), nullable=False)
    cc_emails = Column(Text, nullable=True)   # comma-separated list, optional
 
    # ── Token for the public survey link ──────────────────────────────────────
    token = Column(String(128), unique=True, nullable=True, index=True)
    # e.g.  http://localhost:3000/survey/<token>
    feedback_url = Column(String(500))
    expires_at = Column(DateTime, nullable=True)          # 30 days after send
 
    request_sent_at = Column(DateTime)
    reminder_sent_at = Column(DateTime)
    status = Column(String(50), default="draft", nullable=False)  # draft, sent, completed, expired, cancelled
    created_at = Column(DateTime, server_default=func.now())

    # ── PM-approval workflow fields ─────────────────────────────────────────
    period_of_performance = Column(String(255), nullable=True)
    message = Column(Text, nullable=True)  # Quality's personal note, carried through to the eventual customer email
    pm_achievements = Column(Text, nullable=True)      # PM's CSAT-period achievements — pre-filled read-only on the customer survey
    pm_approval_status = Column(String(50), default="pending_pm", nullable=False)  # pending_pm, approved, rejected
    pm_rejection_comments = Column(Text, nullable=True)

    def __repr__(self):
        return f"<FeedbackRequest {self.recipient_email}>"
<<<<<<< HEAD
"""Feedback Response model (fact_feedback_response)"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, JSON
from sqlalchemy.sql import func
from app.models import Base


class FeedbackResponse(Base):
    """Fact table for feedback responses"""
    __tablename__ = "fact_feedback_response"

    id = Column(Integer, primary_key=True)
    feedback_request_id = Column(Integer, ForeignKey("fact_feedback_request.id"), nullable=False)

    # ── Per-question answer (one row per question) ────────────────────────────
    question_id  = Column(Integer, nullable=True)    # matches SurveyQuestion.id on frontend
    answer_value = Column(Text, nullable=True)        # rating as "1"–"5", or free-text

    # ── Legacy aggregate fields (kept for backward compat) ───────────────────
    csat_score    = Column(Float, nullable=True)
    nps_score     = Column(Float, nullable=True)
    comments      = Column(Text)
    response_data = Column(JSON)   # optional extra payload

    submitted_at = Column(DateTime, nullable=False, server_default=func.now())
    created_at   = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<FeedbackResponse {self.id}>"
=======
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
 
    # ── Token for the public survey link ──────────────────────────────────────
    token = Column(String(128), unique=True, nullable=True, index=True)
    # e.g.  http://localhost:3000/survey/<token>
    feedback_url = Column(String(500))
    expires_at = Column(DateTime, nullable=True)          # 30 days after send
 
    request_sent_at = Column(DateTime)
    reminder_sent_at = Column(DateTime)
    status = Column(String(50), default="pending", nullable=False)  # pending, sent, completed
    created_at = Column(DateTime, server_default=func.now())
 
    def __repr__(self):
        return f"<FeedbackRequest {self.recipient_email}>"
 
 
>>>>>>> 2717a996be02dd42ed1b042f2f9856e5451246bf

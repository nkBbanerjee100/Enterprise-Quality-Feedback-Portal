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
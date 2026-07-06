"""Feedback Request model (fact_feedback_request)"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base
<<<<<<< HEAD


class FeedbackRequest(Base):
    """Fact table for feedback requests"""
    __tablename__ = "fact_feedback_request"

=======
 
 
class FeedbackRequest(Base):
    """Fact table for feedback requests"""
    __tablename__ = "fact_feedback_request"
 
>>>>>>> 2717a996be02dd42ed1b042f2f9856e5451246bf
    id = Column(Integer, primary_key=True)
    csat_cycle_id = Column(Integer, ForeignKey("csat_cycles.id"), nullable=True)   # nullable for standalone sends
    project_id = Column(Integer, ForeignKey("dim_projects.id"), nullable=False)
    recipient_email = Column(String(255), nullable=False, index=True)
    recipient_name = Column(String(255), nullable=False)
<<<<<<< HEAD

=======
 
>>>>>>> 2717a996be02dd42ed1b042f2f9856e5451246bf
    # ── Token for the public survey link ──────────────────────────────────────
    token = Column(String(128), unique=True, nullable=True, index=True)
    # e.g.  http://localhost:3000/survey/<token>
    feedback_url = Column(String(500))
    expires_at = Column(DateTime, nullable=True)          # 30 days after send
<<<<<<< HEAD

=======
 
>>>>>>> 2717a996be02dd42ed1b042f2f9856e5451246bf
    request_sent_at = Column(DateTime)
    reminder_sent_at = Column(DateTime)
    status = Column(String(50), default="pending", nullable=False)  # pending, sent, completed
    created_at = Column(DateTime, server_default=func.now())
<<<<<<< HEAD
    period_of_performance = Column(String(255), nullable=True)
    pm_achievements = Column(Text, nullable=True)

    def __repr__(self):
        return f"<FeedbackRequest {self.recipient_email}>"
=======
 
    def __repr__(self):
        return f"<FeedbackRequest {self.recipient_email}>"
 
 
>>>>>>> 2717a996be02dd42ed1b042f2f9856e5451246bf

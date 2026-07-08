"""Audit Log model"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from app.models import Base


class AuditLog(Base):
    """Audit trail for compliance tracking"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    entity_type = Column(String(100), nullable=False)  # e.g., "feedback_response", "action_plan"
    entity_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)  # CREATE, UPDATE, DELETE
    changes = Column(JSON)  # What was changed
    ip_address = Column(String(50))
    user_agent = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<AuditLog {self.entity_type}:{self.entity_id}>"

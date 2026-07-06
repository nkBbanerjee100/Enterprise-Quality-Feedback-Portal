"""In-app notification model.

A notification is addressed either to:
  - a specific person  (recipient_emp_id set)   e.g. the project's Manager
  - a whole role       (recipient_role set)      e.g. everyone with role MANAGEMENT

Exactly one of the two should be set per row.

actor_emp_id records who performed the action that triggered this
notification. It's used purely for filtering: whoever did the thing never
sees a notification about their own action, even if they also happen to
belong to the recipient_role being broadcast to (e.g. a Management user who
enrolls a project themselves doesn't get notified about their own addition,
but every other Management user still does).
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base


class Notification(Base):
    """In-app notification"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)

    recipient_emp_id = Column(String(50), nullable=True, index=True)   # specific person (e.g. PM)
    recipient_role = Column(String(30), nullable=True, index=True)     # broadcast to a role (e.g. MANAGEMENT)
    actor_emp_id = Column(String(50), nullable=True, index=True)       # who performed the triggering action

    type = Column(String(50), nullable=False)         # e.g. "PROJECT_ADDED_TO_CYCLE"
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    cycle_id = Column(Integer, nullable=True)
    project_id = Column(Integer, nullable=True)        # dim_projects.id
    enrollment_id = Column(Integer, nullable=True)      # cycle_project_enrollments.id
    link = Column(String(500), nullable=True)           # frontend route to deep-link into

    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<Notification {self.type} -> {self.recipient_emp_id or self.recipient_role}>"
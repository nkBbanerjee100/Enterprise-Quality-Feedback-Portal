"""Notification schemas"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    cycle_id: Optional[int] = None
    project_id: Optional[int] = None
    enrollment_id: Optional[int] = None
    link: Optional[str] = None
    is_read: bool
    created_at: datetime
    # Live current status of the underlying staged project, for
    # type='STAGED_PROJECT_NEEDS_REVIEW' notifications only — lets the
    # frontend know whether this is still actionable *right now*, rather
    # than relying on is_read (which just means "seen", not "decided") or
    # any client-side-only state that resets on refresh/re-login.
    staging_status: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    data: list[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    unread_count: int
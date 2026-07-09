"""
Pydantic schemas for the Audit Logs feature.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AuditActions:
    """
    Central list of recognized action strings, so routers/services agree on
    naming instead of hand-typing strings that drift ("LOGIN" vs "login").
    Extend this list first when adding a new event to log.
    """
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    REGISTRATION_APPROVED = "REGISTRATION_APPROVED"
    REGISTRATION_REJECTED = "REGISTRATION_REJECTED"
    ROLE_CHANGED = "ROLE_CHANGED"
    CYCLE_ELIGIBILITY_CHANGED = "CYCLE_ELIGIBILITY_CHANGED"
    CYCLE_ADDITION_APPROVED = "CYCLE_ADDITION_APPROVED"
    CYCLE_ADDITION_DECLINED = "CYCLE_ADDITION_DECLINED"
    PROJECT_SOFT_DELETED = "PROJECT_SOFT_DELETED"
    FEEDBACK_SENT = "FEEDBACK_SENT"

    ALL = {
        LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT,
        REGISTRATION_APPROVED, REGISTRATION_REJECTED, ROLE_CHANGED,
        CYCLE_ELIGIBILITY_CHANGED, CYCLE_ADDITION_APPROVED,
        CYCLE_ADDITION_DECLINED, PROJECT_SOFT_DELETED, FEEDBACK_SENT,
    }


class AuditLogEntry(BaseModel):
    id: int
    actor_emp_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    success: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    data: list[AuditLogEntry]
    total: int
    skip: int
    limit: int
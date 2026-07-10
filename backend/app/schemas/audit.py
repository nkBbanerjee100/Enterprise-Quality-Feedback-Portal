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

    ROLE_CHANGED and PROJECT_SOFT_DELETED were removed on purpose — neither
    has a real endpoint anywhere in this app that could ever fire them
    (there's no "change a user's role" or "delete a project" feature built
    yet), so they only ever showed up as permanently-empty filter options.
    Add them back once those features actually exist.
    """
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    REGISTRATION_APPROVED = "REGISTRATION_APPROVED"
    REGISTRATION_REJECTED = "REGISTRATION_REJECTED"  # no reject endpoint exists yet either — kept since it wasn't explicitly asked to be removed, but it won't fire until one does

    CSAT_CYCLE_CREATED = "CSAT_CYCLE_CREATED"
    PROJECT_ENROLLED = "PROJECT_ENROLLED"
    CYCLE_ELIGIBILITY_CHANGED = "CYCLE_ELIGIBILITY_CHANGED"
    CYCLE_ADDITION_APPROVED = "CYCLE_ADDITION_APPROVED"
    CYCLE_ADDITION_DECLINED = "CYCLE_ADDITION_DECLINED"
    # NOTE: no MANAGER_APPROVAL_* constants — the exemption-escalation
    # endpoints (request_manager_approval / manager_decision) that would
    # have fired them don't exist anywhere in this codebase (confirmed by
    # searching every router and service). Add them back only alongside
    # actually building that flow — otherwise they're the same
    # permanently-empty-dropdown-option problem as ROLE_CHANGED/
    # PROJECT_SOFT_DELETED above.

    PROJECT_STAGING_TRIAGED = "PROJECT_STAGING_TRIAGED"
    # NOTE: no separate STAGING_REVIEW_APPROVED/DECLINED — Management's
    # decision on a "not sure" staged project (decide_staged_project) now
    # logs under CYCLE_ADDITION_APPROVED/CYCLE_ADDITION_DECLINED, the same
    # pair used when declining a project's addition to an already-existing
    # cycle. Both are "someone approved/declined a project" from the
    # reader's perspective — which workflow triggered it (pre-cycle staging
    # vs. an existing cycle) is still visible in `details`, it just isn't a
    # separate top-level action type anymore.

    FEEDBACK_SENT = "FEEDBACK_SENT"

    PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
    PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"

    ALL = {
        LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT,
        REGISTRATION_APPROVED, REGISTRATION_REJECTED,
        CSAT_CYCLE_CREATED, PROJECT_ENROLLED,
        CYCLE_ELIGIBILITY_CHANGED,
        CYCLE_ADDITION_APPROVED, CYCLE_ADDITION_DECLINED,
        PROJECT_STAGING_TRIAGED,
        FEEDBACK_SENT,
        PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED, PASSWORD_CHANGED,
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
"""
Audit logging helper.

Call `log_action(...)` from anywhere an event should be recorded (auth
routes, csat-cycle eligibility endpoints, registration approval endpoint,
etc). It deliberately never raises — a logging failure must never break
the actual user-facing action it's describing.
"""
import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger("audit")


def log_action(
    db: Session,
    *,
    action: str,
    actor_emp_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    success: bool = True,
    commit: bool = True,
) -> None:
    try:
        entry = AuditLog(
            actor_emp_id=actor_emp_id,
            actor_name=actor_name,
            actor_role=actor_role,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            details=json.dumps(details, default=str) if details else None,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
        )
        db.add(entry)
        if commit:
            db.commit()
    except Exception:
        # Never let audit logging take down the real request. Roll back just
        # this insert's dirty state and move on.
        logger.exception("Failed to write audit log entry for action=%s", action)
        db.rollback()


def get_client_ip(request) -> Optional[str]:
    """
    Best-effort client IP extraction. Prefers X-Forwarded-For (set by most
    reverse proxies / load balancers) and falls back to the direct socket
    address for local/dev setups.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
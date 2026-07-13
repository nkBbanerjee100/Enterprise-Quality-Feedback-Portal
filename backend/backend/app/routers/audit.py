"""
GET /api/audit-logs — paginated, filterable event history.

Restricted to whichever roles hold VIEW_AUDIT_LOGS in app/core/rbac.py
(currently QUALITY, MANAGEMENT, MANAGER) — same gate as the existing
/api/users/login-activity endpoint this sits alongside. Keep both
endpoints: login-activity is a cheap "who's active" snapshot, this one is
the full multi-event trail.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from app.database import get_local_db
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogEntry, AuditLogListResponse, AuditActions
from app.core.dependencies import require_role  # matches app/core/dependencies.py

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),  # mirrors the 200 cap used on the cycles endpoint
    action: Optional[str] = Query(None, description="Filter by exact action type, e.g. LOGIN_SUCCESS"),
    search: Optional[str] = Query(None, description="Matches actor name, emp_id, or role"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    success: Optional[bool] = Query(None, description="Filter to only successful or only failed events"),
    db: Session = Depends(get_local_db),
    _current_user=Depends(require_role("QUALITY", "MANAGEMENT", "MANAGER")),
):
    conditions = []

    if action:
        if action not in AuditActions.ALL:
            # Unknown action strings just yield an empty result rather than
            # a 400 — keeps the frontend filter dropdown forward-compatible
            # if it ever gets slightly out of sync with backend constants.
            return AuditLogListResponse(data=[], total=0, skip=skip, limit=limit)
        conditions.append(AuditLog.action == action)

    if search:
        like = f"%{search}%"
        conditions.append(
            (AuditLog.actor_name.ilike(like))
            | (AuditLog.actor_emp_id.ilike(like))
            | (AuditLog.actor_role.ilike(like))
        )

    if date_from:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        conditions.append(AuditLog.created_at <= date_to)

    if success is not None:
        conditions.append(AuditLog.success == success)

    base_query = select(AuditLog)
    count_query = select(func.count()).select_from(AuditLog)
    if conditions:
        base_query = base_query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    total = db.scalar(count_query) or 0

    rows = (
        db.execute(
            base_query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        )
        .scalars()
        .all()
    )

    return AuditLogListResponse(
        data=[AuditLogEntry.model_validate(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/actions", response_model=list[str])
def list_action_types(_current_user=Depends(require_role("QUALITY", "MANAGEMENT", "MANAGER"))):
    """Powers the action-type filter dropdown on the frontend."""
    return sorted(AuditActions.ALL)
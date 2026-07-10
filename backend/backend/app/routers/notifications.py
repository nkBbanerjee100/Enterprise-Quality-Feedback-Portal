"""In-app notifications — list, unread count, mark read."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import get_local_db
from app.core.dependencies import get_current_user
from app.models.notification import Notification
from app.models.project_staging import ProjectStaging
from app.schemas.notification import (
    NotificationResponse, NotificationListResponse, UnreadCountResponse,
)

router = APIRouter()

# Notification types whose "is this still actionable" state is tied to a
# live ProjectStaging row rather than being fixed at creation time.
_STAGING_LINKED_TYPES = {"STAGED_PROJECT_NEEDS_REVIEW"}


def _visible_filter(current_user: dict):
    """
    A notification is visible to the caller if:
      - it's addressed to them directly (recipient_emp_id), OR broadcast to
        their role (recipient_role)
      AND
      - they weren't the one who triggered it (actor_emp_id). Whoever
        performed an action never sees a notification about their own
        action, even if they also belong to the role it was broadcast to —
        everyone else in that role, or the other named recipient, still see
        it normally.
      AND
      - it was created on or after the user's own account creation time
        (joined_at). Without this, a brand-new signup — especially into a
        broadcast role like MANAGEMENT — would immediately see every
        historical notification ever sent to that role, going back before
        they ever existed in the system. Only notifications from the point
        they joined onward are relevant to them.
    """
    is_recipient = or_(
        Notification.recipient_emp_id == current_user["emp_id"],
        Notification.recipient_role == current_user["role"],
    )
    not_the_actor = or_(
        Notification.actor_emp_id.is_(None),
        Notification.actor_emp_id != current_user["emp_id"],
    )
    conditions = [is_recipient, not_the_actor]
    if current_user.get("joined_at"):
        conditions.append(Notification.created_at >= current_user["joined_at"])
    return and_(*conditions)


def _to_responses(items: list[Notification], db: Session) -> list[NotificationResponse]:
    """Attach each notification's LIVE current staging status (not a stale
    snapshot from when it was created) — this is what lets the frontend know
    whether Approve/Decline are still valid, correctly, even after a full
    logout/refresh where any client-side-only 'already decided' state would
    otherwise be lost."""
    staging_ids = [n.enrollment_id for n in items if n.type in _STAGING_LINKED_TYPES and n.enrollment_id]
    status_map: dict[int, str] = {}
    if staging_ids:
        rows = db.query(ProjectStaging.id, ProjectStaging.status).filter(
            ProjectStaging.id.in_(staging_ids)
        ).all()
        status_map = {r.id: r.status for r in rows}

    responses = []
    for n in items:
        resp = NotificationResponse.model_validate(n)
        if n.type in _STAGING_LINKED_TYPES and n.enrollment_id in status_map:
            resp.staging_status = status_map[n.enrollment_id]
        responses.append(resp)
    return responses


@router.get("/", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    q = db.query(Notification).filter(_visible_filter(current_user))
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712

    total = q.count()
    items = q.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()

    unread_count = db.query(Notification).filter(
        and_(_visible_filter(current_user), Notification.is_read == False)  # noqa: E712
    ).count()

    return NotificationListResponse(
        data=_to_responses(items, db),
        total=total,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    count = db.query(Notification).filter(
        and_(_visible_filter(current_user), Notification.is_read == False)  # noqa: E712
    ).count()
    return UnreadCountResponse(unread_count=count)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        _visible_filter(current_user),
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return _to_responses([n], db)[0]


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    updated = db.query(Notification).filter(
        and_(_visible_filter(current_user), Notification.is_read == False)  # noqa: E712
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"marked_read": updated}
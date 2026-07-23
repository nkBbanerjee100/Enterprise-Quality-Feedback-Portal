"""Feedback collection and management routes

Lifecycle of a feedback request (fact_feedback_request):
  1. Quality/Management creates a DRAFT (status='draft', pm_approval_status='pending_pm').
     No email is sent yet. The project's PM gets an in-app notification only.
  2. The PM reviews it and either:
       - approves it, entering their team's CSAT-period achievements
         (pm_approval_status='approved', pm_achievements=<text>) — Quality is
         notified in-app that it's ready to send, or
       - rejects it with mandatory comments (pm_approval_status='rejected',
         pm_rejection_comments=<text>) — Quality is notified in-app to fix it.
  3. If rejected, Quality edits the draft (PUT /requests/{id}) and it goes back
     to pending_pm for the PM to review again.
  4. Once approved, Quality confirms the actual send
     (POST /requests/{id}/send-to-customer) — only now is the customer
     actually emailed a survey link. The PM's achievements are carried into
     the customer-facing survey (GET /public?email=...) as a read-only field.
  5. The customer follows the emailed link to /survey-access, verifies their
     email via a one-time OTP (see auth/customer_otp), then lands on
     /survey?email=... — GET /public?email=... and POST /public/submit below
     are what that page actually calls. There is no token in this flow: the
     OTP verification recorded against the email IS the access control (see
     _has_verified_customer_access), checked fresh on every call.
"""
import json
import time
import string
import secrets
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status, Depends, Query, Request

from app.services.audit_service import log_action, get_client_ip
from app.schemas.audit import AuditActions
from app.schemas.feedback import EditDraftPayload

from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.utils.email import EmailSender
from app.config import settings
from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user, require_role
from app.models.notification import Notification
from app.services.cycle_notification_service import get_project_manager
router = APIRouter()

TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60


class FeedbackRequestPayload(BaseModel):
    projectId: int
    recipientEmail: str
    recipientName: str
    csatCycleId: Optional[int] = None
    message: Optional[str] = None
    cc: Optional[List[str]] = None
    periodOfPerformance: Optional[str] = None


class PMApprovePayload(BaseModel):
    pmAchievements: str
    recipientName: Optional[str] = None
    recipientEmail: Optional[str] = None


class PMRejectPayload(BaseModel):
    pmRejectionComments: str


class SurveySubmitPayload(BaseModel):
    """Matches what CustomerSurveyPage.tsx actually POSTs: email (identifies
    which request this is — the current design has no token, the verified
    OTP against this email IS the access control) plus a single rich data
    object (ratings, per-question comments, overall assessment, signature,
    etc.), not a flat list of {questionId, value} pairs. data is stored
    verbatim as JSON in fact_feedback_response.response_data."""
    email: str
    data: dict


# ── Email builders ──────────────────────────────────────────────────────────────

def _build_email_html(
    recipient_name: str,
    project_name: str,
    survey_link: str,
    personal_message: Optional[str],
) -> str:
    personal_block = ""
    if personal_message and personal_message.strip():
        personal_block = f"""
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:12px 16px;margin:20px 0;font-style:italic;color:#374151;">
          {personal_message.strip()}
        </div>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>

<body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">

  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#16a34a;padding:28px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#bbf7d0;letter-spacing:0.1em;text-transform:uppercase;">
        Mindteck · Quality Feedback Platform
      </p>

      <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">
        Your Feedback Matters
      </h1>
    </div>


    <div style="padding:28px 32px;">

      <p style="font-size:15px;color:#111827;margin:0 0 8px;">
        Dear <strong>{recipient_name}</strong>,
      </p>


      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Thank you for working with us on project <strong>{project_name}</strong>.
        We'd love to hear how your experience was.
      </p>


      {personal_block}


      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">
        Please open the survey access page and verify your email to receive your one-time OTP.
      </p>


      <div style="text-align:center;margin:28px 0;">

        <a href="{survey_link}" 
           style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">

          Open Survey Access

        </a>

      </div>


      <p style="font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">

        Or copy:
        <a href="{survey_link}" style="color:#16a34a;">
          {survey_link}
        </a>

      </p>


      <p style="font-size:12px;color:#6b7280;margin:16px 0 0;">

        You will receive a verification code after confirming your email address.

      </p>


    </div>


    <div style="background:#f3f4f6;padding:16px 32px;border-top:1px solid e5e7eb;">

      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        © 2026 CSAT Tool · Quality Dept · Mindteck
      </p>

    </div>


  </div>

</body>
</html>"""


def _build_email_text(
    recipient_name: str,
    project_name: str,
    survey_link: str,
    personal_message: Optional[str],
) -> str:

    lines = [
        f"Dear {recipient_name},",
        "",
        f"Thank you for working with us on project {project_name}.",
        "",
    ]

    if personal_message and personal_message.strip():
        lines += [
            personal_message.strip(),
            "",
        ]

    lines += [
        "Please open the survey access page and verify your email to receive your one-time OTP.",
        "",
        "Survey access page:",
        survey_link,
        "",
        "You will receive a verification code after confirming your email address.",
        "",
        "© 2026 CSAT Tool · Mindteck",
    ]

    return "\n".join(lines)


# ── Internal helpers ────────────────────────────────────────────────────────────

def _get_request_row(request_id: int, db: Session):
    row = db.execute(
        text("SELECT * FROM fact_feedback_request WHERE id = :id LIMIT 1"),
        {"id": request_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback request not found")
    return row


def _assert_is_assigned_pm(project_id: int, current_user: dict, tms_db: Session) -> dict:
    """Only the project's own assigned PM (per TMS PmId) may approve/reject its
    feedback draft — any other Manager is refused, even though the MANAGER
    role in general can reach this endpoint."""
    pm_info = get_project_manager(project_id, tms_db)
    if not pm_info or not pm_info.get("emp_id"):
        raise HTTPException(status_code=403, detail="No Project Manager is assigned to this project in TMS.")
    if pm_info["emp_id"] != current_user.get("emp_id"):
        raise HTTPException(status_code=403, detail="You are not the assigned Project Manager for this project.")
    return pm_info


def _notify_role(db: Session, *, role: str, actor_emp_id: Optional[str], notif_type: str, title: str, message: str, link: str):
    """Best-effort in-app broadcast to a role. Never raises — a notification
    failure must never fail the action that triggered it."""
    try:
        db.add(Notification(
            recipient_role=role,
            actor_emp_id=actor_emp_id,
            type=notif_type,
            title=title,
            message=message,
            link=link,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] Failed to create '{notif_type}' notification: {e}")


def _notify_person(db: Session, *, recipient_emp_id: str, actor_emp_id: Optional[str], notif_type: str, title: str, message: str, link: str):
    try:
        db.add(Notification(
            recipient_emp_id=recipient_emp_id,
            actor_emp_id=actor_emp_id,
            type=notif_type,
            title=title,
            message=message,
            link=link,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] Failed to create '{notif_type}' notification: {e}")


def _project_name(project_id: int, tms_db: Session) -> str:
    row = tms_db.execute(
        text("SELECT Name FROM tsms_projects WHERE Id = :id LIMIT 1"),
        {"id": project_id},
    ).fetchone()
    return row.Name if row else f"Project #{project_id}"


def _has_verified_customer_access(email: str, db: Session) -> bool:
    row = db.execute(
        text("""
            SELECT id
            FROM customer_otp
            WHERE LOWER(email) = LOWER(:email)
              AND verified = 1
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """),
        {"email": email},
    ).fetchone()
    return row is not None


def _get_survey_request_by_email(email: str, db: Session):
    return db.execute(
        text("""
            SELECT *
            FROM fact_feedback_request
            WHERE LOWER(recipient_email) = LOWER(:email)
            ORDER BY COALESCE(request_sent_at, created_at) DESC, id DESC
            LIMIT 1
        """),
        {"email": email},
    ).fetchone()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/requests")
def list_feedback_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """List all feedback requests with project name from TMS, paginated.

    MANAGER users only see drafts for projects where they're the assigned PM
    (drafts awaiting their review, plus anything already decided for those
    same projects) — everyone else (QUALITY, MANAGEMENT, DELIVERY, SALES)
    sees every request.
    """
    is_manager_role = current_user.get("role") == "MANAGER"
    my_emp_id = current_user.get("emp_id")

    all_rows = db.execute(
        text("""
            SELECT
                fr.id, fr.csat_cycle_id, fr.project_id, fr.recipient_email,
                fr.recipient_name, fr.cc_emails, fr.feedback_url,
                fr.expires_at, fr.request_sent_at, fr.reminder_sent_at,
                fr.status, fr.created_at, fr.period_of_performance,
                fr.pm_achievements, fr.pm_approval_status, fr.pm_rejection_comments
            FROM fact_feedback_request fr
            ORDER BY fr.created_at DESC
        """),
    ).fetchall()

    project_ids = list({r.project_id for r in all_rows if r.project_id})
    project_name_map: dict[int, str] = {}
    if project_ids:
        tms_rows = tms_db.execute(
            text("SELECT Id, Name FROM tsms_projects WHERE Id IN :ids"),
            {"ids": tuple(project_ids)},
        ).fetchall()
        project_name_map = {r.Id: r.Name for r in tms_rows}

    if is_manager_role:
        pm_map = get_project_manager and {
            pid: get_project_manager(pid, tms_db) for pid in project_ids
        }
        rows = [
            r for r in all_rows
            if (pm_map.get(r.project_id) or {}).get("emp_id") == my_emp_id
        ]
    else:
        rows = all_rows

    total = len(rows)
    page_rows = rows[skip: skip + limit]

    data = []
    for r in page_rows:
        data.append({
            "id":                  r.id,
            "csatCycleId":         r.csat_cycle_id,
            "projectId":           r.project_id,
            "projectExtId":        r.project_id,   # TMS id — this column has always stored the TMS id directly
            "projectName":         project_name_map.get(r.project_id),
            "recipientEmail":      r.recipient_email,
            "recipientName":       r.recipient_name,
            "ccEmails":            r.cc_emails,
            "feedbackUrl":         r.feedback_url,
            "requestSentAt":       r.request_sent_at.isoformat() if r.request_sent_at else None,
            "reminderSentAt":      r.reminder_sent_at.isoformat() if r.reminder_sent_at else None,
            "status":              r.status,
            "createdAt":           r.created_at.isoformat() if r.created_at else None,
            "expiresAt":           r.expires_at.isoformat() if r.expires_at else None,
            "periodOfPerformance": r.period_of_performance,
            "pmAchievements":      r.pm_achievements,
            "pmApprovalStatus":    r.pm_approval_status,
            "pmRejectionComments": r.pm_rejection_comments,
        })

    return {"data": data, "total": total}


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_feedback_request(
    payload: FeedbackRequestPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    """Create a DRAFT feedback request. No email is sent here — the customer
    is only emailed once the PM approves and Quality confirms via
    /requests/{id}/send-to-customer. The project's PM gets an in-app-only
    notification that a draft is awaiting their review."""
    now = datetime.utcnow()
    cc_emails_str = ", ".join(payload.cc) if payload.cc else None

    result = db.execute(
        text("""
            INSERT INTO fact_feedback_request
                (csat_cycle_id, project_id, recipient_email, recipient_name,
                 cc_emails, period_of_performance, message, status,
                 pm_approval_status, created_at)
            VALUES
                (:cycle_id, :project_id, :email, :name,
                 :cc_emails, :period, :message, 'draft',
                 'pending_pm', :created_at)
        """),
        {
            "cycle_id":   payload.csatCycleId,
            "project_id": payload.projectId,
            "email":      payload.recipientEmail,
            "name":       payload.recipientName,
            "cc_emails":  cc_emails_str,
            "period":     payload.periodOfPerformance,
            "message":    payload.message,
            "created_at": now,
        },
    )
    db.commit()
    new_id = result.lastrowid

    # Notify the assigned PM in-app only — nothing is emailed at this stage.
    try:
        pm_info = get_project_manager(payload.projectId, tms_db)
        if pm_info and pm_info.get("emp_id"):
            project_name = _project_name(payload.projectId, tms_db)
            sender_name = current_user.get("name") or current_user.get("emp_id")
            _notify_person(
                db,
                recipient_emp_id=pm_info["emp_id"],
                actor_emp_id=current_user.get("emp_id"),
                notif_type="FEEDBACK_DRAFT_PENDING_PM",
                title="A feedback form draft needs your review",
                message=f'{sender_name} created a CSAT feedback draft for "{project_name}" — please add your achievements or reject it with comments.',
                link=f"{settings.FRONTEND_URL}/feedback",
            )
    except Exception as e:
        print(f"[WARN] Failed to notify PM of new feedback draft: {e}")

    return {
        "success":         True,
        "id":              new_id,
        "status":          "draft",
        "pmApprovalStatus": "pending_pm",
        "message":         "Draft created. Awaiting the Project Manager's review.",
    }


@router.put("/requests/{request_id}")
def edit_draft(
    request_id: int,
    payload: EditDraftPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    """Quality edits a draft (typically after a PM rejection) and resubmits
    it to the PM. Only editable while still a 'draft' (i.e. not yet sent to
    the customer)."""
    row = _get_request_row(request_id, db)
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft requests can be edited.")

    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET project_id = :project_id, recipient_name = :name, recipient_email = :email,
                period_of_performance = :period, message = :message,
                pm_approval_status = 'pending_pm', pm_rejection_comments = NULL, pm_achievements = NULL
            WHERE id = :id
        """),
        {
            "project_id": payload.projectId,
            "name":       payload.recipientName,
            "email":      payload.recipientEmail,
            "period":     payload.periodOfPerformance,
            "message":    payload.message,
            "id":         request_id,
        },
    )
    db.commit()

    try:
        pm_info = get_project_manager(payload.projectId, tms_db)
        if pm_info and pm_info.get("emp_id"):
            project_name = _project_name(payload.projectId, tms_db)
            sender_name = current_user.get("name") or current_user.get("emp_id")
            _notify_person(
                db,
                recipient_emp_id=pm_info["emp_id"],
                actor_emp_id=current_user.get("emp_id"),
                notif_type="FEEDBACK_DRAFT_PENDING_PM",
                title="An updated feedback form draft needs your review",
                message=f'{sender_name} updated the CSAT feedback draft for "{project_name}" and resubmitted it for your review.',
                link=f"{settings.FRONTEND_URL}/feedback",
            )
    except Exception as e:
        print(f"[WARN] Failed to notify PM of resubmitted feedback draft: {e}")

    return {"success": True, "message": "Draft updated and resubmitted to the Project Manager."}


@router.post("/requests/{request_id}/pm-approve")
def pm_approve(
    request_id: int,
    payload: PMApprovePayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGER")),
):
    """The assigned PM approves the draft, entering their team's CSAT-period
    achievements. These achievements are what later populate the read-only
    'Overview on Project Performance' field on the customer survey."""
    row = _get_request_row(request_id, db)
    _assert_is_assigned_pm(row.project_id, current_user, tms_db)

    if row.pm_approval_status != "pending_pm":
        raise HTTPException(status_code=400, detail="Only requests awaiting PM review can be approved.")

    # The PM is often the one who actually knows the right customer contact
    # — Quality may have the wrong name or a stale email when they first
    # drafted this. Both optional: only touched if the PM actually changed
    # something, so old callers (and old frontend builds) still work
    # unchanged with just pmAchievements.
    recipient_name = (payload.recipientName or "").strip() or row.recipient_name
    recipient_email = (payload.recipientEmail or "").strip() or row.recipient_email
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", recipient_email):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid email address.")

    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET pm_approval_status = 'approved', pm_achievements = :achievements, pm_rejection_comments = NULL,
                recipient_name = :recipient_name, recipient_email = :recipient_email
            WHERE id = :id
        """),
        {"achievements": payload.pmAchievements, "id": request_id, "recipient_name": recipient_name, "recipient_email": recipient_email},
    )
    db.commit()

    project_name = _project_name(row.project_id, tms_db)
    pm_name = current_user.get("name") or current_user.get("emp_id")
    _notify_role(
        db,
        role="QUALITY",
        actor_emp_id=current_user.get("emp_id"),
        notif_type="FEEDBACK_PM_APPROVED",
        title="A feedback form was approved by the PM",
        message=f'{pm_name} approved the CSAT feedback draft for "{project_name}" ({recipient_name}) — ready to send.',
        link=f"{settings.FRONTEND_URL}/feedback",
    )

    return {"success": True, "message": "Approved. Quality has been notified it's ready to send."}


@router.post("/requests/{request_id}/pm-reject")
def pm_reject(
    request_id: int,
    payload: PMRejectPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGER")),
):
    """The assigned PM rejects the draft with mandatory comments, sending it
    back to Quality to fix and resubmit."""
    row = _get_request_row(request_id, db)
    _assert_is_assigned_pm(row.project_id, current_user, tms_db)

    if row.pm_approval_status != "pending_pm":
        raise HTTPException(status_code=400, detail="Only requests awaiting PM review can be rejected.")

    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET pm_approval_status = 'rejected', pm_rejection_comments = :comments
            WHERE id = :id
        """),
        {"comments": payload.pmRejectionComments, "id": request_id},
    )
    db.commit()

    project_name = _project_name(row.project_id, tms_db)
    pm_name = current_user.get("name") or current_user.get("emp_id")
    _notify_role(
        db,
        role="QUALITY",
        actor_emp_id=current_user.get("emp_id"),
        notif_type="FEEDBACK_PM_REJECTED",
        title="A feedback form was rejected by the PM",
        message=f'{pm_name} rejected the CSAT feedback draft for "{project_name}" ({row.recipient_name}): "{payload.pmRejectionComments}"',
        link=f"{settings.FRONTEND_URL}/feedback",
    )

    return {"success": True, "message": "Rejected. Quality has been notified to update and resubmit."}


@router.post("/requests/{request_id}/send-to-customer")
def send_to_customer(
    request_id: int,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    """Quality's final confirmation — send email to customer."""

    row = _get_request_row(request_id, db)

    if row.pm_approval_status != "approved":
        raise HTTPException(
            status_code=400,
            detail="This request must be approved by the PM before it can be sent."
        )

    if row.status != "draft":
        raise HTTPException(
            status_code=400,
            detail="This request has already been sent."
        )

    project_name = _project_name(row.project_id, tms_db)

    survey_link = (
        f"{settings.FRONTEND_URL}/survey-access"
    )
    now = datetime.utcnow()

    expires_at = now + timedelta(
        seconds=TOKEN_EXPIRY_SECONDS
    )

    cc_list = (
        [e.strip() for e in row.cc_emails.split(",")]
        if row.cc_emails
        else None
    )

    email_sent = EmailSender.send_email(
        to=row.recipient_email,
        subject=f"[Feedback Request] {project_name} — Please Share Your Experience",
        body=_build_email_text(
            row.recipient_name,
            project_name,
            survey_link,
            row.message,
        ),
        html_content=_build_email_html(
            row.recipient_name,
            project_name,
            survey_link,
            row.message,
        ),
        cc=cc_list,
    )

    if not email_sent:
        raise HTTPException(
            status_code=500,
            detail="Failed to send feedback email."
        )

    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET feedback_url = :url,
                expires_at = :expires_at,
                request_sent_at = :sent_at,
                status = 'sent'
            WHERE id = :id
        """),
        {
            "url": survey_link,
            "expires_at": expires_at,
            "sent_at": now,
            "id": request_id,
        },
    )

    db.commit()

    log_action(
        db, action=AuditActions.FEEDBACK_SENT,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="feedback_request", entity_id=request_id,
        details={"project_id": row.project_id, "project_name": project_name, "sent_to": row.recipient_email},
    )

    return {
        "success": True,
        "email_sent": True,
        "sent_to": row.recipient_email,
        "message": "Feedback request email successfully sent."
    }


# ── Public survey endpoints (no auth — OTP-verified email is the access
# control, checked fresh via _has_verified_customer_access on every call) ──────

@router.get("/public")
def get_public_survey(
    email: str = Query(...),
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
):
    """Return survey context for the OTP-verified customer-facing page."""
    normalized_email = email.strip().lower()

    if not _has_verified_customer_access(normalized_email, db):
        raise HTTPException(status_code=403, detail="Unauthorized email.")

    row = _get_survey_request_by_email(normalized_email, db)
    if not row:
        raise HTTPException(status_code=404, detail="No active survey found for this email.")
    if row.status == "completed":
        raise HTTPException(status_code=409, detail="This feedback has already been submitted.")
    if row.expires_at and datetime.utcnow() > row.expires_at:
        raise HTTPException(status_code=410, detail="This survey link has expired.")

    project_row = tms_db.execute(
        text("SELECT Name FROM tsms_projects WHERE Id = :id LIMIT 1"),
        {"id": row.project_id},
    ).fetchone()
    pm_info = get_project_manager(row.project_id, tms_db)

    return {
        "valid":               True,
        "projectId":           row.project_id,
        "email":               row.recipient_email,
        "customerName":        row.recipient_name,
        "projectName":         project_row.Name if project_row else None,
        "projectCode":         f"PRJ-{row.project_id}",
        "periodOfPerformance": row.period_of_performance,
        "pmAchievements":      row.pm_achievements,
        "pmName":              pm_info["full_name"] if pm_info and pm_info.get("full_name") else "Project Manager",
    }


@router.post("/public/submit", status_code=status.HTTP_201_CREATED)
def submit_survey(body: SurveySubmitPayload, db: Session = Depends(get_local_db)):
    """
    Save the customer's full survey response to
    fact_feedback_response.response_data and mark the request completed.
    """
    normalized_email = body.email.strip().lower()

    if not _has_verified_customer_access(normalized_email, db):
        raise HTTPException(status_code=403, detail="Unauthorized email.")

    req_row = _get_survey_request_by_email(normalized_email, db)
    if not req_row:
        raise HTTPException(status_code=404, detail="No active survey found for this email.")
    if req_row.status == "completed":
        raise HTTPException(status_code=409, detail="This feedback has already been submitted.")
    if req_row.expires_at and datetime.utcnow() > req_row.expires_at:
        raise HTTPException(status_code=410, detail="This survey link has expired.")

    try:
        request_id = req_row.id

        # CustomerSurveyPage.tsx collects "Overall Rating on a scale of 1-10"
        # as body.data['overallRating']. Stored as-is (1-10 scale) — the
        # dashboard KPIs report CSAT on the same /10 scale the survey itself
        # uses, no conversion needed.
        overall_rating = body.data.get("overallRating")
        csat_score = None
        if isinstance(overall_rating, (int, float)):
            csat_score = round(float(overall_rating), 2)

        db.execute(
            text("""
                INSERT INTO fact_feedback_response
                    (feedback_request_id, response_data, csat_score, submitted_at)
                VALUES
                    (:request_id, :response_data, :csat_score, NOW())
            """),
            {
                "request_id":    request_id,
                "response_data": json.dumps(body.data),
                "csat_score":    csat_score,
            },
        )
        db.execute(
            text("UPDATE fact_feedback_request SET status = 'completed' WHERE id = :id"),
            {"id": request_id},
        )
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] Could not save survey responses: {e}")
        raise HTTPException(status_code=500, detail="Could not save your responses. Please try again.")

    return {"success": True, "message": "Thank you! Your feedback has been recorded."}


@router.get("/requests/{request_id}/responses")
def get_request_responses(
    request_id: int,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Get all answers submitted for a specific feedback request."""
    req = db.execute(
        text("""
            SELECT id, recipient_name, recipient_email,
                   project_id, status, created_at, request_sent_at
            FROM fact_feedback_request
            WHERE id = :id
        """),
        {"id": request_id},
    ).fetchone()

    if not req:
        raise HTTPException(status_code=404, detail="Feedback request not found")

    project_name = None
    try:
        tms_row = tms_db.execute(
            text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
            {"pid": req.project_id},
        ).fetchone()
        if tms_row:
            project_name = tms_row.Name
    except Exception:
        pass

    response_rows = db.execute(
        text("""
            SELECT id, response_data, submitted_at
            FROM fact_feedback_response
            WHERE feedback_request_id = :id
            ORDER BY submitted_at ASC
        """),
        {"id": request_id},
    ).fetchall()

    responses = [
        {
            "id":          r.id,
            "data":        json.loads(r.response_data) if r.response_data else {},
            "submittedAt": r.submitted_at.isoformat() if r.submitted_at else None,
        }
        for r in response_rows
    ]

    return {
        "request": {
            "id":             req.id,
            "recipientName":  req.recipient_name,
            "recipientEmail": req.recipient_email,
            "projectId":      req.project_id,
            "projectName":    project_name,
            "status":         req.status,
            "createdAt":      req.created_at.isoformat() if req.created_at else None,
            "requestSentAt":  req.request_sent_at.isoformat() if req.request_sent_at else None,
        },
        # "responses" carries the full submitted blob (ratings, comments,
        # signature, etc.) — this is what FeedbackRequestListPage.tsx reads.
        "responses": responses,
        # "answers" is kept as a thin alias so the header's "Submitted" date
        # (data.answers?.[0]?.submittedAt) keeps working without a frontend change.
        "answers": [{"submittedAt": r["submittedAt"]} for r in responses],
    }
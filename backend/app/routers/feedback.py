"""Feedback collection and management routes"""
import hmac
import hashlib
import base64
import json
import time
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.utils.email import EmailSender
from app.config import settings
from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user
from app.models.notification import Notification

router = APIRouter()

# Token expires in 30 days
TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60


# ── Schemas ────────────────────────────────────────────────────────────────────

class FeedbackRequestPayload(BaseModel):
    projectId:           int
    recipientEmail:      str
    recipientName:       str
    csatCycleId:         Optional[int] = None
    message:             Optional[str] = None
    periodOfPerformance: Optional[str] = None
    pmAchievements:      Optional[str] = None


class SurveySubmitPayload(BaseModel):
    # The entire form data is accepted as a JSON blob to match the dynamic survey.
    data: dict


class PMApprovalPayload(BaseModel):
    pmAchievements: str


class PMRejectionPayload(BaseModel):
    pmRejectionComments: str


# ── Token helpers ──────────────────────────────────────────────────────────────

def _create_survey_token(project_id: int, recipient_email: str) -> str:
    payload = {
        "pid":   project_id,
        "email": recipient_email,
        "exp":   int(time.time()) + TOKEN_EXPIRY_SECONDS,
    }
    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload).encode()
    ).decode().rstrip("=")

    sig = hmac.new(
        settings.secret_key.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")

    return f"{payload_b64}.{sig_b64}"


def _verify_survey_token(token: str) -> dict:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token format.")

    expected_sig = hmac.new(
        settings.secret_key.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

    if not hmac.compare_digest(expected_b64, sig_b64):
        raise HTTPException(status_code=400, detail="Invalid or tampered token.")

    padding = "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))

    if time.time() > payload["exp"]:
        raise HTTPException(status_code=410, detail="This survey link has expired.")

    return payload


# ── Email builders ─────────────────────────────────────────────────────────────

def _build_email_html(recipient_name: str, project_id: int, survey_link: str, personal_message: Optional[str]) -> str:
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
      <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Your Feedback Matters</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#111827;margin:0 0 8px;">Dear <strong>{recipient_name}</strong>,</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Thank you for working with us on project <strong>#{project_id}</strong>.
        We'd love to hear how your experience was.
      </p>
      {personal_block}
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">
        Please take a moment to <strong>submit your feedback</strong> using the button below.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="{survey_link}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
          📋 Submit Your Feedback
        </a>
      </div>
      <p style="font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">
        Or copy: <a href="{survey_link}" style="color:#16a34a;">{survey_link}</a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin:16px 0 0;">
        This link will expire in <strong>30 days</strong>.
      </p>
    </div>
    <div style="background:#f3f4f6;padding:16px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">© 2026 CSAT Tool · Quality Dept · Mindteck</p>
    </div>
  </div>
</body>
</html>"""


def _build_email_text(recipient_name: str, project_id: int, survey_link: str, personal_message: Optional[str]) -> str:
    lines = [f"Dear {recipient_name},", "", f"Thank you for working with us on project #{project_id}.", ""]
    if personal_message and personal_message.strip():
        lines += [personal_message.strip(), ""]
    lines += ["Submit your feedback here:", survey_link, "", "This link expires in 30 days.", "", "© 2026 CSAT Tool · Mindteck"]
    return "\n".join(lines)


def _build_pm_email_html(project_id: int, project_name: str, portal_link: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;padding:20px;">
  <h2 style="color:#0b5c36;">Feedback Form Approval Required</h2>
  <p>Hello,</p>
  <p>The Quality Team has prepared a Customer Satisfaction Feedback Form for your project <strong>#{project_id} - {project_name}</strong>.</p>
  <p>Please log in to the portal to review the details, provide your team's achievements, and approve the form before it is sent to the customer.</p>
  <p><a href="{portal_link}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:5px;">Review in Portal</a></p>
  <br>
  <p>Thank you,<br>Quality Team</p>
</body>
</html>"""


def _build_pm_email_text(project_id: int, project_name: str, portal_link: str) -> str:
    return f"Feedback Form Approval Required\n\nPlease log in to the portal to review and approve the feedback form for Project #{project_id} - {project_name}.\nLink: {portal_link}"


def _build_quality_approval_email_html(project_id: int, project_name: str, portal_link: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;padding:20px;">
  <h2 style="color:#0b5c36;">&#10003; PM Approved — Feedback Form Ready to Send</h2>
  <p>Hello Quality Team,</p>
  <p>The Project Manager has <strong>approved</strong> the Customer Satisfaction Feedback Form for project <strong>#{project_id} - {project_name}</strong> and has added the team's achievements.</p>
  <p>Please log in to the portal, review the approved form (including PM achievements), and send it to the customer.</p>
  <p><a href="{portal_link}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:5px;">Review &amp; Send to Customer</a></p>
  <br>
  <p>Thank you,<br>CSAT System</p>
</body>
</html>"""


def _build_quality_approval_email_text(project_id: int, project_name: str, portal_link: str) -> str:
    return f"PM Approved Feedback Form\n\nThe PM has approved the feedback form for Project #{project_id} - {project_name}.\nPlease review and send to customer: {portal_link}"


def _build_quality_rejection_email_html(project_id: int, project_name: str, comments: str, portal_link: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;padding:20px;">
  <h2 style="color:#DC2626;">&#10007; PM Rejected — Action Required</h2>
  <p>Hello Quality Team,</p>
  <p>The Project Manager has <strong>rejected</strong> the Customer Satisfaction Feedback Form for project <strong>#{project_id} - {project_name}</strong>.</p>
  <div style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
    <p style="margin:0;font-weight:bold;color:#DC2626;">Reason for rejection:</p>
    <p style="margin:8px 0 0;">{comments}</p>
  </div>
  <p>Please log in to the portal, update the form based on PM feedback, and resubmit for approval.</p>
  <p><a href="{portal_link}" style="display:inline-block;padding:10px 20px;background:#DC2626;color:#fff;text-decoration:none;border-radius:5px;">View &amp; Edit Form</a></p>
  <br>
  <p>Thank you,<br>CSAT System</p>
</body>
</html>"""


def _build_quality_rejection_email_text(project_id: int, project_name: str, comments: str, portal_link: str) -> str:
    return f"PM Rejected Feedback Form\n\nThe PM rejected the feedback form for Project #{project_id} - {project_name}.\nReason: {comments}\n\nEdit and resubmit: {portal_link}"


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/requests")
def list_feedback_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """List all feedback requests with project name from TMS, paginated."""
    total_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request")
    ).fetchone()
    total = total_row.cnt if total_row else 0

    # Filter by PM if user is MANAGER
    pm_project_ids = []
    if current_user.get("role") == "MANAGER":
        pm_email = current_user.get("email")
        # Find EmpId
        tms_usr = tms_db.execute(text("SELECT EmpId FROM tsms_user WHERE Email = :em LIMIT 1"), {"em": pm_email}).fetchone()
        if tms_usr and tms_usr.EmpId:
            pm_projects = tms_db.execute(text("SELECT Id FROM tsms_projects WHERE PmId = :empid"), {"empid": tms_usr.EmpId}).fetchall()
            pm_project_ids = [p.Id for p in pm_projects]

        # Override rows to only show PM's projects
        if pm_project_ids:
            # Map TMS integer IDs to strings for comparison with dim_projects.project_id (varchar)
            pids_str = tuple(str(pid) for pid in pm_project_ids)
            rows = db.execute(
                text("""
                    SELECT
                        fr.id, fr.csat_cycle_id, fr.project_id, fr.recipient_email, fr.recipient_name,
                        fr.feedback_url, fr.token, fr.expires_at, fr.request_sent_at, fr.reminder_sent_at,
                        fr.status, fr.created_at, fr.pm_approval_status, fr.pm_rejection_comments,
                        fr.period_of_performance, fr.pm_achievements,
                        c.start_date AS cycle_start_date, c.end_date AS cycle_end_date,
                        dp.project_id AS tms_pid
                    FROM fact_feedback_request fr
                    LEFT JOIN csat_cycles c ON fr.csat_cycle_id = c.id
                    JOIN dim_projects dp ON fr.project_id = dp.id
                    WHERE dp.project_id IN :pids
                    ORDER BY fr.created_at DESC
                    LIMIT :limit OFFSET :skip
                """),
                {"limit": limit, "skip": skip, "pids": pids_str}
            ).fetchall()
            total_row = db.execute(
                text("""
                    SELECT COUNT(*) AS cnt
                    FROM fact_feedback_request fr
                    JOIN dim_projects dp ON fr.project_id = dp.id
                    WHERE dp.project_id IN :pids
                """),
                {"pids": pids_str}
            ).fetchone()
            total = total_row.cnt if total_row else 0
        else:
            rows = []
            total = 0
    else:
        # Quality Team sees everything
        rows = db.execute(
            text("""
                SELECT
                    fr.id, fr.csat_cycle_id, fr.project_id, fr.recipient_email, fr.recipient_name,
                    fr.feedback_url, fr.token, fr.expires_at, fr.request_sent_at, fr.reminder_sent_at,
                    fr.status, fr.created_at, fr.pm_approval_status, fr.pm_rejection_comments,
                    fr.period_of_performance, fr.pm_achievements,
                    c.start_date AS cycle_start_date, c.end_date AS cycle_end_date,
                    dp.project_id AS tms_pid
                FROM fact_feedback_request fr
                LEFT JOIN csat_cycles c ON fr.csat_cycle_id = c.id
                JOIN dim_projects dp ON fr.project_id = dp.id
                ORDER BY fr.created_at DESC
                LIMIT :limit OFFSET :skip
            """),
            {"limit": limit, "skip": skip}
        ).fetchall()

    # Fetch project names from TMS for all project_ids in this page
    tms_pids = list({str(r.tms_pid) for r in rows if r.tms_pid})
    project_name_map: dict[str, str] = {}
    if tms_pids:
        tms_rows = tms_db.execute(
            text("SELECT Id, Name FROM tsms_projects WHERE Id IN :ids"),
            {"ids": tuple(map(int, tms_pids))},
        ).fetchall()
        project_name_map = {str(r.Id): r.Name for r in tms_rows}

    data = []
    for r in rows:
        data.append({
            "id":             r.id,
            "csatCycleId":    r.csat_cycle_id,
            "projectId":      r.tms_pid,
            "projectName":    project_name_map.get(str(r.tms_pid)),
            "recipientEmail": r.recipient_email,
            "recipientName":  r.recipient_name,
            "feedbackUrl":    r.feedback_url,
            "requestSentAt":  r.request_sent_at.isoformat() if r.request_sent_at else None,
            "reminderSentAt": r.reminder_sent_at.isoformat() if r.reminder_sent_at else None,
            "status":         r.status,
            "createdAt":      r.created_at.isoformat() if r.created_at else None,
            "expiresAt":      r.expires_at.isoformat() if r.expires_at else None,
            "periodOfPerformance": getattr(r, 'period_of_performance', None),
            "pmAchievements":      getattr(r, 'pm_achievements', None),
            "pmApprovalStatus":    getattr(r, 'pm_approval_status', 'draft'),
            "pmRejectionComments": getattr(r, 'pm_rejection_comments', None),
            "cycleStartDate":      r.cycle_start_date.isoformat() if getattr(r, 'cycle_start_date', None) else None,
            "cycleEndDate":        r.cycle_end_date.isoformat() if getattr(r, 'cycle_end_date', None) else None,
        })

    return {"data": data, "total": total}


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_feedback_request(
    payload: FeedbackRequestPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a draft feedback request and notify PM."""

    now = datetime.utcnow()
    record_status = "draft"
    pm_approval_status = "pending_pm"

    # Ensure project exists in dim_projects
    dim_proj = db.execute(
        text("SELECT id FROM dim_projects WHERE project_id = :pid LIMIT 1"),
        {"pid": str(payload.projectId)}
    ).fetchone()

    project_name = f"Project {payload.projectId}"
    pm_id = None
    tms_row = tms_db.execute(
        text("SELECT Name, PmId FROM tsms_projects WHERE Id = :pid LIMIT 1"),
        {"pid": payload.projectId}
    ).fetchone()

    if tms_row:
        project_name = tms_row.Name
        pm_id = tms_row.PmId

    if dim_proj:
        internal_project_id = dim_proj.id
    else:
        db.execute(
            text("INSERT INTO dim_projects (project_id, project_name, is_active) VALUES (:pid, :name, 0)"),
            {"pid": str(payload.projectId), "name": project_name}
        )
        db.commit()
        internal_project_id = db.execute(
            text("SELECT id FROM dim_projects WHERE project_id = :pid LIMIT 1"),
            {"pid": str(payload.projectId)}
        ).fetchone().id

    # Fetch PM Email
    pm_email = None
    if pm_id:
        tms_usr = tms_db.execute(text("SELECT Email FROM tsms_user WHERE EmpId = :empid LIMIT 1"), {"empid": pm_id}).fetchone()
        if tms_usr:
            pm_email = tms_usr.Email

    try:
        db.execute(
            text("""
                INSERT INTO fact_feedback_request
                    (csat_cycle_id, project_id, recipient_email, recipient_name,
                     status, created_at, period_of_performance, pm_approval_status)
                VALUES
                    (:cycle_id, :project_id, :email, :name,
                     :status, :created_at, :pop, :pm_status)
            """),
            {
                "cycle_id":   payload.csatCycleId if payload.csatCycleId != 0 else None,
                "project_id": internal_project_id,
                "email":      payload.recipientEmail,
                "name":       payload.recipientName,
                "status":     record_status,
                "created_at": now,
                "pop":        payload.periodOfPerformance,
                "pm_status":  pm_approval_status,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create draft.")

    # Send Email and Notification to PM
    if pm_id:
        notification = Notification(
            recipient_emp_id=str(pm_id),
            actor_emp_id=str(current_user.get("emp_id")) if current_user.get("emp_id") else None,
            type="FEEDBACK_DRAFT_CREATED",
            title="Feedback Form Approval Required",
            message=f"The Quality Team has prepared a feedback form for {project_name}. Please review and approve.",
            link="/feedback",
        )
        db.add(notification)
        db.commit()

        if pm_email:
            portal_link = f"{settings.FRONTEND_URL}/feedback"
            # EmailSender.send_email(
            #     to=pm_email,
            #     subject=f"[Action Required] Review Feedback Form for #{payload.projectId}",
            #     body=_build_pm_email_text(payload.projectId, project_name, portal_link),
            #     html_content=_build_pm_email_html(payload.projectId, project_name, portal_link),
            # )

    return {
        "success":     True,
        "pm_notified": bool(pm_email),
        "pm_email":    pm_email,
        "message":     f"Draft created successfully. PM notified: {pm_email or 'No PM Email found'}",
    }


@router.put("/requests/{request_id}")
def update_feedback_request(
    request_id: int,
    payload: FeedbackRequestPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Update a rejected draft and send back to PM."""
    if current_user.get("role") == "MANAGER":
        raise HTTPException(status_code=403, detail="Managers cannot edit drafts.")

    req = db.execute(text("SELECT pm_approval_status, project_id FROM fact_feedback_request WHERE id = :id"), {"id": request_id}).fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")

    # Update fields and set status back to pending_pm
    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET recipient_email = :email, recipient_name = :name,
                period_of_performance = :pop, pm_approval_status = 'pending_pm', pm_rejection_comments = NULL
            WHERE id = :id
        """),
        {
            "email": payload.recipientEmail,
            "name": payload.recipientName,
            "pop": payload.periodOfPerformance,
            "id": request_id
        }
    )
    db.commit()

    # Notify PM again
    tms_row = tms_db.execute(
        text("SELECT Name, PmId FROM tsms_projects WHERE Id = :pid LIMIT 1"),
        {"pid": payload.projectId}
    ).fetchone()
    if tms_row and tms_row.PmId:
        notification = Notification(
            recipient_emp_id=str(tms_row.PmId),
            actor_emp_id=str(current_user.get("emp_id")) if current_user.get("emp_id") else None,
            type="FEEDBACK_DRAFT_UPDATED",
            title="Feedback Form Resubmitted",
            message=f"The Quality Team has updated the feedback form for {tms_row.Name} based on your comments. Please review and approve.",
            link="/feedback",
        )
        db.add(notification)
        db.commit()

        tms_usr = tms_db.execute(text("SELECT Email FROM tsms_user WHERE EmpId = :empid LIMIT 1"), {"empid": tms_row.PmId}).fetchone()
        if tms_usr and tms_usr.Email:
            portal_link = f"{settings.FRONTEND_URL}/feedback"
            # EmailSender.send_email(
            #     to=tms_usr.Email,
            #     subject=f"[Action Required] Updated Feedback Form for #{payload.projectId}",
            #     body=_build_pm_email_text(payload.projectId, tms_row.Name, portal_link),
            #     html_content=_build_pm_email_html(payload.projectId, tms_row.Name, portal_link),
            # )

    return {"success": True, "message": "Draft updated and resubmitted to PM."}


@router.post("/requests/{request_id}/pm-approve")
def pm_approve_request(
    request_id: int,
    payload: PMApprovalPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "MANAGER":
        raise HTTPException(status_code=403, detail="Only Managers can approve.")

    # Fetch request details for notifications
    req_row = db.execute(
        text("""
            SELECT f.project_id, d.project_id AS tms_pid
            FROM fact_feedback_request f
            JOIN dim_projects d ON f.project_id = d.id
            WHERE f.id = :id
        """),
        {"id": request_id}
    ).fetchone()

    db.execute(
        text("UPDATE fact_feedback_request SET pm_approval_status = 'approved', pm_achievements = :ach WHERE id = :id"),
        {"ach": payload.pmAchievements, "id": request_id}
    )

    # In-app notification → QUALITY role (actor = the PM who approved)
    pm_emp_id = str(current_user.get("emp_id")) if current_user.get("emp_id") else None
    project_name = f"Project #{req_row.tms_pid}" if req_row else "Unknown Project"
    if req_row:
        tms_row = tms_db.execute(
            text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
            {"pid": int(req_row.tms_pid)}
        ).fetchone()
        if tms_row:
            project_name = tms_row.Name

    notification = Notification(
        recipient_role="QUALITY",
        actor_emp_id=pm_emp_id,
        type="PM_APPROVED_FEEDBACK",
        title="PM Approved Feedback Form",
        message=f"The Project Manager has approved the feedback form for {project_name}. Please review and send to the customer.",
        link="/feedback",
    )
    db.add(notification)
    db.commit()

    # Email notification → Quality Team
    portal_link = f"{settings.FRONTEND_URL}/feedback"
    quality_users = db.execute(
        text("SELECT email FROM users WHERE role = 'QUALITY' AND is_active = 1")
    ).fetchall()
    tms_pid_val = int(req_row.tms_pid) if req_row else 0
    for qu in quality_users:
        if qu.email:
            # EmailSender.send_email(
            #     to=qu.email,
            #     subject=f"[Action Required] PM Approved Feedback Form for {project_name}",
            #     body=_build_quality_approval_email_text(tms_pid_val, project_name, portal_link),
            #     html_content=_build_quality_approval_email_html(tms_pid_val, project_name, portal_link),
            # )
            pass

    return {"success": True, "message": "Approved. Quality team notified."}


@router.post("/requests/{request_id}/pm-reject")
def pm_reject_request(
    request_id: int,
    payload: PMRejectionPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "MANAGER":
        raise HTTPException(status_code=403, detail="Only Managers can reject.")

    # Fetch request details for notifications
    req_row = db.execute(
        text("""
            SELECT f.project_id, d.project_id AS tms_pid
            FROM fact_feedback_request f
            JOIN dim_projects d ON f.project_id = d.id
            WHERE f.id = :id
        """),
        {"id": request_id}
    ).fetchone()

    db.execute(
        text("UPDATE fact_feedback_request SET pm_approval_status = 'rejected', pm_rejection_comments = :comments WHERE id = :id"),
        {"comments": payload.pmRejectionComments, "id": request_id}
    )

    # In-app notification → QUALITY role (actor = the PM who rejected)
    pm_emp_id = str(current_user.get("emp_id")) if current_user.get("emp_id") else None
    project_name = f"Project #{req_row.tms_pid}" if req_row else "Unknown Project"
    if req_row:
        tms_row = tms_db.execute(
            text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
            {"pid": int(req_row.tms_pid)}
        ).fetchone()
        if tms_row:
            project_name = tms_row.Name

    notification = Notification(
        recipient_role="QUALITY",
        actor_emp_id=pm_emp_id,
        type="PM_REJECTED_FEEDBACK",
        title="PM Rejected Feedback Form",
        message=f"The Project Manager has rejected the feedback form for {project_name}. Reason: {payload.pmRejectionComments}",
        link="/feedback",
    )
    db.add(notification)
    db.commit()

    # Email notification → Quality Team
    portal_link = f"{settings.FRONTEND_URL}/feedback"
    quality_users = db.execute(
        text("SELECT email FROM users WHERE role = 'QUALITY' AND is_active = 1")
    ).fetchall()
    tms_pid_val = int(req_row.tms_pid) if req_row else 0
    for qu in quality_users:
        if qu.email:
            # EmailSender.send_email(
            #     to=qu.email,
            #     subject=f"[Action Required] PM Rejected Feedback Form for {project_name}",
            #     body=_build_quality_rejection_email_text(tms_pid_val, project_name, payload.pmRejectionComments, portal_link),
            #     html_content=_build_quality_rejection_email_html(tms_pid_val, project_name, payload.pmRejectionComments, portal_link),
            # )
            pass

    return {"success": True, "message": "Rejected. Quality team notified."}


@router.get("/requests/{request_id}")
def get_feedback_request(
    request_id: int,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a single feedback request with cycle dates (for period-of-performance auto-fill)."""
    row = db.execute(
        text("""
            SELECT
                f.id, f.csat_cycle_id, f.project_id, f.recipient_email, f.recipient_name,
                f.feedback_url, f.token, f.expires_at, f.request_sent_at, f.reminder_sent_at,
                f.status, f.created_at, f.pm_approval_status, f.pm_rejection_comments,
                f.period_of_performance, f.pm_achievements,
                d.project_id AS tms_pid,
                c.start_date AS cycle_start_date, c.end_date AS cycle_end_date
            FROM fact_feedback_request f
            JOIN dim_projects d ON f.project_id = d.id
            LEFT JOIN csat_cycles c ON f.csat_cycle_id = c.id
            WHERE f.id = :id
        """),
        {"id": request_id}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    project_name = None
    try:
        tms_row = tms_db.execute(
            text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
            {"pid": int(row.tms_pid)}
        ).fetchone()
        if tms_row:
            project_name = tms_row.Name
    except Exception:
        pass

    return {
        "id":                  row.id,
        "csatCycleId":         row.csat_cycle_id,
        "projectId":           row.tms_pid,
        "projectName":         project_name,
        "recipientEmail":      row.recipient_email,
        "recipientName":       row.recipient_name,
        "feedbackUrl":         row.feedback_url,
        "requestSentAt":       row.request_sent_at.isoformat() if row.request_sent_at else None,
        "reminderSentAt":      row.reminder_sent_at.isoformat() if row.reminder_sent_at else None,
        "status":              row.status,
        "createdAt":           row.created_at.isoformat() if row.created_at else None,
        "expiresAt":           row.expires_at.isoformat() if row.expires_at else None,
        "periodOfPerformance": row.period_of_performance,
        "pmAchievements":      row.pm_achievements,
        "pmApprovalStatus":    row.pm_approval_status,
        "pmRejectionComments": row.pm_rejection_comments,
        "cycleStartDate":      row.cycle_start_date.isoformat() if row.cycle_start_date else None,
        "cycleEndDate":        row.cycle_end_date.isoformat() if row.cycle_end_date else None,
    }


@router.post("/requests/{request_id}/send-to-customer")
def send_to_customer(
    request_id: int,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Quality Team sends the approved form to customer."""
    if current_user.get("role") == "MANAGER":
        raise HTTPException(status_code=403, detail="Managers cannot send to customer.")

    req = db.execute(text("""
        SELECT f.project_id, f.recipient_email, f.recipient_name, f.pm_approval_status, d.project_id as tms_pid
        FROM fact_feedback_request f
        JOIN dim_projects d ON f.project_id = d.id
        WHERE f.id = :id
    """), {"id": request_id}).fetchone()

    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req.pm_approval_status != 'approved':
        raise HTTPException(status_code=400, detail="Request must be approved by PM first.")

    tms_pid = int(req.tms_pid)
    token = _create_survey_token(tms_pid, req.recipient_email)
    survey_link = f"{settings.FRONTEND_URL}/survey/{token}"
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=TOKEN_EXPIRY_SECONDS)

    email_sent = EmailSender.send_email(
        to=req.recipient_email,
        subject=f"[Feedback Request] Project #{tms_pid} — Please Share Your Experience",
        body=_build_email_text(req.recipient_name, tms_pid, survey_link, None),
        html_content=_build_email_html(req.recipient_name, tms_pid, survey_link, None),
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send customer email.")

    db.execute(
        text("""
            UPDATE fact_feedback_request
            SET status = 'sent', token = :token, feedback_url = :url, expires_at = :expires, request_sent_at = :now
            WHERE id = :id
        """),
        {"token": token, "url": survey_link, "expires": expires_at, "now": now, "id": request_id}
    )
    db.commit()

    return {"success": True, "message": "Email sent to customer."}


# ── Public survey endpoints (no auth, no DB) ───────────────────────────────────

@router.get("/public/{token}")
def get_survey_by_token(
    token: str,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db)
):
    """Validate token and return project context for the survey page."""
    payload = _verify_survey_token(token)

    # Defaults
    customer_name = ""
    period_of_performance = None
    pm_achievements = None
    project_name = f"Project #{payload['pid']}"
    project_code = ""
    pm_name = "Project Manager"

    try:
        req_row = db.execute(
            text("SELECT recipient_name, period_of_performance, pm_achievements, project_id FROM fact_feedback_request WHERE token = :token LIMIT 1"),
            {"token": token},
        ).fetchone()

        if req_row:
            customer_name = req_row.recipient_name or ""
            period_of_performance = req_row.period_of_performance
            pm_achievements = req_row.pm_achievements

            # Now fetch project name and code from TMS
            tms_row = tms_db.execute(
                text("SELECT Name, PmId FROM tsms_projects WHERE Id = :pid LIMIT 1"),
                {"pid": payload["pid"]}
            ).fetchone()
            if tms_row:
                project_name = tms_row.Name
                # Fallback to generating a code if none exists
                project_code = getattr(tms_row, 'Code', f"PRJ-{payload['pid']}")
                if tms_row.PmId:
                    pm_user = tms_db.execute(
                        text("SELECT empname FROM tsms_user WHERE EmpId = :empid LIMIT 1"),
                        {"empid": tms_row.PmId}
                    ).fetchone()
                    if pm_user and pm_user.empname:
                        pm_name = pm_user.empname
    except Exception as e:
        print(f"[WARN] Error fetching survey details: {e}")

    return {
        "valid":               True,
        "projectId":           payload["pid"],
        "email":               payload["email"],
        "customerName":        customer_name,
        "projectName":         project_name,
        "projectCode":         project_code,
        "periodOfPerformance": period_of_performance,
        "pmAchievements":      pm_achievements,
        "pmName":              pm_name,
    }


@router.post("/public/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_survey(token: str, body: SurveySubmitPayload, db: Session = Depends(get_local_db)):
    """
    Validate token, save the submitted survey as a JSON blob, mark request completed.
    """
    payload = _verify_survey_token(token)

    try:
        # Get the feedback request id for this token
        req_row = db.execute(
            text("SELECT id FROM fact_feedback_request WHERE token = :token LIMIT 1"),
            {"token": token},
        ).fetchone()

        if req_row:
            request_id = req_row.id

            # The entire form structure is dumped as a JSON object into
            # response_data for maximum flexibility with the survey.
            db.execute(
                text("""
                    INSERT INTO fact_feedback_response
                        (feedback_request_id, response_data, submitted_at)
                    VALUES
                        (:request_id, :data, CURRENT_TIMESTAMP)
                """),
                {
                    "request_id": request_id,
                    "data":       json.dumps(body.data),
                },
            )

            # Mark request completed
            db.execute(
                text("UPDATE fact_feedback_request SET status = 'completed' WHERE id = :id"),
                {"id": request_id},
            )

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] Could not save survey responses: {e}")

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

    # Fetch project name from TMS
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

    answers = db.execute(
        text("""
            SELECT id, response_data, submitted_at
            FROM fact_feedback_response
            WHERE feedback_request_id = :id
            ORDER BY id ASC
        """),
        {"id": request_id},
    ).fetchall()

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
        "responses": [
            {
                "id":          a.id,
                "data":        json.loads(a.response_data) if a.response_data else {},
                "submittedAt": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in answers
        ],
        "totalAnswers": len(answers),
    }
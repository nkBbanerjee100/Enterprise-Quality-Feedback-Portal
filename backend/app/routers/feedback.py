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
    # We now accept the entire form data as a JSON blob to match the new dynamic requirements
    data: dict
 
 
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
    rows = db.execute(
        text("""
            SELECT
                fr.id,
                fr.csat_cycle_id,
                fr.project_id,
                fr.recipient_email,
                fr.recipient_name,
                fr.feedback_url,
                fr.token,
                fr.expires_at,
                fr.request_sent_at,
                fr.reminder_sent_at,
                fr.status,
                fr.created_at
            FROM fact_feedback_request fr
            ORDER BY fr.created_at DESC
            LIMIT :limit OFFSET :skip
        """),
        {"limit": limit, "skip": skip},
    ).fetchall()
 
    total_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request")
    ).fetchone()
    total = total_row.cnt if total_row else 0
 
    # Fetch project names from TMS for all project_ids in this page
    project_ids = list({r.project_id for r in rows if r.project_id})
    project_name_map: dict[int, str] = {}
    if project_ids:
        tms_rows = tms_db.execute(
            text("SELECT Id, Name FROM tsms_projects WHERE Id IN :ids"),
            {"ids": tuple(project_ids)},
        ).fetchall()
        project_name_map = {r.Id: r.Name for r in tms_rows}
 
    data = []
    for r in rows:
        data.append({
            "id":             r.id,
            "csatCycleId":    r.csat_cycle_id,
            "projectId":      r.project_id,
            "projectName":    project_name_map.get(r.project_id),
            "recipientEmail": r.recipient_email,
            "recipientName":  r.recipient_name,
            "feedbackUrl":    r.feedback_url,
            "requestSentAt":  r.request_sent_at.isoformat() if r.request_sent_at else None,
            "reminderSentAt": r.reminder_sent_at.isoformat() if r.reminder_sent_at else None,
            "status":         r.status,
            "createdAt":      r.created_at.isoformat() if r.created_at else None,
            "expiresAt":      r.expires_at.isoformat() if r.expires_at else None,
            "periodOfPerformance": r.period_of_performance if hasattr(r, 'period_of_performance') else None,
            "pmAchievements":      r.pm_achievements if hasattr(r, 'pm_achievements') else None,
        })
 
    return {"data": data, "total": total}
 
 
@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_feedback_request(
    payload: FeedbackRequestPayload,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Send feedback request email + persist record to fact_feedback_request."""
 
    token       = _create_survey_token(payload.projectId, payload.recipientEmail)
    survey_link = f"{settings.FRONTEND_URL}/survey/{token}"
    now         = datetime.utcnow()
    expires_at  = now + timedelta(seconds=TOKEN_EXPIRY_SECONDS)
 
    email_sent = EmailSender.send_email(
        to=payload.recipientEmail,
        subject=f"[Feedback Request] Project #{payload.projectId} — Please Share Your Experience",
        body=_build_email_text(payload.recipientName, payload.projectId, survey_link, payload.message),
        html_content=_build_email_html(payload.recipientName, payload.projectId, survey_link, payload.message),
    )
 
    # Persist to DB regardless of email result so records are tracked
    # status = "sent" if email went through, "pending" if SMTP failed
    record_status = "sent" if email_sent else "pending"
 
    # Ensure project exists in dim_projects to satisfy foreign key constraint
    dim_proj = db.execute(
        text("SELECT id FROM dim_projects WHERE project_id = :pid LIMIT 1"),
        {"pid": str(payload.projectId)}
    ).fetchone()

    if dim_proj:
        internal_project_id = dim_proj.id
    else:
        tms_row = tms_db.execute(
            text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
            {"pid": payload.projectId}
        ).fetchone()
        project_name = tms_row.Name if tms_row else f"Project {payload.projectId}"
        
        db.execute(
            text("INSERT INTO dim_projects (project_id, project_name, is_active) VALUES (:pid, :name, 0)"),
            {"pid": str(payload.projectId), "name": project_name}
        )
        db.commit()
        internal_project_id = db.execute(
            text("SELECT id FROM dim_projects WHERE project_id = :pid LIMIT 1"),
            {"pid": str(payload.projectId)}
        ).fetchone().id

    try:
        db.execute(
            text("""
                INSERT INTO fact_feedback_request
                    (csat_cycle_id, project_id, recipient_email, recipient_name,
                     token, feedback_url, expires_at, request_sent_at, status, created_at, period_of_performance, pm_achievements)
                VALUES
                    (:cycle_id, :project_id, :email, :name,
                     :token, :url, :expires_at, :sent_at, :status, :created_at, :pop, :ach)
            """),
            {
                "cycle_id":   payload.csatCycleId if payload.csatCycleId != 0 else None,
                "project_id": internal_project_id,
                "email":      payload.recipientEmail,
                "name":       payload.recipientName,
                "token":      token,
                "url":        survey_link,
                "expires_at": expires_at,
                "sent_at":    now if email_sent else None,
                "status":     record_status,
                "created_at": now,
                "pop":        payload.periodOfPerformance,
                "ach":        payload.pmAchievements,
            },
        )
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] Failed to persist feedback request to DB: {e}")
        # Still return success if email went through
 
    if not email_sent:
        raise HTTPException(
            status_code=500,
            detail="Failed to send feedback email. Record saved as pending — check SMTP configuration.",
        )
 
    return {
        "success":    True,
        "email_sent": True,
        "sent_to":    payload.recipientEmail,
        "project_id": payload.projectId,
        "status":     record_status,
        "message":    f"Feedback request email successfully sent to {payload.recipientEmail}",
    }
 
 
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
                text("SELECT Name FROM tsms_projects WHERE Id = :pid LIMIT 1"),
                {"pid": payload["pid"]}
            ).fetchone()
            if tms_row:
                project_name = tms_row.Name
                # Fallback to generating a code if none exists
                project_code = getattr(tms_row, 'Code', f"PRJ-{payload['pid']}")
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
    }
 
 
@router.post("/public/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_survey(token: str, body: SurveySubmitPayload, db: Session = Depends(get_local_db)):
    """
    Validate token, save answers to fact_feedback_response, mark request completed.
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
 
            # We dump the entire form structure as a JSON object into response_data
            # for maximum flexibility with the new survey requirements.
            db.execute(
                text("""
                    INSERT INTO fact_feedback_response
                        (feedback_request_id, response_data, submitted_at)
                    VALUES
                        (:request_id, :data, NOW())
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
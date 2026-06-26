"""Feedback collection and management routes — stateless signed tokens (no DB)"""
import hmac
import hashlib
import base64
import json
import time
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.utils.email import EmailSender
from app.config import settings

router = APIRouter()

# Token expires in 30 days
TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60


# ── Schemas ────────────────────────────────────────────────────────────────────

class FeedbackRequestPayload(BaseModel):
    projectId:      int
    recipientEmail: str
    recipientName:  str
    csatCycleId:    Optional[int] = None
    message:        Optional[str] = None


class SurveyAnswer(BaseModel):
    questionId: int
    value:      str


class SurveySubmitPayload(BaseModel):
    answers: list[SurveyAnswer]


# ── Token helpers ──────────────────────────────────────────────────────────────

def _create_survey_token(project_id: int, recipient_email: str) -> str:
    """
    Create a signed token encoding projectId, email, and expiry.
    Format: base64(payload_json).base64(hmac_signature)
    No DB needed — the signature proves it's authentic.
    """
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
    """
    Verify and decode a survey token.
    Returns the payload dict, or raises HTTPException on failure.
    """
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token format.")

    # Verify signature
    expected_sig = hmac.new(
        settings.secret_key.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

    if not hmac.compare_digest(expected_b64, sig_b64):
        raise HTTPException(status_code=400, detail="Invalid or tampered token.")

    # Decode payload
    padding = "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))

    # Check expiry
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

@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_feedback_request(payload: FeedbackRequestPayload):
    """Send feedback request email with a signed survey link. No DB needed."""

    token       = _create_survey_token(payload.projectId, payload.recipientEmail)
    survey_link = f"{settings.FRONTEND_URL}/survey/{token}"

    email_sent = EmailSender.send_email(
        to=payload.recipientEmail,
        subject=f"[Feedback Request] Project #{payload.projectId} — Please Share Your Experience",
        body=_build_email_text(payload.recipientName, payload.projectId, survey_link, payload.message),
        html_content=_build_email_html(payload.recipientName, payload.projectId, survey_link, payload.message),
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="Failed to send feedback email. Please check SMTP configuration.")

    return {
        "success":    True,
        "email_sent": True,
        "sent_to":    payload.recipientEmail,
        "project_id": payload.projectId,
        "message":    f"Feedback request email successfully sent to {payload.recipientEmail}",
    }


# ── Public survey endpoints (no auth, no DB) ───────────────────────────────────

@router.get("/public/{token}")
def get_survey_by_token(token: str):
    """Validate token and return project context for the survey page."""
    payload = _verify_survey_token(token)   # raises 400/410 on failure
    return {
        "valid":     True,
        "projectId": payload["pid"],
        "email":     payload["email"],
    }


@router.post("/public/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_survey(token: str, body: SurveySubmitPayload):
    """
    Validate token and accept survey answers.
    Without a DB you can't prevent double-submit server-side,
    but the frontend disables the form after first submission.
    To prevent double-submit properly, add a simple submitted-token
    cache (e.g. an in-memory set or Redis) later.
    """
    payload = _verify_survey_token(token)   # raises 400/410 on failure

    # ── At this point you can: ────────────────────────────────────────────────
    # 1. Forward answers to an external system (TMS, Google Sheets, etc.)
    # 2. Send a confirmation email
    # 3. Log to a file
    # For now we just acknowledge receipt.
    print(f"[SURVEY SUBMIT] project={payload['pid']} email={payload['email']} answers={body.answers}")

    return {"success": True, "message": "Thank you! Your feedback has been recorded."}
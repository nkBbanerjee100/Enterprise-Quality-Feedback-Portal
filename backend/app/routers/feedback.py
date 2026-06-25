"""Feedback collection and management routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.database import get_local_db
from app.utils.email import EmailSender

router = APIRouter()


# ── Request schema ─────────────────────────────────────────────────────────────

class FeedbackRequestPayload(BaseModel):
    projectId:      int
    recipientEmail: str
    recipientName:  str
    csatCycleId:    Optional[int] = None
    message:        Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_email_html(recipient_name: str, project_id: int, project_name_hint: str, personal_message: Optional[str]) -> str:
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

    <!-- Header -->
    <div style="background:#16a34a;padding:28px 32px;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#bbf7d0;letter-spacing:0.1em;text-transform:uppercase;">
        Mindteck · Quality Feedback Platform
      </p>
      <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">
        Your Feedback Matters
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#111827;margin:0 0 8px;">
        Dear <strong>{recipient_name}</strong>,
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Thank you for working with us on project <strong>#{project_id}</strong>.
        We'd love to hear how your experience was.
      </p>
      {personal_block}
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">
        Please take a moment to <strong>submit your feedback</strong> using the button below.
        Your honest response helps us improve and deliver better results for you.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="#" style="
          display:inline-block;
          background:#16a34a;
          color:#ffffff;
          font-size:15px;
          font-weight:700;
          text-decoration:none;
          padding:14px 36px;
          border-radius:8px;
          letter-spacing:0.02em;
        ">
          📋 Submit Your Feedback
        </a>
      </div>

      <p style="font-size:12px;color:#6b7280;line-height:1.6;margin:0;">
        This link will expire in <strong>30 days</strong>. If you have any questions,
        please reply to this email or contact your project manager.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f3f4f6;padding:16px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        © 2026 CSAT Tool · Quality Dept · Mindteck
      </p>
    </div>

  </div>
</body>
</html>"""


def _build_email_text(recipient_name: str, project_id: int, personal_message: Optional[str]) -> str:
    lines = [
        f"Dear {recipient_name},",
        "",
        f"Thank you for working with us on project #{project_id}.",
        "We'd love to hear how your experience was.",
    ]
    if personal_message and personal_message.strip():
        lines += ["", personal_message.strip()]
    lines += [
        "",
        "Please submit your feedback using the link below.",
        "Your honest response helps us improve and deliver better results for you.",
        "",
        "[Submit Your Feedback]",
        "",
        "This link will expire in 30 days.",
        "",
        "© 2026 CSAT Tool · Quality Dept · Mindteck",
    ]
    return "\n".join(lines)


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_feedback_request(payload: FeedbackRequestPayload):
    """
    Send a feedback request email to the specified customer.
    No database writes — just dispatches the email.
    """
    html_body = _build_email_html(
        recipient_name=payload.recipientName,
        project_id=payload.projectId,
        project_name_hint="",          # we don't have it from TMS here; project_id is enough
        personal_message=payload.message,
    )
    plain_body = _build_email_text(
        recipient_name=payload.recipientName,
        project_id=payload.projectId,
        personal_message=payload.message,
    )

    email_sent = EmailSender.send_email(
        to=payload.recipientEmail,
        subject=f"[Feedback Request] Project #{payload.projectId} — Please Share Your Experience",
        body=plain_body,
        html_content=html_body,
    )

    if not email_sent:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Failed to send feedback email. Please check SMTP configuration.",
        )

    return {
        "success":    True,
        "email_sent": True,
        "sent_to":    payload.recipientEmail,
        "project_id": payload.projectId,
        "message":    f"Feedback request email successfully sent to {payload.recipientEmail}",
    }


@router.post("/responses", status_code=status.HTTP_201_CREATED)
def submit_feedback_response(db: Session = Depends(get_local_db)):
    return {"message": "Not yet implemented"}


@router.get("/requests/{request_id}")
def get_feedback_request(request_id: int, db: Session = Depends(get_local_db)):
    return {"message": "Not yet implemented"}
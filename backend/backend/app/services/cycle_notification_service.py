"""
Cycle / Project-Addition Notification Service
==============================================
Handles the notify-on-add workflow for CSAT cycle project enrollment:

  1. Quality/Management adds ("enrolls") a project into a cycle.
  2. In-app notifications go to:
       - everyone with role MANAGEMENT
       - the project's Manager (PmId, looked up from TMS), if one exists
     If no PM is found on the TMS project record, Management is still
     notified — they're just not double-notified for a person who isn't there.
  3. Management (always) or that specific Manager (only for their own
     project) can then approve/decline the addition.

This is intentionally separate from the existing exemption-approval flow
(EligibilityStatus.PENDING_APPROVAL / APPROVED / DECLINED) — that flow is
untouched.

NOTE: Email delivery is temporarily disabled (EMAIL_NOTIFICATIONS_ENABLED
below) while the SMTP/email pipeline is still being built out. In-app
notifications (the bell icon) are unaffected and fully live. To turn email
back on, flip that flag to True — everything else is already wired.
"""
from typing import Optional
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.utils.email import EmailSender
from app.config import settings

# Email sending for this workflow is off for now — the email pipeline is
# still in development. In-app notifications still work normally.
EMAIL_NOTIFICATIONS_ENABLED = False


# ─────────────────────────────────────────────────────────────────────────────
# TMS lookups
# ─────────────────────────────────────────────────────────────────────────────

def get_project_manager(tms_project_id: int, tms_db: Session) -> Optional[dict]:
    """
    Look up the Project Manager (PmId) for a TMS project, resolved to a
    canonical employee record (handles PmId matching EmpId / FinanceId / UserId,
    same as the rest of the TMS integration).
    Returns None if the project has no PM assigned or isn't found.
    """
    row = tms_db.execute(
        text("""
            SELECT
                pm.EmpId  AS emp_id,
                pm.EmpFirstName AS first_name,
                pm.EmpLastName  AS last_name,
                pm.Email  AS email
            FROM tsms_projects p
            LEFT JOIN tsms_user pm
                ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
            WHERE p.Id = :project_id
            LIMIT 1
        """),
        {"project_id": tms_project_id},
    ).fetchone()

    if row is None or not row.emp_id:
        return None

    return {
        "emp_id": row.emp_id,
        "full_name": " ".join(p for p in [row.first_name, row.last_name] if p).strip(),
        "email": row.email,
    }


def get_project_managers_bulk(tms_project_ids: list[int], tms_db: Session) -> dict[int, dict]:
    """Same as get_project_manager but batched for a list of TMS project ids."""
    if not tms_project_ids:
        return {}

    rows = tms_db.execute(
        text("""
            SELECT
                p.Id AS tms_project_id,
                pm.EmpId  AS emp_id,
                pm.EmpFirstName AS first_name,
                pm.EmpLastName  AS last_name,
                pm.Email  AS email
            FROM tsms_projects p
            LEFT JOIN tsms_user pm
                ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
            WHERE p.Id IN :ids
        """),
        {"ids": tuple(tms_project_ids)},
    ).fetchall()

    result: dict[int, dict] = {}
    for row in rows:
        if row.emp_id:
            result[row.tms_project_id] = {
                "emp_id": row.emp_id,
                "full_name": " ".join(p for p in [row.first_name, row.last_name] if p).strip(),
                "email": row.email,
            }
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Local lookups
# ─────────────────────────────────────────────────────────────────────────────

def get_management_users(local_db: Session) -> list[dict]:
    """All active users with role MANAGEMENT — the broadcast audience."""
    rows = local_db.execute(
        text("""
            SELECT EmpId AS emp_id, Email AS email, EmpFirstName AS first_name
            FROM csat_users
            WHERE role = 'MANAGEMENT' AND is_active = 1
        """)
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def _get_user_by_emp_id(local_db: Session, emp_id: str) -> Optional[dict]:
    row = local_db.execute(
        text("SELECT EmpId AS emp_id, Email AS email, EmpFirstName AS first_name FROM csat_users WHERE EmpId = :emp_id LIMIT 1"),
        {"emp_id": emp_id},
    ).fetchone()
    return dict(row._mapping) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# Manager-review chain notifications — mirror staging_notification_service.py
# exactly, just scoped to a cycle enrollment instead of a staging row.
# ─────────────────────────────────────────────────────────────────────────────

def notify_manager_enrollment_needs_review(
    *, local_db: Session, manager_emp_id: str, cycle_id: int, project_name: str,
    project_id: int, enrollment_id: int, enrolled_by_name: str, actor_emp_id: str,
) -> None:
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "A project of yours needs your review"
    message = (
        f'{enrolled_by_name} marked "{project_name}" as eligible for this CSAT cycle. '
        f"As its Manager, please review and mark it Eligible or Exempt."
    )
    local_db.add(Notification(
        recipient_emp_id=manager_emp_id, actor_emp_id=actor_emp_id,
        type="ENROLLMENT_NEEDS_MANAGER_REVIEW", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, manager_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(to=recipient["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>Review it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email manager {manager_emp_id}: {e}")
    local_db.flush()


def notify_quality_enrollment_needs_recheck(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, enrolled_by_emp_id: str, manager_name: str,
    exemption_reason: str, actor_emp_id: str,
) -> None:
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "A project's Manager marked it exempt — please recheck"
    message = (
        f'{manager_name} marked "{project_name}" exempt: "{exemption_reason}". '
        f"Please recheck — Exempt to finalize, or Eligible to send it on to Management."
    )
    local_db.add(Notification(
        recipient_emp_id=enrolled_by_emp_id, actor_emp_id=actor_emp_id,
        type="ENROLLMENT_NEEDS_QUALITY_RECHECK", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, enrolled_by_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(to=recipient["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>Recheck it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email {enrolled_by_emp_id}: {e}")
    local_db.flush()


def notify_quality_role_enrollment_needs_recheck(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, manager_name: str, exemption_reason: str, actor_emp_id: str,
) -> None:
    """Same as notify_quality_enrollment_needs_recheck, but broadcast to
    everyone with role QUALITY instead of one specific person — used when a
    Manager adds and exempts one of their OWN projects directly (see
    enroll_projects's is_manager_role branch), so there's no original
    Quality submitter to target."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "A project's Manager marked it exempt — please recheck"
    message = (
        f'{manager_name} added and marked "{project_name}" exempt: "{exemption_reason}". '
        f"Please recheck — Exempt to finalize, or Eligible to send it on to Management."
    )
    local_db.add(Notification(
        recipient_role="QUALITY", actor_emp_id=actor_emp_id,
        type="ENROLLMENT_NEEDS_QUALITY_RECHECK", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    for quality_user in _get_users_by_role(local_db, "QUALITY"):
        if EMAIL_NOTIFICATIONS_ENABLED and quality_user.get("email"):
            try:
                EmailSender.send_email(to=quality_user["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>Recheck it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email quality user {quality_user.get('emp_id')}: {e}")
    local_db.flush()


def notify_management_enrollment_exemption_request(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, enrolled_by_name: str, exemption_reason: str, actor_emp_id: str,
) -> None:
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "An exemption request needs your decision"
    message = (
        f'{enrolled_by_name} requested "{project_name}" be exempted from this '
        f'CSAT cycle: "{exemption_reason}". Please approve or reject the exemption.'
    )
    local_db.add(Notification(
        recipient_role="MANAGEMENT", actor_emp_id=actor_emp_id,
        type="ENROLLMENT_EXEMPTION_REQUEST", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    for mgmt_user in get_management_users(local_db):
        if EMAIL_NOTIFICATIONS_ENABLED and mgmt_user.get("email"):
            try:
                EmailSender.send_email(to=mgmt_user["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>Decide</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email management user {mgmt_user.get('emp_id')}: {e}")
    local_db.flush()


def notify_quality_of_enrollment_exemption_decision(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, enrolled_by_emp_id: str, exemption_approved: bool,
    decided_by_name: str, actor_emp_id: str, remarks: Optional[str] = None,
) -> None:
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    outcome = (
        "approved the exemption — it's now marked exempt" if exemption_approved
        else "rejected the exemption — it's now eligible and has been sent to its Manager for review"
    )
    title = "Your exemption request was reviewed"
    message = f'{decided_by_name} {outcome} for "{project_name}".'
    if remarks:
        message += f' Remarks: "{remarks}"'
    local_db.add(Notification(
        recipient_emp_id=enrolled_by_emp_id, actor_emp_id=actor_emp_id,
        type="ENROLLMENT_EXEMPTION_DECIDED", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, enrolled_by_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(to=recipient["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email {enrolled_by_emp_id}: {e}")
    local_db.flush()


def notify_management_enrollment_final_review(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, enrolled_by_name: str, actor_emp_id: str,
) -> None:
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "A project needs your final review"
    message = (
        f'Quality reaffirmed "{project_name}" as eligible after its Manager exempted it. '
        f"Your decision is final — please approve or decline."
    )
    local_db.add(Notification(
        recipient_role="MANAGEMENT", actor_emp_id=actor_emp_id,
        type="ENROLLMENT_NEEDS_MANAGEMENT_REVIEW", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    for mgmt_user in get_management_users(local_db):
        if EMAIL_NOTIFICATIONS_ENABLED and mgmt_user.get("email"):
            try:
                EmailSender.send_email(to=mgmt_user["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>Review it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email management user {mgmt_user.get('emp_id')}: {e}")
    local_db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def notify_manager_of_enrollment_final_decision(
    *, local_db: Session, cycle_id: int, project_name: str, project_id: int,
    enrollment_id: int, manager_emp_id: Optional[str], approved: bool,
    decided_by_name: str, actor_emp_id: str,
) -> None:
    """Enrollment-level twin of staging_notification_service.py's
    notify_manager_of_final_decision — same chain, just for a project being
    added to an ALREADY-EXISTING cycle: Manager exempted it, Quality
    reaffirmed eligible on recheck, Management had the final word. The
    Manager who started the disagreement gets told how it landed.

    manager_emp_id can be missing on rows from before this field was
    tracked consistently — skip quietly rather than notify no one and also
    rather than error out the decision itself over a notification.
    """
    if not manager_emp_id:
        return

    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "Final decision on your exemption"
    if approved:
        message = (
            f'You marked "{project_name}" exempt, but Quality reaffirmed it eligible and '
            f"{decided_by_name} has confirmed it eligible — it will be included in this cycle."
        )
    else:
        message = (
            f'{decided_by_name} agreed with your exemption — both you and Management have '
            f'marked "{project_name}" exempt. It will not be included in this cycle.'
        )

    local_db.add(Notification(
        recipient_emp_id=manager_emp_id, actor_emp_id=actor_emp_id,
        type="ENROLLMENT_MANAGER_FINAL_DECISION", title=title, message=message,
        cycle_id=cycle_id, project_id=project_id, enrollment_id=enrollment_id, link=link,
    ))
    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, manager_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(to=recipient["email"], subject=title, body=f"{message}\n\n{link}",
                                        html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>")
            except Exception as e:
                print(f"[WARN] Failed to email manager {manager_emp_id}: {e}")
    local_db.flush()


def notify_project_added_to_cycle(
    *,
    local_db: Session,
    tms_db: Session,
    cycle_id: int,
    cycle_name: str,
    project_id: int,          # dim_projects.id (local)
    project_ext_id: str,      # TMS project id (string form of tsms_projects.Id)
    project_name: str,
    enrollment_id: int,
    enrolled_by_name: str,
    actor_emp_id: str,        # emp_id of whoever performed the enrollment — never sees this notification
) -> Optional[dict]:
    """
    Create in-app notifications + send emails to Management and the project's
    PM (if any) when a project is added to a cycle.

    actor_emp_id is stamped onto every notification created here so that the
    person who did the enrolling never sees a notification about their own
    action — even if they also belong to the MANAGEMENT role being broadcast
    to. Everyone else in that role, and the PM (if a different person), still
    see it normally.

    Returns the PM info dict (or None) so the caller can also stamp it onto
    the enrollment response without a second TMS round-trip.
    """
    link = f"{settings.FRONTEND_URL}/csat-cycles/{cycle_id}"
    title = "New project added to a CSAT cycle — approval needed"
    base_message = (
        f'{enrolled_by_name} added project "{project_name}" to CSAT cycle '
        f'"{cycle_name}". Please review and approve or decline this addition.'
    )

    # ── Management (always) ─────────────────────────────────────────────────
    local_db.add(Notification(
        recipient_role="MANAGEMENT",
        actor_emp_id=actor_emp_id,
        type="PROJECT_ADDED_TO_CYCLE",
        title=title,
        message=base_message,
        cycle_id=cycle_id,
        project_id=project_id,
        enrollment_id=enrollment_id,
        link=link,
    ))

    for mgmt_user in get_management_users(local_db):
        if EMAIL_NOTIFICATIONS_ENABLED and mgmt_user.get("email"):
            try:
                EmailSender.send_email(
                    to=mgmt_user["email"],
                    subject=title,
                    body=f"{base_message}\n\nReview it here: {link}",
                    html_content=f"<p>{base_message}</p><p><a href='{link}'>Review the cycle</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email management user {mgmt_user.get('emp_id')}: {e}")

    # ── Project Manager (only if one exists on the TMS project) ────────────
    pm_info = None
    try:
        pm_info = get_project_manager(int(project_ext_id), tms_db)
    except Exception as e:
        print(f"[WARN] Could not resolve PM for project {project_ext_id}: {e}")

    if pm_info:
        local_db.add(Notification(
            recipient_emp_id=pm_info["emp_id"],
            actor_emp_id=actor_emp_id,
            type="PROJECT_ADDED_TO_CYCLE",
            title=title,
            message=base_message,
            cycle_id=cycle_id,
            project_id=project_id,
            enrollment_id=enrollment_id,
            link=link,
        ))
        if EMAIL_NOTIFICATIONS_ENABLED and pm_info.get("email"):
            try:
                EmailSender.send_email(
                    to=pm_info["email"],
                    subject=title,
                    body=f"{base_message}\n\nReview it here: {link}",
                    html_content=f"<p>{base_message}</p><p><a href='{link}'>Review the cycle</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email PM {pm_info.get('emp_id')}: {e}")

    local_db.flush()
    return pm_info


# NOTE: notify_managers_of_exemption_escalation and
# notify_requester_of_exemption_decision (which supported the old exempted →
# pending_approval → manager approve/decline flow) have been removed along
# with that flow. They were already unused/never wired up to any endpoint
# before this change.
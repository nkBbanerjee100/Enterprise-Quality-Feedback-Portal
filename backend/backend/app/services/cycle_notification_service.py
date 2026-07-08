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


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

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
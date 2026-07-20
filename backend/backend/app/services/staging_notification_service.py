"""
Project-Staging Notification Service
=====================================
When Quality marks a candidate project "not sure" during pre-cycle
selection, Management (and only Management — never a project's Manager/PM)
gets notified to review it. Once Management decides, the person who
originally selected it gets notified back with the outcome.

This is deliberately separate from cycle_notification_service.py, which
handles the addition-approval flow for adding MORE projects to an
ALREADY-EXISTING cycle (that one notifies Management *and* the PM). This
one only ever notifies Management, since PMs have no role in the initial
project-pool triage.
"""
from typing import Optional
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.services.cycle_notification_service import (
    get_management_users, get_project_manager, EMAIL_NOTIFICATIONS_ENABLED,
)
from app.utils.email import EmailSender
from app.config import settings


def _get_user_by_emp_id(local_db: Session, emp_id: str) -> Optional[dict]:
    row = local_db.execute(
        text("SELECT EmpId AS emp_id, Email AS email, EmpFirstName AS first_name FROM csat_users WHERE EmpId = :emp_id LIMIT 1"),
        {"emp_id": emp_id},
    ).fetchone()
    return dict(row._mapping) if row else None


def _get_users_by_role(local_db: Session, role: str) -> list[dict]:
    rows = local_db.execute(
        text("SELECT EmpId AS emp_id, Email AS email, EmpFirstName AS first_name FROM csat_users WHERE role = :role AND is_active = 1"),
        {"role": role},
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def notify_management_project_needs_review(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_name: str,
    actor_emp_id: str,
) -> None:
    """Broadcast an in-app notification to everyone with role MANAGEMENT
    that a staged project needs their eligibility review. actor_emp_id is
    the Quality/Management user who triaged it as "not sure" — they never
    see this notification about their own action."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "A project needs your eligibility review"
    message = (
        f'{selected_by_name} isn\'t sure whether "{project_name}" should be eligible '
        f"for the next CSAT cycle. Please review and approve or decline it."
    )

    local_db.add(Notification(
        recipient_role="MANAGEMENT",
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_NEEDS_REVIEW",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,   # reused field — staging_id here, not a cycle enrollment
        link=link,
    ))

    for mgmt_user in get_management_users(local_db):
        if EMAIL_NOTIFICATIONS_ENABLED and mgmt_user.get("email"):
            try:
                EmailSender.send_email(
                    to=mgmt_user["email"],
                    subject=title,
                    body=f"{message}\n\nReview it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>Review it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email management user {mgmt_user.get('emp_id')}: {e}")

    local_db.flush()


def notify_quality_of_decision(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_emp_id: str,   # who originally triaged it "not sure" — the recipient here
    approved: bool,
    decided_by_name: str,
    actor_emp_id: str,         # the Management user who just decided — never sees this themselves
    remarks: Optional[str] = None,
) -> None:
    """Notify the person who originally selected a project as "not sure"
    once Management has approved or declined it. Mirrors
    notify_management_project_needs_review's direction, but the other way —
    the decision-maker (Management) is now the actor, and the original
    Quality/Management submitter is the recipient."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    outcome = "approved — it's now eligible" if approved else "declined — it's now marked not eligible"
    title = "Your project selection was reviewed"
    message = f'{decided_by_name} {outcome} for "{project_name}".'
    if remarks:
        message += f' Remarks: "{remarks}"'

    local_db.add(Notification(
        recipient_emp_id=selected_by_emp_id,
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_DECIDED",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, selected_by_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(
                    to=recipient["email"],
                    subject=title,
                    body=f"{message}\n\nSee it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email {selected_by_emp_id} about staging decision: {e}")

    local_db.flush()


def notify_manager_of_final_decision(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    manager_emp_id: Optional[str],   # the Manager whose original exemption started this chain
    approved: bool,                  # Management's final call: True = eligible, False = exempt
    decided_by_name: str,            # the Management user who just decided
    actor_emp_id: str,
) -> None:
    """Notify the project's Manager once Management makes the FINAL call on
    a project that went: Manager exempted it -> Quality reaffirmed it
    eligible during recheck -> Management had the last word. The Manager
    was the one who started this disagreement, so they're the one who
    needs to hear how it was resolved — Quality already gets notified
    separately (notify_quality_of_decision), this is the Manager's copy.

    manager_emp_id can be missing on very old rows from before this field
    was tracked consistently — skip quietly rather than notify no one and
    also rather than error out the whole decision over a notification.
    """
    if not manager_emp_id:
        return

    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "Final decision on your exemption"
    if approved:
        message = (
            f'You marked "{project_name}" exempt, but Quality reaffirmed it eligible and '
            f"{decided_by_name} has confirmed it eligible — it will be included in the cycle."
        )
    else:
        message = (
            f'{decided_by_name} agreed with your exemption — both you and Management have '
            f'marked "{project_name}" exempt. It will not be included in the cycle.'
        )

    local_db.add(Notification(
        recipient_emp_id=manager_emp_id,
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_MANAGER_FINAL_DECISION",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, manager_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(
                    to=recipient["email"],
                    subject=title,
                    body=f"{message}\n\nSee it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email manager {manager_emp_id} about final decision: {e}")

    local_db.flush()


def notify_management_exemption_request(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_name: str,
    exemption_reason: str,
    actor_emp_id: str,
) -> None:
    """Broadcast to everyone with role MANAGEMENT that Quality has requested
    a project be exempted, and it needs their approve/reject decision."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "An exemption request needs your decision"
    message = (
        f'{selected_by_name} requested "{project_name}" be exempted from the next '
        f'CSAT cycle: "{exemption_reason}". Please approve or reject the exemption.'
    )

    local_db.add(Notification(
        recipient_role="MANAGEMENT",
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_EXEMPTION_REQUEST",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,   # reused field — staging_id here, not a cycle enrollment
        link=link,
    ))

    for mgmt_user in get_management_users(local_db):
        if EMAIL_NOTIFICATIONS_ENABLED and mgmt_user.get("email"):
            try:
                EmailSender.send_email(
                    to=mgmt_user["email"],
                    subject=title,
                    body=f"{message}\n\nDecide here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>Decide</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email management user {mgmt_user.get('emp_id')}: {e}")

    local_db.flush()


def notify_quality_of_exemption_decision(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_emp_id: str,   # who requested the exemption — the recipient here
    exemption_approved: bool,  # True = confirmed exempt; False = rejected, now eligible
    decided_by_name: str,
    actor_emp_id: str,
    remarks: Optional[str] = None,
) -> None:
    """Notify the Quality user who requested an exemption once Management
    has approved or rejected it."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    outcome = (
        "approved the exemption — it's now marked exempt" if exemption_approved
        else "rejected the exemption — it's now eligible and has been sent to its Manager for review"
    )
    title = "Your exemption request was reviewed"
    message = f'{decided_by_name} {outcome} for "{project_name}".'
    if remarks:
        message += f' Remarks: "{remarks}"'

    local_db.add(Notification(
        recipient_emp_id=selected_by_emp_id,
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_EXEMPTION_DECIDED",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, selected_by_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(
                    to=recipient["email"],
                    subject=title,
                    body=f"{message}\n\nSee it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email {selected_by_emp_id} about exemption decision: {e}")

    local_db.flush()


def notify_manager_project_needs_review(
    *,
    local_db: Session,
    manager_emp_id: str,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_name: str,
    actor_emp_id: str,
) -> None:
    """Notify the project's own Manager that Quality marked their project
    eligible and it now needs their review — the one step in this whole
    flow that's ever targeted at a specific PM rather than a role."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "A project of yours needs your review"
    message = (
        f'{selected_by_name} marked "{project_name}" as eligible for the next '
        f"CSAT cycle. As its Manager, please review and mark it Eligible or Exempt."
    )

    local_db.add(Notification(
        recipient_emp_id=manager_emp_id,
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_NEEDS_MANAGER_REVIEW",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,   # reused field — staging_id here, not a cycle enrollment
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, manager_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(
                    to=recipient["email"],
                    subject=title,
                    body=f"{message}\n\nReview it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>Review it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email manager {manager_emp_id} about staging review: {e}")

    local_db.flush()


def notify_quality_project_needs_recheck(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    selected_by_emp_id: str,   # the Quality user who originally triaged it — the recipient here
    manager_name: str,
    exemption_reason: str,
    actor_emp_id: str,
) -> None:
    """Notify the Quality user who originally marked a project eligible
    that its Manager has since exempted it (with a mandatory reason), and
    it's back with Quality to recheck — Exempt (final) or Eligible (goes
    on to Management)."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "A project's Manager marked it exempt — please recheck"
    message = (
        f'{manager_name} marked "{project_name}" exempt: "{exemption_reason}". '
        f"Please recheck — Exempt to finalize, or Eligible to send it on to Management."
    )

    local_db.add(Notification(
        recipient_emp_id=selected_by_emp_id,
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_NEEDS_QUALITY_RECHECK",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED:
        recipient = _get_user_by_emp_id(local_db, selected_by_emp_id)
        if recipient and recipient.get("email"):
            try:
                EmailSender.send_email(
                    to=recipient["email"],
                    subject=title,
                    body=f"{message}\n\nRecheck it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>Recheck it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email {selected_by_emp_id} about quality recheck: {e}")

    local_db.flush()


def notify_quality_role_project_needs_recheck(
    *,
    local_db: Session,
    project_name: str,
    project_id: int,
    staging_id: int,
    manager_name: str,
    exemption_reason: str,
    actor_emp_id: str,
) -> None:
    """Same as notify_quality_project_needs_recheck, but broadcast to
    everyone with role QUALITY instead of one specific person — used when a
    Manager self-initiates (see manager_select_projects in
    project_staging.py), so there's no original Quality submitter to
    target directly."""
    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    title = "A project's Manager marked it exempt — please recheck"
    message = (
        f'{manager_name} marked "{project_name}" exempt: "{exemption_reason}". '
        f"Please recheck — Exempt to finalize, or Eligible to send it on to Management."
    )

    local_db.add(Notification(
        recipient_role="QUALITY",
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_NEEDS_QUALITY_RECHECK",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,
        link=link,
    ))

    for quality_user in _get_users_by_role(local_db, "QUALITY"):
        if EMAIL_NOTIFICATIONS_ENABLED and quality_user.get("email"):
            try:
                EmailSender.send_email(
                    to=quality_user["email"],
                    subject=title,
                    body=f"{message}\n\nRecheck it here: {link}",
                    html_content=f"<p>{message}</p><p><a href='{link}'>Recheck it</a></p>",
                )
            except Exception as e:
                print(f"[WARN] Failed to email quality user {quality_user.get('emp_id')}: {e}")

    local_db.flush()


def notify_pm_project_triaged(
    *,
    local_db: Session,
    tms_db: Session,
    project_name: str,
    project_id: int,
    project_ext_id: str,
    staging_id: int,
    decision: str,          # "eligible" | "exempted"
    triaged_by_name: str,
    actor_emp_id: str,
) -> Optional[dict]:
    """
    Notify a project's own Manager (PM, looked up from TMS PmId) when
    Quality/Management triages THEIR project as eligible or exempted during
    pre-cycle staging. This is a purely informational, targeted notification
    — the PM has no decision to make here (that's still Management-only,
    via notify_management_project_needs_review / decide_staged_project);
    they're just being kept in the loop about their own project's status.

    Deliberately skipped for the 'not_sure' action — that one already
    notifies Management, and until Management decides there's nothing
    final yet to tell the PM about.

    Returns the PM info dict (or None if no PM is assigned on the TMS
    project), mirroring get_project_manager's own return contract.
    """
    pm_info = None
    try:
        pm_info = get_project_manager(int(project_ext_id), tms_db)
    except Exception as e:
        print(f"[WARN] Could not resolve PM for staged project {project_ext_id}: {e}")

    if not pm_info:
        return None

    link = f"{settings.FRONTEND_URL}/csat-cycles/select-projects"
    if decision == "eligible":
        title = "Your project was marked eligible for the next CSAT cycle"
        message = (
            f'{triaged_by_name} marked "{project_name}" as eligible for the '
            f"next CSAT feedback cycle."
        )
    else:
        title = "Your project was marked not eligible for the next CSAT cycle"
        message = (
            f'{triaged_by_name} marked "{project_name}" as not eligible for '
            f"the next CSAT feedback cycle."
        )

    local_db.add(Notification(
        recipient_emp_id=pm_info["emp_id"],
        actor_emp_id=actor_emp_id,
        type="STAGED_PROJECT_TRIAGED",
        title=title,
        message=message,
        project_id=project_id,
        enrollment_id=staging_id,   # reused field — staging_id, not a cycle enrollment
        link=link,
    ))

    if EMAIL_NOTIFICATIONS_ENABLED and pm_info.get("email"):
        try:
            EmailSender.send_email(
                to=pm_info["email"],
                subject=title,
                body=f"{message}\n\nSee it here: {link}",
                html_content=f"<p>{message}</p><p><a href='{link}'>View it</a></p>",
            )
        except Exception as e:
            print(f"[WARN] Failed to email PM {pm_info.get('emp_id')} about staging triage: {e}")

    local_db.flush()
    return pm_info
"""Dashboard metrics routes — real data from csat_tool_db"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user
from app.services.cycle_notification_service import get_project_manager

router = APIRouter()


def _scoped_project_ids(current_user: dict, db: Session, tms_db: Session) -> list[int] | None:
    """
    Returns the list of project_ids this user's dashboard should be scoped to,
    or None if they should see every project (no filtering).

    Mirrors the same MANAGER-only scoping already used in
    feedback.py::list_feedback_requests — a MANAGER only sees data for
    projects where they're the assigned PM (per TMS PmId); every other role
    (QUALITY, MANAGEMENT, DELIVERY, SALES) sees the org-wide picture.
    """
    if current_user.get("role") != "MANAGER":
        return None

    my_emp_id = current_user.get("emp_id")

    all_project_ids_rows = db.execute(
        text("SELECT DISTINCT project_id FROM fact_feedback_request WHERE project_id IS NOT NULL")
    ).fetchall()
    all_project_ids = [r.project_id for r in all_project_ids_rows]

    my_project_ids = [
        pid for pid in all_project_ids
        if (get_project_manager(pid, tms_db) or {}).get("emp_id") == my_emp_id
    ]
    return my_project_ids


@router.get("/")
def get_dashboard(
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Get dashboard KPI metrics from the fact_feedback_request table,
    scoped to the current user's assigned projects when they're a MANAGER."""

    project_ids = _scoped_project_ids(current_user, db, tms_db)
    # project_ids is None  -> no scoping (org-wide roles)
    # project_ids is []    -> MANAGER with zero assigned projects -> all counts are 0
    # project_ids is [...] -> MANAGER scoped to just those projects

    scope_clause = ""
    params: dict = {}
    if project_ids is not None:
        if not project_ids:
            # No assigned projects at all — short-circuit to all-zero metrics
            # rather than running (and mis-parsing) an empty IN ().
            return {
                "metrics": {
                    "totalResponses":   0,
                    "totalSubmitted":   0,
                    "totalPending":     0,
                    "totalExpired":     0,
                    "averageCsatScore": None,
                    "averageNpsScore":  None,
                    "satisfactionRate": None,
                },
                "recentResponses": 0,
                "pendingRequests": 0,
                "openActionPlans": 0,
            }
        scope_clause = "AND project_id IN :project_ids"
        params["project_ids"] = tuple(project_ids)

    # Total forms sent (any record in the table = a form was dispatched)
    total_sent_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE 1=1 {scope_clause}"),
        params,
    ).fetchone()
    total_sent = total_sent_row.cnt if total_sent_row else 0

    # Submitted / completed responses
    submitted_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status = 'completed' {scope_clause}"),
        params,
    ).fetchone()
    total_submitted = submitted_row.cnt if submitted_row else 0

    # Pending (sent but not yet completed or expired)
    pending_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status IN ('pending', 'sent') {scope_clause}"),
        params,
    ).fetchone()
    total_pending = pending_row.cnt if pending_row else 0

    # Expired
    expired_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status = 'expired' {scope_clause}"),
        params,
    ).fetchone()
    total_expired = expired_row.cnt if expired_row else 0

    # Response rate
    response_rate = (total_submitted / total_sent) if total_sent > 0 else None

    # Average CSAT score — csat_score lives on fact_feedback_response, one
    # row per submitted survey, so this needs a join back to
    # fact_feedback_request to apply the same project scoping as everything
    # else above (fact_feedback_response has no project_id of its own).
    #
    # Wrapped defensively: if this query fails for any reason (unexpected
    # schema state, driver quirk, etc.) the rest of the dashboard's KPIs
    # should still load rather than the whole endpoint 500ing over one
    # optional number.
    average_csat_score = None
    try:
        # Built directly (not via scope_clause.replace(...)) — replacing the
        # substring "project_id" inside scope_clause also matched the bind
        # parameter name ":project_ids" itself, corrupting it into
        # ":r.project_ids" and breaking the query entirely.
        avg_scope_clause = "AND r.project_id IN :project_ids" if project_ids else ""
        avg_csat_row = db.execute(
            text(f"""
                SELECT AVG(fr.csat_score) AS avg_csat
                FROM fact_feedback_response fr
                JOIN fact_feedback_request r ON r.id = fr.feedback_request_id
                WHERE fr.csat_score IS NOT NULL {avg_scope_clause}
            """),
            params,
        ).fetchone()
        if avg_csat_row and avg_csat_row.avg_csat is not None:
            average_csat_score = round(float(avg_csat_row.avg_csat), 2)
    except Exception as e:
        db.rollback()
        print(f"[WARN] Could not compute average CSAT score: {e}")

    # Recent requests (last 30 days)
    recent_row = db.execute(
        text(f"""
            SELECT COUNT(*) AS cnt
            FROM fact_feedback_request
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) {scope_clause}
        """),
        params,
    ).fetchone()
    recent_count = recent_row.cnt if recent_row else 0

    return {
        "metrics": {
            "totalResponses":    total_sent,
            "totalSubmitted":    total_submitted,
            "totalPending":      total_pending,
            "totalExpired":      total_expired,
            "averageCsatScore":  average_csat_score,
            "averageNpsScore":   None,   # no NPS collection in the survey yet
            "satisfactionRate":  response_rate,
        },
        "recentResponses":  recent_count,
        "pendingRequests":  total_pending,
        "openActionPlans":  0,
    }


@router.get("/metrics/{cycle_id}")
def get_cycle_metrics(
    cycle_id: int,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """Get metrics filtered by a specific CSAT cycle, scoped to the current
    user's assigned projects when they're a MANAGER."""
    project_ids = _scoped_project_ids(current_user, db, tms_db)

    scope_clause = ""
    params: dict = {"cid": cycle_id}
    if project_ids is not None:
        if not project_ids:
            return {"cycle_id": cycle_id, "total_sent": 0, "total_submitted": 0, "response_rate": None}
        scope_clause = "AND project_id IN :project_ids"
        params["project_ids"] = tuple(project_ids)

    total_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE csat_cycle_id = :cid {scope_clause}"),
        params,
    ).fetchone()
    total = total_row.cnt if total_row else 0

    submitted_row = db.execute(
        text(f"SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE csat_cycle_id = :cid AND status = 'completed' {scope_clause}"),
        params,
    ).fetchone()
    submitted = submitted_row.cnt if submitted_row else 0

    return {
        "cycle_id": cycle_id,
        "total_sent": total,
        "total_submitted": submitted,
        "response_rate": (submitted / total) if total > 0 else None,
    }
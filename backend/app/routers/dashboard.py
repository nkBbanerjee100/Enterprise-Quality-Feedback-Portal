"""Dashboard metrics routes — real data from csat_tool_db"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_local_db
from app.core.dependencies import get_current_user

router = APIRouter()


@router.get("/")
def get_dashboard(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    """Get dashboard KPI metrics from the fact_feedback_request table."""

    # Total forms sent (any record in the table = a form was dispatched)
    total_sent_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request")
    ).fetchone()
    total_sent = total_sent_row.cnt if total_sent_row else 0

    # Submitted / completed responses
    submitted_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status = 'completed'")
    ).fetchone()
    total_submitted = submitted_row.cnt if submitted_row else 0

    # Pending (sent but not yet completed or expired)
    pending_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status IN ('pending', 'sent', 'opened')")
    ).fetchone()
    total_pending = pending_row.cnt if pending_row else 0

    # Expired
    expired_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE status = 'expired'")
    ).fetchone()
    total_expired = expired_row.cnt if expired_row else 0

    # Response rate
    response_rate = (total_submitted / total_sent) if total_sent > 0 else None

    # Recent requests (last 30 days)
    recent_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM fact_feedback_request
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        """)
    ).fetchone()
    recent_count = recent_row.cnt if recent_row else 0

    return {
        "metrics": {
            "totalResponses":    total_sent,
            "totalSubmitted":    total_submitted,
            "totalPending":      total_pending,
            "totalExpired":      total_expired,
            "averageCsatScore":  None,   # no score table yet
            "averageNpsScore":   None,
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
    current_user: dict = Depends(get_current_user),
):
    """Get metrics filtered by a specific CSAT cycle."""
    total_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE csat_cycle_id = :cid"),
        {"cid": cycle_id},
    ).fetchone()
    total = total_row.cnt if total_row else 0

    submitted_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM fact_feedback_request WHERE csat_cycle_id = :cid AND status = 'completed'"),
        {"cid": cycle_id},
    ).fetchone()
    submitted = submitted_row.cnt if submitted_row else 0

    return {
        "cycle_id": cycle_id,
        "total_sent": total,
        "total_submitted": submitted,
        "response_rate": (submitted / total) if total > 0 else None,
    }
"""Dashboard metrics routes"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_local_db
from app.schemas.dashboard import DashboardResponse

router = APIRouter()

@router.get("/", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_local_db)):
    """Get dashboard metrics"""
    return {
        "metrics": {
            "total_responses":    0,
            "average_csat_score": 0.0,
            "average_nps_score":  0.0,
            "satisfaction_rate":  0.0,
        },
        "recent_responses":  0,
        "pending_requests":  0,
        "open_action_plans": 0,
    }

@router.get("/metrics/{cycle_id}")
def get_cycle_metrics(cycle_id: int, db: Session = Depends(get_local_db)):
    """Get metrics for a specific CSAT cycle"""
    pass
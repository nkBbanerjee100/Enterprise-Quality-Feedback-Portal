"""Dashboard metrics routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_local_db
from app.schemas.dashboard import DashboardResponse

router = APIRouter()


@router.get("/", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_local_db)):
    """Get dashboard metrics"""
    # TODO: Implement dashboard metrics
    pass


@router.get("/metrics/{cycle_id}")
def get_cycle_metrics(cycle_id: int, db: Session = Depends(get_local_db)):
    """Get metrics for a specific CSAT cycle"""
    # TODO: Implement cycle metrics
    pass

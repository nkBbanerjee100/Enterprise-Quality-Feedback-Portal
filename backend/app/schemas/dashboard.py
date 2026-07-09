"""Dashboard schemas"""
from pydantic import BaseModel
from typing import Optional, List


class DashboardMetrics(BaseModel):
    """Dashboard metrics summary"""
    total_responses: int
    average_csat_score: Optional[float]
    average_nps_score: Optional[float]
    satisfaction_rate: Optional[float]


class DashboardResponse(BaseModel):
    """Dashboard data response"""
    metrics: DashboardMetrics
    recent_responses: int
    pending_requests: int
    open_action_plans: int

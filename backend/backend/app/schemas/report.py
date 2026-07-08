"""Report schemas"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ReportFilter(BaseModel):
    """Report filter parameters"""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    project_id: Optional[int] = None
    csat_cycle_id: Optional[int] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None


class ReportResponse(BaseModel):
    """Report response data"""
    title: str
    generated_at: datetime
    period: str
    summary: dict
    details: List[dict]

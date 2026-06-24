"""CSAT Cycle schemas"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CSATCycleCreate(BaseModel):
    """CSAT Cycle creation request"""
    cycle_name: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime


class CSATCycleUpdate(BaseModel):
    """CSAT Cycle update request"""
    cycle_name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None


class CSATCycleResponse(BaseModel):
    """CSAT Cycle response"""
    id: int
    cycle_name: str
    description: Optional[str]
    start_date: datetime
    end_date: datetime
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

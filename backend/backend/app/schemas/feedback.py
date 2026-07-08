"""Feedback-related schemas"""
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class FeedbackRequestCreate(BaseModel):
    """Feedback request creation"""
    csat_cycle_id: int
    project_id: int
    recipient_email: str
    recipient_name: str


class FeedbackRequestResponse(BaseModel):
    """Feedback request response"""
    id: int
    csat_cycle_id: int
    project_id: int
    recipient_email: str
    recipient_name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackResponseCreate(BaseModel):
    """Feedback response submission"""
    feedback_request_id: int
    csat_score: float
    nps_score: Optional[float] = None
    comments: Optional[str] = None
    response_data: Optional[Dict[str, Any]] = None


class FeedbackResponseModel(BaseModel):
    """Feedback response"""
    id: int
    feedback_request_id: int
    csat_score: float
    nps_score: Optional[float]
    comments: Optional[str]
    submitted_at: datetime

    class Config:
        from_attributes = True

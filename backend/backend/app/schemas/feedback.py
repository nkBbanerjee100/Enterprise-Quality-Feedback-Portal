"""Feedback-related schemas"""

from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


# ---------------------------------------------------------
# Existing feedback request schemas
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# Existing feedback response schemas
# ---------------------------------------------------------

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
    nps_score: Optional[float] = None
    comments: Optional[str] = None
    submitted_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------
# Feedback router payload schemas
# Required by app/routers/feedback.py
# ---------------------------------------------------------

class FeedbackRequestPayload(BaseModel):
    """
    Payload for creating a feedback request.
    Used by:
    POST /requests
    """

    csatCycleId: int
    projectId: int
    recipientEmail: str
    recipientName: str

    cc: Optional[List[str]] = None
    periodOfPerformance: Optional[str] = None
    message: Optional[str] = None


class EditDraftPayload(BaseModel):
    """
    Payload for editing draft feedback request.
    Used by:
    PUT /requests/{request_id}
    """

    projectId: int
    recipientEmail: str
    recipientName: str

    periodOfPerformance: Optional[str] = None
    message: Optional[str] = None


class PMApprovePayload(BaseModel):
    """
    Payload for PM approval.
    Used by:
    POST /requests/{request_id}/pm-approve
    """

    pmAchievements: str


class PMRejectPayload(BaseModel):
    """
    Payload for PM rejection.
    Used by:
    POST /requests/{request_id}/pm-reject
    """

    pmRejectionComments: str


class SurveySubmitPayload(BaseModel):
    """
    Customer survey submission payload.
    Used by:
    POST /public/submit
    """

    email: str
    data: Dict[str, Any]
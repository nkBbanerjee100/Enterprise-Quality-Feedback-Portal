"""Project schemas"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    """Project creation request"""
    project_id: str
    project_name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    """Project update request"""
    project_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ProjectResponse(BaseModel):
    """Project response"""
    id: int
    project_id: str
    project_name: str
    description: Optional[str]
    is_active: bool
    synced_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

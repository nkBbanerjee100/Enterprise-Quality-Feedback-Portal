"""User schemas"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.user import RoleEnum


class UserCreate(BaseModel):
    """User creation request"""
    email: EmailStr
    full_name: str
    password: str
    role: RoleEnum = RoleEnum.QUALITY


class UserUpdate(BaseModel):
    """User update request"""
    full_name: Optional[str] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """User response"""
    id: int
    email: str
    full_name: str
    role: RoleEnum
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

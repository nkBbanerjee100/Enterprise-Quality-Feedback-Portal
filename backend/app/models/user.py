"""User and Role models"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.models import Base


class RoleEnum(str, enum.Enum):
    """User roles"""
    QUALITY            = "QUALITY"
    DELIVERY             = "DELIVERY"
    SALES                 = "SALES"
    CUSTOMER                 = "CUSTOMER"
    MANAGER                 = "MANAGER"

class User(Base):
    """User model"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SQLEnum(RoleEnum), default=RoleEnum.QUALITY, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    def __repr__(self):
        return f"<User {self.email}>"

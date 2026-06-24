"""CSAT Cycle master model"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base


class CSATCycle(Base):
    """CSAT Cycle master table"""
    __tablename__ = "csat_cycles"

    id = Column(Integer, primary_key=True)
    cycle_name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    def __repr__(self):
        return f"<CSATCycle {self.cycle_name}>"

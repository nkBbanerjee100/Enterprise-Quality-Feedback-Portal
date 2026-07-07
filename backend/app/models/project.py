"""Project model (dim_projects)"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.models import Base


class Project(Base):
    """Dimension table for projects (synced from TMS)"""
    __tablename__ = "dim_projects"

    id = Column(Integer, primary_key=True)
    project_id = Column(String(50), unique=True, nullable=False, index=True)
    project_name = Column(String(255), nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    synced_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<Project {self.project_name}>"

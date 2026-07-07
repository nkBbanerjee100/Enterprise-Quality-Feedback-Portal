"""Project management routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_local_db
from app.schemas.project import ProjectResponse

router = APIRouter()


@router.get("/", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_local_db)):
    """List all projects"""
    # TODO: Implement project listing
    return []


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_local_db)):
    """Get project by ID"""
    # TODO: Implement get project
    pass

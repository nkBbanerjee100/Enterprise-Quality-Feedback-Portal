"""User management routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_local_db
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_local_db)):
    """List all users"""
    # TODO: Implement user listing
    return []


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate, db: Session = Depends(get_local_db)):
    """Create a new user"""
    # TODO: Implement user creation
    pass


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_local_db)):
    """Get user by ID"""
    # TODO: Implement get user
    pass

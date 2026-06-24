"""CSAT Cycle routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database import get_local_db
from app.schemas.csat_cycle import CSATCycleCreate, CSATCycleResponse

router = APIRouter()


@router.get("/", response_model=list[CSATCycleResponse])
def list_csat_cycles(db: Session = Depends(get_local_db)):
    """List all CSAT cycles"""
    # TODO: Implement CSAT cycle listing
    return []


@router.post("/", response_model=CSATCycleResponse, status_code=status.HTTP_201_CREATED)
def create_csat_cycle(cycle: CSATCycleCreate, db: Session = Depends(get_local_db)):
    """Create a new CSAT cycle"""
    # TODO: Implement CSAT cycle creation
    pass


@router.get("/{cycle_id}", response_model=CSATCycleResponse)
def get_csat_cycle(cycle_id: int, db: Session = Depends(get_local_db)):
    """Get CSAT cycle by ID"""
    # TODO: Implement get CSAT cycle
    pass

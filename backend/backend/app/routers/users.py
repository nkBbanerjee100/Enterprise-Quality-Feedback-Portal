"""User management routes"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_local_db
from app.schemas.user import UserCreate, UserResponse
from app.core.dependencies import require_role

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


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/users/login-activity — Quality-only audit view: who logged in and
# when, sourced from csat_users.last_login_at (already updated on every
# successful login — see routers/auth.py). This is each person's MOST
# RECENT login only, not a full historical log of every login event — a
# true multi-event audit trail would need a separate append-only table
# with a row written on every login, not just overwriting one column.
#
# NOTE: this route MUST be declared before "/{user_id}" below. FastAPI
# matches routes in registration order, so if "/{user_id}" comes first it
# swallows "GET /login-activity" as user_id="login-activity", which then
# fails int-validation and returns a 422 instead of ever reaching this
# handler. That was the bug causing "Failed to load login activity."
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/login-activity")
def list_login_activity(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY")),
):
    rows = db.execute(
        text("""
            SELECT
                EmpId AS emp_id,
                CONCAT_WS(' ', EmpFirstName, EmpLastName) AS name,
                role,
                last_login_at
            FROM csat_users
            WHERE is_active = 1
            ORDER BY last_login_at DESC
        """)
    ).fetchall()

    return [
        {
            "emp_id": r.emp_id,
            "name": r.name,
            "role": r.role,
            "last_login_at": r.last_login_at.isoformat() if r.last_login_at else None,
        }
        for r in rows
    ]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_local_db)):
    """Get user by ID"""
    # TODO: Implement get user
    pass
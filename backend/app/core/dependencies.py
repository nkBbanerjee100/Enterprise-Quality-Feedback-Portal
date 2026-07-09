"""Dependency injection utilities"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_local_db
from app.core.security import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_local_db),
) -> dict:
    """
    Validate Bearer token and return the current user dict.
    Also rejects tokens that have been blacklisted via /logout.
    """
    from app.routers.auth import _token_blacklist   # imported here to avoid circular import

    token = credentials.credentials

    # 1. Check blacklist first
    if token in _token_blacklist:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated. Please login again.",
        )

    # 2. Decode and validate JWT
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    emp_id = payload.get("sub")
    if not emp_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing subject.",
        )

    # 3. Fetch user from DB
    row = db.execute(
        text("""
            SELECT EmpId, EmpFirstName, EmpLastName, Email, role, is_active
            FROM csat_users WHERE EmpId = :emp_id LIMIT 1
        """),
        {"emp_id": emp_id},
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    if not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    return {
        "emp_id":    row.EmpId,
        "name":      row.EmpFirstName,
        "email":     row.Email,
        "role":      row.role,
        "is_active": row.is_active,
    }


def require_role(*roles: str):
    """Require specific roles — use as a FastAPI dependency."""
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {list(roles)}",
            )
        return current_user
    return role_checker
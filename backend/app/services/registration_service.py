"""
Registration Service
====================
Flow:
  1. User submits EmpId, name, gender, email + password
  2. Check if EmpId is already registered locally
  3. If not → create row in csat_tool_db.csat_users
  4. User is registered ✅
"""
 
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException, status
from passlib.context import CryptContext
from app.core.security import verify_password, create_access_token, create_refresh_token
from datetime import datetime
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
# ============================================================
# Check if already registered locally
# ============================================================
def is_already_registered(emp_id: str, local_db: Session) -> bool:
    """Check if EmpId already exists in local csat_users"""
    query = text("""
        SELECT EmpId FROM csat_users
        WHERE EmpId = :emp_id AND is_registered = 1
        LIMIT 1
    """)
    result = local_db.execute(query, {"emp_id": emp_id}).fetchone()
    return result is not None
 
 
# ============================================================
# Register user locally
# ============================================================
def register_user_locally(
    emp_data: dict,
    password: str,
    local_db: Session
) -> dict:
    """
    Create new user in local csat_tool_db.csat_users.
    """
    hashed_password = pwd_context.hash(password)
 
    query = text("""
        INSERT INTO csat_users (
            EmpId,
            EmpFirstName,
            EmpMiddleName,
            EmpLastName,
            Gender,
            Email,
            hashed_password,
            role,
            is_active,
            is_registered
        ) VALUES (
            :EmpId,
            :EmpFirstName,
            :EmpMiddleName,
            :EmpLastName,
            :Gender,
            :Email,
            :hashed_password,
            :role,
            1,
            1
        )
    """)
 
    local_db.execute(query, {
        **emp_data,
        "hashed_password": hashed_password,
        "role": emp_data["role"],
    })
    local_db.commit()
 
    return {
        "EmpId":        emp_data["EmpId"],
        "EmpFirstName": emp_data["EmpFirstName"],
        "Email":        emp_data["Email"],
        # "role":         "Quality_User",
    }
 
 
# ============================================================
# Main Registration Function — used by the router
# ============================================================
def register_new_user(
    emp_data: dict,
    password: str,
    local_db: Session
) -> dict:
    """
    Registration flow:
    local duplicate check → local register
    """
 
    # Already registered?
    if is_already_registered(emp_data["EmpId"], local_db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Employee ID is already registered. Please login instead."
        )
 
    # Register locally
    user = register_user_locally(emp_data, password, local_db)
 
    return user
 

# ============================================================
# Blacklisted tokens (in-memory store for logout)
# In production, use Redis or a DB table instead
# ============================================================
_blacklisted_tokens: set = set()


def blacklist_token(token: str) -> None:
    """Add a token to the blacklist (logout)"""
    _blacklisted_tokens.add(token)


def is_token_blacklisted(token: str) -> bool:
    """Check if a token has been blacklisted"""
    return token in _blacklisted_tokens


# ============================================================
# Login Service
# ============================================================
def login_user(email: str, password: str, local_db: Session) -> dict:
    """
    Login flow:
    1. Fetch user by email from csat_users
    2. Verify the password matches the stored hash
    3. Check user is active and registered
    4. Generate and return JWT access + refresh tokens
    """

    # Step 1 — fetch user by email
    query = text("""
        SELECT EmpId, EmpFirstName, EmpLastName, Email,
               hashed_password, role, is_active, is_registered
        FROM csat_users
        WHERE Email = :email
        LIMIT 1
    """)
    row = local_db.execute(query, {"email": email}).fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Step 2 — verify password
    if not verify_password(password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Step 3 — check account is active and registered
    if not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact admin.",
        )

    if not row.is_registered:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account registration is incomplete.",
        )

    # Step 4 — generate JWT tokens
    token_data = {
        "sub": row.EmpId,
        "email": row.Email,
        "role": row.role,
    }
    access_token  = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    # Update last_login_at
    local_db.execute(
        text("UPDATE csat_users SET last_login_at = :now WHERE Email = :email"),
        {"now": datetime.utcnow(), "email": email},
    )
    local_db.commit()

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "emp_id":        row.EmpId,
        "name":          row.EmpFirstName,
        "email":         row.Email,
        "role":          row.role,
    }
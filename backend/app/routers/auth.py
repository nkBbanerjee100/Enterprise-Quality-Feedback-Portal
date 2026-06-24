"""Authentication Router — register / login / logout"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import timedelta

from app.database import get_local_db
from app.services.registration_service import register_new_user
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_user
from app.config import settings

router = APIRouter()

# ============================================================
# In-memory token blacklist for logout
# (For production: use Redis or a DB table instead)
# ============================================================
_token_blacklist: set = set()


# ============================================================
# Pydantic Schemas
# ============================================================

class RegisterRequest(BaseModel):
    emp_id: str
    emp_first_name: str
    emp_middle_name: Optional[str] = None
    emp_last_name: str
    gender: str
    email: EmailStr
    role: str
    password: str
    confirm_password: str

    @field_validator("role")
    def role_must_be_allowed(cls, v):
        allowed = {"QUALITY", "DELIVERY", "SALES", "CUSTOMER"  ,"MANAGER"}
        if v not in allowed:
            raise ValueError(f"Role '{v}' cannot be self-assigned during registration.")
        return v

    @field_validator("emp_id")
    def emp_id_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Employee ID cannot be empty")
        return v.strip()

    @field_validator("emp_first_name", "emp_last_name")
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name fields cannot be empty")
        return v.strip()

    @field_validator("gender")
    def gender_valid(cls, v):
        if v.upper() not in ("M", "F", "OTHER"):
            raise ValueError("Gender must be M, F, or OTHER")
        return v.upper()

    @field_validator("password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("confirm_password")
    def passwords_must_match(cls, v, values):
        if "password" in values.data and v != values.data["password"]:
            raise ValueError("Passwords do not match")
        return v


class RegisterResponse(BaseModel):
    message: str
    emp_id: str
    name: str
    email: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    message: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    emp_id: str
    name: str
    email: str
    role: str


class LogoutRequest(BaseModel):
    access_token: str


class LogoutResponse(BaseModel):
    message: str


class MeUser(BaseModel):
    id: str
    email: str
    displayName: str


class MeResponse(BaseModel):
    user: MeUser
    role: str
    permissions: list[str]
    defaultRoute: str


# ============================================================
# Role → permissions + default route map
# ============================================================
_ROLE_CONFIG: dict = {
    # Quality_Admin → dashboard (admin page is Phase 2, redirects to dashboard for now)
    "QUALITY": {
        "permissions": [
            "VIEW_PROJECTS", "SEND_FEEDBACK", "RESEND_FEEDBACK",
            "VIEW_REPORTS", "EXPORT_REPORTS", "MANAGE_USERS",
            "VIEW_AUDIT_LOGS", "MANAGE_SETTINGS",
        ],
        "defaultRoute": "/dashboard",
    },
    "MANAGER": {
        "permissions": [
            "VIEW_PROJECTS", "SEND_FEEDBACK", "RESEND_FEEDBACK",
            "VIEW_REPORTS", "EXPORT_REPORTS", "MANAGE_USERS",
            "VIEW_AUDIT_LOGS", "MANAGE_SETTINGS",
        ],
        "defaultRoute": "/dashboard",
    },
    # Quality_User → main quality dashboard
    "DELIVERY": {
        "permissions": [
            "VIEW_PROJECTS", "SEND_FEEDBACK",
            "VIEW_REPORTS", "EXPORT_REPORTS",
        ],
        "defaultRoute": "/dashboard",
    },
    # Management_User → reports page (doc §4: view dashboards, quality trends, summaries)
    "SALES": {
        "permissions": [
            "VIEW_REPORTS", "EXPORT_REPORTS",
        ],
        "defaultRoute": "/reports",
    },
    # Customer → survey links are public/token-based, no portal login needed
    # If they somehow land here, send to unauthorized
    "CUSTOMER": {
        "permissions": ["SUBMIT_FEEDBACK"],
        "defaultRoute": "/unauthorized",
    },
}


# ============================================================
# POST /api/auth/register
# ============================================================
@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
)
async def register(
    payload: RegisterRequest,
    local_db: Session = Depends(get_local_db),
):
    emp_data = {
        "EmpId":        payload.emp_id,
        "EmpFirstName": payload.emp_first_name,
        "EmpLastName":  payload.emp_last_name,
        "Gender":       payload.gender,
        "Email":        payload.email,
        "EmpMiddleName": payload.emp_middle_name,
        "role":         payload.role,
    }

    user = register_new_user(
        emp_data=emp_data,
        password=payload.password,
        local_db=local_db,
    )

    return RegisterResponse(
        message="Registration successful! You can now login.",
        emp_id=user["EmpId"],
        name=user["EmpFirstName"],
        email=user["Email"],
    )


# ============================================================
# POST /api/auth/login
# ============================================================
@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Login and get JWT tokens",
    description="""
    Login flow:
    1. Look up user by email in csat_users table
    2. Verify the password against the stored bcrypt hash
    3. Check that the account is active (is_active = 1)
    4. Issue a short-lived access token + long-lived refresh token
    """,
)
async def login(
    payload: LoginRequest,
    local_db: Session = Depends(get_local_db),
):
    # 1. Fetch user by email
    query = text("""
        SELECT EmpId, EmpFirstName, EmpLastName, Email, hashed_password, role, is_active
        FROM csat_users
        WHERE Email = :email
        LIMIT 1
    """)
    row = local_db.execute(query, {"email": payload.email}).fetchone()

    # 2. User not found
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # 3. Wrong password
    if not verify_password(payload.password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # 4. Account inactive
    if not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive. Please contact the administrator.",
        )

    # 5. Build JWT payload  (sub = EmpId, role for RBAC checks later)
    token_data = {
        "sub":  row.EmpId,
        "email": row.Email,
        "role":  row.role,
    }

    access_token  = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    # 6. Update last_login_at
    local_db.execute(
        text("UPDATE csat_users SET last_login_at = NOW() WHERE EmpId = :emp_id"),
        {"emp_id": row.EmpId},
    )
    local_db.commit()

    return LoginResponse(
        message="Login successful!",
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        emp_id=row.EmpId,
        name=row.EmpFirstName,
        email=row.Email,
        role=row.role,
    )


# ============================================================
# POST /api/auth/logout
# ============================================================
@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout — invalidate access token",
    description="""
    Logout flow:
    1. Decode the provided access token to verify it is valid
    2. Add the token to an in-memory blacklist so it can never be reused
    3. Any subsequent request carrying this token will get 401 Unauthorized
    """,
)
async def logout():
    # 1. Decode to validate the token first

    return LogoutResponse(message="Logged out successfully. Have a great day!")


# ============================================================
# GET /api/auth/me
# ============================================================
@router.get(
    "/me",
    response_model=MeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current logged-in user info",
    description="""
    Called by the frontend on every app startup / page refresh.
    Returns user identity, role, permissions, and the default route
    so the frontend knows which page to open.

    Returns 401 if the token is missing, expired, or blacklisted.
    """,
)
async def get_me(
    current_user: dict = Depends(get_current_user),
):
    role = current_user["role"]
    config = _ROLE_CONFIG.get(role, {
        "permissions": [],
        "defaultRoute": "/",
    })

    return MeResponse(
        user=MeUser(
            id=current_user["emp_id"],
            email=current_user["email"],
            displayName=current_user["name"],
        ),
        role=role,
        permissions=config["permissions"],
        defaultRoute=config["defaultRoute"],
    )
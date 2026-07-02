"""Authentication Router — register / login / logout"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import timedelta

from app.database import get_local_db
from app.services.registration_service import (
    register_new_user,
    pre_register_employee,
    activate_employee,
    allow_user_email,
    list_allowed_users,
)
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_user, require_role
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
    # role is NOT self-assignable anymore — the backend looks it up from
    # the admin-managed allow-list (csat_allowed_users) instead. Field is
    # kept optional here only for backward compatibility with old clients;
    # whatever is sent is ignored by register_new_user().
    role: Optional[str] = None
    password: str
    confirm_password: str

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


# ── Admin: allow an email + role to self-register ────────────────
class AllowUserRequest(BaseModel):
    email: EmailStr
    role:  str

    @field_validator("role")
    def role_must_be_allowed(cls, v):
        allowed = {"QUALITY", "DELIVERY", "SALES", "CUSTOMER", "MANAGER"}
        if v not in allowed:
            raise ValueError(f"Role '{v}' is not a valid role.")
        return v


class AllowUserResponse(BaseModel):
    message: str
    email: str
    role: str


class AllowedUserItem(BaseModel):
    Email: str
    role: str
    allowed_by: Optional[str] = None
    is_used: bool
    created_at: Optional[str] = None
    used_at: Optional[str] = None


class AllowedUsersListResponse(BaseModel):
    users: list[AllowedUserItem]


# ── Admin pre-registration (invite) ─────────────────────────────
class PreRegisterRequest(BaseModel):
    emp_first_name:  str
    emp_middle_name: Optional[str] = None
    emp_last_name:   str
    email:            EmailStr
    gender:           Optional[str] = "M"
    role:             Optional[str] = "QUALITY"

    @field_validator("role")
    def role_must_be_allowed(cls, v):
        allowed = {"QUALITY", "DELIVERY", "SALES", "CUSTOMER", "MANAGER"}
        if v not in allowed:
            raise ValueError(f"Role '{v}' is not a valid role.")
        return v

    @field_validator("emp_first_name", "emp_last_name")
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name fields cannot be empty")
        return v.strip()

    @field_validator("gender")
    def gender_valid(cls, v):
        if v and v.upper() not in ("M", "F", "OTHER"):
            raise ValueError("Gender must be M, F, or OTHER")
        return (v or "M").upper()


class PreRegisterResponse(BaseModel):
    message: str
    emp_id: str
    name: str
    email: str
    role: str


# ── Employee self-activation ────────────────────────────────────
class ActivateRequest(BaseModel):
    email:             EmailStr
    emp_first_name:    str
    emp_last_name:     str
    password:          str
    confirm_password:  str

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


class ActivateResponse(BaseModel):
    message: str
    emp_id: str
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
# POST /api/auth/register-self
# ============================================================
@router.post(
    "/register-self",
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
# POST /api/auth/allow-user  (Admin: Quality / Manager only)
# ============================================================
# Admin supplies ONLY Email + Role. This is stored in a separate
# allow-list table (csat_allowed_users). The employee then goes to
# the self-registration page and fills in their own details — but
# can only complete registration if their email appears here, and
# will be registered with the role set here (not self-selectable).
@router.post(
    "/allow-user",
    response_model=AllowUserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin: allow an email to self-register with a fixed role",
)
async def allow_user(
    payload: AllowUserRequest,
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    result = allow_user_email(
        email=payload.email,
        role=payload.role,
        allowed_by=current_user["emp_id"],
        local_db=local_db,
    )
    return AllowUserResponse(
        message="Email allowed. They can now self-register with this role.",
        email=result["Email"],
        role=result["role"],
    )


# ============================================================
# GET /api/auth/allowed-users  (Admin: Quality / Manager only)
# ============================================================
@router.get(
    "/allowed-users",
    response_model=AllowedUsersListResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin: list all allow-listed emails and their status",
)
async def get_allowed_users(
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    rows = list_allowed_users(local_db)
    users = [
        AllowedUserItem(
            Email=r["Email"],
            role=r["role"],
            allowed_by=r.get("allowed_by"),
            is_used=bool(r["is_used"]),
            created_at=str(r["created_at"]) if r.get("created_at") else None,
            used_at=str(r["used_at"]) if r.get("used_at") else None,
        )
        for r in rows
    ]
    return AllowedUsersListResponse(users=users)
'''

# ============================================================
# POST /api/auth/pre-register  (Admin / Quality / Manager only)
# ============================================================
# Admin supplies Email + Name only. No password is created here —
# the employee sets their own password via /api/auth/activate.
@router.post(
    "/pre-register",
    response_model=PreRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin: invite a new employee (no password set yet)",
)
async def pre_register(
    payload: PreRegisterRequest,
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    emp_data = {
        "EmpFirstName":  payload.emp_first_name,
        "EmpMiddleName": payload.emp_middle_name,
        "EmpLastName":   payload.emp_last_name,
        "Email":         payload.email,
        "Gender":        payload.gender,
        "role":          payload.role,
    }

    user = pre_register_employee(emp_data=emp_data, local_db=local_db)

    return PreRegisterResponse(
        message="Employee invited! They can now activate their account with this email.",
        emp_id=user["EmpId"],
        name=user["EmpFirstName"],
        email=user["Email"],
        role=user["role"],
    )
'''


# ============================================================
# POST /api/auth/activate  (Public — for invited employees)
# ============================================================
'''@router.post(
    "/activate",
    response_model=ActivateResponse,
    status_code=status.HTTP_200_OK,
    summary="Employee: activate an admin-created account by setting a password",
)
async def activate(
    payload: ActivateRequest,
    local_db: Session = Depends(get_local_db),
):
    user = activate_employee(
        email=payload.email,
        emp_first_name=payload.emp_first_name,
        emp_last_name=payload.emp_last_name,
        password=payload.password,
        local_db=local_db,
    )

    return ActivateResponse(
        message="Account activated! You can now log in.",
        emp_id=user["EmpId"],
        email=user["Email"],
    )
'''

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
        SELECT EmpId, EmpFirstName, EmpLastName, Email, hashed_password, role, is_active, is_registered
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

    # 3. Account was only invited by admin, not yet activated by the employee
    if not row.is_registered:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account hasn't been activated yet. Please complete activation first.",
        )

    # 4. Wrong password
    if not verify_password(payload.password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # 5. Account inactive
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
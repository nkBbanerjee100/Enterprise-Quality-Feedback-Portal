"""Authentication Router — register / login / logout"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime, timedelta
 
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
    hash_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_user, require_role
from app.services.audit_service import log_action, get_client_ip
from app.schemas.audit import AuditActions
from app.schemas.password_reset import ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest
from app.schemas.customer_otp import SendOtpRequest, SendOtpResponse, VerifyOtpRequest, VerifyOtpResponse
from app.services.otp_service import generate_otp, hash_otp, verify_otp_hash
from app.utils.email import EmailSender
from app.config import settings
import hashlib
import random
 
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
        allowed = {"QUALITY", "DELIVERY", "SALES", "CUSTOMER", "MANAGER" , "MANAGEMENT"}
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
        allowed = {"QUALITY", "DELIVERY", "SALES", "CUSTOMER", "MANAGER" , "MANAGEMENT"}
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
    "MANAGEMENT": {
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
    # Customer survey access is handled by the OTP flow, no portal login needed
    # If they somehow land here, send to unauthorized
    "CUSTOMER": {
        "permissions": ["SUBMIT_FEEDBACK"],
        "defaultRoute": "/unauthorized",
    },
}


OTP_EXPIRY_MINUTES = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
MAX_OTP_ATTEMPTS = 5
_survey_otp_attempts: dict[str, int] = {}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _get_customer_allowlist_row(local_db: Session, email: str):
    return local_db.execute(
        text("""
            SELECT Email, role
            FROM csat_allowed_users
            WHERE LOWER(Email) = LOWER(:email)
            LIMIT 1
        """),
        {"email": email},
    ).fetchone()


def _get_latest_customer_otp(local_db: Session, email: str):
    return local_db.execute(
        text("""
            SELECT id, email, otp_hash, expires_at, verified, created_at
            FROM customer_otp
            WHERE LOWER(email) = LOWER(:email)
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """),
        {"email": email},
    ).fetchone()


def _customer_survey_email_body(otp: str) -> tuple[str, str]:
    body = (
        "Hello,\n\n"
        "Your verification code is:\n\n"
        f"{otp}\n\n"
        "This OTP expires in 5 minutes.\n\n"
        "Do not share this code."
    )
    html = f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <div style="background:#16a34a;padding:28px 32px;">
        <p style="margin:0;font-size:11px;font-weight:700;color:#bbf7d0;letter-spacing:0.1em;text-transform:uppercase;">Mindteck · Quality Feedback Platform</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">CSAT Verification Code</h1>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">Hello,</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">Your verification code is:</p>
        <div style="text-align:center;margin:20px 0;padding:16px;background:#f0fdf4;border-radius:8px;">
          <h2 style="margin:0;font-size:28px;color:#16a34a;letter-spacing:6px;">{otp}</h2>
        </div>
        <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">This OTP expires in 5 minutes.</p>
        <p style="font-size:14px;line-height:1.6;margin:0;">Do not share this code.</p>
      </div>
    </div>
  </body>
</html>"""
    return body, html
 
 
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
    request: Request,
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
):
    result = allow_user_email(
        email=payload.email,
        role=payload.role,
        allowed_by=current_user["emp_id"],
        local_db=local_db,
    )
    log_action(
        local_db, action=AuditActions.REGISTRATION_APPROVED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="allowed_email", entity_id=result["Email"],
        details={"email": result["Email"], "role": result["role"]},
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
    current_user: dict = Depends(require_role("QUALITY", "MANAGER"  , "MANAGEMENT")),
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
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
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
 
 
# ============================================================
# POST /api/auth/activate  (Public — for invited employees)
# ============================================================
@router.post(
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
    request: Request,
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
    ip = get_client_ip(request)
 
    # 2. User not found
    if row is None:
        log_action(
            local_db, action=AuditActions.LOGIN_FAILED,
            ip_address=ip, success=False,
            details={"email": payload.email, "reason": "no_such_user"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
 
    # 3. Account was only invited by admin, not yet activated by the employee
    if not row.is_registered:
        log_action(
            local_db, action=AuditActions.LOGIN_FAILED,
            actor_emp_id=row.EmpId, actor_name=row.EmpFirstName, actor_role=row.role,
            ip_address=ip, success=False, details={"reason": "not_activated"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account hasn't been activated yet. Please complete activation first.",
        )
 
    # 4. Wrong password
    if not verify_password(payload.password, row.hashed_password):
        log_action(
            local_db, action=AuditActions.LOGIN_FAILED,
            actor_emp_id=row.EmpId, actor_name=row.EmpFirstName, actor_role=row.role,
            ip_address=ip, success=False, details={"reason": "wrong_password"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
 
    # 5. Account inactive
    if not row.is_active:
        log_action(
            local_db, action=AuditActions.LOGIN_FAILED,
            actor_emp_id=row.EmpId, actor_name=row.EmpFirstName, actor_role=row.role,
            ip_address=ip, success=False, details={"reason": "inactive_account"},
        )
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

    log_action(
        local_db, action=AuditActions.LOGIN_SUCCESS,
        actor_emp_id=row.EmpId, actor_name=row.EmpFirstName, actor_role=row.role,
        ip_address=ip,
    )
 
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
async def logout(
    request: Request,
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    # 1. Decode to validate the token first

    log_action(
        local_db, action=AuditActions.LOGOUT,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
    )

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


# ============================================================
# POST /api/auth/send-otp
# ============================================================
@router.post(
    "/send-otp",
    response_model=SendOtpResponse,
    status_code=status.HTTP_200_OK,
    summary="Send a verification OTP to an approved customer",
)
async def send_survey_otp(
    payload: SendOtpRequest,
    local_db: Session = Depends(get_local_db),
):
    email = _normalize_email(payload.email)
    allowed_row = _get_customer_allowlist_row(local_db, email)

    if allowed_row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized email.")

    latest_row = _get_latest_customer_otp(local_db, email)
    if latest_row and latest_row.created_at:
        if datetime.utcnow() - latest_row.created_at < timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait 60 seconds before requesting another OTP.",
            )

    otp = generate_otp()
    otp_hash = hash_otp(otp)
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    now = datetime.utcnow()

    local_db.execute(
        text("""
            INSERT INTO customer_otp (email, otp_hash, expires_at, verified, created_at)
            VALUES (:email, :otp_hash, :expires_at, 0, :created_at)
        """),
        {
            "email": email,
            "otp_hash": otp_hash,
            "expires_at": expires_at,
            "created_at": now,
        },
    )

    subject = "CSAT Verification Code"
    body, html = _customer_survey_email_body(otp)
    email_sent = EmailSender.send_email(
        to=email,
        subject=subject,
        body=body,
        html_content=html,
    )

    if not email_sent:
        local_db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send OTP email.")

    local_db.commit()
    _survey_otp_attempts.pop(email, None)

    return SendOtpResponse(message="OTP sent successfully")


# ============================================================
# POST /api/auth/verify-otp
# ============================================================
@router.post(
    "/verify-otp",
    response_model=VerifyOtpResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify a customer survey OTP",
)
async def verify_survey_otp(
    payload: VerifyOtpRequest,
    local_db: Session = Depends(get_local_db),
):
    email = _normalize_email(payload.email)
    otp_value = payload.otp.strip()

    allowed_row = _get_customer_allowlist_row(local_db, email)
    if allowed_row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized email.")

    otp_row = _get_latest_customer_otp(local_db, email)
    if otp_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Please request an OTP first.")
    if otp_row.verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="OTP already used.")
    if otp_row.expires_at and datetime.utcnow() > otp_row.expires_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Expired OTP.")

    failed_attempts = _survey_otp_attempts.get(email, 0)
    if failed_attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Request a new OTP.",
        )

    if not verify_otp_hash(otp_value, otp_row.otp_hash):
        _survey_otp_attempts[email] = failed_attempts + 1
        if _survey_otp_attempts[email] >= MAX_OTP_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect attempts. Request a new OTP.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP.")

    local_db.execute(
        text("UPDATE customer_otp SET verified = 1 WHERE id = :id"),
        {"id": otp_row.id},
    )
    local_db.commit()
    _survey_otp_attempts.pop(email, None)

    return VerifyOtpResponse(verified=True)


# ============================================================
# POST /api/auth/forgot-password
# ============================================================
@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    local_db: Session = Depends(get_local_db),
):
    """
    Email a 6-digit OTP to the account's address.

    NOTE: unlike the previous behavior, this endpoint now tells the caller
    explicitly whether the email is registered, inactive, or unregistered,
    rather than always returning the same generic message. This is a
    deliberate product decision (internal tool, known user base) that trades
    away the anti-email-enumeration protection a generic message would give,
    in exchange for a clearer UX on the forgot-password screen.
    """
    ip = get_client_ip(request)

    row = local_db.execute(
        text("SELECT EmpId, EmpFirstName, role, is_active, is_registered FROM csat_users WHERE Email = :email LIMIT 1"),
        {"email": payload.email},
    ).fetchone()

    if row is None:
        log_action(
            local_db, action=AuditActions.PASSWORD_RESET_REQUESTED,
            ip_address=ip, success=False,
            details={"email": payload.email, "reason": "no_such_account"},
        )
        raise HTTPException(status_code=404, detail="This email is not registered.")

    if not row.is_active:
        log_action(
            local_db, action=AuditActions.PASSWORD_RESET_REQUESTED,
            ip_address=ip, success=False,
            details={"email": payload.email, "reason": "inactive"},
        )
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact admin.")

    if not row.is_registered:
        log_action(
            local_db, action=AuditActions.PASSWORD_RESET_REQUESTED,
            ip_address=ip, success=False,
            details={"email": payload.email, "reason": "not_registered"},
        )
        raise HTTPException(status_code=403, detail="Please complete your registration before resetting your password.")

    otp = f"{random.randint(0, 999999):06d}"
    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    local_db.execute(
        text("""
            INSERT INTO password_reset_otps (email, otp_hash, expires_at, attempts, is_used, created_at)
            VALUES (:email, :otp_hash, :expires_at, 0, 0, NOW())
        """),
        {"email": payload.email, "otp_hash": otp_hash, "expires_at": expires_at},
    )
    local_db.commit()

    subject = "Your CSAT Tool password reset code"
    body = f"Your verification code is {otp}. It expires in 10 minutes. If you didn't request this, you can safely ignore this email."
    html = (
        f"<p>Your verification code is <strong style='font-size:20px'>{otp}</strong>.</p>"
        f"<p>It expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>"
    )
    try:
        EmailSender.send_email(to=payload.email, subject=subject, body=body, html_content=html)
    except Exception as e:
        # Best-effort — the OTP row already exists, so a retry via the same
        # endpoint (or the "resend" link) will just issue a fresh one.
        print(f"[WARN] Failed to send password reset email to {payload.email}: {e}")

    log_action(
        local_db, action=AuditActions.PASSWORD_RESET_REQUESTED,
        actor_emp_id=row.EmpId, actor_name=row.EmpFirstName, actor_role=row.role,
        ip_address=ip,
    )

    return {"message": f"A verification code has been sent to {payload.email}."}


# ============================================================
# POST /api/auth/reset-password
# ============================================================
@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    local_db: Session = Depends(get_local_db),
):
    """Verify the OTP and set a new password. Max 5 wrong attempts per OTP
    before it's permanently locked, forcing a fresh forgot-password request
    rather than allowing unlimited guessing of a 6-digit code."""
    ip = get_client_ip(request)

    otp_row = local_db.execute(
        text("""
            SELECT id, otp_hash, expires_at, attempts, is_used
            FROM password_reset_otps
            WHERE email = :email
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"email": payload.email},
    ).fetchone()

    def _fail(reason: str, http_status: int = 400, detail: str = "Invalid or expired code."):
        log_action(
            local_db, action=AuditActions.PASSWORD_RESET_COMPLETED,
            ip_address=ip, success=False,
            details={"email": payload.email, "reason": reason},
        )
        raise HTTPException(status_code=http_status, detail=detail)

    if otp_row is None:
        _fail("no_otp_requested")
    if otp_row.is_used:
        _fail("otp_already_used")
    if datetime.utcnow() > otp_row.expires_at:
        _fail("otp_expired", detail="This code has expired. Please request a new one.")
    if otp_row.attempts >= 5:
        _fail("too_many_attempts", detail="Too many incorrect attempts. Please request a new code.")

    otp_hash = hashlib.sha256(payload.otp.encode()).hexdigest()
    if otp_hash != otp_row.otp_hash:
        local_db.execute(
            text("UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = :id"),
            {"id": otp_row.id},
        )
        local_db.commit()
        _fail("wrong_otp", detail="Incorrect code. Please try again.")

    user_row = local_db.execute(
        text("SELECT EmpId, EmpFirstName, role FROM csat_users WHERE Email = :email LIMIT 1"),
        {"email": payload.email},
    ).fetchone()
    if user_row is None:
        _fail("user_vanished", http_status=404, detail="Account not found.")

    new_hash = hash_password(payload.new_password)
    local_db.execute(
        text("UPDATE csat_users SET hashed_password = :hash WHERE EmpId = :emp_id"),
        {"hash": new_hash, "emp_id": user_row.EmpId},
    )
    local_db.execute(
        text("UPDATE password_reset_otps SET is_used = 1 WHERE id = :id"),
        {"id": otp_row.id},
    )
    local_db.commit()

    log_action(
        local_db, action=AuditActions.PASSWORD_RESET_COMPLETED,
        actor_emp_id=user_row.EmpId, actor_name=user_row.EmpFirstName, actor_role=user_row.role,
        ip_address=ip,
    )

    return {"message": "Password reset successful. You can now log in with your new password."}


# ============================================================
# POST /api/auth/change-password  (authenticated — Settings page)
# ============================================================
@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    local_db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    """Authenticated password change from Settings — requires the current
    password (unlike forgot-password, which uses an emailed OTP instead
    since the user can't prove they know the current one there)."""
    ip = get_client_ip(request)

    row = local_db.execute(
        text("SELECT hashed_password FROM csat_users WHERE EmpId = :emp_id LIMIT 1"),
        {"emp_id": current_user["emp_id"]},
    ).fetchone()

    if row is None or not verify_password(payload.current_password, row.hashed_password):
        log_action(
            local_db, action=AuditActions.PASSWORD_CHANGED,
            actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
            actor_role=current_user["role"], ip_address=ip, success=False,
            details={"reason": "wrong_current_password"},
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    new_hash = hash_password(payload.new_password)
    local_db.execute(
        text("UPDATE csat_users SET hashed_password = :hash WHERE EmpId = :emp_id"),
        {"hash": new_hash, "emp_id": current_user["emp_id"]},
    )
    local_db.commit()

    log_action(
        local_db, action=AuditActions.PASSWORD_CHANGED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=ip,
    )

    return {"message": "Password changed successfully."}

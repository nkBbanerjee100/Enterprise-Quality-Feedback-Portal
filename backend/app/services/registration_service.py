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
import secrets
import re
 
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
 
# ============================================================
# EMAIL ALLOW-LIST  (Admin pre-approval, table: csat_allowed_users)
# ============================================================
# Flow:
#   1. Admin (QUALITY / MANAGER) picks an Email + Role and adds it here —
#      NO name, NO password. This is a pure allow-list gate.
#   2. The employee then goes to the self-registration page and fills in
#      their own EmpId / name / gender / password. The role they can
#      register with is NOT taken from what they type — it's forced to
#      whatever the admin set here.
#   3. Any email not present in this table is rejected at registration.
#   4. Once used to complete a registration, the entry is marked
#      is_used = 1 so it can't be reused for a second registration.
# ============================================================

def allow_user_email(email: str, role: str, allowed_by: str, local_db: Session) -> dict:
    """Admin-only: whitelist an email + role so that person can self-register."""
    existing = local_db.execute(
        text("SELECT Email, is_used FROM csat_allowed_users WHERE Email = :email LIMIT 1"),
        {"email": email},
    ).fetchone()

    if existing is not None:
        if existing.is_used:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email has already completed registration.",
            )
        # Already allowed — update the role instead of erroring, in case admin changed their mind
        local_db.execute(
            text("UPDATE csat_allowed_users SET role = :role, allowed_by = :allowed_by WHERE Email = :email"),
            {"role": role, "allowed_by": allowed_by, "email": email},
        )
        local_db.commit()
        return {"Email": email, "role": role, "updated": True}

    local_db.execute(
        text("""
            INSERT INTO csat_allowed_users (Email, role, allowed_by, is_used)
            VALUES (:email, :role, :allowed_by, 0)
        """),
        {"email": email, "role": role, "allowed_by": allowed_by},
    )
    local_db.commit()
    return {"Email": email, "role": role, "updated": False}


def get_allowed_role_for_email(email: str, local_db: Session):
    """Returns the pre-approved role for an email, or None if not allowed / already used."""
    row = local_db.execute(
        text("SELECT role, is_used FROM csat_allowed_users WHERE Email = :email LIMIT 1"),
        {"email": email},
    ).fetchone()
    if row is None or row.is_used:
        return None
    return row.role


def mark_email_used(email: str, local_db: Session) -> None:
    local_db.execute(
        text("UPDATE csat_allowed_users SET is_used = 1, used_at = :now WHERE Email = :email"),
        {"now": datetime.utcnow(), "email": email},
    )
    local_db.commit()


def list_allowed_users(local_db: Session) -> list:
    rows = local_db.execute(
        text("""
            SELECT Email, role, allowed_by, is_used, created_at, used_at
            FROM csat_allowed_users
            ORDER BY created_at DESC
        """)
    ).fetchall()
    return [dict(r._mapping) for r in rows]


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
# ADMIN PRE-REGISTRATION
# ============================================================
# Flow:
#   1. Admin (QUALITY / MANAGER) supplies Email, First/Middle/Last name
#      (+ optional Gender / role) — NO password.
#   2. A row is created in csat_users with is_registered = 0 and an
#      unusable placeholder password hash (nobody knows the plaintext,
#      so the account cannot be logged into until it is activated).
#   3. EmpId is auto-generated from the email, since it's the table's
#      primary key and the admin doesn't supply it.
#   4. The employee later "activates" the account (see activate_employee
#      below) by proving their identity (email + first/last name) and
#      choosing their own password.
# ============================================================

def _generate_emp_id(email: str, local_db: Session) -> str:
    """Derive a unique EmpId from the email's local part, e.g.
    'sanjukta.mandal@mindteck.com' -> 'SANJUKTA.MANDAL' (deduped if needed)."""
    base = re.sub(r"[^A-Za-z0-9]", "", email.split("@")[0]).upper() or "EMP"
    candidate = base
    suffix = 0
    while True:
        exists = local_db.execute(
            text("SELECT 1 FROM csat_users WHERE EmpId = :emp_id LIMIT 1"),
            {"emp_id": candidate},
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}{suffix}"


def pre_register_employee(
    emp_data: dict,
    local_db: Session,
) -> dict:
    """
    Admin-only: create a placeholder account for an employee.
    emp_data keys: EmpFirstName, EmpMiddleName, EmpLastName, Gender, Email, role
    No password is set here — the employee sets it during activation.
    """
    # Already registered / already invited?
    existing = local_db.execute(
        text("SELECT EmpId, is_registered FROM csat_users WHERE Email = :email LIMIT 1"),
        {"email": emp_data["Email"]},
    ).fetchone()
    if existing is not None:
        if existing.is_registered:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already registered. Ask them to log in instead.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email has already been invited. Ask them to activate their account.",
        )

    emp_id = _generate_emp_id(emp_data["Email"], local_db)

    # Unusable placeholder hash — no plaintext produces it, so the
    # account can't be logged into until activate_employee() runs.
    placeholder_hash = pwd_context.hash(secrets.token_urlsafe(32))

    query = text("""
        INSERT INTO csat_users (
            EmpId, EmpFirstName, EmpMiddleName, EmpLastName,
            Gender, Email, hashed_password, role,
            is_active, is_registered
        ) VALUES (
            :EmpId, :EmpFirstName, :EmpMiddleName, :EmpLastName,
            :Gender, :Email, :hashed_password, :role,
            1, 0
        )
    """)
    local_db.execute(query, {
        "EmpId":          emp_id,
        "EmpFirstName":   emp_data["EmpFirstName"],
        "EmpMiddleName":  emp_data.get("EmpMiddleName") or "",
        "EmpLastName":    emp_data["EmpLastName"],
        "Gender":         emp_data.get("Gender") or "M",
        "Email":          emp_data["Email"],
        "hashed_password": placeholder_hash,
        "role":           emp_data.get("role") or "QUALITY",
    })
    local_db.commit()

    return {
        "EmpId":        emp_id,
        "EmpFirstName": emp_data["EmpFirstName"],
        "EmpLastName":  emp_data["EmpLastName"],
        "Email":        emp_data["Email"],
        "role":         emp_data.get("role") or "QUALITY",
    }


# ============================================================
# EMPLOYEE ACTIVATION
# ============================================================
def activate_employee(
    email: str,
    emp_first_name: str,
    emp_last_name: str,
    password: str,
    local_db: Session,
) -> dict:
    """
    Employee completes their invited account:
    verifies identity against what the admin entered, then sets a password.
    """
    row = local_db.execute(
        text("""
            SELECT EmpId, EmpFirstName, EmpLastName, Email, is_registered
            FROM csat_users WHERE Email = :email LIMIT 1
        """),
        {"email": email},
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No invitation found for this email. Contact your admin.",
        )

    if row.is_registered:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already activated. Please log in instead.",
        )

    # Identity check — must match what the admin entered (case-insensitive)
    if (row.EmpFirstName or "").strip().lower() != emp_first_name.strip().lower() or \
       (row.EmpLastName or "").strip().lower() != emp_last_name.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name doesn't match our records for this email. Contact your admin.",
        )

    hashed_password = pwd_context.hash(password)

    local_db.execute(
        text("""
            UPDATE csat_users
            SET hashed_password = :hashed_password, is_registered = 1
            WHERE Email = :email
        """),
        {"hashed_password": hashed_password, "email": email},
    )
    local_db.commit()

    return {
        "EmpId":        row.EmpId,
        "EmpFirstName": row.EmpFirstName,
        "Email":        row.Email,
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
    allow-list check (email must be pre-approved by an admin) →
    local duplicate check → local register → mark allow-list entry used
    """

    # Gate: this email must have been pre-approved by Quality/Manager
    # via the "Allow User" page. The role is taken from the allow-list,
    # NOT from whatever the person typed in the form — this is what
    # stops an unauthorized person from self-assigning MANAGER, etc.
    allowed_role = get_allowed_role_for_email(emp_data["Email"], local_db)
    if allowed_role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This email is not authorized to register. Ask your Quality/Management team to allow it first.",
        )
    emp_data["role"] = allowed_role

    # Already registered?
    if is_already_registered(emp_data["EmpId"], local_db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Employee ID is already registered. Please login instead."
        )

    # Register locally
    user = register_user_locally(emp_data, password, local_db)

    # Consume the allow-list entry so it can't be reused
    mark_email_used(emp_data["Email"], local_db)

    user["role"] = allowed_role
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
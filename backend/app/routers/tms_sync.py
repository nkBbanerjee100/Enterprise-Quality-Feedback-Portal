"""TMS (Talent/Project Management System) Integration Routes
=============================================================
Reads project data directly from the TMS database (tsms_projects),
which lives on a separate read-only MySQL server.
 
All queries here are SELECT only — this app never writes to TMS.
 
Table: tsms_projects
Fields used:
  Id, OcnId, Name, StartDate, EndDate, PmId, DMId,
  AdditionalPmId, AdditionalDMId, LocId, SubLocId,
  IsInternalProject, IsCustomerApprovalRequired,
  CreditTerms, TSATValue, RiskRYG, IsProjectActive
 
Endpoints:
  GET  /api/tms/status              -> health check of TMS connection
  GET  /api/tms/projects            -> all projects (paginated + search + filter)
  GET  /api/tms/projects/completed  -> only completed / feedback-eligible projects
  GET  /api/tms/projects/{id}       -> single project detail
  POST /api/tms/projects/sync       -> connectivity check (no local copy needed)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional
from datetime import datetime, date, timezone

from app.database import get_tms_db
 
router = APIRouter()
 
 
# Columns mapped to friendly snake_case names
PROJECT_COLUMNS = """
    Id                         AS project_id,
    OcnId                      AS customer_id,
    Name                       AS project_name,
    StartDate                  AS start_date,
    EndDate                    AS end_date,
    PmId                       AS project_manager_id,
    DMId                       AS delivery_manager_id,
    AdditionalPmId             AS additional_pm_id,
    AdditionalDMId             AS additional_dm_id,
    LocId                      AS location_id,
    SubLocId                   AS sub_location_id,
    IsInternalProject          AS is_internal,
    IsCustomerApprovalRequired AS is_customer_approval_required,
    CreditTerms                AS credit_terms,
    TSATValue                  AS tsat_value,
    RiskRYG                    AS risk_status,
    IsProjectActive            AS is_active
"""
 
 
def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy row to a JSON-safe dict."""
    d = dict(row._mapping)
    # bit(1) fields come back as bytes b'\x01' / b'\x00' — convert to bool
    for key in ("is_active", "is_internal", "is_customer_approval_required"):
        if key in d and isinstance(d[key], (bytes, bytearray)):
            d[key] = bool(d[key][0])
    # datetime → ISO string
    for key in ("start_date", "end_date"):
        if key in d and isinstance(d[key], datetime):
            d[key] = d[key].isoformat()
    return d
 

def _row_with_pm(row) -> dict:
    """Same as _row_to_dict, plus the resolved PM name/emp_id/email columns
    that queries joining tsms_user (aliased `pm`) add on top of PROJECT_COLUMNS.
    Shared by every endpoint below that needs a project's PM contact info —
    e.g. the Send Feedback form, which needs project_manager_email to
    pre-fill the recipient."""
    d = _row_to_dict(row)
    d["project_manager_name"] = (row.project_manager_name or "").strip() or None
    d["project_manager_emp_id"] = row.project_manager_emp_id
    d["project_manager_email"] = row.project_manager_email
    return d

 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/status
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/status")
def get_tms_status(tms_db: Session = Depends(get_tms_db)):
    """Check whether the TMS database connection is healthy."""
    try:
        tms_db.execute(text("SELECT 1"))
        return {
            "status": "connected",
            "database": "tmstestdb1",
            "mode": "read-only",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except SQLAlchemyError as e:
        return {
            "status": "disconnected",
            "database": "tmstestdb1",
            "mode": "read-only",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "error": str(e),
        }
 
 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/projects
# All projects — paginated, searchable, filterable by active status
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/projects")
def list_tms_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = Query(None, description="Search by project name"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    pm: Optional[str] = Query(None, description="Filter by project manager emp_id"),
    year: Optional[int] = Query(None, description="Filter by project start year"),
    tms_db: Session = Depends(get_tms_db),
):
    """
    Returns projects from TMS (tsms_projects), paginated. Bit fields
    (IsProjectActive etc.) are normalised to boolean.

    Also resolves and returns project_manager_name/project_manager_emp_id
    (same PmId -> EmpId/FinanceId/UserId match used across the rest of the
    TMS integration) — needed so callers like the "Add Projects" modal on
    CsatCycleDetailPage can filter/display by manager, same as the
    pre-cycle Select Projects page already does.
    """
    conditions = []
    params: dict = {"skip": skip, "limit": limit}
 
    if search:
        conditions.append("p.Name LIKE :search")
        params["search"] = f"%{search}%"
 
    if is_active is not None:
        conditions.append("p.IsProjectActive = :is_active")
        params["is_active"] = 1 if is_active else 0

    if pm:
        conditions.append("pm.EmpId = :pm")
        params["pm"] = pm

    if year:
        # Range comparison, not YEAR(p.StartDate) = :year — a function call
        # on the column would prevent any index on StartDate from being used.
        conditions.append("p.StartDate >= :year_start AND p.StartDate < :year_end")
        params["year_start"] = date(year, 1, 1)
        params["year_end"] = date(year + 1, 1, 1)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # PROJECT_COLUMNS' bare column names (no table prefix) still work
    # unambiguously here since none of them collide with tsms_user's columns.
    list_sql = text(f"""
        SELECT {PROJECT_COLUMNS},
               pm.EmpId AS project_manager_emp_id,
               CONCAT_WS(' ', pm.EmpFirstName, pm.EmpLastName) AS project_manager_name,
               pm.Email AS project_manager_email
        FROM tsms_projects p
        LEFT JOIN tsms_user pm
            ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
        {where}
        ORDER BY p.EndDate DESC
        LIMIT :limit OFFSET :skip
    """)
    count_sql = text(f"""
        SELECT COUNT(*) AS total
        FROM tsms_projects p
        LEFT JOIN tsms_user pm
            ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
        {where}
    """)

    try:
        rows  = tms_db.execute(list_sql,  params).fetchall()
        total = tms_db.execute(count_sql, params).fetchone().total
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not query the TMS database: {exc}",
        )

    return {
        "total":    total,
        "skip":     skip,
        "limit":    limit,
        "projects": [_row_with_pm(r) for r in rows],
    }
 
 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/projects/completed
# Only feedback-eligible projects: IsProjectActive=0 AND EndDate IS NOT NULL
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/projects/completed")
def get_completed_projects(
    search: Optional[str] = Query(None),
    skip: int  = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=500),
    pm: Optional[str] = Query(None, description="Filter by project manager emp_id"),
    year: Optional[int] = Query(None, description="Filter by the year the project ended"),
    tms_db: Session = Depends(get_tms_db),
):
    """Paginated list of completed projects from TMS (tsms_projects).
    Returns completed projects from TMS — the ones Quality users
    can send feedback forms for.
    A project is 'completed' when IsProjectActive=0 AND EndDate IS NOT NULL.

    Also resolves project_manager_name/project_manager_emp_id/project_manager_email
    (same PmId -> EmpId/FinanceId/UserId join used by /projects) — the Send
    Feedback form pre-fills its recipient from the project's PM, so this
    endpoint needs the same PM contact info /projects already returns.

    pm/year filter the same way /projects does, except year here filters by
    EndDate (when the project was completed) rather than StartDate — that's
    the meaningful axis for a list that's already scoped to completed work.
    """
    today = datetime.now(timezone.utc).date()
    conditions = ["p.EndDate IS NOT NULL", "p.EndDate < :today"]
    params: dict = {"skip": skip, "limit": limit, "today": today}
 
    if search:
        conditions.append("p.Name LIKE :search")
        params["search"] = f"%{search}%"
 
    if pm:
        conditions.append("pm.EmpId = :pm")
        params["pm"] = pm

    if year:
        conditions.append("p.EndDate >= :year_start AND p.EndDate < :year_end")
        params["year_start"] = date(year, 1, 1)
        params["year_end"] = date(year + 1, 1, 1)

    where = "WHERE " + " AND ".join(conditions)
 
    list_sql = text(f"""
        SELECT {PROJECT_COLUMNS},
               pm.EmpId AS project_manager_emp_id,
               CONCAT_WS(' ', pm.EmpFirstName, pm.EmpLastName) AS project_manager_name,
               pm.Email AS project_manager_email
        FROM tsms_projects p
        LEFT JOIN tsms_user pm
            ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
        {where}
        ORDER BY p.EndDate DESC
        LIMIT :limit OFFSET :skip
    """)
    count_sql = text(f"""
        SELECT COUNT(*) AS total
        FROM tsms_projects p
        LEFT JOIN tsms_user pm
            ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
        {where}
    """)
 
    try:
        rows  = tms_db.execute(list_sql,  params).fetchall()
        total = tms_db.execute(count_sql, params).fetchone().total
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not query the TMS database: {exc}",
        )
 
    return {
        "total":    total,
        "skip":     skip,
        "limit":    limit,
        "projects": [_row_with_pm(r) for r in rows],
    }
 
 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/projects/{project_id}
# Single project detail by TMS Id
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}")
def get_project_by_id(
    project_id: int,
    tms_db: Session = Depends(get_tms_db),
):
    """Returns a single project from TMS by its Id, including resolved PM
    name/emp_id/email (needed so the Send Feedback form can pre-fill the
    recipient from the project's PM when a project arrives preselected,
    e.g. via the Reports "Send Feedback" shortcut)."""
    sql = text(f"""
        SELECT {PROJECT_COLUMNS},
               pm.EmpId AS project_manager_emp_id,
               CONCAT_WS(' ', pm.EmpFirstName, pm.EmpLastName) AS project_manager_name,
               pm.Email AS project_manager_email
        FROM tsms_projects p
        LEFT JOIN tsms_user pm
            ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
        WHERE p.Id = :project_id
        LIMIT 1
    """)
 
    try:
        row = tms_db.execute(sql, {"project_id": project_id}).fetchone()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not query the TMS database: {exc}",
        )
 
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found in TMS.",
        )
 
    return _row_with_pm(row)
 
 
# ──────────────────────────────────────────────────────────────────────────────
# POST /api/tms/projects/sync
# Connectivity check — no local copy needed since we read TMS directly
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/projects/sync", status_code=status.HTTP_200_OK)
def sync_tms_projects(tms_db: Session = Depends(get_tms_db)):
    """
    Confirms TMS connectivity and returns a live project count snapshot.
    No data is copied locally — we read tsms_projects directly.
    """
    try:
        total = tms_db.execute(
            text("SELECT COUNT(*) AS total FROM tsms_projects")
        ).fetchone().total
 
        completed = tms_db.execute(
            text(
                "SELECT COUNT(*) AS total FROM tsms_projects "
                "WHERE IsProjectActive = 0 AND EndDate IS NOT NULL"
            )
        ).fetchone().total
 
        return {
            "status":              "ok",
            "message":             "TMS is live — read directly from tsms_projects.",
            "synced_at":           datetime.now(timezone.utc).isoformat(),
            "total_projects":      total,
            "completed_projects":  completed,
        }
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach the TMS database: {exc}",
        )
 
 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/employees/{emp_id}
# Look up any Mindteck employee directly from tsms_user by EmpId.
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/employees/{emp_id}")
def get_employee_by_id(
    emp_id: str,
    tms_db: Session = Depends(get_tms_db),
):
    """Returns full employee profile from tsms_user for the given EmpId."""
    sql = text("""
        SELECT
            EmpId,
            EmpFirstName,
            EmpMiddleName,
            EmpLastName,
            Email,
            Gender,
            IsActive,
            DOJ,
            level,
            grade,
            ReportingMgrId,
            ReportingMgrName,
            DeliveryMgrId,
            DeliveryMgrName
        FROM tsms_user
        WHERE EmpId = :emp_id OR FinanceId = :emp_id OR UserId = :emp_id
        LIMIT 1
    """)
 
    try:
        row = tms_db.execute(sql, {"emp_id": emp_id}).fetchone()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not query the TMS database: {exc}",
        )
 
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {emp_id} not found in TMS.",
        )
 
    name_parts = [row.EmpFirstName or "", row.EmpMiddleName or "", row.EmpLastName or ""]
    full_name  = " ".join(p for p in name_parts if p).strip()
 
    is_active = row.IsActive
    if isinstance(is_active, (bytes, bytearray)):
        is_active = bool(is_active[0])
 
    return {
        "emp_id":              row.EmpId,
        "full_name":           full_name,
        "email":               row.Email,
        "gender":              row.Gender,
        "is_active":           is_active,
        "doj":                 row.DOJ.isoformat() if row.DOJ else None,
        "level":               row.level,
        "grade":               row.grade,
        "reporting_mgr_id":    row.ReportingMgrId,
        "reporting_mgr_name":  row.ReportingMgrName,
        "delivery_mgr_id":     row.DeliveryMgrId,
        "delivery_mgr_name":   row.DeliveryMgrName,
    }
 
 
# ──────────────────────────────────────────────────────────────────────────────
# GET /api/tms/projects/{project_id}/people
# Returns PM, DM, Add.PM, Add.DM for a project in a single JOIN query.
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/people")
def get_project_people(
    project_id: int,
    tms_db: Session = Depends(get_tms_db),
):
    """
    LEFT JOINs tsms_user four times (PM, DM, Add.PM, Add.DM).
    Returns full profile for each — name, email, gender, level, grade, DOJ.
    Any unassigned role returns null.
    """
    sql = text("""
        SELECT
            pm.EmpId            AS pm_id,
            pm.EmpFirstName     AS pm_first,
            pm.EmpMiddleName    AS pm_middle,
            pm.EmpLastName      AS pm_last,
            pm.Email            AS pm_email,
            pm.Gender           AS pm_gender,
            pm.IsActive         AS pm_active,
            pm.DOJ              AS pm_doj,
            pm.level            AS pm_level,
            pm.grade            AS pm_grade,
            pm.ReportingMgrName AS pm_reporting_mgr,
            pm.DeliveryMgrName  AS pm_delivery_mgr,
 
            dm.EmpId            AS dm_id,
            dm.EmpFirstName     AS dm_first,
            dm.EmpMiddleName    AS dm_middle,
            dm.EmpLastName      AS dm_last,
            dm.Email            AS dm_email,
            dm.Gender           AS dm_gender,
            dm.IsActive         AS dm_active,
            dm.DOJ              AS dm_doj,
            dm.level            AS dm_level,
            dm.grade            AS dm_grade,
            dm.ReportingMgrName AS dm_reporting_mgr,
            dm.DeliveryMgrName  AS dm_delivery_mgr,
 
            apm.EmpId            AS apm_id,
            apm.EmpFirstName     AS apm_first,
            apm.EmpMiddleName    AS apm_middle,
            apm.EmpLastName      AS apm_last,
            apm.Email            AS apm_email,
            apm.Gender           AS apm_gender,
            apm.IsActive         AS apm_active,
            apm.DOJ              AS apm_doj,
            apm.level            AS apm_level,
            apm.grade            AS apm_grade,
            apm.ReportingMgrName AS apm_reporting_mgr,
            apm.DeliveryMgrName  AS apm_delivery_mgr,
 
            adm.EmpId            AS adm_id,
            adm.EmpFirstName     AS adm_first,
            adm.EmpMiddleName    AS adm_middle,
            adm.EmpLastName      AS adm_last,
            adm.Email            AS adm_email,
            adm.Gender           AS adm_gender,
            adm.IsActive         AS adm_active,
            adm.DOJ              AS adm_doj,
            adm.level            AS adm_level,
            adm.grade            AS adm_grade,
            adm.ReportingMgrName AS adm_reporting_mgr,
            adm.DeliveryMgrName  AS adm_delivery_mgr
 
        FROM tsms_projects p
        LEFT JOIN tsms_user pm  ON p.PmId          = pm.EmpId OR p.PmId          = pm.FinanceId OR p.PmId          = pm.UserId
        LEFT JOIN tsms_user dm  ON p.DMId           = dm.EmpId OR p.DMId           = dm.FinanceId OR p.DMId           = dm.UserId
        LEFT JOIN tsms_user apm ON p.AdditionalPmId = apm.EmpId OR p.AdditionalPmId = apm.FinanceId OR p.AdditionalPmId = apm.UserId
        LEFT JOIN tsms_user adm ON p.AdditionalDMId = adm.EmpId OR p.AdditionalDMId = adm.FinanceId OR p.AdditionalDMId = adm.UserId
        WHERE p.Id = :project_id
        LIMIT 1
    """)
 
    try:
        row = tms_db.execute(sql, {"project_id": project_id}).fetchone()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not query the TMS database: {exc}",
        )
 
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found in TMS.",
        )
 
    def _bit(val):
        if isinstance(val, (bytes, bytearray)):
            return bool(val[0])
        return bool(val) if val is not None else None
 
    def _person(prefix, r):
        id_val = getattr(r, f"{prefix}_id")
        if not id_val:
            return None
        parts = [getattr(r, f"{prefix}_first") or "",
                 getattr(r, f"{prefix}_middle") or "",
                 getattr(r, f"{prefix}_last") or ""]
        doj = getattr(r, f"{prefix}_doj")
        return {
            "emp_id":           id_val,
            "full_name":        " ".join(p for p in parts if p).strip(),
            "email":            getattr(r, f"{prefix}_email"),
            "gender":           getattr(r, f"{prefix}_gender"),
            "is_active":        _bit(getattr(r, f"{prefix}_active")),
            "doj":              doj.isoformat() if doj else None,
            "level":            getattr(r, f"{prefix}_level"),
            "grade":            getattr(r, f"{prefix}_grade"),
            "reporting_mgr":    getattr(r, f"{prefix}_reporting_mgr"),
            "delivery_mgr":     getattr(r, f"{prefix}_delivery_mgr"),
        }
 
    return {
        "project_manager":  _person("pm",  row),
        "delivery_manager": _person("dm",  row),
        "additional_pm":    _person("apm", row),
        "additional_dm":    _person("adm", row),
    }
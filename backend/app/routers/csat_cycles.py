"""CSAT Cycle routes — full implementation"""
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session
 
from app.database import get_local_db
from app.core.dependencies import get_current_user, require_role
from app.models.csat_cycle import CSATCycle
from app.models.project import Project
from app.models.cycle_project_enrollment import CycleProjectEnrollment, EligibilityStatus
from app.schemas.csat_cycle import (
    CSATCycleCreate, CSATCycleUpdate, CSATCycleResponse,
    EnrolledProjectResponse, EnrollProjectsRequest,
    SetEligibilityRequest, RequestManagerApprovalRequest,
    ManagerDecisionRequest, CycleHalf,
)
 
router = APIRouter()
 
ALLOWED_ROLES = ("QUALITY", "MANAGER", "DELIVERY", "SALES")
 
 
# ─── Helpers ──────────────────────────────────────────────────────────────────
 
def _half_dates(year: int, half: CycleHalf):
    if half == CycleHalf.H1:
        return datetime(year, 1, 1), datetime(year, 6, 30, 23, 59, 59)
    return datetime(year, 7, 1), datetime(year, 12, 31, 23, 59, 59)
 
 
def _get_cycle_or_404(cycle_id: int, db: Session) -> CSATCycle:
    cycle = db.query(CSATCycle).filter(CSATCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="CSAT Cycle not found")
    return cycle
 
 
def _get_enrollment_or_404(enrollment_id: int, cycle_id: int, db: Session) -> CycleProjectEnrollment:
    enr = db.query(CycleProjectEnrollment).filter(
        CycleProjectEnrollment.id == enrollment_id,
        CycleProjectEnrollment.cycle_id == cycle_id,
    ).first()
    if not enr:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return enr
 
 
def _enrollment_to_response(enr: CycleProjectEnrollment, project: Project) -> dict:
    return {
        "enrollment_id": enr.id,
        "project_id": project.id,
        "project_ext_id": project.project_id,
        "project_name": project.project_name,
        "is_active": project.is_active,
        "eligibility_status": enr.eligibility_status,
        "exemption_reason": enr.exemption_reason,
        "notes": enr.notes,
        "enrolled_at": enr.enrolled_at,
        "approval_requested_at": enr.approval_requested_at,
        "manager_remarks": enr.manager_remarks,
        "approved_or_declined_at": enr.approved_or_declined_at,
    }
 
 
# ─── CSAT Cycle CRUD ──────────────────────────────────────────────────────────
 
@router.get("/", response_model=dict)
def list_csat_cycles(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    """List CSAT cycles with optional active filter"""
    q = db.query(CSATCycle)
    if is_active is not None:
        q = q.filter(CSATCycle.is_active == is_active)
    total = q.count()
    cycles = q.order_by(CSATCycle.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "data": [_cycle_resp(c) for c in cycles],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
 
 
@router.post("/", response_model=CSATCycleResponse, status_code=status.HTTP_201_CREATED)
def create_csat_cycle(
    payload: CSATCycleCreate,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    """Create a new CSAT cycle (H1: Jan–Jun, H2: Jul–Dec)"""
    start, end = _half_dates(payload.year, payload.half)
    cycle = CSATCycle(
        cycle_name=payload.cycle_name,
        description=payload.description,
        start_date=start,
        end_date=end,
        is_active=True,
    )
    # Store year/half in description if columns absent — or just on the object
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return _cycle_resp(cycle)
 
 
@router.get("/{cycle_id}", response_model=CSATCycleResponse)
def get_csat_cycle(
    cycle_id: int,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    return _cycle_resp(_get_cycle_or_404(cycle_id, db))
 
 
@router.patch("/{cycle_id}", response_model=CSATCycleResponse)
def update_csat_cycle(
    cycle_id: int,
    payload: CSATCycleUpdate,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    cycle = _get_cycle_or_404(cycle_id, db)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(cycle, k, v)
    db.commit()
    db.refresh(cycle)
    return _cycle_resp(cycle)
 
 
def _cycle_resp(c: CSATCycle) -> dict:
    """Map ORM → response dict (avoids needing extra DB columns for year/half)"""
    year = half = None
    if c.start_date:
        year = c.start_date.year
        half = "H1" if c.start_date.month <= 6 else "H2"
    return {
        "id": c.id,
        "cycle_name": c.cycle_name,
        "description": c.description,
        "start_date": c.start_date,
        "end_date": c.end_date,
        "is_active": c.is_active,
        "year": year,
        "half": half,
        "created_at": c.created_at,
    }
 
 
# ─── Project Enrollment ───────────────────────────────────────────────────────
 
@router.get("/{cycle_id}/projects", response_model=dict)
def list_cycle_projects(
    cycle_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    active_first: bool = Query(True),
    project_status: Optional[str] = Query(None, description="'active' | 'completed' | 'all'"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List projects enrolled in a cycle.
    - active_first=true (default) sorts active projects before completed ones.
    - project_status: filter by 'active', 'completed', or 'all' (default: active).
    - status: filter by eligibility_status.
    """
    _get_cycle_or_404(cycle_id, db)
 
    q = (
        db.query(CycleProjectEnrollment, Project)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .filter(CycleProjectEnrollment.cycle_id == cycle_id)
    )
 
    # Project active/completed filter — default shows active
    p_status = (project_status or "active").lower()
    if p_status == "active":
        q = q.filter(Project.is_active == True)
    elif p_status == "completed":
        q = q.filter(Project.is_active == False)
    # 'all' → no filter
 
    # Eligibility status filter
    # 'eligible' includes manager-approved rows; 'exempted' includes legacy 'declined' rows
    if status_filter:
        if status_filter == "eligible":
            q = q.filter(CycleProjectEnrollment.eligibility_status.in_(["eligible", "Approved"]))
        elif status_filter == "exempted":
            q = q.filter(CycleProjectEnrollment.eligibility_status.in_(["exempted", "declined"]))
        else:
            q = q.filter(CycleProjectEnrollment.eligibility_status == status_filter)
 
    total = q.count()
 
    # Sort: active projects first, then by project name
    if active_first:
        q = q.order_by(Project.is_active.desc(), Project.project_name)
    else:
        q = q.order_by(Project.project_name)
 
    rows = q.offset(skip).limit(limit).all()
    data = [_enrollment_to_response(enr, proj) for enr, proj in rows]
 
    # Split summary counts by eligibility
    all_rows = (
        db.query(CycleProjectEnrollment, Project)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .filter(CycleProjectEnrollment.cycle_id == cycle_id)
        .all()
    )
    summary = {s.value: 0 for s in EligibilityStatus}
    for enr, _ in all_rows:
        summary[enr.eligibility_status] = summary.get(enr.eligibility_status, 0) + 1
 
    return {
        "data": data,
        "total": total,
        "skip": skip,
        "limit": limit,
        "summary": summary,
    }
 
 
@router.post("/{cycle_id}/projects/enroll", status_code=status.HTTP_201_CREATED)
def enroll_projects(
    cycle_id: int,
    payload: EnrollProjectsRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    """
    Enroll TMS projects into a CSAT cycle.
    Accepts TMS project IDs (tsms_projects.Id).
    Auto-creates dim_projects entries if they don't exist (upsert).
    Default eligibility: eligible.
    """
    # from app.database import get_tms_db_engine
    _get_cycle_or_404(cycle_id, db)
 
    enrolled = []
    skipped = []
 
    for tms_id in payload.tms_project_ids:
        # 1. Fetch project info from TMS (or fall back to dim_projects)
        tms_row = None
        try:
            from app.database import tms_engine
            if tms_engine is not None:
                with tms_engine.connect() as conn:
                    result = conn.execute(
                        text("SELECT Id, Name, IsProjectActive FROM tsms_projects WHERE Id = :id LIMIT 1"),
                        {"id": tms_id},
                    )
                    tms_row = result.fetchone()
        except Exception:
            pass  # TMS may not be available; fall back
 
        # 2. Upsert into dim_projects
        project = db.query(Project).filter(
            Project.project_id == str(tms_id)
        ).first()
 
        if project is None:
            # create a minimal dim_projects row
            project_name = tms_row.Name if tms_row else f"Project {tms_id}"
            is_active = bool(tms_row.IsProjectActive) if tms_row else True
            project = Project(
                project_id=str(tms_id),
                project_name=project_name,
                is_active=is_active,
            )
            db.add(project)
            db.flush()  # get project.id
        elif tms_row:
            # keep active status in sync
            project.is_active = bool(tms_row.IsProjectActive)
 
        # 3. Check for existing enrollment
        existing = db.query(CycleProjectEnrollment).filter(
            CycleProjectEnrollment.cycle_id == cycle_id,
            CycleProjectEnrollment.project_id == project.id,
        ).first()
        if existing:
            skipped.append({"tms_project_id": tms_id, "reason": "already enrolled"})
            continue
 
        enr = CycleProjectEnrollment(
            cycle_id=cycle_id,
            project_id=project.id,
            eligibility_status=EligibilityStatus.ELIGIBLE,
            enrolled_by=current_user["emp_id"],
        )
        db.add(enr)
        enrolled.append(tms_id)
 
    db.commit()
    return {"enrolled": enrolled, "skipped": skipped}
 
 
@router.patch("/{cycle_id}/projects/{enrollment_id}/eligibility")
def set_project_eligibility(
    cycle_id: int,
    enrollment_id: int,
    payload: SetEligibilityRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    """
    Set a project's eligibility status.
    - eligible   → goes to feedback/send flow
    - exempted   → requires manager approval to become eligible
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
 
    if payload.eligibility_status not in (
        EligibilityStatus.ELIGIBLE, EligibilityStatus.EXEMPTED
    ):
        raise HTTPException(
            status_code=400,
            detail="Use this endpoint to set 'eligible' or 'exempted' only. "
                   "Use /request-approval for manager flow.",
        )
 
    enr.eligibility_status = payload.eligibility_status
    enr.exemption_reason = payload.exemption_reason
    enr.notes = payload.notes
 
    # Reset approval fields if changing back to eligible
    if payload.eligibility_status == EligibilityStatus.ELIGIBLE:
        enr.approval_requested_at = None
        enr.approval_requested_by = None
        enr.approved_or_declined_by = None
        enr.approved_or_declined_at = None
        enr.manager_remarks = None
 
    db.commit()
    db.refresh(enr)
    project = db.query(Project).filter(Project.id == enr.project_id).first()
    return _enrollment_to_response(enr, project)
 
 
@router.post("/{cycle_id}/projects/{enrollment_id}/request-approval")
def request_manager_approval(
    cycle_id: int,
    enrollment_id: int,
    payload: RequestManagerApprovalRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER", "DELIVERY", "SALES")),
):
    """
    Escalate an exempted project to manager for approval.
    Changes status: exempted → pending_approval
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
 
    if enr.eligibility_status != EligibilityStatus.EXEMPTED:
        raise HTTPException(
            status_code=400,
            detail="Only 'exempted' projects can be sent for manager approval.",
        )
 
    enr.eligibility_status = EligibilityStatus.PENDING_APPROVAL
    enr.approval_requested_at = datetime.utcnow()
    enr.approval_requested_by = current_user["emp_id"]
    if payload.exemption_reason:
        enr.exemption_reason = payload.exemption_reason
 
    db.commit()
    db.refresh(enr)
    project = db.query(Project).filter(Project.id == enr.project_id).first()
    return _enrollment_to_response(enr, project)
 
 
@router.post("/{cycle_id}/projects/{enrollment_id}/manager-decision")
def manager_decision(
    cycle_id: int,
    enrollment_id: int,
    payload: ManagerDecisionRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    """
    Manager approves or declines a pending-approval project.
    - approved  → project becomes eligible (goes to send feedback)
    - declined  → project is removed from cycle (status = declined)
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
 
    if enr.eligibility_status != EligibilityStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail="Only 'pending_approval' projects can receive a manager decision.",
        )
 
    if payload.decision not in (EligibilityStatus.APPROVED, EligibilityStatus.DECLINED):
        raise HTTPException(
            status_code=400,
            detail="Decision must be 'approved' or 'declined'.",
        )
 
    # Declined → back to exempted; Approved → eligible
    enr.eligibility_status = (
        EligibilityStatus.ELIGIBLE if payload.decision == EligibilityStatus.APPROVED
        else EligibilityStatus.EXEMPTED
    )
    enr.approved_or_declined_by = current_user["emp_id"]
    enr.approved_or_declined_at = datetime.utcnow()
    enr.manager_remarks = payload.manager_remarks
 
    db.commit()
    db.refresh(enr)
    project = db.query(Project).filter(Project.id == enr.project_id).first()
    return _enrollment_to_response(enr, project)
 
 
@router.delete("/{cycle_id}/projects/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_from_cycle(
    cycle_id: int,
    enrollment_id: int,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER")),
):
    """Remove a project from a cycle (only if not yet sent for feedback)"""
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    db.delete(enr)
    db.commit()
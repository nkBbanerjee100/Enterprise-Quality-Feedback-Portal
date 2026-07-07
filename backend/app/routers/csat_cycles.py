"""CSAT Cycle routes — full implementation"""
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user, require_role
from app.models.csat_cycle import CSATCycle
from app.models.project import Project
from app.models.cycle_project_enrollment import (
    CycleProjectEnrollment, EligibilityStatus, AdditionApprovalStatus,
)
from app.schemas.csat_cycle import (
    CSATCycleCreate, CSATCycleUpdate, CSATCycleResponse,
    EnrolledProjectResponse, EnrollProjectsRequest,
    SetEligibilityRequest, RequestManagerApprovalRequest,
    ManagerDecisionRequest, CycleHalf, DeclineAdditionRequest,
)
from app.services.cycle_notification_service import (
    notify_project_added_to_cycle, get_project_manager, get_project_managers_bulk,
)

router = APIRouter()

ALLOWED_ROLES = ("QUALITY", "MANAGER", "DELIVERY", "SALES" , "MANAGEMENT")


def _safe_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _half_dates(year: int, half: CycleHalf):
    """
    H1: April 1 – September 30 (same calendar year)
    H2: October 1 (same year) – March 31 (next year)
    """
    if half == CycleHalf.H1:
        return datetime(year, 4, 1), datetime(year, 9, 30, 23, 59, 59)
    return datetime(year, 10, 1), datetime(year + 1, 3, 31, 23, 59, 59)


def _get_cycle_or_404(cycle_id: int, db: Session) -> CSATCycle:
    # Also filter soft-deleted cycles
    cycle = db.query(CSATCycle).filter(
        CSATCycle.id == cycle_id,
        CSATCycle.deleted_at == None,
    ).first()
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


def _enrollment_to_response(
    enr: CycleProjectEnrollment,
    project: Project,
    pm_info: Optional[dict] = None,
    current_user: Optional[dict] = None,
) -> dict:
    can_approve = False
    if current_user and enr.addition_approval_status == AdditionApprovalStatus.PENDING:
        role = current_user.get("role")
        if role == "MANAGEMENT":
            can_approve = True
        elif role == "MANAGER" and pm_info and pm_info.get("emp_id") == current_user.get("emp_id"):
            can_approve = True

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
        "addition_approval_status": enr.addition_approval_status,
        "addition_approved_by": enr.addition_approved_by,
        "addition_approved_at": enr.addition_approved_at,
        "addition_decision_remarks": enr.addition_decision_remarks,
        "project_manager_emp_id": pm_info.get("emp_id") if pm_info else None,
        "project_manager_name": pm_info.get("full_name") if pm_info else None,
        "can_approve_addition": can_approve,
    }


def _cycle_resp(c: CSATCycle) -> dict:
    """Map ORM → response dict (derives year/half from start_date)"""
    year = half = None
    if c.start_date:
        year = c.start_date.year
        m = c.start_date.month
        if m == 4:
            half = "H1"       # Apr–Sep
        elif m == 10:
            half = "H2"       # Oct–Mar
        else:
            # Legacy cycles created under the old Jan–Jun / Jul–Dec scheme
            half = "H1" if m <= 6 else "H2"
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


# ─── CSAT Cycle CRUD ──────────────────────────────────────────────────────────

@router.get("/", response_model=dict)
def list_csat_cycles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    """List CSAT cycles — soft-deleted cycles are always excluded."""
    q = db.query(CSATCycle).filter(CSATCycle.deleted_at == None)
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
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    """Create a new CSAT cycle (H1: Jan–Jun, H2: Jul–Dec).
    Quality and Management only — Managers approve project additions but
    do not create cycles or add projects themselves."""
    start, end = _half_dates(payload.year, payload.half)
    cycle = CSATCycle(
        cycle_name=payload.cycle_name,
        description=payload.description,
        start_date=start,
        end_date=end,
        is_active=True,
    )
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
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
):
    cycle = _get_cycle_or_404(cycle_id, db)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(cycle, k, v)
    db.commit()
    db.refresh(cycle)
    return _cycle_resp(cycle)


@router.delete("/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_csat_cycle(
    cycle_id: int,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("MANAGER" , "MANAGEMENT")),
):
    """
    Soft-delete a CSAT cycle — sets deleted_at timestamp.
    Hidden from all frontend views; data retained in DB.
    Manager role only.
    """
    cycle = _get_cycle_or_404(cycle_id, db)
    cycle.deleted_at = datetime.utcnow()
    db.commit()


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
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List projects enrolled in a cycle.
    - active_first=true (default) sorts active projects before completed ones.
    - project_status: filter by 'active', 'completed', or 'all' (default: active).
    - status: filter by eligibility_status.

    Visibility:
    - QUALITY / MANAGEMENT (and DELIVERY / SALES) see every enrolled project.
    - MANAGER sees only projects where they are the assigned Project Manager
      (TMS PmId), whether the addition is still pending or already decided —
      they need to see pending ones in order to approve them.
    """
    _get_cycle_or_404(cycle_id, db)
    is_manager_role = current_user.get("role") == "MANAGER"
    my_emp_id = current_user.get("emp_id")

    base_q = (
        db.query(CycleProjectEnrollment, Project)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .filter(CycleProjectEnrollment.cycle_id == cycle_id)
    )

    # Project active/completed filter — default shows active
    p_status = (project_status or "active").lower()
    if p_status == "active":
        base_q = base_q.filter(Project.is_active == True)
    elif p_status == "completed":
        base_q = base_q.filter(Project.is_active == False)
    # 'all' → no filter

    # Eligibility status filter
    # 'eligible' includes manager-approved rows
    # 'exempted' includes legacy 'declined' rows (manager-declined = back to exempted)
    if status_filter:
        if status_filter == "eligible":
            base_q = base_q.filter(CycleProjectEnrollment.eligibility_status.in_(["eligible", "approved"]))
        elif status_filter == "exempted":
            base_q = base_q.filter(CycleProjectEnrollment.eligibility_status.in_(["exempted", "declined"]))
        else:
            base_q = base_q.filter(CycleProjectEnrollment.eligibility_status == status_filter)

    if active_first:
        base_q = base_q.order_by(Project.is_active.desc(), Project.project_name)
    else:
        base_q = base_q.order_by(Project.project_name)

    def _pm_map_for(rows):
        tms_ids = [i for i in {_safe_int(proj.project_id) for _, proj in rows} if i is not None]
        return get_project_managers_bulk(tms_ids, tms_db)

    if is_manager_role:
        # PM filtering can't be pushed into the SQL query (PM lives in a
        # separate TMS database), so fetch all matching rows first, filter
        # by PM in Python, then paginate the filtered set.
        all_matching = base_q.all()
        pm_map = _pm_map_for(all_matching)
        filtered = [
            (enr, proj) for enr, proj in all_matching
            if pm_map.get(_safe_int(proj.project_id), {}).get("emp_id") == my_emp_id
        ]
        total = len(filtered)
        page_rows = filtered[skip: skip + limit]
        data = [
            _enrollment_to_response(enr, proj, pm_map.get(_safe_int(proj.project_id)), current_user)
            for enr, proj in page_rows
        ]
        # Summary counts — always from ALL of this manager's projects in the
        # cycle, unaffected by the current project_status/eligibility filters.
        all_unfiltered = (
            db.query(CycleProjectEnrollment, Project)
            .join(Project, Project.id == CycleProjectEnrollment.project_id)
            .filter(CycleProjectEnrollment.cycle_id == cycle_id)
            .all()
        )
        unfiltered_pm_map = _pm_map_for(all_unfiltered)
        summary_rows = [
            (enr, proj) for enr, proj in all_unfiltered
            if unfiltered_pm_map.get(_safe_int(proj.project_id), {}).get("emp_id") == my_emp_id
        ]
    else:
        total = base_q.count()
        page_rows = base_q.offset(skip).limit(limit).all()
        pm_map = _pm_map_for(page_rows)
        data = [
            _enrollment_to_response(enr, proj, pm_map.get(_safe_int(proj.project_id)), current_user)
            for enr, proj in page_rows
        ]
        # Summary counts by eligibility (always from full cycle, no project/eligibility filters)
        summary_rows = (
            db.query(CycleProjectEnrollment, Project)
            .join(Project, Project.id == CycleProjectEnrollment.project_id)
            .filter(CycleProjectEnrollment.cycle_id == cycle_id)
            .all()
        )

    summary = {s.value: 0 for s in EligibilityStatus}
    for enr, _ in summary_rows:
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
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    """
    Enroll TMS projects into a CSAT cycle. Quality and Management only.

    Accepts TMS project IDs (tsms_projects.Id).
    Auto-creates dim_projects entries if they don't exist (upsert).
    Default eligibility: eligible.

    Each newly-added project starts with addition_approval_status='pending'
    and triggers an in-app notification to everyone with role MANAGEMENT,
    plus the project's Manager (TMS PmId) if one is assigned. (Email
    delivery for this notification is temporarily disabled — see
    EMAIL_NOTIFICATIONS_ENABLED in cycle_notification_service.py — the
    in-app bell notification is unaffected.)
    Management (always) or that specific Manager (only for their own
    project) must then approve/decline the addition via
    POST /{cycle_id}/projects/{enrollment_id}/approve-addition|decline-addition.
    """
    cycle = _get_cycle_or_404(cycle_id, db)

    enrolled = []
    skipped = []
    newly_enrolled: list[tuple[CycleProjectEnrollment, Project]] = []

    for tms_id in payload.tms_project_ids:
        # 1. Try to fetch project info from TMS DB
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
            pass  # TMS not available; fall back to dim_projects

        # 2. Upsert into dim_projects
        project = db.query(Project).filter(
            Project.project_id == str(tms_id)
        ).first()

        if project is None:
            project_name = tms_row.Name if tms_row else f"Project {tms_id}"
            is_active = bool(tms_row.IsProjectActive) if tms_row else True
            project = Project(
                project_id=str(tms_id),
                project_name=project_name,
                is_active=is_active,
            )
            db.add(project)
            db.flush()
        elif tms_row:
            project.is_active = bool(tms_row.IsProjectActive)

        # 3. Skip if already enrolled
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
            addition_approval_status=AdditionApprovalStatus.PENDING,
        )
        db.add(enr)
        db.flush()  # need enr.id for the notification linkage below
        enrolled.append(tms_id)
        newly_enrolled.append((enr, project))

    db.commit()

    # ── Notify Management + each project's PM (best-effort; enrollment
    #    itself has already succeeded and committed above) ─────────────────
    enrolled_by_name = current_user.get("name") or current_user["emp_id"]
    for enr, project in newly_enrolled:
        db.refresh(enr)
        try:
            notify_project_added_to_cycle(
                local_db=db,
                tms_db=tms_db,
                cycle_id=cycle_id,
                cycle_name=cycle.cycle_name,
                project_id=project.id,
                project_ext_id=project.project_id,
                project_name=project.project_name,
                enrollment_id=enr.id,
                enrolled_by_name=enrolled_by_name,
                actor_emp_id=current_user["emp_id"],
            )
        except Exception as e:
            print(f"[WARN] Failed to send addition notifications for enrollment {enr.id}: {e}")
    db.commit()

    return {"enrolled": enrolled, "skipped": skipped}


@router.patch("/{cycle_id}/projects/{enrollment_id}/eligibility")
def set_project_eligibility(
    cycle_id: int,
    enrollment_id: int,
    payload: SetEligibilityRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
):
    """
    Set a project's eligibility status.
    - eligible → goes to feedback/send flow
    - exempted → requires manager approval to become eligible
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)

    if payload.eligibility_status not in (
        EligibilityStatus.ELIGIBLE, EligibilityStatus.EXEMPTED
    ):
        raise HTTPException(
            status_code=400,
            detail="Use this endpoint to set 'eligible' or 'exempted' only. "
                   "Use /request-approval for the manager approval flow.",
        )

    enr.eligibility_status = payload.eligibility_status
    enr.exemption_reason = payload.exemption_reason
    enr.notes = payload.notes

    # Reset approval fields whenever this endpoint is used to (re-)set eligibility
    # manually — both branches represent a fresh decision by Quality/Delivery/Sales,
    # not a continuation of a prior manager approval cycle:
    #   - eligible: project is now eligible outright, no pending approval history applies
    #   - exempted: this is a fresh exemption action. Without this, a project that was
    #     already declined by a manager (which also lands in EXEMPTED) would keep its
    #     old approved_or_declined_at, making it indistinguishable from a brand-new
    #     exemption and re-enabling "Make Eligible" / "Send to Manager" without Quality
    #     explicitly re-affirming the exemption.
    if payload.eligibility_status in (EligibilityStatus.ELIGIBLE, EligibilityStatus.EXEMPTED):
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
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER", "DELIVERY", "SALES" , "MANAGEMENT")),
):
    """
    Escalate an exempted project to manager for approval.
    Changes status: exempted → pending_approval

    Any user with role MANAGER can decide on this (see manager_decision) via
    a broadcast notification — not just this specific project's PM. So a
    missing PM in TMS is no longer a reason to block escalation; it just
    means the response won't have a project_manager_name to display.
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    if enr.eligibility_status != EligibilityStatus.EXEMPTED:
        raise HTTPException(
            status_code=400,
            detail="Only 'exempted' projects can be sent for manager approval.",
        )

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if project and _safe_int(project.project_id) else None

    enr.eligibility_status = EligibilityStatus.PENDING_APPROVAL
    enr.approval_requested_at = datetime.utcnow()
    enr.approval_requested_by = current_user["emp_id"]
    if payload.exemption_reason:
        enr.exemption_reason = payload.exemption_reason

    db.commit()
    db.refresh(enr)
    return _enrollment_to_response(enr, project, pm_info, current_user)


@router.post("/{cycle_id}/projects/{enrollment_id}/manager-decision")
def manager_decision(
    cycle_id: int,
    enrollment_id: int,
    payload: ManagerDecisionRequest,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("MANAGER")),
):
    """
    Manager approves or declines a pending-approval project.
    - approved → project becomes eligible (goes to send feedback)
    - declined → project returns to exempted (not removed from cycle)
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
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
):
    """Remove a project enrollment from a cycle."""
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    db.delete(enr)
    db.commit()


# ─── Addition Approval (separate from the exemption/eligibility flow) ─────────
# Gates the act of adding a project to a cycle at all. Triggered automatically
# on enroll_projects(); decided here by Management (any project) or the
# project's Manager (only their own projects, per TMS PmId).

def _assert_can_decide_addition(project: Project, current_user: dict, tms_db: Session) -> None:
    role = current_user.get("role")
    if role == "MANAGEMENT":
        return
    if role == "MANAGER":
        pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
        if pm_info and pm_info.get("emp_id") == current_user.get("emp_id"):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the assigned Manager for this project.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only Management or the project's assigned Manager can decide on this addition.",
    )


@router.post("/{cycle_id}/projects/{enrollment_id}/approve-addition")
def approve_addition(
    cycle_id: int,
    enrollment_id: int,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGER", "MANAGEMENT")),
):
    """Approve a project's addition to the cycle."""
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    _assert_can_decide_addition(project, current_user, tms_db)

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail="This addition has already been decided.")

    enr.addition_approval_status = AdditionApprovalStatus.APPROVED
    enr.addition_approved_by = current_user["emp_id"]
    enr.addition_approved_at = datetime.utcnow()
    db.commit()
    db.refresh(enr)

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
    return _enrollment_to_response(enr, project, pm_info, current_user)


@router.post("/{cycle_id}/projects/{enrollment_id}/decline-addition")
def decline_addition(
    cycle_id: int,
    enrollment_id: int,
    payload: DeclineAdditionRequest,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGER", "MANAGEMENT")),
):
    """
    Decline a project's addition to the cycle.

    If the project has no Manager (PM) assigned in TMS, declining also sets
    eligibility_status='exempted' automatically — there's no PM to ever send
    an exemption escalation to, so leaving it at its default 'eligible' state
    would silently make it eligible to send feedback for despite the addition
    itself being declined. When a PM does exist, only addition_approval_status
    changes here; the existing Mark Exempted / Send to Manager flow still
    applies afterward as its own separate, deliberate step.
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    _assert_can_decide_addition(project, current_user, tms_db)

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail="This addition has already been decided.")

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None

    enr.addition_approval_status = AdditionApprovalStatus.DECLINED
    enr.addition_approved_by = current_user["emp_id"]
    enr.addition_approved_at = datetime.utcnow()
    enr.addition_decision_remarks = payload.remarks

    if pm_info is None:
        enr.eligibility_status = EligibilityStatus.EXEMPTED
        if payload.remarks and not enr.exemption_reason:
            enr.exemption_reason = payload.remarks

    db.commit()
    db.refresh(enr)

    return _enrollment_to_response(enr, project, pm_info, current_user)
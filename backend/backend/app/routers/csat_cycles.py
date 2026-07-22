"""CSAT Cycle routes — full implementation"""
import json
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user, require_role
from app.models.csat_cycle import CSATCycle
from app.models.project import Project
from app.models.feedback_request import FeedbackRequest
from app.models.project_staging import ProjectStaging
from app.models.audit_log import AuditLog
from app.models.cycle_project_enrollment import (
    CycleProjectEnrollment, EligibilityStatus, AdditionApprovalStatus,
)
from app.schemas.csat_cycle import (
    CSATCycleCreate, CSATCycleUpdate, CSATCycleResponse,
    EnrolledProjectResponse, EnrollProjectsRequest, EnrollTriageAction,
    SetEligibilityRequest, CycleHalf, DeclineAdditionRequest,
    ManagerCycleDecisionRequest, QualityCycleRecheckRequest,
    ManagementCycleExemptionDecisionRequest,
)
from app.services.cycle_notification_service import (
    notify_project_added_to_cycle, get_project_manager, get_project_managers_bulk,
    notify_manager_enrollment_needs_review, notify_quality_enrollment_needs_recheck,
    notify_management_enrollment_exemption_request, notify_quality_of_enrollment_exemption_decision,
    notify_quality_role_enrollment_needs_recheck, notify_quality_of_manager_project_submission,
    notify_management_enrollment_second_level_review, notify_manager_of_qm_enrollment_exemption_rejection,
    notify_qm_of_management_enrollment_exemption_decision, notify_manager_and_qm_of_management_enrollment_rejection,
)
from app.services.audit_service import log_action, get_client_ip
from app.schemas.audit import AuditActions

router = APIRouter()

ALLOWED_ROLES = ("QUALITY", "MANAGER", "DELIVERY", "SALES" , "MANAGEMENT")


def _safe_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_names(db: Session, emp_ids: list) -> dict:
    """emp_id -> display name, resolved from csat_users. Falls back to the
    emp_id itself for anyone not found (e.g. left the company, bad data).
    Same pattern as project_staging.py's _resolve_names — kept as a local
    copy rather than a shared import since these two routers otherwise have
    no dependency on each other."""
    ids = [e for e in set(emp_ids) if e]
    if not ids:
        return {}
    rows = db.execute(
        text("""
            SELECT EmpId AS emp_id, EmpFirstName AS first_name, EmpLastName AS last_name
            FROM csat_users
            WHERE EmpId IN :ids
        """),
        {"ids": tuple(ids)},
    ).fetchall()
    return {
        r.emp_id: (" ".join(p for p in [r.first_name, r.last_name] if p).strip() or r.emp_id)
        for r in rows
    }


def _get_tms_live_completion_bulk(tms_project_ids: List[int], tms_db: Session) -> dict:
    """
    dim_projects.is_active is only ever written ONCE — at the moment a
    project is staged or enrolled (see project_staging.py / enroll_projects
    below), as a snapshot of TMS's IsProjectActive at that instant. There is
    no background job that refreshes it afterward, so a project enrolled
    long ago can sit permanently flagged "active" locally even after it
    genuinely completes in TMS.

    TMS's own IsProjectActive flag is not used here either — it isn't kept
    reliably in sync with reality on the TMS side. A project is judged
    completed purely by comparing its EndDate against today's date:
    completed if EndDate is set and is in the past. A project with no
    EndDate, or one still in the future, counts as active.

    Returns {tms_project_id: is_completed_bool}. Projects not found in TMS
    (deleted, or ID mismatch) are left out of the dict — caller should treat
    missing entries by falling back to the local snapshot.
    """
    if not tms_project_ids:
        return {}
    rows = tms_db.execute(
        text("""
            SELECT Id, EndDate
            FROM tsms_projects
            WHERE Id IN :ids
        """).bindparams(ids=tuple(tms_project_ids)),
    ).fetchall() if len(tms_project_ids) > 1 else tms_db.execute(
        text("SELECT Id, EndDate FROM tsms_projects WHERE Id = :id"),
        {"id": tms_project_ids[0]},
    ).fetchall()

    result = {}
    today = datetime.utcnow().date()
    for r in rows:
        end_date = r.EndDate.date() if hasattr(r.EndDate, "date") else r.EndDate
        result[r.Id] = bool(end_date) and end_date < today
    return result


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


def _feedback_map_for(db: Session, cycle_id: int, tms_ext_ids: list[int]) -> dict[int, dict]:
    """Latest fact_feedback_request per project, scoped to this cycle —
    used to know whether a customer has already submitted feedback for a
    project (status='completed'), so the UI can stop offering to re-send
    it. 'Latest' by id since a project could in principle have more than
    one request in the same cycle (e.g. a resend).

    Keyed by TMS EXTERNAL project id (tsms_projects.Id), not
    dim_projects.id — despite the FeedbackRequest model's FK annotation,
    fact_feedback_request.project_id is actually populated with the TMS
    external id end-to-end (see SendFeedbackPage.tsx -> POST
    /api/feedback/requests), the same way dashboard.py's scoping already
    assumes. Matching against dim_projects.id here silently never matched
    anything — this map came back empty for every project, every time.
    """
    if not tms_ext_ids:
        return {}
    rows = (
        db.query(FeedbackRequest)
        .filter(
            FeedbackRequest.csat_cycle_id == cycle_id,
            FeedbackRequest.project_id.in_(tms_ext_ids),
        )
        .order_by(FeedbackRequest.project_id, FeedbackRequest.id.desc())
        .all()
    )
    out: dict[int, dict] = {}
    for r in rows:
        if r.project_id not in out:   # first hit per project_id is the latest (id desc)
            out[r.project_id] = {"feedback_request_id": r.id, "feedback_status": r.status,
                                  "pm_approval_status": r.pm_approval_status}
    return out


def _enrollment_conflict_note(enr: CycleProjectEnrollment, name_map: dict) -> Optional[str]:
    """Enrollment-level twin of project_staging.py's _staging_conflict_note
    — same three shapes, same fields (this model mirrors ProjectStaging's
    chain-tracking columns exactly).

    1. PENDING_QUALITY_RECHECK: the Manager just exempted it — QM needs to
       approve or reject that exemption.
    2. PENDING_MANAGEMENT_REVIEW: QM approved the exemption — Management
       needs to give (or withhold) the second-level approval.
    3. PENDING_MANAGER_REVIEW with addition_decision_remarks set: not the
       ordinary "Quality just enrolled it eligible" first pass — either QM
       or Management rejected the exemption and bounced it back. Which one
       rejected most recently is whichever of quality_recheck_at /
       addition_approved_at is the later timestamp.
    """
    manager_name = name_map.get(enr.manager_decided_by, enr.manager_decided_by) if enr.manager_decided_by else None
    quality_name = name_map.get(enr.quality_recheck_by, enr.quality_recheck_by) if enr.quality_recheck_by else None
    management_name = name_map.get(enr.addition_approved_by, enr.addition_approved_by) if enr.addition_approved_by else None

    if enr.addition_approval_status == AdditionApprovalStatus.PENDING_QUALITY_RECHECK and enr.manager_decided_by:
        reason = f': "{enr.exemption_reason}"' if enr.exemption_reason else ''
        return f"{manager_name} exempted this project{reason} — awaiting QM's approval."

    if enr.addition_approval_status == AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW and enr.quality_recheck_by:
        reason = f': "{enr.exemption_reason}"' if enr.exemption_reason else ''
        return f"{quality_name} approved this exemption{reason} — awaiting Management's second-level approval."

    if enr.addition_approval_status == AdditionApprovalStatus.PENDING_MANAGER_REVIEW and enr.addition_decision_remarks:
        management_rejected_last = enr.addition_approved_at and (not enr.quality_recheck_at or enr.addition_approved_at >= enr.quality_recheck_at)
        rejector = management_name if management_rejected_last else quality_name
        return f'{rejector} rejected the exemption: "{enr.addition_decision_remarks}" — your decision is needed again.'

    return None


def _enrollment_to_response(
    enr: CycleProjectEnrollment,
    project: Project,
    pm_info: Optional[dict] = None,
    current_user: Optional[dict] = None,
    feedback_info: Optional[dict] = None,
    name_map: Optional[dict] = None,
) -> dict:
    can_approve = False
    if current_user and enr.addition_approval_status == AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW:
        # Management is the sole decision-maker on the FINAL review step —
        # everything earlier in the chain (Manager's own review, Quality's
        # recheck, Management's exemption-request decision) has its own
        # dedicated endpoint instead of this generic flag.
        can_approve = current_user.get("role") == "MANAGEMENT"

    name_map = name_map or {}

    return {
        "enrollment_id": enr.id,
        "project_id": project.id,
        "project_ext_id": project.project_id,
        "project_name": project.project_name,
        "is_active": project.is_active,
        "eligibility_status": enr.eligibility_status,
        "exemption_reason": enr.exemption_reason,
        "notes": enr.notes,
        "enrolled_by": enr.enrolled_by,
        "enrolled_by_name": name_map.get(enr.enrolled_by, enr.enrolled_by) if enr.enrolled_by else None,
        "enrolled_at": enr.enrolled_at,
        "approval_requested_at": enr.approval_requested_at,
        "manager_remarks": enr.manager_remarks,
        "approved_or_declined_at": enr.approved_or_declined_at,
        "addition_approval_status": enr.addition_approval_status,
        "addition_approved_by": enr.addition_approved_by,
        "addition_approved_by_name": name_map.get(enr.addition_approved_by, enr.addition_approved_by) if enr.addition_approved_by else None,
        "addition_approved_at": enr.addition_approved_at,
        "addition_decision_remarks": enr.addition_decision_remarks,
        "project_manager_emp_id": pm_info.get("emp_id") if pm_info else (enr.manager_emp_id or None),
        "project_manager_name": pm_info.get("full_name") if pm_info else None,
        "can_approve_addition": can_approve,
        "manager_emp_id": enr.manager_emp_id,
        "manager_decided_by": enr.manager_decided_by,
        "manager_decided_by_name": name_map.get(enr.manager_decided_by, enr.manager_decided_by) if enr.manager_decided_by else None,
        "manager_decided_at": enr.manager_decided_at,
        "quality_recheck_by": enr.quality_recheck_by,
        "quality_recheck_by_name": name_map.get(enr.quality_recheck_by, enr.quality_recheck_by) if enr.quality_recheck_by else None,
        "quality_recheck_at": enr.quality_recheck_at,
        "conflict_note": _enrollment_conflict_note(enr, name_map),
        "feedback_request_id": (feedback_info or {}).get("feedback_request_id"),
        "feedback_status": (feedback_info or {}).get("feedback_status"),
        "pm_approval_status": (feedback_info or {}).get("pm_approval_status"),
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
    request: Request,
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

    log_action(
        db, action=AuditActions.CSAT_CYCLE_CREATED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="csat_cycle", entity_id=cycle.id,
        details={"cycle_name": cycle.cycle_name, "year": payload.year, "half": payload.half},
    )
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
      for visibility into their own projects. They do not decide on the
      addition itself; that's Quality (via triage) or Management only.
    """
    _get_cycle_or_404(cycle_id, db)
    is_manager_role = current_user.get("role") == "MANAGER"
    my_emp_id = current_user.get("emp_id")

    base_q = (
        db.query(CycleProjectEnrollment, Project)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .filter(CycleProjectEnrollment.cycle_id == cycle_id)
    )

    # Project active/completed filter — NOTE: this can no longer be pushed
    # into SQL against Project.is_active. That column is only ever written
    # once, at enroll/staging time (a one-time TMS snapshot), and never
    # refreshed afterward — so filtering on it here would make "completed"
    # permanently under-count anything enrolled before it actually finished
    # in TMS. Instead we fetch matching rows first and apply a LIVE TMS
    # check in Python (see _get_tms_live_completion_bulk), same as the PM
    # filter below already has to do for MANAGER-role visibility.
    p_status = (project_status or "active").lower()

    # Eligibility status filter
    # 'eligible' includes manager-approved rows. It also excludes projects
    # whose addition to the cycle is still pending approval — matching
    # getRowStatus() in CsatCycleDetailPage.tsx, which checks
    # addition_approval_status BEFORE eligibility_status: a project can be
    # eligibility_status='eligible' from triage yet still not actually be
    # "Ready" if the addition itself hasn't been approved yet. Without this,
    # this endpoint's 'eligible' bucket and the cycle detail page's 'Ready'
    # bucket disagree on the same data (this cost us a real bug — Reports
    # showed 4 "Eligible Projects" while the cycle page correctly showed
    # only 1 "Ready", because 3 of those 4 were still awaiting approval).
    # 'exempted' includes legacy 'declined' rows (manager-declined = back to exempted)
    if status_filter:
        if status_filter == "eligible":
            base_q = base_q.filter(
                CycleProjectEnrollment.eligibility_status.in_(["eligible", "approved"]),
                CycleProjectEnrollment.addition_approval_status == AdditionApprovalStatus.APPROVED,
            )
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

    def _apply_live_status_filter(rows):
        """rows: list of (enr, proj) tuples. Returns the subset matching
        p_status ('active' | 'completed' | 'all'), using a live TMS check
        with a fallback to the local snapshot for any project TMS lookup
        misses (e.g. deleted from TMS)."""
        if p_status == "all":
            return rows
        tms_ids = [i for i in {_safe_int(proj.project_id) for _, proj in rows} if i is not None]
        live_map = _get_tms_live_completion_bulk(tms_ids, tms_db)
        out = []
        for enr, proj in rows:
            tid = _safe_int(proj.project_id)
            is_completed = live_map.get(tid, not proj.is_active)  # fallback: old snapshot
            if p_status == "completed" and is_completed:
                out.append((enr, proj))
            elif p_status == "active" and not is_completed:
                out.append((enr, proj))
        return out

    if is_manager_role:
        # PM filtering can't be pushed into the SQL query (PM lives in a
        # separate TMS database), so fetch all matching rows first, filter
        # by PM in Python, then paginate the filtered set.
        all_matching = _apply_live_status_filter(base_q.all())
        pm_map = _pm_map_for(all_matching)
        filtered = [
            (enr, proj) for enr, proj in all_matching
            if pm_map.get(_safe_int(proj.project_id), {}).get("emp_id") == my_emp_id
        ]
        total = len(filtered)
        page_rows = filtered[skip: skip + limit]
        feedback_map = _feedback_map_for(db, cycle_id, [i for i in {_safe_int(proj.project_id) for _, proj in page_rows} if i is not None])
        name_map = _resolve_names(db, [
            eid for enr, _ in page_rows
            for eid in (enr.enrolled_by, enr.manager_decided_by, enr.quality_recheck_by, enr.addition_approved_by)
        ])
        data = [
            _enrollment_to_response(enr, proj, pm_map.get(_safe_int(proj.project_id)), current_user, feedback_map.get(_safe_int(proj.project_id)), name_map)
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
        # Live-status filtering can't be pushed into SQL either (TMS is a
        # separate database) — same fetch-all-then-filter-then-paginate
        # approach as the MANAGER branch above.
        all_matching = _apply_live_status_filter(base_q.all())
        total = len(all_matching)
        page_rows = all_matching[skip: skip + limit]
        pm_map = _pm_map_for(page_rows)
        feedback_map = _feedback_map_for(db, cycle_id, [i for i in {_safe_int(proj.project_id) for _, proj in page_rows} if i is not None])
        name_map = _resolve_names(db, [
            eid for enr, _ in page_rows
            for eid in (enr.enrolled_by, enr.manager_decided_by, enr.quality_recheck_by, enr.addition_approved_by)
        ])
        data = [
            _enrollment_to_response(enr, proj, pm_map.get(_safe_int(proj.project_id)), current_user, feedback_map.get(_safe_int(proj.project_id)), name_map)
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
    ready_count = 0   # true "Ready" count — eligible/approved AND the addition itself
                      # isn't still pending. Kept separate from the raw eligibility_status
                      # tally above (which stays a straightforward per-status distribution)
                      # so callers computing a rate — e.g. Reports' Eligibility Rate KPI —
                      # get a number consistent with getRowStatus()'s "Ready" bucket instead
                      # of over-counting projects still awaiting addition approval.
    for enr, _ in summary_rows:
        summary[enr.eligibility_status] = summary.get(enr.eligibility_status, 0) + 1
        if (
            enr.eligibility_status in ("eligible", "approved")
            and enr.addition_approval_status == AdditionApprovalStatus.APPROVED
        ):
            ready_count += 1

    return {
        "data": data,
        "total": total,
        "skip": skip,
        "limit": limit,
        "summary": summary,
        "ready_count": ready_count,
    }


@router.post("/{cycle_id}/projects/enroll", status_code=status.HTTP_201_CREATED)
def enroll_projects(
    cycle_id: int,
    payload: EnrollProjectsRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT", "MANAGER")),
):
    """
    Enroll TMS projects into a CSAT cycle. Accepts TMS project IDs
    (tsms_projects.Id); auto-creates dim_projects entries if they don't
    exist (upsert).

    Quality / Management (via `items`, one eligible/exempted decision per
    project — mirrors project_staging's /select exactly):
      - eligible → routed to the project's own Manager to review next. If
        the project has no assigned Manager in TMS, there's no one to
        route it to, so it's approved outright.
      - exempted → mandatory exemption_reason; goes to Management to
        approve or reject the exemption request.
    (`tms_project_ids` is accepted as a legacy all-eligible shorthand.)

    Manager (PM): may add ONLY projects where they are the assigned Manager
    in TMS (PmId), via `items`:
      - eligible → auto-approved immediately, no review chain at all since
        it's their own project.
      - exempted → mandatory exemption_reason; skips straight to "back with
        Quality to recheck" (same as a Manager exempting a project Quality
        had routed to them) — Quality's recheck then either sends it to
        Management (eligible) or finalizes it as exempt (exempted).
    (`tms_project_ids` is still accepted as a legacy all-eligible shorthand.)
    Any project ID the Manager isn't the assigned PM for is skipped with a
    reason.
    """
    cycle = _get_cycle_or_404(cycle_id, db)
    is_manager_role = current_user.get("role") == "MANAGER"
    enrolled_by_name = current_user.get("name") or current_user["emp_id"]

    # Normalize both input shapes into one list of (tms_id, action, reason).
    items: list[tuple[int, EnrollTriageAction, Optional[str]]] = []
    if payload.items:
        items = [(it.tms_project_id, it.action, it.exemption_reason) for it in payload.items]
    elif payload.tms_project_ids:
        items = [(tid, EnrollTriageAction.ELIGIBLE, None) for tid in payload.tms_project_ids]

    enrolled = []
    skipped = []
    warnings = []
    newly_enrolled: list[tuple[CycleProjectEnrollment, Project, str]] = []  # (enr, project, outcome)

    for tms_id, action, exemption_reason in items:
        if is_manager_role:
            pm_info = get_project_manager(tms_id, tms_db)
            if not pm_info or pm_info.get("emp_id") != current_user["emp_id"]:
                skipped.append({
                    "tms_project_id": tms_id,
                    "reason": "You can only add projects you're the assigned Manager for.",
                })
                continue
        if action == EnrollTriageAction.EXEMPTED and not (exemption_reason or "").strip():
            skipped.append({
                "tms_project_id": tms_id,
                "reason": "An exemption reason is required to mark a project exempt.",
            })
            continue

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

        if is_manager_role and action == EnrollTriageAction.ELIGIBLE:
            enr = CycleProjectEnrollment(
                cycle_id=cycle_id,
                project_id=project.id,
                eligibility_status=EligibilityStatus.ELIGIBLE,
                enrolled_by=current_user["emp_id"],
                addition_approval_status=AdditionApprovalStatus.APPROVED,
                addition_approved_by=current_user["emp_id"],
                addition_approved_at=datetime.utcnow(),
                addition_decision_remarks="Added directly by the project's Manager.",
            )
            outcome = "manager_self_add"
        elif is_manager_role and action == EnrollTriageAction.EXEMPTED:
            # A Manager exempting their OWN project skips straight to
            # "back with Quality to recheck" — there's no Quality submitter
            # to route it to first, and no point routing it BACK to this
            # same Manager for review, so this starts exactly where the
            # regular chain's manager-decide/exempt step would leave off.
            enr = CycleProjectEnrollment(
                cycle_id=cycle_id,
                project_id=project.id,
                eligibility_status=EligibilityStatus.ELIGIBLE,   # not final yet — Quality/Management still decide
                enrolled_by=current_user["emp_id"],
                addition_approval_status=AdditionApprovalStatus.PENDING_QUALITY_RECHECK,
                exemption_reason=exemption_reason,
                manager_emp_id=current_user["emp_id"],
                manager_decided_by=current_user["emp_id"],
                manager_decided_at=datetime.utcnow(),
            )
            outcome = "manager_self_exempt"
        elif action == EnrollTriageAction.EXEMPTED:
            enr = CycleProjectEnrollment(
                cycle_id=cycle_id,
                project_id=project.id,
                eligibility_status=EligibilityStatus.ELIGIBLE,   # not final yet — Management decides
                enrolled_by=current_user["emp_id"],
                addition_approval_status=AdditionApprovalStatus.PENDING_MANAGEMENT_EXEMPTION_REVIEW,
                exemption_reason=exemption_reason,
            )
            outcome = "exemption_requested"
        else:
            pm_info = None
            try:
                pm_info = get_project_manager(tms_id, tms_db)
            except Exception as e:
                print(f"[WARN] Could not resolve PM for tms project {tms_id}: {e}")
            if pm_info:
                enr = CycleProjectEnrollment(
                    cycle_id=cycle_id,
                    project_id=project.id,
                    eligibility_status=EligibilityStatus.ELIGIBLE,
                    enrolled_by=current_user["emp_id"],
                    addition_approval_status=AdditionApprovalStatus.PENDING_MANAGER_REVIEW,
                    manager_emp_id=pm_info["emp_id"],
                )
                outcome = "routed_to_manager"
            else:
                # No Manager assigned in TMS — nobody to route this to.
                enr = CycleProjectEnrollment(
                    cycle_id=cycle_id,
                    project_id=project.id,
                    eligibility_status=EligibilityStatus.ELIGIBLE,
                    enrolled_by=current_user["emp_id"],
                    addition_approval_status=AdditionApprovalStatus.APPROVED,
                    addition_approved_by=current_user["emp_id"],
                    addition_approved_at=datetime.utcnow(),
                    addition_decision_remarks="No Manager assigned in TMS — approved outright.",
                )
                outcome = "approved_no_pm"

        db.add(enr)
        db.flush()  # need enr.id for the notification linkage below
        enrolled.append(tms_id)
        newly_enrolled.append((enr, project, outcome))

    db.commit()

    # ── Notify whoever needs to act next (best-effort; enrollment itself
    #    has already succeeded and committed above). Nothing to notify for
    #    a Manager's own eligible self-add (nobody has anything pending to
    #    act on), or for the no-PM-eligible case (already final). ──────────
    for enr, project, outcome in newly_enrolled:
        if outcome in ("manager_self_add", "approved_no_pm"):
            continue
        db.refresh(enr)
        try:
            if outcome == "routed_to_manager":
                notify_manager_enrollment_needs_review(
                    local_db=db, manager_emp_id=enr.manager_emp_id, cycle_id=cycle_id,
                    project_name=project.project_name, project_id=project.id,
                    enrollment_id=enr.id, enrolled_by_name=enrolled_by_name,
                    actor_emp_id=current_user["emp_id"],
                )
            elif outcome == "exemption_requested":
                notify_management_enrollment_exemption_request(
                    local_db=db, cycle_id=cycle_id, project_name=project.project_name,
                    project_id=project.id, enrollment_id=enr.id,
                    enrolled_by_name=enrolled_by_name, exemption_reason=enr.exemption_reason or "",
                    actor_emp_id=current_user["emp_id"],
                )
            elif outcome == "manager_self_exempt":
                # Do not notify Quality per project here.
                # A single final notification is sent after the entire manager batch succeeds.
                continue
        except Exception as e:
            print(f"[WARN] Failed to send notifications for enrollment {enr.id}: {e}")
            warnings.append({"tms_project_id": int(project.project_id), "reason": "Saved, but the notification failed to send."})
            
    if is_manager_role and newly_enrolled:
        added_count = sum(
            1 for _, _, outcome in newly_enrolled
            if outcome == "manager_self_add"
        )
        exempted_count = sum(
            1 for _, _, outcome in newly_enrolled
            if outcome == "manager_self_exempt"
        )

        notify_quality_of_manager_project_submission(
            local_db=db,
            cycle_id=cycle_id,
            manager_name=enrolled_by_name,
            added_count=added_count,
            exempted_count=exempted_count,
            actor_emp_id=current_user["emp_id"],
        )
    db.commit()

    ip = get_client_ip(request)
    for enr, project, outcome in newly_enrolled:
        log_action(
            db, action=AuditActions.PROJECT_ENROLLED,
            actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
            actor_role=current_user["role"], ip_address=ip,
            entity_type="cycle_project_enrollment", entity_id=enr.id,
            details={"cycle_id": cycle_id, "project_name": project.project_name, "outcome": outcome, "remarks": enr.exemption_reason},
        )

    return {"enrolled": enrolled, "skipped": skipped, "warnings": warnings}


@router.patch("/{cycle_id}/projects/{enrollment_id}/eligibility")
def set_project_eligibility(
    cycle_id: int,
    enrollment_id: int,
    payload: SetEligibilityRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGER" , "MANAGEMENT")),
):
    """
    Set a project's eligibility status.
    - eligible → goes to feedback/send flow
    - exempted → final; no further review step (Manager has no role here)
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)

    if payload.eligibility_status not in (
        EligibilityStatus.ELIGIBLE, EligibilityStatus.EXEMPTED
    ):
        raise HTTPException(
            status_code=400,
            detail="Use this endpoint to set 'eligible' or 'exempted' only.",
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

    log_action(
        db, action=AuditActions.CYCLE_ELIGIBILITY_CHANGED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={
            "cycle_id": cycle_id, "project_name": project.project_name if project else None,
            "new_status": payload.eligibility_status, "reason": payload.exemption_reason,
        },
    )
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


# ─── Second-level exemption approval (separate from the eligibility flow)
# — reachable only after QM approves a Manager's exemption (status
# PENDING_MANAGEMENT_REVIEW) — see manager_decide_enrollment and
# quality_recheck_enrollment above for the earlier steps. Despite the
# route names ("approve/decline-addition"), Management is approving or
# rejecting the EXEMPTION here, not the project's addition to the cycle —
# approving EXEMPTS it for good; rejecting sends it back to the Manager.

def _assert_can_decide_addition(current_user: dict) -> None:
    role = current_user.get("role")
    if role == "MANAGEMENT":
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only Management can make this second-level exemption decision.",
    )


@router.post("/{cycle_id}/projects/{enrollment_id}/approve-addition")
def approve_addition(
    cycle_id: int,
    enrollment_id: int,
    payload: DeclineAdditionRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    """Management's second-level approval of QM's approved exemption —
    confirms it. Final: the project is exempt for good. A reason is
    required, same as every other step in this chain."""
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    _assert_can_decide_addition(current_user)

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW:
        raise HTTPException(status_code=400, detail="This project isn't awaiting your second-level exemption approval.")
    if not (payload.remarks or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to approve the exemption.")

    enr.addition_approval_status = AdditionApprovalStatus.DECLINED
    enr.addition_approved_by = current_user["emp_id"]
    enr.addition_approved_at = datetime.utcnow()
    enr.addition_decision_remarks = payload.remarks
    enr.eligibility_status = EligibilityStatus.EXEMPTED
    enr.exemption_reason = payload.remarks
    db.commit()
    db.refresh(enr)

    log_action(
        db, action=AuditActions.CYCLE_ADDITION_APPROVED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={"cycle_id": cycle_id, "project_name": project.project_name if project else None, "remarks": payload.remarks, "via": "enrollment_review"},
    )

    try:
        notify_qm_of_management_enrollment_exemption_decision(
            local_db=db, cycle_id=cycle_id, qm_emp_id=enr.quality_recheck_by,
            project_name=project.project_name, project_id=project.id, enrollment_id=enr.id,
            decided_by_name=current_user.get("name") or current_user["emp_id"], remarks=payload.remarks,
            actor_emp_id=current_user["emp_id"],
        )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify QM of second-level exemption decision on enrollment {enr.id}: {e}")

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
    return _enrollment_to_response(enr, project, pm_info, current_user)


@router.post("/{cycle_id}/projects/{enrollment_id}/decline-addition")
def decline_addition(
    cycle_id: int,
    enrollment_id: int,
    payload: DeclineAdditionRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    """Management doesn't confirm the exemption — it goes back to the
    Manager for a fresh decision. A reason is mandatory, same as every
    other step in this chain."""
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    _assert_can_decide_addition(current_user)

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW:
        raise HTTPException(status_code=400, detail="This project isn't awaiting your second-level exemption approval.")
    if not (payload.remarks or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject the exemption.")

    enr.addition_approval_status = AdditionApprovalStatus.PENDING_MANAGER_REVIEW
    enr.addition_approved_by = current_user["emp_id"]
    enr.addition_approved_at = datetime.utcnow()
    enr.addition_decision_remarks = payload.remarks
    enr.exemption_reason = None

    db.commit()
    db.refresh(enr)

    log_action(
        db, action=AuditActions.CYCLE_ADDITION_DECLINED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={"cycle_id": cycle_id, "project_name": project.project_name if project else None, "remarks": payload.remarks, "via": "enrollment_review"},
    )

    try:
        notify_manager_and_qm_of_management_enrollment_rejection(
            local_db=db, cycle_id=cycle_id, manager_emp_id=enr.manager_emp_id, qm_emp_id=enr.quality_recheck_by,
            project_name=project.project_name, project_id=project.id, enrollment_id=enr.id,
            decided_by_name=current_user.get("name") or current_user["emp_id"], remarks=payload.remarks,
            actor_emp_id=current_user["emp_id"],
        )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify of second-level exemption rejection on enrollment {enr.id}: {e}")

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
    return _enrollment_to_response(enr, project, pm_info, current_user)

# ─────────────────────────────────────────────────────────────────────────────
# POST /{cycle_id}/projects/{enrollment_id}/manager-decide — the project's
# own Manager reviews an enrollment Quality marked eligible
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{cycle_id}/projects/{enrollment_id}/manager-decide", response_model=EnrolledProjectResponse)
def manager_decide_enrollment(
    cycle_id: int,
    enrollment_id: int,
    payload: ManagerCycleDecisionRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGER")),
):
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING_MANAGER_REVIEW:
        raise HTTPException(status_code=400, detail="This project isn't awaiting your review.")
    if enr.manager_emp_id != current_user["emp_id"]:
        raise HTTPException(status_code=403, detail="You can only decide on projects you're the assigned Manager for.")
    if payload.decision == EnrollTriageAction.EXEMPTED and not (payload.exemption_reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject this project's eligibility.")

    decided_by_name = current_user.get("name") or current_user["emp_id"]
    enr.manager_decided_by = current_user["emp_id"]
    enr.manager_decided_at = datetime.utcnow()

    if payload.decision == EnrollTriageAction.EXEMPTED:
        # Rejecting eligibility is treated exactly like exempting it
        # outright — same downstream workflow either way: off to QM
        # (Quality) for their approval/rejection of the exemption.
        enr.addition_approval_status = AdditionApprovalStatus.PENDING_QUALITY_RECHECK
        enr.exemption_reason = payload.exemption_reason
    else:
        enr.addition_approval_status = AdditionApprovalStatus.APPROVED
        enr.addition_approved_by = current_user["emp_id"]
        enr.addition_approved_at = datetime.utcnow()
        enr.exemption_reason = None

    db.commit()
    db.refresh(enr)

    log_action(
        db, action=AuditActions.CYCLE_ADDITION_APPROVED if payload.decision == EnrollTriageAction.ELIGIBLE else AuditActions.CYCLE_ADDITION_DECLINED,
        actor_emp_id=current_user["emp_id"], actor_name=decided_by_name,
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={"cycle_id": cycle_id, "project_name": project.project_name if project else None, "via": "manager_decide", "remarks": payload.exemption_reason},
    )

    try:
        if enr.addition_approval_status == AdditionApprovalStatus.PENDING_QUALITY_RECHECK:
            notify_quality_enrollment_needs_recheck(
                local_db=db, cycle_id=cycle_id, project_name=project.project_name,
                project_id=project.id, enrollment_id=enr.id, enrolled_by_emp_id=enr.enrolled_by,
                manager_name=decided_by_name, exemption_reason=payload.exemption_reason or "",
                actor_emp_id=current_user["emp_id"],
            )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify for manager decision on enrollment {enr.id}: {e}")

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
    return _enrollment_to_response(enr, project, pm_info, current_user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /{cycle_id}/projects/{enrollment_id}/quality-recheck — Quality
# rechecks an enrollment the Manager just exempted
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{cycle_id}/projects/{enrollment_id}/quality-recheck", response_model=EnrolledProjectResponse)
def quality_recheck_enrollment(
    cycle_id: int,
    enrollment_id: int,
    payload: QualityCycleRecheckRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY")),
):
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING_QUALITY_RECHECK:
        raise HTTPException(status_code=400, detail="This project isn't awaiting a QM decision.")
    if not (payload.exemption_reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required, whether approving or rejecting the exemption.")

    decided_by_name = current_user.get("name") or current_user["emp_id"]
    enr.quality_recheck_by = current_user["emp_id"]
    enr.quality_recheck_at = datetime.utcnow()

    if payload.decision == EnrollTriageAction.EXEMPTED:
        # QM APPROVES the exemption — not final yet, goes to Management for
        # a second-level approval.
        enr.addition_approval_status = AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW
        enr.exemption_reason = payload.exemption_reason
    else:
        # QM REJECTS the exemption — straight back to the Manager.
        enr.addition_approval_status = AdditionApprovalStatus.PENDING_MANAGER_REVIEW
        enr.exemption_reason = None
        enr.addition_decision_remarks = payload.exemption_reason

    db.commit()
    db.refresh(enr)

    log_action(
        db, action=AuditActions.CYCLE_ADDITION_APPROVED if payload.decision == EnrollTriageAction.ELIGIBLE else AuditActions.CYCLE_ADDITION_DECLINED,
        actor_emp_id=current_user["emp_id"], actor_name=decided_by_name,
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={"cycle_id": cycle_id, "project_name": project.project_name if project else None, "via": "quality_recheck", "remarks": payload.exemption_reason},
    )

    try:
        if enr.addition_approval_status == AdditionApprovalStatus.PENDING_MANAGEMENT_REVIEW:
            notify_management_enrollment_second_level_review(
                local_db=db, cycle_id=cycle_id, project_name=project.project_name,
                project_id=project.id, enrollment_id=enr.id,
                qm_name=decided_by_name, exemption_reason=payload.exemption_reason,
                actor_emp_id=current_user["emp_id"],
            )
        else:
            notify_manager_of_qm_enrollment_exemption_rejection(
                local_db=db, cycle_id=cycle_id, manager_emp_id=enr.manager_emp_id,
                project_name=project.project_name, project_id=project.id, enrollment_id=enr.id,
                qm_name=decided_by_name, rejection_reason=payload.exemption_reason,
                actor_emp_id=current_user["emp_id"],
            )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify for quality recheck on enrollment {enr.id}: {e}")

    pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
    return _enrollment_to_response(enr, project, pm_info, current_user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /{cycle_id}/projects/{enrollment_id}/decide-exemption — Management
# approves or rejects Quality's exemption request
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{cycle_id}/projects/{enrollment_id}/decide-exemption", response_model=EnrolledProjectResponse)
def decide_enrollment_exemption(
    cycle_id: int,
    enrollment_id: int,
    payload: ManagementCycleExemptionDecisionRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    """
    approve=True  -> confirms the exemption; final Declined/Exempted.
    approve=False -> rejects the exemption; Quality wanted this project
    exempt but Management disagrees — that's a genuine conflict, so it goes
    to the project's own Manager to make the actual call (or straight to
    Approved if it somehow has no Manager in TMS at all). Whenever Quality
    and Management disagree, the Manager is always the tie-breaker.
    """
    enr = _get_enrollment_or_404(enrollment_id, cycle_id, db)
    project = db.query(Project).filter(Project.id == enr.project_id).first()

    if enr.addition_approval_status != AdditionApprovalStatus.PENDING_MANAGEMENT_EXEMPTION_REVIEW:
        raise HTTPException(status_code=400, detail="This project isn't awaiting an exemption decision.")
    if not (payload.remarks or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required, whether approving or rejecting the exemption.")

    decided_by_name = current_user.get("name") or current_user["emp_id"]
    enr.addition_approved_by = current_user["emp_id"]
    enr.addition_approved_at = datetime.utcnow()
    enr.addition_decision_remarks = payload.remarks

    pm_info = None
    if payload.approve:
        enr.addition_approval_status = AdditionApprovalStatus.DECLINED
        enr.eligibility_status = EligibilityStatus.EXEMPTED
        # Quality's original reason stands — remarks are supplementary context.
    else:
        try:
            pm_info = get_project_manager(_safe_int(project.project_id), tms_db) if _safe_int(project.project_id) else None
        except Exception as e:
            print(f"[WARN] Could not resolve PM for enrollment {enr.id}: {e}")
        enr.exemption_reason = None
        if pm_info:
            enr.addition_approval_status = AdditionApprovalStatus.PENDING_MANAGER_REVIEW
            enr.manager_emp_id = pm_info["emp_id"]
        else:
            # No Manager on file at all — nobody left to break the tie, so
            # it goes straight to Approved rather than getting stuck.
            enr.addition_approval_status = AdditionApprovalStatus.APPROVED
            enr.manager_emp_id = None

    db.commit()
    db.refresh(enr)

    log_action(
        db, action=AuditActions.CYCLE_ADDITION_APPROVED if payload.approve else AuditActions.CYCLE_ADDITION_DECLINED,
        actor_emp_id=current_user["emp_id"], actor_name=decided_by_name,
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="cycle_project_enrollment", entity_id=enr.id,
        details={"cycle_id": cycle_id, "project_name": project.project_name if project else None, "remarks": payload.remarks, "via": "exemption_decision"},
    )

    try:
        notify_quality_of_enrollment_exemption_decision(
            local_db=db, cycle_id=cycle_id, project_name=project.project_name,
            project_id=project.id, enrollment_id=enr.id, enrolled_by_emp_id=enr.enrolled_by,
            exemption_approved=payload.approve, decided_by_name=decided_by_name,
            actor_emp_id=current_user["emp_id"], remarks=payload.remarks,
        )
        if enr.addition_approval_status == AdditionApprovalStatus.PENDING_MANAGER_REVIEW:
            notify_manager_enrollment_needs_review(
                local_db=db, manager_emp_id=enr.manager_emp_id, cycle_id=cycle_id,
                project_name=project.project_name, project_id=project.id,
                enrollment_id=enr.id, enrolled_by_name=decided_by_name,
                actor_emp_id=current_user["emp_id"],
            )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify for exemption decision on enrollment {enr.id}: {e}")

    return _enrollment_to_response(enr, project, pm_info, current_user)


# ─────────────────────────────────────────────────────────────────────────────
# GET /{cycle_id}/audit-report — every project in this cycle (added AND
# exempted), each with its final outcome and a full chronological reason
# trail: every decision made on it, by whom, and why — sourced from
# audit_logs (already being written at every step in this chain, in both
# this file and project_staging.py) rather than a new table. Solves the
# "we can see it's exempted but not why, or who decided what along the
# way" gap — the individual reason fields on the enrollment/staging rows
# only ever hold the LATEST value at each stage, since a project can pass
# through Manager -> QM -> Management more than once and each new decision
# overwrites the last. audit_logs already has every one of those as its
# own row, so this just assembles them per project instead of storing
# anything new.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{cycle_id}/audit-report")
def get_cycle_audit_report(
    cycle_id: int,
    outcome: Optional[str] = Query(None, description="Filter to 'added' or 'exempted' only"),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT", "MANAGER")),
):
    cycle = _get_cycle_or_404(cycle_id, db)

    rows = (
        db.query(CycleProjectEnrollment, Project)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .filter(CycleProjectEnrollment.cycle_id == cycle_id)
        .all()
    )
    if not rows:
        return {"cycle_id": cycle_id, "cycle_name": cycle.cycle_name, "total": 0, "added": 0, "exempted": 0, "projects": []}

    # The staging row this enrollment was carried forward from, if any —
    # some enrollments are added directly to an existing cycle later and
    # never had one. Matched by project_id + converted_cycle_id since
    # there's no direct FK either way between the two tables.
    project_ids = [proj.id for _, proj in rows]
    staging_by_project = {
        s.project_id: s
        for s in db.query(ProjectStaging).filter(
            ProjectStaging.project_id.in_(project_ids),
            ProjectStaging.converted_cycle_id == cycle_id,
        ).all()
    }

    # One batched audit_logs query covering every enrollment AND every
    # matched staging row, instead of two queries per project.
    enrollment_ids = [str(enr.id) for enr, _ in rows]
    staging_ids = [str(s.id) for s in staging_by_project.values()]
    entity_filter = (
        (AuditLog.entity_type == "cycle_project_enrollment") & (AuditLog.entity_id.in_(enrollment_ids))
    )
    if staging_ids:
        entity_filter = entity_filter | (
            (AuditLog.entity_type == "project_staging") & (AuditLog.entity_id.in_(staging_ids))
        )
    log_rows = db.query(AuditLog).filter(
        AuditLog.success == True,  # noqa: E712
        entity_filter,
    ).order_by(AuditLog.created_at.asc()).all()

    logs_by_enrollment: dict[str, list[AuditLog]] = {}
    logs_by_staging: dict[str, list[AuditLog]] = {}
    for log in log_rows:
        if log.entity_type == "cycle_project_enrollment":
            logs_by_enrollment.setdefault(log.entity_id, []).append(log)
        elif log.entity_type == "project_staging":
            logs_by_staging.setdefault(log.entity_id, []).append(log)

    def _parse_details(raw: Optional[str]) -> dict:
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return {}

    def _decision_label(action: str, details: dict) -> str:
        """Translates the raw AuditActions constant + internal 'via'/
        'decision' tags into a plain sentence fragment for display —
        auditors shouldn't have to know what PROJECT_STAGING_TRIAGED or
        pending_quality_recheck mean. Every decision point in this chain
        logs one of a small number of shapes; this just names each one.
        """
        via = details.get("via")
        decision = details.get("decision")  # only ever present on PROJECT_STAGING_TRIAGED entries

        if action == "PROJECT_STAGING_TRIAGED":
            if via in ("manager_self_select", "manager_decide"):
                return "Marked Eligible" if decision == "eligible" else "Marked Exempt"
            if via == "quality_recheck":
                return "Approved Exemption" if decision == "pending_management_review" else "Rejected Exemption"
            # via is empty on Quality's very first pick (POST /select)
            return "Marked Eligible" if decision == "eligible" else "Requested Exemption"

        if action in ("CYCLE_ADDITION_APPROVED", "CYCLE_ADDITION_DECLINED"):
            approved = action == "CYCLE_ADDITION_APPROVED"
            if via == "manager_decide":
                return "Marked Eligible" if approved else "Marked Exempt"
            if via == "quality_recheck":
                # QM's "Reject Exemption" reaffirms eligible -> logged as
                # APPROVED here; "Approve Exemption" -> logged as DECLINED.
                return "Rejected Exemption" if approved else "Approved Exemption"
            if via in ("exemption_decision", "staging_review", "enrollment_review"):
                return "Approved Exemption" if approved else "Rejected Exemption"
            return "Approved" if approved else "Declined"

        if action == "PROJECT_ENROLLED":
            outcome = details.get("outcome")
            if outcome == "manager_self_exempt":
                return "Marked Exempt"
            if outcome == "exemption_requested":
                return "Requested Exemption"
            return "Added to Cycle"
        if action == "CSAT_CYCLE_CREATED":
            return "Cycle Created"
        if action == "CYCLE_ELIGIBILITY_CHANGED":
            return "Eligibility Changed"

        return action.replace("_", " ").title()

    def _timeline_entry(log: AuditLog) -> dict:
        details = _parse_details(log.details)
        # Only ever a real typed-in reason — never the raw status code that
        # 'decision' holds, which isn't a reason and shouldn't display as one.
        # Different call sites stash this under different keys ("remarks",
        # "exemption_reason", or plain "reason" — e.g. CYCLE_ELIGIBILITY_CHANGED),
        # so check all three.
        reason = details.get("remarks") or details.get("exemption_reason") or details.get("reason")
        return {
            "at": log.created_at,
            "actor_name": log.actor_name or log.actor_emp_id,
            "actor_role": log.actor_role,
            "action": _decision_label(log.action, details),
            "reason": reason,
        }

    projects_out = []
    added_count = 0
    exempted_count = 0

    for enr, proj in rows:
        is_exempted = enr.eligibility_status == EligibilityStatus.EXEMPTED
        if is_exempted:
            exempted_count += 1
        else:
            added_count += 1

        staging = staging_by_project.get(proj.id)
        timeline = []
        if staging:
            timeline.extend(_timeline_entry(l) for l in logs_by_staging.get(str(staging.id), []))
        timeline.extend(_timeline_entry(l) for l in logs_by_enrollment.get(str(enr.id), []))
        timeline.sort(key=lambda t: t["at"])

        projects_out.append({
            "project_id": proj.id,
            "project_name": proj.project_name,
            "final_status": "exempted" if is_exempted else "added",
            "current_reason": enr.exemption_reason,
            "timeline": timeline,
        })

    if outcome in ("added", "exempted"):
        projects_out = [p for p in projects_out if p["final_status"] == outcome]

    return {
        "cycle_id": cycle_id,
        "cycle_name": cycle.cycle_name,
        "total": len(rows),
        "added": added_count,
        "exempted": exempted_count,
        "projects": projects_out,
    }
"""
Project Staging — pre-cycle project selection and triage.

Workflow:
  1. Quality browses candidate TMS projects (GET /candidates) — active
     projects first, then completed projects whose EndDate falls within the
     last 6 months.
  2. Quality triages each selected project (POST /select) as one of:
       - eligible   → ready to go straight into the next cycle
       - not_sure   → sent to Management to decide (POST /{id}/decide)
       - exempted   → excluded from the pool entirely
  3. Management approves/declines "not sure" projects. Approve → eligible.
     Decline → exempted.
  4. Once Quality has the eligible set they want, POST /create-cycle creates
     a new CSAT cycle and enrolls all currently-eligible staged projects
     into it directly (already vetted here — no second addition-approval
     round needed).

This is a separate, earlier stage from the in-cycle addition-approval flow
(cycle_notification_service.py / enroll_projects) — that one is unchanged
and still applies when adding MORE projects to an ALREADY-EXISTING cycle
later. This one only ever involves Management, never a project's Manager
(PM) — Managers have no role in the initial project-pool triage.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, date, timezone
from typing import Optional

from app.database import get_local_db, get_tms_db
from app.core.dependencies import get_current_user, require_role
from app.models.project import Project
from app.models.project_staging import ProjectStaging, StagingStatus
from app.models.cycle_project_enrollment import CycleProjectEnrollment, EligibilityStatus, AdditionApprovalStatus
from app.models.csat_cycle import CSATCycle
from app.schemas.project_staging import (
    SelectProjectsRequest, TriageAction, ManagementStagingDecisionRequest,
    StagedProjectResponse, StagingCandidateResponse, CreateCycleFromStagingRequest,
)
from app.routers.csat_cycles import _half_dates, _cycle_resp
from app.services.staging_notification_service import (
    notify_management_project_needs_review, notify_quality_of_decision, notify_pm_project_triaged,
)
from app.services.cycle_notification_service import notify_project_added_to_cycle
from app.services.audit_service import log_action, get_client_ip
from app.schemas.audit import AuditActions

router = APIRouter()


def _current_half(today: date) -> tuple[int, str]:
    """Which half-year (matching CSATCycle's own H1/H2 boundaries) today falls in."""
    if 4 <= today.month <= 9:
        return today.year, "H1"          # Apr 1 – Sep 30
    elif today.month >= 10:
        return today.year, "H2"          # Oct 1 (this year) – Mar 31 (next year)
    else:
        return today.year - 1, "H2"      # Jan–Mar: still inside the H2 that started last October


def _preceding_half(year: int, half: str) -> tuple[int, str]:
    """The half-year immediately before the given one."""
    return (year - 1, "H2") if half == "H1" else (year, "H1")


def _resolve_names(db: Session, emp_ids: list[str]) -> dict[str, str]:
    """emp_id -> display name, resolved from csat_users. Falls back to the
    emp_id itself for anyone not found (e.g. left the company, bad data)."""
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


def _staging_to_response(s: ProjectStaging, project: Project, name_map: Optional[dict] = None) -> StagedProjectResponse:
    name_map = name_map or {}
    return StagedProjectResponse(
        staging_id=s.id,
        project_id=project.id,
        project_ext_id=project.project_id,
        project_name=project.project_name,
        is_active=project.is_active,
        status=s.status,
        selected_by=name_map.get(s.selected_by, s.selected_by),
        selected_at=s.selected_at,
        decided_by=name_map.get(s.decided_by, s.decided_by) if s.decided_by else None,
        decided_at=s.decided_at,
        decision_remarks=s.decision_remarks,
    )


def _upsert_project(db: Session, tms_db: Session, tms_id: int) -> Project:
    """Same upsert pattern used in csat_cycles.enroll_projects — kept local
    here rather than imported, since it's a small, self-contained helper."""
    tms_row = None
    try:
        result = tms_db.execute(
            text("SELECT Id, Name, IsProjectActive FROM tsms_projects WHERE Id = :id LIMIT 1"),
            {"id": tms_id},
        )
        tms_row = result.fetchone()
    except Exception:
        pass

    project = db.query(Project).filter(Project.project_id == str(tms_id)).first()
    if project is None:
        project = Project(
            project_id=str(tms_id),
            project_name=tms_row.Name if tms_row else f"Project {tms_id}",
            is_active=bool(tms_row.IsProjectActive) if tms_row else True,
        )
        db.add(project)
        db.flush()
    elif tms_row:
        project.is_active = bool(tms_row.IsProjectActive)
    return project


# Shared PM join — same OR-match pattern used across the TMS integration
# (PmId can reference EmpId, FinanceId, or UserId depending on how it was set)
_PM_JOIN = """
    LEFT JOIN tsms_user pm
        ON p.PmId = pm.EmpId OR p.PmId = pm.FinanceId OR p.PmId = pm.UserId
"""
_PM_SELECT = """
    pm.EmpId AS pm_emp_id,
    CONCAT_WS(' ', pm.EmpFirstName, pm.EmpLastName) AS pm_name
"""

# "Active" / "completed" here are date-based — NOT the TMS IsProjectActive
# flag, which is unreliable (see ProjectListPage.tsx's deriveStatus, which
# this mirrors, including the 2099 sentinel TMS uses for test/placeholder
# projects — those are excluded from both buckets entirely, not counted as
# active forever).
#
# "Active" requires BOTH a real StartDate and EndDate, with today actually
# falling inside that window — a project with no dates at all isn't active,
# it's just missing data (common in this dummy dataset; the real TMS data
# this is meant to run against should have both set on any real project).
#
# Written as range comparisons rather than YEAR(...)/wrapped-column
# expressions on purpose — MySQL can't use a B-tree index on EndDate/StartDate
# through a function call, so YEAR(p.EndDate) != 2099 forces a full scan no
# matter what indexes exist. A plain range comparison can use one.
_NOT_TESTING = "(p.EndDate < '2099-01-01' OR p.EndDate >= '2100-01-01')"
_ACTIVE_WHERE = f"""(
    p.StartDate IS NOT NULL AND p.EndDate IS NOT NULL
    AND p.StartDate <= :today AND p.EndDate >= :today
    AND {_NOT_TESTING}
)"""
_COMPLETED_BASE_WHERE = f"p.StartDate IS NOT NULL AND p.EndDate IS NOT NULL AND p.EndDate < :today AND {_NOT_TESTING}"


def _build_filters(search: Optional[str], year: Optional[int]) -> tuple[str, dict]:
    """Filters that don't need the PM join — kept separate from the `pm`
    filter itself so COUNT queries can apply search/year without paying for
    the join at all when nobody's filtering by manager."""
    clauses = []
    params: dict = {}
    if search:
        clauses.append("p.Name LIKE :search")
        params["search"] = f"%{search}%"
    if year:
        # Range comparison, not YEAR(p.StartDate) = :year — same reasoning
        # as _NOT_TESTING above; this can actually use an index on StartDate.
        clauses.append("p.StartDate >= :year_start AND p.StartDate < :year_end")
        params["year_start"] = date(year, 1, 1)
        params["year_end"] = date(year + 1, 1, 1)
    return ("AND " + " AND ".join(clauses)) if clauses else "", params


def _pm_filter_clause(pm: Optional[str]) -> tuple[str, dict]:
    """The one filter that DOES need the PM join. Isolated so callers can
    decide whether to pay for the join based on whether this is non-empty."""
    if not pm:
        return "", {}
    return "AND pm.EmpId = :pm", {"pm": pm}


# ─────────────────────────────────────────────────────────────────────────────
# GET /managers — distinct project managers across all TMS projects, for the
# PM filter dropdown. Independent of pagination/filters on /candidates so the
# dropdown always lists every PM, not just ones on the current page.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/managers")
def list_project_managers(
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    rows = tms_db.execute(
        text(f"""
            SELECT DISTINCT {_PM_SELECT}
            FROM tsms_projects p
            {_PM_JOIN}
            WHERE pm.EmpId IS NOT NULL
            ORDER BY pm_name
        """)
    ).fetchall()
    return [{"emp_id": r.pm_emp_id, "name": (r.pm_name or "").strip()} for r in rows if (r.pm_name or "").strip()]


def _fetch_page_with_total(
    tms_db: Session, where_sql: str, order_by: str, params: dict, limit: int, skip: int,
) -> tuple[list, int]:
    """
    One round trip instead of two: COUNT(*) OVER() rides along with the page
    of rows, instead of a separate COUNT(*) query before the SELECT. Halves
    the number of TMS round trips per bucket (active/completed each used to
    run a count query AND a select query; now it's one query each).

    Falls back to a plain COUNT if the page is empty (e.g. skip landed past
    the end of a shrunk result set) — COUNT(*) OVER() can't report a total
    from zero rows, so that's the one case still needing a second query.
    """
    sql = text(f"""
        SELECT p.Id AS project_ext_id, p.Name AS project_name, p.EndDate AS end_date,
               p.StartDate AS start_date, {_PM_SELECT},
               COUNT(*) OVER() AS total_count
        FROM tsms_projects p
        {_PM_JOIN}
        {where_sql}
        ORDER BY {order_by}
        LIMIT :limit OFFSET :skip
    """)
    rows = tms_db.execute(sql, {**params, "limit": limit, "skip": skip}).fetchall()
    if rows:
        return rows, rows[0].total_count

    total = tms_db.execute(
        text(f"SELECT COUNT(*) AS n FROM tsms_projects p {_PM_JOIN} {where_sql}"),
        params,
    ).fetchone().n
    return [], total


# ─────────────────────────────────────────────────────────────────────────────
# GET /candidates — browsable TMS projects: active first, then completed
# within the half-year immediately preceding the one we're currently in.
# e.g. selecting during H1 (Apr–Sep) shows projects completed in the prior
# H2 (Oct–Mar); selecting during H2 shows projects completed in that year's
# H1. Merged with current staging status, if any, plus PM/start date so the
# frontend can filter by project manager and year.
#
# Both buckets are paginated and filtered server-side — TMS has thousands of
# projects, so loading "all of them" into the browser and filtering there
# (as an earlier version of this endpoint did) stops working at any real scale.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/candidates")
def list_candidates(
    search: Optional[str] = Query(None),
    pm: Optional[str] = Query(None, description="Filter by project manager emp_id"),
    year: Optional[int] = Query(None, description="Filter by project start year"),
    active_skip: int = Query(0, ge=0),
    active_limit: int = Query(50, ge=1, le=200),
    completed_skip: int = Query(0, ge=0),
    completed_limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(get_current_user),
):
    filter_clause, filter_params = _build_filters(search, year)
    pm_clause, pm_params = _pm_filter_clause(pm)
    filter_clause = f"{filter_clause} {pm_clause}"
    filter_params = {**filter_params, **pm_params}

    today = datetime.now(timezone.utc).date()
    cur_year, cur_half = _current_half(today)
    prev_year, prev_half = _preceding_half(cur_year, cur_half)
    window_start, window_end = _half_dates(prev_year, prev_half)

    # Once a candidate has been triaged at all — eligible, sent to
    # Management, or exempted — it's left the raw browsing pool and belongs
    # in one of the tracked sections above (Ready for next cycle / With
    # Management / hidden-if-exempted) instead. Only exempted used to be
    # excluded here, which meant an already-decided "eligible" or
    # "pending_management_review" project kept reappearing in Active/
    # Completed underneath the section it was already sitting in.
    already_triaged_ids = [
        row.project_ext_id for row in
        db.query(ProjectStaging.project_ext_id).filter(
            ProjectStaging.converted_cycle_id.is_(None),
        ).all()
    ]
    already_triaged_ids_int = [int(x) for x in already_triaged_ids if str(x).isdigit()]
    exempt_clause = ""
    exempt_params: dict = {}
    if already_triaged_ids_int:
        exempt_clause = "AND p.Id NOT IN :exempted_ids"
        exempt_params = {"exempted_ids": tuple(already_triaged_ids_int)}
    filter_clause = f"{filter_clause} {exempt_clause}"
    filter_params = {**filter_params, **exempt_params}

    base_params = {"today": today, **filter_params}

    active_where = f"WHERE {_ACTIVE_WHERE} {filter_clause}"
    active_rows, active_total = _fetch_page_with_total(
        tms_db, active_where, "p.Name", base_params, active_limit, active_skip,
    )

    completed_where = f"""
        WHERE {_COMPLETED_BASE_WHERE}
          AND p.EndDate >= :window_start
          AND p.EndDate <= :window_end
          {filter_clause}
    """
    completed_params = {**base_params, "window_start": window_start.date(), "window_end": window_end.date()}
    completed_rows, completed_total = _fetch_page_with_total(
        tms_db, completed_where, "p.EndDate DESC", completed_params, completed_limit, completed_skip,
    )

    # Merge in any current (non-converted) staging status for these projects
    all_ext_ids = [str(r.project_ext_id) for r in active_rows] + [str(r.project_ext_id) for r in completed_rows]
    staging_rows = []
    if all_ext_ids:
        staging_rows = db.query(ProjectStaging).filter(
            ProjectStaging.project_ext_id.in_(all_ext_ids),
            ProjectStaging.converted_cycle_id.is_(None),
        ).all()
    staging_map = {s.project_ext_id: s for s in staging_rows}

    def _to_candidate(row, bucket: str) -> StagingCandidateResponse:
        ext_id = str(row.project_ext_id)
        s = staging_map.get(ext_id)
        return StagingCandidateResponse(
            project_ext_id=ext_id,
            project_name=row.project_name,
            is_active=(bucket == "active"),
            end_date=row.end_date.isoformat() if row.end_date else None,
            start_date=row.start_date.isoformat() if row.start_date else None,
            bucket=bucket,
            staging_status=s.status if s else None,
            staging_id=s.id if s else None,
            project_manager_emp_id=row.pm_emp_id,
            project_manager_name=(row.pm_name or "").strip() or None,
        )

    return {
        "active": [_to_candidate(r, "active") for r in active_rows],
        "active_total": active_total,
        "completed": [_to_candidate(r, "completed") for r in completed_rows],
        "completed_total": completed_total,
        "completed_window": {"start": window_start.date().isoformat(), "end": window_end.date().isoformat()},
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET / — current staging pool (not yet converted into a cycle)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/", response_model=list[StagedProjectResponse])
def list_staging_pool(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(get_current_user),
):
    q = (
        db.query(ProjectStaging, Project)
        .join(Project, Project.id == ProjectStaging.project_id)
        .filter(ProjectStaging.converted_cycle_id.is_(None))
    )
    if status_filter:
        q = q.filter(ProjectStaging.status == status_filter)

    rows = q.order_by(ProjectStaging.selected_at.desc()).all()
    name_map = _resolve_names(
        db,
        [s.selected_by for s, _ in rows] + [s.decided_by for s, _ in rows if s.decided_by],
    )
    return [_staging_to_response(s, p, name_map) for s, p in rows]


# ─────────────────────────────────────────────────────────────────────────────
# POST /select — Quality/Management triage a batch of candidate projects
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/select")
def select_projects(
    payload: SelectProjectsRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    selected = []
    skipped = []
    warnings = []
    triaged_this_call: list[tuple[int, str, str]] = []  # (staging_id, project_name, action)
    selected_by_name = current_user.get("name") or current_user["emp_id"]

    for item in payload.items:
        # Management is the highest authority in this workflow — "not sure"
        # exists to escalate to Management, which is meaningless when
        # Management is the one triaging it. The frontend already hides this
        # option for them; this is the same rule enforced server-side.
        if item.action == TriageAction.NOT_SURE and current_user["role"] == "MANAGEMENT":
            skipped.append({
                "tms_project_id": item.tms_project_id,
                "reason": "Management can't mark a project 'not sure' — decide Eligible or Exempt directly.",
            })
            continue

        project = _upsert_project(db, tms_db, item.tms_project_id)

        existing = db.query(ProjectStaging).filter(
            ProjectStaging.project_id == project.id,
            ProjectStaging.converted_cycle_id.is_(None),
        ).first()

        if existing and existing.status == StagingStatus.PENDING_MANAGEMENT_REVIEW:
            skipped.append({
                "tms_project_id": item.tms_project_id,
                "reason": "already sent to Management for review — wait for their decision",
            })
            continue

        new_status = {
            TriageAction.ELIGIBLE: StagingStatus.ELIGIBLE,
            TriageAction.EXEMPTED: StagingStatus.EXEMPTED,
            TriageAction.NOT_SURE: StagingStatus.PENDING_MANAGEMENT_REVIEW,
        }[item.action]

        if existing:
            existing.status = new_status
            existing.selected_by = current_user["emp_id"]
            existing.decided_by = None
            existing.decided_at = None
            existing.decision_remarks = None
            staging_row = existing
        else:
            staging_row = ProjectStaging(
                project_id=project.id,
                project_ext_id=project.project_id,
                status=new_status,
                selected_by=current_user["emp_id"],
            )
            db.add(staging_row)

        db.flush()
        selected.append(item.tms_project_id)
        triaged_this_call.append((staging_row.id, project.project_name, item.action.value))

        if item.action == TriageAction.NOT_SURE:
            try:
                notify_management_project_needs_review(
                    local_db=db,
                    project_name=project.project_name,
                    project_id=project.id,
                    staging_id=staging_row.id,
                    selected_by_name=selected_by_name,
                    actor_emp_id=current_user["emp_id"],
                )
            except Exception as e:
                # Previously this only printed to the server console, which
                # nobody watching the UI would ever see — the project still
                # got triaged correctly, but Management silently never heard
                # about it. Now it comes back in the response too.
                print(f"[WARN] Failed to notify Management for staging {staging_row.id}: {e}")
                warnings.append({
                    "tms_project_id": item.tms_project_id,
                    "reason": "Saved, but notifying Management failed — they won't see this in their bell yet.",
                })

        # ── Notify the project's own Manager (PM) directly ─────────────────
        # A final triage decision (eligible / exempted) is about THEIR
        # project, so they should hear about it even though they have no
        # say in the decision itself. Skipped for 'not_sure' — there's no
        # final outcome yet for the PM to be told about until Management
        # decides (see notify_quality_of_decision, called from /decide).
        elif item.action in (TriageAction.ELIGIBLE, TriageAction.EXEMPTED):
            try:
                notify_pm_project_triaged(
                    local_db=db,
                    tms_db=tms_db,
                    project_name=project.project_name,
                    project_id=project.id,
                    project_ext_id=project.project_id,
                    staging_id=staging_row.id,
                    decision=new_status.value,
                    triaged_by_name=selected_by_name,
                    actor_emp_id=current_user["emp_id"],
                )
            except Exception as e:
                print(f"[WARN] Failed to notify PM for staging {staging_row.id}: {e}")
                warnings.append({
                    "tms_project_id": item.tms_project_id,
                    "reason": "Saved, but notifying the project's Manager failed — they won't see this in their bell yet.",
                })

    db.commit()

    ip = get_client_ip(request)
    for staging_id, project_name, action_taken in triaged_this_call:
        log_action(
            db, action=AuditActions.PROJECT_STAGING_TRIAGED,
            actor_emp_id=current_user["emp_id"], actor_name=selected_by_name,
            actor_role=current_user["role"], ip_address=ip,
            entity_type="project_staging", entity_id=staging_id,
            details={"project_name": project_name, "decision": action_taken},
        )

    return {"selected": selected, "skipped": skipped, "warnings": warnings}


# ─────────────────────────────────────────────────────────────────────────────
# POST /{staging_id}/decide — Management approves/declines a "not sure" project
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{staging_id}/decide", response_model=StagedProjectResponse)
def decide_staged_project(
    staging_id: int,
    payload: ManagementStagingDecisionRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    staging_row = db.query(ProjectStaging).filter(ProjectStaging.id == staging_id).first()
    if not staging_row:
        raise HTTPException(status_code=404, detail="Staged project not found")
    if staging_row.status != StagingStatus.PENDING_MANAGEMENT_REVIEW:
        raise HTTPException(status_code=400, detail="This project isn't awaiting management review.")

    staging_row.status = StagingStatus.ELIGIBLE if payload.approve else StagingStatus.EXEMPTED
    staging_row.decided_by = current_user["emp_id"]
    staging_row.decided_at = datetime.utcnow()
    staging_row.decision_remarks = payload.remarks

    db.commit()
    db.refresh(staging_row)
    project = db.query(Project).filter(Project.id == staging_row.project_id).first()

    log_action(
        db,
        action=AuditActions.CYCLE_ADDITION_APPROVED if payload.approve else AuditActions.CYCLE_ADDITION_DECLINED,
        actor_emp_id=current_user["emp_id"], actor_name=current_user.get("name"),
        actor_role=current_user["role"], ip_address=get_client_ip(request),
        entity_type="project_staging", entity_id=staging_row.id,
        details={"project_name": project.project_name if project else None, "remarks": payload.remarks, "via": "staging_review"},
    )

    try:
        notify_quality_of_decision(
            local_db=db,
            project_name=project.project_name,
            project_id=project.id,
            staging_id=staging_row.id,
            selected_by_emp_id=staging_row.selected_by,
            approved=payload.approve,
            decided_by_name=current_user.get("name") or current_user["emp_id"],
            actor_emp_id=current_user["emp_id"],
            remarks=payload.remarks,
        )
        db.commit()
    except Exception as e:
        print(f"[WARN] Failed to notify {staging_row.selected_by} of decision on staging {staging_row.id}: {e}")

    name_map = _resolve_names(db, [staging_row.selected_by, staging_row.decided_by])
    return _staging_to_response(staging_row, project, name_map)


# ─────────────────────────────────────────────────────────────────────────────
# POST /create-cycle — create a cycle from all currently-eligible staged projects
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/create-cycle")
def create_cycle_from_staging(
    payload: CreateCycleFromStagingRequest,
    request: Request,
    db: Session = Depends(get_local_db),
    tms_db: Session = Depends(get_tms_db),
    current_user: dict = Depends(require_role("QUALITY", "MANAGEMENT")),
):
    eligible_rows = db.query(ProjectStaging).filter(
        ProjectStaging.status == StagingStatus.ELIGIBLE,
        ProjectStaging.converted_cycle_id.is_(None),
    ).all()

    if not eligible_rows:
        raise HTTPException(
            status_code=400,
            detail="No eligible projects in the staging pool yet — select and triage projects first.",
        )

    # Carry forward exempted / still-pending-review projects from the SAME
    # staging round too — previously only eligible ones got enrolled, which
    # silently left "not sure" and "exempt" projects behind in the staging
    # pool with no way to ever show up in the new cycle's Needs review /
    # Not eligible filters at all.
    other_rows = db.query(ProjectStaging).filter(
        ProjectStaging.status.in_([StagingStatus.EXEMPTED, StagingStatus.PENDING_MANAGEMENT_REVIEW]),
        ProjectStaging.converted_cycle_id.is_(None),
    ).all()

    start, end = _half_dates(payload.year, payload.half)
    cycle = CSATCycle(
        cycle_name=payload.cycle_name,
        description=payload.description,
        start_date=start,
        end_date=end,
        is_active=True,
    )
    db.add(cycle)
    db.flush()  # need cycle.id

    now = datetime.utcnow()
    enrolled_count = 0
    needs_review_notify: list[tuple[CycleProjectEnrollment, Project]] = []
    all_enrolled: list[tuple[CycleProjectEnrollment, Project]] = []

    for staging_row in eligible_rows + other_rows:
        project = db.query(Project).filter(Project.id == staging_row.project_id).first()

        if staging_row.status == StagingStatus.EXEMPTED:
            # Quality already decided this one — lands directly as Not
            # eligible, no addition-approval round needed.
            elig_status = EligibilityStatus.EXEMPTED
            addition_status = AdditionApprovalStatus.APPROVED
            remarks = "Marked not eligible via project staging."
        elif staging_row.status == StagingStatus.PENDING_MANAGEMENT_REVIEW:
            # Quality was unsure and it's still awaiting a decision — carry
            # that open question forward into the cycle's own addition-
            # approval flow (Needs review), rather than leaving it stranded
            # in a staging pool that's no longer reachable once converted.
            elig_status = EligibilityStatus.ELIGIBLE
            addition_status = AdditionApprovalStatus.PENDING
            remarks = None
        else:  # ELIGIBLE
            elig_status = EligibilityStatus.ELIGIBLE
            addition_status = AdditionApprovalStatus.APPROVED
            remarks = "Pre-approved via project staging."

        enr = CycleProjectEnrollment(
            cycle_id=cycle.id,
            project_id=staging_row.project_id,
            eligibility_status=elig_status,
            enrolled_by=current_user["emp_id"],
            addition_approval_status=addition_status,
            addition_approved_by=current_user["emp_id"] if addition_status == AdditionApprovalStatus.APPROVED else None,
            addition_approved_at=now if addition_status == AdditionApprovalStatus.APPROVED else None,
            addition_decision_remarks=remarks,
        )
        db.add(enr)
        db.flush()
        staging_row.converted_cycle_id = cycle.id
        staging_row.converted_at = now
        enrolled_count += 1
        if project:
            all_enrolled.append((enr, project))

        if addition_status == AdditionApprovalStatus.PENDING and project:
            needs_review_notify.append((enr, project))

    db.commit()
    db.refresh(cycle)

    # Notify Management/PM for the still-undecided ones — same as any other
    # newly-added-and-pending project. Best-effort: the cycle/enrollments
    # themselves are already committed above regardless of whether this works.
    enrolled_by_name = current_user.get("name") or current_user["emp_id"]
    for enr, project in needs_review_notify:
        try:
            notify_project_added_to_cycle(
                local_db=db,
                tms_db=tms_db,
                cycle_id=cycle.id,
                cycle_name=cycle.cycle_name,
                project_id=project.id,
                project_ext_id=project.project_id,
                project_name=project.project_name,
                enrollment_id=enr.id,
                enrolled_by_name=enrolled_by_name,
                actor_emp_id=current_user["emp_id"],
            )
        except Exception as e:
            print(f"[WARN] Failed to notify for staged-carryover enrollment {enr.id}: {e}")
    db.commit()

    ip = get_client_ip(request)
    actor = current_user["emp_id"]
    actor_name = current_user.get("name")
    actor_role = current_user["role"]

    log_action(
        db, action=AuditActions.CSAT_CYCLE_CREATED,
        actor_emp_id=actor, actor_name=actor_name, actor_role=actor_role, ip_address=ip,
        entity_type="csat_cycle", entity_id=cycle.id,
        details={"cycle_name": cycle.cycle_name, "year": payload.year, "half": payload.half, "via": "project_staging"},
    )
    for enr, project in all_enrolled:
        log_action(
            db, action=AuditActions.PROJECT_ENROLLED,
            actor_emp_id=actor, actor_name=actor_name, actor_role=actor_role, ip_address=ip,
            entity_type="cycle_project_enrollment", entity_id=enr.id,
            details={"cycle_id": cycle.id, "project_name": project.project_name, "via": "project_staging"},
        )

    return {**_cycle_resp(cycle), "projects_enrolled": enrolled_count}
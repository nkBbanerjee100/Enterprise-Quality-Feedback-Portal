"""
Reviews — a single, unified "Needs Your Review" list for Management.

This exists because there are two genuinely separate systems that both
represent "something is waiting on Management's decision", and nothing ties
them together for the person who has to act on both:

  1. Pre-cycle staging (project_staging table) — Quality triages TMS
     candidates before any cycle exists. A "not sure" triage sets
     status='pending_management_review', resolved via
     POST /api/project-staging/{staging_id}/decide.

  2. Cycle-level addition approval (cycle_project_enrollments table) — a
     project added to an ALREADY-EXISTING cycle via "+Add Projects".
     A "not sure" triage there sets addition_approval_status='pending',
     resolved via POST /api/csat-cycles/{cycle_id}/projects/{enrollment_id}
     /approve-addition or /decline-addition.

Management previously had to know both of these existed and check both
pages separately. This endpoint merges both into one flat, chronological
list; the frontend acts on each item using its `source` field to call the
right existing decide-endpoint — no new decision logic here, just aggregation.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_local_db
from app.core.dependencies import require_role
from app.models.project import Project
from app.models.project_staging import ProjectStaging, StagingStatus
from app.models.cycle_project_enrollment import CycleProjectEnrollment, AdditionApprovalStatus
from app.models.csat_cycle import CSATCycle

router = APIRouter()


def _resolve_names(db: Session, emp_ids: list[str]) -> dict[str, str]:
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


@router.get("/pending")
def list_pending_reviews(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    """Everything currently awaiting Management's decision, merged from both
    the pre-cycle staging pool and every cycle's addition-approval queue.
    Sorted oldest-first — whatever's been waiting longest surfaces first."""

    staging_rows = (
        db.query(ProjectStaging, Project)
        .join(Project, Project.id == ProjectStaging.project_id)
        .filter(ProjectStaging.status == StagingStatus.PENDING_MANAGEMENT_REVIEW)
        .all()
    )

    enrollment_rows = (
        db.query(CycleProjectEnrollment, Project, CSATCycle)
        .join(Project, Project.id == CycleProjectEnrollment.project_id)
        .join(CSATCycle, CSATCycle.id == CycleProjectEnrollment.cycle_id)
        .filter(CycleProjectEnrollment.addition_approval_status == AdditionApprovalStatus.PENDING)
        .all()
    )

    name_map = _resolve_names(
        db,
        [s.selected_by for s, _ in staging_rows]
        + [e.enrolled_by for e, _, _ in enrollment_rows],
    )

    items = []
    for s, project in staging_rows:
        items.append({
            "source":         "staging",
            "id":             s.id,
            "cycle_id":       None,
            "cycle_name":     None,
            "project_id":     project.id,
            "project_ext_id": project.project_id,
            "project_name":   project.project_name,
            "is_active":      project.is_active,
            "requested_by":   name_map.get(s.selected_by, s.selected_by),
            "requested_at":   s.selected_at,
        })
    for e, project, cycle in enrollment_rows:
        items.append({
            "source":         "cycle_addition",
            "id":             e.id,
            "cycle_id":       cycle.id,
            "cycle_name":     cycle.cycle_name,
            "project_id":     project.id,
            "project_ext_id": project.project_id,
            "project_name":   project.project_name,
            "is_active":      project.is_active,
            "requested_by":   name_map.get(e.enrolled_by, e.enrolled_by) if e.enrolled_by else None,
            "requested_at":   e.enrolled_at,
        })

    items.sort(key=lambda i: i["requested_at"])

    return {
        "total": len(items),
        "items": items,
    }


@router.get("/pending/count")
def pending_review_count(
    db: Session = Depends(get_local_db),
    current_user: dict = Depends(require_role("MANAGEMENT")),
):
    """Lightweight count-only version for a persistent nav badge, so the
    full list doesn't need to be fetched just to show a number."""
    staging_count = (
        db.query(ProjectStaging)
        .filter(ProjectStaging.status == StagingStatus.PENDING_MANAGEMENT_REVIEW)
        .count()
    )
    enrollment_count = (
        db.query(CycleProjectEnrollment)
        .filter(CycleProjectEnrollment.addition_approval_status == AdditionApprovalStatus.PENDING)
        .count()
    )
    return {"count": staging_count + enrollment_count}

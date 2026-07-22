"""
One-time backfill: recover missing exemption reasons on historical
PROJECT_ENROLLED audit_logs rows.

WHY THIS EXISTS
---------------
Before a recent fix, the audit log entry written when a Manager
self-exempted their own project (or Quality requested an exemption) at
add-time never included the reason in its `details` JSON — it was
dropped at write time, not just at read time. This script is a
best-effort recovery: for old PROJECT_ENROLLED logs missing a reason,
it looks at the linked enrollment's CURRENT `exemption_reason` column
and, if it's still present (i.e. nothing has overwritten it since),
copies it into the log's `details` JSON so the Audit Report timeline
can show it.

THIS IS NOT NEEDED GOING FORWARD. New actions already write their
reason into audit_logs at the time they happen — this script only
patches rows written before that fix went live. Run it once, then
you're done with it for good.

LIMITATION: if the enrollment has since been re-decided (e.g. an
exemption was later rejected and the project made eligible), its
`exemption_reason` column is now None — there is nothing left to
recover for that row, and this script will leave it alone. It will
print a summary of what it fixed vs. what it couldn't.

USAGE
-----
    cd backend
    python -m app.scripts.backfill_exemption_reasons            # dry run (default) — shows what WOULD change, commits nothing
    python -m app.scripts.backfill_exemption_reasons --commit    # actually writes the changes

Safe to re-run: it only ever touches rows that are still missing a
reason, so running it twice is harmless (the second run just finds
nothing left to fix).
"""
import argparse
import json
import sys

from app.database import LocalSessionFactory
from app.models.audit_log import AuditLog
from app.models.cycle_project_enrollment import CycleProjectEnrollment


def main(commit: bool) -> None:
    db = LocalSessionFactory()
    try:
        logs = (
            db.query(AuditLog)
            .filter(
                AuditLog.action == "PROJECT_ENROLLED",
                AuditLog.entity_type == "cycle_project_enrollment",
                AuditLog.success == True,  # noqa: E712
            )
            .all()
        )

        fixed = 0
        already_had_reason = 0
        unrecoverable = 0

        for log in logs:
            try:
                details = json.loads(log.details) if log.details else {}
            except (TypeError, ValueError):
                details = {}

            existing_reason = details.get("remarks") or details.get("exemption_reason") or details.get("reason")
            if existing_reason:
                already_had_reason += 1
                continue

            outcome = details.get("outcome")
            if outcome not in ("manager_self_exempt", "exemption_requested"):
                # Not an exemption-carrying outcome — correctly has no reason, nothing to do.
                continue

            enr = db.query(CycleProjectEnrollment).filter(CycleProjectEnrollment.id == int(log.entity_id)).first()
            if not enr or not enr.exemption_reason:
                unrecoverable += 1
                print(f"  [unrecoverable] audit_log id={log.id} enrollment_id={log.entity_id} — "
                      f"current exemption_reason is empty; likely overwritten by a later decision.")
                continue

            details["remarks"] = enr.exemption_reason
            details["remarks_backfilled"] = True  # flag so it's clear this was recovered, not originally logged
            log.details = json.dumps(details, default=str)
            fixed += 1
            print(f"  [fixed] audit_log id={log.id} enrollment_id={log.entity_id} -> \"{enr.exemption_reason}\"")

        print("\n--- Summary ---")
        print(f"Already had a reason: {already_had_reason}")
        print(f"Recovered:            {fixed}")
        print(f"Unrecoverable:        {unrecoverable}")

        if commit:
            db.commit()
            print(f"\nCommitted {fixed} change(s) to the database.")
        else:
            db.rollback()
            print(f"\nDRY RUN — no changes were saved. Re-run with --commit to apply.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", action="store_true", help="Actually write changes (default is dry-run).")
    args = parser.parse_args()
    main(commit=args.commit)
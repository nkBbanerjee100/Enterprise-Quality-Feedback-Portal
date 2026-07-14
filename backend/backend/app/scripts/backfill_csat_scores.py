"""
One-off backfill: populate fact_feedback_response.csat_score for rows
submitted BEFORE submit_survey started writing it.

Existing rows have response_data (the full survey blob) but csat_score is
still NULL, because that column write was only added later. This script
reads overallRating back out of each row's response_data JSON and fills in
csat_score using the exact same conversion submit_survey now uses at write
time (1-10 scale -> /5 scale), so historical and future data stay consistent.

Safe to run more than once — it only touches rows where csat_score IS NULL,
so it will never overwrite a value that's already been set (either by a new
submission or a previous run of this script).

Usage (from the backend/ directory, same one containing main.py):
    python scripts/backfill_csat_scores.py
    python scripts/backfill_csat_scores.py --dry-run   # preview only, no writes
"""
import sys
import os
import json
import argparse

# Allow running this script directly (python scripts/backfill_csat_scores.py)
# by adding the backend root to sys.path, same as main.py does implicitly
# when uvicorn imports it as a package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import LocalSessionFactory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would change without writing anything.",
    )
    args = parser.parse_args()

    db = LocalSessionFactory()
    try:
        rows = db.execute(
            text("""
                SELECT id, response_data
                FROM fact_feedback_response
                WHERE csat_score IS NULL
                  AND response_data IS NOT NULL
            """)
        ).fetchall()

        if not rows:
            print("Nothing to backfill — no rows with NULL csat_score and a stored response_data.")
            return

        print(f"Found {len(rows)} response(s) with NULL csat_score to check.\n")

        updated = 0
        skipped = 0

        for row in rows:
            try:
                data = row.response_data if isinstance(row.response_data, dict) else json.loads(row.response_data)
            except (TypeError, ValueError) as e:
                print(f"  id={row.id}: could not parse response_data ({e}) — skipping")
                skipped += 1
                continue

            overall_rating = data.get("overallRating")
            if not isinstance(overall_rating, (int, float)):
                print(f"  id={row.id}: no numeric overallRating in response_data — skipping")
                skipped += 1
                continue

            csat_score = round(overall_rating / 2.0, 2)
            print(f"  id={row.id}: overallRating={overall_rating} -> csat_score={csat_score}")

            if not args.dry_run:
                db.execute(
                    text("UPDATE fact_feedback_response SET csat_score = :score WHERE id = :id"),
                    {"score": csat_score, "id": row.id},
                )
            updated += 1

        if args.dry_run:
            print(f"\n[DRY RUN] Would update {updated} row(s), skip {skipped}. No changes written.")
        else:
            db.commit()
            print(f"\nDone. Updated {updated} row(s), skipped {skipped}.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Read-only repair decision pack for prod grid guard (isolated SQLite copy)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prod_calendar_grid_repair_lib import (  # noqa: E402
    build_recommendation,
    connect_readonly,
    decision_lock_from_row,
    fetch_booking,
    integrity_check,
    list_invalid_ids,
    run_migration_preflight,
    schema_snapshot,
)


from scripts.prod_calendar_grid_repair_lib import (  # noqa: E402
    _master_service_join,
    booking_row_select_clause,
)


def _booking_select_sql(conn) -> str:
    return f"""
SELECT {booking_row_select_clause(conn).strip().rstrip(',')},
       s.duration AS service_duration,
       ms.duration AS master_service_duration,
       ms.name AS master_service_name,
       m.domain AS master_domain, m.timezone AS master_timezone,
       (SELECT COUNT(*) FROM incomes WHERE booking_id=b.id) AS income_count,
       (SELECT COALESCE(SUM(total_amount),0) FROM incomes WHERE booking_id=b.id) AS income_total,
       (SELECT COUNT(*) FROM booking_confirmations WHERE booking_id=b.id) AS confirmation_count,
       (SELECT COUNT(*) FROM loyalty_transactions WHERE booking_id=b.id) AS loyalty_count
FROM bookings b
LEFT JOIN services s ON s.id = b.service_id
{_master_service_join(conn)}
LEFT JOIN masters m ON m.id = b.master_id
WHERE b.id IN ({{ids}})
ORDER BY b.id
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path, help="Isolated SQLite prod copy")
    parser.add_argument("--out", required=True, type=Path, help="Write JSON decision pack")
    parser.add_argument(
        "--skip-migration-preflight",
        action="store_true",
        help="Skip disposable alembic upgrade (not recommended)",
    )
    args = parser.parse_args()

    if not args.db.is_file():
        print(f"DB not found: {args.db}", file=sys.stderr)
        return 2

    conn = connect_readonly(args.db)
    schema = schema_snapshot(conn)
    integrity = integrity_check(conn)
    booking_ids, block_ids = list_invalid_ids(conn)

    preflight = None
    if not args.skip_migration_preflight:
        preflight = run_migration_preflight(ROOT, args.db)

    decisions = []
    if booking_ids:
        sql = _booking_select_sql(conn).format(
            ids=",".join(str(i) for i in booking_ids)
        )
        for row in conn.execute(sql):
            rec = build_recommendation(row)
            decisions.append(
                {
                    "id": row["id"],
                    "status": row["status"],
                    "master_id": row["master_id"],
                    "master_domain": row["master_domain"],
                    "client_id": row["client_id"],
                    "interval": {
                        "start_time": str(row["start_time"]),
                        "end_time": str(row["end_time"]),
                    },
                    "approval_lock": decision_lock_from_row(row),
                    "notes": row["notes"],
                    "created_at": row["created_at"],
                    **rec,
                }
            )
    conn.close()

    by_category = {}
    for d in decisions:
        cat = d["provenance"]["category"]
        by_category[cat] = by_category.get(cat, 0) + 1

    payload = {
        "source_db": str(args.db.resolve()),
        "integrity_check": integrity,
        "schema": schema,
        "invalid_bookings_count": len(booking_ids),
        "invalid_booking_ids": booking_ids,
        "invalid_calendar_blocks_count": len(block_ids),
        "invalid_calendar_block_ids": block_ids,
        "provenance_summary": by_category,
        "migration_preflight": preflight,
        "migration_preflight_ok": bool(
            preflight and preflight.get("grid_guard_passed")
        ),
        "decisions": decisions,
        "note": (
            "migration_preflight_ok is false until repairs applied on a copy and "
            "alembic upgrade head succeeds including 20261114_calendar_grid_guard."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.out} ({len(booking_ids)} booking decisions)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
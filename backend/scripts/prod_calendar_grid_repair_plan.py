#!/usr/bin/env python3
"""Read-only repair planner for off-grid prod bookings on an isolated SQLite copy.

Does not mutate the database. Outputs JSON proposals for owner review before
`20261114_calendar_grid_guard` cutover.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.sqlite_calendar_grid_guard import (  # noqa: E402
    _naive_wall_duration_minutes,
    _parse_wall_naive,
    _wall_on_grid,
    iter_invalid_booking_rows,
    register_sqlite_calendar_guard_udfs,
    sqlite_validate_booking_row,
)


def _snap_start_down(dt: datetime) -> datetime:
    minute = 0 if dt.minute < 30 else 30
    return dt.replace(minute=minute, second=0, microsecond=0)


def _options_on_grid(start: datetime, end: datetime) -> list[dict]:
    """Minimal-change candidates: extend or shrink to 30-min grid duration."""
    dur = _naive_wall_duration_minutes(start, end)
    out: list[dict] = []
    for target_min in (30, 60):
        if target_min == dur and _wall_on_grid(end):
            continue
        cand_end = start + timedelta(minutes=target_min)
        if not _wall_on_grid(cand_end):
            continue
        out.append(
            {
                "strategy": f"start_unchanged_end_plus_{target_min}m",
                "start_time": start.isoformat(sep=" "),
                "end_time": cand_end.isoformat(sep=" "),
                "duration_minutes": target_min,
            }
        )
    return out


def _proposal_for_row(row: sqlite3.Row) -> dict:
    rid = int(row["id"])
    start_raw, end_raw = row["start_time"], row["end_time"]
    start = _parse_wall_naive(start_raw)
    end = _parse_wall_naive(end_raw)

    base = {
        "id": rid,
        "status": row["status"],
        "master_id": row["master_id"],
        "client_id": row["client_id"],
        "notes": (row["notes"] or "")[:120],
        "current": {"start_time": start_raw, "end_time": end_raw},
        "related": {
            "incomes": row["income_count"],
            "income_total": row["income_total"],
            "confirmations": row["confirmation_count"],
            "loyalty_tx": row["loyalty_count"],
        },
        "proposals": [],
    }

    if start is None or end is None:
        if start is None and start_raw:
            st = _parse_wall_naive(str(start_raw).split(".")[0])
            if st:
                start = st
        if end is None and end_raw:
            en = _parse_wall_naive(str(end_raw).split(".")[0])
            if en:
                end = en
        if start and ("." in str(start_raw) or not _wall_on_grid(start)):
            st0 = start.replace(microsecond=0)
            if not _wall_on_grid(st0):
                st0 = _snap_start_down(st0)
            for minutes in (30, 60):
                cand_end = st0 + timedelta(minutes=minutes)
                if _wall_on_grid(cand_end):
                    base["proposals"].append(
                        {
                            "strategy": f"truncate_subsecond_grid_{minutes}m",
                            "start_time": st0.isoformat(sep=" "),
                            "end_time": cand_end.isoformat(sep=" "),
                            "duration_minutes": minutes,
                        }
                    )
        return base

    if end <= start:
        cand_end = start + timedelta(minutes=30)
        if _wall_on_grid(start) and _wall_on_grid(cand_end):
            base["proposals"].append(
                {
                    "strategy": "inverted_interval_fix_plus_30m",
                    "start_time": start.isoformat(sep=" "),
                    "end_time": cand_end.isoformat(sep=" "),
                    "duration_minutes": 30,
                }
            )
        return base

    if _wall_on_grid(start):
        base["proposals"].extend(_options_on_grid(start, end))
    else:
        st0 = _snap_start_down(start)
        for minutes in (30, 60):
            cand_end = st0 + timedelta(minutes=minutes)
            if _wall_on_grid(cand_end):
                base["proposals"].append(
                    {
                        "strategy": f"snap_start_down_plus_{minutes}m",
                        "start_time": st0.isoformat(sep=" "),
                        "end_time": cand_end.isoformat(sep=" "),
                        "duration_minutes": minutes,
                    }
                )

    return base


def _validate_proposal(row: sqlite3.Row, proposal: dict) -> bool:
    start = proposal["start_time"]
    end = proposal["end_time"]
    # Wall-only check: after repair, owner must recompute canonical UTC if present.
    return (
        sqlite_validate_booking_row(start, end, None, None, None) == 0
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path, help="Path to isolated prod SQLite copy")
    parser.add_argument("--out", type=Path, help="Write JSON plan here (default: stdout)")
    args = parser.parse_args()

    if not args.db.is_file():
        print(f"DB not found: {args.db}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(str(args.db))
    conn.row_factory = sqlite3.Row
    register_sqlite_calendar_guard_udfs(conn)

    invalid_ids = {rid for rid, _ in iter_invalid_booking_rows(conn)}
    if not invalid_ids:
        payload = {"invalid_count": 0, "bookings": [], "note": "No invalid bookings; migration preflight OK"}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    sql = """
    SELECT b.id, b.status, b.master_id, b.client_id, b.notes,
           b.start_time, b.end_time, b.start_utc_us, b.end_utc_us, b.time_zone,
           (SELECT COUNT(*) FROM incomes i WHERE i.booking_id = b.id) AS income_count,
           (SELECT COALESCE(SUM(i.amount), 0) FROM incomes i WHERE i.booking_id = b.id) AS income_total,
           (SELECT COUNT(*) FROM booking_confirmations c WHERE c.booking_id = b.id) AS confirmation_count,
           (SELECT COUNT(*) FROM loyalty_transactions lt WHERE lt.booking_id = b.id) AS loyalty_count
    FROM bookings b
  WHERE b.id IN ({})
    ORDER BY b.id
    """.format(",".join(str(i) for i in sorted(invalid_ids)))

    rows = conn.execute(sql).fetchall()
    plans = []
    for row in rows:
        item = _proposal_for_row(row)
        for p in item["proposals"]:
            p["guard_valid"] = _validate_proposal(row, p)
        item["owner_action"] = (
            "choose one guard_valid proposal or define manual interval; "
            "re-run alembic on copy after UPDATE"
        )
        plans.append(item)

    payload = {
        "db": str(args.db.resolve()),
        "invalid_count": len(invalid_ids),
        "bookings": plans,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(f"Wrote {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
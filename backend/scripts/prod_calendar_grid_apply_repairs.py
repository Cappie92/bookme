#!/usr/bin/env python3
"""Apply owner-approved grid repairs on a disposable DB copy (not production)."""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prod_calendar_grid_repair_lib import (  # noqa: E402
    fetch_booking,
    proposed_update_columns,
    register_sqlite_calendar_guard_udfs,
    sqlite_validate_booking_row,
    table_columns,
    verify_decision_lock,
)


def _parse_option_overrides(spec: str) -> Dict[int, int]:
    out: Dict[int, int] = {}
    if not spec.strip():
        return out
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        bid_s, idx_s = part.split(":", 1)
        out[int(bid_s.strip())] = int(idx_s.strip())
    return out


def _chosen_interval(
    decision: Dict[str, Any], *, option_index: Optional[int]
) -> Optional[Dict[str, Any]]:
    if option_index is not None:
        opts = decision.get("options") or []
        if option_index < 0 or option_index >= len(opts):
            return None
        return opts[option_index]
    return decision.get("recommended")


def _validate_after(row: sqlite3.Row, cols: Dict[str, Any]) -> bool:
    return (
        sqlite_validate_booking_row(
            cols["start_time"],
            cols["end_time"],
            cols.get("start_utc_us", row["start_utc_us"] if "start_utc_us" in row.keys() else None),
            cols.get("end_utc_us", row["end_utc_us"] if "end_utc_us" in row.keys() else None),
            cols.get("time_zone", row["time_zone"] if "time_zone" in row.keys() else None),
        )
        == 0
    )


def apply_repairs(
    db_path: Path,
    plan: Dict[str, Any],
    *,
    dry_run: bool,
    booking_ids: List[int],
    option_overrides: Dict[int, int],
) -> Dict[str, Any]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    register_sqlite_calendar_guard_udfs(conn)
    applied: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    pending: List[Dict[str, Any]] = []

    for bid in booking_ids:
        decision = next((d for d in plan["decisions"] if d["id"] == bid), None)
        if not decision:
            errors.append({"id": bid, "error": "not in plan"})
            continue
        rec = _chosen_interval(decision, option_index=option_overrides.get(bid))
        if not rec:
            errors.append({"id": bid, "error": "no target interval (set --option-override)"})
            continue
        row = fetch_booking(conn, bid)
        if not row:
            errors.append({"id": bid, "error": "missing row"})
            continue
        lock = decision.get("approval_lock")
        if lock:
            drift = verify_decision_lock(row, lock)
            if drift:
                errors.append(
                    {
                        "id": bid,
                        "error": f"approval_lock:{drift}",
                        "lock": lock,
                        "actual": decision_lock_snapshot(row),
                    }
                )
                continue
        else:
            if str(row["start_time"]) != str(decision["interval"]["start_time"]):
                errors.append({"id": bid, "error": "start_time drift (no approval_lock in plan)"})
                continue
            if str(row["end_time"]) != str(decision["interval"]["end_time"]):
                errors.append({"id": bid, "error": "end_time drift (no approval_lock in plan)"})
                continue
        try:
            cols = proposed_update_columns(row, rec["start_time"], rec["end_time"])
        except ValueError as exc:
            errors.append({"id": bid, "error": str(exc)})
            continue
        if not _validate_after(row, cols):
            errors.append({"id": bid, "error": "guard validation failed after propose"})
            continue
        pending.append(
            {
                "id": bid,
                "decision_interval": decision["interval"],
                "cols": cols,
                "has_canonical": "start_utc_us" in cols,
                "lock": lock,
            }
        )

    if errors:
        conn.close()
        return {
            "applied": applied,
            "errors": errors,
            "dry_run": dry_run,
            "outcome": "repair_failed",
        }

    if dry_run:
        for item in pending:
            applied.append({"id": item["id"], "dry_run": True, "set": item["cols"]})
        conn.close()
        return {
            "applied": applied,
            "errors": errors,
            "dry_run": dry_run,
            "outcome": "dry_run_ok",
        }

    has_version = "version" in table_columns(conn, "bookings")
    conn.execute("BEGIN IMMEDIATE")
    try:
        for item in pending:
            bid = item["id"]
            cols = item["cols"]
            interval = item["decision_interval"]
            lock = item["lock"]
            row = fetch_booking(conn, bid)
            if lock and row and verify_decision_lock(row, lock):
                conn.execute("ROLLBACK")
                conn.close()
                return {
                    "applied": [],
                    "errors": [
                        {
                            "id": bid,
                            "error": "approval_lock drift under transaction",
                        }
                    ],
                    "dry_run": False,
                    "outcome": "repair_failed",
                }
            if item["has_canonical"]:
                cur = conn.execute(
                    """
                    UPDATE bookings SET start_time=?, end_time=?,
                           start_utc_us=?, end_utc_us=?, time_zone=?, version=version+1
                    WHERE id=? AND start_time=? AND end_time=? AND status=?
                    """,
                    (
                        cols["start_time"],
                        cols["end_time"],
                        cols["start_utc_us"],
                        cols["end_utc_us"],
                        cols["time_zone"],
                        bid,
                        interval["start_time"],
                        interval["end_time"],
                        lock["status"] if lock else row["status"],
                    ),
                )
            elif has_version:
                cur = conn.execute(
                    """
                    UPDATE bookings SET start_time=?, end_time=?, version=version+1
                    WHERE id=? AND start_time=? AND end_time=? AND status=?
                    """,
                    (
                        cols["start_time"],
                        cols["end_time"],
                        bid,
                        interval["start_time"],
                        interval["end_time"],
                        lock["status"] if lock else row["status"],
                    ),
                )
            else:
                cur = conn.execute(
                    """
                    UPDATE bookings SET start_time=?, end_time=?
                    WHERE id=? AND start_time=? AND end_time=? AND status=?
                    """,
                    (
                        cols["start_time"],
                        cols["end_time"],
                        bid,
                        interval["start_time"],
                        interval["end_time"],
                        lock["status"] if lock else row["status"],
                    ),
                )
            if cur.rowcount != 1:
                conn.execute("ROLLBACK")
                conn.close()
                return {
                    "applied": [],
                    "errors": [{"id": bid, "error": "optimistic lock failed"}],
                    "dry_run": False,
                    "outcome": "repair_failed",
                }
            applied.append({"id": bid, "set": cols})
        conn.execute("COMMIT")
    except sqlite3.Error as exc:
        conn.execute("ROLLBACK")
        conn.close()
        return {
            "applied": [],
            "errors": [{"error": str(exc)}],
            "dry_run": False,
            "outcome": "repair_failed",
        }

    conn.close()
    return {
        "applied": applied,
        "errors": errors,
        "dry_run": False,
        "outcome": "repair_committed",
    }


def decision_lock_snapshot(row: sqlite3.Row) -> Dict[str, Any]:
    snap = {
        "status": row["status"],
        "start_time": str(row["start_time"]),
        "end_time": str(row["end_time"]),
    }
    if "version" in row.keys():
        snap["version"] = row["version"]
    return snap


def run_alembic(db_path: Path) -> Dict[str, Any]:
    import os

    proc = subprocess.run(
        [str(ROOT / ".venv/bin/python"), "-m", "alembic", "upgrade", "head"],
        cwd=str(ROOT),
        env={
            **os.environ,
            "DATABASE_URL": f"sqlite:///{db_path}",
            "PYTHONPATH": str(ROOT),
        },
        capture_output=True,
        text=True,
    )
    conn = sqlite3.connect(str(db_path))
    ver = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    conn.close()
    return {
        "exit_code": proc.returncode,
        "alembic_version": ver[0] if ver else None,
        "stderr_tail": (proc.stderr or "")[-1500:],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--booking-ids", required=True, help="Comma-separated ids to apply")
    parser.add_argument(
        "--option-override",
        action="append",
        default=[],
        help="Per booking: ID:INDEX into decision.options (e.g. 145:0)",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--run-migration-after", action="store_true")
    args = parser.parse_args()

    overrides = _parse_option_overrides(",".join(args.option_override))
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    ids = [int(x.strip()) for x in args.booking_ids.split(",") if x.strip()]
    result = apply_repairs(
        args.db,
        plan,
        dry_run=args.dry_run,
        booking_ids=ids,
        option_overrides=overrides,
    )

    exit_code = 0
    if result["errors"] or result.get("outcome") == "repair_failed":
        exit_code = 1
    elif args.run_migration_after and not args.dry_run:
        if result.get("outcome") != "repair_committed":
            exit_code = 1
        else:
            mig = run_alembic(args.db)
            result["migration"] = mig
            if mig["exit_code"] == 0 and mig.get("alembic_version") == "20261114_calendar_grid_guard":
                result["outcome"] = "repair_committed_migration_succeeded"
            else:
                result["outcome"] = "repair_committed_migration_failed"
                exit_code = 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
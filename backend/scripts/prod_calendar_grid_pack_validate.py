#!/usr/bin/env python3
"""Validate live SQLite rows match an approved decision pack (read-only)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prod_calendar_grid_repair_lib import (  # noqa: E402
    connect_readonly,
    fetch_booking,
    list_invalid_ids,
    verify_decision_lock,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--plan", required=True, type=Path)
    args = parser.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    conn = connect_readonly(args.db)
    invalid_ids, _ = list_invalid_ids(conn)
    errors = []

    plan_ids = {d["id"] for d in plan["decisions"]}
    if set(invalid_ids) != plan_ids:
        errors.append(
            {
                "error": "invalid_id_set_mismatch",
                "db_invalid": sorted(invalid_ids),
                "plan_ids": sorted(plan_ids),
            }
        )

    for decision in plan["decisions"]:
        bid = decision["id"]
        row = fetch_booking(conn, bid)
        if not row:
            errors.append({"id": bid, "error": "missing"})
            continue
        lock = decision.get("approval_lock")
        if not lock:
            errors.append({"id": bid, "error": "plan missing approval_lock"})
            continue
        drift = verify_decision_lock(row, lock)
        if drift:
            errors.append({"id": bid, "error": drift, "lock": lock})

    conn.close()
    out = {"ok": not errors, "errors": errors, "invalid_count": len(invalid_ids)}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
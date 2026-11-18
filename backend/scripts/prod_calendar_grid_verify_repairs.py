#!/usr/bin/env python3
"""Compare before/after consequences of grid repair on a disposable DB copy."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prod_calendar_grid_repair_lib import (  # noqa: E402
    compare_repair_consequences,
    snapshot_booking_consequences,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before-db", required=True, type=Path)
    parser.add_argument("--after-db", required=True, type=Path)
    parser.add_argument("--booking-ids", required=True, help="Comma-separated repaired ids")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    ids = [int(x.strip()) for x in args.booking_ids.split(",") if x.strip()]
    bconn = sqlite3.connect(str(args.before_db))
    aconn = sqlite3.connect(str(args.after_db))
    before = snapshot_booking_consequences(bconn, ids)
    after = snapshot_booking_consequences(aconn, ids)
    bconn.close()
    aconn.close()

    report = compare_repair_consequences(before, after, repaired_ids=ids)
    report["repaired_ids"] = ids
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "out": str(args.out)}, ensure_ascii=False))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
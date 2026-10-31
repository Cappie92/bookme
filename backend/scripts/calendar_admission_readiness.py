"""Print unified-admission readiness as JSON. Read-only: never commits.

Usage (from backend/): DATABASE_URL=sqlite:///path python scripts/calendar_admission_readiness.py
    [--shadow-since 2026-11-01T00:00:00]
``--shadow-since`` is the naive UTC deploy time of canonical shadow writes; rows
created since then without canonical time count as unresolved new writes.
Output contains master ids and counts only, no names, phones or titles.
"""

import argparse
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from services.calendar_readiness import readiness_report  # noqa: E402


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shadow-since", type=datetime.fromisoformat, default=None)
    args = parser.parse_args(argv)
    db = SessionLocal()
    try:
        report = readiness_report(db, shadow_since=args.shadow_since)
        print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))
        return 0 if report.activation_ready else 1
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())

"""Print unified-admission readiness as JSON. Read-only: never commits.

Usage (from backend/): DATABASE_URL=sqlite:///path python scripts/calendar_admission_readiness.py
Output contains master ids and counts only, no names, phones or titles.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from services.calendar_readiness import readiness_report  # noqa: E402


def main() -> int:
    db = SessionLocal()
    try:
        report = readiness_report(db)
        print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))
        return 0 if report.activation_ready else 1
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())

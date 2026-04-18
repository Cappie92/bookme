#!/usr/bin/env python3
"""
Выровнять masters.pre_visit_confirmations_enabled для мастеров с has_extended_stats
(та же формула, что в PUT /api/master/profile и миграции 20260413_pre_visit_bf).

  python3 scripts/backfill_pre_visit_confirmations.py --dry-run
  python3 scripts/backfill_pre_visit_confirmations.py --apply

--dry-run: только отчёт, без записи в БД.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill pre_visit_confirmations_enabled")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Отчёт без изменений")
    group.add_argument("--apply", action="store_true", help="Записать изменения")
    args = parser.parse_args()

    from database import SessionLocal
    from models import Master
    from utils.subscription_features import has_extended_stats
    from utils.pre_visit_effective import backfill_pre_visit_column_for_extended_stats_masters

    db = SessionLocal()
    try:
        if args.dry_run:
            masters = db.query(Master).all()
            with_extended = 0
            would_update = 0
            samples: list[tuple[int, bool, bool]] = []
            for m in masters:
                if not has_extended_stats(db, m.user_id):
                    continue
                with_extended += 1
                desired = not (m.auto_confirm_bookings is True)
                cur_bool = True if m.pre_visit_confirmations_enabled is True else False
                if cur_bool == desired:
                    continue
                would_update += 1
                if len(samples) < 25:
                    samples.append((m.user_id, cur_bool, desired))
            print(
                {
                    "dry_run": True,
                    "masters_with_extended_stats": with_extended,
                    "rows_that_would_update": would_update,
                    "sample_user_id_old_new": samples,
                }
            )
            return 0

        result = backfill_pre_visit_column_for_extended_stats_masters(db)
        db.commit()
        print(result)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

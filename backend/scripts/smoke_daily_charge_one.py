#!/usr/bin/env python3
"""
Безопасный daily charge только для smoke-мастера (+79990000990).

Запуск в prod container:
  cd /opt/dedato
  docker-compose -f docker-compose.prod.yml exec -T backend python3 scripts/smoke_daily_charge_one.py

Опции:
  --phone +79990000990
  --date YYYY-MM-DD   (по умолчанию сегодня UTC date)
  --dry-run           только вывести before, без списания
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import SessionLocal
from models import Subscription, SubscriptionStatus, User, UserBalance, SubscriptionReservation
from models import DailySubscriptionCharge, DailyChargeStatus
from utils.balance_utils import (
    get_user_available_balance,
    get_user_reserved_total,
    process_daily_charge,
)


def _snapshot(db, user_id: int, subscription_id: int) -> dict:
    ub = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
    res = (
        db.query(SubscriptionReservation)
        .filter(SubscriptionReservation.subscription_id == subscription_id)
        .first()
    )
    total = float(ub.balance or 0) if ub else 0.0
    reserved = float(res.reserved_amount or 0) if res else get_user_reserved_total(db, user_id)
    available = get_user_available_balance(db, user_id)
    return {
        "total_balance": total,
        "reserved": reserved,
        "available": available,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke daily charge for one subscription")
    parser.add_argument("--phone", default="+79990000990")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD, default today")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    charge_date = date.today()
    if args.date:
        charge_date = datetime.strptime(args.date, "%Y-%m-%d").date()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == args.phone).first()
        if not user:
            print(f"User not found: {args.phone}")
            return 1

        sub = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == user.id,
                Subscription.is_active == True,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
            .order_by(Subscription.id.desc())
            .first()
        )
        if not sub:
            print(f"No active subscription for {args.phone}")
            return 1

        print("== subscription ==")
        print(
            {
                "id": sub.id,
                "user_id": sub.user_id,
                "daily_rate": sub.daily_rate,
                "price": sub.price,
                "start_date": str(sub.start_date),
                "end_date": str(sub.end_date),
            }
        )

        before = _snapshot(db, user.id, sub.id)
        print("\n== before ==")
        print(before)

        existing = (
            db.query(DailySubscriptionCharge)
            .filter(
                DailySubscriptionCharge.subscription_id == sub.id,
                DailySubscriptionCharge.charge_date == charge_date,
            )
            .first()
        )
        if existing:
            print(f"\n== existing charge for {charge_date} ==")
            print(
                {
                    "id": existing.id,
                    "status": getattr(existing.status, "value", existing.status),
                    "amount": existing.amount,
                    "balance_before": existing.balance_before,
                    "balance_after": existing.balance_after,
                }
            )

        if args.dry_run:
            print("\n(dry-run, списание не выполнялось)")
            return 0

        print(f"\n== process_daily_charge({sub.id}, {charge_date}) ==")
        result = process_daily_charge(db, sub.id, charge_date)
        print(result)

        db.expire_all()
        after = _snapshot(db, user.id, sub.id)
        print("\n== after ==")
        print(after)

        return 0 if result.get("success") else 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

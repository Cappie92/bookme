"""
Скрипт диагностики lifecycle подписок.

Пример:
  python3 backend/scripts/subscription_lifecycle_report.py 59 23 35

По умолчанию выводит:
- subscriptions: id,status,is_active,plan_id,start_date,end_date,auto_renewal,payment_period,price,daily_rate
- subscription_reservations: reserved_amount
- daily_subscription_charges: последние SUCCESS (если таблица есть)
- payments (subscription): status, invoice, paid_at, subscription_id, plan_id, apply_status (если есть), snapshot_id (из payment_metadata)
- user_balances: balance/currency
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def table_cols(cur: sqlite3.Cursor, name: str) -> List[str]:
    cur.execute(f"PRAGMA table_info({name})")
    return [c[1] for c in cur.fetchall()]


def has_table(cur: sqlite3.Cursor, name: str) -> bool:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None


def parse_snapshot_id(payment_metadata: Optional[str]) -> Optional[int]:
    if not payment_metadata:
        return None
    try:
        meta = json.loads(payment_metadata) if isinstance(payment_metadata, str) else payment_metadata
        if isinstance(meta, dict):
            cid = meta.get("calculation_id")
            return int(cid) if cid is not None else None
    except Exception:
        return None
    return None


def main() -> int:
    db_path = Path(__file__).resolve().parent.parent / "bookme.db"
    if not db_path.exists():
        print("DB not found:", db_path)
        return 2

    if len(sys.argv) >= 2:
        user_ids = [int(x) for x in sys.argv[1:] if x.strip()]
    else:
        user_ids = [59]

    con = sqlite3.connect(str(db_path))
    cur = con.cursor()

    print("db_path", db_path)

    for uid in user_ids:
        print("\n=== USER", uid, "===")
        if has_table(cur, "users"):
            cur.execute("SELECT id, phone, email, role, is_active, is_verified FROM users WHERE id=?", (uid,))
            print("user", cur.fetchone())

        if has_table(cur, "user_balances"):
            cur.execute("SELECT user_id, balance, currency FROM user_balances WHERE user_id=?", (uid,))
            print("balance", cur.fetchone())

        # subscriptions
        if has_table(cur, "subscriptions"):
            cur.execute(
                "SELECT id, status, is_active, plan_id, start_date, end_date, auto_renewal, payment_period, price, daily_rate "
                "FROM subscriptions WHERE user_id=? AND subscription_type='MASTER' ORDER BY id DESC",
                (uid,),
            )
            subs = cur.fetchall()
            print("subscriptions", len(subs))
            for s in subs:
                print("  sub", s)

        # reservations
        if has_table(cur, "subscription_reservations"):
            cur.execute(
                "SELECT subscription_id, reserved_amount FROM subscription_reservations WHERE user_id=? ORDER BY id DESC",
                (uid,),
            )
            res = cur.fetchall()
            print("reservations", len(res))
            for r in res:
                print("  res", r)

        # daily charges
        if has_table(cur, "daily_subscription_charges"):
            cols = table_cols(cur, "daily_subscription_charges")
            sel_cols = [c for c in ["subscription_id", "charge_date", "status", "amount", "created_at"] if c in cols]
            if not sel_cols:
                sel_cols = cols[:5]
            # В таблице может не быть user_id => фильтруем по subscription_id через subquery
            if "user_id" in cols:
                q = f"SELECT {', '.join(sel_cols)} FROM daily_subscription_charges WHERE user_id=? AND status='success' ORDER BY id DESC LIMIT 5"
                cur.execute(q, (uid,))
            else:
                q = (
                    f"SELECT {', '.join(sel_cols)} FROM daily_subscription_charges "
                    "WHERE status='success' AND subscription_id IN (SELECT id FROM subscriptions WHERE user_id=? AND subscription_type='MASTER') "
                    "ORDER BY id DESC LIMIT 5"
                )
                cur.execute(q, (uid,))
            rows = cur.fetchall()
            print("daily_charges_success_last", len(rows))
            for r in rows:
                print("  ch", r)

        # payments
        if has_table(cur, "payments"):
            cols = table_cols(cur, "payments")
            fields = []
            for c in [
                "id",
                "amount",
                "status",
                "payment_type",
                "robokassa_invoice_id",
                "created_at",
                "paid_at",
                "subscription_id",
                "plan_id",
                "error_message",
                "payment_metadata",
                "subscription_apply_status",
                "subscription_applied_at",
            ]:
                if c in cols:
                    fields.append(c)
            q = f"SELECT {', '.join(fields)} FROM payments WHERE user_id=? AND payment_type='subscription' ORDER BY id DESC LIMIT 10"
            cur.execute(q, (uid,))
            pays = cur.fetchall()
            print("payments_subscription", len(pays))
            for row in pays:
                d = dict(zip(fields, row))
                d["snapshot_id"] = parse_snapshot_id(d.get("payment_metadata"))
                print("  pay", d)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


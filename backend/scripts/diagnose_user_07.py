#!/usr/bin/env python3
"""
Диагностика user +79990000007 (Pro low-balance).
Проверяет: balance, daily_rate, days_remaining, subscription, plan.

Запуск из backend/: python scripts/diagnose_user_07.py
Или с путём к БД: python scripts/diagnose_user_07.py --db /path/to/bookme.db
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

PHONE = "+79990000007"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None, help="Путь к bookme.db (default: backend/bookme.db)")
    args = ap.parse_args()

    backend_dir = Path(__file__).resolve().parent.parent
    db_path = Path(args.db) if args.db else backend_dir / "bookme.db"
    if not db_path.exists():
        print(f"❌ База не найдена: {db_path}")
        return 1

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print("=" * 60)
    print("ДИАГНОСТИКА USER +79990000007 (Pro low-balance)")
    print("=" * 60)
    print(f"БД: {db_path.resolve()}")
    print()

    # 1) users
    cur.execute("SELECT id, phone, email, full_name, role FROM users WHERE phone = ?", (PHONE,))
    user = cur.fetchone()
    if not user:
        print(f"❌ Пользователь с phone={PHONE} не найден")
        conn.close()
        return 1

    user_id = user["id"]
    print(f"1) USERS: id={user_id} phone={user['phone']} role={user['role']}")
    print()

    # 2) user_balance
    cur.execute("SELECT user_id, balance, currency FROM user_balances WHERE user_id = ?", (user_id,))
    ub = cur.fetchone()
    if ub:
        print(f"2) USER_BALANCE: balance={ub['balance']} (рубли) currency={ub['currency']}")
    else:
        print("2) USER_BALANCE: запись отсутствует (будет создана при первом запросе)")
    print()

    # 3) masters
    cur.execute("SELECT id, user_id FROM masters WHERE user_id = ?", (user_id,))
    master = cur.fetchone()
    if master:
        print(f"3) MASTERS: id={master['id']} user_id={master['user_id']}")
    else:
        print("3) MASTERS: запись отсутствует")
    print()

    # 4) subscriptions
    cur.execute(
        """
        SELECT s.id, s.user_id, s.plan_id, s.status, s.is_active,
               s.start_date, s.end_date, s.price, s.daily_rate,
               s.subscription_type
        FROM subscriptions s
        WHERE s.user_id = ?
        ORDER BY s.start_date DESC
        LIMIT 5
        """,
        (user_id,),
    )
    subs = cur.fetchall()
    print("4) SUBSCRIPTIONS (последние 5):")
    if not subs:
        print("   записей нет")
    else:
        for s in subs:
            print(
                f"   id={s['id']} plan_id={s['plan_id']} status={s['status']} is_active={s['is_active']}"
            )
            print(
                f"      start_date={s['start_date']} end_date={s['end_date']}"
            )
            print(
                f"      price={s['price']} daily_rate={s['daily_rate']}"
            )
    print()

    # 5) subscription_plans (Pro)
    cur.execute(
        "SELECT id, name, price_1month, price_3months, price_6months, price_12months FROM subscription_plans WHERE name LIKE '%Pro%' OR name LIKE '%pro%'"
    )
    plans = cur.fetchall()
    print("5) SUBSCRIPTION_PLANS (Pro):")
    for p in plans:
        print(
            f"   id={p['id']} name={p['name']} price_1m={p['price_1month']} price_3m={p['price_3months']} price_6m={p['price_6months']} price_12m={p['price_12months']}"
        )
    if not plans:
        print("   записей нет")
    print()

    # 6) Расчёт days_remaining по формуле
    if subs and ub:
        sub = subs[0]
        balance_rub = float(ub["balance"] or 0)
        daily_rate = float(sub["daily_rate"] or 0)
        end_date_str = sub["end_date"]
        if end_date_str and daily_rate > 0:
            try:
                end = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                now = datetime.utcnow()
                calendar_days = max(
                    0, int(((end - now).total_seconds() + 86399) // 86400)
                )
                balance_days = int(balance_rub // daily_rate)
                days_remaining = max(0, min(balance_days, calendar_days))
                print("6) РАСЧЁТ days_remaining (формула backend):")
                print(f"   balance_rub={balance_rub} daily_rate={daily_rate}")
                print(f"   balance_days=floor({balance_rub}/{daily_rate})={balance_days}")
                print(f"   calendar_days (end_date - now)={calendar_days}")
                print(f"   days_remaining=min(balance_days, calendar_days)={days_remaining}")
            except Exception as e:
                print(f"6) Ошибка расчёта: {e}")
        else:
            print("6) daily_rate=0 или end_date пуст — days_remaining по календарю")
    else:
        print("6) Недостаточно данных для расчёта")
    print()

    # 7) Ожидание от reseed
    print("7) ОЖИДАНИЕ от reseed (Pro low-balance):")
    print("   balance = ceil(daily_rate * 1.2) ≈ 120 для Pro (daily_rate~100)")
    print("   Если balance=25 — reseed НЕ применялся к этой БД или запускался на другой base-url")
    print()

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

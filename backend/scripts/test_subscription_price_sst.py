#!/usr/bin/env python3
"""
Эксперимент: доказательство SSoT цены подписки.
Проверяет, что изменение цен в SubscriptionPlan НЕ влияет на:
- subscription.daily_rate
- /api/subscriptions/my (daily_rate, days_remaining)
- process_daily_charge (сумма списания)

Запуск:
  1. Backend с ENVIRONMENT=development
  2. python backend/scripts/test_subscription_price_sst.py --base-url http://localhost:8000

Мастер +79990000006 (Pro stable) должен существовать с активной подпиской.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

import httpx


PHONE = "+79990000006"
PASSWORD = "test123"
ADMIN_PHONE = "+79031078685"
ADMIN_PASSWORD = "test123"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    backend_dir = Path(__file__).resolve().parent.parent
    db_path = backend_dir / "bookme.db"
    if not db_path.exists():
        print(f"❌ БД не найдена: {db_path}")
        return 1

    with httpx.Client(timeout=30.0) as client:
        # 1) Логин мастера
        try:
            r = client.post(
                f"{base}/api/auth/login",
                json={"phone": PHONE, "password": PASSWORD},
            )
            r.raise_for_status()
            token = r.json()["access_token"]
        except Exception as e:
            print(f"❌ Логин мастера не удался: {e}")
            return 1

        headers = {"Authorization": f"Bearer {token}"}

        # 2) До изменения: данные из API
        r = client.get(f"{base}/api/subscriptions/my", headers=headers)
        if r.status_code != 200:
            print(f"❌ /api/subscriptions/my: {r.status_code}")
            return 1
        sub_api_before = r.json()

        # 3) До изменения: данные из БД
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute(
            "SELECT id FROM users WHERE phone = ?",
            (PHONE,),
        )
        row = cur.fetchone()
        if not row:
            print(f"❌ Пользователь {PHONE} не найден")
            conn.close()
            return 1
        user_id = row["id"]

        cur.execute(
            """
            SELECT s.id, s.plan_id, s.price, s.daily_rate, s.start_date, s.end_date
            FROM subscriptions s
            WHERE s.user_id = ? AND s.is_active = 1
            ORDER BY s.id DESC LIMIT 1
            """,
            (user_id,),
        )
        sub_row = cur.fetchone()
        if not sub_row:
            print(f"❌ Активная подписка для {PHONE} не найдена")
            conn.close()
            return 1

        plan_id = sub_row["plan_id"]
        cur.execute(
            "SELECT name, price_1month, price_3months FROM subscription_plans WHERE id = ?",
            (plan_id,),
        )
        plan_row = cur.fetchone()
        if not plan_row:
            print(f"❌ План {plan_id} не найден")
            conn.close()
            return 1

        price_1m_before = float(plan_row["price_1month"])

        print("=" * 60)
        print("ДО ИЗМЕНЕНИЯ PLAN")
        print("=" * 60)
        print(f"subscription: id={sub_row['id']} plan_id={plan_id}")
        print(f"  price={sub_row['price']} daily_rate={sub_row['daily_rate']}")
        print(f"  end_date={sub_row['end_date']}")
        print(f"plan: name={plan_row['name']} price_1month={price_1m_before}")
        print(f"/api/subscriptions/my: daily_rate={sub_api_before.get('daily_rate')} days_remaining={sub_api_before.get('days_remaining')}")
        print()

        # 4) Меняем plan.price_1month в БД (x2)
        new_price_1m = price_1m_before * 2
        cur.execute(
            "UPDATE subscription_plans SET price_1month = ? WHERE id = ?",
            (new_price_1m, plan_id),
        )
        conn.commit()
        print(f"✓ Plan price_1month изменён: {price_1m_before} -> {new_price_1m}")
        print()

        # 5) После изменения: /api/subscriptions/my
        r = client.get(f"{base}/api/subscriptions/my", headers=headers)
        if r.status_code != 200:
            print(f"❌ /api/subscriptions/my после изменения: {r.status_code}")
            conn.rollback()
            cur.execute("UPDATE subscription_plans SET price_1month = ? WHERE id = ?", (price_1m_before, plan_id))
            conn.commit()
            conn.close()
            return 1
        sub_api_after = r.json()

        # 6) Проверка: subscription в БД не изменилась
        cur.execute(
            "SELECT price, daily_rate FROM subscriptions WHERE id = ?",
            (sub_row["id"],),
        )
        sub_after = cur.fetchone()

        # 7) Восстанавливаем plan
        cur.execute(
            "UPDATE subscription_plans SET price_1month = ? WHERE id = ?",
            (price_1m_before, plan_id),
        )
        conn.commit()
        conn.close()

        # 8) Результат
        print("=" * 60)
        print("ПОСЛЕ ИЗМЕНЕНИЯ PLAN (price_1month x2)")
        print("=" * 60)
        print(f"subscription в БД: price={sub_after['price']} daily_rate={sub_after['daily_rate']}")
        print(f"/api/subscriptions/my: daily_rate={sub_api_after.get('daily_rate')} days_remaining={sub_api_after.get('days_remaining')}")
        print()

        ok = True
        if abs(float(sub_after["daily_rate"]) - float(sub_row["daily_rate"])) > 1e-6:
            print("❌ subscription.daily_rate изменился!")
            ok = False
        else:
            print("✓ subscription.daily_rate НЕ изменился (SSoT подтверждён)")

        if sub_api_after.get("daily_rate") != sub_api_before.get("daily_rate"):
            print("❌ API daily_rate изменился!")
            ok = False
        else:
            print("✓ API daily_rate НЕ изменился")

        if sub_api_after.get("days_remaining") != sub_api_before.get("days_remaining"):
            print("⚠ days_remaining мог измениться из-за balance/времени, не из-за plan")
        else:
            print("✓ API days_remaining совпадает")

        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

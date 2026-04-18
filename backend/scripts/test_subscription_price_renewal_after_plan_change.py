#!/usr/bin/env python3
"""
Регресс-тест: продление подписки после смены цен в SubscriptionPlan.

Ожидаемое поведение:
- Существующая подписка НЕ меняет price/daily_rate при изменении plan.
- Новая покупка/продление ПОСЛЕ изменения цены создаёт подписку с НОВЫМИ snapshot значениями.

Запуск:
  Backend с ENVIRONMENT=development.
  python backend/scripts/test_subscription_price_renewal_after_plan_change.py --base-url http://localhost:8000

Требует: мастер +79990000006 (Pro stable), админ +79031078685.
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


def _db_subscription(cur, user_id):
    cur.execute(
        """
        SELECT s.id, s.plan_id, s.price, s.daily_rate, s.start_date, s.end_date
        FROM subscriptions s
        WHERE s.user_id = ? AND s.is_active = 1
        ORDER BY s.id DESC LIMIT 1
        """,
        (user_id,),
    )
    return cur.fetchone()


def _db_plan(cur, plan_id):
    cur.execute(
        "SELECT name, price_1month FROM subscription_plans WHERE id = ?",
        (plan_id,),
    )
    return cur.fetchone()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    backend_dir = Path(__file__).resolve().parent.parent
    db_path = backend_dir / "bookme.db"
    if not db_path.exists():
        print("❌ БД не найдена:", db_path)
        return 1

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE phone = ?", (PHONE,))
    row = cur.fetchone()
    if not row:
        print(f"❌ Мастер {PHONE} не найден")
        conn.close()
        return 1
    user_id = row["id"]

    with httpx.Client(timeout=30.0) as client:
        # === BEFORE ===
        sub_before = _db_subscription(cur, user_id)
        if not sub_before:
            print(f"❌ Активная подписка для {PHONE} не найдена")
            conn.close()
            return 1

        plan_id = sub_before["plan_id"]
        plan_before = _db_plan(cur, plan_id)
        price_1m_original = float(plan_before["price_1month"])

        r = client.post(f"{base}/api/auth/login", json={"phone": PHONE, "password": PASSWORD})
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = client.get(f"{base}/api/subscriptions/my", headers=headers)
        r.raise_for_status()
        api_before = r.json()

        print("=" * 60)
        print("BEFORE")
        print("=" * 60)
        print(f"subscription: id={sub_before['id']} price={sub_before['price']} daily_rate={sub_before['daily_rate']}")
        print(f"plan: price_1month={price_1m_original}")
        print(f"API: daily_rate={api_before.get('daily_rate')} days_remaining={api_before.get('days_remaining')}")
        print()

        # === CHANGE PLAN PRICE ===
        new_price_1m = price_1m_original * 2
        cur.execute("UPDATE subscription_plans SET price_1month = ? WHERE id = ?", (new_price_1m, plan_id))
        conn.commit()
        print(">>> Plan price_1month изменён:", price_1m_original, "->", new_price_1m)
        print()

        # === AFTER CHANGE (no renewal) ===
        sub_after_change = _db_subscription(cur, user_id)
        r = client.get(f"{base}/api/subscriptions/my", headers=headers)
        r.raise_for_status()
        api_after_change = r.json()

        print("=" * 60)
        print("AFTER PLAN CHANGE (без продления)")
        print("=" * 60)
        print(f"subscription: price={sub_after_change['price']} daily_rate={sub_after_change['daily_rate']}")
        print(f"API: daily_rate={api_after_change.get('daily_rate')} days_remaining={api_after_change.get('days_remaining')}")
        if abs(float(sub_after_change["daily_rate"]) - float(sub_before["daily_rate"])) > 1e-6:
            print("❌ subscription изменилась при изменении plan!")
            conn.rollback()
            cur.execute("UPDATE subscription_plans SET price_1month = ? WHERE id = ?", (price_1m_original, plan_id))
            conn.commit()
            conn.close()
            return 1
        print("✓ Существующая подписка не изменилась")
        print()

        # === RENEWAL via dev set_subscription ===
        r = client.post(
            f"{base}/api/auth/login",
            json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD},
        )
        r.raise_for_status()
        admin_token = r.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        r = client.post(
            f"{base}/api/dev/testdata/set_subscription",
            headers=admin_headers,
            json={"phone": PHONE, "plan_id": plan_id, "duration_months": 1},
        )
        if r.status_code != 200:
            print("❌ set_subscription failed:", r.status_code, r.text)
            cur.execute("UPDATE subscription_plans SET price_1month = ? WHERE id = ?", (price_1m_original, plan_id))
            conn.commit()
            conn.close()
            return 1

        set_resp = r.json()
        print(">>> Выполнено продление (set_subscription 1 мес)")
        print(f"    total_price={set_resp.get('total_price')} daily_rate={set_resp.get('daily_rate')}")
        print()

        conn.commit()

        # === AFTER RENEWAL ===
        sub_after_renewal = _db_subscription(cur, user_id)
        r = client.get(f"{base}/api/subscriptions/my", headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        api_after_renewal = r.json()

        expected_total = 3000  # ceil(3000) * 1
        expected_daily = expected_total / 30  # 100

        print("=" * 60)
        print("AFTER RENEWAL")
        print("=" * 60)
        print(f"subscription: id={sub_after_renewal['id']} price={sub_after_renewal['price']} daily_rate={sub_after_renewal['daily_rate']}")
        print(f"API: daily_rate={api_after_renewal.get('daily_rate')} days_remaining={api_after_renewal.get('days_remaining')}")
        print(f"Ожидаемо (price_1month={new_price_1m}): total_price={expected_total} daily_rate={expected_daily}")
        print()

        ok = True
        if abs(float(sub_after_renewal["price"]) - expected_total) > 1:
            print(f"❌ subscription.price: ожидалось ~{expected_total}, получено {sub_after_renewal['price']}")
            ok = False
        else:
            print("✓ subscription.price соответствует новой цене плана")

        if abs(float(sub_after_renewal["daily_rate"]) - expected_daily) > 1:
            print(f"❌ subscription.daily_rate: ожидалось ~{expected_daily}, получено {sub_after_renewal['daily_rate']}")
            ok = False
        else:
            print("✓ subscription.daily_rate = total_price / 30")

        if abs(float(api_after_renewal.get("daily_rate", 0)) - expected_daily) > 1:
            print("❌ API daily_rate не совпадает с subscription")
            ok = False
        else:
            print("✓ API отражает новый snapshot")

        # Restore plan
        cur.execute("UPDATE subscription_plans SET price_1month = ? WHERE id = ?", (price_1m_original, plan_id))
        conn.commit()
        conn.close()

        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

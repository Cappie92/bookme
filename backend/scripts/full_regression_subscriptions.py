#!/usr/bin/env python3
"""
Full regression: подписки и daily charges на 8 тестовых мастеров.

Запуск:
  python backend/scripts/full_regression_subscriptions.py --base-url http://localhost:8000
  python backend/scripts/full_regression_subscriptions.py --base-url http://localhost:8000 --no-reseed --date1 2026-02-01

Требует: ENVIRONMENT=development, backend запущен, админ +79031078685.
См. docs/README_SUBSCRIPTION_SST.md
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

ADMIN_PHONE = "+79031078685"
ADMIN_PASSWORD = "test123"
MASTER_PASSWORD = "test123"

# phone -> (plan_name, scenario)
MASTERS = [
    ("+79990000000", "Free", "free"),
    ("+79990000001", "Free", "free"),
    ("+79990000002", "Basic", "stable"),
    ("+79990000003", "Basic", "low"),
    ("+79990000004", "Standard", "stable"),
    ("+79990000005", "Standard", "low"),
    ("+79990000006", "Pro", "stable"),
    ("+79990000007", "Pro", "low"),
]


def login(client: httpx.Client, base: str, phone: str, password: str) -> str:
    r = client.post(f"{base}/api/auth/login", json={"phone": phone, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def get_snapshot(client: httpx.Client, base: str, token: str, db_path: Path | None, user_id: int | None):
    """Собрать snapshot подписки и баланса. /api/subscriptions/my — read-only (404 при отсутствии)."""
    headers = {"Authorization": f"Bearer {token}"}
    sub = None
    bal = None
    status = None
    try:
        r = client.get(f"{base}/api/balance/subscription-status", headers=headers)
        if r.status_code == 200:
            status = r.json()
        r = client.get(f"{base}/api/balance/", headers=headers)
        if r.status_code == 200:
            bal = r.json()
        r = client.get(f"{base}/api/subscriptions/my", headers=headers)
        if r.status_code == 200:
            sub = r.json()
        elif r.status_code == 404:
            sub = {
                "plan_name": status.get("plan_name") if status else None,
                "daily_rate": status.get("daily_rate") if status else None,
                "days_remaining": status.get("days_remaining") if status else None,
                "end_date": status.get("end_date") if status else None,
            }
    except Exception as e:
        return {"error": str(e), "sub": sub, "bal": bal, "status": status}

    days = sub.get("days_remaining") if sub else None
    if days is None and sub and sub.get("end_date"):
        from datetime import datetime as dt
        end = dt.fromisoformat(sub["end_date"].replace("Z", "+00:00"))
        days = max(0, (end - dt.utcnow()).days)

    return {
        "plan": sub.get("plan_name") if sub else None,
        "daily_rate": sub.get("daily_rate") if sub else None,
        "days_remaining": days,
        "balance": bal.get("available_balance") if bal else bal.get("balance") if bal else None,
        "status": status.get("status") if status else "?",
        "is_active": status.get("is_active") if status else None,
        "user_id": user_id,
    }


def get_charge_status(db_path: Path, user_id: int, charge_date: str) -> str | None:
    """Получить статус списания для user на дату из daily_subscription_charges."""
    if not db_path.exists() or not user_id:
        return None
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    cur = conn.execute(
        """
        SELECT c.status FROM daily_subscription_charges c
        JOIN subscriptions s ON c.subscription_id = s.id
        WHERE s.user_id = ? AND c.charge_date = ?
        ORDER BY c.id DESC LIMIT 1
        """,
        (user_id, charge_date),
    )
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


def has_active_subscription(db_path: Path, user_id: int) -> bool:
    """Проверить наличие активной подписки у user (для low-balance после FAIL)."""
    if not db_path.exists() or not user_id:
        return False
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    cur = conn.execute(
        "SELECT 1 FROM subscriptions WHERE user_id = ? AND is_active = 1 LIMIT 1",
        (user_id,),
    )
    row = cur.fetchone()
    conn.close()
    return row is not None


def main() -> int:
    ap = argparse.ArgumentParser(description="Full regression: подписки + daily charges")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--date1", default=None, help="YYYY-MM-DD")
    ap.add_argument("--date2", default=None, help="YYYY-MM-DD (default: date1+1)")
    ap.add_argument("--run-reseed", action="store_true", default=True)
    ap.add_argument("--no-reseed", dest="run_reseed", action="store_false")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    backend_dir = Path(__file__).resolve().parent.parent
    db_path = backend_dir / "bookme.db"

    today = date.today()
    date1 = datetime.strptime(args.date1, "%Y-%m-%d").date() if args.date1 else today
    date2 = (
        datetime.strptime(args.date2, "%Y-%m-%d").date()
        if args.date2
        else date1 + timedelta(days=1)
    )

    print("=" * 70)
    print("FULL REGRESSION: Subscriptions & Daily Charges")
    print("=" * 70)
    print(f"base_url={base}  date1={date1}  date2={date2}  run_reseed={args.run_reseed}")
    print()

    # 1) Reseed
    if args.run_reseed:
        print(">>> Запуск reseed...")
        res = subprocess.run(
            [sys.executable, str(backend_dir / "scripts" / "reseed_local_test_data.py"), f"--base-url={base}", "--no-salon"],
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if res.returncode not in (0, 2):
            print(f" reseed failed: {res.returncode}")
            print(res.stderr[:500] if res.stderr else res.stdout[:500])
            return 1
        if res.returncode == 2:
            print(" reseed OK (с предупреждениями, например брони)")
        else:
            print(" reseed OK")
        print()

    # 2) Admin login
    with httpx.Client(timeout=60.0) as client:
        try:
            admin_token = login(client, base, ADMIN_PHONE, ADMIN_PASSWORD)
        except Exception as e:
            print(f"Admin login failed: {e}")
            return 1

        # 3) User IDs (для запроса charges)
        user_ids = {}
        try:
            r = client.get(f"{base}/api/auth/users/me", headers={"Authorization": f"Bearer {admin_token}"})
        except Exception:
            pass

        # Get user ids from DB for charge lookup
        if db_path.exists():
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            for phone, _plan, _scenario in MASTERS:
                cur = conn.execute("SELECT id FROM users WHERE phone = ?", (phone,))
                row = cur.fetchone()
                user_ids[phone] = row[0] if row else None
            conn.close()

        # 4) Snapshot BEFORE
        print(">>> Snapshot BEFORE charges...")
        snap_before = {}
        for phone, plan_name, scenario in MASTERS:
            try:
                token = login(client, base, phone, MASTER_PASSWORD)
                snap = get_snapshot(client, base, token, db_path, user_ids.get(phone))
                snap_before[phone] = snap
            except Exception as e:
                snap_before[phone] = {"error": str(e)}
        print()

        # 5) Run daily charges date1, date2
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        for d in [date1, date2]:
            print(f">>> Daily charges {d}...")
            r = client.post(
                f"{base}/api/dev/testdata/run_daily_charges",
                params={"date_str": d.isoformat()},
                headers=admin_headers,
            )
            if r.status_code != 200:
                print(f" FAIL: {r.status_code} {r.text[:200]}")
                return 1
            j = r.json()
            print(f" processed={j.get('processed_total')} success={j.get('success_count')} failed={j.get('failed_count')} deactivated={j.get('deactivated_count')}")
        print()

        # 6) Snapshot AFTER date1
        print(">>> Snapshot AFTER date1...")
        snap_after1 = {}
        for phone, _plan, _scenario in MASTERS:
            try:
                token = login(client, base, phone, MASTER_PASSWORD)
                snap = get_snapshot(client, base, token, db_path, user_ids.get(phone))
                snap_after1[phone] = snap
            except Exception as e:
                snap_after1[phone] = {"error": str(e)}

        # 7) Snapshot AFTER date2
        print(">>> Snapshot AFTER date2...")
        snap_after2 = {}
        for phone, _plan, _scenario in MASTERS:
            try:
                token = login(client, base, phone, MASTER_PASSWORD)
                snap = get_snapshot(client, base, token, db_path, user_ids.get(phone))
                snap_after2[phone] = snap
            except Exception as e:
                snap_after2[phone] = {"error": str(e)}
        print()

    # 8) Charge statuses from DB
    charge1 = {}
    charge2 = {}
    for phone, _plan, _scenario in MASTERS:
        uid = user_ids.get(phone)
        charge1[phone] = get_charge_status(db_path, uid, date1.isoformat()) if uid else None
        charge2[phone] = get_charge_status(db_path, uid, date2.isoformat()) if uid else None

    # 9) Table
    print("=" * 100)
    print("РЕЗУЛЬТАТЫ")
    print("=" * 100)
    header = (
        "phone | plan | scenario | balance_before | daily_rate | days_rem_bef | "
        f"ch1({date1}) | bal_a1 | days_a1 | "
        f"ch2({date2}) | bal_a2 | status_a2 | PASS/FAIL"
    )
    print(header)
    print("-" * 100)

    all_ok = True
    for phone, plan_name, scenario in MASTERS:
        b = snap_before.get(phone) or {}
        a1 = snap_after1.get(phone) or {}
        a2 = snap_after2.get(phone) or {}

        bal_b = b.get("balance")
        dr = b.get("daily_rate")
        days_b = b.get("days_remaining")
        ch1 = charge1.get(phone) or "—"
        bal_a1 = a1.get("balance")
        days_a1 = a1.get("days_remaining")
        ch2 = charge2.get(phone) or "—"
        bal_a2 = a2.get("balance")
        status_a2 = a2.get("status", "?")
        uid = user_ids.get(phone)
        has_active = has_active_subscription(db_path, uid) if uid else None
        no_subscription_actual = (status_a2 == "no_subscription") or (
            scenario == "low" and has_active is False
        )
        status_display = "no_sub" if (no_subscription_actual and scenario == "low") else status_a2

        # Autochecks
        fail_reasons = []
        if scenario == "free":
            # Free: SUCCESS с amount=0 допустим, списаний по сути нет
            if ch1 and ch1.upper() not in ("SUCCESS", "PENDING", "—"):
                fail_reasons.append(f"free: unexpected ch1={ch1}")
        elif scenario == "low":
            if not no_subscription_actual:
                fail_reasons.append(
                    f"low: expected no active subscription after date2 (API={status_a2}, DB has_active={has_active})"
                )
            if ch1 and ch1.lower() != "success":
                fail_reasons.append(f"low: date1 expected SUCCESS, got {ch1}")
            if ch2 and ch2.lower() != "failed":
                fail_reasons.append(f"low: date2 expected FAILED, got {ch2}")
        elif scenario == "stable":
            if status_a2 == "no_subscription":
                fail_reasons.append("stable: unexpected no_subscription after date2")
            if days_b is not None and days_b < 20 and plan_name != "Free":
                fail_reasons.append(f"stable: days_remaining={days_b} expected >=20")
            if ch1 and ch1.lower() not in ("success",):
                fail_reasons.append(f"stable: date1 expected SUCCESS, got {ch1}")
            if ch2 and ch2.lower() not in ("success",):
                fail_reasons.append(f"stable: date2 expected SUCCESS, got {ch2}")

        passed = len(fail_reasons) == 0
        if not passed:
            all_ok = False
        result = "PASS" if passed else f"FAIL: {'; '.join(fail_reasons)}"

        def _fmt(v):
            if v is None:
                return "—"
            if isinstance(v, float):
                return f"{v:.0f}" if v == int(v) else f"{v:.1f}"
            return str(v)

        row = (
            f"{phone} | {plan_name} | {scenario} | {_fmt(bal_b)} | {_fmt(dr)} | {_fmt(days_b)} | "
            f"{ch1 or '—'} | {_fmt(bal_a1)} | {_fmt(days_a1)} | "
            f"{ch2 or '—'} | {_fmt(bal_a2)} | {status_display} | {result}"
        )
        print(row)

    print()
    print("=" * 100)
    if all_ok:
        print("ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
    else:
        print("ЕСТЬ ОШИБКИ — см. FAIL в таблице выше")
    print()
    print("Запуск: python backend/scripts/full_regression_subscriptions.py --base-url http://localhost:8000")
    print("Без reseed: --no-reseed")
    print("См. docs/README_SUBSCRIPTION_SST.md")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())

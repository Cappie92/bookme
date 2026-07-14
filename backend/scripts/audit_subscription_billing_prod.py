#!/usr/bin/env python3
"""
Read-only аудит subscription billing в production/staging.

Не изменяет БД. Не выводит секреты, env, токены, Robokassa credentials.

Примеры:
  cd backend
  python3 scripts/audit_subscription_billing_prod.py
  python3 scripts/audit_subscription_billing_prod.py --limit 50
  python3 scripts/audit_subscription_billing_prod.py --payment-id 42
  python3 scripts/audit_subscription_billing_prod.py --user-id 7 --limit 10

Exit codes:
  0 — все проверки прошли
  2 — есть нарушения инвариантов
  1 — техническая ошибка
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, List, Optional

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

_FORBIDDEN_OUTPUT_KEYS = frozenset(
    {
        "password",
        "password_1",
        "password_2",
        "token",
        "secret",
        "api_key",
        "robokassa",
        "credential",
        "env",
    }
)


def _json_print(obj: Any) -> None:
    text = json.dumps(obj, ensure_ascii=False, sort_keys=True)
    lowered = text.lower()
    for forbidden in _FORBIDDEN_OUTPUT_KEYS:
        if forbidden in lowered:
            raise RuntimeError(f"Refusing to print output containing forbidden key: {forbidden}")
    print(text)


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only audit subscription billing (paid/applied payments)."
    )
    parser.add_argument("--payment-id", type=int, default=None, help="Audit single payment by id")
    parser.add_argument("--user-id", type=int, default=None, help="Filter by user id")
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Max payments to audit (default: 20)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    try:
        from database import SessionLocal
        from utils.subscription_billing_audit import (
            audit_payment_from_db,
            fetch_subscription_payments,
            serialize_audit_report,
            summarize_audit_reports,
        )

        db = SessionLocal()
        try:
            payments = fetch_subscription_payments(
                db,
                payment_id=args.payment_id,
                user_id=args.user_id,
                limit=args.limit,
            )
            if not payments:
                _json_print(
                    {
                        "error": "no_matching_payments",
                        "payment_id": args.payment_id,
                        "user_id": args.user_id,
                        "limit": args.limit,
                    }
                )
                return 1

            reports = [audit_payment_from_db(db, payment) for payment in payments]
            for report in reports:
                _json_print(serialize_audit_report(report))

            summary = summarize_audit_reports(reports)
            _json_print({"summary": summary})

            return 0 if summary["failed"] == 0 else 2
        finally:
            db.close()
    except Exception as exc:
        _json_print({"error": "technical_failure", "message": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())

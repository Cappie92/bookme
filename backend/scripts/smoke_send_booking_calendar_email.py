#!/usr/bin/env python3
"""
Smoke: отправка "реального" письма календаря по существующей записи (booking) по public_reference.

Цель: проверить end-to-end цепочку:
  Booking (DB) -> build_booking_ics -> build_booking_calendar_email_bodies -> provider.send_message -> Unisender multipart attachments

Важно:
- Скрипт НЕ создаёт booking.
- Скрипт НЕ изменяет бизнес-данные, кроме факта отправки письма.

Режим вложений Unisender (диагностика):
  UNISENDER_ATTACHMENTS_MODE=multipart   # по умолчанию: httpx data + files
  UNISENDER_ATTACHMENTS_MODE=form_data # вложения в теле application/x-www-form-urlencoded

Запуск (из каталога backend):
  EMAIL_ENABLED=true EMAIL_PROVIDER=unisender python3 scripts/smoke_send_booking_calendar_email.py --ref ABC123 --to you@example.com
  UNISENDER_ATTACHMENTS_MODE=form_data EMAIL_ENABLED=true EMAIL_PROVIDER=unisender python3 scripts/smoke_send_booking_calendar_email.py --ref ABC123 --to you@example.com
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy.orm import Session

# Репозиторий: backend/ — корень импортов
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from database import SessionLocal
from models import Booking
from services.email.booking_calendar import send_client_booking_calendar_email
from services.email.factory import build_transactional_provider
from settings import get_settings


def _resolve_master_tz(booking: Booking) -> str | None:
    try:
        if booking.indie_master:
            tz = getattr(booking.indie_master, "timezone", None)
        elif booking.master:
            tz = getattr(booking.master, "timezone", None)
        elif booking.salon:
            tz = getattr(booking.salon, "timezone", None)
        else:
            tz = None
        if tz is not None and str(tz).strip():
            return str(tz).strip()
        return None
    except Exception:
        return None


def _main_sync() -> int:
    parser = argparse.ArgumentParser(description="Smoke: booking calendar email flow (by public_reference).")
    parser.add_argument("--ref", required=True, dest="public_reference", help="public_reference записи")
    parser.add_argument("--to", required=False, dest="to_email", help="override email получателя")
    parser.add_argument("--alarm", required=False, type=int, default=60, dest="alarm_minutes", help="alarm minutes (5..120)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

    ref = str(args.public_reference).strip()
    if not ref:
        print("ERROR: empty --ref", file=sys.stderr)
        return 1

    override_to = str(args.to_email).strip() if args.to_email else None

    db: Session = SessionLocal()
    try:
        booking = db.query(Booking).filter(Booking.public_reference == ref).first()
        if not booking:
            print(f"ERROR: booking not found by public_reference={ref}", file=sys.stderr)
            return 1

        # Принудительно инициализируем провайдер (чтобы сразу увидеть, что это unisender/stub).
        settings = get_settings()
        print(
            "UNISENDER_ATTACHMENTS_MODE (env):",
            (settings.UNISENDER_ATTACHMENTS_MODE or "multipart").strip().lower(),
        )
        provider = build_transactional_provider()
        print("provider_class:", type(provider).__name__)
        if hasattr(provider, "attachments_mode"):
            print("provider.attachments_mode:", getattr(provider, "attachments_mode"))

        master_tz = _resolve_master_tz(booking)
        if not master_tz:
            print("ERROR: master timezone missing for booking_id=", booking.id, file=sys.stderr)
            return 1

        to_email = override_to
        if not to_email:
            em = getattr(getattr(booking, "client", None), "email", None)
            to_email = str(em).strip() if em else ""
        if not to_email:
            print("ERROR: recipient email missing; pass --to", file=sys.stderr)
            return 1

        svc_name = getattr(getattr(booking, "service", None), "name", None)
        print("booking_id:", booking.id)
        print("public_reference:", booking.public_reference)
        print("service_name:", svc_name)
        print("start_time:", booking.start_time)
        print("end_time:", booking.end_time)
        print("master_tz:", master_tz)
        print("to:", to_email)

        result = asyncio.run(
            send_client_booking_calendar_email(
                booking,
                master_tz,
                to_email,
                int(args.alarm_minutes),
            )
        )
        print("result:", result)
        return 0 if result.get("success") else 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(_main_sync())


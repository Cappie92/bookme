#!/usr/bin/env python3
"""
Диагностика статусов записей.
Использование: python scripts/diagnose_booking_status.py [booking_id]

Без аргументов: список будущих записей с awaiting_confirmation (legacy).
С booking_id: детальная диагностика конкретной записи.
"""
import os
import sys
from datetime import datetime

# Добавляем корень backend в path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
from utils.booking_status import get_effective_booking_status


def diagnose_booking(booking_id: int) -> None:
    """Детальная диагностика одной записи."""
    from models import Booking, BookingStatus

    db = SessionLocal()
    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if not booking:
            print(f"Запись {booking_id} не найдена")
            return

        now = datetime.utcnow()
        effective = get_effective_booking_status(booking, db, now=now)
        is_future = booking.start_time > now
        is_past = not is_future

        print("=" * 60)
        print(f"Диагностика записи #{booking_id}")
        print("=" * 60)
        print(f"  booking_id:     {booking.id}")
        print(f"  start_time:     {booking.start_time} (UTC)")
        print(f"  status (БД):    {booking.status}")
        print(f"  effective:      {effective}")
        print(f"  is_future:      {is_future}")
        print(f"  is_past:        {is_past}")
        print()
        if effective == BookingStatus.AWAITING_CONFIRMATION:
            if is_future:
                print("  ⚠ ПРОБЛЕМА: Будущая запись показывает 'На подтверждение'.")
                print("    Причина: legacy awaiting_confirmation в БД (до миграции).")
                print("    Решение: выполнить миграцию 20260128_fix_future_aw")
            else:
                print("  OK: Прошлая запись, требует post-visit подтверждения.")
        else:
            print("  OK: Запись не в состоянии 'На подтверждение'.")
        print("=" * 60)
    finally:
        db.close()


def list_future_awaiting(db) -> int:
    """Список будущих записей с awaiting_confirmation. Возвращает количество."""
    result = db.execute(
        text(
            """
        SELECT id, start_time, status
        FROM bookings
        WHERE status = 'awaiting_confirmation'
          AND start_time > datetime('now')
        ORDER BY start_time
        """
        )
    )
    rows = result.fetchall()
    if not rows:
        print("Будущих записей с awaiting_confirmation не найдено.")
        return 0
    print(f"Найдено {len(rows)} будущих записей с awaiting_confirmation (legacy):")
    for r in rows:
        print(f"  id={r[0]}, start_time={r[1]}, status={r[2]}")
    return len(rows)


def main() -> None:
    db = SessionLocal()
    try:
        if len(sys.argv) > 1:
            try:
                bid = int(sys.argv[1])
                diagnose_booking(bid)
            except ValueError:
                print("Использование: python scripts/diagnose_booking_status.py [booking_id]")
        else:
            n = list_future_awaiting(db)
            if n > 0:
                print()
                print("Выполните миграцию: alembic upgrade head")
    finally:
        db.close()


if __name__ == "__main__":
    main()

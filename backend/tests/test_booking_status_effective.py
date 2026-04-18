"""
Unit-тесты get_effective_booking_status.
Проверяет: future/past × created/confirmed/awaiting_confirmation.
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import Booking, BookingStatus, Master, Service, User, UserRole
from utils.booking_status import get_effective_booking_status


def _create_booking(db, *, status: BookingStatus, start_time: datetime) -> Booking:
    """Создаёт минимальную запись для тестов."""
    user = User(
        email="client@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001111111",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0)
    db.add(master)
    db.commit()
    db.refresh(master)

    service = Service(name="Test", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    booking = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start_time,
        end_time=start_time + timedelta(hours=1),
        status=status,
        payment_amount=500,
        loyalty_points_used=0,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def test_future_created_returns_created(db):
    """future + created → created (без перехода в awaiting_confirmation)."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.CREATED, start_time=now + timedelta(hours=1))
    effective = get_effective_booking_status(booking, db, now=now + timedelta(minutes=30))
    assert effective == BookingStatus.CREATED
    # Объект не мутирован
    db.refresh(booking)
    assert booking.status == BookingStatus.CREATED


def test_future_confirmed_returns_confirmed(db):
    """future + confirmed → confirmed."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.CONFIRMED, start_time=now + timedelta(hours=1))
    effective = get_effective_booking_status(booking, db, now=now + timedelta(minutes=30))
    assert effective == BookingStatus.CONFIRMED


def test_future_awaiting_confirmation_returns_confirmed_legacy(db):
    """future + awaiting_confirmation (legacy) → confirmed. Будущие никогда не "На подтверждение"."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.AWAITING_CONFIRMATION, start_time=now + timedelta(hours=1))
    effective = get_effective_booking_status(booking, db, now=now + timedelta(minutes=30))
    assert effective == BookingStatus.CONFIRMED
    db.refresh(booking)
    assert booking.status == BookingStatus.AWAITING_CONFIRMATION  # в БД не меняется


def test_past_created_returns_awaiting_confirmation(db):
    """past + created → awaiting_confirmation (needs post-visit outcome)."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.CREATED, start_time=now - timedelta(hours=2))
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.AWAITING_CONFIRMATION


def test_past_confirmed_returns_confirmed(db):
    """past + confirmed → confirmed. Post-visit кнопка доступна по needsOutcome (confirmed в списке)."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.CONFIRMED, start_time=now - timedelta(hours=2))
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.CONFIRMED


def test_past_awaiting_confirmation_returns_awaiting_confirmation(db):
    """past + awaiting_confirmation → awaiting_confirmation (needs outcome)."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.AWAITING_CONFIRMATION, start_time=now - timedelta(hours=2))
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.AWAITING_CONFIRMATION


def test_past_created_within_1_minute_returns_created(db):
    """past + created, но менее 1 минуты после start_time → created (не переходим сразу)."""
    now = datetime.utcnow()
    booking = _create_booking(db, status=BookingStatus.CREATED, start_time=now - timedelta(seconds=30))
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.CREATED


def test_completed_unchanged(db):
    """COMPLETED не меняется."""
    now = datetime.utcnow()
    past = now - timedelta(hours=2)
    booking = _create_booking(db, status=BookingStatus.COMPLETED, start_time=past)
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.COMPLETED


def test_cancelled_unchanged(db):
    """CANCELLED не меняется."""
    now = datetime.utcnow()
    past = now - timedelta(hours=2)
    booking = _create_booking(db, status=BookingStatus.CANCELLED, start_time=past)
    effective = get_effective_booking_status(booking, db, now=now)
    assert effective == BookingStatus.CANCELLED

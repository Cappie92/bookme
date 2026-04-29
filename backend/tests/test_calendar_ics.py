"""Тесты ICS-генератора и гарда timezone при создании записи."""
from datetime import datetime, timedelta
from unittest.mock import MagicMock
import pytz

import pytest

from utils.calendar_ics import build_booking_ics, ensure_utc_aware


def test_ensure_utc_aware_naive():
    """naive datetime -> treat as UTC, make aware."""
    dt = datetime(2025, 2, 5, 14, 30, 0)
    result = ensure_utc_aware(dt)
    assert result.tzinfo is not None
    assert result.tzinfo == pytz.UTC
    assert result.year == 2025 and result.month == 2 and result.day == 5


def test_ensure_utc_aware_already_aware():
    """aware datetime -> convert to UTC."""
    tz = pytz.timezone("Europe/Moscow")
    dt = tz.localize(datetime(2025, 2, 5, 17, 30, 0))
    result = ensure_utc_aware(dt)
    assert result.tzinfo == pytz.UTC
    assert result.hour == 14  # MSK+3 -> UTC


def test_build_booking_ics_contains_required_fields():
    """ICS: UID, DTSTART/DTEND в UTC (Z) как в Google, VALARM, SUMMARY."""
    booking = MagicMock()
    booking.id = 42
    booking.start_time = datetime(2025, 2, 10, 12, 0, 0)
    booking.end_time = datetime(2025, 2, 10, 13, 0, 0)
    booking.status = "created"
    booking.service = MagicMock(name="Стрижка")
    booking.master = MagicMock(user=MagicMock(full_name="Иван"), address=None, city=None)
    booking.indie_master = None
    booking.branch = None

    ics = build_booking_ics(booking, "Europe/Moscow", alarm_minutes=60)

    assert "UID:booking-42@dedato" in ics
    # naive = локальное Europe/Moscow: 12:00 MSK → 09:00 UTC (зима, +3)
    assert "DTSTART:20250210T090000Z" in ics
    assert "DTEND:20250210T100000Z" in ics
    assert "SUMMARY:" in ics
    assert "Стрижка" in ics or "—" in ics
    assert "Иван" in ics or "—" in ics
    assert "BEGIN:VALARM" in ics
    assert "TRIGGER:-PT60M" in ics
    assert "END:VALARM" in ics
    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics


def test_create_booking_master_without_timezone_returns_400(client, db):
    """Мастер без timezone -> POST /api/client/bookings/ возвращает 400."""
    from auth import get_password_hash
    from models import Master, Service, SalonMasterServiceSettings, User, UserRole

    client_user = User(
        email="client_tz@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001110001",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    master_user = User(
        email="master_tz@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79002220002",
        full_name="Master No TZ",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(client_user)
    db.add(master_user)
    db.commit()
    db.refresh(client_user)
    db.refresh(master_user)

    master = Master(user_id=master_user.id, bio="", experience_years=1, timezone=None)
    db.add(master)
    service = Service(name="Test", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(master)
    db.refresh(service)
    service_id = service.id
    master_id = master.id

    db.add(SalonMasterServiceSettings(
        master_id=master_id,
        service_id=service_id,
        is_active=True,
        master_payment_type="rub",
        master_payment_value=500,
    ))
    db.commit()

    login = client.post("/api/auth/login", json={"phone": client_user.phone, "password": "test123"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    start = __import__("datetime").datetime.utcnow() + __import__("datetime").timedelta(days=1)
    end = start + __import__("datetime").timedelta(hours=1)
    payload = {
        "service_id": service_id,
        "master_id": master_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "client_name": "Test Client",
        "service_name": "Test",
        "service_duration": 60,
        "service_price": 500,
    }

    resp = client.post("/api/client/bookings/", json=payload, headers=headers)
    assert resp.status_code == 400, resp.text
    assert "часовой пояс" in resp.json().get("detail", "").lower() or "timezone" in str(resp.json()).lower()


def test_get_future_bookings_skips_when_master_timezone_empty(client, db, monkeypatch):
    """При master.timezone пустой: DEBUG=0 — запись пропущена из ответа."""
    from auth import get_password_hash
    from models import Master, Service, User, UserRole, Booking, BookingStatus
    import routers.client as client_router

    monkeypatch.setattr(client_router, "MASTER_CANON_DEBUG", False)

    client_user = User(
        email="client_tz2@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001110002",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    master_user = User(
        email="master_tz2@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79002220003",
        full_name="Master No TZ",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(client_user)
    db.add(master_user)
    db.commit()
    db.refresh(client_user)
    db.refresh(master_user)

    master = Master(user_id=master_user.id, bio="", experience_years=1, timezone=None)
    db.add(master)
    service = Service(name="Test", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(master)
    db.refresh(service)

    # Создаём запись напрямую (write-path блокирует, но в БД может быть legacy)
    start = datetime.utcnow() + timedelta(days=1)
    end = start + timedelta(hours=1)
    booking = Booking(
        client_id=client_user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start,
        end_time=end,
        status=BookingStatus.CREATED.value,
    )
    db.add(booking)
    db.commit()
    booking_id = booking.id

    login = client.post("/api/auth/login", json={"phone": client_user.phone, "password": "test123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.get("/api/client/bookings/", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    assert isinstance(items, list)
    # Запись с master timezone=None должна быть пропущена
    assert all(b.get("master_timezone") for b in items), "all returned bookings must have master_timezone"
    booking_ids = [b["id"] for b in items]
    assert booking_id not in booking_ids, "booking with master timezone=None must be skipped"


def test_get_future_bookings_raises_when_master_timezone_empty_debug(client, db, monkeypatch):
    """При master.timezone пустой: DEBUG=1 — ожидаем exception/500."""
    from auth import get_password_hash
    from models import Master, Service, User, UserRole, Booking, BookingStatus
    import routers.client as client_router

    monkeypatch.setattr(client_router, "MASTER_CANON_DEBUG", True)

    client_user = User(
        email="client_tz3@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001110003",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    master_user = User(
        email="master_tz3@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79002220004",
        full_name="Master No TZ",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(client_user)
    db.add(master_user)
    db.commit()
    db.refresh(client_user)
    db.refresh(master_user)

    master = Master(user_id=master_user.id, bio="", experience_years=1, timezone=None)
    db.add(master)
    service = Service(name="Test", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(master)
    db.refresh(service)

    booking = Booking(
        client_id=client_user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=datetime.utcnow() + timedelta(days=1),
        end_time=datetime.utcnow() + timedelta(days=1, hours=1),
        status=BookingStatus.CREATED.value,
    )
    db.add(booking)
    db.commit()

    login = client.post("/api/auth/login", json={"phone": client_user.phone, "password": "test123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # DEBUG=1: при пустом timezone роут выбрасывает ValueError (fail-fast)
    with pytest.raises(ValueError, match="master timezone empty"):
        client.get("/api/client/bookings/", headers=headers)

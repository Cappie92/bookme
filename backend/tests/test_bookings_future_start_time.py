"""
Тест: /api/master/bookings/future возвращает start_time в ISO формате.
Гарантирует, что future записи корректно парсятся и не попадают в past.
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import Booking, BookingStatus, Master, Service, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_bookings_future_returns_start_time_iso(client, db):
    """Future endpoint возвращает start_time в ISO, future записи не в past."""
    user = User(
        email="master_future@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330001",
        full_name="Master Future",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0)
    db.add(master)
    db.commit()
    db.refresh(master)

    service = Service(name="Test", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    now = datetime.utcnow()
    future_start = now + timedelta(hours=2)
    future_end = future_start + timedelta(hours=1)

    booking = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=future_start,
        end_time=future_end,
        status=BookingStatus.CREATED,
        payment_amount=500,
        loyalty_points_used=0,
    )
    db.add(booking)
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/master/bookings/future?page=1&limit=10", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    bookings = data.get("bookings", [])
    assert len(bookings) >= 1

    for b in bookings:
        assert "start_time" in b, f"Бронь {b.get('id')} без start_time"
        raw = b["start_time"]
        assert raw, "start_time не должен быть пустым"
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        assert parsed > now, f"Future запись {raw} должна быть в будущем относительно now"
        assert raw.count("T") == 1 and "-" in raw, f"start_time должен быть ISO: {raw}"

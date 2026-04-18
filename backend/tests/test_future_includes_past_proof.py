"""
Интеграционный тест: GET /api/master/bookings/future — только start_time > now (UTC);
записи «сегодня, но уже прошедшие по часам» не попадают в future.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from auth import get_password_hash
from models import Booking, BookingStatus, Master, Service, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": "test123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_future_excludes_todays_past_slots_and_includes_later_today(client, db):
    user = User(
        email="master_future_sem@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330100",
        full_name="Master Future Sem",
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

    frozen_now = datetime.utcnow().replace(hour=14, minute=0, second=0, microsecond=0)
    today = frozen_now.date()
    past_booking_start = datetime.combine(today, datetime.min.time().replace(hour=10, minute=0, second=0, microsecond=0))
    future_booking_start = datetime.combine(today, datetime.min.time().replace(hour=18, minute=0, second=0, microsecond=0))

    booking_past = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=past_booking_start,
        end_time=past_booking_start + timedelta(hours=1),
        status=BookingStatus.CONFIRMED,
        payment_amount=500,
        loyalty_points_used=0,
    )
    booking_future = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=future_booking_start,
        end_time=future_booking_start + timedelta(hours=1),
        status=BookingStatus.CONFIRMED,
        payment_amount=500,
        loyalty_points_used=0,
    )
    db.add(booking_past)
    db.add(booking_future)
    db.commit()
    db.refresh(booking_past)
    db.refresh(booking_future)

    with patch("routers.master.datetime") as mock_dt:
        mock_dt.utcnow.return_value = frozen_now
        mock_dt.combine = datetime.combine
        mock_dt.strptime = datetime.strptime
        mock_dt.min = datetime.min

        headers = _auth_headers(client, user.phone, "test123")
        resp = client.get("/api/master/bookings/future?page=1&limit=20", headers=headers)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    bookings = data.get("bookings", [])
    ids = [b["id"] for b in bookings]

    assert booking_past.id not in ids, "Прошедшая сегодня запись не должна быть в future"
    assert booking_future.id in ids
    assert past_booking_start < frozen_now < future_booking_start


def test_future_excludes_completed_even_if_start_in_future(client, db):
    user = User(
        email="master_future_comp@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330101",
        full_name="Master Future Comp",
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

    service = Service(name="Test2", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    frozen_now = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
    st = frozen_now + timedelta(days=1)

    b_bad = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=st,
        end_time=st + timedelta(hours=1),
        status=BookingStatus.COMPLETED,
        payment_amount=500,
        loyalty_points_used=0,
    )
    db.add(b_bad)
    db.commit()
    db.refresh(b_bad)

    with patch("routers.master.datetime") as mock_dt:
        mock_dt.utcnow.return_value = frozen_now
        mock_dt.combine = datetime.combine
        mock_dt.strptime = datetime.strptime
        mock_dt.min = datetime.min

        headers = _auth_headers(client, user.phone, "test123")
        resp = client.get("/api/master/bookings/future?page=1&limit=20", headers=headers)

    assert resp.status_code == 200, resp.text
    ids = [x["id"] for x in resp.json().get("bookings", [])]
    assert b_bad.id not in ids


def test_detailed_bookings_excludes_completed_future_anomaly(client, db):
    """Календарь: GET /bookings/detailed не отдаёт completed с start_time в будущем (как future API)."""
    user = User(
        email="master_detailed@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330102",
        full_name="Master Detailed",
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

    service = Service(name="SvcD", price=100, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    now = datetime.utcnow()
    st_future = now + timedelta(days=2)
    st_past = now - timedelta(days=2)

    b_future_bad = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=st_future,
        end_time=st_future + timedelta(hours=1),
        status=BookingStatus.COMPLETED,
        payment_amount=100,
        loyalty_points_used=0,
    )
    b_past_ok = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=st_past,
        end_time=st_past + timedelta(hours=1),
        status=BookingStatus.COMPLETED,
        payment_amount=100,
        loyalty_points_used=0,
    )
    db.add(b_future_bad)
    db.add(b_past_ok)
    db.flush()
    future_id, past_id = b_future_bad.id, b_past_ok.id
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/master/bookings/detailed", headers=headers)
    assert resp.status_code == 200, resp.text
    ids = [b["id"] for b in resp.json()]
    assert future_id not in ids
    assert past_id in ids

# -*- coding: utf-8 -*-
"""Бейдж «Будущие» = только активные будущие; отменённые не входят в total."""
from datetime import datetime, timedelta

from auth import get_password_hash
from models import Booking, BookingStatus, Master, Service, User, UserRole


def _auth_headers(client, phone: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": "test123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_future_tab_total_excludes_cancelled_counts_past_completed(client, db):
    user = User(
        email="future_tab@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330999",
        full_name="Master Tab",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    service = Service(name="Tab Svc", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    now = datetime.utcnow()
    future_cancelled = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=now + timedelta(days=5),
        end_time=now + timedelta(days=5, hours=1),
        status=BookingStatus.CANCELLED.value,
        payment_amount=1000,
    )
    past_completed = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=now - timedelta(days=2),
        end_time=now - timedelta(days=2, hours=1),
        status=BookingStatus.COMPLETED.value,
        payment_amount=1000,
        loyalty_points_used=100,
    )
    db.add(future_cancelled)
    db.add(past_completed)
    db.commit()

    headers = _auth_headers(client, user.phone)

    fut = client.get("/api/master/bookings/future?page=1&limit=20", headers=headers)
    assert fut.status_code == 200, fut.text
    body = fut.json()
    assert body["total"] == 0
    assert body.get("total_all", body["total"]) >= 1

    past = client.get("/api/master/past-appointments?page=1&limit=20", headers=headers)
    assert past.status_code == 200, past.text
    past_body = past.json()
    assert past_body["total"] >= 1


def test_future_tab_total_includes_active_future(client, db):
    user = User(
        email="future_tab2@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003330998",
        full_name="Master Tab2",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    service = Service(name="Tab Svc2", price=500, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)

    now = datetime.utcnow()
    b = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=now + timedelta(days=3),
        end_time=now + timedelta(days=3, hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=500,
    )
    db.add(b)
    db.commit()

    headers = _auth_headers(client, user.phone)
    fut = client.get("/api/master/bookings/future?page=1&limit=20", headers=headers)
    assert fut.status_code == 200
    assert fut.json()["total"] >= 1

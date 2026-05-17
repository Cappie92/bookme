# -*- coding: utf-8 -*-
"""
Инвариант: цена и интервал записи фиксируются при создании.
Изменение canonical Service после create не должно менять amount_to_pay, если payment_amount задан.
"""
import uuid
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    Booking,
    BookingStatus,
    Master,
    MasterService,
    Service,
    User,
    UserRole,
)
from utils.booking_real_money import booking_money_api_fields


def _auth_headers(client, phone: str, password: str = "testpassword") -> dict:
    res = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _master_with_booking(db, *, payment_amount, loyalty_points_used=0, duration_min=60):
    suffix = uuid.uuid4().hex[:8]
    user = User(
        email=f"snap-m-{suffix}@example.com",
        phone=f"+79007{suffix[:7]}",
        full_name="Snap Master",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    mrow = Master(
        user_id=user.id,
        bio="",
        experience_years=1,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(mrow)
    db.commit()
    db.refresh(mrow)

    cu = User(
        email=f"snap-c-{suffix}@example.com",
        phone=f"+79008{suffix[:7]}",
        full_name="Snap Client",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)

    svc = Service(name=f"Snapshot Svc {suffix}", price=1000, duration=duration_min, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    now = datetime.utcnow()
    start = now + timedelta(days=5)
    end = start + timedelta(minutes=duration_min)
    b = Booking(
        client_id=cu.id,
        service_id=svc.id,
        master_id=mrow.id,
        start_time=start,
        end_time=end,
        status=BookingStatus.CREATED.value,
        payment_amount=payment_amount,
        loyalty_points_used=loyalty_points_used,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return user, mrow, svc, b


def _future_hit(client, headers, booking_id):
    r = client.get("/api/master/bookings/future?page=1&limit=50", headers=headers)
    assert r.status_code == 200, r.text
    return next((row for row in r.json()["bookings"] if row["id"] == booking_id), None)


def test_booking_price_snapshot_survives_service_price_change(client, db):
    master_user, _mrow, svc, booking = _master_with_booking(
        db, payment_amount=1000.0, loyalty_points_used=0
    )
    headers = _auth_headers(client, master_user.phone)

    hit = _future_hit(client, headers, booking.id)
    assert hit is not None
    assert float(hit["amount_to_pay"]) == 1000.0
    assert float(hit["price"]) == 1000.0

    svc.price = 2000
    db.commit()

    hit2 = _future_hit(client, headers, booking.id)
    assert hit2 is not None
    assert float(hit2["amount_to_pay"]) == 1000.0
    assert float(hit2["price"]) == 1000.0


def test_booking_loyalty_price_snapshot_survives_service_price_change(client, db):
    master_user, _mrow, svc, booking = _master_with_booking(
        db, payment_amount=1000.0, loyalty_points_used=100
    )
    headers = _auth_headers(client, master_user.phone)

    svc.price = 2000
    db.commit()

    hit = _future_hit(client, headers, booking.id)
    assert hit is not None
    assert float(hit["amount_to_pay"]) == 900.0
    assert float(hit["price"]) == 900.0


def test_booking_duration_snapshot_survives_service_duration_change(client, db):
    master_user, _mrow, svc, booking = _master_with_booking(
        db, payment_amount=1000.0, duration_min=60
    )
    headers = _auth_headers(client, master_user.phone)
    end_before = booking.end_time.replace(microsecond=0).isoformat()

    hit = _future_hit(client, headers, booking.id)
    assert hit is not None
    assert hit["end_time"].replace("Z", "")[:19] == end_before[:19]

    svc.duration = 90
    db.commit()

    hit2 = _future_hit(client, headers, booking.id)
    assert hit2["end_time"].replace("Z", "")[:19] == end_before[:19]


def test_booking_survives_master_service_delete(client, db):
    """Удаление MasterService не удаляет booking; цена из payment_amount."""
    master_user, mrow, svc, booking = _master_with_booking(db, payment_amount=1000.0)
    booking_id = booking.id
    ms = MasterService(
        master_id=mrow.id,
        name=svc.name,
        duration=svc.duration,
        price=svc.price,
        category_id=None,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)

    db.delete(ms)
    db.commit()

    headers = _auth_headers(client, master_user.phone)
    hit = _future_hit(client, headers, booking_id)
    assert hit is not None
    assert float(hit["amount_to_pay"]) == 1000.0


def test_legacy_null_payment_amount_follows_service_price_fallback(db):
    """Риск legacy: payment_amount NULL → сумма «едет» за service.price."""
    _user, _mrow, svc, booking = _master_with_booking(db, payment_amount=None)
    assert booking.payment_amount is None

    fields = booking_money_api_fields(booking, service_price=svc.price)
    assert fields["amount_to_pay"] == 1000.0

    svc.price = 2000
    db.commit()
    db.refresh(svc)

    fields2 = booking_money_api_fields(booking, service_price=svc.price)
    assert fields2["amount_to_pay"] == 2000.0


def test_master_service_price_change_does_not_repoint_booking_service(db):
    """Типичный prod-flow: меняется MasterService, canonical Service у booking не меняется."""
    master_user, mrow, svc, booking = _master_with_booking(db, payment_amount=1000.0)
    old_service_id = svc.id

    ms = MasterService(
        master_id=mrow.id,
        name=svc.name,
        duration=svc.duration,
        price=svc.price,
        category_id=None,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)

    ms.price = 2500
    ms.duration = 120
    db.commit()

    db.refresh(booking)
    assert booking.service_id == old_service_id
    assert booking.service.price == 1000
    assert booking.service.duration == 60


@pytest.mark.skip(reason="SQLite test DB may not enforce FK on services.id")
def test_cannot_hard_delete_service_with_bookings(db):
    from sqlalchemy.exc import IntegrityError

    _user, _mrow, svc, _booking = _master_with_booking(db, payment_amount=500.0)
    with pytest.raises(IntegrityError):
        db.delete(svc)
        db.commit()

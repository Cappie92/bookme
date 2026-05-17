# -*- coding: utf-8 -*-
"""Доход мастера и API списка записей: учёт loyalty_points_used (реальные деньги)."""
from datetime import datetime, timedelta

from auth import get_password_hash
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    Income,
    LoyaltyTransaction,
    Master,
    Service,
    User,
    UserRole,
)
from services.booking_visit_finalize import finalize_post_visit_booking
from utils.booking_real_money import booking_amount_to_pay, booking_money_api_fields


def test_booking_amount_to_pay_and_serialization():
    assert booking_amount_to_pay(1000, 100) == 900.0
    assert booking_amount_to_pay(1000, 0) == 1000.0
    assert booking_amount_to_pay(None, None) == 0.0

    class B:
        payment_amount = 1000.0
        loyalty_points_used = 100

    d = booking_money_api_fields(B())
    assert d["payment_amount"] == 1000.0
    assert d["loyalty_points_used"] == 100
    assert d["amount_to_pay"] == 900.0


def test_finalize_income_real_money_after_loyalty_points(db):
    mu = User(
        email="mrm1@example.com",
        phone="+79003300101",
        full_name="M",
        hashed_password=get_password_hash("x"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(user_id=mu.id, bio="", experience_years=1, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    cu = User(
        email="crm1@example.com",
        phone="+79003300102",
        full_name="C",
        hashed_password=get_password_hash("x"),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)

    svc = Service(name="Svc", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    now = datetime.utcnow()
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=cu.id,
            booking_id=None,
            transaction_type="earned",
            points=100,
            earned_at=now,
            source="test_master_booking_real_money",
        )
    )
    db.commit()

    b = Booking(
        client_id=cu.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)

    out = finalize_post_visit_booking(
        db,
        booking=b,
        master_row_id=master.id,
        master_user_id=mu.id,
        require_past_start=False,
    )
    db.commit()

    assert out["already"] is False
    assert float(out["confirmed_income"]) == 900.0

    inc = db.query(Income).filter(Income.booking_id == b.id).first()
    assert inc is not None
    assert float(inc.total_amount) == 900.0
    assert float(inc.master_earnings) == 900.0

    conf = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == b.id).first()
    assert conf is not None
    assert float(conf.confirmed_income) == 900.0


def test_past_appointments_json_has_amount_to_pay(client, db, test_master):
    mrow = Master(
        user_id=test_master.id,
        bio="",
        experience_years=1,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(mrow)
    db.commit()
    db.refresh(mrow)

    cu = User(
        email="pastamt@example.com",
        phone="+79003300303",
        full_name="Client",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)

    svc = Service(name="Hair", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    now = datetime.utcnow()
    b = Booking(
        client_id=cu.id,
        service_id=svc.id,
        master_id=mrow.id,
        start_time=now - timedelta(hours=1),
        end_time=now,
        status=BookingStatus.COMPLETED.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    res = client.post("/api/auth/login", json={"phone": test_master.phone, "password": "testpassword"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    r = client.get("/api/master/past-appointments", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    hit = next((a for a in data["appointments"] if a["id"] == bid), None)
    assert hit is not None
    assert float(hit["payment_amount"]) == 1000.0
    assert int(hit["loyalty_points_used"]) == 100
    assert float(hit["amount_to_pay"]) == 900.0


def test_dashboard_stats_week_with_loyalty_no_sqlite_greatest(client, db, test_master):
    """SQLite: /api/master/dashboard/stats использует real_money без GREATEST (регресс #500)."""
    mrow = Master(
        user_id=test_master.id,
        bio="",
        experience_years=1,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(mrow)
    db.commit()
    db.refresh(mrow)

    cu = User(
        email="dashstat@example.com",
        phone="+79004400404",
        full_name="ClientDash",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)

    svc = Service(name="DashSvc", price=500.0, duration=30, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    now = datetime.utcnow()
    b = Booking(
        client_id=cu.id,
        service_id=svc.id,
        master_id=mrow.id,
        start_time=now - timedelta(days=1),
        end_time=now - timedelta(days=1) + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()

    res = client.post("/api/auth/login", json={"phone": test_master.phone, "password": "testpassword"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    r = client.get(
        "/api/master/dashboard/stats",
        params={"period": "week", "offset": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "weeks_data" in body
    assert body["period"] == "week"

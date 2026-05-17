# -*- coding: utf-8 -*-
"""ЛК клиента: сумма записи с резервом баллов и effective balance."""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    Booking,
    BookingStatus,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    Service,
    User,
    UserRole,
)
from services.booking_visit_finalize import finalize_post_visit_booking


def _client_headers(client, phone: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_client_bookings_list_shows_amount_to_pay_with_reserve(client, db, test_user):
    """A: booking payment_amount=1000, loyalty_points_used=100 → amount_to_pay=900."""
    mu = User(
        email="cdb_m@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700101",
        full_name="M CDB",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb-domain",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    svc = Service(name="S", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    start = datetime.utcnow() + timedelta(days=3)
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    booking_id = b.id

    h = _client_headers(client, test_user.phone)
    r = client.get("/api/client/bookings/?full=true", headers=h)
    assert r.status_code == 200, r.text
    rows = [x for x in r.json() if x.get("id") == booking_id]
    assert len(rows) == 1
    row = rows[0]
    assert float(row["payment_amount"]) == pytest.approx(1000.0)
    assert int(row["loyalty_points_used"]) == 100
    assert float(row["amount_to_pay"]) == pytest.approx(900.0)
    assert float(row["price"]) == pytest.approx(900.0)


def test_client_loyalty_points_effective_with_reserve(client, db, test_user):
    """B: ledger 100, reserve 100 → available 0, reserved 100."""
    mu = User(
        email="cdb_m2@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700102",
        full_name="M2",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb2",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    master_id = master.id
    db.add(
        LoyaltyTransaction(
            master_id=master_id,
            client_id=test_user.id,
            booking_id=None,
            transaction_type="earned",
            points=100,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    svc = Service(name="S2", price=500, duration=30, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    start = datetime.utcnow() + timedelta(days=2)
    db.add(
        Booking(
            client_id=test_user.id,
            service_id=svc.id,
            master_id=master_id,
            start_time=start,
            end_time=start + timedelta(hours=1),
            status=BookingStatus.CREATED.value,
            payment_amount=500.0,
            loyalty_points_used=100,
        )
    )
    db.commit()

    h = _client_headers(client, test_user.phone)
    r = client.get("/api/client/loyalty/points", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_balance"] == 0
    assert data["total_reserved"] == 100
    masters = {m["master_id"]: m for m in data["masters"]}
    assert master_id in masters
    assert masters[master_id]["balance"] == 0
    assert masters[master_id]["reserved_points"] == 100
    assert masters[master_id]["ledger_balance"] == 100


def test_client_loyalty_after_cancel_releases_reserve(client, db, test_user):
    """C: после отмены записи reserved=0, available=100."""
    mu = User(
        email="cdb_m3@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700103",
        full_name="M3",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb3",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    master_id = master.id
    db.add(
        LoyaltyTransaction(
            master_id=master_id,
            client_id=test_user.id,
            booking_id=None,
            transaction_type="earned",
            points=100,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    svc = Service(name="S3", price=500, duration=30, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    start = datetime.utcnow() + timedelta(days=4)
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=master_id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=500.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    booking_id = b.id

    h = _client_headers(client, test_user.phone)
    r_del = client.delete(f"/api/client/bookings/{booking_id}", headers=h)
    assert r_del.status_code == 200, r_del.text

    r = client.get("/api/client/loyalty/points", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_balance"] == 100
    assert data["total_reserved"] == 0


def test_client_loyalty_points_lists_spent_when_balance_zero(client, db, test_user):
    """После confirm: spent в истории, баланс 0 — мастер остаётся в /points с транзакциями."""
    mu = User(
        email="cdb_spend@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700401",
        full_name="M Spend",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb-spend",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    mid = master.id
    db.add(
        LoyaltySettings(
            master_id=mid,
            is_enabled=False,
            accrual_percent=None,
            max_payment_percent=50,
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=mid,
            client_id=test_user.id,
            booking_id=None,
            transaction_type="earned",
            points=100,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    svc = Service(name="Haircut smoke", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=mid,
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    finalize_post_visit_booking(
        db,
        booking=b,
        master_row_id=mid,
        master_user_id=mu.id,
        require_past_start=False,
    )
    db.commit()

    h = _client_headers(client, test_user.phone)
    r = client.get("/api/client/loyalty/points", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_balance"] == 0
    assert data["total_reserved"] == 0
    masters_by_id = {m["master_id"]: m for m in data["masters"]}
    assert mid in masters_by_id
    mrow = masters_by_id[mid]
    assert mrow["balance"] == 0
    types = {t["transaction_type"] for t in mrow["transactions"]}
    assert "spent" in types
    spent_rows = [t for t in mrow["transactions"] if t["transaction_type"] == "spent"]
    assert any(int(t["points"]) == 100 for t in spent_rows)
    earned_for_booking = [
        t for t in mrow["transactions"]
        if t["transaction_type"] == "earned" and t.get("booking_id") == bid
    ]
    assert len(earned_for_booking) == 0


def test_client_loyalty_history_endpoint_returns_spent(client, db, test_user):
    """GET /api/client/loyalty/history/{master_id} отдаёт spent."""
    mu = User(
        email="cdb_hist@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700402",
        full_name="M Hist",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb-hist",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    mid = master.id
    db.add(
        LoyaltySettings(master_id=mid, is_enabled=False, accrual_percent=None, max_payment_percent=50)
    )
    db.add(
        LoyaltyTransaction(
            master_id=mid,
            client_id=test_user.id,
            booking_id=None,
            transaction_type="earned",
            points=100,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    svc = Service(name="S hist", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=mid,
        start_time=now - timedelta(hours=3),
        end_time=now - timedelta(hours=2),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    finalize_post_visit_booking(
        db,
        booking=b,
        master_row_id=mid,
        master_user_id=mu.id,
        require_past_start=False,
    )
    db.commit()

    h = _client_headers(client, test_user.phone)
    r = client.get(f"/api/client/loyalty/history/{mid}", headers=h)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert any(t["transaction_type"] == "spent" and t["points"] == 100 for t in rows)


def test_client_past_bookings_include_loyalty_price_fields(client, db, test_user):
    """Прошедшие записи: payment_amount, loyalty_points_used, amount_to_pay, price."""
    mu = User(
        email="cdb_past@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700403",
        full_name="M Past",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(
        user_id=mu.id,
        bio="",
        experience_years=1,
        domain="cdb-past",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    svc = Service(name="S past", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(days=1),
        end_time=now - timedelta(days=1) + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
        payment_amount=1000.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    h = _client_headers(client, test_user.phone)
    r = client.get("/api/client/bookings/past?full=true", headers=h)
    assert r.status_code == 200, r.text
    rows = [x for x in r.json() if x.get("id") == bid]
    assert len(rows) == 1
    row = rows[0]
    assert float(row["payment_amount"]) == pytest.approx(1000.0)
    assert int(row["loyalty_points_used"]) == 100
    assert float(row["amount_to_pay"]) == pytest.approx(900.0)
    assert float(row["price"]) == pytest.approx(900.0)


def test_client_loyalty_points_empty_without_transactions(client, db):
    """Клиент без транзакций лояльности — пустой список мастеров."""
    u = User(
        email="cdb_empty@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007700404",
        full_name="Empty Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()

    h = _client_headers(client, u.phone)
    r = client.get("/api/client/loyalty/points", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["masters"] == []
    assert data["total_balance"] == 0

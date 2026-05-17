# -*- coding: utf-8 -*-
"""Списание накопленных баллов при выключенной программе лояльности (is_enabled=false / нет настроек)."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

import pytest

from auth import get_password_hash
from models import (
    Booking,
    BookingStatus,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterSchedule,
    MasterService,
    Service,
    User,
    UserRole,
)
from utils.public_booking_loyalty import build_public_booking_price_preview_loyalty


DOMAIN_DISABLED = "loy-test-disabled-spend"
DOMAIN_NO_SETTINGS = "loy-test-no-settings-row"
DOMAIN_ENABLED = "loy-test-enabled-earn"
DOMAIN_RESERVE = "loy-test-active-reserve"


def _auth_client_headers(client, phone: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_master_with_service(
    db,
    *,
    domain: str,
    loyalty_settings: Optional[LoyaltySettings],
    earned_for_client_id: int,
    earned_points: int,
):
    phone_by_domain = {
        DOMAIN_DISABLED: "+79991100101",
        DOMAIN_NO_SETTINGS: "+79991100102",
        DOMAIN_ENABLED: "+79991100103",
        DOMAIN_RESERVE: "+79991100104",
        "loy-unit-only": "+79991100105",
    }
    mphone = phone_by_domain.get(domain, f"+799911{abs(hash(domain)) % 10**5:05d}")
    mu = User(
        email=f"m_{domain}@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone=mphone,
        full_name=f"Master {domain}",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    m = Master(
        user_id=mu.id,
        bio="x",
        experience_years=1,
        domain=domain,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    s_canon = Service(
        name=f"Услуга {domain}",
        duration=30,
        price=1500.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_canon)
    db.commit()
    db.refresh(s_canon)

    ms = MasterService(
        master_id=m.id,
        category_id=None,
        name=s_canon.name,
        duration=30,
        price=1500.0,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)

    work_date = date(2030, 9, 1)
    db.add(
        MasterSchedule(
            master_id=m.id,
            salon_id=None,
            date=work_date,
            start_time=time(8, 0),
            end_time=time(20, 0),
            is_available=True,
        )
    )
    if loyalty_settings is not None:
        loyalty_settings.master_id = m.id
        db.add(loyalty_settings)
    db.add(
        LoyaltyTransaction(
            master_id=m.id,
            client_id=earned_for_client_id,
            booking_id=None,
            transaction_type="earned",
            points=earned_points,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    db.commit()
    return {"master": m, "master_user": mu, "master_service_id": ms.id, "work_date": work_date, "canonical_service_id": s_canon.id}


def test_preview_disabled_program_old_points(client, db, test_user):
    """A: is_enabled=false, effective>0 → points_payment_available, баллы считаются."""
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=10,
        max_payment_percent=40,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_DISABLED,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    m = ctx["master"]
    ms_id = ctx["master_service_id"]
    wd = ctx["work_date"]
    tz = ZoneInfo("Europe/Moscow")
    st = datetime(wd.year, wd.month, wd.day, 10, 0, 0, tzinfo=tz)

    hdr = _auth_client_headers(client, test_user.phone)
    url = (
        f"/api/public/masters/{DOMAIN_DISABLED}/booking-price-preview"
        f"?service_id={ms_id}&start_time={quote(st.isoformat())}&use_loyalty_points=true"
    )
    r = client.get(url, headers=hdr)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["points_payment_available"] is True
    assert int(j["loyalty_points_to_use"]) > 0
    assert float(j["amount_to_pay"]) < float(j["discounted_price"])
    assert j["loyalty_program_enabled"] is False
    # 40% от 1500 = 600, доступно 100 → списание 100
    assert int(j["loyalty_points_to_use"]) == 100


def test_preview_no_settings_row_treats_max_percent_as_full(client, db, test_user):
    """E: нет строки loyalty_settings — списание по effective, max 100 %."""
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_NO_SETTINGS,
        loyalty_settings=None,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    ms_id = ctx["master_service_id"]
    wd = ctx["work_date"]
    tz = ZoneInfo("Europe/Moscow")
    st = datetime(wd.year, wd.month, wd.day, 11, 0, 0, tzinfo=tz)
    hdr = _auth_client_headers(client, test_user.phone)
    url = (
        f"/api/public/masters/{DOMAIN_NO_SETTINGS}/booking-price-preview"
        f"?service_id={ms_id}&start_time={quote(st.isoformat())}&use_loyalty_points=true"
    )
    r = client.get(url, headers=hdr)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["points_payment_available"] is True
    assert int(j["loyalty_points_to_use"]) == 100
    assert j["max_payment_percent"] is None
    assert j["loyalty_program_enabled"] is False


def test_eligibility_shows_program_flags(client, db, test_user):
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=10,
        max_payment_percent=50,
        points_lifetime_days=None,
    )
    _create_master_with_service(
        db,
        domain=DOMAIN_DISABLED,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=50,
    )
    hdr = _auth_client_headers(client, test_user.phone)
    r = client.get(f"/api/public/masters/{DOMAIN_DISABLED}/eligibility", headers=hdr)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["points"] == 50
    assert j["points_payment_available"] is True
    assert j["loyalty_program_enabled"] is False


def test_public_create_reserves_points_no_spent_transaction(client, db, test_user):
    """B: create — loyalty_points_used > 0, spent-транзакции ещё нет."""
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=10,
        max_payment_percent=100,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_DISABLED,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    ms_id = ctx["master_service_id"]
    wd = ctx["work_date"]
    tz = ZoneInfo("Europe/Moscow")
    st = datetime(wd.year, wd.month, wd.day, 12, 0, 0, tzinfo=tz)
    et = datetime(wd.year, wd.month, wd.day, 12, 30, 0, tzinfo=tz)
    hdr = _auth_client_headers(client, test_user.phone)
    body = {
        "service_id": ms_id,
        "start_time": st.isoformat(),
        "end_time": et.isoformat(),
        "use_loyalty_points": True,
    }
    r = client.post(f"/api/public/masters/{DOMAIN_DISABLED}/bookings", json=body, headers=hdr)
    assert r.status_code == 200, r.text
    created = r.json()
    assert int(created.get("loyalty_points_used") or 0) > 0
    bid = int(created["id"])
    spent = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
        .first()
    )
    assert spent is None


def test_confirm_disabled_spent_no_earned(client, db, test_user):
    """C: confirm при is_enabled=false — spent есть, earned нет."""
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=10,
        max_payment_percent=100,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_DISABLED,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    m = ctx["master"]
    mu = ctx["master_user"]
    svc_id = ctx["canonical_service_id"]
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc_id,
        master_id=m.id,
        start_time=now - timedelta(hours=3),
        end_time=now - timedelta(hours=2),
        status=BookingStatus.CREATED.value,
        payment_amount=1500.0,
        loyalty_points_used=80,
    )
    db.add(b)
    db.commit()
    db.refresh(b)

    mh = _auth_client_headers(client, mu.phone)
    resp = client.post(f"/api/master/accounting/confirm-booking/{b.id}", headers=mh)
    assert resp.status_code == 200, resp.text

    spent = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "spent")
        .first()
    )
    earned = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "earned")
        .first()
    )
    assert spent is not None and int(spent.points) == 80
    assert earned is None


def test_confirm_enabled_spent_and_earned(client, db, test_user):
    """D: программа включена — spent и earned (от денег после баллов)."""
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=True,
        accrual_percent=10,
        max_payment_percent=100,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_ENABLED,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=200,
    )
    m = ctx["master"]
    mu = ctx["master_user"]
    svc_id = ctx["canonical_service_id"]
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc_id,
        master_id=m.id,
        start_time=now - timedelta(hours=5),
        end_time=now - timedelta(hours=4),
        status=BookingStatus.CREATED.value,
        payment_amount=1500.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)

    mh = _auth_client_headers(client, mu.phone)
    resp = client.post(f"/api/master/accounting/confirm-booking/{b.id}", headers=mh)
    assert resp.status_code == 200, resp.text

    spent = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "spent")
        .first()
    )
    earned = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "earned")
        .first()
    )
    assert spent is not None
    assert earned is not None
    # actual_payment = 1500 - 100 = 1400 → 10% = 140
    assert int(earned.points) == 140


def test_confirm_no_settings_spent_no_earned(client, db, test_user):
    """E (confirm): нет настроек — spent создаётся, earned нет."""
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_NO_SETTINGS,
        loyalty_settings=None,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    m = ctx["master"]
    mu = ctx["master_user"]
    svc_id = ctx["canonical_service_id"]
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc_id,
        master_id=m.id,
        start_time=now - timedelta(hours=6),
        end_time=now - timedelta(hours=5),
        status=BookingStatus.CREATED.value,
        payment_amount=800.0,
        loyalty_points_used=50,
    )
    db.add(b)
    db.commit()
    db.refresh(b)

    mh = _auth_client_headers(client, mu.phone)
    resp = client.post(f"/api/master/accounting/confirm-booking/{b.id}", headers=mh)
    assert resp.status_code == 200, resp.text

    spent = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "spent")
        .first()
    )
    earned = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == b.id, LoyaltyTransaction.transaction_type == "earned")
        .first()
    )
    assert spent is not None
    assert earned is None


def test_active_reservation_reduces_points_to_use(client, db, test_user):
    """F: активный резерв уменьшает effective и loyalty_points_to_use в preview."""
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=10,
        max_payment_percent=100,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain=DOMAIN_RESERVE,
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    m = ctx["master"]
    svc_id = ctx["canonical_service_id"]
    db.add(
        Booking(
            client_id=test_user.id,
            service_id=svc_id,
            master_id=m.id,
            start_time=datetime.utcnow() + timedelta(days=1),
            end_time=datetime.utcnow() + timedelta(days=1, hours=1),
            status=BookingStatus.CREATED.value,
            payment_amount=500.0,
            loyalty_points_used=60,
        )
    )
    db.commit()

    row = build_public_booking_price_preview_loyalty(
        db,
        master_id=m.id,
        client_id=test_user.id,
        discounted_price=1500.0,
        use_loyalty_points=True,
    )
    assert int(row["available_points"]) == 40
    assert int(row["loyalty_points_to_use"]) == 40


def test_unit_build_preview_disabled_matches_spec(db, test_user):
    ls = LoyaltySettings(
        master_id=0,
        is_enabled=False,
        accrual_percent=5,
        max_payment_percent=50,
        points_lifetime_days=None,
    )
    ctx = _create_master_with_service(
        db,
        domain="loy-unit-only",
        loyalty_settings=ls,
        earned_for_client_id=test_user.id,
        earned_points=100,
    )
    m = ctx["master"]
    out = build_public_booking_price_preview_loyalty(
        db,
        master_id=m.id,
        client_id=test_user.id,
        discounted_price=1500.0,
        use_loyalty_points=True,
    )
    assert out["points_payment_available"] is True
    assert int(out["loyalty_points_to_use"]) == min(100, int(1500 * 0.5))

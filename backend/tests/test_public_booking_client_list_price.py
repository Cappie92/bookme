# -*- coding: utf-8 -*-
"""Публичная запись: payment_amount → список записей клиента (ЛК)."""
import pytest
from datetime import date, time, datetime
from zoneinfo import ZoneInfo

from auth import get_password_hash
from models import (
    LoyaltyDiscount,
    LoyaltyDiscountType,
    Master,
    MasterSchedule,
    MasterService,
    Service,
    User,
    UserRole,
)

DOMAIN = "pb-client-price-test"


@pytest.fixture
def pb_master_setup(db):
    mu = User(
        email="pbcp_master@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79998887701",
        full_name="PB Price Master",
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
        domain=DOMAIN,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    s_canon = Service(
        name="Стрижка PB",
        duration=30,
        price=1000.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_canon)
    db.flush()
    s_rule = Service(
        name="Стрижка PB",
        duration=30,
        price=1000.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_rule)
    db.commit()

    ms = MasterService(
        master_id=m.id,
        category_id=None,
        name="Стрижка PB",
        duration=30,
        price=1000.0,
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)

    db.add(
        LoyaltyDiscount(
            master_id=m.id,
            discount_type=LoyaltyDiscountType.QUICK,
            name="Service only",
            discount_percent=9.0,
            is_active=True,
            priority=1,
            conditions={
                "condition_type": "service_discount",
                "parameters": {"service_id": s_rule.id},
            },
        )
    )

    work_date = date(2030, 7, 1)
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
    db.commit()
    return {"master_service_id": ms.id, "work_date": work_date}


def test_public_booking_then_client_list_shows_discounted_price(client, db, test_user, pb_master_setup):
    """POST public booking со скидкой → GET /api/client/bookings price = payment_amount (910)."""
    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    mid = pb_master_setup["master_service_id"]
    wd = pb_master_setup["work_date"]
    tz = ZoneInfo("Europe/Moscow")
    st = datetime(wd.year, wd.month, wd.day, 10, 0, 0, tzinfo=tz)
    et = datetime(wd.year, wd.month, wd.day, 10, 30, 0, tzinfo=tz)

    body = {
        "service_id": mid,
        "start_time": st.isoformat(),
        "end_time": et.isoformat(),
    }
    r = client.post(f"/api/public/masters/{DOMAIN}/bookings", json=body, headers=headers)
    assert r.status_code == 200, r.text
    created = r.json()
    assert float(created.get("final_price") or 0) == pytest.approx(910.0)
    assert float(created.get("base_price") or 0) == pytest.approx(1000.0)
    assert float(created.get("discount_amount") or 0) == pytest.approx(90.0)
    assert created.get("discount_percent") == pytest.approx(9.0)
    assert created.get("service_name") == "Стрижка PB"
    assert created.get("condition_type") == "service_discount"

    from models import Booking

    row = db.query(Booking).filter(Booking.id == created["id"]).first()
    assert row is not None
    assert float(row.payment_amount or 0) == pytest.approx(910.0)
    assert float(created["final_price"]) == pytest.approx(float(row.payment_amount))

    r2 = client.get("/api/client/bookings/?full=true", headers=headers)
    assert r2.status_code == 200, r2.text
    rows = r2.json()
    ours = [x for x in rows if x.get("master_domain") == DOMAIN]
    assert len(ours) >= 1
    assert float(ours[0]["price"]) == pytest.approx(910.0)

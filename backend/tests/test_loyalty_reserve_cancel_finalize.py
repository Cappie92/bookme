# -*- coding: utf-8 -*-
"""Резерв баллов на booking: сброс при отменах, active reservations, finalize."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    LoyaltyDiscount,
    LoyaltyDiscountType,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterSchedule,
    MasterService,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from services.booking_visit_finalize import finalize_post_visit_booking
from utils.booking_loyalty_reserve import clear_loyalty_points_reserve
from utils.public_booking_loyalty import effective_available_points

PB_DOMAIN = "pb-client-price-test"


@pytest.fixture
def pb_master_setup(db):
    """Копия фикстуры из test_public_booking_client_list_price (домен и расписание для public API)."""
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
        domain=PB_DOMAIN,
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


def _auth(client, phone: str, password: str = "testpassword") -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _attach_master_subscription_with_features(db, user_id: int, service_functions: list) -> None:
    plan = SubscriptionPlan(
        name="LoyReservePlan",
        display_name="Loy Reserve Plan",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=900,
        price_6months=800,
        price_12months=700,
        features={"service_functions": service_functions, "max_page_modules": 3},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    days = duration_months_to_days(1)
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=days),
        price=1000,
        daily_rate=1000 / days,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()


def test_clear_loyalty_points_reserve_idempotent(db):
    u = User(
        email="clr@t.com",
        hashed_password=get_password_hash("x"),
        phone="+79009900101",
        full_name="C",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    svc = Service(name="ClrS", price=1, duration=1, salon_id=None)
    db.add(svc)
    db.commit()
    b = Booking(
        client_id=u.id,
        service_id=svc.id,
        master_id=None,
        indie_master_id=None,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow(),
        status=BookingStatus.CREATED.value,
        loyalty_points_used=50,
    )
    db.add(b)
    db.commit()
    clear_loyalty_points_reserve(b)
    assert b.loyalty_points_used == 0
    clear_loyalty_points_reserve(b)
    assert b.loyalty_points_used == 0


def test_public_preview_respects_active_reservation(client, db, test_user, pb_master_setup):
    """A: первая запись держит 70 баллов резерва — preview для второй видит 30 effective."""
    mid = pb_master_setup["master_service_id"]
    wd = pb_master_setup["work_date"]
    m = db.query(Master).filter(Master.domain == PB_DOMAIN).first()
    assert m is not None
    master_id = m.id
    db.add(
        LoyaltySettings(
            master_id=master_id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=100,
            points_lifetime_days=None,
        )
    )
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
    db.commit()

    s_rule = (
        db.query(Service)
        .filter(
            Service.name == "Стрижка PB",
            Service.salon_id.is_(None),
            Service.indie_master_id.is_(None),
        )
        .all()
    )
    rule_svc = s_rule[-1] if len(s_rule) > 1 else s_rule[0]

    tz = ZoneInfo("Europe/Moscow")
    st1 = datetime(wd.year, wd.month, wd.day, 11, 0, 0, tzinfo=tz)
    et1 = datetime(wd.year, wd.month, wd.day, 11, 30, 0, tzinfo=tz)
    b1 = Booking(
        client_id=test_user.id,
        service_id=rule_svc.id,
        master_id=master_id,
        start_time=st1,
        end_time=et1,
        status=BookingStatus.CREATED.value,
        payment_amount=910.0,
        loyalty_points_used=70,
    )
    db.add(b1)
    db.commit()

    eff = effective_available_points(db, master_id=master_id, client_id=test_user.id)
    assert eff == 30

    st2 = datetime(wd.year, wd.month, wd.day, 10, 0, 0, tzinfo=tz)
    login = _auth(client, test_user.phone)
    r = client.get(
        f"/api/public/masters/{PB_DOMAIN}/booking-price-preview",
        params={
            "service_id": mid,
            "start_time": st2.isoformat(),
            "use_loyalty_points": True,
        },
        headers=login,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["available_points"] == 30
    assert d["loyalty_points_to_use"] == 30

    et2 = datetime(wd.year, wd.month, wd.day, 10, 30, 0, tzinfo=tz)
    body = {
        "service_id": mid,
        "start_time": st2.isoformat(),
        "end_time": et2.isoformat(),
        "use_loyalty_points": True,
    }
    r2 = client.post(f"/api/public/masters/{PB_DOMAIN}/bookings", json=body, headers=login)
    assert r2.status_code == 200, r2.text
    created = r2.json()
    assert int(created.get("loyalty_points_used") or 0) == 30


def test_client_delete_booking_clears_loyalty_reserve(client, db, test_user):
    """B: DELETE клиентом обнуляет резерв, spent не создаётся."""
    mu = User(
        email="mcd@t.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79008800101",
        full_name="M",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    master = Master(user_id=mu.id, bio="", experience_years=1, domain="mcd-domain", timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)
    svc = Service(name="S", price=500, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=test_user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now + timedelta(days=1),
        end_time=now + timedelta(days=1, hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=500,
        loyalty_points_used=120,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    h = _auth(client, test_user.phone)
    r = client.delete(f"/api/client/bookings/{bid}", headers=h)
    assert r.status_code == 200, r.text
    row = db.query(Booking).filter(Booking.id == bid).first()
    assert int(row.loyalty_points_used or 0) == 0
    spent = db.query(LoyaltyTransaction).filter(
        LoyaltyTransaction.booking_id == bid,
        LoyaltyTransaction.transaction_type == "spent",
    ).first()
    assert spent is None


def test_master_cancel_booking_clears_reserve(client, db):
    """C: POST cancel-booking обнуляет резерв."""
    user = User(
        email="mcb@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79007700101",
        full_name="Master CB",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(user_id=user.id, bio="", experience_years=0, domain="mcb-dom", timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)
    svc = Service(name="Sx", price=800, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        payment_amount=800,
        loyalty_points_used=55,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    h = _auth(client, user.phone, "test123")
    r = client.post(
        f"/api/master/accounting/cancel-booking/{bid}",
        params={"cancellation_reason": "client_no_show"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    row = db.query(Booking).filter(Booking.id == bid).first()
    assert int(row.loyalty_points_used or 0) == 0
    assert db.query(LoyaltyTransaction).filter(
        LoyaltyTransaction.booking_id == bid,
        LoyaltyTransaction.transaction_type == "spent",
    ).first() is None


def test_update_booking_status_cancelled_clears_reserve(client, db):
    """D: update-booking-status → cancelled сбрасывает резерв (нужен finance)."""
    user = User(
        email="ubc@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006600101",
        full_name="Master UBC",
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
    svc = Service(name="Sy", price=600, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    b = Booking(
        client_id=user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(hours=3),
        end_time=now - timedelta(hours=2),
        status=BookingStatus.CREATED.value,
        payment_amount=600,
        loyalty_points_used=88,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    _attach_master_subscription_with_features(db, user.id, [1, 2, 4])
    h = _auth(client, user.phone, "test123")
    r = client.post(
        f"/api/master/accounting/update-booking-status/{bid}",
        params={"new_status": "cancelled", "cancellation_reason": "mutual_agreement"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    row = db.query(Booking).filter(Booking.id == bid).first()
    assert int(row.loyalty_points_used or 0) == 0
    assert db.query(LoyaltyTransaction).filter(
        LoyaltyTransaction.booking_id == bid,
        LoyaltyTransaction.transaction_type == "spent",
    ).first() is None


def test_cancel_all_clears_loyalty_reserve(client, db):
    """E: cancel-all обнуляет резерв у всех отменённых."""
    user = User(
        email="call@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79005500101",
        full_name="Master CALL",
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
    svc = Service(name="Sz", price=400, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    now = datetime.utcnow()
    ids = []
    for i in range(2):
        b = Booking(
            client_id=user.id,
            service_id=svc.id,
            master_id=master.id,
            start_time=now - timedelta(days=2 + i),
            end_time=now - timedelta(days=2 + i) + timedelta(hours=1),
            status=BookingStatus.AWAITING_CONFIRMATION.value,
            payment_amount=400,
            loyalty_points_used=25 + i,
        )
        db.add(b)
        db.commit()
        db.refresh(b)
        ids.append(b.id)

    h = _auth(client, user.phone, "test123")
    r = client.post("/api/master/accounting/cancel-all", headers=h)
    assert r.status_code == 200, r.text
    for bid in ids:
        row = db.query(Booking).filter(Booking.id == bid).first()
        st = row.status.value if hasattr(row.status, "value") else str(row.status)
        assert st == BookingStatus.CANCELLED.value
        assert int(row.loyalty_points_used or 0) == 0
        assert (
            db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
            .first()
            is None
        )


def test_update_booking_status_completed_loyalty_once(client, db):
    """F: completed через update-booking-status — один spent, один earned, повтор без дублей."""
    master_user = User(
        email="fcm@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79004400101",
        full_name="Master FCM",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(master_user)
    db.commit()
    db.refresh(master_user)
    master = Master(user_id=master_user.id, bio="", experience_years=0, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    client_u = User(
        email="fcu@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79004400102",
        full_name="Client FC",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(client_u)
    db.commit()
    db.refresh(client_u)

    svc = Service(name="Sfc", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    db.add(
        LoyaltySettings(
            master_id=master.id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=100,
            points_lifetime_days=None,
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=client_u.id,
            booking_id=None,
            transaction_type="earned",
            points=500,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    db.commit()

    now = datetime.utcnow()
    b = Booking(
        client_id=client_u.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
        status=BookingStatus.CREATED.value,
        payment_amount=500.0,
        loyalty_points_used=100,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    _attach_master_subscription_with_features(db, master_user.id, [1, 2, 4])
    h = _auth(client, master_user.phone, "test123")
    r1 = client.post(
        f"/api/master/accounting/update-booking-status/{bid}",
        params={"new_status": "completed"},
        headers=h,
    )
    assert r1.status_code == 200, r1.text

    spent = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
        .all()
    )
    assert len(spent) == 1
    assert int(spent[0].points) == 100

    earned = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "earned")
        .all()
    )
    assert len(earned) == 1
    assert int(earned[0].points) == 40

    r2 = client.post(
        f"/api/master/accounting/update-booking-status/{bid}",
        params={"new_status": "completed"},
        headers=h,
    )
    assert r2.status_code == 200, r2.text
    spent2 = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
        .all()
    )
    earned2 = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "earned")
        .all()
    )
    assert len(spent2) == 1
    assert len(earned2) == 1


def test_confirm_all_loyalty_once_each(client, db):
    """G: confirm-all — по одному spent/earned на запись; повтор не дублирует."""
    master_user = User(
        email="fca@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003300101",
        full_name="Master FCA",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(master_user)
    db.commit()
    db.refresh(master_user)
    master = Master(user_id=master_user.id, bio="", experience_years=0, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    client_u = User(
        email="fcau@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003300102",
        full_name="Client FCA",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(client_u)
    db.commit()
    db.refresh(client_u)

    svc = Service(name="Sfca", price=800, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    db.add(
        LoyaltySettings(
            master_id=master.id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=100,
            points_lifetime_days=None,
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=client_u.id,
            booking_id=None,
            transaction_type="earned",
            points=500,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    db.commit()

    now = datetime.utcnow()
    bids = []
    for hoff in (3, 5):
        b = Booking(
            client_id=client_u.id,
            service_id=svc.id,
            master_id=master.id,
            start_time=now - timedelta(hours=hoff),
            end_time=now - timedelta(hours=hoff - 1),
            status=BookingStatus.AWAITING_CONFIRMATION.value,
            payment_amount=300.0,
            loyalty_points_used=40,
        )
        db.add(b)
        db.commit()
        db.refresh(b)
        bids.append(b.id)

    _attach_master_subscription_with_features(db, master_user.id, [1, 2, 4])
    h = _auth(client, master_user.phone, "test123")
    r1 = client.post("/api/master/accounting/confirm-all", headers=h)
    assert r1.status_code == 200, r1.text

    for bid in bids:
        s_cnt = (
            db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
            .count()
        )
        e_cnt = (
            db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "earned")
            .count()
        )
        assert s_cnt == 1
        assert e_cnt == 1

    r2 = client.post("/api/master/accounting/confirm-all", headers=h)
    assert r2.status_code == 200, r2.text
    for bid in bids:
        assert (
            db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "spent")
            .count()
            == 1
        )
        assert (
            db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == bid, LoyaltyTransaction.transaction_type == "earned")
            .count()
            == 1
        )


def test_finalize_raises_when_spend_fails_no_confirmation(db):
    """При ошибке spend_points не создаём BookingConfirmation."""
    master_user = User(
        email="fsp@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79002200101",
        full_name="Master FSP",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(master_user)
    db.commit()
    db.refresh(master_user)
    master = Master(user_id=master_user.id, bio="", experience_years=0, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)

    client_u = User(
        email="fspc@t.com",
        hashed_password=get_password_hash("test123"),
        phone="+79002200102",
        full_name="Client FSP",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(client_u)
    db.commit()
    db.refresh(client_u)

    svc = Service(name="Sfsp", price=1000, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    now = datetime.utcnow()
    b = Booking(
        client_id=client_u.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(hours=1),
        end_time=now,
        status=BookingStatus.CREATED.value,
        payment_amount=500.0,
        loyalty_points_used=9999,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    bid = b.id

    with pytest.raises(ValueError):
        finalize_post_visit_booking(
            db,
            booking=b,
            master_row_id=master.id,
            master_user_id=master_user.id,
            require_past_start=False,
        )
    db.rollback()

    conf = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == bid).first()
    assert conf is None

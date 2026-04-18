# -*- coding: utf-8 -*-
"""Unit-тесты для loyalty_discounts и loyalty_params."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import text

from models import (
    User,
    UserRole,
    Master,
    Service,
    Booking,
    BookingStatus,
    LoyaltyDiscount,
    LoyaltyDiscountType,
    AppliedDiscount,
)
from database import Base
from tests.conftest import engine, TestingSessionLocal


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def master_user(db):
    u = User(
        email="master_loyalty@test.com",
        hashed_password="x",
        phone="+79001111111",
        full_name="Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def master(master_user, db):
    m = Master(user_id=master_user.id, bio="", experience_years=1)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def client_user(db):
    u = User(
        email="client_loyalty@test.com",
        hashed_password="x",
        phone="+79002222222",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        birth_date=date(1990, 6, 15),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def service(master, db):
    s = Service(name="S1", price=1000.0, duration=60, salon_id=None, indie_master_id=None)
    db.add(s)
    db.commit()
    db.refresh(s)
    db.execute(text("INSERT OR IGNORE INTO master_services (master_id, service_id) VALUES (:a, :b)"), {"a": master.id, "b": s.id})
    db.commit()
    return s


def _insert_master_service(db, master_id: int, service_id: int):
    db.execute(text("INSERT OR IGNORE INTO master_services (master_id, service_id) VALUES (:a, :b)"), {"a": master_id, "b": service_id})
    db.commit()


# --- loyalty_params ---


def test_normalize_regular_visits_old_format():
    from utils.loyalty_params import normalize_parameters
    out = normalize_parameters("regular_visits", {"visits_count": 5, "period": "month"})
    assert out["visits_count"] == 5
    assert out["period_days"] == 30


def test_normalize_regular_visits_period_days():
    from utils.loyalty_params import normalize_parameters
    out = normalize_parameters("regular_visits", {"visits_count": 2, "period_days": 60})
    assert out["visits_count"] == 2
    assert out["period_days"] == 60


def test_normalize_returning_old_format():
    from utils.loyalty_params import normalize_parameters
    out = normalize_parameters("returning_client", {"days_since_last_visit": 30})
    assert out["min_days_since_last_visit"] == 30
    assert out["max_days_since_last_visit"] is None


def test_normalize_returning_min_max():
    from utils.loyalty_params import normalize_parameters
    out = normalize_parameters("returning_client", {"min_days_since_last_visit": 14, "max_days_since_last_visit": 90})
    assert out["min_days_since_last_visit"] == 14
    assert out["max_days_since_last_visit"] == 90


def test_normalize_happy_hours_old_format():
    from utils.loyalty_params import normalize_parameters
    out = normalize_parameters("happy_hours", {"start_time": "09:00", "end_time": "12:00", "days_of_week": [1, 2, 3, 4, 5]})
    assert out["days"] == [1, 2, 3, 4, 5]
    assert out["intervals"] == [{"start": "09:00", "end": "12:00"}]


def test_validate_happy_hours_overlap():
    from utils.loyalty_params import validate_happy_hours_intervals
    ok, err = validate_happy_hours_intervals([
        {"start": "09:00", "end": "12:00"},
        {"start": "11:00", "end": "13:00"},
    ])
    assert ok is False
    assert "пересекаются" in (err or "")


def test_validate_happy_hours_two_ok():
    from utils.loyalty_params import validate_happy_hours_intervals
    ok, err = validate_happy_hours_intervals([
        {"start": "09:00", "end": "12:00"},
        {"start": "18:00", "end": "20:00"},
    ])
    assert ok is True
    assert err is None


def test_validate_happy_hours_start_ge_end():
    from utils.loyalty_params import validate_happy_hours_intervals
    ok, err = validate_happy_hours_intervals([{"start": "12:00", "end": "09:00"}])
    assert ok is False
    assert err


# --- birthday ---


def test_birthday_in_window(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=25.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule)
    db.commit()

    # Клиент рожден 1990-06-15. Бронирование 2025-06-20 — в окне (5 дней после)
    booking_date = datetime(2025, 6, 20, 10, 0)
    payload = {"start_time": booking_date, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "birthday"
    assert best["match"] is True


def test_birthday_out_of_window(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=25.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule)
    db.commit()

    # Бронирование 2025-07-01 — вне окна (после 22 июня)
    booking_date = datetime(2025, 7, 1, 10, 0)
    payload = {"start_time": booking_date, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    birthday_cand = next((c for c in candidates if c.get("condition_type") == "birthday"), None)
    assert birthday_cand is not None
    assert birthday_cand["match"] is False
    assert "outside_birthday" in (birthday_cand.get("reason") or "")


def test_birthday_no_birth_date(db, master, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    no_bd = User(
        email="nobd@test.com",
        hashed_password="x",
        phone="+79003333333",
        full_name="No BD",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        birth_date=None,
    )
    db.add(no_bd)
    db.commit()
    db.refresh(no_bd)

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=25.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule)
    db.commit()

    booking_date = datetime(2025, 6, 15, 10, 0)
    payload = {"start_time": booking_date, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, no_bd.id, None, payload, db)
    birthday_cand = next((c for c in candidates if c.get("condition_type") == "birthday"), None)
    assert birthday_cand is not None
    assert birthday_cand["match"] is False


def test_birthday_year_wrap_before(db, master, service):
    """ДР 2 янв, бронь 30 дек; days_before>=7 -> окно включает 30 дек (переход года)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    user_jan2 = User(
        email="jan2@test.com",
        hashed_password="x",
        phone="+79004444444",
        full_name="Jan2",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        birth_date=date(1990, 1, 2),
    )
    db.add(user_jan2)
    db.commit()
    db.refresh(user_jan2)

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=25.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule)
    db.commit()

    booking_date = datetime(2024, 12, 30, 10, 0)
    payload = {"start_time": booking_date, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, user_jan2.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "birthday"
    assert best["match"] is True


def test_birthday_year_wrap_after(db, master, service):
    """ДР 30 дек, бронь 2 янв; days_after>=7 -> окно включает 2 янв (переход года)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    user_dec30 = User(
        email="dec30@test.com",
        hashed_password="x",
        phone="+79005555555",
        full_name="Dec30",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        birth_date=date(1990, 12, 30),
    )
    db.add(user_dec30)
    db.commit()
    db.refresh(user_dec30)

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=25.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule)
    db.commit()

    booking_date = datetime(2026, 1, 2, 10, 0)
    payload = {"start_time": booking_date, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, user_dec30.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "birthday"
    assert best["match"] is True


# --- happy_hours intervals ---


def test_happy_hours_two_intervals(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="HH",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "happy_hours",
            "parameters": {
                "days": [1, 2, 3, 4, 5],
                "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "18:00", "end": "20:00"}],
            },
        },
    )
    db.add(rule)
    db.commit()

    # Пн 19:00 — второй слот. Используем UTC у мастера, чтобы naive 19:00 = 19:00 local.
    master.timezone = "UTC"
    db.commit()
    mon_eve = datetime(2025, 6, 2, 19, 0)
    payload = {"start_time": mon_eve, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "happy_hours"
    assert best["match"] is True


# --- regular_visits period_days ---


def test_regular_visits_period_days(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Регуляр",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "regular_visits", "parameters": {"visits_count": 2, "period_days": 60}},
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    # Два completed визита в последние 60 дней
    for i in range(2):
        b = Booking(
            master_id=master.id,
            client_id=client_user.id,
            service_id=service.id,
            start_time=now - timedelta(days=30 - i * 15),
            end_time=now - timedelta(days=30 - i * 15) + timedelta(hours=1),
            status=BookingStatus.COMPLETED.value,
        )
        db.add(b)
    db.commit()

    payload = {"start_time": now + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    reg = next((c for c in candidates if c.get("condition_type") == "regular_visits"), None)
    assert reg is not None
    assert reg["match"] is True


def test_regular_visits_old_period(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Регуляр",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "regular_visits", "parameters": {"visits_count": 1, "period": "month"}},
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    b = Booking(
        master_id=master.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=now - timedelta(days=7),
        end_time=now - timedelta(days=7) + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
    )
    db.add(b)
    db.commit()

    payload = {"start_time": now + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    reg = next((c for c in candidates if c.get("condition_type") == "regular_visits"), None)
    assert reg is not None
    assert reg["match"] is True


# --- returning_client min/max ---


def test_returning_client_min_max(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Возврат",
        discount_percent=20.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "returning_client",
            "parameters": {"min_days_since_last_visit": 14, "max_days_since_last_visit": 60},
        },
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    last_visit = now - timedelta(days=30)
    b = Booking(
        master_id=master.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=last_visit,
        end_time=last_visit + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
    )
    db.add(b)
    db.commit()

    booking_start = now + timedelta(days=1)
    payload = {"start_time": booking_start, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    ret = next((c for c in candidates if c.get("condition_type") == "returning_client"), None)
    assert ret is not None
    assert ret["match"] is True


def test_returning_client_too_old(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Возврат",
        discount_percent=20.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "returning_client",
            "parameters": {"min_days_since_last_visit": 14, "max_days_since_last_visit": 60},
        },
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    last_visit = now - timedelta(days=100)
    b = Booking(
        master_id=master.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=last_visit,
        end_time=last_visit + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
    )
    db.add(b)
    db.commit()

    booking_start = now + timedelta(days=1)
    payload = {"start_time": booking_start, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    ret = next((c for c in candidates if c.get("condition_type") == "returning_client"), None)
    assert ret is not None
    assert ret["match"] is False


def test_returning_client_old_format(db, master, client_user, service):
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Возврат",
        discount_percent=20.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "returning_client", "parameters": {"days_since_last_visit": 30}},
    )
    db.add(rule)
    db.commit()

    now = datetime.utcnow()
    last_visit = now - timedelta(days=35)
    b = Booking(
        master_id=master.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=last_visit,
        end_time=last_visit + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
    )
    db.add(b)
    db.commit()

    payload = {"start_time": now + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    ret = next((c for c in candidates if c.get("condition_type") == "returning_client"), None)
    assert ret is not None
    assert ret["match"] is True


# --- service_discount items ---


def test_service_discount_items_percent(db, master, client_user, service):
    """service_discount: legacy items с 1 элементом нормализуется; percent берётся из rule."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Скидка на услугу",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "service_discount",
            "parameters": {"items": [{"service_id": service.id, "percent": 20}], "category_ids": []},
        },
    )
    db.add(rule)
    db.commit()

    payload = {"start_time": datetime.utcnow() + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "service_discount"
    assert best["match"] is True
    assert best["discount_percent"] == 10.0  # всегда из rule, не из items


def test_happy_hours_end_exclusive(db, master, client_user, service):
    """Бронь ровно в end не матчится (end exclusive)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="HH",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "happy_hours",
            "parameters": {"days": [1], "intervals": [{"start": "09:00", "end": "12:00"}]},
        },
    )
    db.add(rule)
    db.commit()
    master.timezone = "UTC"
    db.commit()

    # Пн 12:00 — ровно end, не должно матчиться
    at_end = datetime(2025, 6, 2, 12, 0)  # Mon
    payload = {"start_time": at_end, "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    reg = next((c for c in candidates if c.get("condition_type") == "happy_hours"), None)
    assert reg is not None
    assert reg["match"] is False
    assert best is None or best.get("condition_type") != "happy_hours"

    # Пн 11:59 — внутри
    before_end = datetime(2025, 6, 2, 11, 59)
    payload2 = {"start_time": before_end, "service_id": service.id, "category_id": None}
    _, best2 = evaluate_discount_candidates(master.id, client_user.id, None, payload2, db)
    assert best2 is not None and best2["condition_type"] == "happy_hours"


def test_service_discount_legacy_invalid(db, master, client_user, service):
    """Legacy items >1 -> invalid_parameters, правило не матчится."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Скидка две услуги",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "service_discount",
            "parameters": {
                "items": [
                    {"service_id": service.id, "percent": 10},
                    {"service_id": service.id + 999, "percent": 15},
                ],
                "category_ids": [],
            },
        },
    )
    db.add(rule)
    db.commit()

    payload = {"start_time": datetime.utcnow() + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    sd = next((c for c in candidates if c.get("condition_type") == "service_discount"), None)
    assert sd is not None
    assert sd["match"] is False
    assert sd["reason"] == "invalid_parameters"
    assert best is None


def test_winner_selection_condition_priority(db, master, client_user, service):
    """При одинаковом % выигрывает правило с более высоким приоритетом condition_type (birthday > first_visit)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    master.timezone = "UTC"
    db.commit()

    # first_visit 10%, birthday 10%. Клиент новый, ДР в окне.
    bd = date(1990, 6, 15)
    client_user.birth_date = bd
    db.commit()

    rule_fv = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Первый визит",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "first_visit", "parameters": {}},
    )
    rule_bd = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    db.add(rule_fv)
    db.add(rule_bd)
    db.commit()

    # Бронь 10 июня — в окне ДР (15 июня ±7)
    book_dt = datetime(2025, 6, 10, 14, 0)
    payload = {"start_time": book_dt, "service_id": service.id, "category_id": None}
    _, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "birthday"


def test_regular_visits_b1_inject_now(db, master, client_user, service):
    """B1: окно от «сейчас»; inject now — два визита в окне, бронь в будущем."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    master.timezone = "UTC"
    db.commit()

    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Регуляр",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "regular_visits", "parameters": {"visits_count": 2, "period_days": 60}},
    )
    db.add(rule)
    db.commit()

    now = datetime(2025, 6, 15, 12, 0)
    for i in range(2):
        b = Booking(
            master_id=master.id,
            client_id=client_user.id,
            service_id=service.id,
            start_time=now - timedelta(days=20 - i * 10),
            end_time=now - timedelta(days=20 - i * 10) + timedelta(hours=1),
            status=BookingStatus.COMPLETED.value,
        )
        db.add(b)
    db.commit()

    payload = {"start_time": now + timedelta(days=5), "service_id": service.id, "category_id": None}
    _, best = evaluate_discount_candidates(
        master.id, client_user.id, None, payload, db, now=now
    )
    assert best is not None
    assert best["condition_type"] == "regular_visits"


def test_deactivated_rule_not_applied(db, master, client_user, service):
    """Деактивированное правило (is_active=False) не применяется; best_candidate не выбирается из него."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="First visit off",
        discount_percent=15.0,
        is_active=False,
        priority=1,
        conditions={"condition_type": "first_visit", "parameters": {}},
    )
    db.add(rule)
    db.commit()

    payload = {"start_time": datetime.utcnow() + timedelta(days=1), "service_id": service.id, "category_id": None}
    candidates, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    fc = next((c for c in candidates if c.get("condition_type") == "first_visit"), None)
    assert fc is not None
    assert fc["is_active"] is False
    assert fc["reason"] == "inactive"
    assert best is None


def test_require_master_onboarding_completed_rejects_incomplete(db, master):
    """Создание/обновление скидок блокируется, пока онбординг не завершён (timezone + timezone_confirmed)."""
    from fastapi import HTTPException
    from routers.loyalty import _require_master_onboarding_completed

    master.timezone = None
    master.timezone_confirmed = False
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        _require_master_onboarding_completed(master.id, db)
    assert exc_info.value.status_code == 400

    master.timezone = ""
    db.commit()
    with pytest.raises(HTTPException) as exc_info2:
        _require_master_onboarding_completed(master.id, db)
    assert exc_info2.value.status_code == 400

    master.timezone = "Europe/Moscow"
    master.timezone_confirmed = False
    db.commit()
    with pytest.raises(HTTPException) as exc_info3:
        _require_master_onboarding_completed(master.id, db)
    assert exc_info3.value.status_code == 400

    master.timezone_confirmed = True
    master.city = "Moscow"
    db.commit()
    _require_master_onboarding_completed(master.id, db)  # не бросает


def test_winner_selection_condition_type_priority_equal_percent(db, master, client_user, service):
    """При одинаковом discount_percent побеждает правило с более высоким приоритетом condition_type (birthday > happy_hours)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    master.timezone = "UTC"
    db.commit()

    bd = date(1990, 6, 15)
    client_user.birth_date = bd
    db.commit()

    rule_bd = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="ДР",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "birthday", "parameters": {"days_before": 7, "days_after": 7}},
    )
    rule_hh = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="HH",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "happy_hours",
            "parameters": {"days": [1], "intervals": [{"start": "12:00", "end": "14:00"}]},
        },
    )
    db.add(rule_bd)
    db.add(rule_hh)
    db.commit()

    # Бронь Пн 13:00 UTC: в окне ДР (15 июня ±7) и в HH 12:00–14:00 UTC (end exclusive)
    book_dt = datetime(2025, 6, 9, 13, 0)  # Mon
    payload = {"start_time": book_dt, "service_id": service.id, "category_id": None}
    _, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "birthday"


def test_winner_selection_min_rule_id(db, master, client_user, service):
    """При одинаковом % и condition_type победитель — правило с меньшим rule_id."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    master.timezone = "UTC"
    db.commit()

    r1 = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="First 1",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "first_visit", "parameters": {}},
    )
    r2 = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="First 2",
        discount_percent=10.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "first_visit", "parameters": {}},
    )
    db.add(r1)
    db.add(r2)
    db.commit()
    db.refresh(r1)
    db.refresh(r2)
    assert r1.id != r2.id
    lower_id = min(r1.id, r2.id)

    payload = {"start_time": datetime.utcnow() + timedelta(days=1), "service_id": service.id, "category_id": None}
    _, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "first_visit"
    assert best["rule_id"] == lower_id


def test_timezone_master_local_happy_hours(db, master, client_user, service):
    """Happy hours проверяются по локальному времени мастера (timezone)."""
    from utils.loyalty_discounts import evaluate_discount_candidates

    _insert_master_service(db, master.id, service.id)
    # Europe/Moscow = UTC+3 (без DST). Однозначная зона; не Etc/GMT-* (inverted sign).
    master.timezone = "Europe/Moscow"
    db.commit()

    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="HH TZ",
        discount_percent=12.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "happy_hours",
            "parameters": {"days": [1], "intervals": [{"start": "12:00", "end": "14:00"}]},
        },
    )
    db.add(rule)
    db.commit()

    # Пн 10:00 UTC = 13:00 Moscow (UTC+3) → внутри 12:00–14:00
    mon_utc = datetime(2025, 6, 2, 10, 0)
    payload = {"start_time": mon_utc, "service_id": service.id, "category_id": None}
    _, best = evaluate_discount_candidates(master.id, client_user.id, None, payload, db)
    assert best is not None
    assert best["condition_type"] == "happy_hours"

    # Пн 08:00 UTC = 11:00 Moscow → вне интервала
    early = datetime(2025, 6, 2, 8, 0)
    payload2 = {"start_time": early, "service_id": service.id, "category_id": None}
    _, best2 = evaluate_discount_candidates(master.id, client_user.id, None, payload2, db)
    assert best2 is None or best2.get("condition_type") != "happy_hours"


def test_applied_discount_unchanged_after_rule_deactivation(db, master, client_user, service):
    """Деактивация правила не меняет и не удаляет AppliedDiscount у уже оформленных бронирований."""
    _insert_master_service(db, master.id, service.id)

    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="First",
        discount_percent=15.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "first_visit", "parameters": {}},
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    start = datetime.utcnow() + timedelta(days=1)
    end = start + timedelta(hours=1)
    booking = Booking(
        master_id=master.id,
        client_id=client_user.id,
        service_id=service.id,
        start_time=start,
        end_time=end,
        status=BookingStatus.COMPLETED.value,
        payment_amount=850.0,
    )
    db.add(booking)
    db.flush()
    ad = AppliedDiscount(
        booking_id=booking.id,
        discount_id=rule.id,
        personal_discount_id=None,
        discount_percent=15.0,
        discount_amount=150.0,
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)

    rule.is_active = False
    db.commit()

    db.refresh(ad)
    row = db.query(AppliedDiscount).filter(AppliedDiscount.booking_id == booking.id).first()
    assert row is not None
    assert row.discount_id == rule.id
    assert row.discount_percent == 15.0
    assert row.discount_amount == 150.0

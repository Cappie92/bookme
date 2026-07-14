"""
Регрессия: подписка с price=0 / daily_rate=0 (100% баллы).

Ранее process_daily_charge возвращал {"error": "daily_rate is zero"} и ломал catch-up.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    DailySubscriptionCharge,
    DailyChargeStatus,
    Master,
    Subscription,
    SubscriptionPlan,
    SubscriptionType,
    User,
    UserRole,
)
from services.daily_charges import catch_up_missed_daily_charges, process_all_daily_charges
from services.promo_engine import create_subscription_points_credit
from models import SubscriptionPointsSourceType
from utils.balance_utils import process_daily_charge


def _setup_master(db: Session, *, phone: str, email: str) -> tuple[User, int]:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Zero Rate Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return user, int(master.id)


def _auth(client, user: User) -> dict:
    resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _apply_full_points_subscription(client, db: Session) -> tuple[User, Subscription]:
    user, master_id = _setup_master(db, phone="+79009990001", email="zero-rate@test.com")
    plan = SubscriptionPlan(
        name="BasicZeroRate",
        display_name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=400.0,
        price_3months=360.0,
        price_6months=320.0,
        price_12months=280.0,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan_id = int(plan.id)

    create_subscription_points_credit(
        db,
        master_id,
        400,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        9001,
        "test",
    )
    db.commit()
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 1,
            "upgrade_type": "immediate",
            "subscription_points_to_use": 400,
        },
    ).json()
    assert calc["final_price"] == 0

    resp = client.post(
        "/api/subscriptions/apply-upgrade-free",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp.status_code == 200
    db.expire_all()

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert float(sub.price) == 0.0
    assert float(sub.daily_rate) == 0.0
    assert sub.is_active is True
    return user, sub


def test_process_daily_charge_zero_rate_not_daily_rate_is_zero_error(client, db: Session):
    """Регрессия: не возвращать 'daily_rate is zero'."""
    _, sub = _apply_full_points_subscription(client, db)
    charge_date = sub.start_date.date()

    result = process_daily_charge(db, sub.id, charge_date)

    assert result.get("error") != "daily_rate is zero"
    assert result["success"] is True
    assert result.get("charge_amount") == 0
    assert result.get("zero_chargeable") is True

    db.expire_all()
    sub = db.query(Subscription).filter(Subscription.id == sub.id).one()
    assert sub.is_active is True

    charge = (
        db.query(DailySubscriptionCharge)
        .filter(
            DailySubscriptionCharge.subscription_id == sub.id,
            DailySubscriptionCharge.charge_date == charge_date,
        )
        .one()
    )
    assert charge.status == DailyChargeStatus.SUCCESS
    assert float(charge.amount) == 0.0


def test_zero_rate_same_day_charge_is_idempotent(client, db: Session):
    _, sub = _apply_full_points_subscription(client, db)
    charge_date = sub.start_date.date()

    first = process_daily_charge(db, sub.id, charge_date)
    assert first["success"] is True

    second = process_daily_charge(db, sub.id, charge_date)
    assert second["success"] is False
    assert second.get("error") == "Списание за эту дату уже произведено"

    count = (
        db.query(DailySubscriptionCharge)
        .filter(DailySubscriptionCharge.subscription_id == sub.id)
        .count()
    )
    assert count == 1


def test_zero_rate_catch_up_does_not_fail_or_deactivate(client, db: Session):
    _, sub = _apply_full_points_subscription(client, db)
    sub_id = sub.id
    day0 = sub.start_date.date()
    day1 = day0 + timedelta(days=1)

    result = catch_up_missed_daily_charges(up_to_date=day1, db=db)
    assert not any("daily_rate is zero" in str(e) for e in result.get("errors", []))
    assert result["charges_applied"] >= 2

    db.expire_all()
    sub = db.query(Subscription).filter(Subscription.id == sub_id).one()
    assert sub.is_active is True


def test_zero_rate_process_all_daily_charges_succeeds(client, db: Session):
    _, sub = _apply_full_points_subscription(client, db)
    sub_id = sub.id
    charge_date = sub.start_date.date()

    result = process_all_daily_charges(charge_date, db=db)
    assert "daily_rate is zero" not in str(result)
    assert result.get("failed_charges", 0) == 0
    assert result.get("deactivated_subscriptions", 0) == 0

    db.expire_all()
    sub = db.query(Subscription).filter(Subscription.id == sub_id).one()
    assert sub.is_active is True


def test_zero_rate_subscriptions_my_days_remaining(client, db: Session):
    user, sub = _apply_full_points_subscription(client, db)
    period_days = duration_months_to_days(1)
    headers = _auth(client, user)

    resp = client.get("/api/subscriptions/my", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["daily_rate"] == 0.0
    assert data["days_remaining"] >= period_days - 2
    assert data["status"] == "active"

    db.expire_all()
    sub = db.query(Subscription).filter(Subscription.id == sub.id).one()
    assert sub.is_active is True


def test_zero_rate_stays_active_until_end_date(client, db: Session):
    _, sub = _apply_full_points_subscription(client, db)
    sub_id = sub.id
    start = sub.start_date.date()
    end_exclusive = sub.end_date.date()

    cur = start
    while cur < end_exclusive:
        r = process_daily_charge(db, sub.id, cur)
        assert r["success"] is True, r
        assert r.get("error") != "daily_rate is zero"
        cur += timedelta(days=1)

    db.expire_all()
    sub = db.query(Subscription).filter(Subscription.id == sub_id).one()
    assert sub.is_active is True

    total = (
        db.query(DailySubscriptionCharge)
        .filter(
            DailySubscriptionCharge.subscription_id == sub_id,
            DailySubscriptionCharge.status == DailyChargeStatus.SUCCESS,
        )
        .count()
    )
    assert total == (end_exclusive - start).days

"""
Тест: daily charge FAILED деактивирует подписку (is_active=False).
"""
from datetime import date, datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    DailySubscriptionCharge,
    DailyChargeStatus,
    Master,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from utils.balance_utils import get_or_create_user_balance, process_daily_charge


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_daily_charge_failed_deactivates_subscription(client, db):
    """FAILED (balance < daily_rate) -> subscription.is_active = False в БД."""
    user = User(
        email="deact_test@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79007770001",
        full_name="Deact Test",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.is_active == True,
        )
        .first()
    )
    plan_id = plan.id if plan else None

    now = datetime.utcnow()
    charge_date = now.date()
    end_date = now + timedelta(days=30)
    daily_rate = 50.0

    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan_id,
        start_date=now,
        end_date=end_date,
        price=1500.0,
        daily_rate=daily_rate,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    ub = get_or_create_user_balance(db, user.id)
    ub.balance = 25.0
    db.commit()

    assert sub.is_active is True

    result = process_daily_charge(db, sub.id, charge_date)

    assert result["success"] is False
    assert result.get("subscription_deactivated") is True

    db.expire_all()
    sub_after = db.query(Subscription).filter(Subscription.id == sub.id).first()
    assert sub_after is not None
    assert sub_after.is_active is False

    charge = (
        db.query(DailySubscriptionCharge)
        .filter(
            DailySubscriptionCharge.subscription_id == sub.id,
            DailySubscriptionCharge.charge_date == charge_date,
        )
        .first()
    )
    assert charge is not None
    assert charge.status == DailyChargeStatus.FAILED


def test_subscription_status_returns_no_subscription_after_deactivation(client, db):
    """После деактивации /api/balance/subscription-status возвращает no_subscription."""
    user = User(
        email="deact_status@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79007770002",
        full_name="Deact Status",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.is_active == True,
        )
        .first()
    )

    now = datetime.utcnow()
    charge_date = now.date()
    end_date = now + timedelta(days=30)
    daily_rate = 50.0

    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id if plan else None,
        start_date=now,
        end_date=end_date,
        price=1500.0,
        daily_rate=daily_rate,
        is_active=False,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/balance/subscription-status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "no_subscription"
    assert data["is_active"] is False

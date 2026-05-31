"""
Тесты days_remaining в /api/subscriptions/my.
Пакет 1/3/6/12 мес: календарные дни до end_date.
Иначе: min(balance_days, calendar_days).
"""
from datetime import datetime, timedelta
import math

import pytest

from auth import get_password_hash
from constants import duration_months_to_days
from models import Master, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User, UserRole
from utils.balance_utils import get_or_create_user_balance


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_master_with_subscription(db, *, balance: float, daily_rate: float, calendar_days: int, phone_suffix: int = 1):
    """Создаёт мастера с подпиской и заданным балансом."""
    user = User(
        email=f"master_days_{phone_suffix}@test.com",
        hashed_password=get_password_hash("test123"),
        phone=f"+7900555000{phone_suffix}",
        full_name="Master Days",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(user_id=user.id, bio="", experience_years=0)
    db.add(master)
    db.commit()

    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
        SubscriptionPlan.is_active == True,
    ).first()
    plan_id = plan.id if plan else None

    now = datetime.utcnow()
    end_date = now + timedelta(days=calendar_days)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan_id,
        start_date=now,
        end_date=end_date,
        price=daily_rate * 30,
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
    ub.balance = balance
    db.commit()

    return user, sub


def test_days_remaining_balance_limits_calendar(client, db):
    """balance=25, daily_rate=100, calendar_days=29 => days_remaining=0"""
    user, _ = _create_master_with_subscription(db, balance=25.0, daily_rate=100.0, calendar_days=29, phone_suffix=1)
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["days_remaining"] == 0


def test_days_remaining_calendar_limits_balance(client, db):
    """balance=5000, daily_rate=100, calendar_days=29 => days_remaining=29"""
    user, _ = _create_master_with_subscription(db, balance=5000.0, daily_rate=100.0, calendar_days=29, phone_suffix=2)
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["days_remaining"] == 29


def test_days_remaining_prepaid_package_uses_calendar_not_balance_cap(client, db):
    """3 мес пакет: balance покрывает ~43 дня daily, calendar ~90 → days_remaining ≈ 90."""
    user = User(
        email="master_pkg@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79005550099",
        full_name="Master Pkg",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
        SubscriptionPlan.is_active == True,
    ).first()

    now = datetime.utcnow()
    period_days = duration_months_to_days(3)
    total_price = 3210.0
    daily_rate = int(math.ceil(total_price / period_days))
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id if plan else None,
        start_date=now,
        end_date=now + timedelta(days=period_days),
        price=total_price,
        daily_rate=daily_rate,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()

    ub = get_or_create_user_balance(db, user.id)
    ub.balance = 1552.0
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    balance_days = int(1552 // max(1, daily_rate))
    assert balance_days < period_days - 5
    assert data["days_remaining"] >= period_days - 3
    assert data["days_remaining"] <= period_days + 2


def test_days_remaining_zero_daily_rate_uses_calendar(client, db):
    """daily_rate<=0 => days_remaining=calendar_days"""
    user, sub = _create_master_with_subscription(db, balance=1000.0, daily_rate=50.0, calendar_days=15, phone_suffix=3)
    sub.daily_rate = 0.0
    db.commit()
    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["days_remaining"] == 15

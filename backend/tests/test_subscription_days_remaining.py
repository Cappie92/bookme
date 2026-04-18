"""
Тесты days_remaining в /api/subscriptions/my.
balance_days = floor(balance / daily_rate)
calendar_days = max(0, floor((end_date - today) / 1day))
days_remaining = min(balance_days, calendar_days)
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
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

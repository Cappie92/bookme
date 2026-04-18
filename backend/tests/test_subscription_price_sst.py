"""
Тест SSoT цены подписки: изменение SubscriptionPlan не влияет на существующую подписку.
"""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    Master,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from utils.balance_utils import get_or_create_user_balance


def _auth_headers(client, phone: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def master_with_subscription(client, db):
    """Мастер с активной подпиской Pro 1 мес (price=1500, daily_rate=50)."""
    user = User(
        email="sst_test@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79991111111",
        full_name="SST Test",
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

    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.name == "Pro",
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
        )
        .first()
    )
    if not plan:
        plan = SubscriptionPlan(
            name="Pro",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1500.0,
            price_3months=1400.0,
            price_6months=1300.0,
            price_12months=1200.0,
            is_active=True,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)

    days = duration_months_to_days(1)
    start = datetime.utcnow()
    end = start + timedelta(days=days)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=start,
        end_date=end,
        price=1500.0,
        daily_rate=50.0,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    get_or_create_user_balance(db, user.id)
    return user, plan, sub


def test_plan_price_change_does_not_affect_existing_subscription(client, db, master_with_subscription):
    """Изменение plan.price_1month не должно менять subscription.price и subscription.daily_rate."""
    user, plan, sub = master_with_subscription
    plan_id = plan.id
    sub_id = sub.id
    old_price = float(plan.price_1month)
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")

    # До изменения
    r = client.get("/api/subscriptions/my", headers=headers)
    assert r.status_code == 200
    before = r.json()
    assert before["daily_rate"] == 50.0
    assert before["price"] == 1500.0

    # Меняем plan
    plan_row = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    plan_row.price_1month = 3000.0
    db.commit()

    # После изменения — subscription и API не должны измениться
    sub_row = db.query(Subscription).filter(Subscription.id == sub_id).first()
    assert sub_row.price == 1500.0
    assert sub_row.daily_rate == 50.0

    r = client.get("/api/subscriptions/my", headers=headers)
    assert r.status_code == 200
    after = r.json()
    assert after["daily_rate"] == 50.0
    assert after["price"] == 1500.0

    # Восстанавливаем
    p = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if p:
        p.price_1month = old_price
        db.commit()

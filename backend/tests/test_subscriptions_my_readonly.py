"""
Тест: GET /api/subscriptions/my — read-only, не создаёт подписку при отсутствии.
"""
import pytest

from auth import get_password_hash
from models import Master, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_subscriptions_my_returns_null_when_no_subscription(client, db):
    """При отсутствии подписки /my возвращает 200 + null, не создаёт запись."""
    user = User(
        email="master_no_sub@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006660001",
        full_name="Master No Sub",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    count_before = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    assert count_before == 0

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)

    assert resp.status_code == 200
    assert resp.json() is None

    count_after = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    assert count_after == 0, "GET /my не должен создавать подписку"


def test_subscriptions_my_null_on_repeat_call(client, db):
    """Повторный вызов /my при отсутствии подписки — снова 200 + null."""
    user = User(
        email="master_no_sub2@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006660002",
        full_name="Master No Sub 2",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    headers = _auth_headers(client, user.phone, "test123")

    resp1 = client.get("/api/subscriptions/my", headers=headers)
    assert resp1.status_code == 200
    assert resp1.json() is None

    resp2 = client.get("/api/subscriptions/my", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json() is None


def test_subscriptions_my_requires_auth(client):
    """Без авторизации /my возвращает 401."""
    resp = client.get("/api/subscriptions/my")
    assert resp.status_code == 401


def test_subscriptions_my_returns_subscription_when_active(client, db):
    """При активной подписке /my возвращает прежний payload."""
    user = User(
        email="master_with_sub@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79006660003",
        full_name="Master With Sub",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

    plan = SubscriptionPlan(
        name="basic_test",
        display_name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500.0,
        price_3months=450.0,
        price_6months=400.0,
        price_12months=350.0,
        features={},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    from datetime import datetime, timedelta

    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        plan_id=plan.id,
        price=500.0,
        daily_rate=500.0 / 30.0,
        start_date=datetime.utcnow() - timedelta(days=1),
        end_date=datetime.utcnow() + timedelta(days=29),
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
        auto_renewal=False,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    sub_id = sub.id
    plan_id = plan.id

    headers = _auth_headers(client, user.phone, "test123")
    resp = client.get("/api/subscriptions/my", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data is not None
    assert data["id"] == sub_id
    assert data["plan_id"] == plan_id
    assert data["status"] == "active"

from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    Master,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)


FORBIDDEN_BILLING_FIELDS = {
    "id",
    "user_id",
    "price",
    "daily_rate",
    "reserved_amount",
    "spent_amount",
    "days_remaining",
    "auto_renewal",
    "payment_method",
    "billing_provider",
    "duration_months",
    "package_value",
    "monthly_price",
    "amount_paid",
    "points_used",
    "points_spent",
}


def _master(db, suffix: str, *, always_free: bool = False):
    user = User(
        email=f"access-{suffix}@test.local",
        phone=f"+7998{abs(hash(suffix)) % 10_000_000:07d}",
        full_name=f"Access {suffix}",
        hashed_password=get_password_hash("test123"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_always_free=always_free,
    )
    db.add(user)
    db.flush()
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()
    return user


def _headers(client, user):
    response = client.post("/api/auth/login", json={"phone": user.phone, "password": "test123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _plan(db, name: str, *, limit=None):
    plan = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=100,
        price_3months=100,
        price_6months=100,
        price_12months=100,
        features={
            "service_functions": [1, 2, 3, 4, 5, 6, 7],
            "max_page_modules": 7,
            "stats_retention_days": 0,
        },
        limits={"max_future_bookings": limit},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _subscription(db, user, plan, *, active=True):
    now = datetime.utcnow()
    subscription = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE if active else SubscriptionStatus.EXPIRED,
        is_active=active,
        plan_id=plan.id,
        price=999,
        daily_rate=33,
        start_date=now - timedelta(days=30),
        end_date=now + timedelta(days=30) if active else now - timedelta(days=1),
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
        auto_renewal=False,
        billing_provider="robokassa",
    )
    db.add(subscription)
    db.commit()
    return subscription


def _get(client, user):
    return client.get("/api/subscriptions/access-summary", headers=_headers(client, user))


def _assert_minimal(data):
    assert FORBIDDEN_BILLING_FIELDS.isdisjoint(data)
    assert set(data) == {
        "access_level",
        "plan_name",
        "plan_display_name",
        "status",
        "is_active",
        "end_date",
        "is_always_free",
        "features",
        "current_active_bookings",
        "max_future_bookings",
        "is_unlimited",
    }


def test_access_summary_free_is_20_and_minimal(client, db):
    user = _master(db, "free")
    response = _get(client, user)
    assert response.status_code == 200, response.text
    data = response.json()
    _assert_minimal(data)
    assert data["access_level"] == "free"
    assert data["plan_name"] == "Free"
    assert data["max_future_bookings"] == 20
    assert data["is_unlimited"] is False


@pytest.mark.parametrize("plan_name", ["Pro", "Premium"])
def test_access_summary_paid_entitlement(client, db, plan_name):
    user = _master(db, plan_name.lower())
    plan = _plan(db, plan_name)
    _subscription(db, user, plan)
    response = _get(client, user)
    assert response.status_code == 200, response.text
    data = response.json()
    _assert_minimal(data)
    assert data["access_level"] == "paid"
    assert data["plan_name"] == plan_name
    assert data["status"] == "active"
    assert data["end_date"] is not None
    assert data["features"]["has_finance_access"] is True


def test_access_summary_always_free_is_readonly_and_unlimited(client, db):
    user = _master(db, "always", always_free=True)
    plan = _plan(db, "AlwaysFree")
    before = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    response = _get(client, user)
    assert response.status_code == 200, response.text
    data = response.json()
    _assert_minimal(data)
    assert data["access_level"] == "always_free"
    assert data["plan_name"] == plan.name
    assert data["is_always_free"] is True
    assert data["is_unlimited"] is True
    assert data["max_future_bookings"] is None
    after = db.query(Subscription).filter(Subscription.user_id == user.id).count()
    assert before == after == 0


def test_access_summary_expired_entitlement_falls_back_to_free(client, db):
    user = _master(db, "expired")
    plan = _plan(db, "Pro")
    _subscription(db, user, plan, active=False)
    data = _get(client, user).json()
    assert data["access_level"] == "free"
    assert data["plan_name"] == "Free"
    assert data["end_date"] is None
    assert data["max_future_bookings"] == 20


def test_access_summary_requires_auth(client):
    response = client.get("/api/subscriptions/access-summary")
    assert response.status_code == 401


def test_existing_subscriptions_my_contract_keeps_billing_fields(client, db):
    user = _master(db, "android-commerce")
    plan = _plan(db, "Pro")
    _subscription(db, user, plan)
    response = client.get("/api/subscriptions/my", headers=_headers(client, user))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["price"] == 999
    assert data["daily_rate"] == 33
    assert data["payment_method"] == "card"
    assert data["billing_provider"] == "robokassa"

"""Оплата апгрейда подписки с баланса."""
from datetime import datetime, timedelta
import math

import pytest

from models import (
    Master,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserBalance,
    UserRole,
)
from auth import get_password_hash
from constants import duration_months_to_days
from tests.conftest import _login


def _plan(db, name="Pro", order=2):
    p = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=350,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=order,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _user(db, phone="+79001118877"):
    u = User(
        email=f"{phone}@t.com",
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Bal Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    db.add(
        Master(
            user_id=u.id,
            bio="",
            experience_years=0,
            city="Москва",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
        )
    )
    db.commit()
    return u


def _headers(client, user):
    data = _login(client, user.phone)
    return {"Authorization": f"Bearer {data['access_token']}"}


def test_apply_upgrade_balance_success(client, db):
    user = _user(db)
    basic = _plan(db, "Basic", 1)
    pro = _plan(db, "Pro", 2)

    now = datetime.utcnow()
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=5),
        end_date=now + timedelta(days=25),
        price=float(basic.price_1month),
        daily_rate=17,
        plan_id=basic.id,
        auto_renewal=False,
    )
    db.add(sub)
    db.add(UserBalance(user_id=user.id, balance=5000.0, currency="RUB"))
    db.commit()

    snap = SubscriptionPriceSnapshot(
        user_id=user.id,
        plan_id=pro.id,
        duration_months=1,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=500,
        total_price=500.0,
        monthly_price=500.0,
        daily_price=17.0,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=3210.0,
        upgrade_type="immediate",
        is_downgrade=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)

    resp = client.post(
        "/api/subscriptions/apply-upgrade-balance",
        json={"calculation_id": snap.id},
        headers=_headers(client, user),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["subscription_id"]
    assert data["paid_from_balance"] == 3210.0
    assert data["balance_after"] == pytest.approx(5000.0 - 3210.0, abs=0.01)

    snap_db = (
        db.query(SubscriptionPriceSnapshot)
        .filter(SubscriptionPriceSnapshot.id == snap.id)
        .first()
    )
    assert snap_db is not None
    assert snap_db.applied_subscription_id is not None

    my = client.get("/api/subscriptions/my", headers=_headers(client, user))
    assert my.status_code == 200, my.text
    my_data = my.json()
    period_days = duration_months_to_days(1)
    assert my_data["days_remaining"] >= period_days - 3


def test_apply_upgrade_balance_three_months_days_remaining(client, db):
    """После оплаты 3 мес с баланса days_remaining ≈ 90, не floor(balance/daily_rate)."""
    user = _user(db, "+79001118879")
    basic = _plan(db, "Basic", 1)
    pro = _plan(db, "Pro", 2)
    now = datetime.utcnow()
    period_days = duration_months_to_days(3)
    total_price = 3000.0
    final_price = 3000.0
    daily_rate = int(math.ceil(total_price / period_days))

    sub_old = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=5),
        end_date=now + timedelta(days=25),
        price=float(basic.price_1month),
        daily_rate=17,
        plan_id=basic.id,
        auto_renewal=False,
    )
    db.add(sub_old)
    db.add(UserBalance(user_id=user.id, balance=5000.0, currency="RUB"))
    db.commit()

    snap = SubscriptionPriceSnapshot(
        user_id=user.id,
        plan_id=pro.id,
        duration_months=3,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=350,
        total_price=total_price,
        monthly_price=1000.0,
        daily_price=float(daily_rate),
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=final_price,
        upgrade_type="immediate",
        is_downgrade=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)

    resp = client.post(
        "/api/subscriptions/apply-upgrade-balance",
        json={"calculation_id": snap.id},
        headers=_headers(client, user),
    )
    assert resp.status_code == 200, resp.text

    my = client.get("/api/subscriptions/my", headers=_headers(client, user))
    assert my.status_code == 200, my.text
    data = my.json()
    assert data["days_remaining"] >= period_days - 3
    assert data["days_remaining"] <= period_days + 2
    balance_after = float(resp.json()["balance_after"])
    balance_days = int(balance_after // max(1, daily_rate))
    assert balance_days < period_days - 10


def test_apply_upgrade_balance_insufficient(client, db):
    user = _user(db, "+79001118878")
    pro = _plan(db)
    now = datetime.utcnow()
    snap = SubscriptionPriceSnapshot(
        user_id=user.id,
        plan_id=pro.id,
        duration_months=1,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=500,
        total_price=500.0,
        monthly_price=500.0,
        daily_price=17.0,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=1000.0,
        upgrade_type="immediate",
        is_downgrade=False,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(snap)
    db.add(UserBalance(user_id=user.id, balance=100.0, currency="RUB"))
    db.commit()
    db.refresh(snap)

    resp = client.post(
        "/api/subscriptions/apply-upgrade-balance",
        json={"calculation_id": snap.id},
        headers=_headers(client, user),
    )
    assert resp.status_code == 400

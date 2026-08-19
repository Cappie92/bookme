"""Apple IAP legacy sync, identity, idempotency, and charge exclusion tests."""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from services.apple_subscription_sync import (
    ensure_revenuecat_app_user_id,
    sync_apple_entitlement_for_user,
)
from services.daily_charges import get_active_subscription_ids_for_date


def _seed_master(db, *, email="apple-master@example.com"):
    user = User(
        email=email,
        phone=f"+7999{abs(hash(email)) % 10000000:07d}",
        full_name="Apple Master",
        hashed_password="x",
        role=UserRole.MASTER,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_plan(db, name: str, *, price_1=500.0):
    existing = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == name).first()
    if existing:
        return existing
    plan = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=price_1,
        price_3months=price_1 * 0.9,
        price_6months=price_1 * 0.8,
        price_12months=price_1 * 0.7,
        is_active=True,
        features={"service_functions": [1, 2, 3, 4, 5, 6, 7]},
        limits={},
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _rc_payload(product_id: str, *, days=30, sandbox=True, store_tx="tx-orig-1"):
    now = datetime.utcnow()
    return {
        "subscriber": {
            "subscriptions": {
                product_id: {
                    "expires_date": (now + timedelta(days=days)).strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),
                    "purchase_date": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "original_purchase_date": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "store_transaction_id": store_tx,
                    "is_sandbox": sandbox,
                }
            }
        }
    }


def test_ensure_revenuecat_id_stable(db):
    user = _seed_master(db)
    a = ensure_revenuecat_app_user_id(db, user)
    b = ensure_revenuecat_app_user_id(db, user)
    assert a == b
    assert len(a) == 36


def test_sync_basic_1m(db):
    user = _seed_master(db)
    _seed_plan(db, "Basic")
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload("ru.dedato.subscription.basic.monthly"),
    ):
        result = sync_apple_entitlement_for_user(db, user)
    assert result["active"] is True
    assert result["plan_name"] == "Basic"
    assert result["duration_months"] == 1
    sub = (
        db.query(Subscription)
        .filter(Subscription.id == result["subscription_id"])
        .one()
    )
    assert sub.billing_provider == "apple"
    assert sub.apple_product_id == "ru.dedato.subscription.basic.monthly"
    assert sub.apple_environment == "sandbox"
    assert sub.is_active is True


@pytest.mark.parametrize(
    "product_id,plan_name,months",
    [
        ("ru.dedato.subscription.basic.3months", "Basic", 3),
        ("ru.dedato.subscription.basic.6months", "Basic", 6),
        ("ru.dedato.subscription.basic.yearly", "Basic", 12),
        ("ru.dedato.subscription.standard.monthly", "Pro", 1),
        ("dedato_premium_monthly", "Premium", 1),
    ],
)
def test_sync_mapping_matrix(db, product_id, plan_name, months):
    user = _seed_master(db, email=f"{product_id}@ex.com")
    _seed_plan(db, "Basic")
    _seed_plan(db, "Pro", price_1=1500)
    _seed_plan(db, "Premium", price_1=3000)
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(product_id, store_tx=f"tx-{product_id}"),
    ):
        result = sync_apple_entitlement_for_user(db, user)
    assert result["plan_name"] == plan_name
    assert result["duration_months"] == months


def test_sync_idempotent(db):
    user = _seed_master(db)
    _seed_plan(db, "Basic")
    payload = _rc_payload("ru.dedato.subscription.basic.monthly", store_tx="same-tx")
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=payload,
    ):
        a = sync_apple_entitlement_for_user(db, user)
        b = sync_apple_entitlement_for_user(db, user)
    assert a["subscription_id"] == b["subscription_id"]
    assert db.query(Subscription).filter(Subscription.user_id == user.id).count() == 1


def test_unknown_product_ignored_as_inactive(db):
    user = _seed_master(db)
    _seed_plan(db, "Basic")
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload("totally_unknown_sku"),
    ):
        result = sync_apple_entitlement_for_user(db, user)
    assert result["active"] is False
    assert result["reason"] == "no_active_apple_entitlement"


def test_identity_mismatch_rejected(db):
    user = _seed_master(db)
    ensure_revenuecat_app_user_id(db, user)
    with pytest.raises(HTTPException) as ei:
        sync_apple_entitlement_for_user(db, user, expected_app_user_id="wrong-uuid")
    assert ei.value.status_code == 403


def test_other_user_unaffected(db):
    u1 = _seed_master(db, email="u1@ex.com")
    u2 = _seed_master(db, email="u2@ex.com")
    _seed_plan(db, "Basic")
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(
            "ru.dedato.subscription.basic.monthly", store_tx="u1-tx"
        ),
    ):
        sync_apple_entitlement_for_user(db, u1)
    assert db.query(Subscription).filter(Subscription.user_id == u2.id).count() == 0


def test_expired_entitlement_deactivates_apple(db):
    user = _seed_master(db)
    _seed_plan(db, "Basic")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "Basic").one()
    past = datetime.utcnow() - timedelta(days=10)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=past,
        end_date=past + timedelta(days=5),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="apple",
        apple_original_transaction_id="old-tx",
        apple_product_id="ru.dedato.subscription.basic.monthly",
        apple_environment="sandbox",
    )
    db.add(sub)
    db.commit()

    empty = {"subscriber": {"subscriptions": {}}}
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=empty,
    ):
        result = sync_apple_entitlement_for_user(db, user)
    assert result["active"] is False
    db.refresh(sub)
    assert sub.is_active is False


def test_apple_still_excluded_from_daily_charges(db):
    """Apple subscriptions stay out of Robokassa daily charge selection."""
    user_a = _seed_master(db, email="apple@ex.com")
    user_r = _seed_master(db, email="robo@ex.com")
    plan = _seed_plan(db, "Basic")
    now = datetime.utcnow()
    apple = Subscription(
        user_id=user_a.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="apple",
        apple_original_transaction_id="daily-apple",
        apple_product_id="ru.dedato.subscription.basic.monthly",
    )
    robo = Subscription(
        user_id=user_r.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="robokassa",
    )
    db.add(apple)
    db.add(robo)
    db.commit()

    ids = get_active_subscription_ids_for_date(db, now.date())
    assert apple.id not in ids
    assert robo.id in ids


def test_active_robokassa_not_deactivated_by_apple_sync(db):
    user = _seed_master(db, email="robo-keep@ex.com")
    plan = _seed_plan(db, "Basic")
    now = datetime.utcnow()
    robo = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=20),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="robokassa",
    )
    db.add(robo)
    db.commit()
    db.refresh(robo)

    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(
            "ru.dedato.subscription.basic.monthly",
            store_tx="should-not-activate",
        ),
    ):
        result = sync_apple_entitlement_for_user(db, user)

    assert result["reason"] == "blocked_by_active_non_apple_subscription"
    db.refresh(robo)
    assert robo.is_active is True
    assert robo.status == SubscriptionStatus.ACTIVE
    apple = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.billing_provider == "apple",
        )
        .one()
    )
    assert apple.is_active is False
    assert apple.status == SubscriptionStatus.PENDING


def test_apple_sync_blocked_when_robokassa_active(db):
    user = _seed_master(db, email="blocked-robo@ex.com")
    plan = _seed_plan(db, "Basic")
    now = datetime.utcnow()
    robo = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=2),
        end_date=now + timedelta(days=15),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="robokassa",
    )
    db.add(robo)
    db.commit()
    db.refresh(robo)

    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(
            "ru.dedato.subscription.basic.monthly", store_tx="blocked-tx"
        ),
    ):
        result = sync_apple_entitlement_for_user(db, user)

    assert result["ok"] is True
    assert result["active"] is False
    assert result["reason"] == "blocked_by_active_non_apple_subscription"
    assert result["conflict"] is True
    assert result["blocking_subscription_id"] == robo.id
    assert result["blocking_billing_provider"] == "robokassa"
    db.refresh(robo)
    assert robo.is_active is True


def test_expired_robokassa_allows_apple_sync(db):
    user = _seed_master(db, email="expired-robo@ex.com")
    plan = _seed_plan(db, "Basic")
    now = datetime.utcnow()
    robo = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.EXPIRED,
        is_active=False,
        start_date=now - timedelta(days=40),
        end_date=now - timedelta(days=5),
        price=500,
        daily_rate=16,
        plan_id=plan.id,
        billing_provider="robokassa",
    )
    db.add(robo)
    db.commit()

    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(
            "ru.dedato.subscription.basic.monthly", store_tx="after-robo"
        ),
    ):
        result = sync_apple_entitlement_for_user(db, user)

    assert result["active"] is True
    assert result["reason"] == "created"
    apple = (
        db.query(Subscription)
        .filter(Subscription.id == result["subscription_id"])
        .one()
    )
    assert apple.billing_provider == "apple"
    assert apple.is_active is True
    db.refresh(robo)
    assert robo.is_active is False


def test_production_metadata(db):
    user = _seed_master(db)
    _seed_plan(db, "Premium", price_1=3000)
    with patch(
        "services.apple_subscription_sync.fetch_revenuecat_subscriber",
        return_value=_rc_payload(
            "dedato_premium_monthly", sandbox=False, store_tx="prod-tx"
        ),
    ):
        result = sync_apple_entitlement_for_user(db, user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.id == result["subscription_id"])
        .one()
    )
    assert sub.apple_environment == "production"

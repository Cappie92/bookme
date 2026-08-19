from datetime import datetime, timedelta
from typing import Optional
from unittest.mock import patch
from uuid import uuid4

from models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from services.apple_store_verification import (
    AppleStoreVerificationError,
    VerifiedAppleTransaction,
)
from services.apple_subscription_sync import (
    ensure_app_account_token,
    upsert_verified_apple_subscription,
)

PRODUCTS = {
    "Basic": ("ru.dedato.subscription.basic.monthly", "Basic", 1),
    "Pro": ("ru.dedato.subscription.standard.monthly", "Standard", 1),
    "Premium": ("dedato_premium_monthly", "Premium", 1),
}


def _seed_plan(db, name: str, order: int) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        display_name={"Basic": "Базовый", "Pro": "Стандартный", "Premium": "Премиум"}[
            name
        ],
        subscription_type=SubscriptionType.MASTER,
        price_1month=500.0 * order,
        price_3months=450.0 * order,
        price_6months=425.0 * order,
        price_12months=400.0 * order,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=order,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _seed_plans(db):
    return {name: _seed_plan(db, name, index) for index, name in enumerate(PRODUCTS, 1)}


def _verified(
    token: str,
    *,
    plan_name: str = "Basic",
    transaction_id: str = "tx-1",
    original_transaction_id: str = "orig-1",
    purchase_date: Optional[datetime] = None,
    expires_date: Optional[datetime] = None,
    revocation_date: Optional[datetime] = None,
    environment: str = "sandbox",
) -> VerifiedAppleTransaction:
    now = datetime.utcnow()
    product_id, external_tier, months = PRODUCTS[plan_name]
    return VerifiedAppleTransaction(
        transaction_id=transaction_id,
        original_transaction_id=original_transaction_id,
        product_id=product_id,
        internal_plan_name=plan_name,
        external_tier=external_tier,
        duration_months=months,
        app_account_token=token,
        purchase_date=purchase_date or now,
        expires_date=expires_date or (now + timedelta(days=30)),
        revocation_date=revocation_date,
        revocation_reason=1 if revocation_date else None,
        environment=environment,
    )


def _identity(client, headers) -> str:
    response = client.get("/api/payments/apple/billing-identity", headers=headers)
    assert response.status_code == 200, response.json()
    assert set(response.json()) == {"app_account_token"}
    return response.json()["app_account_token"]


def _verify(client, headers, transaction, source="purchase"):
    with patch(
        "routers.apple_iap.verify_apple_signed_transaction",
        return_value=transaction,
    ):
        return client.post(
            "/api/payments/apple/transactions/verify",
            headers=headers,
            json={"signed_transaction": "mocked-jws", "source": source},
        )


def _subscription_state(subscription: Subscription):
    return tuple(
        (column.name, getattr(subscription, column.name))
        for column in Subscription.__table__.columns
    )


def test_billing_identity_is_stable_neutral_and_unique(
    client, db, test_master, master_auth_headers
):
    first = _identity(client, master_auth_headers)
    second = _identity(client, master_auth_headers)
    assert first == second

    other = User(
        email="other-apple@example.com",
        phone="+79991230001",
        full_name="Other Apple Master",
        hashed_password="x",
        role=UserRole.MASTER,
        is_active=True,
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    assert ensure_app_account_token(db, other) != first


def test_first_purchase_repeat_restore_and_renewal_are_idempotent(
    client, db, test_master, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    first_tx = _verified(token)

    first = _verify(client, master_auth_headers, first_tx)
    assert first.status_code == 200, first.json()
    assert first.json()["finish_transaction"] is True
    subscription_id = first.json()["subscription_id"]

    repeat = _verify(client, master_auth_headers, first_tx, source="restore")
    assert repeat.status_code == 200, repeat.json()
    assert repeat.json()["subscription_id"] == subscription_id
    assert repeat.json()["finish_transaction"] is True

    renewal = _verified(
        token,
        transaction_id="tx-2",
        expires_date=datetime.utcnow() + timedelta(days=60),
    )
    renewed = _verify(
        client,
        master_auth_headers,
        renewal,
        source="transaction_update",
    )
    assert renewed.status_code == 200, renewed.json()
    assert renewed.json()["subscription_id"] == subscription_id
    assert (
        db.query(Subscription)
        .filter(
            Subscription.user_id == test_master.id,
            Subscription.billing_provider == "apple",
        )
        .count()
        == 1
    )
    row = db.query(Subscription).filter(Subscription.id == subscription_id).one()
    assert row.apple_transaction_id == "tx-2"


def test_same_transaction_and_expiration_is_idempotent(client, db, master_auth_headers):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    expires = datetime.utcnow() + timedelta(days=30)
    transaction = _verified(token, expires_date=expires)
    first = _verify(client, master_auth_headers, transaction)
    subscription_id = first.json()["subscription_id"]
    before = _subscription_state(
        db.query(Subscription).filter(Subscription.id == subscription_id).one()
    )

    repeated = _verify(client, master_auth_headers, transaction, source="restore")
    assert repeated.status_code == 200, repeated.json()
    assert repeated.json()["subscription_id"] == subscription_id
    db.expire_all()
    after = _subscription_state(
        db.query(Subscription).filter(Subscription.id == subscription_id).one()
    )
    assert after == before
    assert db.query(Subscription).count() == 1


def test_product_change_updates_same_original_subscription(
    client, db, test_master, master_auth_headers
):
    plans = _seed_plans(db)
    pro_plan_id = plans["Pro"].id
    token = _identity(client, master_auth_headers)
    first = _verify(client, master_auth_headers, _verified(token))
    changed = _verify(
        client,
        master_auth_headers,
        _verified(token, plan_name="Pro", transaction_id="tx-upgrade"),
        source="current_entitlement",
    )
    assert changed.status_code == 200, changed.json()
    assert changed.json()["plan_name"] == "Pro"
    row = (
        db.query(Subscription)
        .filter(Subscription.id == first.json()["subscription_id"])
        .one()
    )
    assert row.plan_id == pro_plan_id


def test_older_verified_transaction_cannot_regress_newer_entitlement(
    client, db, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    now = datetime.utcnow()
    newer = _verified(
        token,
        transaction_id="tx-newer",
        expires_date=now + timedelta(days=90),
    )
    created = _verify(client, master_auth_headers, newer)
    older = _verified(
        token,
        transaction_id="tx-older",
        purchase_date=now - timedelta(days=30),
        expires_date=now + timedelta(days=10),
    )
    ignored = _verify(client, master_auth_headers, older, source="restore")
    assert ignored.status_code == 200, ignored.json()
    assert ignored.json()["reason"] == "stale_verified_transaction_ignored"
    row = (
        db.query(Subscription)
        .filter(Subscription.id == created.json()["subscription_id"])
        .one()
    )
    assert row.apple_transaction_id == "tx-newer"
    assert row.end_date > now + timedelta(days=80)


def test_different_transaction_with_equal_expiration_cannot_change_plan(
    client, db, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    expires = datetime.utcnow() + timedelta(days=30)
    created = _verify(
        client,
        master_auth_headers,
        _verified(token, transaction_id="tx-basic", expires_date=expires),
    )
    subscription_id = created.json()["subscription_id"]
    before = _subscription_state(
        db.query(Subscription).filter(Subscription.id == subscription_id).one()
    )

    ambiguous = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            plan_name="Pro",
            transaction_id="tx-pro-equal-expiry",
            expires_date=expires,
        ),
        source="current_entitlement",
    )
    assert ambiguous.status_code == 409
    assert ambiguous.json()["detail"] == "apple_transaction_requires_status_refresh"
    assert ambiguous.json().get("finish_transaction") is not True
    db.expire_all()
    after = _subscription_state(
        db.query(Subscription).filter(Subscription.id == subscription_id).one()
    )
    assert after == before
    assert db.query(Subscription).count() == 1


def test_equal_expiration_cannot_revoke_or_reactivate_with_different_transaction(
    client, db, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    now = datetime.utcnow()
    expires = now + timedelta(days=30)
    active = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            transaction_id="tx-active",
            original_transaction_id="orig-active",
            expires_date=expires,
        ),
    )
    active_id = active.json()["subscription_id"]
    active_before = _subscription_state(
        db.query(Subscription).filter(Subscription.id == active_id).one()
    )
    revoke = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            transaction_id="tx-revoke-equal",
            original_transaction_id="orig-active",
            expires_date=expires,
            revocation_date=now,
        ),
    )
    assert revoke.status_code == 409
    db.expire_all()
    assert (
        _subscription_state(
            db.query(Subscription).filter(Subscription.id == active_id).one()
        )
        == active_before
    )

    revoked = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            transaction_id="tx-revoked-current",
            original_transaction_id="orig-revoked-current",
            expires_date=expires,
            revocation_date=now,
        ),
    )
    revoked_id = revoked.json()["subscription_id"]
    revoked_before = _subscription_state(
        db.query(Subscription).filter(Subscription.id == revoked_id).one()
    )
    reactivate = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            transaction_id="tx-reactivate-equal",
            original_transaction_id="orig-revoked-current",
            expires_date=expires,
        ),
    )
    assert reactivate.status_code == 409
    db.expire_all()
    assert (
        _subscription_state(
            db.query(Subscription).filter(Subscription.id == revoked_id).one()
        )
        == revoked_before
    )


def test_expired_and_revoked_verified_transactions_are_recorded_inactive(
    client, db, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    now = datetime.utcnow()
    expired = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            original_transaction_id="orig-expired",
            transaction_id="tx-expired",
            purchase_date=now - timedelta(days=60),
            expires_date=now - timedelta(days=30),
        ),
    )
    assert expired.status_code == 200, expired.json()
    assert expired.json()["expired"] is True
    assert expired.json()["active"] is False

    revoked = _verify(
        client,
        master_auth_headers,
        _verified(
            token,
            original_transaction_id="orig-revoked",
            transaction_id="tx-revoked",
            revocation_date=now,
        ),
    )
    assert revoked.status_code == 200, revoked.json()
    row = (
        db.query(Subscription)
        .filter(Subscription.id == revoked.json()["subscription_id"])
        .one()
    )
    assert row.status == SubscriptionStatus.CANCELLED
    assert row.is_active is False


def test_wrong_app_account_token_does_not_create_subscription(
    client, db, master_auth_headers
):
    _seed_plans(db)
    _identity(client, master_auth_headers)
    response = _verify(client, master_auth_headers, _verified(str(uuid4())))
    assert response.status_code == 403
    assert response.json().get("finish_transaction") is not True
    assert db.query(Subscription).count() == 0


def test_original_transaction_linked_to_another_user_fails(
    client, db, test_master, master_auth_headers
):
    _seed_plans(db)
    current_token = _identity(client, master_auth_headers)
    other = User(
        email="owner@example.com",
        phone="+79991230002",
        full_name="Owner",
        hashed_password="x",
        role=UserRole.MASTER,
        is_active=True,
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    other_token = ensure_app_account_token(db, other)
    upsert_verified_apple_subscription(db, other, _verified(other_token))
    db.commit()

    response = _verify(client, master_auth_headers, _verified(current_token))
    assert response.status_code == 409
    assert response.json().get("finish_transaction") is not True
    assert db.query(Subscription).count() == 1


def test_active_robokassa_conflict_records_pending_apple_without_supersede(
    client, db, test_master, master_auth_headers
):
    plans = _seed_plans(db)
    basic_plan_id = plans["Basic"].id
    token = _identity(client, master_auth_headers)
    now = datetime.utcnow()
    robokassa = Subscription(
        user_id=test_master.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=10),
        price=500,
        daily_rate=10,
        plan_id=basic_plan_id,
        billing_provider="robokassa",
    )
    db.add(robokassa)
    db.commit()
    robokassa_id = robokassa.id

    verified = _verified(token)
    response = _verify(client, master_auth_headers, verified)
    assert response.status_code == 200, response.json()
    assert response.json()["finish_transaction"] is True
    assert response.json()["reason"] == "blocked_by_active_non_apple_subscription"
    apple = (
        db.query(Subscription).filter(Subscription.billing_provider == "apple").one()
    )
    apple_id = apple.id
    assert apple.status == SubscriptionStatus.PENDING
    assert apple.is_active is False
    repeated = _verify(client, master_auth_headers, verified, source="restore")
    assert repeated.status_code == 200, repeated.json()
    assert repeated.json()["subscription_id"] == apple_id
    assert repeated.json()["finish_transaction"] is True
    assert (
        db.query(Subscription).filter(Subscription.billing_provider == "apple").count()
        == 1
    )
    preserved = db.query(Subscription).filter(Subscription.id == robokassa_id).one()
    assert preserved.status == SubscriptionStatus.ACTIVE
    assert preserved.is_active is True


def test_robokassa_conflict_commit_failure_rolls_back_apple_state(
    client, db, test_master, master_auth_headers
):
    plans = _seed_plans(db)
    basic_plan_id = plans["Basic"].id
    token = _identity(client, master_auth_headers)
    now = datetime.utcnow()
    robokassa = Subscription(
        user_id=test_master.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=10),
        price=500,
        daily_rate=10,
        plan_id=basic_plan_id,
        billing_provider="robokassa",
    )
    db.add(robokassa)
    db.commit()
    robokassa_id = robokassa.id

    with (
        patch(
            "routers.apple_iap.verify_apple_signed_transaction",
            return_value=_verified(token),
        ),
        patch.object(db, "commit", side_effect=RuntimeError("db failed")),
    ):
        failed = client.post(
            "/api/payments/apple/transactions/verify",
            headers=master_auth_headers,
            json={"signed_transaction": "valid", "source": "purchase"},
        )
    assert failed.status_code == 500
    assert failed.json().get("finish_transaction") is not True
    assert (
        db.query(Subscription).filter(Subscription.billing_provider == "apple").count()
        == 0
    )
    preserved = db.query(Subscription).filter(Subscription.id == robokassa_id).one()
    assert preserved.status == SubscriptionStatus.ACTIVE
    assert preserved.is_active is True


def test_verification_and_db_failures_never_signal_finish(
    client, db, master_auth_headers
):
    _seed_plans(db)
    token = _identity(client, master_auth_headers)
    with patch(
        "routers.apple_iap.verify_apple_signed_transaction",
        side_effect=AppleStoreVerificationError("invalid_signed_transaction"),
    ):
        invalid = client.post(
            "/api/payments/apple/transactions/verify",
            headers=master_auth_headers,
            json={"signed_transaction": "bad", "source": "purchase"},
        )
    assert invalid.status_code == 400
    assert invalid.json().get("finish_transaction") is not True
    assert db.query(Subscription).count() == 0

    with (
        patch(
            "routers.apple_iap.verify_apple_signed_transaction",
            return_value=_verified(token),
        ),
        patch.object(db, "commit", side_effect=RuntimeError("db failed")),
    ):
        failed = client.post(
            "/api/payments/apple/transactions/verify",
            headers=master_auth_headers,
            json={"signed_transaction": "valid", "source": "purchase"},
        )
    assert failed.status_code == 500
    assert failed.json().get("finish_transaction") is not True
    assert db.query(Subscription).count() == 0

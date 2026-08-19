"""Symmetric Apple and Robokassa subscription-provider conflict tests."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from auth import get_password_hash
from models import (
    BalanceTransaction,
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    TransactionType,
    User,
    UserBalance,
    UserRole,
)
from utils.robokassa import compute_result_signature


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "dedato")
    from settings import reload_settings

    reload_settings()


def _seed_master_and_plan(db):
    user = User(
        email="provider-conflict@example.com",
        phone="+79991239876",
        full_name="Provider Conflict Master",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        revenuecat_app_user_id=str(uuid4()),
    )
    plan = SubscriptionPlan(
        name="Basic",
        display_name="Базовый",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=425,
        price_12months=400,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add_all([user, plan])
    db.commit()
    db.refresh(user)
    db.refresh(plan)
    db.add(
        Master(
            user_id=user.id,
            bio="",
            experience_years=0,
            city="Москва",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
        )
    )
    db.commit()
    return user, plan


def _login(client, phone):
    response = client.post(
        "/api/auth/login",
        json={"phone": phone, "password": "testpassword"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _init_robokassa_payment(client, db, plan_id, headers):
    calculated = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 1,
            "upgrade_type": "immediate",
        },
    )
    assert calculated.status_code == 200, calculated.text
    initialized = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calculated.json()["calculation_id"],
        },
    )
    assert initialized.status_code == 200, initialized.text
    payment = (
        db.query(Payment)
        .filter(Payment.public_id == initialized.json()["payment"])
        .one()
    )
    return payment


def _create_active_apple(db, user_id, plan_id):
    now = datetime.utcnow()
    subscription = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        price=500,
        daily_rate=500 / 31,
        payment_period="month",
        auto_renewal=True,
        plan_id=plan_id,
        billing_provider="apple",
        apple_original_transaction_id="orig-provider-conflict",
        apple_transaction_id="tx-provider-conflict",
        apple_product_id="ru.dedato.subscription.basic.monthly",
        apple_environment="sandbox",
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def _send_result_callback(client, payment):
    out_sum = f"{payment.amount:.2f}"
    signature = compute_result_signature(
        out_sum,
        payment.robokassa_invoice_id,
        "p2",
    )
    return client.post(
        "/api/payments/robokassa/result",
        data={
            "OutSum": out_sum,
            "InvId": payment.robokassa_invoice_id,
            "SignatureValue": signature,
        },
    )


def test_active_apple_blocks_later_robokassa_callback_idempotently(
    client, db, robokassa_stub
):
    user, plan = _seed_master_and_plan(db)
    user_id = user.id
    user_phone = user.phone
    plan_id = plan.id
    headers = _login(client, user_phone)
    payment = _init_robokassa_payment(client, db, plan_id, headers)
    payment_id = payment.id
    apple = _create_active_apple(db, user_id, plan_id)
    apple_id = apple.id

    first = _send_result_callback(client, payment)
    assert first.status_code == 200
    assert f"OK{payment.robokassa_invoice_id}" in first.text
    db.expire_all()

    stored_payment = db.query(Payment).filter(Payment.id == payment_id).one()
    stored_apple = db.query(Subscription).filter(Subscription.id == apple_id).one()
    assert stored_payment.status == "paid"
    assert stored_payment.subscription_apply_status == "pending"
    assert stored_payment.subscription_id is None
    assert stored_payment.error_message == "provider_conflict_active_apple"
    assert stored_payment.payment_metadata["subscription_deposit_applied"] is True
    assert stored_payment.payment_metadata["provider_conflict"] == {
        "code": "provider_conflict_active_apple",
        "current_provider": "apple",
        "incoming_provider": "robokassa",
        "blocking_subscription_id": apple_id,
    }
    assert stored_apple.status == SubscriptionStatus.ACTIVE
    assert stored_apple.is_active is True
    assert db.query(Subscription).filter(Subscription.user_id == user_id).count() == 1

    deposit_count = (
        db.query(BalanceTransaction)
        .filter(
            BalanceTransaction.user_id == user_id,
            BalanceTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .count()
    )
    balance = db.query(UserBalance).filter(UserBalance.user_id == user_id).one()
    balance_after_first = balance.balance

    repeated = _send_result_callback(client, stored_payment)
    assert repeated.status_code == 200
    assert f"OK{stored_payment.robokassa_invoice_id}" in repeated.text
    db.expire_all()
    repeated_payment = db.query(Payment).filter(Payment.id == payment_id).one()
    repeated_apple = db.query(Subscription).filter(Subscription.id == apple_id).one()
    assert repeated_payment.status == "paid"
    assert repeated_payment.subscription_apply_status == "pending"
    assert repeated_payment.subscription_id is None
    assert repeated_apple.status == SubscriptionStatus.ACTIVE
    assert repeated_apple.is_active is True
    assert db.query(Subscription).filter(Subscription.user_id == user_id).count() == 1
    assert (
        db.query(BalanceTransaction)
        .filter(
            BalanceTransaction.user_id == user_id,
            BalanceTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .count()
        == deposit_count
    )
    assert (
        db.query(UserBalance).filter(UserBalance.user_id == user_id).one().balance
        == balance_after_first
    )


def test_active_apple_blocks_robokassa_activation_endpoints(client, db, robokassa_stub):
    user, plan = _seed_master_and_plan(db)
    user_id = user.id
    user_phone = user.phone
    plan_id = plan.id
    headers = _login(client, user_phone)
    payment = _init_robokassa_payment(client, db, plan_id, headers)
    payment_id = payment.id
    payment_public_id = payment.public_id
    now = datetime.utcnow()
    robokassa = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.PENDING,
        is_active=False,
        start_date=now,
        end_date=now + timedelta(days=30),
        price=500,
        daily_rate=500 / 30,
        plan_id=plan_id,
        billing_provider="robokassa",
    )
    db.add(robokassa)
    db.flush()
    payment.status = "paid"
    payment.subscription_id = robokassa.id
    payment.subscription_apply_status = "pending"
    db.commit()
    apple = _create_active_apple(db, user_id, plan_id)
    apple_id = apple.id
    robokassa_id = robokassa.id

    payment_activation = client.post(
        f"/api/payments/{payment_public_id}/activate-subscription",
        headers=headers,
    )
    assert payment_activation.status_code == 409
    assert payment_activation.json()["detail"] == "provider_conflict_active_apple"

    subscription_activation = client.put(
        f"/api/subscriptions/{robokassa_id}/activate",
        headers=headers,
    )
    assert subscription_activation.status_code == 409
    assert (
        subscription_activation.json()["detail"]
        == "provider_conflict_active_other_provider"
    )

    db.expire_all()
    stored_apple = db.query(Subscription).filter(Subscription.id == apple_id).one()
    stored_robokassa = (
        db.query(Subscription).filter(Subscription.id == robokassa_id).one()
    )
    stored_payment = db.query(Payment).filter(Payment.id == payment_id).one()
    assert stored_apple.status == SubscriptionStatus.ACTIVE
    assert stored_apple.is_active is True
    assert stored_robokassa.status == SubscriptionStatus.PENDING
    assert stored_robokassa.is_active is False
    assert stored_payment.status == "paid"
    assert stored_payment.subscription_apply_status == "pending"

"""Тесты TTL cleanup брошенных Robokassa subscription payments."""
from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock

from auth import get_password_hash
from models import Master, Payment, SubscriptionPlan, SubscriptionType, User, UserRole
from services.expired_payments_cleanup import (
    PENDING_SUBSCRIPTION_PAYMENT_TTL,
    expire_stale_pending_subscription_payments,
)
from utils.payment_public_id import persist_new_robokassa_payment


def _create_master_user(db, *, phone="+79001119901", email="expire-cleanup@test.com"):
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Expire Cleanup Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    return user


def _create_plan(db):
    plan = SubscriptionPlan(
        name="PremiumExpireCleanup",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1160.0,
        price_3months=1070.0,
        price_6months=950.0,
        price_12months=850.0,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=3,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _auth(client, user):
    resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_payment(
    db,
    user_id,
    plan_id,
    *,
    status="pending",
    payment_type="subscription",
    created_at=None,
    amount=3210.0,
):
    payment = Payment(
        user_id=user_id,
        amount=amount,
        status=status,
        payment_type=payment_type,
        robokassa_invoice_id="tmp",
        plan_id=plan_id if payment_type == "subscription" else None,
        subscription_apply_status="pending",
        paid_at=datetime.utcnow() if status == "paid" else None,
        payment_metadata={"plan_name": "PremiumExpireCleanup"},
    )
    payment = persist_new_robokassa_payment(db, payment)
    if created_at is not None:
        payment.created_at = created_at
    db.commit()
    db.refresh(payment)
    return payment


def test_pending_older_than_ttl_becomes_expired(db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(minutes=1),
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(payment)
    assert result["expired"] == 1
    assert payment.status == "expired"


def test_pending_exactly_at_ttl_boundary_becomes_expired(db):
    user = _create_master_user(db, phone="+79001119902", email="expire-boundary@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL,
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(payment)
    assert result["expired"] == 1
    assert payment.status == "expired"


def test_pending_younger_than_ttl_unchanged(db):
    user = _create_master_user(db, phone="+79001119903", email="expire-young@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL + timedelta(minutes=1),
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(payment)
    assert result["expired"] == 0
    assert payment.status == "pending"


def test_paid_older_than_ttl_unchanged(db):
    user = _create_master_user(db, phone="+79001119904", email="expire-paid@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        status="paid",
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(hours=2),
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(payment)
    assert result["expired"] == 0
    assert payment.status == "paid"


def test_failed_cancelled_expired_unchanged(db):
    user = _create_master_user(db, phone="+79001119905", email="expire-final@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    stale = now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(hours=1)
    failed = _create_payment(db, user.id, plan.id, status="failed", created_at=stale)
    cancelled = _create_payment(db, user.id, plan.id, status="cancelled", created_at=stale)
    already_expired = _create_payment(db, user.id, plan.id, status="expired", created_at=stale)

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(failed)
    db.refresh(cancelled)
    db.refresh(already_expired)
    assert result["expired"] == 0
    assert failed.status == "failed"
    assert cancelled.status == "cancelled"
    assert already_expired.status == "expired"


def test_non_subscription_payment_unchanged(db):
    user = _create_master_user(db, phone="+79001119906", email="expire-deposit@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    deposit = _create_payment(
        db,
        user.id,
        plan.id,
        payment_type="deposit",
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(hours=1),
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(deposit)
    assert result["expired"] == 0
    assert deposit.status == "pending"
    assert deposit.payment_type == "deposit"


def test_second_run_is_idempotent_zero_changes(db):
    user = _create_master_user(db, phone="+79001119907", email="expire-idem@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(minutes=5),
    )

    first = expire_stale_pending_subscription_payments(db, now=now)
    second = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(payment)
    assert first["expired"] == 1
    assert second["expired"] == 0
    assert payment.status == "expired"


def test_multiple_stale_pending_expire_in_one_run(db):
    user = _create_master_user(db, phone="+79001119908", email="expire-multi@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    stale = now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(minutes=10)
    p1 = _create_payment(db, user.id, plan.id, created_at=stale)
    p2 = _create_payment(db, user.id, plan.id, created_at=stale)
    p3 = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - timedelta(minutes=5),
    )

    result = expire_stale_pending_subscription_payments(db, now=now)

    db.refresh(p1)
    db.refresh(p2)
    db.refresh(p3)
    assert result["expired"] == 2
    assert p1.status == "expired"
    assert p2.status == "expired"
    assert p3.status == "pending"


def test_rollback_on_exception():
    now = datetime.utcnow()
    payment_obj = MagicMock()
    payment_obj.status = "pending"

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [payment_obj]
    mock_db.commit.side_effect = RuntimeError("commit failed")

    result = expire_stale_pending_subscription_payments(mock_db, now=now)

    assert "error" in result
    assert result["expired"] == 0
    assert payment_obj.status == "expired"  # мутация до commit
    mock_db.rollback.assert_called_once()
    mock_db.close.assert_not_called()


def test_history_endpoint_returns_expired(client, db):
    user = _create_master_user(db, phone="+79001119910", email="expire-history@test.com")
    plan = _create_plan(db)
    now = datetime.utcnow()
    payment = _create_payment(
        db,
        user.id,
        plan.id,
        created_at=now - PENDING_SUBSCRIPTION_PAYMENT_TTL - timedelta(minutes=2),
    )

    expire_stale_pending_subscription_payments(db, now=now)
    db.refresh(payment)
    assert payment.status == "expired"

    headers = _auth(client, user)
    response = client.get("/api/payments/subscription/history", headers=headers)
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["status"] == "expired"
    assert rows[0]["payment_id"] == payment.id

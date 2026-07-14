"""Тесты истории оплат подписки и расчёта monthly_price."""
from __future__ import annotations

from datetime import datetime, timedelta

from auth import get_password_hash
from models import (
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from utils.payment_public_id import persist_new_robokassa_payment
from utils.subscription_payment_display import (
    build_payment_history_item,
    compute_monthly_price_from_package,
    resolve_subscription_payment_billing,
)


def _create_master_user(db, *, phone="+79001118888", email="history@test.com"):
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="History Master",
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
        name="PremiumHistory",
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


def _create_snapshot(db, user_id, plan_id, *, duration_months=3, total_price=3210.0, final_price=3210.0, points_used=0):
    snapshot = SubscriptionPriceSnapshot(
        user_id=user_id,
        plan_id=plan_id,
        duration_months=duration_months,
        price_1month=1160.0,
        price_3months=1070.0,
        price_6months=950.0,
        price_12months=850.0,
        total_price=total_price,
        monthly_price=1070.0,
        daily_price=107.0,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=final_price,
        price_before_points=total_price,
        subscription_points_used=points_used,
        upgrade_type="immediate",
        expires_at=datetime.utcnow() + timedelta(minutes=20),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def _create_subscription(db, user_id, plan_id, *, price=3210.0, duration_days=90):
    now = datetime.utcnow()
    sub = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days=duration_days),
        price=price,
        daily_rate=36,
        is_active=True,
        auto_renewal=False,
        plan_id=plan_id,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _create_payment(
    db,
    user_id,
    plan_id,
    snapshot,
    subscription,
    *,
    status="paid",
    amount=3210.0,
    apply_status="applied",
):
    payment = Payment(
        user_id=user_id,
        amount=amount,
        status=status,
        payment_type="subscription",
        robokassa_invoice_id="tmp",
        plan_id=plan_id,
        subscription_id=subscription.id,
        subscription_apply_status=apply_status,
        paid_at=datetime.utcnow() if status == "paid" else None,
        payment_metadata={
            "calculation_id": snapshot.id,
            "selected_duration": snapshot.duration_months,
            "plan_name": "PremiumHistory",
            "plan_display_name": "Premium",
        },
    )
    payment = persist_new_robokassa_payment(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


def test_monthly_price_3210_for_3_months_is_1070():
    assert compute_monthly_price_from_package(3210, 3) == 1070.0


def test_monthly_price_3500_for_3_months_is_1166_67_not_rounded_up():
    assert compute_monthly_price_from_package(3500, 3) == 1166.67


def test_resolve_billing_with_points(db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(
        db,
        user.id,
        plan.id,
        total_price=3210.0,
        final_price=2729.0,
        points_used=481,
    )
    subscription = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, subscription, amount=2729.0)

    billing = resolve_subscription_payment_billing(db, payment=payment)

    assert billing["duration_months"] == 3
    assert billing["package_value"] == 3210.0
    assert billing["amount_paid"] == 2729.0
    assert billing["points_used"] == 481
    assert billing["monthly_price"] == 1070.0
    assert billing["is_successful_purchase"] is True


def test_subscription_history_returns_only_current_master(client, db):
    user_a = _create_master_user(db, phone="+79001118881", email="a@test.com")
    user_b = _create_master_user(db, phone="+79001118882", email="b@test.com")
    plan = _create_plan(db)

    for user in (user_a, user_b):
        snapshot = _create_snapshot(db, user.id, plan.id)
        sub = _create_subscription(db, user.id, plan.id)
        _create_payment(db, user.id, plan.id, snapshot, sub)

    headers_a = _auth(client, user_a)
    response = client.get("/api/payments/subscription/history", headers=headers_a)

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["plan_display_name"] == "Premium"
    assert rows[0]["monthly_price"] == 1070
    assert rows[0]["is_successful_purchase"] is True


def test_subscription_history_includes_pending_and_failed_separately(client, db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)

    paid = _create_payment(db, user.id, plan.id, snapshot, sub, status="paid", apply_status="applied")
    paid_public_id = paid.public_id
    pending_snapshot = _create_snapshot(db, user.id, plan.id)
    pending = _create_payment(
        db, user.id, plan.id, pending_snapshot, sub, status="pending", apply_status="pending", amount=1160.0
    )
    pending_public_id = pending.public_id
    failed_snapshot = _create_snapshot(db, user.id, plan.id)
    failed = _create_payment(
        db, user.id, plan.id, failed_snapshot, sub, status="failed", apply_status="failed", amount=1160.0
    )
    failed_public_id = failed.public_id

    headers = _auth(client, user)
    rows = client.get("/api/payments/subscription/history", headers=headers).json()

    assert len(rows) == 3
    successful = [r for r in rows if r["is_successful_purchase"]]
    other = [r for r in rows if not r["is_successful_purchase"]]
    assert len(successful) == 1
    assert successful[0]["public_id"] == paid_public_id
    assert {r["public_id"] for r in other} == {pending_public_id, failed_public_id}
    assert all(r["status"] in ("pending", "failed") for r in other)


def test_my_subscription_includes_monthly_price(client, db):
    user = _create_master_user(db)
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id)
    sub = _create_subscription(db, user.id, plan.id)
    _create_payment(db, user.id, plan.id, snapshot, sub)

    headers = _auth(client, user)
    response = client.get("/api/subscriptions/my", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["monthly_price"] == 1070
    assert data["package_value"] == 3210.0
    assert data["duration_months"] == 3


def test_build_payment_history_item(db):
    user = _create_master_user(db, phone="+79001118883", email="item@test.com")
    plan = _create_plan(db)
    snapshot = _create_snapshot(db, user.id, plan.id, final_price=2729.0, points_used=481)
    sub = _create_subscription(db, user.id, plan.id)
    payment = _create_payment(db, user.id, plan.id, snapshot, sub, amount=2729.0)

    item = build_payment_history_item(db, payment)

    assert item["amount_paid"] == 2729.0
    assert item["points_used"] == 481
    assert item["package_value"] == 3210.0
    assert item["monthly_price"] == 1070

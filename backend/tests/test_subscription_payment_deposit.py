"""DEPOSIT phase1 для subscription payment с subscription points."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    BalanceTransaction,
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPriceSnapshot,
    SubscriptionType,
    TransactionType,
    User,
    UserBalance,
    UserRole,
)
from services.promo_engine import create_subscription_points_credit, get_subscription_points_balance
from utils.balance_utils import compute_subscription_days_remaining
from utils.robokassa import generate_result_signature, get_robokassa_config
from utils.subscription_payment_deposit import resolve_subscription_deposit_amount


def _create_premium_plan(db: Session) -> int:
    plan = SubscriptionPlan(
        name="PremiumDeposit",
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
    return int(plan.id)


def _setup_master(db: Session, *, phone: str, email: str) -> tuple[User, int]:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Deposit Master",
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
    db.refresh(master)
    return user, int(master.id)


def _auth(client, user: User) -> dict:
    resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _deposit_total(db: Session, user_id: int) -> float:
    rows = (
        db.query(BalanceTransaction)
        .filter(
            BalanceTransaction.user_id == user_id,
            BalanceTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .all()
    )
    return sum(float(r.amount or 0) for r in rows)


def _robokassa_result(client, db: Session, payment_id: int) -> None:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment is not None
    cfg = get_robokassa_config()
    sig = generate_result_signature(float(payment.amount), payment.robokassa_invoice_id, cfg["password_2"])
    resp = client.post(
        "/api/payments/robokassa/result",
        data={
            "OutSum": f"{payment.amount:.2f}",
            "InvId": payment.robokassa_invoice_id,
            "SignatureValue": sig,
        },
    )
    assert resp.status_code == 200


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()


def test_resolve_deposit_without_points(client, db: Session, robokassa_stub):
    user, _ = _setup_master(db, phone="+79006661001", email="dep1@test.com")
    plan_id = _create_premium_plan(db)
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan_id, "duration_months": 3, "upgrade_type": "immediate", "subscription_points_to_use": 0},
    ).json()
    assert calc["price_before_points"] == 3210
    assert calc["final_price"] == 3210

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = payment.id

    deposit_amount, points_used, _ = resolve_subscription_deposit_amount(db, payment)
    assert deposit_amount == 3210
    assert points_used == 0

    _robokassa_result(client, db, payment_id)
    db.expire_all()

    assert _deposit_total(db, user.id) == 3210
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    meta = payment.payment_metadata or {}
    assert meta.get("subscription_deposit_amount") == 3210


def test_resolve_deposit_with_partial_points(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79006661002", email="dep2@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        1,
        "test",
    )
    db.commit()
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "upgrade_type": "immediate",
            "subscription_points_to_use": 481,
        },
    ).json()
    assert calc["price_before_points"] == 3210
    assert calc["subscription_points_used"] == 481
    assert calc["final_price"] == 2729

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = payment.id
    user_id = user.id
    assert float(payment.amount) == 2729

    _robokassa_result(client, db, payment_id)
    db.expire_all()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()

    assert _deposit_total(db, user_id) == 3210
    assert payment.payment_metadata.get("subscription_deposit_amount") == 3210
    assert payment.payment_metadata.get("subscription_points_subsidy_rub") == 481

    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    balance = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
    assert float(sub.price) == 3210
    assert int(sub.daily_rate) == 36
    assert int(float(balance.balance) // int(sub.daily_rate)) >= 89
    days = compute_subscription_days_remaining(
        balance_rub=float(balance.balance),
        daily_rate=float(sub.daily_rate),
        start_date=sub.start_date,
        end_date=sub.end_date,
        price=float(sub.price),
    )
    assert days >= 89


def test_duplicate_result_single_deposit_and_debit(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79006661003", email="dep3@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        2,
        "test",
    )
    db.commit()
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "upgrade_type": "immediate",
            "subscription_points_to_use": 481,
        },
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = payment.id
    user_id = user.id

    _robokassa_result(client, db, payment_id)
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    assert _deposit_total(db, user_id) == 3210
    debits = (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
        )
        .all()
    )
    assert len(debits) == 1
    assert debits[0].amount == 481


def test_phase2_failure_keeps_deposit_without_points_debit(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79006661004", email="dep4@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        3,
        "test",
    )
    db.commit()
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "upgrade_type": "immediate",
            "subscription_points_to_use": 481,
        },
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = payment.id
    user_id = user.id

    snapshot = db.query(SubscriptionPriceSnapshot).filter(SubscriptionPriceSnapshot.id == calc["calculation_id"]).first()
    snapshot.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    _robokassa_result(client, db, payment_id)
    db.expire_all()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()

    assert payment.status == "paid"
    assert payment.subscription_apply_status == "failed"
    assert _deposit_total(db, user_id) == 3210
    assert get_subscription_points_balance(db, master_id) == 481
    assert (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
        )
        .count()
        == 0
    )


def test_legacy_payment_without_snapshot_deposits_payment_amount(client, db: Session, robokassa_stub):
    user, _ = _setup_master(db, phone="+79006661005", email="dep5@test.com")
    user_id = user.id
    from utils.payment_public_id import persist_new_robokassa_payment

    payment = Payment(
        user_id=user_id,
        amount=1500.0,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="tmp-pending",
        plan_id=1,
        subscription_apply_status="pending",
        payment_metadata={"upgrade_type": "immediate"},
    )
    payment = persist_new_robokassa_payment(db, payment)
    payment_id = payment.id

    _robokassa_result(client, db, payment_id)
    db.expire_all()

    assert _deposit_total(db, user_id) == 1500.0
    meta = db.query(Payment).filter(Payment.id == payment_id).first().payment_metadata
    assert meta.get("subscription_deposit_amount") == 1500.0


def test_apply_upgrade_free_does_not_create_robokassa_deposit(client, db: Session):
    """Полная оплата points: Robokassa Payment не создаётся; apply-upgrade-free без DEPOSIT."""
    user, master_id = _setup_master(db, phone="+79006661006", email="dep6@test.com")
    plan = SubscriptionPlan(
        name="BasicFree",
        display_name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=400.0,
        price_3months=360.0,
        price_6months=320.0,
        price_12months=280.0,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan_id = plan.id
    create_subscription_points_credit(
        db,
        master_id,
        400,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        4,
        "test",
    )
    db.commit()
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": 1,
            "upgrade_type": "immediate",
            "subscription_points_to_use": 400,
        },
    ).json()
    assert calc["final_price"] == 0

    resp = client.post(
        "/api/subscriptions/apply-upgrade-free",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp.status_code == 200
    assert db.query(Payment).filter(Payment.user_id == user.id).count() == 0
    assert _deposit_total(db, user.id) == 0
    assert db.query(Subscription).filter(Subscription.user_id == user.id).count() == 1
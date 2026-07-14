"""Распределение daily charges: сумма списаний == chargeable_value."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    BalanceTransaction,
    DailySubscriptionCharge,
    DailyChargeStatus,
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionType,
    TransactionType,
    User,
    UserBalance,
    UserRole,
)
from services.promo_engine import create_subscription_points_credit
from utils.balance_utils import get_or_create_user_balance, process_daily_charge
from utils.robokassa import generate_result_signature, get_robokassa_config
from utils.subscription_billing_calc import (
    compute_daily_charge_amount,
    sum_daily_charges,
)


def _create_premium_plan(db: Session) -> int:
    plan = SubscriptionPlan(
        name="PremiumChargeDist",
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
        full_name="Charge Master",
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


def _charge_total(db: Session, subscription_id: int) -> float:
    rows = (
        db.query(DailySubscriptionCharge)
        .filter(
            DailySubscriptionCharge.subscription_id == subscription_id,
            DailySubscriptionCharge.status == DailyChargeStatus.SUCCESS,
        )
        .all()
    )
    return sum(float(r.amount or 0) for r in rows)


def _run_all_period_charges(db: Session, sub: Subscription) -> float:
    start = sub.start_date.date()
    end = sub.end_date.date()
    cur = start
    while cur < end:
        result = process_daily_charge(db, sub.id, cur)
        assert result["success"] is True, result
        cur += timedelta(days=1)
    return _charge_total(db, sub.id)


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()


def test_distribution_invariant_2729_over_90():
    assert sum_daily_charges(2729, 90) == 2729
    amounts = [compute_daily_charge_amount(2729, 90, i) for i in range(90)]
    assert sum(amounts) == 2729
    assert max(amounts) == 31
    assert min(amounts) == 30


def test_distribution_invariant_3210_over_90():
    assert sum_daily_charges(3210, 90) == 3210


def test_partial_points_2729_charges_exactly_chargeable(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79008881001", email="dist2729@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        101,
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
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    assert float(sub.price) == 2729.0
    assert float(payment.payment_metadata.get("subscription_deposit_amount")) == 2729.0

    total_charged = _run_all_period_charges(db, sub)
    assert total_charged == 2729.0

    balance = db.query(UserBalance).filter(UserBalance.user_id == user.id).first()
    assert float(balance.balance) == 0.0


def test_full_cash_3210_charges_exactly_package(client, db: Session, robokassa_stub):
    user, _ = _setup_master(db, phone="+79008881002", email="dist3210@test.com")
    plan_id = _create_premium_plan(db)
    headers = _auth(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan_id, "duration_months": 3, "upgrade_type": "immediate", "subscription_points_to_use": 0},
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
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    assert float(sub.price) == 3210.0

    total_charged = _run_all_period_charges(db, sub)
    assert total_charged == 3210.0


def test_full_points_zero_monetary_charges(client, db: Session):
    user, master_id = _setup_master(db, phone="+79008881003", email="distfree@test.com")
    plan = SubscriptionPlan(
        name="BasicFreeDist",
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
    plan_id = int(plan.id)
    create_subscription_points_credit(
        db,
        master_id,
        400,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        102,
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
    resp = client.post(
        "/api/subscriptions/apply-upgrade-free",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp.status_code == 200
    db.expire_all()

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert float(sub.price) == 0.0
    assert float(sub.daily_rate) == 0.0
    assert sub.is_active is True

    total_charged = _run_all_period_charges(db, sub)
    assert total_charged == 0.0
    assert sub.is_active is True


def test_duplicate_callback_does_not_change_deposit_or_daily_rate(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79008881004", email="distidem@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        103,
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

    _robokassa_result(client, db, payment_id)
    db.expire_all()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    deposit_after_first = float(payment.payment_metadata.get("subscription_deposit_amount"))
    rate_after_first = float(sub.daily_rate)
    sub_id = sub.id

    _robokassa_result(client, db, payment_id)
    db.expire_all()

    deposits = (
        db.query(BalanceTransaction)
        .filter(
            BalanceTransaction.user_id == user.id,
            BalanceTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .all()
    )
    assert sum(float(d.amount or 0) for d in deposits) == 2729.0
    sub = db.query(Subscription).filter(Subscription.id == sub_id).one()
    payment = db.query(Payment).filter(Payment.id == payment_id).one()
    assert float(payment.payment_metadata.get("subscription_deposit_amount")) == deposit_after_first == 2729.0
    assert float(sub.daily_rate) == rate_after_first


def test_last_day_closes_remainder(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79008881005", email="distlast@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        104,
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
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    period_days = duration_months_to_days(3)
    start = sub.start_date.date()
    last_day = start + timedelta(days=period_days - 1)

    charged_before_last = 0.0
    cur = start
    while cur < last_day:
        r = process_daily_charge(db, sub.id, cur)
        assert r["success"]
        charged_before_last += r["charge_amount"]
        cur += timedelta(days=1)

    last_result = process_daily_charge(db, sub.id, last_day)
    assert last_result["success"]
    expected_last = 2729 - charged_before_last
    assert last_result["charge_amount"] == expected_last
    assert charged_before_last + expected_last == 2729


def test_balance_never_negative_after_period(client, db: Session, robokassa_stub):
    user, master_id = _setup_master(db, phone="+79008881006", email="distbal@test.com")
    plan_id = _create_premium_plan(db)
    create_subscription_points_credit(
        db,
        master_id,
        481,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        105,
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
    _robokassa_result(client, db, payment_id)
    db.expire_all()

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    _run_all_period_charges(db, sub)

    balance = get_or_create_user_balance(db, user.id)
    assert float(balance.balance) >= 0.0
    assert float(balance.balance) == 0.0

    extra_day = sub.end_date.date()
    extra = process_daily_charge(db, sub.id, extra_day)
    assert extra["success"] is False

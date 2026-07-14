"""Apply подписки: цепочка того же тарифа и семантика смены плана."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from constants import duration_months_to_days
from models import (
    Master,
    Payment,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from utils.payment_public_id import persist_new_robokassa_payment
from utils.robokassa import compute_result_signature
from utils.subscription_apply_dates import get_latest_subscription_chain_end


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "dedato")
    from settings import reload_settings

    reload_settings()


def _create_master_user(db: Session, *, phone="+79007770001", email="seq@test.com") -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Sequential Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
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
    return user


def _create_plan(
    db: Session,
    *,
    name: str,
    price_1month: float,
    price_3months: float | None = None,
    display_order: int = 2,
) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name=name,
        display_name=name,
        subscription_type=SubscriptionType.MASTER,
        price_1month=price_1month,
        price_3months=price_3months or price_1month,
        price_6months=price_1month,
        price_12months=price_1month,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=display_order,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _auth_headers(client, user: User) -> dict:
    token = client.post(
        "/api/auth/login", json={"phone": user.phone, "password": "testpassword"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _init_and_pay_subscription(
    client,
    db: Session,
    *,
    headers: dict,
    plan_id: int,
    duration_months: int = 1,
    upgrade_type: str = "immediate",
) -> Payment:
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": duration_months,
            "upgrade_type": upgrade_type,
        },
    )
    assert calc.status_code == 200, calc.text
    calc_id = calc.json()["calculation_id"]

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan_id,
            "duration_months": duration_months,
            "payment_period": "month",
            "upgrade_type": upgrade_type,
            "calculation_id": calc_id,
        },
    )
    assert init.status_code == 200, init.text
    body = init.json()
    invoice_id = body["invoice_id"]
    payment = db.query(Payment).filter(Payment.public_id == body["payment"]).first()
    assert payment is not None

    pwd = "p2"
    sig = compute_result_signature(f"{float(payment.amount):.2f}", invoice_id, pwd)
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": f"{float(payment.amount):.2f}", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert resp.status_code == 200
    assert f"OK{invoice_id}" in resp.text
    db.expire_all()
    paid = db.query(Payment).filter(Payment.public_id == body["payment"]).first()
    assert paid is not None
    return paid


def _subscription_for_payment(db: Session, payment_id: int) -> Subscription:
    payment = db.query(Payment).filter(Payment.id == payment_id).one()
    assert payment.subscription_id is not None
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    assert sub is not None
    return sub


def test_premium_repurchase_creates_sequential_period(client, db, robokassa_stub):
    user = _create_master_user(db)
    premium = _create_plan(db, name="PremiumSequential", price_1month=1160.0, price_3months=1070.0)
    headers = _auth_headers(client, user)

    first_payment = _init_and_pay_subscription(client, db, headers=headers, plan_id=premium.id, duration_months=1)
    first_sub_id = _subscription_for_payment(db, first_payment.id).id

    second_payment = _init_and_pay_subscription(client, db, headers=headers, plan_id=premium.id, duration_months=1)
    second_sub_id = _subscription_for_payment(db, second_payment.id).id

    first_sub = db.query(Subscription).filter(Subscription.id == first_sub_id).one()
    second_sub = db.query(Subscription).filter(Subscription.id == second_sub_id).one()
    assert second_sub.start_date == first_sub.end_date


def test_premium_immediate_upgrade_from_active_basic_starts_now(client, db, robokassa_stub):
    user = _create_master_user(db, phone="+79007770004", email="upgrade-now@test.com")
    basic = _create_plan(db, name="BasicSequential", price_1month=500.0, display_order=1)
    premium = _create_plan(db, name="PremiumSequential", price_1month=1160.0, price_3months=1070.0, display_order=2)
    basic_id = basic.id
    premium_id = premium.id
    headers = _auth_headers(client, user)

    basic_payment = _init_and_pay_subscription(
        client, db, headers=headers, plan_id=basic_id, duration_months=1
    )
    basic_sub_id = _subscription_for_payment(db, basic_payment.id).id

    before_premium = datetime.utcnow()
    premium_payment = _init_and_pay_subscription(
        client, db, headers=headers, plan_id=premium_id, duration_months=1
    )
    premium_sub_id = _subscription_for_payment(db, premium_payment.id).id
    premium_sub = db.query(Subscription).filter(Subscription.id == premium_sub_id).one()
    basic_sub = db.query(Subscription).filter(Subscription.id == basic_sub_id).one()

    assert premium_sub.plan_id == premium_id
    assert basic_sub.plan_id == basic_id
    assert premium_sub.start_date >= basic_sub.start_date
    assert premium_sub.start_date <= before_premium + timedelta(minutes=2)
    assert premium_sub.start_date != basic_sub.end_date


def test_downgrade_after_expiry_starts_at_current_end_date(client, db, robokassa_stub):
    user = _create_master_user(db, phone="+79007770005", email="downgrade@test.com")
    premium = _create_plan(db, name="PremiumDown", price_1month=1160.0, price_3months=1070.0, display_order=2)
    basic = _create_plan(db, name="BasicDown", price_1month=500.0, display_order=1)
    premium_id = premium.id
    basic_id = basic.id
    headers = _auth_headers(client, user)

    premium_payment = _init_and_pay_subscription(
        client, db, headers=headers, plan_id=premium_id, duration_months=1
    )
    premium_sub_id = _subscription_for_payment(db, premium_payment.id).id
    premium_sub = db.query(Subscription).filter(Subscription.id == premium_sub_id).one()
    premium_end = premium_sub.end_date

    basic_payment = _init_and_pay_subscription(
        client,
        db,
        headers=headers,
        plan_id=basic_id,
        duration_months=1,
        upgrade_type="after_expiry",
    )
    basic_sub = db.query(Subscription).filter(
        Subscription.id == _subscription_for_payment(db, basic_payment.id).id
    ).one()

    assert basic_sub.start_date == premium_end
    assert basic_sub.status == SubscriptionStatus.PENDING


def test_cancelled_legacy_subscription_does_not_affect_chain_end(db):
    user = _create_master_user(db, phone="+79007770006", email="cancelled@test.com")
    premium = _create_plan(db, name="PremiumCancel", price_1month=1160.0)
    now = datetime.utcnow()

    applied_sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days=30),
        price=1160.0,
        daily_rate=39,
        is_active=True,
        plan_id=premium.id,
    )
    db.add(applied_sub)
    db.flush()

    applied_payment = Payment(
        user_id=user.id,
        amount=1160.0,
        status="paid",
        payment_type="subscription",
        robokassa_invoice_id="applied-1",
        plan_id=premium.id,
        subscription_id=applied_sub.id,
        subscription_apply_status="applied",
        paid_at=now,
    )
    applied_payment = persist_new_robokassa_payment(db, applied_payment)

    cancelled_sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.CANCELLED,
        start_date=now,
        end_date=now + timedelta(days=365),
        price=1160.0,
        daily_rate=39,
        is_active=False,
        plan_id=premium.id,
    )
    db.add(cancelled_sub)
    db.flush()

    orphan_payment = Payment(
        user_id=user.id,
        amount=1160.0,
        status="failed",
        payment_type="subscription",
        robokassa_invoice_id="failed-1",
        plan_id=premium.id,
        subscription_id=cancelled_sub.id,
        subscription_apply_status="failed",
    )
    orphan_payment = persist_new_robokassa_payment(db, orphan_payment)
    db.commit()

    chain_end = get_latest_subscription_chain_end(
        db,
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        plan_id=premium.id,
    )

    assert chain_end == applied_sub.end_date
    assert chain_end != cancelled_sub.end_date
    assert applied_payment.subscription_id == applied_sub.id


def test_repeat_result_callback_is_idempotent(client, db, robokassa_stub):
    user = _create_master_user(db, phone="+79007770003", email="idem@test.com")
    plan = _create_plan(db, name="PremiumIdem", price_1month=1160.0)
    headers = _auth_headers(client, user)

    payment = _init_and_pay_subscription(client, db, headers=headers, plan_id=plan.id, duration_months=1)
    payment_id = payment.id
    sub_before_id = _subscription_for_payment(db, payment_id).id
    sub_before = db.query(Subscription).filter(Subscription.id == sub_before_id).one()
    start_before = sub_before.start_date
    end_before = sub_before.end_date
    sub_count_before = db.query(Subscription).filter(Subscription.user_id == user.id).count()

    payment = db.query(Payment).filter(Payment.id == payment_id).one()
    invoice_id = payment.robokassa_invoice_id
    pwd = "p2"
    sig = compute_result_signature(f"{float(payment.amount):.2f}", invoice_id, pwd)
    payload = {"OutSum": f"{float(payment.amount):.2f}", "InvId": invoice_id, "SignatureValue": sig}

    for _ in range(2):
        resp = client.post("/api/payments/robokassa/result", data=payload)
        assert resp.status_code == 200
        assert f"OK{invoice_id}" in resp.text

    db.expire_all()
    payment_after = db.query(Payment).filter(Payment.id == payment_id).first()
    sub_after = db.query(Subscription).filter(Subscription.id == sub_before_id).one()
    sub_count_after = db.query(Subscription).filter(Subscription.user_id == user.id).count()

    assert sub_count_after == sub_count_before == 1
    assert payment_after.subscription_id == sub_before_id
    assert sub_after.start_date == start_before
    assert sub_after.end_date == end_before


def test_three_month_repurchase_after_same_plan_chains_from_end(client, db, robokassa_stub):
    user = _create_master_user(db, phone="+79007770002", email="seq3m@test.com")
    plan = _create_plan(db, name="Premium3M", price_1month=1160.0, price_3months=1070.0)
    headers = _auth_headers(client, user)

    first_payment = _init_and_pay_subscription(client, db, headers=headers, plan_id=plan.id, duration_months=1)
    first_sub_id = _subscription_for_payment(db, first_payment.id).id

    second_payment = _init_and_pay_subscription(client, db, headers=headers, plan_id=plan.id, duration_months=3)
    second_sub_id = _subscription_for_payment(db, second_payment.id).id

    first_sub = db.query(Subscription).filter(Subscription.id == first_sub_id).one()
    second_sub = db.query(Subscription).filter(Subscription.id == second_sub_id).one()
    assert second_sub.start_date == first_sub.end_date
    assert (second_sub.end_date - second_sub.start_date).days == duration_months_to_days(3)

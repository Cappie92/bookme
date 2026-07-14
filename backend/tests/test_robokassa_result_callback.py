"""ResultURL callback: подпись по исходной OutSum и Decimal-сравнение суммы."""
from __future__ import annotations

import hashlib

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import Master, Payment, Subscription, SubscriptionPlan, SubscriptionType, User, UserRole
from utils.robokassa import (
    compute_result_signature,
    parse_robokassa_result_callback,
    payment_amount_matches_out_sum,
    verify_result_notification,
)
from utils.payment_public_id import persist_new_robokassa_payment


@pytest.fixture
def robokassa_stub(monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "dedato")
    from settings import reload_settings

    reload_settings()


def _create_master_user(db: Session) -> User:
    user = User(
        email="resultcb@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79006662001",
        full_name="Result CB Master",
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


def _create_plan(db: Session) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name="PremiumResultCB",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1160.0,
        price_3months=1070.0,
        price_6months=950.0,
        price_12months=850.0,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=2,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _pending_payment(db: Session, user: User, amount: float = 1160.0) -> Payment:
    payment = Payment(
        user_id=user.id,
        amount=amount,
        status="pending",
        payment_type="subscription",
        robokassa_invoice_id="tmp-pending",
        plan_id=1,
        subscription_apply_status="pending",
    )
    return persist_new_robokassa_payment(db, payment)


def test_compute_result_signature_uses_raw_out_sum():
    pwd = "secret_p2"
    assert compute_result_signature("1160", "15", pwd) == hashlib.md5(
        f"1160:15:{pwd}".encode("utf-8")
    ).hexdigest()
    assert compute_result_signature("1160.00", "15", pwd) != compute_result_signature(
        "1160", "15", pwd
    )


def test_verify_result_notification_case_insensitive():
    pwd = "p2"
    sig = compute_result_signature("1160", "8", pwd)
    assert verify_result_notification("1160", "8", sig.upper(), pwd)


def test_parse_robokassa_result_callback_fallback_fields():
    fields = parse_robokassa_result_callback(
        {"out_summ": "1160", "inv_id": "15", "crc": "abc123"}
    )
    assert fields == {"out_sum_raw": "1160", "inv_id_raw": "15", "signature": "abc123"}


def test_payment_amount_matches_out_sum_decimal():
    assert payment_amount_matches_out_sum(1160.0, "1160") is True
    assert payment_amount_matches_out_sum(1160.0, "1160.00") is True
    assert payment_amount_matches_out_sum(1160.0, "1161") is False


def test_result_callback_outsum_1160_integer(client, db: Session, robokassa_stub):
    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post(
        "/api/auth/login", json={"phone": user.phone, "password": "testpassword"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    )
    assert init.status_code == 200, init.text
    invoice_id = init.json()["invoice_id"]
    public_id = init.json()["payment"]
    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert float(payment.amount) == 1160.0

    pwd = "p2"
    sig = compute_result_signature("1160", invoice_id, pwd)
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": "1160", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert resp.status_code == 200
    assert f"OK{invoice_id}" in resp.text

    db.expire_all()
    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert payment.status == "paid"
    assert payment.paid_at is not None
    assert payment.subscription_apply_status == "applied"
    assert payment.subscription_id is not None
    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    assert sub is not None
    assert sub.is_active is True


def test_result_callback_outsum_1160_00(client, db: Session, robokassa_stub):
    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post(
        "/api/auth/login", json={"phone": user.phone, "password": "testpassword"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    invoice_id = init["invoice_id"]
    pwd = "p2"
    sig = compute_result_signature("1160.00", invoice_id, pwd)
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": "1160.00", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert resp.status_code == 200
    assert f"OK{invoice_id}" in resp.text


def test_result_callback_fallback_field_names(client, db: Session, robokassa_stub):
    user = _create_master_user(db)
    plan = _create_plan(db)
    token = client.post(
        "/api/auth/login", json={"phone": user.phone, "password": "testpassword"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
        },
    ).json()
    invoice_id = init["invoice_id"]
    pwd = "p2"
    sig = compute_result_signature("1160", invoice_id, pwd)
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"out_summ": "1160", "inv_id": invoice_id, "crc": sig},
    )
    assert resp.status_code == 200
    assert f"OK{invoice_id}" in resp.text


def test_result_callback_rejects_wrong_amount(client, db: Session, robokassa_stub):
    user = _create_master_user(db)
    payment = _pending_payment(db, user, 1160.0)
    invoice_id = payment.robokassa_invoice_id
    payment_id = payment.id
    pwd = "p2"
    sig = compute_result_signature("999", invoice_id, pwd)
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": "999", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert "Amount mismatch" in resp.text
    db.expire_all()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment.status == "failed"


def test_result_callback_rejects_invalid_signature(client, db: Session, robokassa_stub):
    user = _create_master_user(db)
    payment = _pending_payment(db, user, 1160.0)
    invoice_id = payment.robokassa_invoice_id
    payment_id = payment.id
    resp = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": "1160", "InvId": invoice_id, "SignatureValue": "deadbeef"},
    )
    assert "Invalid signature" in resp.text
    db.expire_all()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment.status == "pending"

"""Mixed payment: points → balance hold → Robokassa card portion."""
from datetime import datetime, timedelta

import pytest

from auth import get_password_hash
from models import (
    Master,
    Payment,
    SubscriptionPlan,
    SubscriptionType,
    User,
    UserBalance,
    UserRole,
)
from services.expired_payments_cleanup import expire_stale_pending_subscription_payments
from utils.balance_utils import get_user_available_balance, get_user_payment_holds_total
from utils.robokassa import generate_result_signature, get_robokassa_config
from tests.conftest import _login


def _headers(client, user):
    data = _login(client, user.phone)
    return {"Authorization": f"Bearer {data['access_token']}"}


def _master(db, phone="+79005550101", balance=43880.0):
    u = User(
        email=f"{phone}@mix.test",
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name="Mix Master",
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
    db.add(UserBalance(user_id=u.id, balance=balance, currency="RUB"))
    db.commit()
    return u


def _plan(db, price=24.0):
    p = SubscriptionPlan(
        name="MixPlan",
        display_name="Mix",
        subscription_type=SubscriptionType.MASTER,
        price_1month=price,
        price_3months=price,
        price_6months=price,
        price_12months=price,
        features={"service_functions": [1]},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_calculate_full_balance_after_expiry(client, db):
    user = _master(db)
    plan = _plan(db, 24.0)
    headers = _headers(client, user)

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "after_expiry"},
    )
    assert calc.status_code == 200, calc.text
    data = calc.json()
    assert data["balance_portion"] == 24
    assert data["card_portion"] == 0
    assert data["can_pay_from_balance"] is True
    assert data["requires_robokassa"] is False
    assert "картой" not in (data.get("breakdown_text") or "").lower() or "не требуется" in (
        data.get("breakdown_text") or ""
    ).lower()


def test_init_full_balance_returns_no_robokassa(client, db):
    user = _master(db, phone="+79005550102")
    plan = _plan(db, 24.0)
    headers = _headers(client, user)
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "after_expiry"},
    ).json()
    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "after_expiry",
            "calculation_id": calc["calculation_id"],
        },
    )
    assert init.status_code == 200, init.text
    body = init.json()
    assert body["requires_payment"] is False
    assert body["card_portion"] == 0
    assert body["balance_portion"] == 24


def test_apply_balance_after_expiry(client, db):
    user = _master(db, phone="+79005550103", balance=1000)
    plan = _plan(db, 24.0)
    headers = _headers(client, user)
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "after_expiry"},
    ).json()
    resp = client.post(
        "/api/subscriptions/apply-upgrade-balance",
        headers=headers,
        json={"calculation_id": calc["calculation_id"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True


def test_mixed_init_hold_and_card_amount(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user = _master(db, phone="+79005550104", balance=300)
    plan = _plan(db, 1000.0)
    headers = _headers(client, user)
    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
    ).json()
    assert calc["balance_portion"] == 300
    assert calc["card_portion"] == 700

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc["calculation_id"],
            "payment_source": "mobile_app",
        },
    )
    assert init.status_code == 200, init.text
    body = init.json()
    assert body["requires_payment"] is not False
    assert body["card_portion"] == 700
    assert body["balance_portion"] == 300

    payment = db.query(Payment).filter(Payment.public_id == body["payment"]).first()
    assert payment.amount == 700
    meta = payment.payment_metadata or {}
    assert meta.get("scheme_version") == 2
    assert meta.get("balance_hold_active") is True
    assert get_user_payment_holds_total(db, user.id) == 300
    assert get_user_available_balance(db, user.id, do_commit=False) == pytest.approx(0.0)

    # Parallel: second calculate must not reuse held 300
    calc2 = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
    ).json()
    assert calc2["balance_portion"] == 0
    assert calc2["card_portion"] == 1000


def test_mixed_expire_releases_hold(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user = _master(db, phone="+79005550105", balance=300)
    plan = _plan(db, 1000.0)
    headers = _headers(client, user)
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
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment.created_at = datetime.utcnow() - timedelta(minutes=31)
    db.commit()

    result = expire_stale_pending_subscription_payments(db)
    assert result["expired"] >= 1
    db.refresh(payment)
    assert payment.status == "expired"
    assert get_user_payment_holds_total(db, user.id) == 0
    assert get_user_available_balance(db, user.id, do_commit=False) == pytest.approx(300.0)


def test_admin_retry_apply_v2_finalizes_hold(client, db, monkeypatch):
    """paid + apply failed → admin retry must accept card_portion and finalize hold."""
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()

    user = _master(db, phone="+79005550107", balance=300)
    plan = _plan(db, 1000.0)
    headers = _headers(client, user)
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
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    payment_id = payment.id
    # Simulate paid + deposit without apply (hold still active)
    from utils.balance_utils import add_balance_transaction_no_commit, get_or_create_user_balance
    from models import TransactionType
    from sqlalchemy.orm.attributes import flag_modified

    payment.status = "paid"
    payment.subscription_apply_status = "failed"
    payment.error_message = "simulated apply fail"
    meta = dict(payment.payment_metadata or {})
    meta["subscription_deposit_applied"] = True
    meta["subscription_deposit_amount"] = 700.0
    payment.payment_metadata = meta
    flag_modified(payment, "payment_metadata")
    get_or_create_user_balance(db, user.id, do_commit=False)
    add_balance_transaction_no_commit(
        db,
        user_id=user.id,
        amount=700.0,
        transaction_type=TransactionType.DEPOSIT,
        description="test deposit card",
    )
    db.commit()

    # Admin auth: reuse require_admin — mark user admin for retry endpoint
    from models import UserRole

    user.role = UserRole.ADMIN
    db.commit()

    admin_headers = _headers(client, user)
    retry = client.post(
        f"/api/admin/payments/{payment_id}/retry-subscription-apply",
        headers=admin_headers,
    )
    assert retry.status_code == 200, retry.text
    body = retry.json()
    assert body["success"] is True
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    assert payment.subscription_apply_status == "applied"
    meta = payment.payment_metadata or {}
    assert meta.get("balance_hold_finalized") is True
    assert get_user_payment_holds_total(db, user.id) == 0


def test_mixed_robokassa_success_finalizes(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()

    user = _master(db, phone="+79005550106", balance=300)
    plan = _plan(db, 1000.0)
    headers = _headers(client, user)
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
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    invoice_id = init["invoice_id"]
    cfg = get_robokassa_config()
    sig = generate_result_signature(float(payment.amount), invoice_id, cfg["password_2"])
    result = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": f"{payment.amount:.2f}", "InvId": invoice_id, "SignatureValue": sig},
    )
    body = result.text.strip().strip('"')
    assert body.startswith("OK"), result.text
    payment = db.query(Payment).filter(Payment.public_id == init["payment"]).first()
    assert payment is not None
    assert payment.status == "paid"
    assert payment.subscription_apply_status == "applied"
    meta = payment.payment_metadata or {}
    assert meta.get("balance_hold_finalized") is True
    assert meta.get("subscription_deposit_applied") is True
    assert float(meta.get("subscription_deposit_amount") or 0) == pytest.approx(700.0)
    assert get_user_payment_holds_total(db, user.id) == 0

    # Duplicate callback idempotent
    result2 = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": f"{payment.amount:.2f}", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert result2.text.strip().strip('"').startswith("OK")

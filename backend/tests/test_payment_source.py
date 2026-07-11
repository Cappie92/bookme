"""Тесты payment_source для return flow после оплаты."""
import re

from models import Payment


def _create_master_with_plan(db):
    from auth import get_password_hash
    from models import Master, SubscriptionPlan, SubscriptionType, User, UserRole

    user = User(
        email="paysource@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001118888",
        full_name="Pay Source Master",
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

    plan = SubscriptionPlan(
        name="Basic Source",
        display_name="Basic Source",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=350,
        features={"service_functions": [1, 2, 3], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return user, plan


def _auth_headers(client, user):
    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    token = token_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _init_payload(plan_id):
    return {
        "plan_id": plan_id,
        "duration_months": 1,
        "payment_period": "1month",
    }


def test_subscription_init_without_source_defaults_to_web(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user, plan = _create_master_with_plan(db)
    headers = _auth_headers(client, user)

    init = client.post(
        "/api/payments/subscription/init",
        json=_init_payload(plan.id),
        headers=headers,
    )
    assert init.status_code == 200, init.text
    public_id = init.json()["payment"]

    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert payment.payment_source == "web"

    public = client.get(f"/api/payments/public-status?payment={public_id}")
    assert public.status_code == 200
    assert public.json()["payment_source"] == "web"


def test_subscription_init_web_source(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user, plan = _create_master_with_plan(db)
    headers = _auth_headers(client, user)

    init = client.post(
        "/api/payments/subscription/init",
        json={**_init_payload(plan.id), "payment_source": "web"},
        headers=headers,
    )
    assert init.status_code == 200, init.text
    public_id = init.json()["payment"]

    public = client.get(f"/api/payments/public-status?payment={public_id}")
    assert public.json()["payment_source"] == "web"


def test_subscription_init_mobile_app_source(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user, plan = _create_master_with_plan(db)
    headers = _auth_headers(client, user)

    init = client.post(
        "/api/payments/subscription/init",
        json={**_init_payload(plan.id), "payment_source": "mobile_app"},
        headers=headers,
    )
    assert init.status_code == 200, init.text
    public_id = init.json()["payment"]

    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    assert payment.payment_source == "mobile_app"

    public = client.get(f"/api/payments/public-status?payment={public_id}")
    assert public.status_code == 200
    data = public.json()
    assert data["payment_source"] == "mobile_app"
    assert "id" not in data
    assert "user_id" not in data
    assert "amount" not in data


def test_subscription_init_invalid_source_returns_422(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    user, plan = _create_master_with_plan(db)
    headers = _auth_headers(client, user)

    init = client.post(
        "/api/payments/subscription/init",
        json={**_init_payload(plan.id), "payment_source": "desktop"},
        headers=headers,
    )
    assert init.status_code == 422


def test_public_status_includes_only_safe_fields_with_payment_source(client, db):
    user, _plan = _create_master_with_plan(db)
    payment = Payment(
        user_id=user.id,
        amount=500.0,
        status="paid",
        payment_type="subscription",
        robokassa_invoice_id="source-safe-fields",
        subscription_apply_status="applied",
        payment_source="mobile_app",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    response = client.get(f"/api/payments/public-status?payment={payment.public_id}")
    data = response.json()

    assert set(data.keys()) == {"status", "subscription_apply_status", "payment_source"}
    forbidden = {
        "id",
        "public_id",
        "user_id",
        "subscription_id",
        "amount",
        "phone",
        "email",
        "invoice_id",
        "robokassa_invoice_id",
    }
    assert forbidden.isdisjoint(data.keys())
    assert re.fullmatch(r"[\w\-]+", payment.public_id)

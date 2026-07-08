"""Тесты Robokassa stub-режима."""
import pytest


def test_get_robokassa_config_rejects_test_mode_without_test_passwords_or_opt_in(monkeypatch):
    """При IS_TEST=true и пустых тестовых паролях не подставляем боевые без явного opt-in."""
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "")
    monkeypatch.setenv("ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST", "false")
    from settings import reload_settings

    reload_settings()
    from utils.robokassa import get_robokassa_config

    with pytest.raises(ValueError, match="ROBOKASSA_TEST_PASSWORD"):
        get_robokassa_config()


def test_get_robokassa_config_rejects_production_mode_with_test_flag_and_empty_test_passwords(monkeypatch):
    """IS_TEST=true и пустые тестовые пароли: не-stub (production) — явный ValueError, без fallback на prod."""
    monkeypatch.setenv("ROBOKASSA_MODE", "production")
    monkeypatch.setenv("ROBOKASSA_IS_TEST", "true")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_1", "")
    monkeypatch.setenv("ROBOKASSA_TEST_PASSWORD_2", "")
    monkeypatch.setenv("ROBOKASSA_ALLOW_INSECURE_PROD_PASSWORDS_IN_TEST", "false")
    from settings import reload_settings

    reload_settings()
    from utils.robokassa import get_robokassa_config

    with pytest.raises(ValueError, match="ROBOKASSA_IS_TEST=true: задайте ROBOKASSA_TEST_PASSWORD"):
        get_robokassa_config()


def test_init_returns_stub_url_when_stub_mode(client, db, monkeypatch):
    """При ROBOKASSA_MODE=stub init возвращает stub payment_url."""
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    from settings import reload_settings

    reload_settings()

    from auth import get_password_hash
    from models import Master, User, UserRole, SubscriptionPlan, SubscriptionType

    user = User(
        email="paymaster@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001119999",
        full_name="Pay Master",
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
        name="Basic",
        display_name="Basic",
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

    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert token_resp.status_code == 200
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/api/payments/subscription/init",
        json={"plan_id": plan.id, "duration_months": 1, "payment_period": "1month"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "payment_url" in data
    url = data["payment_url"]
    assert "stub-complete" in url
    assert data.get("payment")
    assert data.get("invoice_id")


def test_robokassa_result_marks_paid_and_applies_subscription(client, db, monkeypatch):
    """Регрессия: phase1 не должна падать из-за nested db.begin() на уже начатой сессии."""
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    from settings import reload_settings

    reload_settings()

    from auth import get_password_hash
    from models import Master, Payment, Subscription, SubscriptionPlan, SubscriptionType, User, UserRole
    from utils.robokassa import generate_result_signature, get_robokassa_config

    user = User(
        email="result@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001118888",
        full_name="Result Master",
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
        name="Premium",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1200,
        price_3months=1070,
        price_6months=950,
        price_12months=850,
        features={"service_functions": [1, 2, 3], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=2,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert token_resp.status_code == 200
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    calc = client.post(
        "/api/subscriptions/calculate",
        headers=headers,
        json={"plan_id": plan.id, "duration_months": 3, "upgrade_type": "immediate"},
    )
    assert calc.status_code == 200
    calc_id = calc.json()["calculation_id"]

    init = client.post(
        "/api/payments/subscription/init",
        headers=headers,
        json={
            "plan_id": plan.id,
            "duration_months": 3,
            "payment_period": "month",
            "upgrade_type": "immediate",
            "calculation_id": calc_id,
            "enable_auto_renewal": False,
        },
    )
    assert init.status_code == 200, init.text
    payment_public_id = init.json()["payment"]
    invoice_id = init.json()["invoice_id"]

    payment = db.query(Payment).filter(Payment.public_id == payment_public_id).first()
    assert payment.status == "pending"

    cfg = get_robokassa_config()
    sig = generate_result_signature(float(payment.amount), invoice_id, cfg["password_2"])
    result = client.post(
        "/api/payments/robokassa/result",
        data={"OutSum": f"{payment.amount:.2f}", "InvId": invoice_id, "SignatureValue": sig},
    )
    assert result.status_code == 200
    assert f"OK{invoice_id}" in result.text

    db.expire_all()
    payment = db.query(Payment).filter(Payment.public_id == payment_public_id).first()
    assert payment.status == "paid"
    assert payment.subscription_apply_status == "applied"
    assert payment.subscription_id is not None

    sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
    assert sub is not None
    assert sub.is_active is True


def _setup_stub_payment_user(client, db):
    from auth import get_password_hash
    from models import Master, SubscriptionPlan, SubscriptionType, User, UserRole

    user = User(
        email="stubcomplete@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001117777",
        full_name="Stub Complete Master",
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
        name="Basic",
        display_name="Basic",
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

    token_resp = client.post("/api/auth/login", json={"phone": user.phone, "password": "testpassword"})
    assert token_resp.status_code == 200
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    init = client.post(
        "/api/payments/subscription/init",
        json={"plan_id": plan.id, "duration_months": 1, "payment_period": "1month"},
        headers=headers,
    )
    assert init.status_code == 200, init.text
    return init.json()


def test_stub_complete_redirects_success_when_result_ok(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "http://localhost:5173/payment/success")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "http://localhost:5173/payment/fail")
    from settings import reload_settings

    reload_settings()

    init = _setup_stub_payment_user(client, db)
    invoice_id = init["invoice_id"]
    payment_public_id = init["payment"]

    class FakeResponse:
        def __init__(self, body):
            self.text = body

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse(f"OK{invoice_id}")

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    response = client.get(
        f"/api/payments/robokassa/stub-complete?invoice_id={invoice_id}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == f"http://localhost:5173/payment/success?payment={payment_public_id}"


def test_stub_complete_redirects_fail_when_result_not_ok(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_1", "p1")
    monkeypatch.setenv("ROBOKASSA_PASSWORD_2", "p2")
    monkeypatch.setenv("ROBOKASSA_MERCHANT_LOGIN", "test")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "http://localhost:5173/payment/success")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "http://localhost:5173/payment/fail")
    from settings import reload_settings

    reload_settings()

    init = _setup_stub_payment_user(client, db)
    invoice_id = init["invoice_id"]
    payment_public_id = init["payment"]

    class FakeResponse:
        text = "ERROR: Failed to mark payment as paid"

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    response = client.get(
        f"/api/payments/robokassa/stub-complete?invoice_id={invoice_id}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == f"http://localhost:5173/payment/fail?payment={payment_public_id}"


def test_stub_complete_accepts_json_quoted_ok_body(client, db, monkeypatch):
    monkeypatch.setenv("ROBOKASSA_MODE", "stub")
    monkeypatch.setenv("ROBOKASSA_SUCCESS_URL", "http://localhost:5173/payment/success")
    monkeypatch.setenv("ROBOKASSA_FAIL_URL", "http://localhost:5173/payment/fail")
    from settings import reload_settings

    reload_settings()

    init = _setup_stub_payment_user(client, db)
    invoice_id = init["invoice_id"]
    payment_public_id = init["payment"]

    class FakeResponse:
        def __init__(self, body):
            self.text = body

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse(f'"OK{invoice_id}"')

    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    response = client.get(
        f"/api/payments/robokassa/stub-complete?invoice_id={invoice_id}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == f"http://localhost:5173/payment/success?payment={payment_public_id}"

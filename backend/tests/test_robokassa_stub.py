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
    assert data.get("payment_id")
    assert data.get("invoice_id")

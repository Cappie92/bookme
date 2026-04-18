"""MVP: POST /balance/deposit и POST /payments/deposit/init возвращают 410."""
import pytest


def test_balance_deposit_returns_410(client, master_auth_headers):
    r = client.post(
        "/api/balance/deposit",
        json={"amount": 100.0, "payment_method": "card"},
        headers=master_auth_headers,
    )
    assert r.status_code == 410
    assert "подписк" in (r.json().get("detail") or "").lower()


def test_payments_deposit_init_returns_410(client, master_auth_headers):
    r = client.post(
        "/api/payments/deposit/init",
        json={"amount": 100.0, "description": "test"},
        headers=master_auth_headers,
    )
    assert r.status_code == 410
    assert "подписк" in (r.json().get("detail") or "").lower()

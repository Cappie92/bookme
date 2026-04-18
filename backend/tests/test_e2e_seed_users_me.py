"""Smoke: после E2E seed — логин и GET /api/auth/users/me возвращают 200 и валидный email.

Запуск с реальной БД (миграции применены):
  cd backend && DEV_E2E=1 python3 -m pytest tests/test_e2e_seed_users_me.py -v

Ручной smoke (после e2e_full.sh или при поднятом backend):
  curl -X POST http://localhost:8000/api/dev/e2e/seed
  curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"phone":"+79991111111","password":"e2e123"}'
  # Использовать access_token из ответа:
  curl -H "Authorization: Bearer <token>" http://localhost:8000/api/auth/users/me
  # Ожидание: 200, email содержит @example.com
"""
import pytest


def test_e2e_seed_login_users_me(client, db):
    """Seed -> login Master A -> GET /api/auth/users/me -> 200, email @example.com."""
    r = client.post("/api/dev/e2e/seed")
    if r.status_code in (404, 405):
        pytest.skip("DEV_E2E router not mounted or method not allowed. Set DEV_E2E=1 to run this test.")
    if r.status_code == 500 and "Subscription plans" in (r.json().get("detail") or ""):
        pytest.skip("Требуются subscription plans (миграции). Запустите с bookme.db.")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True

    master_a = data["master_a"]
    token_r = client.post(
        "/api/auth/login",
        json={"phone": master_a["phone"], "password": master_a["password"]},
    )
    assert token_r.status_code == 200, token_r.text
    token = token_r.json()["access_token"]

    # users/me
    me_r = client.get(
        "/api/auth/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_r.status_code == 200, me_r.text
    me = me_r.json()
    assert me.get("email")
    assert "@example.com" in me["email"], f"Email должен быть @example.com: {me['email']}"

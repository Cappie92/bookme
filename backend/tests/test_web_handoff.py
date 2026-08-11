"""Tests for iOS/Android → web handoff (opaque code → JWT with web_session_origin)."""
from datetime import datetime, timedelta

from fastapi import status
from jose import jwt

from auth import ALGORITHM, SECRET_KEY
from models import User, UserRole
from routers import auth as auth_router


def _auth_headers(token_payload: dict) -> dict:
    return {"Authorization": f"Bearer {token_payload['access_token']}"}


def test_create_web_handoff_requires_auth(client):
    response = client.post("/api/auth/web-handoff", json={"origin": "ios_app"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_create_web_handoff_success(client, test_user, test_user_token, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type(
            "S",
            (),
            {
                "FRONTEND_URL": "https://dedato.ru",
                "is_production": False,
            },
        )(),
    )
    response = client.post(
        "/api/auth/web-handoff",
        json={"origin": "ios_app"},
        headers=_auth_headers(test_user_token),
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["expires_in"] == 60
    assert data["code"]
    assert "access_token" not in data["url"]
    assert data["url"].startswith("https://dedato.ru/auth/mobile-handoff?code=")
    assert data["code"] in data["url"]


def test_exchange_web_handoff_success_and_single_use(client, db, test_user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(test_user.id, "ios_app")

    first = client.post("/api/auth/web-handoff/exchange", json={"code": code})
    second = client.post("/api/auth/web-handoff/exchange", json={"code": code})

    assert first.status_code == 200, first.text
    data = first.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["redirect_to"] == "/pricing"
    assert data["web_session_origin"] == "ios_app"
    assert data["user"]["id"] == test_user.id

    access_payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert access_payload["web_session_origin"] == "ios_app"
    refresh_payload = jwt.decode(data["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert refresh_payload["web_session_origin"] == "ios_app"

    assert second.status_code == status.HTTP_400_BAD_REQUEST


def test_exchange_invalid_and_expired_code(client, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    invalid = client.post("/api/auth/web-handoff/exchange", json={"code": "missing"})
    assert invalid.status_code == status.HTTP_400_BAD_REQUEST

    expired = "expired-handoff-code"
    auth_router._web_handoff_memory_store[expired] = {
        "user_id": 1,
        "origin": "ios_app",
        "purpose": "web_handoff",
        "exp": 1,
    }
    expired_resp = client.post("/api/auth/web-handoff/exchange", json={"code": expired})
    assert expired_resp.status_code == status.HTTP_400_BAD_REQUEST


def test_android_handoff_does_not_set_web_session_origin(client, db, test_user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(test_user.id, "android_app")
    response = client.post("/api/auth/web-handoff/exchange", json={"code": code})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["web_session_origin"] is None
    access_payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert "web_session_origin" not in access_payload


def test_refresh_preserves_web_session_origin(client, db, test_user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(test_user.id, "ios_app")
    exchanged = client.post("/api/auth/web-handoff/exchange", json={"code": code}).json()
    refreshed = client.post(
        "/api/auth/refresh",
        json={"refresh_token": exchanged["refresh_token"]},
    )
    assert refreshed.status_code == 200, refreshed.text
    data = refreshed.json()
    access_payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    refresh_payload = jwt.decode(data["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert access_payload["web_session_origin"] == "ios_app"
    assert refresh_payload["web_session_origin"] == "ios_app"


def test_users_me_exposes_web_session_origin(client, db, test_user, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(test_user.id, "ios_app")
    tokens = client.post("/api/auth/web-handoff/exchange", json={"code": code}).json()
    me = client.get("/api/auth/users/me", headers=_auth_headers(tokens))
    assert me.status_code == 200, me.text
    assert me.json()["web_session_origin"] == "ios_app"

    # Ordinary login does not set the claim
    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200
    me_normal = client.get("/api/auth/users/me", headers=_auth_headers(login.json()))
    assert me_normal.status_code == 200
    assert me_normal.json().get("web_session_origin") in (None, "")


def test_subscription_init_forbidden_for_ios_app_session(client, test_master, test_master_token, monkeypatch):
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: type("S", (), {"FRONTEND_URL": "https://dedato.ru", "is_production": False})(),
    )
    code = auth_router._store_web_handoff(test_master.id, "ios_app")
    tokens = client.post("/api/auth/web-handoff/exchange", json={"code": code}).json()

    blocked = client.post(
        "/api/payments/subscription/init",
        json={
            "plan_id": 1,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
        },
        headers=_auth_headers(tokens),
    )
    assert blocked.status_code == status.HTTP_403_FORBIDDEN
    assert "Robokassa" in blocked.json()["detail"]

    # Normal master token reaches past the ios_app gate (may 400/404 later)
    normal = client.post(
        "/api/payments/subscription/init",
        json={
            "plan_id": 1,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
        },
        headers=_auth_headers(test_master_token),
    )
    assert normal.status_code != status.HTTP_403_FORBIDDEN

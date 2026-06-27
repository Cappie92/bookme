from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from fastapi import status

import routers.auth as auth_router
from auth import get_password_hash
from models import User, UserOAuthAccount, UserRole


def _enabled_settings():
    return SimpleNamespace(
        yandex_auth_enabled=True,
        YANDEX_CLIENT_ID="client-id",
        YANDEX_CLIENT_SECRET="client-secret",
        YANDEX_REDIRECT_URI="http://localhost:8000/api/auth/yandex/callback",
        FRONTEND_URL="http://localhost:5173",
        API_BASE_URL="http://localhost:8000",
        is_production=False,
    )


def _disabled_settings():
    return SimpleNamespace(
        yandex_auth_enabled=False,
        YANDEX_CLIENT_ID="",
        YANDEX_CLIENT_SECRET="",
        YANDEX_REDIRECT_URI="",
        FRONTEND_URL="http://localhost:5173",
        API_BASE_URL="http://localhost:8000",
        is_production=False,
    )


def _callback_ticket(location: str) -> str:
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert "token" not in params
    assert "refresh_token" not in params
    return params["ticket"][0]


def _exchange_ticket(client, ticket: str):
    return client.post("/api/auth/oauth/exchange", json={"ticket": ticket})


def _mock_yandex(monkeypatch, profile):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)
    monkeypatch.setattr(auth_router, "_exchange_yandex_code_for_token", lambda code, redirect_uri, settings: "ya-token")
    monkeypatch.setattr(auth_router, "_fetch_yandex_profile", lambda access_token: profile)


def test_yandex_login_disabled_returns_404(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _disabled_settings)

    response = client.get("/api/auth/yandex/login", follow_redirects=False)

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_yandex_callback_rejects_invalid_state(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get("/api/auth/yandex/callback?code=abc&state=bad-state", follow_redirects=False)

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_yandex_callback_redirects_with_ticket_not_tokens(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-ticket", "default_email": "ticket@example.com", "real_name": "Ticket User"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    ticket = _callback_ticket(response.headers["location"])
    assert ticket


def test_oauth_exchange_valid_ticket_returns_tokens_and_is_one_time(client, db, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)
    user = User(
        email="ticket-once@example.com",
        phone=None,
        full_name="Ticket Once",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    ticket = auth_router._store_oauth_ticket(user.id)

    first = _exchange_ticket(client, ticket)
    second = _exchange_ticket(client, ticket)

    assert first.status_code == 200, first.text
    assert "access_token" in first.json()
    assert "refresh_token" in first.json()
    assert first.json()["user"]["id"] == user.id
    assert second.status_code == status.HTTP_400_BAD_REQUEST


def test_oauth_exchange_invalid_and_expired_ticket_fails(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)
    invalid = _exchange_ticket(client, "missing-ticket")

    expired_ticket = "expired-ticket"
    auth_router._oauth_ticket_memory_store[expired_ticket] = {"user_id": 1, "exp": 1}
    expired = _exchange_ticket(client, expired_ticket)

    assert invalid.status_code == status.HTTP_400_BAD_REQUEST
    assert expired.status_code == status.HTTP_400_BAD_REQUEST


def test_yandex_callback_links_existing_user_by_email(client, db, monkeypatch):
    user = User(
        email="linked@example.com",
        phone="+79005550001",
        full_name="Existing Admin",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _mock_yandex(monkeypatch, {"id": "ya-1", "default_email": "linked@example.com", "real_name": "Yandex Name"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    account = db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-1").one()
    assert account.user_id == user.id
    ticket = _callback_ticket(response.headers["location"])
    exchange = _exchange_ticket(client, ticket)
    assert exchange.status_code == 200
    token = exchange.json()["access_token"]
    me = client.get("/api/auth/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_yandex_callback_creates_new_client_if_email_not_found(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-2", "default_email": "new@example.com", "real_name": "New User"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    _callback_ticket(response.headers["location"])
    user = db.query(User).filter(User.email == "new@example.com").one()
    assert user.role == UserRole.CLIENT
    assert user.full_name == "New User"
    assert user.hashed_password is None
    account = db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-2").one()
    assert account.user_id == user.id


def test_yandex_existing_oauth_account_logs_in_same_user(client, db, monkeypatch):
    user = User(
        email="oauth@example.com",
        phone="+79005550002",
        full_name="OAuth User",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    db.add(UserOAuthAccount(provider="yandex", provider_user_id="ya-3", email="old@example.com", user_id=user.id))
    db.commit()
    _mock_yandex(monkeypatch, {"id": "ya-3", "default_email": "updated@example.com", "real_name": "Other Name"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    ticket = _callback_ticket(response.headers["location"])
    exchange = _exchange_ticket(client, ticket)
    assert exchange.status_code == 200
    token = exchange.json()["access_token"]
    me = client.get("/api/auth/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["id"] == user.id
    assert me.json()["role"] == "master"
    account = db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-3").one()
    assert account.email == "updated@example.com"


def test_yandex_new_user_never_gets_admin_role(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-4", "default_email": "fresh-admin-name@example.com", "real_name": "Admin"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    _callback_ticket(response.headers["location"])
    user = db.query(User).filter(User.email == "fresh-admin-name@example.com").one()
    assert user.role == UserRole.CLIENT

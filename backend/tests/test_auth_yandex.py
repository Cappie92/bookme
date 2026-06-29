from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from fastapi import status

import routers.auth as auth_router
from auth import get_password_hash
from models import User, Master, UserOAuthAccount, UserRole


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


def _callback_onboarding_ticket(location: str) -> str:
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert "token" not in params
    assert "refresh_token" not in params
    assert "onboarding_ticket" in params
    return params["onboarding_ticket"][0]


def _exchange_ticket(client, ticket: str):
    return client.post("/api/auth/oauth/exchange", json={"ticket": ticket})


def _auth_headers(token_data: dict) -> dict:
    return {"Authorization": f"Bearer {token_data['access_token']}"}


def _assert_yandex_authorize_scope(location: str) -> dict:
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert parsed.netloc == "oauth.yandex.ru"
    assert params["scope"][0] == "login:email login:info"
    assert "login:phone" not in params["scope"][0]
    return params


def _mock_yandex(monkeypatch, profile):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)
    monkeypatch.setattr(auth_router, "_exchange_yandex_code_for_token", lambda code, redirect_uri, settings: "ya-token")
    monkeypatch.setattr(auth_router, "_fetch_yandex_profile", lambda access_token: profile)


def test_yandex_login_disabled_returns_404(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _disabled_settings)

    response = client.get("/api/auth/yandex/login", follow_redirects=False)

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_yandex_login_redirect_scope_does_not_request_phone(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get("/api/auth/yandex/login", follow_redirects=False)

    assert response.status_code in (302, 307)
    params = _assert_yandex_authorize_scope(response.headers["location"])
    assert params["client_id"][0] == "client-id"
    assert auth_router._verify_oauth_state(params["state"][0])["mode"] == "login"


def test_yandex_callback_rejects_invalid_state(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get("/api/auth/yandex/callback?code=abc&state=bad-state", follow_redirects=False)

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_yandex_callback_redirects_with_ticket_not_tokens(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-ticket", "default_email": "ticket@example.com", "real_name": "Ticket User"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    ticket = _callback_onboarding_ticket(response.headers["location"])
    assert ticket


def test_yandex_link_start_requires_auth(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get("/api/auth/yandex/link", follow_redirects=False)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_yandex_link_start_uses_signed_link_state_and_relative_return_to(client, test_user_token, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get(
        "/api/auth/yandex/link?return_to=/client/profile",
        headers=_auth_headers(test_user_token),
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    location = response.headers["location"]
    params = _assert_yandex_authorize_scope(location)
    assert params["client_id"][0] == "client-id"
    state_data = auth_router._verify_oauth_state(params["state"][0])
    assert state_data["mode"] == "link"
    assert state_data["return_to"] == "/client/profile"
    assert int(state_data["user_id"]) > 0


def test_yandex_link_start_can_return_json_redirect_url(client, test_user_token, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)

    response = client.get(
        "/api/auth/yandex/link?as_json=true&return_to=/client/profile",
        headers=_auth_headers(test_user_token),
    )

    assert response.status_code == 200
    location = response.json()["redirect_url"]
    params = _assert_yandex_authorize_scope(location)
    assert params["client_id"][0] == "client-id"
    state_data = auth_router._verify_oauth_state(params["state"][0])
    assert state_data["mode"] == "link"
    assert state_data["return_to"] == "/client/profile"


def test_yandex_link_callback_attaches_to_current_user_without_creating_user(client, db, test_user, test_user_token, monkeypatch):
    _mock_yandex(
        monkeypatch,
        {
            "id": "ya-link-1",
            "default_email": "other-yandex@example.com",
            "real_name": "Other Yandex",
            "default_phone": {"number": "+79005550101"},
        },
    )
    state = auth_router._create_oauth_state(mode="link", user_id=test_user.id, return_to="/client/profile")
    before_count = db.query(User).count()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    assert db.query(User).count() == before_count
    account = db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-link-1").one()
    assert account.user_id == test_user.id
    saved_user = db.query(User).filter(User.id == test_user.id).one()
    assert saved_user.email == "test@example.com"
    assert saved_user.phone == "+79001234567"
    assert saved_user.role == UserRole.CLIENT
    ticket = _callback_ticket(response.headers["location"])
    exchange = _exchange_ticket(client, ticket)
    assert exchange.status_code == 200, exchange.text
    data = exchange.json()
    assert data["user"]["id"] == test_user.id
    assert data["oauth"]["purpose"] == "oauth_link"
    assert data["oauth"]["status"] == "linked"
    assert data["oauth"]["return_to"] == "/client/profile"


def test_yandex_link_callback_rejects_yandex_bound_to_other_user(client, db, test_user, test_master, monkeypatch):
    db.add(UserOAuthAccount(provider="yandex", provider_user_id="ya-link-conflict", email="taken@example.com", user_id=test_master.id))
    db.commit()
    _mock_yandex(monkeypatch, {"id": "ya-link-conflict", "default_email": "taken@example.com", "real_name": "Taken"})
    state = auth_router._create_oauth_state(mode="link", user_id=test_user.id, return_to="/client/profile")

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    parsed = urlparse(response.headers["location"])
    params = parse_qs(parsed.query)
    assert params["mode"][0] == "link"
    assert "другому аккаунту" in params["error"][0]
    assert db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-link-conflict").count() == 1


def test_yandex_link_start_already_linked_returns_ticket(client, db, test_user, test_user_token, monkeypatch):
    monkeypatch.setattr(auth_router, "get_settings", _enabled_settings)
    db.add(UserOAuthAccount(provider="yandex", provider_user_id="ya-already", email="already@example.com", user_id=test_user.id))
    db.commit()

    response = client.get(
        "/api/auth/yandex/link?return_to=https://evil.example/path",
        headers=_auth_headers(test_user_token),
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    ticket = _callback_ticket(response.headers["location"])
    exchange = _exchange_ticket(client, ticket)
    assert exchange.status_code == 200
    assert exchange.json()["oauth"]["purpose"] == "oauth_link"
    assert exchange.json()["oauth"]["status"] == "already_linked"
    assert exchange.json()["oauth"]["return_to"] == "/client/profile"


def test_oauth_accounts_lists_current_user_yandex(client, db, test_user, test_user_token):
    db.add(UserOAuthAccount(provider="yandex", provider_user_id="ya-list", email="list@example.com", user_id=test_user.id))
    db.commit()

    response = client.get("/api/auth/oauth/accounts", headers=_auth_headers(test_user_token))

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "provider": "yandex",
            "email": "list@example.com",
            "created_at": response.json()["items"][0]["created_at"],
            "is_linked": True,
        }
    ]


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
    user_id = user.id
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


def test_yandex_callback_new_profile_returns_onboarding_ticket_without_user(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-2", "default_email": "new@example.com", "real_name": "New User"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    onboarding_ticket = _callback_onboarding_ticket(response.headers["location"])
    assert onboarding_ticket
    assert db.query(User).filter(User.email == "new@example.com").first() is None
    assert db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-2").first() is None


def test_yandex_callback_orphan_oauth_account_is_cleaned_and_starts_onboarding(client, db, monkeypatch):
    db.add(UserOAuthAccount(provider="yandex", provider_user_id="ya-orphan", email="orphan-old@example.com", user_id=999999))
    db.commit()
    _mock_yandex(monkeypatch, {"id": "ya-orphan", "default_email": "orphan-new@example.com", "real_name": "Orphan User"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307), response.text
    onboarding_ticket = _callback_onboarding_ticket(response.headers["location"])
    assert onboarding_ticket
    assert db.query(User).filter(User.email == "orphan-new@example.com").first() is None
    assert db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-orphan").first() is None


def test_yandex_oauth_new_profile_without_default_phone_starts_onboarding(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-no-phone", "default_email": "no-phone@example.com", "real_name": "No Phone"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    onboarding_ticket = _callback_onboarding_ticket(response.headers["location"])
    assert onboarding_ticket
    assert db.query(User).filter(User.email == "no-phone@example.com").first() is None


def test_yandex_default_phone_does_not_auto_create_new_user(client, db, monkeypatch):
    _mock_yandex(
        monkeypatch,
        {
            "id": "ya-default-phone",
            "default_email": "default-phone@example.com",
            "real_name": "Default Phone",
            "default_phone": {"number": "8 (900) 555-00-11"},
        },
    )
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    _callback_onboarding_ticket(response.headers["location"])
    assert db.query(User).filter(User.email == "default-phone@example.com").first() is None


def test_yandex_default_phone_does_not_overwrite_existing_phone(client, db, monkeypatch):
    user = User(
        email="existing-phone@example.com",
        phone="+79005550012",
        full_name="Existing Phone",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.commit()
    user_id = user.id
    _mock_yandex(
        monkeypatch,
        {
            "id": "ya-existing-phone",
            "default_email": "existing-phone@example.com",
            "real_name": "Existing Phone Ya",
            "default_phone": {"number": "+79005550013"},
        },
    )
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    saved_user = db.query(User).filter(User.id == user_id).one()
    assert saved_user.phone == "+79005550012"
    assert saved_user.is_phone_verified is True


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


def test_yandex_new_user_never_gets_admin_role_without_onboarding(client, db, monkeypatch):
    _mock_yandex(monkeypatch, {"id": "ya-4", "default_email": "fresh-admin-name@example.com", "real_name": "Admin"})
    state = auth_router._create_oauth_state()

    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)

    assert response.status_code in (302, 307)
    _callback_onboarding_ticket(response.headers["location"])
    assert db.query(User).filter(User.email == "fresh-admin-name@example.com").first() is None


def _start_yandex_onboarding(client, db, monkeypatch, email="oauth-new@example.com", provider_user_id="ya-onboarding"):
    _mock_yandex(monkeypatch, {"id": provider_user_id, "default_email": email, "real_name": "OAuth New"})
    state = auth_router._create_oauth_state()
    response = client.get(f"/api/auth/yandex/callback?code=abc&state={state}", follow_redirects=False)
    assert response.status_code in (302, 307), response.text
    ticket = _callback_onboarding_ticket(response.headers["location"])
    assert db.query(User).filter(User.email == email).first() is None
    return ticket


def _verify_onboarding_phone(client, ticket: str, phone: str = "+79005550123"):
    from services.zvonok_service import ZVONOK_STUB_CALL_ID, ZVONOK_STUB_DIGITS

    request = client.post("/api/auth/oauth/onboarding-phone-request", json={"ticket": ticket, "phone": phone})
    assert request.status_code == 200, request.text
    assert request.json()["success"] is True
    return {
        "phone": phone,
        "call_id": request.json().get("call_id") or ZVONOK_STUB_CALL_ID,
        "phone_verification_code": ZVONOK_STUB_DIGITS,
    }


def test_oauth_onboarding_complete_client_creates_user_and_tokens(client, db, monkeypatch):
    ticket = _start_yandex_onboarding(client, db, monkeypatch, email="oauth-client-new@example.com", provider_user_id="ya-client-onboarding")
    verification = _verify_onboarding_phone(client, ticket, "+79005550123")

    response = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "client",
            "accepted_terms": True,
            "accepted_personal_data": True,
            "accepted_marketing": False,
            **verification,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["user"]["role"] == "client"
    assert data["user"]["phone"] == "+79005550123"
    assert data["user"]["phone_verified"] is True
    user = db.query(User).filter(User.email == "oauth-client-new@example.com").one()
    assert user.is_phone_verified is True
    account = db.query(UserOAuthAccount).filter(UserOAuthAccount.provider_user_id == "ya-client-onboarding").one()
    assert account.user_id == user.id


def test_oauth_onboarding_complete_requires_phone_verification_and_consents(client, db, monkeypatch):
    ticket = _start_yandex_onboarding(client, db, monkeypatch, email="oauth-consents@example.com", provider_user_id="ya-consents")

    no_verification = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "client",
            "phone": "+79005550124",
            "phone_verification_code": "0000",
            "accepted_terms": True,
            "accepted_personal_data": True,
        },
    )
    assert no_verification.status_code == status.HTTP_400_BAD_REQUEST

    verification = _verify_onboarding_phone(client, ticket, "+79005550124")
    no_consents = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "client",
            "accepted_terms": False,
            "accepted_personal_data": True,
            **verification,
        },
    )
    assert no_consents.status_code == status.HTTP_400_BAD_REQUEST
    assert db.query(User).filter(User.email == "oauth-consents@example.com").first() is None


def test_oauth_onboarding_complete_master_requires_city_and_creates_profile(client, db, monkeypatch):
    ticket = _start_yandex_onboarding(client, db, monkeypatch, email="oauth-master-new@example.com", provider_user_id="ya-master-onboarding")
    verification = _verify_onboarding_phone(client, ticket, "+79005550125")

    missing_city = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "master",
            "accepted_terms": True,
            "accepted_personal_data": True,
            **verification,
        },
    )
    assert missing_city.status_code == status.HTTP_400_BAD_REQUEST

    response = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "master",
            "city": "Москва",
            "timezone": "Europe/Moscow",
            "accepted_terms": True,
            "accepted_personal_data": True,
            **verification,
        },
    )
    assert response.status_code == 200, response.text
    user = db.query(User).filter(User.email == "oauth-master-new@example.com").one()
    assert user.role == UserRole.MASTER
    master = db.query(Master).filter(Master.user_id == user.id).one()
    assert master.city == "Москва"
    assert master.timezone == "Europe/Moscow"
    assert master.domain


def test_oauth_onboarding_occupied_phone_and_reused_ticket_fail(client, db, test_user, monkeypatch):
    ticket = _start_yandex_onboarding(client, db, monkeypatch, email="oauth-occupied@example.com", provider_user_id="ya-occupied")
    occupied = client.post("/api/auth/oauth/onboarding-phone-request", json={"ticket": ticket, "phone": test_user.phone})
    assert occupied.status_code == 200
    assert occupied.json()["success"] is False

    verification = _verify_onboarding_phone(client, ticket, "+79005550126")
    first = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "client",
            "accepted_terms": True,
            "accepted_personal_data": True,
            **verification,
        },
    )
    assert first.status_code == 200, first.text
    reused = client.post(
        "/api/auth/oauth/onboarding-complete",
        json={
            "ticket": ticket,
            "role": "client",
            "accepted_terms": True,
            "accepted_personal_data": True,
            **verification,
        },
    )
    assert reused.status_code == status.HTTP_400_BAD_REQUEST

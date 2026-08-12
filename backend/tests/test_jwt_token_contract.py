import asyncio
from types import SimpleNamespace

from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

import auth as auth_module
from auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_password_reset_phone_verification_token,
    create_refresh_token,
    create_signup_phone_verification_token,
)
from models import User, UserRole
from routers import auth as auth_router


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _decode(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def _settings(*, sv_required: bool, type_required: bool) -> SimpleNamespace:
    return SimpleNamespace(
        jwt_session_version_required=sv_required,
        jwt_token_type_required=type_required,
        DEMO_MASTER_PHONE="",
    )


def test_new_pair_is_typed_numeric_and_separated(client, test_user):
    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200, login.text
    tokens = login.json()
    access = _decode(tokens["access_token"])
    refresh = _decode(tokens["refresh_token"])

    assert access["sub"] == refresh["sub"] == str(test_user.id)
    assert access["sv"] == refresh["sv"] == test_user.session_version
    assert access["token_type"] == "access"
    assert refresh["token_type"] == "refresh"
    assert client.get(
        "/api/auth/users/me", headers=_headers(tokens["access_token"])
    ).status_code == 200
    assert client.get(
        "/api/auth/users/me", headers=_headers(tokens["refresh_token"])
    ).status_code == 401
    assert client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["access_token"]}
    ).status_code == 401

    refreshed = client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    assert _decode(refreshed.json()["access_token"])["token_type"] == "access"
    assert _decode(refreshed.json()["refresh_token"])["token_type"] == "refresh"
    assert _decode(refreshed.json()["access_token"])["sub"] == str(test_user.id)


def test_restricted_jwt_is_never_normal_bearer_or_refresh(client, test_user):
    restricted = create_access_token(
        {
            "sub": str(test_user.id),
            "purpose": "password_reset_phone_verification",
            "token_type": "refresh",
        }
    )

    assert client.get(
        "/api/auth/users/me", headers=_headers(restricted)
    ).status_code == 401
    assert client.post(
        "/api/auth/refresh", json={"refresh_token": restricted}
    ).status_code == 401


def test_restricted_artifacts_remain_outside_normal_token_type_model(test_user):
    signup = _decode(
        create_signup_phone_verification_token(
            test_user.id,
            test_user.session_version,
        )
    )
    reset = _decode(
        create_password_reset_phone_verification_token(
            test_user.phone,
            "challenge-id",
        )
    )

    assert signup["purpose"] == "signup_phone_verification"
    assert reset["purpose"] == "password_reset_phone_verification"
    assert "token_type" not in signup
    assert "token_type" not in reset


def test_untyped_rollout_and_strict_final_contract(client, test_user, monkeypatch):
    untyped = create_access_token({"sub": str(test_user.id)})
    typed_access_without_sv = create_access_token(
        {"sub": str(test_user.id), "token_type": "access"}
    )
    typed_refresh_without_sv = create_refresh_token(
        {"sub": str(test_user.id), "token_type": "refresh"}
    )

    monkeypatch.setattr(
        auth_module,
        "get_settings",
        lambda: _settings(sv_required=False, type_required=False),
    )
    assert client.get("/api/auth/users/me", headers=_headers(untyped)).status_code == 200
    assert client.post(
        "/api/auth/refresh", json={"refresh_token": untyped}
    ).status_code == 401
    assert client.get(
        "/api/auth/users/me", headers=_headers(typed_access_without_sv)
    ).status_code == 200
    assert client.post(
        "/api/auth/refresh", json={"refresh_token": typed_refresh_without_sv}
    ).status_code == 200

    monkeypatch.setattr(
        auth_module,
        "get_settings",
        lambda: _settings(sv_required=True, type_required=True),
    )
    assert client.get("/api/auth/users/me", headers=_headers(untyped)).status_code == 401
    assert client.get(
        "/api/auth/users/me", headers=_headers(typed_access_without_sv)
    ).status_code == 401
    assert client.post(
        "/api/auth/refresh", json={"refresh_token": typed_refresh_without_sv}
    ).status_code == 401


def test_contact_subjects_are_never_normal_identity(client, test_user):
    for subject in (test_user.email, test_user.phone):
        token = create_access_token(
            {"sub": subject, "sv": test_user.session_version, "token_type": "access"}
        )
        assert client.get(
            "/api/auth/users/me", headers=_headers(token)
        ).status_code == 401


def test_optional_auth_accepts_access_but_not_refresh(db, test_user):
    tokens = auth_module.issue_tokens_for_user(test_user)
    access_user = asyncio.run(
        auth_module.get_current_user_optional(
            HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=tokens["access_token"]
            ),
            db,
        )
    )
    refresh_user = asyncio.run(
        auth_module.get_current_user_optional(
            HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=tokens["refresh_token"]
            ),
            db,
        )
    )

    assert access_user.id == test_user.id
    assert refresh_user is None


def test_demo_pair_is_typed_numeric_and_preserves_demo_claim(
    client, db, monkeypatch
):
    demo = User(
        email="typed-demo@example.com",
        phone="+79005550199",
        full_name="Typed Demo",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(demo)
    db.commit()
    db.refresh(demo)
    monkeypatch.setattr(auth_router, "ensure_demo_master_exists", lambda _db: None)
    monkeypatch.setattr(
        auth_router,
        "get_settings",
        lambda: SimpleNamespace(DEMO_MASTER_PHONE=demo.phone),
    )

    response = client.post("/api/auth/demo-master-access")
    assert response.status_code == 200, response.text
    access = _decode(response.json()["access_token"])
    refresh = _decode(response.json()["refresh_token"])
    assert access["sub"] == refresh["sub"] == str(demo.id)
    assert access["token_type"] == "access"
    assert refresh["token_type"] == "refresh"
    assert access["demo"] is True
    assert refresh["demo"] is True

from datetime import datetime, timedelta
from types import SimpleNamespace

from jose import jwt

import auth as auth_module
from auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from models import ModeratorPermissions, PasswordReset, User, UserRole


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, user: User, password: str = "testpassword") -> dict:
    response = client.post(
        "/api/auth/login",
        json={"phone": user.phone, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _decode(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def test_normal_access_and_refresh_include_current_session_version(client, test_user):
    tokens = _login(client, test_user)

    assert _decode(tokens["access_token"])["sv"] == test_user.session_version == 1
    assert _decode(tokens["refresh_token"])["sv"] == test_user.session_version


def test_normal_session_extra_claims_cannot_override_identity(test_user):
    claims = auth_module.normal_session_claims(
        test_user,
        "access",
        {
            "sub": "999",
            "role": "ADMIN",
            "sv": 999,
            "token_type": "refresh",
            "exp": 1,
            "demo": True,
        },
    )

    assert claims == {
        "sub": str(test_user.id),
        "role": "CLIENT",
        "sv": 1,
        "token_type": "access",
        "demo": True,
    }


def test_matching_and_mismatched_session_version_bearer(client, test_user):
    matching = create_access_token({"sub": str(test_user.id), "sv": 1})
    mismatched = create_access_token({"sub": str(test_user.id), "sv": 2})

    assert client.get("/api/auth/users/me", headers=_headers(matching)).status_code == 200
    assert client.get("/api/auth/users/me", headers=_headers(mismatched)).status_code == 401


def test_compatibility_and_strict_missing_sv_policy(client, test_user, monkeypatch):
    numeric_legacy = create_access_token({"sub": str(test_user.id)})
    non_numeric_legacy = create_access_token({"sub": test_user.phone})

    monkeypatch.setattr(
        auth_module,
        "get_settings",
        lambda: SimpleNamespace(
            jwt_session_version_required=False,
            jwt_token_type_required=False,
            DEMO_MASTER_PHONE="",
        ),
    )
    assert client.get("/api/auth/users/me", headers=_headers(numeric_legacy)).status_code == 200
    assert client.get("/api/auth/users/me", headers=_headers(non_numeric_legacy)).status_code == 401

    monkeypatch.setattr(
        auth_module,
        "get_settings",
        lambda: SimpleNamespace(
            jwt_session_version_required=True,
            jwt_token_type_required=True,
            DEMO_MASTER_PHONE="",
        ),
    )
    assert client.get("/api/auth/users/me", headers=_headers(numeric_legacy)).status_code == 401


def test_refresh_requires_matching_session_version(client, test_user):
    matching = create_refresh_token(
        {"sub": str(test_user.id), "sv": 1, "token_type": "refresh"}
    )
    mismatched = create_refresh_token(
        {"sub": str(test_user.id), "sv": 2, "token_type": "refresh"}
    )

    assert client.post("/api/auth/refresh", json={"refresh_token": matching}).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": mismatched}).status_code == 401


def test_auth_change_password_revokes_access_and_refresh(client, db, test_user):
    old = _login(client, test_user)
    changed = client.post(
        "/api/auth/change-password",
        json={"old_password": "testpassword", "new_password": "newpassword"},
        headers=_headers(old["access_token"]),
    )

    assert changed.status_code == 200, changed.text
    assert "access_token" not in changed.json()
    db.expire_all()
    assert db.query(User).filter_by(id=test_user.id).one().session_version == 2
    assert client.get("/api/auth/users/me", headers=_headers(old["access_token"])).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code == 401
    assert client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    ).status_code == 401
    fresh = _login(client, test_user, "newpassword")
    assert _decode(fresh["access_token"])["sv"] == 2


def test_client_change_password_has_same_revocation_semantics(client, db, test_user):
    old = _login(client, test_user)
    changed = client.put(
        "/api/client/change-password",
        json={"current_password": "testpassword", "new_password": "newpassword"},
        headers=_headers(old["access_token"]),
    )

    assert changed.status_code == 200, changed.text
    assert "access_token" not in changed.json()
    db.expire_all()
    assert db.query(User).filter_by(id=test_user.id).one().session_version == 2
    assert client.get("/api/auth/users/me", headers=_headers(old["access_token"])).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code == 401


def test_wrong_password_does_not_change_hash_or_version(client, db, test_user):
    old_hash = test_user.hashed_password
    tokens = _login(client, test_user)

    response = client.post(
        "/api/auth/change-password",
        json={"old_password": "wrongpassword", "new_password": "newpassword"},
        headers=_headers(tokens["access_token"]),
    )

    assert response.status_code == 400
    db.expire_all()
    saved = db.query(User).filter_by(id=test_user.id).one()
    assert saved.hashed_password == old_hash
    assert saved.session_version == 1


def test_set_password_revokes_current_session(client, db):
    user = User(
        email="oauth-only@example.com",
        phone="+79007770001",
        hashed_password=None,
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    old = auth_module.issue_tokens_for_user(user)

    response = client.post(
        "/api/auth/set-password",
        json={"password": "newpassword"},
        headers=_headers(old["access_token"]),
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    saved = db.query(User).filter_by(id=user.id).one()
    assert saved.session_version == 2
    assert verify_password("newpassword", saved.hashed_password)
    assert client.get("/api/auth/users/me", headers=_headers(old["access_token"])).status_code == 401
    assert _login(client, saved, "newpassword")["access_token"]


def test_password_reset_revokes_old_sessions_atomically(client, db, test_user):
    old = _login(client, test_user)
    reset = PasswordReset(
        user_id=test_user.id,
        token="reset-session-version-token",
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        is_used=False,
    )
    db.add(reset)
    db.commit()
    reset_id = reset.id
    user_id = test_user.id

    response = client.post(
        "/api/auth/reset-password",
        json={"token": reset.token, "new_password": "newpassword"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "access_token" not in response.json()
    db.expire_all()
    saved = db.query(User).filter_by(id=user_id).one()
    saved_reset = db.query(PasswordReset).filter_by(id=reset_id).one()
    assert saved.session_version == 2
    assert saved_reset.is_used is True
    assert client.get("/api/auth/users/me", headers=_headers(old["access_token"])).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code == 401


def test_password_reset_commit_failure_rolls_back_hash_version_and_token(
    client, db, test_user, monkeypatch
):
    old_hash = test_user.hashed_password
    reset = PasswordReset(
        user_id=test_user.id,
        token="reset-rollback-token",
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        is_used=False,
    )
    db.add(reset)
    db.commit()
    reset_id = reset.id
    user_id = test_user.id
    real_commit = db.commit

    def fail_commit():
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(db, "commit", fail_commit)
    response = client.post(
        "/api/auth/reset-password",
        json={"token": reset.token, "new_password": "newpassword"},
    )
    monkeypatch.setattr(db, "commit", real_commit)

    assert response.status_code == 200
    assert response.json()["success"] is False
    db.expire_all()
    saved = db.query(User).filter_by(id=user_id).one()
    saved_reset = db.query(PasswordReset).filter_by(id=reset_id).one()
    assert saved.hashed_password == old_hash
    assert saved.session_version == 1
    assert saved_reset.is_used is False


def test_moderator_password_update_revokes_only_target(client, db, test_admin, test_admin_token):
    moderator = User(
        email="moderator@example.com",
        phone="+79007770002",
        full_name="Moderator",
        hashed_password=get_password_hash("oldpassword"),
        role=UserRole.MODERATOR,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(moderator)
    db.flush()
    db.add(ModeratorPermissions(user_id=moderator.id))
    db.commit()
    db.refresh(moderator)
    admin_version = test_admin.session_version

    response = client.put(
        f"/api/admin/moderators/{moderator.id}",
        json={"password": "newpassword"},
        headers=_headers(test_admin_token["access_token"]),
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    saved = db.query(User).filter_by(id=moderator.id).one()
    admin = db.query(User).filter_by(id=test_admin.id).one()
    assert saved.session_version == 2
    assert admin.session_version == admin_version
    assert client.get(
        "/api/auth/users/me",
        headers=_headers(test_admin_token["access_token"]),
    ).status_code == 200


def test_moderator_profile_update_does_not_increment_version(
    client, db, test_admin_token
):
    moderator = User(
        email="moderator-profile@example.com",
        phone="+79007770003",
        full_name="Before",
        hashed_password=get_password_hash("oldpassword"),
        role=UserRole.MODERATOR,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(moderator)
    db.flush()
    db.add(ModeratorPermissions(user_id=moderator.id))
    db.commit()

    response = client.put(
        f"/api/admin/moderators/{moderator.id}",
        json={"full_name": "After"},
        headers=_headers(test_admin_token["access_token"]),
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    saved = db.query(User).filter_by(id=moderator.id).one()
    assert saved.full_name == "After"
    assert saved.session_version == 1

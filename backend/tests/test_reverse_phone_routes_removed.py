"""Retired reverse-phone APIs cannot mutate accounts or invoke the provider."""

from datetime import datetime, timedelta
from unittest.mock import Mock

import pytest

from auth import create_user_access_token
from main import app
from models import User, UserRole
from services.zvonok_service import zvonok_service


RETIRED_PATHS = (
    "/api/auth/request-reverse-phone-verification",
    "/api/auth/check-reverse-phone-verification",
)


def _state(db, user):
    user = db.get(User, user.id)
    db.refresh(user)
    return {column.name: getattr(user, column.name) for column in User.__table__.columns}


@pytest.mark.parametrize("path", RETIRED_PATHS)
@pytest.mark.parametrize("role", [None, UserRole.MASTER, UserRole.ADMIN])
def test_retired_reverse_routes_are_404_and_preserve_all_challenges(
    client, db, test_user, monkeypatch, path, role
):
    provider = Mock(side_effect=AssertionError("Retired endpoint invoked provider"))
    monkeypatch.setattr(zvonok_service, "send_verification_call", provider)
    headers = {}
    if role is not None:
        actor = User(
            phone="+79000008888", email="reverse-actor@example.com", role=role,
            is_active=True, is_phone_verified=True,
        )
        db.add(actor)
        db.commit()
        headers = {"Authorization": "Bearer " + create_user_access_token(actor)}

    target_id = test_user.id
    for purpose in ("legacy_account_verification", "password_reset", "phone_change", "delete_account"):
        test_user = db.get(User, target_id)
        test_user.is_phone_verified = False
        test_user.phone_verification_code = "4826"
        test_user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
        test_user.phone_verification_call_id = "local-bound-challenge"
        test_user.phone_verification_target_phone = test_user.phone
        test_user.phone_verification_purpose = purpose
        test_user.phone_verification_attempts = 2
        test_user.pending_phone = "+79000007777"
        test_user.pending_phone_expires_at = datetime.utcnow() + timedelta(minutes=10)
        db.commit()
        before = _state(db, test_user)
        responses = []
        for phone in (test_user.phone, "+79000009999"):
            response = client.post(
                path, headers=headers,
                json={"phone": phone, "call_id": "local-unissued"},
            )
            assert response.status_code == 404
            responses.append(response.json())
            assert _state(db, test_user) == before
        assert responses[0] == responses[1] == {"detail": "Not Found"}
    provider.assert_not_called()


def test_reverse_routes_absent_from_full_app_and_openapi():
    paths = {getattr(route, "path", "").rstrip("/") for route in app.routes}
    for path in RETIRED_PATHS:
        assert path not in paths
        assert path not in app.openapi()["paths"]
    assert not hasattr(zvonok_service, "check_call_status")


def test_retired_reverse_api_cannot_complete_unverified_login(client, db, test_user):
    test_user.is_phone_verified = False
    db.commit()
    for path in RETIRED_PATHS:
        assert client.post(path, json={"phone": test_user.phone, "call_id": "local-unissued"}).status_code == 404
    response = client.post(
        "/api/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "phone_verification_required"
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.json()
    assert _state(db, test_user)["is_phone_verified"] is False


def test_current_account_deletion_verification_still_requires_its_code(
    client, db, test_user, monkeypatch
):
    provider = Mock(return_value={"success": True, "call_id": "local-deletion-call"})
    monkeypatch.setattr(zvonok_service, "send_verification_call", provider)
    user_id = test_user.id
    headers = {"Authorization": "Bearer " + create_user_access_token(test_user)}
    started = client.delete("/api/auth/delete-account", headers=headers)
    assert started.status_code == 200 and started.json()["success"]
    provider.assert_called_once()
    current = db.get(User, user_id)
    code = current.phone_verification_code
    assert code and current.phone_verification_expires > datetime.utcnow()
    wrong = "0000" if code != "0000" else "1111"
    rejected = client.post(
        "/api/auth/confirm-delete-account", headers=headers, params={"code": wrong}
    )
    assert rejected.status_code == 200 and not rejected.json()["success"]
    current = db.get(User, user_id)
    current.phone_verification_expires = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    expired = client.post(
        "/api/auth/confirm-delete-account", headers=headers, params={"code": code}
    )
    assert expired.status_code == 200 and not expired.json()["success"]
    current = db.get(User, user_id)
    current.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
    db.commit()
    confirmed = client.post(
        "/api/auth/confirm-delete-account", headers=headers, params={"code": code}
    )
    assert confirmed.status_code == 200 and confirmed.json()["success"]
    assert db.get(User, user_id).is_active is False
    provider.assert_called_once()

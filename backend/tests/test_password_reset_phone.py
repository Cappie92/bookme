from datetime import datetime, timedelta

import pytest

from auth import create_signup_phone_verification_token
from models import PasswordReset, User
from services.verification_service import VerificationService


GENERIC_MESSAGE = (
    "Если аккаунт с таким номером существует, звонок для восстановления будет отправлен."
)


def _stub_call(monkeypatch, digits="1234"):
    monkeypatch.setattr(
        "routers.auth.zvonok_service.send_verification_call",
        lambda _phone: {
            "success": True,
            "call_id": "provider-call-is-not-public",
            "pincode": digits,
        },
    )


def _request(client, phone):
    response = client.post(
        "/api/auth/request-password-reset-phone",
        json={"phone": phone},
    )
    assert response.status_code == 200, response.json()
    return response.json()


def _confirm(client, challenge, digits="1234", call_id=None, token=None):
    return client.post(
        "/api/auth/confirm-password-reset-phone",
        json={
            "challenge_token": token or challenge["challenge_token"],
            "call_id": call_id or challenge["call_id"],
            "phone_digits": digits,
        },
    )


def test_existing_and_unknown_phone_have_indistinguishable_request_contract(
    client, test_user, monkeypatch
):
    _stub_call(monkeypatch)
    existing = _request(client, test_user.phone)
    unknown = _request(client, "+79998887766")

    assert set(existing) == set(unknown) == {
        "status",
        "message",
        "challenge_token",
        "call_id",
        "expires_in",
    }
    assert existing["status"] == unknown["status"] == "verification_required"
    assert existing["message"] == unknown["message"] == GENERIC_MESSAGE
    assert existing["expires_in"] == unknown["expires_in"] == 300
    assert len(existing["call_id"]) == len(unknown["call_id"])

    # Restricted challenge artifacts are rejected by ordinary auth dependencies.
    headers = {"Authorization": f"Bearer {existing['challenge_token']}"}
    assert client.get("/api/auth/users/me", headers=headers).status_code == 401
    assert client.post(
        "/api/auth/refresh",
        json={"refresh_token": existing["challenge_token"]},
    ).status_code == 401


def test_correct_challenge_issues_only_one_time_reset_token(client, test_user, monkeypatch):
    _stub_call(monkeypatch)
    challenge = _request(client, test_user.phone)

    confirmed = _confirm(client, challenge)

    assert confirmed.status_code == 200, confirmed.json()
    data = confirmed.json()
    assert data["status"] == "reset_token_issued"
    assert data["reset_token"]
    assert data["expires_in"] == 900
    assert "access_token" not in data
    assert "refresh_token" not in data
    assert client.get(
        "/api/auth/users/me",
        headers={"Authorization": f"Bearer {data['reset_token']}"},
    ).status_code == 401


def test_wrong_code_increments_attempts_and_does_not_issue_token(
    client, db, test_user, monkeypatch
):
    user_id = test_user.id
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)

    response = _confirm(client, challenge, digits="9999")

    assert response.status_code == 400
    current_user = db.query(User).filter_by(id=user_id).one()
    assert current_user.phone_verification_attempts == 1
    assert db.query(PasswordReset).filter_by(user_id=user_id).count() == 0


def test_attempt_limit_rejects_correct_code(client, db, test_user, monkeypatch):
    user_id = test_user.id
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)
    current_user = db.query(User).filter_by(id=user_id).one()
    current_user.phone_verification_attempts = 5
    db.commit()

    assert _confirm(client, challenge).status_code == 400
    assert db.query(PasswordReset).filter_by(user_id=user_id).count() == 0


def test_expired_challenge_is_rejected(client, db, test_user, monkeypatch):
    user_id = test_user.id
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)
    current_user = db.query(User).filter_by(id=user_id).one()
    current_user.phone_verification_expires = datetime.utcnow() - timedelta(seconds=1)
    db.commit()

    assert _confirm(client, challenge).status_code == 400


def test_wrong_purpose_target_and_call_id_are_rejected(client, db, test_user, monkeypatch):
    user_id = test_user.id
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)

    signup_token = create_signup_phone_verification_token(user_id)
    assert _confirm(client, challenge, token=signup_token).status_code == 400
    assert _confirm(client, challenge, call_id="wrong-call").status_code == 400

    current_user = db.query(User).filter_by(id=user_id).one()
    current_user.phone_verification_target_phone = "+79990000000"
    db.commit()
    assert _confirm(client, challenge).status_code == 400


def test_resend_invalidates_previous_challenge(client, test_user, monkeypatch):
    phone = test_user.phone
    _stub_call(monkeypatch)
    first = _request(client, phone)
    second = _request(client, phone)

    assert first["call_id"] != second["call_id"]
    assert _confirm(client, first).status_code == 400
    assert _confirm(client, second).status_code == 200


def test_challenge_confirmation_cannot_be_replayed(client, test_user, monkeypatch):
    _stub_call(monkeypatch)
    challenge = _request(client, test_user.phone)

    assert _confirm(client, challenge).status_code == 200
    assert _confirm(client, challenge).status_code == 400


def test_reset_token_changes_password_and_cannot_be_replayed(
    client, test_user, monkeypatch
):
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)
    reset_token = _confirm(client, challenge).json()["reset_token"]

    reset = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "newpassword"},
    )
    assert reset.status_code == 200
    assert reset.json()["success"] is True
    assert "access_token" not in reset.json()

    replay = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "anotherpassword"},
    )
    assert replay.status_code == 200
    assert replay.json()["success"] is False

    assert client.post(
        "/api/auth/login",
        json={"phone": phone, "password": "testpassword"},
    ).status_code == 401
    new_login = client.post(
        "/api/auth/login",
        json={"phone": phone, "password": "newpassword"},
    )
    assert new_login.status_code == 200
    assert new_login.json()["access_token"]


def test_expired_reset_token_is_rejected(client, db, test_user, monkeypatch):
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)
    reset_token = _confirm(client, challenge).json()["reset_token"]
    reset = db.query(PasswordReset).filter_by(token=reset_token).one()
    reset.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()

    response = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "newpassword"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is False


@pytest.mark.parametrize("state", ["inactive", "deleted"])
def test_inactive_or_deleted_user_cannot_confirm_reset(
    state, client, db, test_user, monkeypatch
):
    user_id = test_user.id
    phone = test_user.phone
    _stub_call(monkeypatch)
    challenge = _request(client, phone)
    current_user = db.query(User).filter_by(id=user_id).one()
    if state == "inactive":
        current_user.is_active = False
    else:
        current_user.deleted_at = datetime.utcnow()
    db.commit()

    assert _confirm(client, challenge).status_code == 400
    assert db.query(PasswordReset).filter_by(user_id=user_id).count() == 0


def test_email_reset_uses_same_one_time_token_and_rejects_replay(
    client, db, test_user, monkeypatch
):
    user_id = test_user.id
    email = test_user.email

    async def fake_send(user: User, session):
        VerificationService.create_password_reset(user, session)
        return True

    monkeypatch.setattr(
        "routers.auth.VerificationService.send_password_reset_email",
        fake_send,
    )
    requested = client.post(
        "/api/auth/request-password-reset",
        json={"email": email},
    )
    assert requested.status_code == 200
    assert requested.json()["success"] is True
    token = db.query(PasswordReset).filter_by(user_id=user_id).one().token

    first = client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "emailpassword"},
    )
    second = client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "replayedpassword"},
    )
    assert first.json()["success"] is True
    assert second.json()["success"] is False


def test_legacy_phone_reset_contracts_are_disabled(client, test_user):
    assert client.post(
        "/api/auth/forgot-password",
        json={"phone": test_user.phone},
    ).status_code == 410
    assert client.post(
        "/api/auth/reset-password-by-phone",
        json={
            "phone": test_user.phone,
            "call_id": "legacy",
            "phone_digits": "1234",
            "new_password": "newpassword",
        },
    ).status_code == 410
    assert client.post(
        "/api/auth/request-phone-verification",
        json={"phone": test_user.phone},
    ).status_code == 410
    assert client.post(
        "/api/auth/verify-phone",
        json={"phone": test_user.phone, "call_id": "legacy", "phone_digits": "1234"},
    ).status_code == 410

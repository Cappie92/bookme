import pytest
from models import User, EmailVerification


def _auth_headers(token_data: dict) -> dict:
    return {"Authorization": f"Bearer {token_data['access_token']}"}


def test_request_phone_change_sets_pending_and_does_not_overwrite_phone(client, test_user_token, db, test_user):
    # Zvonok stub по умолчанию (ZVONOK_MODE пустой / не live): детерминированные call_id + pincode
    from services.zvonok_service import ZVONOK_STUB_CALL_ID, ZVONOK_STUB_DIGITS

    new_phone = "+79005556677"
    r = client.post(
        "/api/auth/request-phone-change",
        json={"phone": new_phone},
        headers=_auth_headers(test_user_token),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert data["call_id"] == ZVONOK_STUB_CALL_ID

    u = db.query(User).filter(User.id == test_user.id).first()
    assert u is not None
    assert u.phone == "+79001234567"
    assert u.pending_phone == new_phone
    assert u.phone_verification_code == ZVONOK_STUB_DIGITS


def test_confirm_phone_change_moves_pending_to_phone(client, test_user_token, db, test_user):
    from services.zvonok_service import ZVONOK_STUB_CALL_ID, ZVONOK_STUB_DIGITS

    new_phone = "+79005556677"
    r1 = client.post(
        "/api/auth/request-phone-change",
        json={"phone": new_phone},
        headers=_auth_headers(test_user_token),
    )
    assert r1.status_code == 200
    assert r1.json()["success"] is True

    r2 = client.post(
        "/api/auth/confirm-phone-change",
        json={"phone": new_phone, "call_id": ZVONOK_STUB_CALL_ID, "phone_digits": ZVONOK_STUB_DIGITS},
        headers=_auth_headers(test_user_token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["success"] is True

    u = db.query(User).filter(User.id == test_user.id).first()
    assert u is not None
    assert u.phone == new_phone
    assert u.pending_phone is None
    assert u.is_phone_verified is True


def test_request_email_change_sets_pending_and_does_not_overwrite_email(client, test_user_token, db, test_user, monkeypatch):
    # Stub email sending
    from services.email_service import get_email_service

    async def ok_send_verification_email(user, token):
        return True

    monkeypatch.setattr(get_email_service(), "send_verification_email", ok_send_verification_email)

    new_email = "new@example.com"
    r = client.post(
        "/api/auth/request-email-change",
        json={"email": new_email},
        headers=_auth_headers(test_user_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True

    u = db.query(User).filter(User.id == test_user.id).first()
    assert u is not None
    assert u.email == "test@example.com"
    assert u.pending_email == new_email


def test_confirm_email_change_requires_valid_token_and_applies_pending(client, test_user_token, db, test_user, monkeypatch):
    from services.email_service import get_email_service
    from services.verification_service import VerificationService

    async def ok_send_verification_email(user, token):
        return True

    monkeypatch.setattr(get_email_service(), "send_verification_email", ok_send_verification_email)

    new_email = "new@example.com"
    r1 = client.post(
        "/api/auth/request-email-change",
        json={"email": new_email},
        headers=_auth_headers(test_user_token),
    )
    assert r1.status_code == 200
    assert r1.json()["success"] is True

    # find latest token for email_change
    ver = db.query(EmailVerification).filter_by(user_id=test_user.id, purpose="email_change").first()
    assert ver is not None

    r2 = client.post("/api/auth/confirm-email-change", json={"token": ver.token})
    assert r2.status_code == 200, r2.text
    assert r2.json()["success"] is True

    u = db.query(User).filter(User.id == test_user.id).first()
    assert u is not None
    assert u.email == new_email
    assert u.pending_email is None
    assert u.is_verified is True


def test_duplicate_phone_rejected_on_request_phone_change(client, test_user_token, db, test_user, test_master):
    # test_master has +79001234569; try to take it
    r = client.post(
        "/api/auth/request-phone-change",
        json={"phone": test_master.phone},
        headers=_auth_headers(test_user_token),
    )
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_duplicate_email_rejected_on_request_email_change(client, test_user_token, db, test_user, test_master, monkeypatch):
    from services.email_service import get_email_service

    async def ok_send_verification_email(user, token):
        return True

    monkeypatch.setattr(get_email_service(), "send_verification_email", ok_send_verification_email)

    r = client.post(
        "/api/auth/request-email-change",
        json={"email": test_master.email},
        headers=_auth_headers(test_user_token),
    )
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_request_phone_verification_stub_returns_success(client, db, test_user):
    """Регистрация: при stub flashcall ответ содержит call_id и verification_number (smoke)."""
    from services.zvonok_service import ZVONOK_STUB_CALL_ID, ZVONOK_STUB_DIGITS

    r = client.post(
        "/api/auth/request-phone-verification",
        json={"phone": test_user.phone},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert data.get("call_id") == ZVONOK_STUB_CALL_ID
    assert data.get("verification_number") == ZVONOK_STUB_DIGITS

    u = db.query(User).filter(User.email == "test@example.com").first()
    assert u is not None
    assert u.phone_verification_code == ZVONOK_STUB_DIGITS


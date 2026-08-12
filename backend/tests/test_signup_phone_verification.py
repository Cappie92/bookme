from datetime import datetime, timedelta

from jose import jwt

from auth import ALGORITHM, SECRET_KEY, create_access_token
from models import Master, User, UserRole
from routers.auth import _get_registration_ticket, _save_registration_ticket
from services.zvonok_service import ZVONOK_STUB_DIGITS


def _payload(
    phone: str = "+79005550001",
    email: str = "signup@example.com",
    role: str = "client",
) -> dict:
    data = {
        "email": email,
        "password": "testpassword",
        "phone": phone,
        "full_name": "Signup User",
        "role": role,
        "accept_terms": True,
        "accept_personal_data": True,
    }
    if role == "master":
        data.update({"city": "Москва", "timezone": "Europe/Moscow"})
    return data


def _register(client, **overrides) -> dict:
    data = _payload()
    data.update(overrides)
    response = client.post("/api/auth/register", json=data)
    assert response.status_code == 200, response.json()
    result = response.json()
    assert result["status"] == "phone_verification_required"
    assert result["verification_kind"] == "new_registration"
    assert "access_token" not in result
    assert "refresh_token" not in result
    return result


def _headers(registration: dict) -> dict:
    return {"Authorization": f"Bearer {registration['verification_token']}"}


def _stub_call(monkeypatch, calls=None):
    sequence = calls or [("call-1", ZVONOK_STUB_DIGITS)]
    index = {"value": 0}

    def send(phone: str):
        current = sequence[min(index["value"], len(sequence) - 1)]
        index["value"] += 1
        return {"success": True, "call_id": current[0], "pincode": current[1]}

    monkeypatch.setattr("routers.auth.zvonok_service.send_verification_call", send)


def _request(client, registration: dict) -> dict:
    response = client.post(
        "/api/auth/request-signup-phone-verification",
        headers=_headers(registration),
    )
    assert response.status_code == 200, response.json()
    assert response.json()["success"] is True
    return response.json()


def _confirm(client, registration: dict, call_id="call-1", digits=ZVONOK_STUB_DIGITS):
    return client.post(
        "/api/auth/confirm-signup-phone-verification",
        headers=_headers(registration),
        json={"call_id": call_id, "phone_digits": digits},
    )


def test_client_register_returns_ticket_without_creating_user(client, db):
    before = db.query(User).count()
    registration = _register(client)

    assert db.query(User).count() == before
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None
    stored = _get_registration_ticket(registration["verification_token"])
    assert stored["registration"]["hashed_password"]
    assert "password" not in stored["registration"]


def test_master_register_creates_neither_user_nor_master(client, db):
    user_count = db.query(User).count()
    master_count = db.query(Master).count()

    _register(client, role="master", city="Москва", timezone="Europe/Moscow")

    assert db.query(User).count() == user_count
    assert db.query(Master).count() == master_count


def test_registration_requires_consents_and_master_location(client, db):
    missing_consent = _payload()
    missing_consent["accept_personal_data"] = False
    assert client.post("/api/auth/register", json=missing_consent).status_code == 400
    missing_location = _payload(role="master")
    missing_location.pop("city")
    missing_location.pop("timezone")
    assert client.post("/api/auth/register", json=missing_location).status_code == 400
    assert db.query(User).filter(User.phone == "+79005550001").first() is None


def test_wrong_code_and_expired_challenge_never_create_user(client, db, monkeypatch):
    _stub_call(monkeypatch)
    registration = _register(client)
    _request(client, registration)

    assert _confirm(client, registration, digits="9999").status_code == 400
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None

    state = _get_registration_ticket(registration["verification_token"])
    assert state["phone_verification_attempts"] == 1
    state["phone_verification_expires"] = int(
        (datetime.utcnow() - timedelta(seconds=1)).timestamp()
    )
    _save_registration_ticket(registration["verification_token"], state)
    assert _confirm(client, registration).status_code == 400
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None


def test_attempt_limit_and_wrong_purpose_target_call_never_create_user(
    client, db, monkeypatch
):
    _stub_call(monkeypatch)
    registration = _register(client)
    _request(client, registration)
    token = registration["verification_token"]

    assert _confirm(client, registration, call_id="wrong-call").status_code == 400
    state = _get_registration_ticket(token)
    state["phone_verification_purpose"] = "password_reset"
    _save_registration_ticket(token, state)
    assert _confirm(client, registration).status_code == 400

    state = _get_registration_ticket(token)
    state["phone_verification_purpose"] = "signup_registration"
    state["phone_verification_target_phone"] = "+79005559999"
    _save_registration_ticket(token, state)
    assert _confirm(client, registration).status_code == 400

    state = _get_registration_ticket(token)
    state["phone_verification_target_phone"] = registration["phone"]
    state["phone_verification_attempts"] = 5
    _save_registration_ticket(token, state)
    assert _confirm(client, registration).status_code == 400
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None


def test_correct_confirm_creates_one_verified_client_and_full_session(client, db, monkeypatch):
    _stub_call(monkeypatch)
    registration = _register(client)
    _request(client, registration)

    confirmed = _confirm(client, registration)

    assert confirmed.status_code == 200, confirmed.json()
    assert confirmed.json()["access_token"]
    assert confirmed.json()["refresh_token"]
    user = db.query(User).filter(User.phone == registration["phone"]).one()
    access_payload = jwt.decode(
        confirmed.json()["access_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    refresh_payload = jwt.decode(
        confirmed.json()["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert user.is_phone_verified is True
    assert user.role == UserRole.CLIENT
    assert user.session_version == 1
    assert access_payload["sv"] == refresh_payload["sv"] == 1
    assert access_payload["sub"] == refresh_payload["sub"] == str(user.id)
    assert access_payload["token_type"] == "access"
    assert refresh_payload["token_type"] == "refresh"
    assert db.query(User).filter(User.phone == registration["phone"]).count() == 1


def test_correct_confirm_creates_verified_master_with_location(client, db, monkeypatch):
    _stub_call(monkeypatch)
    registration = _register(
        client,
        role="master",
        city="Москва",
        timezone="Europe/Moscow",
        email="master-signup@example.com",
        phone="+79005550002",
    )
    _request(client, registration)

    assert _confirm(client, registration).status_code == 200
    user = db.query(User).filter(User.phone == registration["phone"]).one()
    master = db.query(Master).filter(Master.user_id == user.id).one()
    assert user.is_phone_verified is True
    assert master.city == "Москва"
    assert master.timezone == "Europe/Moscow"
    assert master.domain


def test_confirm_replay_does_not_create_second_user(client, db, monkeypatch):
    _stub_call(monkeypatch)
    registration = _register(client)
    _request(client, registration)
    assert _confirm(client, registration).status_code == 200

    replay = _confirm(client, registration)

    assert replay.status_code in {401, 409}
    assert db.query(User).filter(User.phone == registration["phone"]).count() == 1


def test_duplicate_race_before_master_confirm_has_no_partial_entities(client, db, monkeypatch):
    _stub_call(monkeypatch)
    registration = _register(
        client,
        role="master",
        city="Москва",
        timezone="Europe/Moscow",
        email="race-master@example.com",
        phone="+79005550003",
    )
    _request(client, registration)
    racer = User(
        email="racer@example.com",
        phone=registration["phone"],
        hashed_password="not-used",
        role=UserRole.CLIENT,
        is_active=True,
        is_phone_verified=True,
    )
    db.add(racer)
    db.commit()
    master_count = db.query(Master).count()

    response = _confirm(client, registration)

    assert response.status_code == 409
    assert db.query(User).filter(User.email == "race-master@example.com").first() is None
    assert db.query(Master).count() == master_count


def test_resend_invalidates_previous_challenge(client, db, monkeypatch):
    _stub_call(monkeypatch, [("call-old", "1111"), ("call-new", "2222")])
    registration = _register(client)
    _request(client, registration)
    _request(client, registration)

    assert _confirm(client, registration, "call-old", "1111").status_code == 400
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None
    assert _confirm(client, registration, "call-new", "2222").status_code == 200


def test_cancel_and_expired_ticket_leave_no_user(client, db):
    registration = _register(client)
    response = client.post(
        "/api/auth/cancel-signup-phone-verification",
        headers=_headers(registration),
    )
    assert response.status_code == 204
    assert _get_registration_ticket(registration["verification_token"]) is None
    assert db.query(User).filter(User.phone == registration["phone"]).first() is None

    expired = _register(client, phone="+79005550004", email="expired@example.com")
    state = _get_registration_ticket(expired["verification_token"])
    state["exp"] = int((datetime.utcnow() - timedelta(seconds=1)).timestamp())
    _save_registration_ticket(expired["verification_token"], state)
    assert client.post(
        "/api/auth/request-signup-phone-verification",
        headers=_headers(expired),
    ).status_code == 401
    assert db.query(User).filter(User.phone == expired["phone"]).first() is None


def test_existing_unverified_account_uses_separate_legacy_artifact(
    client, db, test_user, monkeypatch
):
    test_user.is_phone_verified = False
    db.commit()
    original_id = test_user.id
    _stub_call(monkeypatch)

    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200
    data = login.json()
    assert data["verification_kind"] == "existing_account"
    assert "access_token" not in data

    _request(client, data)
    confirmed = _confirm(client, data)
    assert confirmed.status_code == 200, confirmed.json()
    current = db.query(User).filter(User.id == original_id).one()
    assert current.is_phone_verified is True
    assert db.query(User).filter(User.phone == current.phone).count() == 1


def test_verified_login_unchanged_and_wrong_artifact_rejected(client, test_user):
    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]

    wrong = create_access_token({"sub": str(test_user.id), "purpose": "password_reset"})
    assert client.post(
        "/api/auth/request-signup-phone-verification",
        headers={"Authorization": f"Bearer {wrong}"},
    ).status_code == 401


def test_deleted_anonymized_account_can_start_new_registration(client, db, test_user):
    old_phone = test_user.phone
    test_user.phone = None
    test_user.email = None
    test_user.hashed_password = None
    test_user.is_active = False
    test_user.deleted_at = datetime.utcnow()
    db.commit()

    registration = _register(client, phone=old_phone, email="reborn@example.com")

    assert registration["verification_kind"] == "new_registration"
    assert db.query(User).filter(User.phone == old_phone).first() is None

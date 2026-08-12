from datetime import datetime, timedelta

import pytest
from jose import jwt

from auth import ALGORITHM, SECRET_KEY
from models import (
    Booking,
    Master,
    MasterSchedule,
    Salon,
    SalonMasterServiceSettings,
    Service,
    User,
    UserRole,
)
from routers.bookings import (
    PUBLIC_BOOKING_TICKET_PURPOSE,
    _get_public_booking_ticket,
    _save_public_booking_ticket,
)
from services.zvonok_service import ZVONOK_STUB_DIGITS


@pytest.fixture
def booking_master(db):
    owner = User(
        phone="+79005550090", email="booking-master@example.com",
        role=UserRole.MASTER, is_active=True, is_verified=True,
        is_phone_verified=True,
    )
    db.add(owner)
    db.flush()
    master = Master(
        user_id=owner.id, bio="", experience_years=1,
        timezone="Europe/Moscow", timezone_confirmed=True,
    )
    db.add(master)
    db.flush()
    for days in (1, 2):
        date_value = (datetime.now() + timedelta(days=days)).date()
        db.add(MasterSchedule(
            master_id=master.id,
            date=date_value,
            start_time=datetime.min.time(),
            end_time=datetime.max.time().replace(microsecond=0),
            is_available=True,
        ))
    db.commit()
    db.refresh(master)
    return master


@pytest.fixture
def booking_service(db, booking_master):
    service = Service(name="Public Booking Service", price=1000, duration=60)
    db.add(service)
    db.flush()
    db.add(SalonMasterServiceSettings(
        master_id=booking_master.id,
        service_id=service.id,
        is_active=True,
        master_payment_type="rub",
        master_payment_value=1000,
    ))
    db.commit()
    db.refresh(service)
    return service


def _payload(service, master, *, days=1):
    start = (datetime.now() + timedelta(days=days)).replace(
        minute=0, second=0, microsecond=0
    )
    return {
        "service_id": service.id,
        "master_id": master.id,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "status": "created",
        "client_name": "Pending Client",
        "service_name": service.name,
        "service_duration": 60,
        "service_price": float(service.price),
    }


def _start(client, service, master, phone="+79005550101"):
    response = client.post(
        "/api/bookings/public",
        params={"client_phone": phone},
        json=_payload(service, master),
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "phone_verification_required"
    assert data["verification_kind"] == "public_booking"
    assert "access_token" not in data
    return data


def _headers(pending):
    return {"Authorization": f"Bearer {pending['verification_token']}"}


def _stub_calls(monkeypatch, calls=None):
    sequence = calls or [("booking-call-1", ZVONOK_STUB_DIGITS)]
    index = {"value": 0}

    def send(phone):
        current = sequence[min(index["value"], len(sequence) - 1)]
        index["value"] += 1
        return {"success": True, "call_id": current[0], "pincode": current[1]}

    monkeypatch.setattr("routers.bookings.zvonok_service.send_verification_call", send)


def _request_call(client, pending):
    response = client.post(
        "/api/bookings/public/verification/request", headers=_headers(pending)
    )
    assert response.status_code == 200, response.text
    return response.json()


def _confirm(client, pending, call_id="booking-call-1", digits=ZVONOK_STUB_DIGITS):
    return client.post(
        "/api/bookings/public/verification/confirm",
        headers=_headers(pending),
        json={"call_id": call_id, "phone_digits": digits},
    )


def test_initial_public_booking_has_no_permanent_rows_or_jwt(
    client, db, booking_service, booking_master
):
    users_before, bookings_before = db.query(User).count(), db.query(Booking).count()

    pending = _start(client, booking_service, booking_master)

    assert db.query(User).count() == users_before
    assert db.query(Booking).count() == bookings_before
    state = _get_public_booking_ticket(pending["verification_token"])
    assert state["purpose"] == PUBLIC_BOOKING_TICKET_PURPOSE
    assert state["pending_booking"]["phone"] == pending["phone"]


def test_public_booking_ticket_storage_fails_closed_in_production(
    client, db, booking_service, booking_master, monkeypatch
):
    def unavailable(*args, **kwargs):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr("sms.redis_client.setex", unavailable)
    monkeypatch.setattr(
        "services.pending_ticket_service.get_settings",
        lambda: type("Settings", (), {"is_production": True})(),
    )
    before = (db.query(User).count(), db.query(Booking).count())

    response = client.post(
        "/api/bookings/public",
        params={"client_phone": "+79005550110"},
        json=_payload(booking_service, booking_master),
    )

    assert response.status_code == 503
    assert (db.query(User).count(), db.query(Booking).count()) == before


def test_wrong_expired_cancel_and_ticket_expiry_leave_no_rows(
    client, db, booking_service, booking_master, monkeypatch
):
    _stub_calls(monkeypatch)
    before = (db.query(User).count(), db.query(Booking).count())

    wrong = _start(client, booking_service, booking_master, "+79005550102")
    _request_call(client, wrong)
    assert _confirm(client, wrong, digits="9999").status_code == 400

    state = _get_public_booking_ticket(wrong["verification_token"])
    state["phone_verification_expires"] = int(
        (datetime.utcnow() - timedelta(seconds=1)).timestamp()
    )
    _save_public_booking_ticket(wrong["verification_token"], state)
    assert _confirm(client, wrong).status_code == 400

    cancelled = _start(client, booking_service, booking_master, "+79005550103")
    cancel = client.post(
        "/api/bookings/public/verification/cancel", headers=_headers(cancelled)
    )
    assert cancel.status_code == 204
    assert _get_public_booking_ticket(cancelled["verification_token"]) is None

    expired = _start(client, booking_service, booking_master, "+79005550104")
    state = _get_public_booking_ticket(expired["verification_token"])
    state["exp"] = int((datetime.utcnow() - timedelta(seconds=1)).timestamp())
    _save_public_booking_ticket(expired["verification_token"], state)
    assert _confirm(client, expired).status_code == 401
    assert (db.query(User).count(), db.query(Booking).count()) == before


def test_correct_proof_creates_once_and_issues_canonical_access(
    client, db, booking_service, booking_master, monkeypatch
):
    _stub_calls(monkeypatch)
    phone = "+79005550105"
    pending = _start(client, booking_service, booking_master, phone)
    _request_call(client, pending)

    confirmed = _confirm(client, pending)

    assert confirmed.status_code == 200, confirmed.text
    user = db.query(User).filter(User.phone == phone).one()
    assert user.is_phone_verified is True
    assert db.query(Booking).filter(Booking.client_id == user.id).count() == 1
    payload = jwt.decode(
        confirmed.json()["access_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert payload["sub"] == str(user.id)
    assert payload["sv"] == user.session_version
    assert payload["token_type"] == "access"
    assert _confirm(client, pending).status_code in {401, 409}
    assert db.query(User).filter(User.phone == phone).count() == 1
    assert db.query(Booking).filter(Booking.client_id == user.id).count() == 1


def test_resend_invalidates_old_call_and_binding_rejects_tampering(
    client, db, booking_service, booking_master, monkeypatch
):
    _stub_calls(
        monkeypatch,
        [("old-call", "1111"), ("new-call", "2222")],
    )
    pending = _start(client, booking_service, booking_master, "+79005550106")
    _request_call(client, pending)
    _request_call(client, pending)

    assert _confirm(client, pending, "old-call", "1111").status_code == 400
    assert _confirm(client, pending, "wrong-call", "2222").status_code == 400
    state = _get_public_booking_ticket(pending["verification_token"])
    state["phone_verification_purpose"] = "signup_registration"
    _save_public_booking_ticket(pending["verification_token"], state)
    assert _confirm(client, pending, "new-call", "2222").status_code == 400
    state = _get_public_booking_ticket(pending["verification_token"])
    state["phone_verification_purpose"] = PUBLIC_BOOKING_TICKET_PURPOSE
    state["phone_verification_target_phone"] = "+79005559999"
    _save_public_booking_ticket(pending["verification_token"], state)
    assert _confirm(client, pending, "new-call", "2222").status_code == 400
    state = _get_public_booking_ticket(pending["verification_token"])
    state["phone_verification_target_phone"] = pending["phone"]
    state["phone_verification_attempts"] = 5
    _save_public_booking_ticket(pending["verification_token"], state)
    assert _confirm(client, pending, "new-call", "2222").status_code == 400
    assert db.query(User).filter(User.phone == pending["phone"]).first() is None


def test_slot_race_rolls_back_new_user(
    client, db, booking_service, booking_master, monkeypatch
):
    _stub_calls(monkeypatch)
    phone = "+79005550107"
    pending = _start(client, booking_service, booking_master, phone)
    _request_call(client, pending)
    slot = _payload(booking_service, booking_master)
    occupied_by = User(
        phone="+79005550999", role=UserRole.CLIENT, is_active=True,
        is_verified=True, is_phone_verified=True,
    )
    db.add(occupied_by)
    db.flush()
    occupied = Booking(
        client_id=occupied_by.id,
        service_id=booking_service.id,
        master_id=booking_master.id,
        start_time=datetime.fromisoformat(slot["start_time"]),
        end_time=datetime.fromisoformat(slot["end_time"]),
        status="created",
    )
    db.add(occupied)
    db.commit()
    occupied_by_id = occupied_by.id

    response = _confirm(client, pending)

    assert response.status_code == 409, response.text
    assert db.query(User).filter(User.phone == phone).first() is None
    assert db.query(Booking).filter(Booking.client_id == occupied_by_id).count() == 1


def test_existing_verified_phone_still_requires_proof_and_is_not_duplicated(
    client, db, test_user, booking_service, booking_master, monkeypatch
):
    _stub_calls(monkeypatch)
    pending = _start(client, booking_service, booking_master, test_user.phone)
    assert "access_token" not in pending
    assert db.query(Booking).filter(Booking.client_id == test_user.id).count() == 0
    _request_call(client, pending)
    confirmed = _confirm(client, pending)
    assert confirmed.status_code == 200, confirmed.text
    assert db.query(User).filter(User.phone == test_user.phone).count() == 1
    assert db.query(Booking).filter(Booking.client_id == test_user.id).count() == 1


def test_duplicate_phone_appearing_before_confirm_is_safely_reused(
    client, db, booking_service, booking_master, monkeypatch
):
    _stub_calls(monkeypatch)
    phone = "+79005550109"
    pending = _start(client, booking_service, booking_master, phone)
    _request_call(client, pending)
    raced_user = User(
        phone=phone, role=UserRole.CLIENT, is_active=True,
        is_verified=True, is_phone_verified=True,
    )
    db.add(raced_user)
    db.commit()
    raced_user_id = raced_user.id

    confirmed = _confirm(client, pending)

    assert confirmed.status_code == 200, confirmed.text
    assert db.query(User).filter(User.phone == phone).count() == 1
    assert db.query(Booking).filter(Booking.client_id == raced_user_id).count() == 1


def test_any_master_is_pending_then_creates_once(
    client, db, booking_service, booking_master, monkeypatch
):
    salon_owner = User(
        phone="+79005550091", role=UserRole.SALON, is_active=True,
        is_verified=True, is_phone_verified=True,
    )
    db.add(salon_owner)
    db.flush()
    salon = Salon(user_id=salon_owner.id, name="Any Salon", domain="any-salon")
    db.add(salon)
    db.flush()
    booking_service.salon_id = salon.id
    db.commit()
    salon_id = salon.id
    master_id = booking_master.id
    _stub_calls(monkeypatch)
    monkeypatch.setattr(
        "routers.bookings.get_best_master_for_slot",
        lambda *args, **kwargs: {"id": master_id, "name": "Any Master"},
    )
    monkeypatch.setattr(
        "routers.bookings.check_booking_conflicts", lambda *args, **kwargs: False
    )
    phone = "+79005550108"
    start = (datetime.now() + timedelta(days=2)).replace(
        minute=0, second=0, microsecond=0
    )
    response = client.post(
        "/api/bookings/create-with-any-master",
        params={
            "salon_id": salon_id,
            "service_id": booking_service.id,
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
            "client_phone": phone,
        },
    )
    assert response.status_code == 200, response.text
    pending = response.json()
    assert "access_token" not in pending
    assert db.query(User).filter(User.phone == phone).first() is None
    assert db.query(Booking).count() == 0

    _request_call(client, pending)
    confirmed = _confirm(client, pending)

    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["master_id"] == booking_master.id
    user = db.query(User).filter(User.phone == phone).one()
    assert db.query(Booking).filter(Booking.client_id == user.id).count() == 1
    assert _confirm(client, pending).status_code in {401, 409}


def test_authenticated_verified_client_any_master_behavior_is_preserved(
    client, db, test_user, booking_service, booking_master, monkeypatch
):
    salon_owner = User(
        phone="+79005550092", role=UserRole.SALON, is_active=True,
        is_verified=True, is_phone_verified=True,
    )
    db.add(salon_owner)
    db.flush()
    salon = Salon(user_id=salon_owner.id, name="Auth Salon", domain="auth-salon")
    db.add(salon)
    db.flush()
    booking_service.salon_id = salon.id
    db.commit()
    salon_id = salon.id
    service_id = booking_service.id
    master_id = booking_master.id
    client_id = test_user.id
    client_phone = test_user.phone
    monkeypatch.setattr(
        "routers.bookings.get_best_master_for_slot",
        lambda *args, **kwargs: {"id": master_id, "name": "Auth Any Master"},
    )
    monkeypatch.setattr(
        "routers.bookings.check_booking_conflicts", lambda *args, **kwargs: False
    )
    login = client.post(
        "/api/auth/login",
        json={"phone": client_phone, "password": "testpassword"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    start = (datetime.now() + timedelta(days=2)).replace(
        minute=0, second=0, microsecond=0
    )

    response = client.post(
        "/api/bookings/create-with-any-master",
        params={
            "salon_id": salon_id,
            "service_id": service_id,
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    assert "verification_token" not in response.json()
    assert db.query(Booking).filter(Booking.client_id == client_id).count() == 1

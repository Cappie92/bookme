from datetime import datetime, timedelta, time, date
import pytest
from jose import jwt
from sqlalchemy import inspect

from auth import ALGORITHM, SECRET_KEY, get_password_hash
from models import (
    Booking,
    Master,
    MasterSchedule,
    Service,
    User,
    UserRole,
    SalonMasterServiceSettings,
)
from services.zvonok_service import ZVONOK_STUB_DIGITS

# Используем client и db из conftest (с override get_db), чтобы все запросы шли в одну тестовую БД.


@pytest.fixture(scope="function")
def test_user(db):
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234567",
        full_name="Test User",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_master(db):
    user = User(
        email="master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234569",
        full_name="Master User",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(user_id=user.id, bio="Test bio", experience_years=5)
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


@pytest.fixture(scope="function")
def master_schedule(db, test_master):
    """Личное расписание мастера на ближайшие дни, чтобы create_booking не падал с 400 «Мастер не работает»."""
    for days_ahead in (1, 2):
        d = date.today() + timedelta(days=days_ahead)
        db.add(
            MasterSchedule(
                master_id=test_master.id,
                salon_id=None,
                date=d,
                start_time=time(0, 0),
                end_time=time(23, 59),
                is_available=True,
            )
        )
    db.commit()
    return test_master


@pytest.fixture(scope="function")
def test_service(db, test_master, master_schedule):
    service = Service(name="Test Service", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)
    
    # Создаем связь между сервисом и мастером через SalonMasterServiceSettings
    from models import SalonMasterServiceSettings
    master_service_settings = SalonMasterServiceSettings(
        master_id=test_master.id,
        service_id=service.id,
        is_active=True,
        master_payment_type="rub",
        master_payment_value=1000
    )
    db.add(master_service_settings)
    db.commit()
    
    return service


@pytest.fixture(scope="function")
def auth_headers(client, test_user):
    response = client.post(
        "/api/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def master_headers(client, test_master):
    response = client.post(
        "/api/auth/login",
        json={"phone": test_master.user.phone, "password": "testpassword"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _booking_payload(test_service, test_master, days_offset=1, hours_offset=1):
    start = datetime.now() + timedelta(days=days_offset)
    start = start.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=hours_offset)
    data = {
        "service_id": test_service.id,
        "master_id": test_master.id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "status": "created",
        "client_name": "Test Client",
        "service_name": getattr(test_service, "name", "Test Service"),
        "service_duration": getattr(test_service, "duration", 60),
        "service_price": float(getattr(test_service, "price", 1000)),
    }
    if getattr(test_service, "salon_id", None):
        data["salon_id"] = test_service.salon_id
    return data


def test_create_booking(client, auth_headers, test_service, test_master):
    booking_data = _booking_payload(test_service, test_master)
    response = client.post("/api/bookings/", json=booking_data, headers=auth_headers)
    if response.status_code != 200:
        print("\nRESPONSE JSON:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["service_id"] == booking_data["service_id"]
    assert data["master_id"] == booking_data["master_id"]


def test_public_booking_access_token_is_typed_numeric(
    client, db, test_user, test_service, test_master, monkeypatch
):
    test_master.timezone = "Europe/Moscow"
    db.commit()
    response = client.post(
        "/api/bookings/public",
        params={"client_phone": test_user.phone},
        json=_booking_payload(test_service, test_master),
    )

    assert response.status_code == 200, response.text
    pending = response.json()
    assert "access_token" not in pending
    monkeypatch.setattr(
        "routers.bookings.zvonok_service.send_verification_call",
        lambda phone: {
            "success": True,
            "call_id": "typed-access-call",
            "pincode": ZVONOK_STUB_DIGITS,
        },
    )
    headers = {"Authorization": f"Bearer {pending['verification_token']}"}
    requested = client.post(
        "/api/bookings/public/verification/request", headers=headers
    )
    assert requested.status_code == 200, requested.text
    confirmed = client.post(
        "/api/bookings/public/verification/confirm",
        headers=headers,
        json={
            "call_id": "typed-access-call",
            "phone_digits": ZVONOK_STUB_DIGITS,
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    payload = jwt.decode(
        confirmed.json()["access_token"], SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert payload["sub"] == str(test_user.id)
    assert payload["sv"] == test_user.session_version
    assert payload["token_type"] == "access"


def test_get_bookings(client, auth_headers):
    response = client.get("/api/bookings/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_update_booking(client, auth_headers, test_service, test_master, db):
    service_id = test_service.id
    master_id = test_master.id
    salon_id = getattr(test_service, "salon_id", None)

    booking_data = _booking_payload(test_service, test_master)
    if salon_id:
        booking_data["salon_id"] = salon_id
    response = client.post("/api/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    start2 = datetime.now() + timedelta(days=2)
    start2 = start2.replace(minute=0, second=0, microsecond=0)
    end2 = start2 + timedelta(hours=1)
    update_data = {
        "service_id": service_id,
        "master_id": master_id,
        "start_time": start2.isoformat(),
        "end_time": end2.isoformat(),
        "status": "confirmed",
    }
    if salon_id:
        update_data["salon_id"] = salon_id

    response = client.put(
        f"/api/bookings/{booking_id}", json=update_data, headers=auth_headers
    )
    if response.status_code != 200:
        print("Ошибка обновления бронирования:", response.status_code, response.json())
    assert response.status_code == 200
    updated_booking = response.json()
    assert updated_booking["status"] == "confirmed"
    assert updated_booking["start_time"] == update_data["start_time"]
    assert updated_booking["end_time"] == update_data["end_time"]


def test_delete_booking(client, auth_headers, test_service, test_master, db):
    """Client больше не может hard-delete; admin удаляет чистую будущую бронь."""
    from auth import get_password_hash
    from models import Booking

    booking_data = _booking_payload(test_service, test_master)
    response = client.post("/api/bookings/", json=booking_data, headers=auth_headers)
    assert response.status_code == 200, response.json()
    booking_id = response.json()["id"]

    # non-admin: forbidden, booking remains
    response = client.delete(f"/api/bookings/{booking_id}", headers=auth_headers)
    assert response.status_code == 403
    assert db.query(Booking).filter(Booking.id == booking_id).first() is not None

    admin = User(
        email="bookings-admin@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007654321",
        full_name="Bookings Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(admin)
    db.commit()
    login = client.post(
        "/api/auth/login", json={"phone": admin.phone, "password": "testpassword"}
    )
    assert login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.delete(f"/api/bookings/{booking_id}", headers=admin_headers)
    assert response.status_code == 200, response.json()
    assert db.query(Booking).filter(Booking.id == booking_id).first() is None
    response = client.get(f"/api/bookings/{booking_id}", headers=auth_headers)
    assert response.status_code == 404


def test_create_edit_request(client, auth_headers, test_service, test_master):
    booking_data = _booking_payload(test_service, test_master)
    response = client.post("/api/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    edit_request_data = {
        "booking_id": booking_id,
        "proposed_start": (datetime.now() + timedelta(days=2)).isoformat(),
        "proposed_end": (datetime.now() + timedelta(days=2, hours=1)).isoformat(),
    }
    response = client.post(
        f"/api/bookings/{booking_id}/edit-requests",
        json=edit_request_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"


def test_update_edit_request(client, master_headers, test_service, test_master):
    booking_data = _booking_payload(test_service, test_master)
    response = client.post("/api/bookings/", json=booking_data, headers=master_headers)
    booking_id = response.json()["id"]

    edit_request_data = {
        "booking_id": booking_id,
        "proposed_start": (datetime.now() + timedelta(days=2)).isoformat(),
        "proposed_end": (datetime.now() + timedelta(days=2, hours=1)).isoformat(),
    }
    response = client.post(
        f"/api/bookings/{booking_id}/edit-requests",
        json=edit_request_data,
        headers=master_headers,
    )
    request_id = response.json()["id"]

    update_data = {"status": "accepted"}
    response = client.put(
        f"/api/bookings/edit-requests/{request_id}",
        json=update_data,
        headers=master_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "accepted"


def test_get_available_slots(client, master_headers):
    response = client.get(
        "/api/bookings/available-slots",
        params={
            "owner_type": "master",
            "owner_id": 1,
            "date": datetime.now().isoformat(),
            "service_duration": 60,
        },
        headers=master_headers,
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_master_reschedule_uses_owned_booking_and_canonical_conflicts(
    client, db, test_user, test_master, test_service, master_headers
):
    client_id = inspect(test_user).identity[0]
    master_id = inspect(test_master).identity[0]
    service_id = inspect(test_service).identity[0]
    target_date = date.today() + timedelta(days=1)
    original_start = datetime.combine(target_date, time(9, 0))
    booking = Booking(
        client_id=client_id,
        service_id=service_id,
        master_id=master_id,
        start_time=original_start,
        end_time=original_start + timedelta(hours=1),
        status="created",
    )
    conflict = Booking(
        client_id=client_id,
        service_id=service_id,
        master_id=master_id,
        start_time=datetime.combine(target_date, time(12, 0)),
        end_time=datetime.combine(target_date, time(13, 0)),
        status="confirmed",
    )
    db.add_all([booking, conflict])
    db.commit()
    booking_id = inspect(booking).identity[0]

    slots = client.get(
        f"/api/master/bookings/{booking_id}/available-slots",
        params={"date": target_date.isoformat()},
        headers=master_headers,
    )
    assert slots.status_code == 200, slots.text

    moved_start = datetime.combine(target_date, time(10, 0))
    moved = client.put(
        f"/api/master/bookings/{booking_id}/time",
        json={
            "start_time": moved_start.isoformat(),
            "end_time": (moved_start + timedelta(hours=1)).isoformat(),
        },
        headers=master_headers,
    )
    assert moved.status_code == 200, moved.text

    overlapping_start = datetime.combine(target_date, time(11, 30))
    rejected = client.put(
        f"/api/master/bookings/{booking_id}/time",
        json={
            "start_time": overlapping_start.isoformat(),
            "end_time": (overlapping_start + timedelta(hours=1)).isoformat(),
        },
        headers=master_headers,
    )
    assert rejected.status_code == 400
    assert db.get(Booking, booking_id).start_time == moved_start


def test_master_reschedule_rejects_foreign_booking(
    client, db, test_user, test_master, test_service, master_headers
):
    client_id = inspect(test_user).identity[0]
    service_id = inspect(test_service).identity[0]
    other_user = User(
        email="other-master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007654329",
        full_name="Other Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(other_user)
    db.flush()
    other_master = Master(user_id=other_user.id, bio="", experience_years=0)
    db.add(other_master)
    db.flush()
    start = datetime.combine(date.today() + timedelta(days=1), time(10, 0))
    foreign = Booking(
        client_id=client_id,
        service_id=service_id,
        master_id=other_master.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status="created",
    )
    db.add(foreign)
    db.commit()
    foreign_id = inspect(foreign).identity[0]

    response = client.put(
        f"/api/master/bookings/{foreign_id}/time",
        json={"start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat()},
        headers=master_headers,
    )
    assert response.status_code == 404

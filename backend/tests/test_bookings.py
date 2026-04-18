from datetime import datetime, timedelta, time, date
import pytest

from auth import get_password_hash
from models import (
    Master,
    MasterSchedule,
    Service,
    User,
    UserRole,
    SalonMasterServiceSettings,
)

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


def test_delete_booking(client, auth_headers, test_service, test_master):
    booking_data = _booking_payload(test_service, test_master)
    response = client.post("/api/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    response = client.delete(f"/api/bookings/{booking_id}", headers=auth_headers)
    assert response.status_code == 200
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

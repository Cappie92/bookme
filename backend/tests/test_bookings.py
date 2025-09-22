from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from auth import get_password_hash
from database import Base, engine
from main import app
from models import (
    Master,
    Service,
    User,
    UserRole,
    SalonMasterServiceSettings,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


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
def test_service(db, test_master):
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
        "/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def master_headers(client, test_master):
    response = client.post(
        "/auth/login",
        json={"phone": test_master.user.phone, "password": "testpassword"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_booking(auth_headers, test_service, test_master):
    booking_data = {
        "service_id": test_service.id,
        "master_id": test_master.id,
        "start_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=1, hours=1)).isoformat(),
        "status": "pending",
    }
    if test_service.salon_id:
        booking_data["salon_id"] = test_service.salon_id
    response = client.post("/bookings/", json=booking_data, headers=auth_headers)
    if response.status_code != 200:
        print("\nRESPONSE JSON:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["service_id"] == booking_data["service_id"]
    assert data["master_id"] == booking_data["master_id"]


def test_get_bookings(auth_headers):
    response = client.get("/bookings/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_update_booking(auth_headers, test_service, test_master, db):
    service_id = test_service.id
    master_id = test_master.id
    salon_id = getattr(test_service, "salon_id", None)

    booking_data = {
        "service_id": service_id,
        "master_id": master_id,
        "start_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=1, hours=1)).isoformat(),
        "status": "pending",
    }
    if salon_id:
        booking_data["salon_id"] = salon_id
    response = client.post("/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    update_data = {
        "service_id": service_id,
        "master_id": master_id,
        "start_time": (datetime.now() + timedelta(days=2)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=2, hours=1)).isoformat(),
        "status": "confirmed",
    }
    if salon_id:
        update_data["salon_id"] = salon_id

    response = client.put(
        f"/bookings/{booking_id}", json=update_data, headers=auth_headers
    )
    if response.status_code != 200:
        print("Ошибка обновления бронирования:", response.status_code, response.json())
    assert response.status_code == 200
    updated_booking = response.json()
    assert updated_booking["status"] == "confirmed"
    assert updated_booking["start_time"] == update_data["start_time"]
    assert updated_booking["end_time"] == update_data["end_time"]


def test_delete_booking(auth_headers, test_service, test_master):
    booking_data = {
        "service_id": test_service.id,
        "master_id": test_master.id,
        "start_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=1, hours=1)).isoformat(),
        "status": "pending",
    }
    if test_service.salon_id:
        booking_data["salon_id"] = test_service.salon_id
    response = client.post("/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    response = client.delete(f"/bookings/{booking_id}", headers=auth_headers)
    assert response.status_code == 200
    response = client.get(f"/bookings/{booking_id}", headers=auth_headers)
    assert response.status_code == 404


def test_create_edit_request(auth_headers, test_service, test_master):
    booking_data = {
        "service_id": test_service.id,
        "master_id": test_master.id,
        "start_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=1, hours=1)).isoformat(),
        "status": "pending",
    }
    if test_service.salon_id:
        booking_data["salon_id"] = test_service.salon_id
    response = client.post("/bookings/", json=booking_data, headers=auth_headers)
    booking_id = response.json()["id"]

    edit_request_data = {
        "booking_id": booking_id,
        "proposed_start": (datetime.now() + timedelta(days=2)).isoformat(),
        "proposed_end": (datetime.now() + timedelta(days=2, hours=1)).isoformat(),
    }
    response = client.post(
        f"/bookings/{booking_id}/edit-requests",
        json=edit_request_data,
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"


def test_update_edit_request(master_headers, test_service, test_master):
    booking_data = {
        "service_id": test_service.id,
        "master_id": test_master.id,
        "start_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.now() + timedelta(days=1, hours=1)).isoformat(),
        "status": "pending",
    }
    if test_service.salon_id:
        booking_data["salon_id"] = test_service.salon_id
    response = client.post("/bookings/", json=booking_data, headers=master_headers)
    booking_id = response.json()["id"]

    edit_request_data = {
        "booking_id": booking_id,
        "proposed_start": (datetime.now() + timedelta(days=2)).isoformat(),
        "proposed_end": (datetime.now() + timedelta(days=2, hours=1)).isoformat(),
    }
    response = client.post(
        f"/bookings/{booking_id}/edit-requests",
        json=edit_request_data,
        headers=master_headers,
    )
    request_id = response.json()["id"]

    update_data = {"status": "accepted"}
    response = client.put(
        f"/bookings/edit-requests/{request_id}",
        json=update_data,
        headers=master_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "accepted"


def test_get_available_slots(master_headers):
    response = client.get(
        "/bookings/available-slots",
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

"""Regression coverage for the scoped authorization-hardening track."""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

import auth as auth_module
from auth import create_access_token
from models import (
    Booking,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    Master,
    Service,
    User,
    UserRole,
)
from schemas import UserCreate


def _headers(user: User) -> dict[str, str]:
    token = create_access_token({"sub": str(user.id), "role": user.role.value.upper()})
    return {"Authorization": f"Bearer {token}"}


def _user(db, *, role: UserRole, suffix: int) -> User:
    user = User(
        email=f"authorization-{suffix}@test.invalid",
        phone=f"+7900777{suffix:04d}",
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def authorization_world(db):
    client_a = _user(db, role=UserRole.CLIENT, suffix=1)
    client_b = _user(db, role=UserRole.CLIENT, suffix=2)
    master_a_user = _user(db, role=UserRole.MASTER, suffix=3)
    master_b_user = _user(db, role=UserRole.MASTER, suffix=4)
    admin = _user(db, role=UserRole.ADMIN, suffix=5)
    moderator = _user(db, role=UserRole.MODERATOR, suffix=6)

    master_a = Master(user_id=master_a_user.id, bio="", experience_years=0)
    master_b = Master(user_id=master_b_user.id, bio="", experience_years=0)
    service = Service(name="Authorization test service", duration=60, price=1000)
    db.add_all([master_a, master_b, service])
    db.flush()

    start = datetime.utcnow() + timedelta(days=7)
    booking_a = Booking(
        client_id=client_a.id,
        service_id=service.id,
        master_id=master_a.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=BookingStatus.CREATED.value,
    )
    booking_b = Booking(
        client_id=client_b.id,
        service_id=service.id,
        master_id=master_b.id,
        start_time=start + timedelta(hours=2),
        end_time=start + timedelta(hours=3),
        status=BookingStatus.CREATED.value,
    )
    db.add_all([booking_a, booking_b])
    db.flush()

    db.commit()

    return SimpleNamespace(
        client_a_headers=_headers(client_a),
        client_b_headers=_headers(client_b),
        master_a_headers=_headers(master_a_user),
        master_b_headers=_headers(master_b_user),
        admin_headers=_headers(admin),
        moderator_headers=_headers(moderator),
        master_a_phone=master_a_user.phone,
        master_a_id=master_a.id,
        service_id=service.id,
        booking_a_id=booking_a.id,
        booking_b_id=booking_b.id,
        booking_a_start=booking_a.start_time,
    )


@pytest.mark.parametrize("role", ["admin", "moderator", "indie"])
def test_common_registration_rejects_non_self_service_roles(client, db, role):
    suffix = {"admin": 91, "moderator": 92, "indie": 93}[role]
    phone = f"+7900888{suffix:04d}"

    response = client.post(
        "/api/auth/register",
        json={"phone": phone, "password": "local-regression-only", "role": role},
    )

    assert response.status_code == 422
    assert db.query(User).filter(User.phone == phone).first() is None


@pytest.mark.parametrize("role", [UserRole.CLIENT, UserRole.MASTER, UserRole.SALON])
def test_common_registration_schema_keeps_supported_self_service_roles(role):
    payload = UserCreate(phone="+79008880001", password="local-regression-only", role=role)
    assert payload.role == role


def test_core_admin_router_rejects_non_platform_role(client, authorization_world):
    world = authorization_world

    denied = client.get("/api/admin/blog/posts/999999", headers=world.master_a_headers)
    admin = client.get("/api/admin/blog/posts/999999", headers=world.admin_headers)
    moderator = client.get("/api/admin/blog/posts/999999", headers=world.moderator_headers)

    assert denied.status_code == 403
    assert admin.status_code == 404
    assert moderator.status_code == 404


def test_moderator_still_requires_endpoint_permission(client, authorization_world):
    world = authorization_world

    moderator = client.get("/api/admin/users", headers=world.moderator_headers)
    admin = client.get("/api/admin/users", headers=world.admin_headers)

    assert moderator.status_code == 403
    assert admin.status_code == 200


def test_generic_booking_reads_are_scoped_to_resource_parties(client, authorization_world):
    world = authorization_world

    client_rows = client.get("/api/bookings/", headers=world.client_a_headers)
    master_rows = client.get("/api/bookings/", headers=world.master_a_headers)
    other_client = client.get(f"/api/bookings/{world.booking_a_id}", headers=world.client_b_headers)
    other_master = client.get(f"/api/bookings/{world.booking_a_id}", headers=world.master_b_headers)
    platform_role = client.get(f"/api/bookings/{world.booking_a_id}", headers=world.admin_headers)

    assert client_rows.status_code == 200
    assert {row["id"] for row in client_rows.json()} == {world.booking_a_id}
    assert master_rows.status_code == 200
    assert {row["id"] for row in master_rows.json()} == {world.booking_a_id}
    assert other_client.status_code == 403
    assert other_master.status_code == 403
    assert platform_role.status_code == 403


def test_generic_booking_delete_rejects_non_owner(client, db, authorization_world):
    world = authorization_world

    for headers in (world.client_b_headers, world.master_b_headers, world.admin_headers):
        response = client.delete(f"/api/bookings/{world.booking_a_id}", headers=headers)
        assert response.status_code == 403

    assert db.query(Booking).filter(Booking.id == world.booking_a_id).first() is not None


def test_generic_booking_create_requires_client_role(client, authorization_world):
    world = authorization_world
    start = world.booking_a_start + timedelta(days=5)
    payload = {
        "service_id": world.service_id,
        "master_id": world.master_a_id,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "client_name": "Authorization test client",
        "service_name": "Authorization test service",
        "service_duration": 60,
        "service_price": 1000,
    }

    response = client.post("/api/bookings/", json=payload, headers=world.master_a_headers)

    assert response.status_code == 403


def test_edit_request_creation_is_client_owned(client, authorization_world):
    world = authorization_world
    proposed_start = world.booking_a_start + timedelta(days=2)
    payload = {
        "booking_id": world.booking_a_id,
        "proposed_start": proposed_start.isoformat(),
        "proposed_end": (proposed_start + timedelta(hours=1)).isoformat(),
    }

    denied = client.post(
        f"/api/bookings/{world.booking_a_id}/edit-requests",
        json=payload,
        headers=world.client_b_headers,
    )
    allowed = client.post(
        f"/api/bookings/{world.booking_a_id}/edit-requests",
        json=payload,
        headers=world.client_a_headers,
    )

    assert denied.status_code == 403
    assert allowed.status_code == 200


def test_edit_request_decision_is_professional_owner_only(client, db, authorization_world):
    world = authorization_world
    edit_request = BookingEditRequest(
        booking_id=world.booking_a_id,
        proposed_start=world.booking_a_start + timedelta(days=1),
        proposed_end=world.booking_a_start + timedelta(days=1, hours=1),
        status=EditRequestStatus.PENDING,
    )
    db.add(edit_request)
    db.commit()
    path = f"/api/bookings/edit-requests/{edit_request.id}"

    client_side = client.put(path, json={"status": "accepted"}, headers=world.client_a_headers)
    other_master = client.put(path, json={"status": "accepted"}, headers=world.master_b_headers)
    owner_master = client.put(path, json={"status": "accepted"}, headers=world.master_a_headers)

    assert client_side.status_code == 403
    assert other_master.status_code == 403
    assert owner_master.status_code == 200
    assert owner_master.json()["status"] == "accepted"


def test_demo_identity_cannot_mutate_generic_booking(client, monkeypatch, authorization_world):
    world = authorization_world
    monkeypatch.setattr(
        auth_module,
        "get_settings",
        lambda: SimpleNamespace(DEMO_MASTER_PHONE=world.master_a_phone),
    )

    response = client.delete(
        f"/api/bookings/{world.booking_a_id}",
        headers=world.master_a_headers,
    )

    assert response.status_code == 403

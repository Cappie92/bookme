"""Security regression: object-scope on generic Booking GET/PUT/edit-requests.

Uses a unique temp SQLite file, not shared ./test.db.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from auth import get_current_user, get_password_hash
from database import Base, get_db
from main import app
from models import (
    Booking,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    IndieMaster,
    Master,
    Salon,
    SalonBranch,
    Service,
    User,
    UserRole,
)
from utils.booking_object_scope import assert_booking_object_scope


@pytest.fixture
def iso_db_path():
    fd, path = tempfile.mkstemp(prefix="booking_object_scope_", suffix=".sqlite")
    os.close(fd)
    os.unlink(path)
    yield path
    for suffix in ("", "-wal", "-shm", "-journal"):
        p = path + suffix if suffix else path
        if os.path.exists(p):
            try:
                os.unlink(p)
            except OSError:
                pass


@pytest.fixture
def iso_engine(iso_db_path):
    engine = create_engine(
        f"sqlite:///{iso_db_path}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def IsoSession(iso_engine):
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=iso_engine,
    )


def _user(email, phone, role, name):
    return User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name=name,
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )


def _booking(
    *,
    client_id,
    service_id,
    master_id=None,
    indie_master_id=None,
    salon_id=None,
    branch_id=None,
    notes="orig-notes",
    status=BookingStatus.CREATED.value,
    days=3,
    hour=12,
):
    start = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=days)
    start = start.replace(hour=hour)
    return Booking(
        client_id=client_id,
        service_id=service_id,
        master_id=master_id,
        indie_master_id=indie_master_id,
        salon_id=salon_id,
        branch_id=branch_id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=status,
        notes=notes,
        payment_amount=1000.0,
    )


@pytest.fixture
def world(IsoSession):
    db = IsoSession()
    try:
        client_a = _user("scope.ca@example.com", "+79008001001", UserRole.CLIENT, "Client A")
        client_b = _user("scope.cb@example.com", "+79008001002", UserRole.CLIENT, "Client B")
        master_a_user = _user("scope.ma@example.com", "+79008001003", UserRole.MASTER, "Master A")
        master_b_user = _user("scope.mb@example.com", "+79008001004", UserRole.MASTER, "Master B")
        salon_a_user = _user("scope.sa@example.com", "+79008001005", UserRole.SALON, "Salon A")
        salon_b_user = _user("scope.sb@example.com", "+79008001006", UserRole.SALON, "Salon B")
        mgr_user = _user("scope.mgr@example.com", "+79008001007", UserRole.SALON, "Branch Mgr")
        indie_a_user = _user("scope.ia@example.com", "+79008001008", UserRole.INDIE, "Indie A")
        indie_b_user = _user("scope.ib@example.com", "+79008001009", UserRole.INDIE, "Indie B")
        admin = _user("scope.admin@example.com", "+79008001010", UserRole.ADMIN, "Admin")
        moderator = _user("scope.mod@example.com", "+79008001011", UserRole.MODERATOR, "Moderator")
        db.add_all(
            [
                client_a,
                client_b,
                master_a_user,
                master_b_user,
                salon_a_user,
                salon_b_user,
                mgr_user,
                indie_a_user,
                indie_b_user,
                admin,
                moderator,
            ]
        )
        db.commit()
        for u in (
            client_a,
            client_b,
            master_a_user,
            master_b_user,
            salon_a_user,
            salon_b_user,
            mgr_user,
            indie_a_user,
            indie_b_user,
            admin,
            moderator,
        ):
            db.refresh(u)

        master_a = Master(user_id=master_a_user.id, bio="a", experience_years=1)
        master_b = Master(user_id=master_b_user.id, bio="b", experience_years=1)
        indie_master_row_a = Master(user_id=indie_a_user.id, bio="ia", experience_years=1)
        indie_master_row_b = Master(user_id=indie_b_user.id, bio="ib", experience_years=1)
        db.add_all([master_a, master_b, indie_master_row_a, indie_master_row_b])
        db.commit()
        for m in (master_a, master_b, indie_master_row_a, indie_master_row_b):
            db.refresh(m)

        salon_a = Salon(user_id=salon_a_user.id, name="Salon A", domain="scope-salon-a")
        salon_b = Salon(user_id=salon_b_user.id, name="Salon B", domain="scope-salon-b")
        db.add_all([salon_a, salon_b])
        db.commit()
        db.refresh(salon_a)
        db.refresh(salon_b)

        branch_a = SalonBranch(
            salon_id=salon_a.id,
            name="Branch A",
            manager_id=mgr_user.id,
        )
        db.add(branch_a)
        db.commit()
        db.refresh(branch_a)

        indie_a = IndieMaster(
            user_id=indie_a_user.id,
            master_id=indie_master_row_a.id,
            domain="scope-indie-a",
        )
        indie_b = IndieMaster(
            user_id=indie_b_user.id,
            master_id=indie_master_row_b.id,
            domain="scope-indie-b",
        )
        db.add_all([indie_a, indie_b])
        db.commit()
        db.refresh(indie_a)
        db.refresh(indie_b)

        service = Service(name="Scope Service", price=1000, duration=60, salon_id=None)
        db.add(service)
        db.commit()
        db.refresh(service)

        booking_a = _booking(
            client_id=client_a.id,
            service_id=service.id,
            master_id=master_a.id,
            salon_id=salon_a.id,
            branch_id=branch_a.id,
            notes="notes-a",
            days=3,
            hour=10,
        )
        booking_b = _booking(
            client_id=client_b.id,
            service_id=service.id,
            master_id=master_b.id,
            salon_id=salon_b.id,
            notes="notes-b",
            status=BookingStatus.CONFIRMED.value,
            days=4,
            hour=11,
        )
        booking_indie_a = _booking(
            client_id=client_a.id,
            service_id=service.id,
            master_id=indie_master_row_a.id,
            indie_master_id=indie_a.id,
            notes="notes-indie-a",
            days=5,
            hour=12,
        )
        booking_indie_b = _booking(
            client_id=client_b.id,
            service_id=service.id,
            master_id=indie_master_row_b.id,
            indie_master_id=indie_b.id,
            notes="notes-indie-b",
            days=6,
            hour=13,
        )
        booking_salon_a_no_branch = _booking(
            client_id=client_a.id,
            service_id=service.id,
            master_id=master_a.id,
            salon_id=salon_a.id,
            branch_id=None,
            notes="notes-salon-a-no-branch",
            days=7,
            hour=9,
        )
        booking_indie_by_indie_id = _booking(
            client_id=client_a.id,
            service_id=service.id,
            master_id=master_a.id,
            indie_master_id=indie_a.id,
            notes="notes-indie-by-indie-id",
            days=7,
            hour=14,
        )
        booking_indie_by_master_id = _booking(
            client_id=client_a.id,
            service_id=service.id,
            master_id=indie_master_row_a.id,
            indie_master_id=None,
            notes="notes-indie-by-master-id",
            days=7,
            hour=15,
        )
        db.add_all(
            [
                booking_a,
                booking_b,
                booking_indie_a,
                booking_indie_b,
                booking_salon_a_no_branch,
                booking_indie_by_indie_id,
                booking_indie_by_master_id,
            ]
        )
        db.commit()
        for b in (
            booking_a,
            booking_b,
            booking_indie_a,
            booking_indie_b,
            booking_salon_a_no_branch,
            booking_indie_by_indie_id,
            booking_indie_by_master_id,
        ):
            db.refresh(b)

        db.expunge_all()
        return {
            "client_a": client_a,
            "client_b": client_b,
            "master_a_user": master_a_user,
            "master_b_user": master_b_user,
            "master_a": master_a,
            "master_b": master_b,
            "salon_a_user": salon_a_user,
            "salon_b_user": salon_b_user,
            "mgr_user": mgr_user,
            "indie_a_user": indie_a_user,
            "indie_b_user": indie_b_user,
            "admin": admin,
            "moderator": moderator,
            "salon_a": salon_a,
            "salon_b": salon_b,
            "branch_a": branch_a,
            "indie_a": indie_a,
            "indie_b": indie_b,
            "service": service,
            "booking_a": booking_a,
            "booking_b": booking_b,
            "booking_indie_a": booking_indie_a,
            "booking_indie_b": booking_indie_b,
            "booking_salon_a_no_branch": booking_salon_a_no_branch,
            "booking_indie_by_indie_id": booking_indie_by_indie_id,
            "booking_indie_by_master_id": booking_indie_by_master_id,
        }
    finally:
        db.close()


@pytest.fixture
def iso_client(iso_engine, IsoSession):
    def override_get_db():
        db = IsoSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def _headers(iso_client, phone):
    r = iso_client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _snapshot(booking: Booking) -> dict:
    return {
        "notes": booking.notes,
        "status": booking.status,
        "master_id": booking.master_id,
        "service_id": booking.service_id,
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "client_id": booking.client_id,
        "salon_id": booking.salon_id,
        "indie_master_id": booking.indie_master_id,
    }


def _reload(IsoSession, booking_id: int) -> Booking:
    db = IsoSession()
    try:
        row = db.query(Booking).filter(Booking.id == booking_id).first()
        assert row is not None
        _ = (
            row.notes,
            row.status,
            row.master_id,
            row.service_id,
            row.start_time,
            row.end_time,
        )
        db.expunge(row)
        return row
    finally:
        db.close()


def _count_requests(IsoSession, booking_id: int) -> int:
    db = IsoSession()
    try:
        return (
            db.query(BookingEditRequest)
            .filter(BookingEditRequest.booking_id == booking_id)
            .count()
        )
    finally:
        db.close()


def _load_request(IsoSession, request_id: int) -> BookingEditRequest:
    db = IsoSession()
    try:
        row = db.query(BookingEditRequest).filter(BookingEditRequest.id == request_id).first()
        assert row is not None
        _ = (row.status, row.proposed_start, row.proposed_end, row.booking_id)
        db.expunge(row)
        return row
    finally:
        db.close()


def _put_tamper_payload(world, booking: Booking) -> dict:
    new_start = booking.start_time + timedelta(days=10)
    return {
        "notes": "tampered-notes",
        "status": "completed",
        "master_id": world["master_b"].id,
        "service_id": world["service"].id,
        "start_time": new_start.isoformat(),
        "end_time": (new_start + timedelta(hours=2)).isoformat(),
    }


def _assert_not_leaking_booking(response, booking: Booking):
    assert response.status_code == 404, response.text
    body = response.json()
    assert body.get("detail") == "Бронирование не найдено"
    dumped = str(body)
    assert booking.notes not in dumped
    assert "applied_discount" not in dumped


def _edit_payload(booking_id: int, days=8):
    start = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=days)
    start = start.replace(hour=16)
    return {
        "booking_id": booking_id,
        "proposed_start": start.isoformat(),
        "proposed_end": (start + timedelta(hours=1)).isoformat(),
    }


# --- Helper contract ---


def test_helper_deny_by_default_unknown_and_privileged_roles(IsoSession, world):
    db = IsoSession()
    try:
        booking = db.query(Booking).filter(Booking.id == world["booking_a"].id).first()
        for role in (UserRole.ADMIN, UserRole.MODERATOR, "superadmin", "", None):
            user = SimpleNamespace(id=world["admin"].id, role=role)
            with pytest.raises(HTTPException) as exc:
                assert_booking_object_scope(db, user, booking)
            assert exc.value.status_code == 404
            assert exc.value.detail == "Бронирование не найдено"
    finally:
        db.close()


def test_helper_indie_unrelated_denied_without_profile(IsoSession, world):
    db = IsoSession()
    try:
        booking = db.query(Booking).filter(Booking.id == world["booking_a"].id).first()
        orphan = SimpleNamespace(id=999999, role=UserRole.INDIE)
        with pytest.raises(HTTPException) as exc:
            assert_booking_object_scope(db, orphan, booking)
        assert exc.value.status_code == 404
    finally:
        db.close()


# --- GET / PUT role matrix ---


@pytest.mark.parametrize(
    "user_key,booking_key,expected",
    [
        ("client_a", "booking_a", 200),
        ("client_a", "booking_b", 404),
        ("master_a_user", "booking_a", 200),
        ("master_a_user", "booking_b", 404),
        ("salon_a_user", "booking_a", 200),
        ("salon_a_user", "booking_b", 404),
        ("mgr_user", "booking_a", 200),
        ("mgr_user", "booking_b", 404),
        ("indie_a_user", "booking_indie_a", 200),
        ("indie_a_user", "booking_indie_b", 404),
        ("indie_a_user", "booking_a", 404),
        ("admin", "booking_a", 404),
        ("moderator", "booking_a", 404),
    ],
)
def test_get_object_scope(iso_client, world, user_key, booking_key, expected):
    headers = _headers(iso_client, world[user_key].phone)
    booking = world[booking_key]
    r = iso_client.get(f"/api/bookings/{booking.id}", headers=headers)
    if expected == 200:
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == booking.id
        assert data["client_id"] == booking.client_id
        assert data["service_id"] == booking.service_id
        assert data["master_id"] == booking.master_id
        assert data["notes"] == booking.notes
        assert data["status"] == booking.status
        assert "applied_discount" in data
    else:
        _assert_not_leaking_booking(r, booking)


@pytest.mark.parametrize(
    "user_key,booking_key,expected",
    [
        ("client_a", "booking_a", 200),
        ("client_a", "booking_b", 404),
        ("master_a_user", "booking_a", 200),
        ("master_a_user", "booking_b", 404),
        ("salon_a_user", "booking_a", 200),
        ("salon_a_user", "booking_b", 404),
        ("mgr_user", "booking_a", 200),
        ("indie_a_user", "booking_indie_a", 200),
        ("indie_a_user", "booking_indie_b", 404),
        ("indie_a_user", "booking_a", 404),
        ("admin", "booking_a", 404),
        ("moderator", "booking_a", 404),
    ],
)
def test_put_object_scope(iso_client, IsoSession, world, user_key, booking_key, expected):
    headers = _headers(iso_client, world[user_key].phone)
    booking = world[booking_key]
    before = _snapshot(_reload(IsoSession, booking.id))
    if expected == 200:
        r = iso_client.put(
            f"/api/bookings/{booking.id}",
            json={"notes": f"ok-{user_key}"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == f"ok-{user_key}"
        assert r.json()["id"] == booking.id
        assert r.json()["status"] == before["status"]
    else:
        r = iso_client.put(
            f"/api/bookings/{booking.id}",
            json=_put_tamper_payload(world, booking),
            headers=headers,
        )
        _assert_not_leaking_booking(r, booking)
        after = _snapshot(_reload(IsoSession, booking.id))
        assert after == before


def test_unknown_role_get_put_404(iso_client, IsoSession, world):
    booking = world["booking_a"]
    before = _snapshot(_reload(IsoSession, booking.id))

    async def _unknown():
        return SimpleNamespace(id=world["admin"].id, role="unknown_role")

    app.dependency_overrides[get_current_user] = _unknown
    try:
        r_get = iso_client.get(f"/api/bookings/{booking.id}")
        r_put = iso_client.put(
            f"/api/bookings/{booking.id}",
            json=_put_tamper_payload(world, booking),
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    _assert_not_leaking_booking(r_get, booking)
    _assert_not_leaking_booking(r_put, booking)
    assert _snapshot(_reload(IsoSession, booking.id)) == before


# --- Auth ---


def test_get_put_without_jwt_401(iso_client, world):
    bid = world["booking_a"].id
    assert iso_client.get(f"/api/bookings/{bid}").status_code == 401
    assert iso_client.put(f"/api/bookings/{bid}", json={"notes": "x"}).status_code == 401


def test_get_put_invalid_jwt_401(iso_client, world):
    headers = {"Authorization": "Bearer not-a-valid-jwt"}
    bid = world["booking_a"].id
    assert iso_client.get(f"/api/bookings/{bid}", headers=headers).status_code == 401
    assert (
        iso_client.put(f"/api/bookings/{bid}", json={"notes": "x"}, headers=headers).status_code
        == 401
    )


def test_nonexistent_booking_404(iso_client, world):
    headers = _headers(iso_client, world["client_a"].phone)
    r = iso_client.get("/api/bookings/999999", headers=headers)
    assert r.status_code == 404
    r = iso_client.put("/api/bookings/999999", json={"notes": "x"}, headers=headers)
    assert r.status_code == 404


# --- PUT denial is pre-setattr ---


def test_put_denial_leaves_row_value_equivalent(iso_client, IsoSession, world):
    booking = world["booking_a"]
    before = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, world["client_b"].phone)
    r = iso_client.put(
        f"/api/bookings/{booking.id}",
        json=_put_tamper_payload(world, booking),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    after = _snapshot(_reload(IsoSession, booking.id))
    assert after == before
    assert after["notes"] == "notes-a"
    assert after["status"] == BookingStatus.CREATED.value
    assert after["master_id"] == world["master_a"].id
    assert after["service_id"] == world["service"].id


def test_put_admin_and_moderator_do_not_mutate(iso_client, IsoSession, world):
    booking = world["booking_a"]
    for key in ("admin", "moderator"):
        before = _snapshot(_reload(IsoSession, booking.id))
        headers = _headers(iso_client, world[key].phone)
        r = iso_client.put(
            f"/api/bookings/{booking.id}",
            json=_put_tamper_payload(world, booking),
            headers=headers,
        )
        _assert_not_leaking_booking(r, booking)
        assert _snapshot(_reload(IsoSession, booking.id)) == before


# --- Edit-request create ---


def test_edit_request_create_party_success(iso_client, world):
    headers = _headers(iso_client, world["client_a"].phone)
    r = iso_client.post(
        f"/api/bookings/{world['booking_a'].id}/edit-requests",
        json=_edit_payload(world["booking_a"].id),
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == EditRequestStatus.PENDING.value
    assert data["booking_id"] == world["booking_a"].id


@pytest.mark.parametrize(
    "user_key",
    ["client_b", "master_b_user", "salon_b_user", "indie_b_user", "admin", "moderator"],
)
def test_edit_request_create_denied_does_not_insert(iso_client, IsoSession, world, user_key):
    booking = world["booking_a"]
    before = _count_requests(IsoSession, booking.id)
    headers = _headers(iso_client, world[user_key].phone)
    r = iso_client.post(
        f"/api/bookings/{booking.id}/edit-requests",
        json=_edit_payload(booking.id, days=9),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    assert _count_requests(IsoSession, booking.id) == before


# --- Edit-request process ---


def _pending_request(IsoSession, booking: Booking, days=11) -> BookingEditRequest:
    db = IsoSession()
    try:
        start = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=days)
        start = start.replace(hour=17)
        req = BookingEditRequest(
            booking_id=booking.id,
            proposed_start=start,
            proposed_end=start + timedelta(hours=1),
            status=EditRequestStatus.PENDING,
        )
        db.add(req)
        db.commit()
        db.refresh(req)
        db.expunge(req)
        return req
    finally:
        db.close()


def test_edit_request_process_party_success(iso_client, IsoSession, world):
    booking = world["booking_a"]
    req = _pending_request(IsoSession, booking)
    headers = _headers(iso_client, world["client_a"].phone)
    r = iso_client.put(
        f"/api/bookings/edit-requests/{req.id}",
        json={"status": "accepted"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == EditRequestStatus.ACCEPTED.value
    after = _reload(IsoSession, booking.id)
    assert after.start_time == req.proposed_start
    assert after.end_time == req.proposed_end


@pytest.mark.parametrize("user_key", ["client_b", "admin", "moderator"])
def test_edit_request_process_denied_does_not_mutate(iso_client, IsoSession, world, user_key):
    booking = world["booking_a"]
    req = _pending_request(IsoSession, booking, days=12)
    before_booking = _snapshot(_reload(IsoSession, booking.id))
    before_req = _load_request(IsoSession, req.id)
    headers = _headers(iso_client, world[user_key].phone)
    r = iso_client.put(
        f"/api/bookings/edit-requests/{req.id}",
        json={"status": "accepted"},
        headers=headers,
    )
    assert r.status_code == 404, r.text
    after_booking = _snapshot(_reload(IsoSession, booking.id))
    after_req = _load_request(IsoSession, req.id)
    assert after_booking == before_booking
    assert after_req.status == before_req.status == EditRequestStatus.PENDING
    assert after_booking["start_time"] == before_booking["start_time"]
    assert after_booking["end_time"] == before_booking["end_time"]


# --- Isolated IDOR replay from the audit ---


def test_idor_moderator_get_put_foreign(iso_client, IsoSession, world):
    booking = world["booking_b"]
    before = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, world["moderator"].phone)
    _assert_not_leaking_booking(iso_client.get(f"/api/bookings/{booking.id}", headers=headers), booking)
    r = iso_client.put(
        f"/api/bookings/{booking.id}",
        json=_put_tamper_payload(world, booking),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    assert _snapshot(_reload(IsoSession, booking.id)) == before


def test_idor_admin_get_put_foreign(iso_client, IsoSession, world):
    booking = world["booking_b"]
    before = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, world["admin"].phone)
    _assert_not_leaking_booking(iso_client.get(f"/api/bookings/{booking.id}", headers=headers), booking)
    r = iso_client.put(
        f"/api/bookings/{booking.id}",
        json=_put_tamper_payload(world, booking),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    assert _snapshot(_reload(IsoSession, booking.id)) == before


def test_idor_indie_get_put_unrelated(iso_client, IsoSession, world):
    booking = world["booking_indie_b"]
    before = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, world["indie_a_user"].phone)
    _assert_not_leaking_booking(iso_client.get(f"/api/bookings/{booking.id}", headers=headers), booking)
    r = iso_client.put(
        f"/api/bookings/{booking.id}",
        json=_put_tamper_payload(world, booking),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    assert _snapshot(_reload(IsoSession, booking.id)) == before


def test_idor_client_b_create_edit_request_on_client_a(iso_client, IsoSession, world):
    booking = world["booking_a"]
    before = _count_requests(IsoSession, booking.id)
    headers = _headers(iso_client, world["client_b"].phone)
    r = iso_client.post(
        f"/api/bookings/{booking.id}/edit-requests",
        json=_edit_payload(booking.id, days=14),
        headers=headers,
    )
    _assert_not_leaking_booking(r, booking)
    assert _count_requests(IsoSession, booking.id) == before


def test_idor_client_b_accept_request_on_client_a(iso_client, IsoSession, world):
    booking = world["booking_a"]
    req = _pending_request(IsoSession, booking, days=15)
    before_booking = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, world["client_b"].phone)
    r = iso_client.put(
        f"/api/bookings/edit-requests/{req.id}",
        json={"status": "accepted"},
        headers=headers,
    )
    assert r.status_code == 404, r.text
    assert _snapshot(_reload(IsoSession, booking.id)) == before_booking
    assert _load_request(IsoSession, req.id).status == EditRequestStatus.PENDING


# --- Explicit branch-manager / indie / unknown-role contract ---


def _assert_get_put_allowed(iso_client, phone, booking):
    headers = _headers(iso_client, phone)
    r_get = iso_client.get(f"/api/bookings/{booking.id}", headers=headers)
    assert r_get.status_code == 200, r_get.text
    assert r_get.json()["id"] == booking.id
    r_put = iso_client.put(
        f"/api/bookings/{booking.id}",
        json={"notes": booking.notes},
        headers=headers,
    )
    assert r_put.status_code == 200, r_put.text
    assert r_put.json()["id"] == booking.id


def _assert_get_put_denied_unchanged(iso_client, IsoSession, world, phone, booking):
    before = _snapshot(_reload(IsoSession, booking.id))
    headers = _headers(iso_client, phone)
    r_get = iso_client.get(f"/api/bookings/{booking.id}", headers=headers)
    r_put = iso_client.put(
        f"/api/bookings/{booking.id}",
        json=_put_tamper_payload(world, booking),
        headers=headers,
    )
    _assert_not_leaking_booking(r_get, booking)
    _assert_not_leaking_booking(r_put, booking)
    assert _snapshot(_reload(IsoSession, booking.id)) == before


def test_branch_manager_own_branch_allows_get_put(iso_client, world):
    booking = world["booking_a"]
    assert booking.salon_id == world["salon_a"].id
    assert booking.branch_id == world["branch_a"].id
    _assert_get_put_allowed(iso_client, world["mgr_user"].phone, booking)


def test_branch_manager_same_salon_without_branch_id_allows_get_put(iso_client, world):
    booking = world["booking_salon_a_no_branch"]
    assert booking.salon_id == world["salon_a"].id
    assert booking.branch_id is None
    _assert_get_put_allowed(iso_client, world["mgr_user"].phone, booking)


def test_branch_manager_other_salon_get_put_404_unchanged(iso_client, IsoSession, world):
    booking = world["booking_b"]
    assert booking.salon_id == world["salon_b"].id
    assert booking.salon_id != world["salon_a"].id
    _assert_get_put_denied_unchanged(
        iso_client, IsoSession, world, world["mgr_user"].phone, booking
    )


def test_indie_related_via_indie_master_id_allows_get_put(iso_client, world):
    booking = world["booking_indie_by_indie_id"]
    assert booking.indie_master_id == world["indie_a"].id
    assert booking.master_id != world["indie_a"].master_id
    _assert_get_put_allowed(iso_client, world["indie_a_user"].phone, booking)


def test_indie_related_via_master_id_allows_get_put(iso_client, world):
    booking = world["booking_indie_by_master_id"]
    assert booking.master_id == world["indie_a"].master_id
    assert booking.indie_master_id is None
    _assert_get_put_allowed(iso_client, world["indie_a_user"].phone, booking)


def test_indie_unrelated_get_put_404_unchanged(iso_client, IsoSession, world):
    booking = world["booking_indie_b"]
    assert booking.indie_master_id == world["indie_b"].id
    assert booking.master_id != world["indie_a"].master_id
    _assert_get_put_denied_unchanged(
        iso_client, IsoSession, world, world["indie_a_user"].phone, booking
    )


def test_unknown_role_edit_request_create_and_process_404_unchanged(
    iso_client, IsoSession, world
):
    booking = world["booking_a"]
    req = _pending_request(IsoSession, booking, days=16)
    before_booking = _snapshot(_reload(IsoSession, booking.id))
    before_count = _count_requests(IsoSession, booking.id)
    before_req = _load_request(IsoSession, req.id)

    async def _unknown():
        return SimpleNamespace(id=world["admin"].id, role="unknown_role")

    app.dependency_overrides[get_current_user] = _unknown
    try:
        r_create = iso_client.post(
            f"/api/bookings/{booking.id}/edit-requests",
            json=_edit_payload(booking.id, days=17),
        )
        r_process = iso_client.put(
            f"/api/bookings/edit-requests/{req.id}",
            json={"status": "accepted"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    _assert_not_leaking_booking(r_create, booking)
    assert r_process.status_code == 404, r_process.text
    assert _count_requests(IsoSession, booking.id) == before_count
    assert _snapshot(_reload(IsoSession, booking.id)) == before_booking
    after_req = _load_request(IsoSession, req.id)
    assert after_req.status == before_req.status == EditRequestStatus.PENDING
    assert after_req.proposed_start == before_req.proposed_start
    assert after_req.proposed_end == before_req.proposed_end

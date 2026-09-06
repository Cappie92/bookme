"""Route-level reconciliation coverage for the current booking transaction model."""

from __future__ import annotations

from datetime import date, datetime, time as dtime, timedelta
from threading import Barrier, Lock, Thread

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from auth import get_password_hash
from database import Base, get_db
from main import app
from models import (
    AppliedDiscount,
    Booking,
    BookingStatus,
    Master,
    MasterSchedule,
    MasterService,
    Service,
    User,
    UserRole,
)


@pytest.fixture
def reconciliation_engine(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'booking-reconciliation.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 0.15},
        poolclass=NullPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def ReconciliationSession(reconciliation_engine):
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=reconciliation_engine,
    )


def _add_user(db, *, email: str, phone: str, role: UserRole) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword"),
        phone=phone,
        full_name=email.split("@", 1)[0],
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _add_master(db, *, user: User, domain: str) -> Master:
    master = Master(
        user_id=user.id,
        bio="reconciliation",
        experience_years=1,
        domain=domain,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(master)
    db.flush()
    for day_offset in range(1, 10):
        db.add(
            MasterSchedule(
                master_id=master.id,
                salon_id=None,
                date=date.today() + timedelta(days=day_offset),
                start_time=dtime(0, 0),
                end_time=dtime(23, 59),
                is_available=True,
            )
        )
    return master


@pytest.fixture
def reconciliation_world(ReconciliationSession):
    db = ReconciliationSession()
    try:
        owner_one = _add_user(
            db,
            email="reconciliation-master-1@test.local",
            phone="+79006100001",
            role=UserRole.MASTER,
        )
        owner_two = _add_user(
            db,
            email="reconciliation-master-2@test.local",
            phone="+79006100002",
            role=UserRole.MASTER,
        )
        client_one = _add_user(
            db,
            email="reconciliation-client-1@test.local",
            phone="+79006100003",
            role=UserRole.CLIENT,
        )
        client_two = _add_user(
            db,
            email="reconciliation-client-2@test.local",
            phone="+79006100004",
            role=UserRole.CLIENT,
        )
        master_one = _add_master(db, user=owner_one, domain="reconciliation-one")
        master_two = _add_master(db, user=owner_two, domain="reconciliation-two")
        client_service = Service(
            name="Reconciliation client service",
            duration=60,
            price=1000.0,
        )
        db.add(client_service)
        db.flush()
        public_service_a = MasterService(
            master_id=master_one.id,
            category_id=None,
            name="Reconciliation public service A",
            duration=60,
            price=1200.0,
        )
        public_service_b = MasterService(
            master_id=master_one.id,
            category_id=None,
            name="Reconciliation public service B",
            duration=60,
            price=1400.0,
        )
        second_master_service = MasterService(
            master_id=master_two.id,
            category_id=None,
            name="Reconciliation public service A",
            duration=60,
            price=1200.0,
        )
        db.add_all([public_service_a, public_service_b, second_master_service])
        db.commit()
        return {
            "master_one_id": master_one.id,
            "master_two_id": master_two.id,
            "client_one_id": client_one.id,
            "client_two_id": client_two.id,
            "client_one_phone": client_one.phone,
            "client_two_phone": client_two.phone,
            "client_service_id": client_service.id,
            "public_service_a_id": public_service_a.id,
            "public_service_b_id": public_service_b.id,
            "second_master_service_id": second_master_service.id,
            "master_one_slug": master_one.domain,
            "master_two_slug": master_two.domain,
        }
    finally:
        db.close()


@pytest.fixture
def reconciliation_client(reconciliation_engine, ReconciliationSession):
    def override_get_db():
        db = ReconciliationSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def _slot(*, day_offset: int, hour: int) -> tuple[datetime, datetime]:
    start = (datetime.now() + timedelta(days=day_offset)).replace(
        hour=hour,
        minute=0,
        second=0,
        microsecond=0,
    )
    return start, start + timedelta(hours=1)


def _login(client: TestClient, phone: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"phone": phone, "password": "testpassword"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _client_payload(world, start: datetime, end: datetime) -> dict:
    return {
        "client_name": "Reconciliation client",
        "service_name": "Reconciliation client service",
        "service_duration": 60,
        "service_price": 1000,
        "service_id": world["client_service_id"],
        "master_id": world["master_one_id"],
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }


def _public_payload(service_id: int, start: datetime, end: datetime) -> dict:
    return {
        "service_id": service_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }


def _concurrent_statuses(first, second) -> list[int]:
    barrier = Barrier(2)
    lock = Lock()
    statuses: list[int] = []

    def run(request):
        barrier.wait(timeout=5)
        response = request()
        with lock:
            statuses.append(response.status_code)

    threads = [Thread(target=run, args=(first,)), Thread(target=run, args=(second,))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    assert all(not thread.is_alive() for thread in threads)
    return sorted(statuses)


def _booking_count(ReconciliationSession, *, master_id: int) -> int:
    db = ReconciliationSession()
    try:
        return db.query(Booking).filter(Booking.master_id == master_id).count()
    finally:
        db.close()


def _canonical_service_count(ReconciliationSession, *, name: str) -> int:
    db = ReconciliationSession()
    try:
        return (
            db.query(Service)
            .filter(
                Service.name == name,
                Service.salon_id.is_(None),
                Service.indie_master_id.is_(None),
            )
            .count()
        )
    finally:
        db.close()


def test_public_master_http_same_slot_race_returns_one_success_and_one_conflict(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers_one = _login(reconciliation_client, world["client_one_phone"])
    headers_two = _login(reconciliation_client, world["client_two_phone"])
    start, end = _slot(day_offset=2, hour=10)
    url = f"/api/public/masters/{world['master_one_slug']}/bookings"
    payload = _public_payload(world["public_service_a_id"], start, end)

    statuses = _concurrent_statuses(
        lambda: reconciliation_client.post(url, json=payload, headers=headers_one),
        lambda: reconciliation_client.post(url, json=payload, headers=headers_two),
    )

    assert statuses == [200, 409]
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1


def test_authenticated_client_http_same_slot_race_returns_one_success_and_one_conflict(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers_one = _login(reconciliation_client, world["client_one_phone"])
    headers_two = _login(reconciliation_client, world["client_two_phone"])
    start, end = _slot(day_offset=3, hour=10)
    payload = _client_payload(world, start, end)

    statuses = _concurrent_statuses(
        lambda: reconciliation_client.post(
            "/api/client/bookings/", json=payload, headers=headers_one
        ),
        lambda: reconciliation_client.post(
            "/api/client/bookings/", json=payload, headers=headers_two
        ),
    )

    assert statuses == [200, 409]
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1


def test_sqlite_busy_http_contract_has_no_partial_side_effects(
    reconciliation_client,
    reconciliation_engine,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers = _login(reconciliation_client, world["client_one_phone"])
    start, end = _slot(day_offset=4, hour=10)
    before_bookings = _booking_count(
        ReconciliationSession, master_id=world["master_one_id"]
    )
    holder = reconciliation_engine.connect()
    holder.exec_driver_sql("BEGIN IMMEDIATE")
    try:
        response = reconciliation_client.post(
            "/api/client/bookings/",
            json=_client_payload(world, start, end),
            headers=headers,
        )
    finally:
        holder.rollback()
        holder.close()

    assert response.status_code == 503
    assert response.headers["Retry-After"] == "1"
    assert response.headers["X-Error-Code"] == "BOOKING_SLOT_BUSY"
    assert (
        _booking_count(ReconciliationSession, master_id=world["master_one_id"])
        == before_bookings
    )
    db = ReconciliationSession()
    try:
        assert db.query(AppliedDiscount).count() == 0
    finally:
        db.close()


def test_public_route_creates_canonical_service_with_booking(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers = _login(reconciliation_client, world["client_one_phone"])
    start, end = _slot(day_offset=5, hour=10)
    service_name = "Reconciliation public service A"

    assert _canonical_service_count(ReconciliationSession, name=service_name) == 0
    response = reconciliation_client.post(
        f"/api/public/masters/{world['master_one_slug']}/bookings",
        json=_public_payload(world["public_service_a_id"], start, end),
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["service_name"] == service_name
    assert _canonical_service_count(ReconciliationSession, name=service_name) == 1
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1


def test_slot_conflict_rolls_back_new_canonical_service(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    start, end = _slot(day_offset=6, hour=10)
    db = ReconciliationSession()
    try:
        db.add(
            Booking(
                client_id=world["client_one_id"],
                service_id=world["client_service_id"],
                master_id=world["master_one_id"],
                start_time=start,
                end_time=end,
                status=BookingStatus.CREATED.value,
                payment_amount=1000,
            )
        )
        db.commit()
    finally:
        db.close()
    headers = _login(reconciliation_client, world["client_two_phone"])
    service_name = "Reconciliation public service B"

    response = reconciliation_client.post(
        f"/api/public/masters/{world['master_one_slug']}/bookings",
        json=_public_payload(world["public_service_b_id"], start, end),
        headers=headers,
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "BOOKING_SLOT_CONFLICT"
    assert _canonical_service_count(ReconciliationSession, name=service_name) == 0
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1


def test_concurrent_public_routes_deduplicate_canonical_service(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers_one = _login(reconciliation_client, world["client_one_phone"])
    headers_two = _login(reconciliation_client, world["client_two_phone"])
    first_start, first_end = _slot(day_offset=7, hour=10)
    second_start, second_end = _slot(day_offset=7, hour=12)
    url = f"/api/public/masters/{world['master_one_slug']}/bookings"

    statuses = _concurrent_statuses(
        lambda: reconciliation_client.post(
            url,
            json=_public_payload(
                world["public_service_a_id"], first_start, first_end
            ),
            headers=headers_one,
        ),
        lambda: reconciliation_client.post(
            url,
            json=_public_payload(
                world["public_service_a_id"], second_start, second_end
            ),
            headers=headers_two,
        ),
    )

    assert statuses == [200, 200]
    assert (
        _canonical_service_count(
            ReconciliationSession, name="Reconciliation public service A"
        )
        == 1
    )
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 2


def test_different_services_same_master_conflict_without_orphan_service(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers_one = _login(reconciliation_client, world["client_one_phone"])
    headers_two = _login(reconciliation_client, world["client_two_phone"])
    start, end = _slot(day_offset=8, hour=10)
    url = f"/api/public/masters/{world['master_one_slug']}/bookings"

    first = reconciliation_client.post(
        url,
        json=_public_payload(world["public_service_a_id"], start, end),
        headers=headers_one,
    )
    second = reconciliation_client.post(
        url,
        json=_public_payload(world["public_service_b_id"], start, end),
        headers=headers_two,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 409
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1
    assert (
        _canonical_service_count(
            ReconciliationSession, name="Reconciliation public service B"
        )
        == 0
    )


def test_same_interval_is_allowed_for_different_masters(
    reconciliation_client,
    ReconciliationSession,
    reconciliation_world,
):
    world = reconciliation_world
    headers_one = _login(reconciliation_client, world["client_one_phone"])
    headers_two = _login(reconciliation_client, world["client_two_phone"])
    start, end = _slot(day_offset=9, hour=10)

    first = reconciliation_client.post(
        f"/api/public/masters/{world['master_one_slug']}/bookings",
        json=_public_payload(world["public_service_a_id"], start, end),
        headers=headers_one,
    )
    second = reconciliation_client.post(
        f"/api/public/masters/{world['master_two_slug']}/bookings",
        json=_public_payload(world["second_master_service_id"], start, end),
        headers=headers_two,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert _booking_count(ReconciliationSession, master_id=world["master_one_id"]) == 1
    assert _booking_count(ReconciliationSession, master_id=world["master_two_id"]) == 1

"""
PR1 regression: atomic Booking create + unified overlap predicate.

Uses a unique temp SQLite file (not shared ./test.db).
"""
from __future__ import annotations

import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, time as dtime

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
    OwnerType,
    Service,
    User,
    UserRole,
)
from services import booking_atomic_txn as booking_atomic_txn_mod
from services import booking_creation as booking_creation_mod
from services.booking_creation import (
    AppliedDiscountSnapshot,
    BookingCreateSnapshot,
    BookingSlotBusy,
    BookingSlotConflict,
    CanonicalServiceSnapshot,
    PublicClientSnapshot,
    create_booking_atomic,
    has_overlapping_booking,
)


@pytest.fixture
def iso_db_path():
    fd, path = tempfile.mkstemp(prefix="booking_atomic_pr1_", suffix=".sqlite")
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
    return sessionmaker(autocommit=False, autoflush=False, bind=iso_engine)


@pytest.fixture
def iso_seed(IsoSession):
    db = IsoSession()
    try:
        mu = User(
            email="pr1.master@example.com",
            hashed_password=get_password_hash("testpassword"),
            phone="+79006001001",
            full_name="PR1 Master",
            role=UserRole.MASTER,
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        c1 = User(
            email="pr1.c1@example.com",
            hashed_password=get_password_hash("testpassword"),
            phone="+79006001002",
            full_name="PR1 C1",
            role=UserRole.CLIENT,
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        c2 = User(
            email="pr1.c2@example.com",
            hashed_password=get_password_hash("testpassword"),
            phone="+79006001003",
            full_name="PR1 C2",
            role=UserRole.CLIENT,
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        db.add_all([mu, c1, c2])
        db.commit()
        for u in (mu, c1, c2):
            db.refresh(u)
        master = Master(
            user_id=mu.id,
            bio="pr1",
            experience_years=1,
            domain="pr1-slug",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
            city="Москва",
        )
        db.add(master)
        db.commit()
        db.refresh(master)
        service = Service(name="PR1 Cut", duration=60, price=1000.0)
        db.add(service)
        db.commit()
        db.refresh(service)
        msvc = MasterService(
            master_id=master.id,
            category_id=None,
            name=service.name,
            duration=service.duration,
            price=service.price,
        )
        db.add(msvc)
        for d_off in range(1, 16):
            db.add(
                MasterSchedule(
                    master_id=master.id,
                    salon_id=None,
                    date=date.today() + timedelta(days=d_off),
                    start_time=dtime(0, 0),
                    end_time=dtime(23, 59),
                    is_available=True,
                )
            )
        db.commit()
        db.refresh(msvc)
        return {
            "master_id": master.id,
            "service_id": service.id,
            "msvc_id": msvc.id,
            "c1_id": c1.id,
            "c2_id": c2.id,
            "c1_phone": c1.phone,
            "c2_phone": c2.phone,
            "slug": "pr1-slug",
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


def _slot(day=3, hour=12, minutes=60):
    start = datetime.now().replace(minute=0, second=0, microsecond=0)
    start = (start + timedelta(days=day)).replace(hour=hour)
    return start, start + timedelta(minutes=minutes)


def _snapshot(seed, client_id, start, end, **kwargs):
    return BookingCreateSnapshot(
        client_id=client_id,
        service_id=seed["service_id"],
        master_id=seed["master_id"],
        start_time=start,
        end_time=end,
        status=BookingStatus.CREATED.value,
        payment_amount=1000.0,
        owner_type=OwnerType.MASTER,
        owner_id=seed["master_id"],
        **kwargs,
    )


def _count(IsoSession, master_id, start, end):
    db = IsoSession()
    try:
        return (
            db.query(Booking)
            .filter(
                Booking.master_id == master_id,
                Booking.start_time < end,
                Booking.end_time > start,
            )
            .count()
        )
    finally:
        db.close()


def _login(client, phone):
    r = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _api_bookings_payload(seed, start, end):
    return {
        "client_name": "C",
        "service_name": "PR1 Cut",
        "service_duration": 60,
        "service_price": 1000,
        "service_id": seed["service_id"],
        "master_id": seed["master_id"],
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }


def test_has_overlapping_interval_matrix(IsoSession, iso_seed):
    db = IsoSession()
    start, end = _slot(3, 10, 60)
    db.add(
        Booking(
            client_id=iso_seed["c1_id"],
            service_id=iso_seed["service_id"],
            master_id=iso_seed["master_id"],
            start_time=start,
            end_time=end,
            status=BookingStatus.CREATED.value,
            payment_amount=1000.0,
        )
    )
    db.commit()
    mid = iso_seed["master_id"]
    assert has_overlapping_booking(db, start, end, OwnerType.MASTER, mid) is True
    assert has_overlapping_booking(
        db, start, start + timedelta(minutes=90), OwnerType.MASTER, mid
    ) is True
    assert has_overlapping_booking(
        db,
        start + timedelta(minutes=30),
        start + timedelta(minutes=90),
        OwnerType.MASTER,
        mid,
    ) is True
    assert has_overlapping_booking(
        db,
        start - timedelta(minutes=30),
        start + timedelta(minutes=30),
        OwnerType.MASTER,
        mid,
    ) is True
    assert has_overlapping_booking(
        db,
        start + timedelta(minutes=15),
        start + timedelta(minutes=45),
        OwnerType.MASTER,
        mid,
    ) is True
    assert has_overlapping_booking(db, end, end + timedelta(hours=1), OwnerType.MASTER, mid) is False
    cancelled = Booking(
        client_id=iso_seed["c2_id"],
        service_id=iso_seed["service_id"],
        master_id=iso_seed["master_id"],
        start_time=start + timedelta(days=1),
        end_time=end + timedelta(days=1),
        status=BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        payment_amount=1000.0,
    )
    db.add(cancelled)
    db.commit()
    assert (
        has_overlapping_booking(
            db,
            cancelled.start_time,
            cancelled.end_time,
            OwnerType.MASTER,
            mid,
        )
        is False
    )
    db.close()


def test_atomic_race_one_booking(iso_engine, IsoSession, iso_seed):
    start, end = _slot(4, 11)
    barrier = threading.Barrier(2)
    outcomes = {}

    def hook():
        barrier.wait(timeout=10)

    booking_atomic_txn_mod.before_begin_hook = hook
    try:

        def worker(key, client_id):
            try:
                create_booking_atomic(
                    _snapshot(iso_seed, client_id, start, end), bind=iso_engine
                )
                outcomes[key] = "ok"
            except BookingSlotConflict:
                outcomes[key] = "conflict"
            except Exception as exc:
                outcomes[key] = f"err:{type(exc).__name__}"

        with ThreadPoolExecutor(2) as ex:
            futs = [
                ex.submit(worker, "a", iso_seed["c1_id"]),
                ex.submit(worker, "b", iso_seed["c2_id"]),
            ]
            for f in as_completed(futs):
                f.result()
    finally:
        booking_atomic_txn_mod.before_begin_hook = None

    assert sorted(outcomes.values()) == ["conflict", "ok"], outcomes
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 1


def test_atomic_interval_writes(iso_engine, IsoSession, iso_seed):
    mid = iso_seed["master_id"]
    # identical / sequential
    s, e = _slot(5, 10)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(_snapshot(iso_seed, iso_seed["c2_id"], s, e), bind=iso_engine)
    # second starts inside
    s, e = _slot(5, 12)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(
            _snapshot(
                iso_seed,
                iso_seed["c2_id"],
                s + timedelta(minutes=30),
                s + timedelta(minutes=90),
            ),
            bind=iso_engine,
        )
    # second ends inside
    s, e = _slot(5, 13)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(
            _snapshot(
                iso_seed,
                iso_seed["c2_id"],
                s - timedelta(minutes=30),
                s + timedelta(minutes=30),
            ),
            bind=iso_engine,
        )
    # full containment (isolated hour so the outer interval does not hit neighbors)
    s, e = _slot(5, 20)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(
            _snapshot(
                iso_seed,
                iso_seed["c2_id"],
                s - timedelta(minutes=30),
                e + timedelta(minutes=30),
            ),
            bind=iso_engine,
        )
    # touching allowed
    s, e = _slot(5, 14)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    create_booking_atomic(
        _snapshot(iso_seed, iso_seed["c2_id"], e, e + timedelta(hours=1)),
        bind=iso_engine,
    )
    # different services same master still conflict
    db = IsoSession()
    svc2 = Service(name="PR1 Color", duration=60, price=1500.0)
    db.add(svc2)
    db.commit()
    db.refresh(svc2)
    svc2_id = svc2.id
    db.close()
    s, e = _slot(5, 16)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    snap = _snapshot(iso_seed, iso_seed["c2_id"], s, e)
    snap = BookingCreateSnapshot(**{**snap.__dict__, "service_id": svc2_id})
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(snap, bind=iso_engine)
    # different master same time allowed
    db = IsoSession()
    mu2 = User(
        email="pr1.m2@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79006001999",
        full_name="M2",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(mu2)
    db.commit()
    db.refresh(mu2)
    m2 = Master(
        user_id=mu2.id,
        bio="x",
        experience_years=1,
        domain="pr1-m2",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(m2)
    db.commit()
    db.refresh(m2)
    m2_id = m2.id
    db.close()
    s, e = _slot(5, 18)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], s, e), bind=iso_engine)
    other = BookingCreateSnapshot(
        client_id=iso_seed["c2_id"],
        service_id=iso_seed["service_id"],
        master_id=m2_id,
        start_time=s,
        end_time=e,
        status=BookingStatus.CREATED.value,
        payment_amount=1000.0,
        owner_type=OwnerType.MASTER,
        owner_id=m2_id,
    )
    create_booking_atomic(other, bind=iso_engine)
    assert _count(IsoSession, mid, s, e) == 1
    assert _count(IsoSession, m2_id, s, e) == 1


def test_atomic_rollback_after_flush(iso_engine, IsoSession, iso_seed):
    start, end = _slot(6, 10)
    phone = "+79006008888"

    def boom():
        raise RuntimeError("forced-after-flush")

    booking_creation_mod.fail_after_flush_hook = boom
    try:
        with pytest.raises(RuntimeError, match="forced-after-flush"):
            create_booking_atomic(
                BookingCreateSnapshot(
                    service_id=iso_seed["service_id"],
                    master_id=iso_seed["master_id"],
                    start_time=start,
                    end_time=end,
                    status=BookingStatus.CREATED.value,
                    payment_amount=900.0,
                    owner_type=OwnerType.MASTER,
                    owner_id=iso_seed["master_id"],
                    applied_discount=AppliedDiscountSnapshot(
                        rule_type="loyalty",
                        rule_id=None,
                        discount_percent=10.0,
                        discount_amount=100.0,
                    ),
                    public_client=PublicClientSnapshot(
                        phone=phone,
                        email=f"{phone}@temp.com",
                        full_name="New",
                    ),
                ),
                bind=iso_engine,
            )
    finally:
        booking_creation_mod.fail_after_flush_hook = None

    db = IsoSession()
    try:
        assert db.query(Booking).count() == 0
        assert db.query(AppliedDiscount).count() == 0
        assert db.query(User).filter(User.phone == phone).count() == 0
    finally:
        db.close()


def test_atomic_lock_timeout_maps_busy(iso_engine, iso_seed, monkeypatch):
    def locked(_conn):
        raise BookingSlotBusy("database is locked")

    monkeypatch.setattr(booking_atomic_txn_mod, "_begin_writer_transaction", locked)
    start, end = _slot(6, 12)
    with pytest.raises(BookingSlotBusy):
        create_booking_atomic(
            _snapshot(iso_seed, iso_seed["c1_id"], start, end), bind=iso_engine
        )


def test_sqlite_writer_timeout_is_busy_not_conflict(iso_engine, IsoSession, iso_seed):
    start, end = _slot(6, 14)
    holder = iso_engine.connect()
    holder.exec_driver_sql("BEGIN IMMEDIATE")
    busy_engine = create_engine(
        str(iso_engine.url),
        connect_args={"check_same_thread": False, "timeout": 0.2},
        poolclass=NullPool,
    )
    try:
        with pytest.raises(BookingSlotBusy):
            create_booking_atomic(
                _snapshot(iso_seed, iso_seed["c1_id"], start, end), bind=busy_engine
            )
    finally:
        holder.rollback()
        holder.close()
        busy_engine.dispose()
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 0


def test_http_public_master_and_client_conflict(iso_client, IsoSession, iso_seed):
    start, end = _slot(7, 10)
    h1 = _login(iso_client, iso_seed["c1_phone"])
    h2 = _login(iso_client, iso_seed["c2_phone"])
    body = {
        "service_id": iso_seed["msvc_id"],
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }
    r1 = iso_client.post(
        f"/api/public/masters/{iso_seed['slug']}/bookings", json=body, headers=h1
    )
    r2 = iso_client.post(
        f"/api/public/masters/{iso_seed['slug']}/bookings", json=body, headers=h2
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 409, r2.text
    assert r2.headers.get("X-Error-Code") == "BOOKING_SLOT_CONFLICT"
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 1

    start, end = _slot(7, 13)
    payload = _api_bookings_payload(iso_seed, start, end)
    r1 = iso_client.post("/api/client/bookings/", json=payload, headers=h1)
    # partial overlap via client path
    payload2 = _api_bookings_payload(
        iso_seed, start + timedelta(minutes=30), start + timedelta(minutes=90)
    )
    payload2["service_duration"] = 60
    r2 = iso_client.post("/api/client/bookings/", json=payload2, headers=h2)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 409, r2.text
    assert _count(IsoSession, iso_seed["master_id"], start, start + timedelta(hours=2)) == 1


def test_http_api_bookings_wiring_and_503(iso_client, IsoSession, iso_seed, monkeypatch):
    start, end = _slot(8, 10)
    h1 = _login(iso_client, iso_seed["c1_phone"])
    h2 = _login(iso_client, iso_seed["c2_phone"])
    payload = _api_bookings_payload(iso_seed, start, end)
    r1 = iso_client.post("/api/bookings/", json=payload, headers=h1)
    r2 = iso_client.post("/api/bookings/", json=payload, headers=h2)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 409, r2.text
    assert r2.headers.get("X-Error-Code") == "BOOKING_SLOT_CONFLICT"

    start, end = _slot(8, 12)
    payload = _api_bookings_payload(iso_seed, start, end)
    r1 = iso_client.post(
        "/api/bookings/public",
        params={"client_phone": "+79006007777"},
        json=payload,
    )
    r2 = iso_client.post(
        "/api/bookings/public",
        params={"client_phone": "+79006007778"},
        json=payload,
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 409, r2.text
    assert r1.json()["is_new_client"] is True
    assert r1.json()["needs_phone_verification"] is True

    def locked(*_a, **_k):
        raise BookingSlotBusy("database is locked")

    import routers.bookings as bookings_router

    monkeypatch.setattr(bookings_router, "create_booking_atomic", locked)
    start, end = _slot(8, 16)
    r = iso_client.post(
        "/api/bookings/", json=_api_bookings_payload(iso_seed, start, end), headers=h1
    )
    assert r.status_code == 503
    assert r.headers.get("X-Error-Code") == "BOOKING_SLOT_BUSY"
    assert r.headers.get("Retry-After") == "1"
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 0


def test_http_sync_endpoints_concurrent(iso_client, IsoSession, iso_seed):
    start, end = _slot(9, 10)
    h1 = _login(iso_client, iso_seed["c1_phone"])
    h2 = _login(iso_client, iso_seed["c2_phone"])
    barrier = threading.Barrier(2)
    booking_atomic_txn_mod.before_begin_hook = lambda: barrier.wait(timeout=10)
    statuses = {}
    try:

        def worker(key, headers):
            statuses[key] = iso_client.post(
                f"/api/public/masters/{iso_seed['slug']}/bookings",
                json={
                    "service_id": iso_seed["msvc_id"],
                    "start_time": start.isoformat(),
                    "end_time": end.isoformat(),
                },
                headers=headers,
            ).status_code

        with ThreadPoolExecutor(2) as ex:
            list(
                as_completed(
                    [ex.submit(worker, "a", h1), ex.submit(worker, "b", h2)]
                )
            )
    finally:
        booking_atomic_txn_mod.before_begin_hook = None

    assert sorted(statuses.values()) == [200, 409], statuses
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 1

    start, end = _slot(9, 12)
    barrier = threading.Barrier(2)
    booking_atomic_txn_mod.before_begin_hook = lambda: barrier.wait(timeout=10)
    statuses = {}
    try:

        def worker(key, headers):
            statuses[key] = iso_client.post(
                "/api/client/bookings/",
                json=_api_bookings_payload(iso_seed, start, end),
                headers=headers,
            ).status_code

        with ThreadPoolExecutor(2) as ex:
            list(
                as_completed(
                    [ex.submit(worker, "a", h1), ex.submit(worker, "b", h2)]
                )
            )
    finally:
        booking_atomic_txn_mod.before_begin_hook = None

    assert sorted(statuses.values()) == [200, 409], statuses
    assert _count(IsoSession, iso_seed["master_id"], start, end) == 1


def test_canonical_service_created_with_booking(iso_engine, IsoSession, iso_seed):
    start, end = _slot(10, 10)
    spec = CanonicalServiceSnapshot(name="PR1 New Cut", duration=45, price=800.0)
    result = create_booking_atomic(
        BookingCreateSnapshot(
            client_id=iso_seed["c1_id"],
            master_id=iso_seed["master_id"],
            start_time=start,
            end_time=end,
            status=BookingStatus.CREATED.value,
            payment_amount=800.0,
            owner_type=OwnerType.MASTER,
            owner_id=iso_seed["master_id"],
            canonical_service=spec,
        ),
        bind=iso_engine,
    )
    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.id == result.service_id).one().name == "PR1 New Cut"
        assert result.created_new_service is True
    finally:
        db.close()


def test_canonical_service_rollback_after_service_flush(iso_engine, IsoSession, iso_seed):
    start, end = _slot(10, 11)
    spec = CanonicalServiceSnapshot(name="PR1 Rollback Svc", duration=30, price=500.0)

    def boom():
        raise RuntimeError("forced-after-service-flush")

    booking_creation_mod.fail_after_service_flush_hook = boom
    try:
        with pytest.raises(RuntimeError, match="forced-after-service-flush"):
            create_booking_atomic(
                BookingCreateSnapshot(
                    client_id=iso_seed["c1_id"],
                    master_id=iso_seed["master_id"],
                    start_time=start,
                    end_time=end,
                    status=BookingStatus.CREATED.value,
                    payment_amount=500.0,
                    owner_type=OwnerType.MASTER,
                    owner_id=iso_seed["master_id"],
                    canonical_service=spec,
                ),
                bind=iso_engine,
            )
    finally:
        booking_creation_mod.fail_after_service_flush_hook = None

    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.name == spec.name).count() == 0
        assert db.query(Booking).filter(Booking.start_time == start).count() == 0
    finally:
        db.close()


def test_canonical_service_not_left_on_slot_conflict(iso_engine, IsoSession, iso_seed):
    start, end = _slot(10, 12)
    create_booking_atomic(_snapshot(iso_seed, iso_seed["c1_id"], start, end), bind=iso_engine)
    spec = CanonicalServiceSnapshot(name="PR1 Conflict Svc", duration=30, price=400.0)
    with pytest.raises(BookingSlotConflict):
        create_booking_atomic(
            BookingCreateSnapshot(
                client_id=iso_seed["c2_id"],
                master_id=iso_seed["master_id"],
                start_time=start,
                end_time=end,
                status=BookingStatus.CREATED.value,
                payment_amount=400.0,
                owner_type=OwnerType.MASTER,
                owner_id=iso_seed["master_id"],
                canonical_service=spec,
            ),
            bind=iso_engine,
        )
    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.name == spec.name).count() == 0
    finally:
        db.close()


def test_canonical_service_concurrent_one_row(iso_engine, IsoSession, iso_seed):
    spec = CanonicalServiceSnapshot(name="PR1 Race Svc", duration=40, price=700.0)
    barrier = threading.Barrier(2)
    booking_atomic_txn_mod.before_begin_hook = lambda: barrier.wait(timeout=10)
    outcomes = {}
    try:

        def worker(key, client_id, hour):
            s, e = _slot(10, hour)
            create_booking_atomic(
                BookingCreateSnapshot(
                    client_id=client_id,
                    master_id=iso_seed["master_id"],
                    start_time=s,
                    end_time=e,
                    status=BookingStatus.CREATED.value,
                    payment_amount=700.0,
                    owner_type=OwnerType.MASTER,
                    owner_id=iso_seed["master_id"],
                    canonical_service=spec,
                ),
                bind=iso_engine,
            )
            outcomes[key] = "ok"

        with ThreadPoolExecutor(2) as ex:
            list(
                as_completed(
                    [
                        ex.submit(worker, "a", iso_seed["c1_id"], 14),
                        ex.submit(worker, "b", iso_seed["c2_id"], 16),
                    ]
                )
            )
    finally:
        booking_atomic_txn_mod.before_begin_hook = None

    assert outcomes == {"a": "ok", "b": "ok"}, outcomes
    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.name == spec.name).count() == 1
    finally:
        db.close()


def test_public_create_uses_service_name_scalar(iso_client, IsoSession, iso_seed):
    db = IsoSession()
    try:
        svc = db.query(Service).filter(Service.id == iso_seed["service_id"]).one()
        db.delete(svc)
        db.commit()
    finally:
        db.close()
    start, end = _slot(10, 18)
    h1 = _login(iso_client, iso_seed["c1_phone"])
    r = iso_client.post(
        f"/api/public/masters/{iso_seed['slug']}/bookings",
        json={
            "service_id": iso_seed["msvc_id"],
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
        headers=h1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["service_name"] == "PR1 Cut"
    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.name == "PR1 Cut").count() == 1
    finally:
        db.close()


def test_canonical_service_concurrent_same_slot_one_booking(iso_engine, IsoSession, iso_seed):
    spec = CanonicalServiceSnapshot(name="PR1 Same Slot Svc", duration=40, price=700.0)
    start, end = _slot(11, 10)
    barrier = threading.Barrier(2)
    booking_atomic_txn_mod.before_begin_hook = lambda: barrier.wait(timeout=10)
    outcomes = {}
    try:

        def worker(key, client_id):
            try:
                create_booking_atomic(
                    BookingCreateSnapshot(
                        client_id=client_id,
                        master_id=iso_seed["master_id"],
                        start_time=start,
                        end_time=end,
                        status=BookingStatus.CREATED.value,
                        payment_amount=700.0,
                        owner_type=OwnerType.MASTER,
                        owner_id=iso_seed["master_id"],
                        canonical_service=spec,
                    ),
                    bind=iso_engine,
                )
                outcomes[key] = "ok"
            except BookingSlotConflict:
                outcomes[key] = "conflict"

        with ThreadPoolExecutor(2) as ex:
            list(
                as_completed(
                    [
                        ex.submit(worker, "a", iso_seed["c1_id"]),
                        ex.submit(worker, "b", iso_seed["c2_id"]),
                    ]
                )
            )
    finally:
        booking_atomic_txn_mod.before_begin_hook = None

    assert sorted(outcomes.values()) == ["conflict", "ok"], outcomes
    db = IsoSession()
    try:
        assert db.query(Service).filter(Service.name == spec.name).count() == 1
        assert db.query(Booking).filter(Booking.start_time == start).count() == 1
    finally:
        db.close()


def test_race_without_begin_immediate_can_double_book(iso_engine, IsoSession, iso_seed):
    """Mutation/control: the same race must be able to create two Bookings without IMMEDIATE."""
    start, end = _slot(11, 14)
    barrier = threading.Barrier(2)

    def deferred(_conn):
        return None

    original_begin = booking_atomic_txn_mod._begin_writer_transaction
    booking_atomic_txn_mod._begin_writer_transaction = deferred
    booking_creation_mod.after_overlap_check_hook = lambda: barrier.wait(timeout=10)
    try:

        def worker(client_id):
            create_booking_atomic(
                _snapshot(iso_seed, client_id, start, end), bind=iso_engine
            )

        with ThreadPoolExecutor(2) as ex:
            list(
                as_completed(
                    [
                        ex.submit(worker, iso_seed["c1_id"]),
                        ex.submit(worker, iso_seed["c2_id"]),
                    ]
                )
            )
    finally:
        booking_atomic_txn_mod._begin_writer_transaction = original_begin
        booking_creation_mod.after_overlap_check_hook = None

    assert _count(IsoSession, iso_seed["master_id"], start, end) == 2

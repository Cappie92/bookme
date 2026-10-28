"""Phase B2.1: canonical shadow time writes with unified admission off.

Legacy digits must stay byte-for-byte what each route stored before; the
canonical columns appear only when the submitted value proves the instant.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, time, timedelta, timezone
from threading import Barrier, Thread
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from database import Base
from models import (
    Booking,
    BookingStatus,
    IndieMaster,
    Master,
    MasterSchedule,
    MasterService,
    Salon,
    SalonMasterServiceSettings,
    Service,
    TemporaryBooking,
    User,
    UserRole,
)
from services.booking_admission import ADMISSION_MODE_ENV
from services.booking_time_shadow import (
    aware_time_columns,
    hold_time_columns,
    is_consistent,
    wall_time_columns,
)
from services.calendar_adapters import booking_interval
from services.calendar_readiness import readiness_report, write_provenance
from services.calendar_time import canonical_instant
from services.zvonok_service import ZVONOK_STUB_DIGITS

MSK = ZoneInfo("Europe/Moscow")
BERLIN = "Europe/Berlin"
CANONICAL = ("start_utc_us", "end_utc_us", "time_zone")


def _us(value: datetime) -> int:
    return canonical_instant(value).epoch_microseconds


def _canonical(row) -> tuple:
    return tuple(getattr(row, key) for key in CANONICAL)


def _consistent(row) -> bool:
    return is_consistent(**{key: getattr(row, key) for key in ("start_time", "end_time") + CANONICAL})


def _future_msk(days=3, hour=12):
    day = datetime.now(MSK).date() + timedelta(days=days)
    return datetime(day.year, day.month, day.day, hour, 0, tzinfo=MSK)


@pytest.fixture
def legacy_mode(monkeypatch):
    monkeypatch.delenv(ADMISSION_MODE_ENV, raising=False)


@pytest.fixture
def factory(tmp_path, legacy_mode):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'b21.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 5},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autoflush=False)
    session_factory.db_path = str(tmp_path / "b21.sqlite")
    yield session_factory
    engine.dispose()


def _seed(Session, suffix="a", zone="Europe/Moscow"):
    db = Session()
    owner = User(email=f"b21-o-{suffix}@test.local", phone=f"+7955{abs(hash(('o', suffix))) % 10_000_000:07d}",
                 full_name="B21 owner", role=UserRole.MASTER, is_active=True, is_verified=True)
    client = User(email=f"b21-c-{suffix}@test.local", phone=f"+7954{abs(hash(('c', suffix))) % 10_000_000:07d}",
                  full_name="B21 client", role=UserRole.CLIENT, is_active=True, is_verified=True)
    db.add_all([owner, client])
    db.flush()
    master = Master(user_id=owner.id, bio="", experience_years=0, timezone=zone)
    service = Service(name=f"B21 service {suffix}", duration=60, price=1000)
    db.add_all([master, service])
    db.commit()
    ids = {"owner": owner.id, "client": client.id, "master": master.id, "service": service.id}
    db.close()
    return ids


def _insert(Session, ids, start, end=None, **extra):
    db = Session()
    booking = Booking(
        client_id=ids["client"], master_id=extra.pop("master_id", ids["master"]),
        service_id=ids["service"], start_time=start, end_time=end or start + timedelta(hours=1),
        status=extra.pop("status", "created"), payment_amount=1000, **extra,
    )
    db.add(booking)
    db.commit()
    booking_id = booking.id
    db.close()
    return booking_id


def _raw_walls(Session, booking_id, table="bookings"):
    conn = sqlite3.connect(Session.db_path)
    try:
        return conn.execute(f"SELECT start_time, end_time FROM {table} WHERE id = ?", (booking_id,)).fetchone()
    finally:
        conn.close()


def _legacy_digits(value: datetime) -> str:
    return value.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S.%f")


# --- evidence rules -----------------------------------------------------------


@pytest.mark.parametrize(
    ("start", "master_zone", "expected_zone"),
    [
        (datetime(2026, 11, 2, 10, 0, tzinfo=MSK), "Europe/Moscow", "Europe/Moscow"),
        (datetime(2026, 11, 2, 7, 0, tzinfo=timezone.utc), "Europe/Moscow", "UTC"),
        (datetime(2026, 11, 2, 12, 0, tzinfo=ZoneInfo("Asia/Yekaterinburg")), "Europe/Moscow", "Etc/GMT-5"),
        (datetime(2026, 11, 2, 1, 0, tzinfo=ZoneInfo("America/New_York")), "Europe/Moscow", "Etc/GMT+5"),
        (datetime(2026, 11, 2, 15, 30, tzinfo=ZoneInfo("Asia/Kolkata")), "Asia/Kolkata", "Asia/Kolkata"),
    ],
)
def test_aware_value_maps_to_a_zone_that_reproduces_the_stored_digits(start, master_zone, expected_zone):
    end = start + timedelta(hours=1)
    columns = aware_time_columns(start, end, (master_zone,))
    assert columns == {"start_utc_us": _us(start), "end_utc_us": _us(end), "time_zone": expected_zone}
    assert is_consistent(start_time=start, end_time=end, **columns)


def test_unmatched_fractional_offset_and_naive_values_get_no_canonical():
    st_johns = timezone(-timedelta(hours=3, minutes=30))
    start = datetime(2026, 11, 2, 10, 0, tzinfo=st_johns)
    assert aware_time_columns(start, start + timedelta(hours=1), ("Europe/Moscow",)) == {}
    naive = datetime(2026, 11, 2, 10, 0)
    assert aware_time_columns(naive, naive + timedelta(hours=1), ("Europe/Moscow",)) == {}
    aware = naive.replace(tzinfo=MSK)
    assert aware_time_columns(aware, naive + timedelta(hours=1), ("Europe/Moscow",)) == {}
    assert aware_time_columns(aware, aware - timedelta(minutes=1), ("Europe/Moscow",)) == {}


def test_dst_fold_offset_selects_the_exact_occurrence():
    first = datetime(2026, 10, 25, 2, 15, tzinfo=timezone(timedelta(hours=2)))
    second = datetime(2026, 10, 25, 2, 15, tzinfo=timezone(timedelta(hours=1)))
    a = aware_time_columns(first, first + timedelta(minutes=30), (BERLIN,))
    b = aware_time_columns(second, second + timedelta(minutes=30), (BERLIN,))
    assert a["time_zone"] == b["time_zone"] == BERLIN
    assert b["start_utc_us"] - a["start_utc_us"] == 3_600_000_000
    for value, columns in ((first, a), (second, b)):
        assert is_consistent(start_time=value, end_time=value + timedelta(minutes=30), **columns)


def test_declared_zone_walls_reject_gap_fold_and_unknown_zones():
    assert wall_time_columns(datetime(2026, 3, 29, 2, 30), datetime(2026, 3, 29, 3, 30), BERLIN) == {}
    assert wall_time_columns(datetime(2026, 10, 25, 2, 30), datetime(2026, 10, 25, 3, 30), BERLIN) == {}
    wall = datetime(2026, 11, 2, 10, 0)
    for zone in ("Mars/Base", "", None):
        assert wall_time_columns(wall, wall + timedelta(hours=1), zone) == {}
    assert wall_time_columns(wall.replace(tzinfo=MSK), wall + timedelta(hours=1), "Europe/Moscow") == {}
    columns = wall_time_columns(wall, wall + timedelta(hours=1), "Europe/Moscow")
    assert columns["start_utc_us"] == _us(datetime(2026, 11, 2, 7, 0, tzinfo=timezone.utc))
    assert wall_time_columns(wall, wall + timedelta(hours=1), "UTC")["start_utc_us"] == _us(
        wall.replace(tzinfo=timezone.utc)
    )


# --- mapper guard ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("start", "zone"),
    [
        (datetime(2026, 11, 2, 10, 0, tzinfo=MSK), "Europe/Moscow"),
        (datetime(2026, 11, 2, 7, 0, tzinfo=timezone.utc), "UTC"),
    ],
)
def test_insert_keeps_legacy_digits_and_adds_proven_instant(factory, start, zone):
    ids = _seed(factory)
    booking_id = _insert(factory, ids, start)
    assert _raw_walls(factory, booking_id) == (
        _legacy_digits(start), _legacy_digits(start + timedelta(hours=1))
    )
    db = factory()
    row = db.get(Booking, booking_id)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), zone)
    assert booking_interval(row).interval.start.epoch_microseconds == _us(start)
    db.close()


def test_naive_insert_never_infers_the_master_zone(factory):
    ids = _seed(factory)
    booking_id = _insert(factory, ids, datetime(2026, 11, 2, 10, 0))
    db = factory()
    assert _canonical(db.get(Booking, booking_id)) == (None, None, None)
    db.close()


def test_naive_reschedule_clears_and_aware_reschedule_recomputes(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _insert(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    row.start_time = start.replace(tzinfo=None) + timedelta(hours=2)
    row.end_time = start.replace(tzinfo=None) + timedelta(hours=3)
    db.commit()
    assert _canonical(row) == (None, None, None)

    moved = start + timedelta(hours=4)
    row.start_time, row.end_time = moved, moved + timedelta(hours=1)
    db.commit()
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert _canonical(row) == (_us(moved), _us(moved + timedelta(hours=1)), "Europe/Moscow")
    assert row.start_time == moved.replace(tzinfo=None)
    db.close()


def test_single_bound_change_without_evidence_clears(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _insert(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    row.end_time = row.end_time + timedelta(minutes=30)
    db.commit()
    assert _canonical(row) == (None, None, None)
    row2 = db.get(Booking, _insert(factory, ids, start + timedelta(days=1)))
    row2.start_time = (start + timedelta(days=1, minutes=-30)).astimezone(timezone.utc)
    db.commit()
    assert _canonical(row2) == (None, None, None)
    db.close()


def test_status_changes_and_identical_wall_keep_canonical(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _insert(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    before = _canonical(row)
    for status_value in (BookingStatus.CANCELLED.value, BookingStatus.CONFIRMED.value):
        row.status = status_value
        db.commit()
        assert _canonical(row) == before
    row.start_time = start.replace(tzinfo=None)
    row.notes = "touched"
    db.commit()
    db.expire_all()
    assert _canonical(db.get(Booking, booking_id)) == before
    db.close()


def test_resubmitted_digits_with_new_offset_follow_the_new_evidence(factory):
    ids = _seed(factory)
    start = datetime(2026, 11, 2, 10, 0, tzinfo=MSK)
    booking_id = _insert(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    as_utc = start.replace(tzinfo=timezone.utc)
    row.start_time, row.end_time = as_utc, as_utc + timedelta(hours=1)
    db.commit()
    assert _canonical(row) == (_us(as_utc), _us(as_utc + timedelta(hours=1)), "UTC")
    db.close()


def test_partial_or_mismatched_explicit_metadata_is_cleared(factory):
    ids = _seed(factory)
    wall = datetime(2026, 11, 2, 10, 0)
    partial = _insert(factory, ids, wall, start_utc_us=_us(wall.replace(tzinfo=MSK)))
    mismatched = _insert(
        factory, ids, wall + timedelta(days=1),
        start_utc_us=_us(wall.replace(tzinfo=timezone.utc)),
        end_utc_us=_us(wall.replace(tzinfo=timezone.utc) + timedelta(hours=1)),
        time_zone="Europe/Moscow",
    )
    unknown_zone = _insert(
        factory, ids, wall + timedelta(days=2),
        start_utc_us=_us(wall.replace(tzinfo=MSK)), end_utc_us=_us(wall.replace(tzinfo=MSK) + timedelta(hours=1)),
        time_zone="Mars/Base",
    )
    db = factory()
    for booking_id in (partial, mismatched, unknown_zone):
        assert _canonical(db.get(Booking, booking_id)) == (None, None, None)
    db.close()


def test_explicit_consistent_metadata_is_kept_even_for_naive_walls(factory):
    ids = _seed(factory)
    wall = datetime(2026, 11, 2, 10, 0)
    columns = wall_time_columns(wall, wall + timedelta(hours=1), "Europe/Moscow")
    booking_id = _insert(factory, ids, wall, **columns)
    db = factory()
    assert _canonical(db.get(Booking, booking_id)) == tuple(columns[key] for key in CANONICAL)
    db.close()


def test_indie_owned_booking_prefers_the_master_zone(factory):
    ids = _seed(factory)
    db = factory()
    indie = IndieMaster(user_id=ids["owner"], master_id=ids["master"], bio="", experience_years=0,
                        domain="b21-indie")
    db.add(indie)
    db.commit()
    indie_id = indie.id
    db.close()
    start = datetime(2026, 11, 2, 10, 0, tzinfo=MSK)
    booking_id = _insert(factory, ids, start, master_id=None, indie_master_id=indie_id)
    db = factory()
    assert db.get(Booking, booking_id).time_zone == "Europe/Moscow"
    db.close()


def test_repeated_saves_are_idempotent_and_do_not_bump_version(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _insert(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    first, version = _canonical(row), row.version
    for _ in range(3):
        row.start_time, row.end_time = start, start + timedelta(hours=1)
        db.commit()
        db.expire_all()
        row = db.get(Booking, booking_id)
        assert _canonical(row) == first and row.version == version
    db.close()


def test_hold_metadata_and_promotion_copy(factory):
    ids = _seed(factory)
    start = _future_msk()
    db = factory()
    hold = TemporaryBooking(master_id=ids["master"], client_id=ids["client"], service_id=ids["service"],
                            start_time=start, end_time=start + timedelta(hours=1), payment_amount=1000,
                            expires_at=datetime.utcnow() + timedelta(minutes=20), status="pending")
    naive_hold = TemporaryBooking(master_id=ids["master"], client_id=ids["client"], service_id=ids["service"],
                                  start_time=start.replace(tzinfo=None), end_time=start.replace(tzinfo=None),
                                  payment_amount=1000, expires_at=datetime.utcnow(), status="pending")
    db.add_all([hold, naive_hold])
    db.commit()
    hold_id, naive_id = hold.id, naive_hold.id
    db.close()
    assert _raw_walls(factory, hold_id, "temporary_bookings")[0] == _legacy_digits(start)
    db = factory()
    hold = db.get(TemporaryBooking, hold_id)
    assert _canonical(hold) == (_us(start), _us(start + timedelta(hours=1)), "Europe/Moscow")
    assert hold_time_columns(db.get(TemporaryBooking, naive_id)) == {}
    copied = hold_time_columns(hold)
    booking = Booking(client_id=ids["client"], master_id=ids["master"], service_id=ids["service"],
                      start_time=hold.start_time, end_time=hold.end_time, status="completed",
                      payment_amount=1000, **copied)
    db.add(booking)
    db.commit()
    assert _canonical(booking) == _canonical(hold)
    db.close()


def test_interleaved_writers_never_leave_inconsistent_metadata(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _insert(factory, ids, start)
    first, second = factory(), factory()
    a, b = first.get(Booking, booking_id), second.get(Booking, booking_id)
    moved = start + timedelta(hours=3)
    a.start_time, a.end_time = moved, moved + timedelta(hours=1)
    first.commit()
    b.end_time = b.end_time + timedelta(minutes=15)
    second.commit()
    verify = factory()
    row = verify.get(Booking, booking_id)
    assert _canonical(row) == (None, None, None) or _consistent(row)
    for session in (first, second, verify):
        session.close()


def test_concurrent_legacy_creates_store_each_own_instant(factory):
    owners = [_seed(factory, suffix=f"t{i}") for i in range(4)]
    barrier = Barrier(len(owners))
    errors = []

    def worker(index, ids):
        start = _future_msk(days=3 + index) + timedelta(minutes=15 * index)
        if index % 2:
            start = start.astimezone(timezone.utc)
        barrier.wait()
        for attempt in range(20):
            try:
                _insert(factory, ids, start)
                return
            except Exception as exc:  # SQLite writer contention retries
                if "locked" not in str(exc) or attempt == 19:
                    errors.append(exc)
                    return

    threads = [Thread(target=worker, args=(i, ids)) for i, ids in enumerate(owners)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    db = factory()
    rows = db.query(Booking).all()
    assert len(rows) == len(owners)
    assert all(_consistent(row) for row in rows)
    assert {row.time_zone for row in rows} == {"Europe/Moscow", "UTC"}
    db.close()


def test_unified_rows_stay_consistent_after_switching_the_flag_off(factory, monkeypatch):
    from services.booking_admission import admit_booking_request, online_booking_metadata
    from utils.booking_limit_guard import begin_booking_creation_transaction

    ids = _seed(factory)
    start = _future_msk()
    monkeypatch.setenv(ADMISSION_MODE_ENV, "unified")
    db = factory()
    begin_booking_creation_transaction(db)
    decision = admit_booking_request(db, start=start.astimezone(timezone.utc),
                                     end=start.astimezone(timezone.utc) + timedelta(hours=1), master_id=ids["master"])
    data = {"client_id": ids["client"], "master_id": ids["master"], "service_id": ids["service"],
            "status": "created", "payment_amount": 1000, **online_booking_metadata(decision, ids["client"])}
    booking = Booking(**data)
    db.add(booking)
    db.commit()
    assert booking.start_time == start.replace(tzinfo=None) and _consistent(booking)

    monkeypatch.delenv(ADMISSION_MODE_ENV)
    booking.start_time = booking.start_time + timedelta(hours=2)
    booking.end_time = booking.end_time + timedelta(hours=2)
    db.commit()
    assert _canonical(booking) == (None, None, None)
    moved = start + timedelta(hours=4)
    booking.start_time, booking.end_time = moved.astimezone(timezone.utc), moved.astimezone(timezone.utc) + timedelta(hours=1)
    db.commit()
    assert booking.time_zone == "UTC" and _consistent(booking)
    db.close()


# --- readiness ----------------------------------------------------------------


def test_readiness_distinguishes_history_new_canonical_unresolved_and_conflicting(factory):
    ids = _seed(factory)
    future = _future_msk(days=5)
    history = _insert(factory, ids, datetime(2026, 1, 10, 10, 0))
    _insert(factory, ids, future, source="online")
    _insert(factory, ids, future.astimezone(timezone.utc) + timedelta(hours=2), source="online")
    _insert(factory, ids, future.replace(tzinfo=None) + timedelta(hours=4), source="online")
    _insert(factory, ids, future.replace(tzinfo=None) + timedelta(hours=6))
    conflicting = _insert(factory, ids, future.replace(tzinfo=None) + timedelta(hours=8))
    conn = sqlite3.connect(factory.db_path)
    conn.execute("UPDATE bookings SET created_at = '2026-01-01 00:00:00' WHERE id IN (?, ?)", (history, conflicting))
    conn.execute(
        "UPDATE bookings SET start_utc_us = 1, end_utc_us = 2, time_zone = 'Europe/Moscow' WHERE id = ?",
        (conflicting,),
    )
    conn.commit()
    conn.close()

    db = factory()
    now = datetime.utcnow()
    without_cutoff = write_provenance(db, now)
    assert without_cutoff.legacy_history == 2
    assert without_cutoff.unresolved_new_writes == 1
    with_cutoff = write_provenance(db, now, shadow_since=datetime(2026, 6, 1))
    assert with_cutoff.as_dict() == {
        "legacy_history": 1,
        "canonical": 2,
        "canonical_wall_in_master_zone": 1,
        "canonical_wall_in_other_zone": 1,
        "unresolved_new_writes": 2,
        "unresolved_new_writes_still_relevant": 2,
        "conflicting_canonical": 1,
        "conflicting_canonical_still_relevant": 1,
    }
    report = readiness_report(db, shadow_since=datetime(2026, 6, 1))
    assert report.as_dict()["write_provenance"] == with_cutoff.as_dict()
    assert report.unresolved_bookings == 3
    assert not report.activation_ready
    db.close()


# --- API with the flag off ------------------------------------------------------


@pytest.fixture
def world(db, legacy_mode):
    client_user = User(email="b21.client@example.com", hashed_password=get_password_hash("testpassword"),
                       phone="+79007771101", full_name="B21 Client", role=UserRole.CLIENT,
                       is_active=True, is_verified=True, is_phone_verified=True)
    master_user = User(email="b21.master@example.com", hashed_password=get_password_hash("testpassword"),
                       phone="+79007771102", full_name="B21 Master", role=UserRole.MASTER,
                       is_active=True, is_verified=True, is_phone_verified=True)
    db.add_all([client_user, master_user])
    db.commit()
    master = Master(user_id=master_user.id, bio="", experience_years=1, domain="b21-master",
                    timezone="Europe/Moscow", timezone_confirmed=True, city="Москва")
    db.add(master)
    db.commit()
    start = _future_msk(days=3)
    for offset in range(0, 6):
        db.add(MasterSchedule(master_id=master.id, salon_id=None, date=(start + timedelta(days=offset)).date(),
                              start_time=time(0, 0), end_time=time(23, 59), is_available=True))
    service = Service(name="B21 Cut", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.add(SalonMasterServiceSettings(master_id=master.id, service_id=service.id, is_active=True,
                                      master_payment_type="rub", master_payment_value=1000))
    master_service = MasterService(master_id=master.id, category_id=None, name="B21 Cut", duration=60, price=1000.0)
    db.add(master_service)
    db.commit()
    return {
        "start": start, "client_id": int(client_user.id), "client_phone": str(client_user.phone),
        "master_phone": str(master_user.phone), "master_id": int(master.id),
        "master_domain": "b21-master", "service_id": int(service.id),
        "master_service_id": int(master_service.id),
    }


def _login(api, phone):
    response = api.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _wire(value: datetime, kind: str) -> str:
    if kind == "offset":
        return value.isoformat()
    if kind == "utc_z":
        return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return value.replace(tzinfo=None).isoformat()


def _payload(world, start, kind="offset"):
    return {
        "service_id": world["service_id"], "master_id": world["master_id"],
        "start_time": _wire(start, kind), "end_time": _wire(start + timedelta(hours=1), kind),
        "status": "created", "client_name": "B21", "service_name": "B21 Cut",
        "service_duration": 60, "service_price": 1000.0,
    }


def _stored_digits(kind, start):
    return start.astimezone(timezone.utc).replace(tzinfo=None) if kind == "utc_z" else start.replace(tzinfo=None)


EXPECTED_ZONE = {"offset": "Europe/Moscow", "utc_z": "UTC", "naive": None}


@pytest.mark.parametrize("path", ["/api/client/bookings/", "/api/bookings/"])
@pytest.mark.parametrize("kind", ["offset", "utc_z", "naive"])
def test_off_create_routes_keep_digits_and_shadow_proven_instants(client, db, world, path, kind):
    headers = _login(client, world["client_phone"])
    start = world["start"]
    created = client.post(path, json=_payload(world, start, kind), headers=headers)
    assert created.status_code == 200, created.text
    body = created.json()
    assert not set(CANONICAL) & set(body)
    db.expire_all()
    row = db.get(Booking, body["id"])
    assert row.start_time == _stored_digits(kind, start)
    assert row.source == "online" and row.created_by_user_id == world["client_id"]
    if EXPECTED_ZONE[kind] is None:
        assert _canonical(row) == (None, None, None)
    else:
        assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), EXPECTED_ZONE[kind])
    duplicate = client.post(path, json=_payload(world, start, kind), headers=headers)
    assert duplicate.status_code in (400, 409), duplicate.text
    assert db.query(Booking).count() == 1


def test_off_public_master_offset_echo_is_shadowed(client, db, world):
    headers = _login(client, world["client_phone"])
    start = world["start"] + timedelta(days=1)
    created = client.post(
        f"/api/public/masters/{world['master_domain']}/bookings",
        json={"service_id": world["master_service_id"], "start_time": start.isoformat(),
              "end_time": (start + timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["start_time"] == start.isoformat()
    db.expire_all()
    row = db.get(Booking, created.json()["id"])
    assert row.start_time == start.replace(tzinfo=None)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), "Europe/Moscow")


def _stub_call(monkeypatch):
    monkeypatch.setattr(
        "routers.bookings.zvonok_service.send_verification_call",
        lambda phone: {"success": True, "call_id": "b21-call", "pincode": ZVONOK_STUB_DIGITS},
    )


def _prove_phone(api, pending):
    headers = {"Authorization": f"Bearer {pending['verification_token']}"}
    assert api.post("/api/bookings/public/verification/request", headers=headers).status_code == 200
    confirmed = api.post("/api/bookings/public/verification/confirm", headers=headers,
                         json={"call_id": "b21-call", "phone_digits": ZVONOK_STUB_DIGITS})
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json()["booking_id"]


def test_off_phone_verified_ticket_preserves_the_offset(client, db, world, monkeypatch):
    _stub_call(monkeypatch)
    start = world["start"] + timedelta(days=2)
    pending = client.post("/api/bookings/public", params={"client_phone": "+79007771199"},
                          json=_payload(world, start, "utc_z"))
    assert pending.status_code == 200, pending.text
    booking_id = _prove_phone(client, pending.json())
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.start_time == _stored_digits("utc_z", start)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), "UTC")
    assert row.source == "online"


def test_off_any_master_ticket_preserves_the_offset(client, db, world, monkeypatch):
    salon_owner = User(phone="+79007771103", role=UserRole.SALON, is_active=True,
                       is_verified=True, is_phone_verified=True)
    db.add(salon_owner)
    db.flush()
    salon = Salon(user_id=salon_owner.id, name="B21 Salon", domain="b21-salon")
    db.add(salon)
    db.flush()
    db.get(Service, world["service_id"]).salon_id = salon.id
    db.commit()
    salon_id = salon.id
    _stub_call(monkeypatch)
    monkeypatch.setattr("routers.bookings.get_best_master_for_slot",
                        lambda *a, **k: {"id": world["master_id"], "name": "B21"})
    start = world["start"] + timedelta(days=3)
    pending = client.post("/api/bookings/create-with-any-master", params={
        "salon_id": salon_id, "service_id": world["service_id"],
        "start_time": _wire(start, "utc_z"), "end_time": _wire(start + timedelta(hours=1), "utc_z"),
        "client_phone": "+79007771198",
    })
    assert pending.status_code == 200, pending.text
    booking_id = _prove_phone(client, pending.json())
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.start_time == _stored_digits("utc_z", start)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), "UTC")


def _create_offset_booking(api, world, headers, start):
    created = api.post("/api/client/bookings/", json=_payload(world, start), headers=headers)
    assert created.status_code == 200, created.text
    return created.json()["id"]


def test_off_client_reschedule_naive_clears_and_aware_recomputes(client, db, world):
    headers = _login(client, world["client_phone"])
    start = world["start"]
    booking_id = _create_offset_booking(client, world, headers, start)
    naive_target = (start + timedelta(hours=2)).replace(tzinfo=None)
    moved = client.put(f"/api/client/bookings/{booking_id}", json={"start_time": naive_target.isoformat()},
                       headers=headers)
    assert moved.status_code == 200, moved.text
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.start_time == naive_target and _canonical(row) == (None, None, None)

    aware_target = start + timedelta(hours=4)
    moved = client.put(f"/api/client/bookings/{booking_id}", json={"start_time": aware_target.isoformat()},
                       headers=headers)
    assert moved.status_code == 200, moved.text
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.start_time == aware_target.replace(tzinfo=None)
    assert _canonical(row) == (_us(aware_target), _us(aware_target + timedelta(hours=1)), "Europe/Moscow")


def test_off_master_reschedule_naive_clears_and_aware_recomputes(client, db, world):
    client_headers = _login(client, world["client_phone"])
    start = world["start"]
    booking_id = _create_offset_booking(client, world, client_headers, start)
    master_headers = _login(client, world["master_phone"])
    target = (start + timedelta(hours=2)).replace(tzinfo=None)
    moved = client.put(f"/api/master/bookings/{booking_id}/time", headers=master_headers,
                       json={"start_time": target.isoformat(), "end_time": (target + timedelta(hours=1)).isoformat()})
    assert moved.status_code == 200, moved.text
    db.expire_all()
    assert _canonical(db.get(Booking, booking_id)) == (None, None, None)

    aware = start + timedelta(hours=5)
    moved = client.put(f"/api/master/bookings/{booking_id}/time", headers=master_headers,
                       json={"start_time": aware.isoformat(), "end_time": (aware + timedelta(hours=1)).isoformat()})
    assert moved.status_code == 200, moved.text
    db.expire_all()
    assert _canonical(db.get(Booking, booking_id)) == (_us(aware), _us(aware + timedelta(hours=1)), "Europe/Moscow")


def test_off_edit_request_acceptance_without_evidence_leaves_no_stale_instant(client, db, world):
    client_headers = _login(client, world["client_phone"])
    start = world["start"]
    booking_id = _create_offset_booking(client, world, client_headers, start)
    target = start + timedelta(hours=3)
    created = client.post(f"/api/bookings/{booking_id}/edit-requests", headers=client_headers, json={
        "booking_id": booking_id, "proposed_start": target.isoformat(),
        "proposed_end": (target + timedelta(hours=1)).isoformat(),
    })
    assert created.status_code == 200, created.text
    master_headers = _login(client, world["master_phone"])
    accepted = client.put(f"/api/bookings/edit-requests/{created.json()['id']}", json={"status": "accepted"},
                          headers=master_headers)
    assert accepted.status_code == 200, accepted.text
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (None, None, None)
    provenance = write_provenance(db)
    assert provenance.unresolved_new_writes_still_relevant == 1


def test_off_status_reactivation_keeps_the_instant(client, db, world, monkeypatch):
    monkeypatch.setattr("routers.accounting.has_finance_access", lambda *_: True)
    client_headers = _login(client, world["client_phone"])
    booking_id = _create_offset_booking(client, world, client_headers, world["start"])
    db.expire_all()
    before = _canonical(db.get(Booking, booking_id))
    master_headers = _login(client, world["master_phone"])
    for new_status in ("cancelled", "confirmed"):
        response = client.post(f"/api/master/accounting/update-booking-status/{booking_id}",
                               params={"new_status": new_status}, headers=master_headers)
        assert response.status_code == 200, response.text
        db.expire_all()
        assert _canonical(db.get(Booking, booking_id)) == before


def test_off_hold_promotion_inherits_the_hold_instant(client, db, world):
    salon_owner = User(phone="+79007771104", role=UserRole.SALON, is_active=True,
                       is_verified=True, is_phone_verified=True)
    db.add(salon_owner)
    db.flush()
    salon = Salon(user_id=salon_owner.id, name="B21 Hold Salon", domain="b21-hold-salon")
    db.add(salon)
    db.flush()
    db.get(Service, world["service_id"]).salon_id = salon.id
    start = world["start"] + timedelta(days=1)
    hold = TemporaryBooking(master_id=world["master_id"], client_id=world["client_id"],
                            service_id=world["service_id"], start_time=start, end_time=start + timedelta(hours=1),
                            payment_amount=1000, expires_at=datetime.utcnow() + timedelta(minutes=20),
                            status="pending")
    db.add(hold)
    db.commit()
    hold_id = hold.id
    headers = _login(client, world["client_phone"])
    promoted = client.post(f"/api/client/bookings/temporary/{hold_id}/confirm-payment", headers=headers)
    assert promoted.status_code == 200, promoted.text
    db.expire_all()
    row = db.get(Booking, promoted.json()["id"])
    assert row.start_time == start.replace(tzinfo=None)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), "Europe/Moscow")
    assert db.get(TemporaryBooking, hold_id).status == "paid"


# --- direct database writers ----------------------------------------------------


def test_demo_master_reseed_writes_canonical_master_walls(db, legacy_mode):
    from services.demo_master_seed import reseed_demo_master

    reseed_demo_master(db)
    db.commit()
    rows = db.query(Booking).all()
    assert rows
    for row in rows:
        assert row.time_zone == "Europe/Moscow" and _consistent(row)


def test_smoke_seed_helpers_write_canonical_utc_walls(db, legacy_mode):
    from scripts import reseed_prod_stats_smoke as stats
    from scripts import seed_loyalty_smoke as loyalty

    ids = _seed(lambda: db, suffix="smoke")
    master = db.get(Master, ids["master"])
    client_user = db.get(User, ids["client"])
    service = db.get(Service, ids["service"])
    start = datetime(2026, 11, 2, 7, 0)
    booking = loyalty._create_smoke_booking(
        db, master_id=master.id, client_id=client_user.id, service_id=service.id,
        start_time=start, end_time=start + timedelta(hours=1), payment_amount=1000,
        loyalty_points_used=0, status="confirmed", notes="b21",
    )
    bundle = stats.ServiceBundle(master_service=None, service=service, category_name="c",
                                 name=service.name, price=1000.0, duration=60)
    second = stats._add_booking(db, master=master, client=client_user, bundle=bundle, day=start.date(),
                                hour=12, minute=0, status="confirmed", allocator=stats.SlotAllocator(),
                                bucket="b21", seq=1, is_paid=False)
    db.commit()
    for row in (booking, second):
        assert row.time_zone == "UTC" and _consistent(row)
    assert second.start_time == datetime(2026, 11, 2, 9, 0)


def test_release_smoke_refresh_writes_only_canonical_bookings(tmp_path, monkeypatch, legacy_mode):
    import test_refresh_release_smoke_data as harness

    path, engine, factory_ = harness._database(tmp_path)
    harness._seed_anchors_and_services(factory_)
    assert harness._run_apply(monkeypatch, factory_, path) == 0
    db = factory_()
    rows = db.query(Booking).filter(Booking.notes.like("[RELEASE%")).all()
    assert rows
    for row in rows:
        assert _consistent(row), row.notes
        master = db.get(Master, row.master_id)
        assert row.time_zone == master.timezone
    db.close()
    engine.dispose()

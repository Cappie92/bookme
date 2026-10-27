from dataclasses import fields
from datetime import datetime, timedelta, timezone
from threading import Barrier, Lock, Thread
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from models import (
    Base,
    Booking,
    CalendarBlock,
    IndieMaster,
    Master,
    MasterClientMetadata,
    TemporaryBooking,
    User,
    UserRole,
)
from services.calendar_adapters import (
    BookingSource,
    booking_interval,
    booking_local_contact,
    booking_occupancy_input,
    calendar_block_occupancy_input,
    canonical_time_columns,
    hold_occupancy_input,
    stored_interval,
)
from services.calendar_admission import (
    AdmissionConflict,
    ensure_candidate_available,
    run_sqlite_admission,
)
from services.calendar_availability import (
    AvailabilityState,
    IntervalInput,
    OccupancyKind,
    evaluate_availability,
)
from services.calendar_time import (
    CanonicalInstant,
    CanonicalInterval,
    LegacyTimeEvidence,
    ResolvedInterval,
    TimeResolution,
    canonical_instant,
    canonical_interval,
)


MOSCOW = "Europe/Moscow"
BERLIN = "Europe/Berlin"
HOUR_US = 3_600_000_000


def _utc_interval(start, minutes=60):
    start = start.replace(tzinfo=timezone.utc)
    return canonical_interval(start, start + timedelta(minutes=minutes))


@pytest.fixture
def database(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'adapters.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 5},
        poolclass=NullPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    yield Session
    engine.dispose()


@pytest.fixture
def session(database):
    db = database()
    try:
        yield db
    finally:
        db.close()


def _master(db, phone):
    user = User(
        phone=phone, full_name="Synthetic", role=UserRole.MASTER, is_active=True
    )
    db.add(user)
    db.flush()
    master = Master(user_id=user.id, timezone=MOSCOW, timezone_confirmed=True)
    db.add(master)
    db.flush()
    return user, master


def test_canonical_columns_round_trip_through_wall_time():
    interval = _utc_interval(datetime(2026, 11, 2, 7, 0))
    columns = canonical_time_columns(interval, MOSCOW)

    assert columns["start_time"] == datetime(2026, 11, 2, 10, 0)
    assert columns["end_time"] == datetime(2026, 11, 2, 11, 0)
    resolved = stored_interval(**columns)
    assert resolved.state is TimeResolution.CANONICAL
    assert resolved.interval == interval


def test_canonical_columns_disambiguate_dst_fold():
    # 2026-10-25 02:30 happens twice in Berlin; both instants share one wall value.
    first = canonical_instant(datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc))
    second = canonical_instant(datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc))
    end = CanonicalInstant(second.epoch_microseconds + HOUR_US)
    early = canonical_time_columns(CanonicalInterval(first, end), BERLIN)
    late = canonical_time_columns(CanonicalInterval(second, end), BERLIN)

    assert early["start_time"] == late["start_time"] == datetime(2026, 10, 25, 2, 30)
    assert stored_interval(**early).interval.start == first
    assert stored_interval(**late).interval.start == second


def test_unknown_zone_is_rejected_on_write():
    with pytest.raises(ValueError):
        canonical_time_columns(_utc_interval(datetime(2026, 11, 2, 7)), "Mars/Base")


def test_legacy_naive_booking_stays_unresolved_without_evidence():
    booking = Booking(
        id=1,
        start_time=datetime(2026, 11, 2, 10),
        end_time=datetime(2026, 11, 2, 11),
        status="created",
    )
    assert booking_interval(booking).state is TimeResolution.UNRESOLVED

    resolved = booking_interval(booking, evidence=LegacyTimeEvidence(MOSCOW))
    assert resolved.state is TimeResolution.RESOLVED_WITH_EVIDENCE
    assert resolved.interval == _utc_interval(datetime(2026, 11, 2, 7))


@pytest.mark.parametrize(
    "overrides, reason",
    [
        ({"time_zone": None}, "partial"),
        ({"end_utc_us": None}, "partial"),
        ({"time_zone": "Mars/Base"}, "unknown"),
        ({"start_time": datetime(2026, 11, 2, 9, 0)}, "disagrees"),
        ({"end_utc_us": 0}, "after start"),
        ({"start_time": None}, "wall"),
    ],
)
def test_inconsistent_canonical_metadata_fails_closed(overrides, reason):
    columns = canonical_time_columns(_utc_interval(datetime(2026, 11, 2, 7)), MOSCOW)
    columns.update(overrides)
    resolved = stored_interval(**columns)
    assert resolved.state is TimeResolution.UNRESOLVED
    assert resolved.interval is None
    assert reason in resolved.reason


def test_booking_occupancy_follows_existing_status_policy():
    columns = canonical_time_columns(_utc_interval(datetime(2026, 11, 2, 7)), MOSCOW)
    active = Booking(id=7, status="confirmed", **columns)
    cancelled = Booking(id=8, status="cancelled", **columns)

    occupancy = booking_occupancy_input(active)
    assert occupancy.kind is OccupancyKind.BOOKING
    assert occupancy.source_id == "booking:7"
    assert occupancy.resolved.state is TimeResolution.CANONICAL
    assert booking_occupancy_input(cancelled) is None


def test_hold_occupancy_uses_utc_expiry_and_ignores_expired_holds():
    columns = canonical_time_columns(_utc_interval(datetime(2026, 11, 2, 7)), MOSCOW)
    now = canonical_instant(datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc))
    live = TemporaryBooking(
        id=3, status="pending", expires_at=datetime(2026, 11, 1, 12, 5), **columns
    )
    expired = TemporaryBooking(
        id=4, status="pending", expires_at=datetime(2026, 11, 1, 12, 0), **columns
    )
    paid = TemporaryBooking(
        id=5, status="paid", expires_at=datetime(2026, 11, 1, 12, 5), **columns
    )

    occupancy = hold_occupancy_input(live, now=now)
    assert occupancy.kind is OccupancyKind.HOLD
    assert occupancy.resolved.state is TimeResolution.CANONICAL
    assert hold_occupancy_input(expired, now=now) is None
    assert hold_occupancy_input(paid, now=now) is None


def test_legacy_hold_without_metadata_is_unresolved():
    now = canonical_instant(datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc))
    hold = TemporaryBooking(
        id=6,
        status="pending",
        start_time=datetime(2026, 11, 2, 10),
        end_time=datetime(2026, 11, 2, 11),
        expires_at=datetime(2026, 11, 1, 12, 5),
    )
    assert (
        hold_occupancy_input(hold, now=now).resolved.state is TimeResolution.UNRESOLVED
    )


def test_block_occupancy_carries_only_interval():
    interval = _utc_interval(datetime(2026, 11, 2, 7))
    block = CalendarBlock(
        id=9,
        category="personal",
        title="Doctor visit",
        description="Private details",
        start_utc_us=interval.start.epoch_microseconds,
        end_utc_us=interval.end.epoch_microseconds,
        time_zone=MOSCOW,
    )
    occupancy = calendar_block_occupancy_input(block)

    assert occupancy.kind is OccupancyKind.BLOCK
    assert occupancy.source_id == "block:9"
    assert occupancy.resolved.interval == interval
    assert {field.name for field in fields(occupancy)} == {
        "resolved",
        "source_id",
        "kind",
    }
    assert "Doctor" not in repr(occupancy) and "Private" not in repr(occupancy)


def test_deleted_or_corrupt_block_handling():
    interval = _utc_interval(datetime(2026, 11, 2, 7))
    base = dict(
        start_utc_us=interval.start.epoch_microseconds,
        end_utc_us=interval.end.epoch_microseconds,
    )
    deleted = CalendarBlock(
        id=1, time_zone=MOSCOW, deleted_at=datetime(2026, 11, 1), **base
    )
    corrupt = CalendarBlock(id=2, time_zone="Mars/Base", **base)

    assert calendar_block_occupancy_input(deleted) is None
    assert (
        calendar_block_occupancy_input(corrupt).resolved.state
        is TimeResolution.UNRESOLVED
    )


def test_booking_source_values():
    assert {source.value for source in BookingSource} == {"online", "manual"}


def test_local_contact_requires_matching_master(session):
    _, master = _master(session, "+70000000201")
    _, other = _master(session, "+70000000202")
    own = MasterClientMetadata(master_id=master.id, client_phone="+70000000301")
    foreign = MasterClientMetadata(master_id=other.id, client_phone="+70000000302")
    session.add_all([own, foreign])
    session.flush()

    assert (
        booking_local_contact(
            session, Booking(master_id=master.id, master_client_metadata_id=own.id)
        )
        == own
    )
    assert (
        booking_local_contact(
            session, Booking(master_id=master.id, master_client_metadata_id=foreign.id)
        )
        is None
    )
    assert booking_local_contact(session, Booking(master_id=master.id)) is None
    assert (
        booking_local_contact(session, Booking(master_client_metadata_id=own.id))
        is None
    )


def test_local_contact_resolves_owner_through_indie_bridge(session):
    user, master = _master(session, "+70000000203")
    indie = IndieMaster(user_id=user.id, master_id=master.id)
    contact = MasterClientMetadata(master_id=master.id, client_phone="+70000000303")
    session.add_all([indie, contact])
    session.flush()

    booking = Booking(indie_master_id=indie.id, master_client_metadata_id=contact.id)
    assert booking_local_contact(session, booking) == contact


def _availability_for(db, master_id, now):
    day = canonical_interval(
        datetime(2026, 11, 2, 9, tzinfo=ZoneInfo(MOSCOW)),
        datetime(2026, 11, 2, 13, tzinfo=ZoneInfo(MOSCOW)),
    )
    grid = [
        CanonicalInstant(day.start.epoch_microseconds + i * HOUR_US) for i in range(4)
    ]
    bookings = [
        booking_occupancy_input(b)
        for b in db.query(Booking).filter_by(master_id=master_id)
    ]
    holds = [
        hold_occupancy_input(h, now=now)
        for h in db.query(TemporaryBooking).filter_by(master_id=master_id)
    ]
    blocks = [
        calendar_block_occupancy_input(b)
        for b in db.query(CalendarBlock).filter_by(master_id=master_id)
    ]
    return evaluate_availability(
        working_windows=[
            IntervalInput(ResolvedInterval(TimeResolution.CANONICAL, day))
        ],
        grid_starts=grid,
        duration_microseconds=HOUR_US,
        bookings=[item for item in bookings if item is not None],
        holds=[item for item in holds if item is not None],
        blocks=[item for item in blocks if item is not None],
    )


def test_persisted_rows_feed_phase_a_availability(session):
    user, master = _master(session, "+70000000204")
    now = canonical_instant(datetime(2026, 11, 1, 12, tzinfo=timezone.utc))
    booked = _utc_interval(datetime(2026, 11, 2, 6))
    blocked = _utc_interval(datetime(2026, 11, 2, 8))
    session.add(
        Booking(
            master_id=master.id,
            status="created",
            **canonical_time_columns(booked, MOSCOW),
        )
    )
    session.add(
        CalendarBlock(
            master_id=master.id,
            created_by_user_id=user.id,
            title="Private",
            start_utc_us=blocked.start.epoch_microseconds,
            end_utc_us=blocked.end.epoch_microseconds,
            time_zone=MOSCOW,
        )
    )
    session.commit()

    result = _availability_for(session, master.id, now)
    assert result.state is AvailabilityState.READY
    assert [slot.start.to_datetime().hour for slot in result.slots] == [7, 9]


def test_legacy_booking_makes_availability_fail_closed(session):
    _, master = _master(session, "+70000000205")
    session.add(
        Booking(
            master_id=master.id,
            status="created",
            start_time=datetime(2026, 11, 2, 10),
            end_time=datetime(2026, 11, 2, 11),
        )
    )
    session.commit()
    now = canonical_instant(datetime(2026, 11, 1, 12, tzinfo=timezone.utc))
    result = _availability_for(session, master.id, now)
    assert result.state is AvailabilityState.UNRESOLVED
    assert result.slots == ()


def test_concurrent_block_admission_creates_one_reservation(database):
    setup = database()
    user, master = _master(setup, "+70000000206")
    setup.commit()
    master_id, user_id = master.id, user.id
    setup.close()

    now = canonical_instant(datetime(2026, 11, 1, 12, tzinfo=timezone.utc))
    candidate = _utc_interval(datetime(2026, 11, 2, 7))
    barrier = Barrier(2)
    lock = Lock()
    outcomes = []

    def admit(db):
        ensure_candidate_available(_availability_for(db, master_id, now), candidate)
        block = CalendarBlock(
            master_id=master_id,
            created_by_user_id=user_id,
            start_utc_us=candidate.start.epoch_microseconds,
            end_utc_us=candidate.end.epoch_microseconds,
            time_zone=MOSCOW,
        )
        db.add(block)
        db.flush()
        return block.id

    def attempt():
        barrier.wait()
        try:
            outcome = ("created", run_sqlite_admission(database, admit))
        except AdmissionConflict as exc:
            outcome = ("conflict", exc.code)
        with lock:
            outcomes.append(outcome)

    threads = [Thread(target=attempt) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert sorted(kind for kind, _ in outcomes) == ["conflict", "created"]
    check = database()
    try:
        assert check.query(CalendarBlock).filter_by(master_id=master_id).count() == 1
    finally:
        check.close()

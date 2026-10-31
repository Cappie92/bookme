"""Phase B2: unified booking admission on disposable file SQLite.

Every concurrency test uses independent sessions on one database file, so
SQLite's real writer reservation (BEGIN IMMEDIATE) is what serializes them.
"""

from __future__ import annotations

import inspect
from datetime import datetime, time, timedelta, timezone
from threading import Barrier, Lock, Thread
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

import services.booking_admission as admission_module
from auth import get_password_hash
from database import Base
from models import (
    Booking,
    BookingStatus,
    CalendarBlock,
    IndieMaster,
    Master,
    MasterSchedule,
    Service,
    TemporaryBooking,
    User,
    UserRole,
)
from services.booking_admission import (
    ADMISSION_MODE_ENV,
    BOOKING_TIME_INVALID_CODE,
    BOOKING_TIME_UNRESOLVED_CODE,
    MASTER_TIMEZONE_REQUIRED_CODE,
    admission_mode,
    admit_booking_request,
    admit_booking_update,
    admit_calendar_block,
    admit_hold_promotion,
    expire_pending_holds,
    filter_slots_unified,
    mark_booking_mutated,
    online_booking_metadata,
    request_interval,
    resolve_admission_owner,
    unified_admission_enabled,
)
from services.calendar_readiness import readiness_report
from utils.booking_limit_guard import (
    BOOKING_LIMIT_ERROR_CODE,
    BOOKING_SLOT_BUSY_CODE,
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
    holds_booking_writer_reservation,
)
from utils.booking_occupancy import BOOKING_SLOT_CONFLICT_CODE

MSK = ZoneInfo("Europe/Moscow")


@pytest.fixture
def unified(monkeypatch):
    monkeypatch.setenv(ADMISSION_MODE_ENV, "unified")


@pytest.fixture
def factory(tmp_path, unified):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'b2.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 5},
    )
    Base.metadata.create_all(bind=engine)
    yield sessionmaker(bind=engine, autoflush=False)
    engine.dispose()


def _seed(Session, suffix="a", zone="Europe/Moscow"):
    db = Session()
    owner = User(
        email=f"b2-owner-{suffix}@test.local",
        phone=f"+7966{abs(hash(('o', suffix))) % 10_000_000:07d}",
        full_name="B2 owner",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    client = User(
        email=f"b2-client-{suffix}@test.local",
        phone=f"+7965{abs(hash(('c', suffix))) % 10_000_000:07d}",
        full_name="B2 client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add_all([owner, client])
    db.flush()
    master = Master(user_id=owner.id, bio="", experience_years=0, timezone=zone)
    service = Service(name=f"B2 service {suffix}", duration=60, price=1000)
    db.add_all([master, service])
    db.commit()
    ids = {"owner": owner.id, "client": client.id, "master": master.id, "service": service.id}
    db.close()
    return ids


def _future_msk(days=3, hour=12, minute=0):
    day = datetime.now(MSK).date() + timedelta(days=days)
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MSK)


def _create(Session, ids, start, end=None, *, status_value="created"):
    """The unified create sequence every booking route follows."""
    end = end or start + timedelta(hours=1)
    db = Session()
    try:
        begin_booking_creation_transaction(db)
        decision = admit_booking_request(db, start=start, end=end, master_id=ids["master"])
        data = {
            "client_id": ids["client"],
            "master_id": ids["master"],
            "service_id": ids["service"],
            "start_time": start,
            "end_time": end,
            "status": status_value,
            "payment_amount": 1000,
        }
        enforce_booking_creation_limit(db, data)
        data.update(online_booking_metadata(decision, ids["client"]))
        booking = Booking(**data)
        db.add(booking)
        db.commit()
        return booking.id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _hold(Session, ids, start, end=None, *, status_value="pending", expires_in=20):
    end = end or start + timedelta(hours=1)
    db = Session()
    try:
        begin_booking_creation_transaction(db)
        columns = admit_booking_request(
            db, start=start, end=end, master_id=ids["master"]
        ).time_columns()
        hold = TemporaryBooking(
            master_id=ids["master"],
            client_id=ids["client"],
            service_id=ids["service"],
            payment_amount=1000,
            expires_at=datetime.utcnow() + timedelta(minutes=expires_in),
            status=status_value,
            **columns,
        )
        db.add(hold)
        db.commit()
        return hold.id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _legacy_booking(Session, ids, wall_start, *, status_value="created", hours=1):
    db = Session()
    booking = Booking(
        client_id=ids["client"],
        master_id=ids["master"],
        service_id=ids["service"],
        start_time=wall_start,
        end_time=wall_start + timedelta(hours=hours),
        status=status_value,
        payment_amount=1000,
    )
    db.add(booking)
    db.commit()
    booking_id = booking.id
    db.close()
    return booking_id


def _code(exc: HTTPException) -> str:
    return (exc.headers or {}).get("X-Error-Code", str(exc.status_code))


def _expect(code, fn, *args, **kwargs):
    with pytest.raises(HTTPException) as caught:
        fn(*args, **kwargs)
    assert _code(caught.value) == code, caught.value.detail
    return caught.value


# --- feature flag -----------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(None, "legacy"), ("", "legacy"), ("legacy", "legacy"), ("1", "legacy"),
     ("true", "legacy"), ("on", "legacy"), ("unified", "unified"), (" Unified ", "unified")],
)
def test_flag_is_off_unless_explicitly_unified(monkeypatch, raw, expected):
    if raw is None:
        monkeypatch.delenv(ADMISSION_MODE_ENV, raising=False)
    else:
        monkeypatch.setenv(ADMISSION_MODE_ENV, raw)
    assert admission_mode() == expected
    assert unified_admission_enabled() is (expected == "unified")


def test_production_env_files_do_not_enable_unified_admission():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in {".env", ".yml", ".yaml", ".toml", ".ini", ".service"}:
            continue
        if any(part in {"node_modules", ".git", "tests"} for part in path.parts):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        assert "CALENDAR_ADMISSION_MODE=unified" not in content, path
        assert "CALENDAR_ADMISSION_MODE: unified" not in content, path


# --- canonical writes and interval semantics --------------------------------


def test_new_booking_stores_canonical_utc_and_master_wall(factory):
    ids = _seed(factory)
    start = _future_msk().astimezone(ZoneInfo("Asia/Yekaterinburg"))
    booking_id = _create(factory, ids, start)
    db = factory()
    row = db.get(Booking, booking_id)
    expected = request_interval(start, start + timedelta(hours=1), "Europe/Moscow")
    assert row.start_utc_us == expected.start.epoch_microseconds
    assert row.end_utc_us == expected.end.epoch_microseconds
    assert row.time_zone == "Europe/Moscow"
    assert row.start_time == start.astimezone(MSK).replace(tzinfo=None)
    assert row.source == "online"
    assert row.created_by_user_id == ids["client"]
    db.close()


def test_same_instant_with_different_offsets_is_a_conflict(factory):
    ids = _seed(factory)
    start = _future_msk()
    _create(factory, ids, start)
    for alias in (start.astimezone(timezone.utc), start.astimezone(ZoneInfo("Asia/Tokyo"))):
        _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, alias)
    naive_master_wall = start.replace(tzinfo=None)
    _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, naive_master_wall)


@pytest.mark.parametrize(
    ("offset_minutes", "duration_minutes", "conflict"),
    [
        (0, 60, True),       # identical
        (30, 60, True),      # partial tail overlap
        (-30, 60, True),     # partial head overlap
        (15, 30, True),      # contained
        (-30, 120, True),    # containing
        (60, 60, False),     # adjacent after
        (-60, 60, False),    # adjacent before
    ],
)
def test_half_open_overlap_semantics(factory, offset_minutes, duration_minutes, conflict):
    ids = _seed(factory)
    base = _future_msk()
    _create(factory, ids, base)
    start = base + timedelta(minutes=offset_minutes)
    end = start + timedelta(minutes=duration_minutes)
    if conflict:
        _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, start, end)
    else:
        assert _create(factory, ids, start, end)


@pytest.mark.parametrize(
    "status_value",
    [
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.PAYMENT_EXPIRED.value,
        "rejected",
    ],
)
def test_non_occupying_bookings_never_block(factory, status_value):
    ids = _seed(factory)
    start = _future_msk()
    _create(factory, ids, start, status_value=status_value)
    assert _create(factory, ids, start)


def test_completed_booking_still_occupies(factory):
    ids = _seed(factory)
    start = _future_msk()
    _create(factory, ids, start, status_value=BookingStatus.COMPLETED.value)
    _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, start)


def test_dst_gap_and_fold_are_rejected_not_guessed(factory):
    ids = _seed(factory, zone="Europe/Berlin")
    year = datetime.now(timezone.utc).year + 1
    gap = datetime(year, 3, 29, 2, 30)
    while gap.weekday() != 6:
        gap -= timedelta(days=1)
    fold = datetime(year, 10, 31, 2, 30)
    while fold.weekday() != 6:
        fold -= timedelta(days=1)
    _expect(BOOKING_TIME_INVALID_CODE, _create, factory, ids, gap)
    _expect(BOOKING_TIME_INVALID_CODE, _create, factory, ids, fold)
    explicit_fold = fold.replace(tzinfo=timezone(timedelta(hours=1)))
    assert _create(factory, ids, explicit_fold)


def test_master_without_timezone_fails_closed(factory):
    ids = _seed(factory, zone=None)
    _expect(MASTER_TIMEZONE_REQUIRED_CODE, _create, factory, ids, _future_msk())


def test_admission_re_reserves_after_an_intermediate_commit(factory):
    """client restrictions may commit mid-route; the deciding reads must still be reserved."""
    ids = _seed(factory)
    db = factory()
    begin_booking_creation_transaction(db)
    db.commit()
    assert not holds_booking_writer_reservation(db)
    start = _future_msk()
    admit_booking_request(db, start=start, end=start + timedelta(hours=1), master_id=ids["master"])
    assert holds_booking_writer_reservation(db)
    db.rollback()
    db.close()


def test_admission_refuses_to_re_reserve_over_unflushed_mutations(factory):
    ids = _seed(factory)
    db = factory()
    db.add(User(email="b2-dirty@test.local", phone="+79640000002", full_name="x",
                role=UserRole.CLIENT, is_active=True, is_verified=True))
    db.flush()
    db.get(User, ids["client"]).full_name = "dirty"
    with pytest.raises(RuntimeError):
        admit_booking_request(db, start=_future_msk(), end=_future_msk(hour=13), master_id=ids["master"])
    db.rollback()
    db.close()


def test_stale_guard_flag_after_commit_re_reserves(factory):
    db = factory()
    begin_booking_creation_transaction(db)
    assert holds_booking_writer_reservation(db)
    db.commit()
    assert db.info.get("booking_creation_transaction") is True
    assert not holds_booking_writer_reservation(db)
    begin_booking_creation_transaction(db)
    assert holds_booking_writer_reservation(db)
    db.rollback()
    db.close()


# --- holds -------------------------------------------------------------------


def test_pending_hold_blocks_online_booking_and_vice_versa(factory):
    ids = _seed(factory)
    start = _future_msk()
    _hold(factory, ids, start)
    _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, start + timedelta(minutes=30))
    other = start + timedelta(hours=3)
    _create(factory, ids, other)
    _expect(BOOKING_SLOT_CONFLICT_CODE, _hold, factory, ids, other)


def test_expired_and_finished_holds_do_not_block(factory):
    ids = _seed(factory)
    start = _future_msk()
    _hold(factory, ids, start, expires_in=-1)
    assert _create(factory, ids, start)
    later = start + timedelta(hours=3)
    for status_value in ("expired", "paid", "cancelled"):
        _hold(factory, ids, later, status_value=status_value)
    assert _create(factory, ids, later)


def test_hold_promotion_excludes_only_its_own_hold(factory):
    ids = _seed(factory)
    start = _future_msk()
    hold_id = _hold(factory, ids, start)
    db = factory()
    begin_booking_creation_transaction(db)
    decision = admit_hold_promotion(db, db.get(TemporaryBooking, hold_id))
    assert decision.interval.start.epoch_microseconds == db.get(TemporaryBooking, hold_id).start_utc_us
    db.rollback()
    # A second, overlapping hold inserted behind the guard still blocks promotion.
    other = TemporaryBooking(
        master_id=ids["master"], client_id=ids["client"], service_id=ids["service"],
        payment_amount=1000, expires_at=datetime.utcnow() + timedelta(minutes=20),
        status="pending", **decision.time_columns(),
    )
    db.add(other)
    db.commit()
    begin_booking_creation_transaction(db)
    _expect(BOOKING_SLOT_CONFLICT_CODE, admit_hold_promotion, db, db.get(TemporaryBooking, hold_id))
    db.rollback()
    db.close()


def test_legacy_hold_without_canonical_time_cannot_be_promoted(factory):
    ids = _seed(factory)
    db = factory()
    wall = _future_msk().replace(tzinfo=None)
    hold = TemporaryBooking(
        master_id=ids["master"], client_id=ids["client"], service_id=ids["service"],
        start_time=wall, end_time=wall + timedelta(hours=1), payment_amount=1000,
        expires_at=datetime.utcnow() + timedelta(minutes=20), status="pending",
    )
    db.add(hold)
    db.commit()
    begin_booking_creation_transaction(db)
    _expect(BOOKING_TIME_UNRESOLVED_CODE, admit_hold_promotion, db, hold)
    db.rollback()
    db.close()


def test_guarded_expiry_never_overwrites_a_paid_hold(factory):
    ids = _seed(factory)
    start = _future_msk()
    pending_id = _hold(factory, ids, start)
    paid_id = _hold(factory, ids, start + timedelta(hours=2), status_value="paid")
    db = factory()
    assert expire_pending_holds(db, [pending_id, paid_id]) == 1
    db.commit()
    assert db.get(TemporaryBooking, pending_id).status == "expired"
    assert db.get(TemporaryBooking, paid_id).status == "paid"
    assert expire_pending_holds(db, []) == 0
    db.close()


# --- legacy compatibility ---------------------------------------------------


def test_nearby_legacy_row_fails_closed_with_503_not_409(factory):
    ids = _seed(factory)
    start = _future_msk()
    _legacy_booking(factory, ids, start.replace(tzinfo=None) + timedelta(hours=5))
    error = _expect(BOOKING_TIME_UNRESOLVED_CODE, _create, factory, ids, start)
    assert error.status_code == 503


def test_distant_legacy_history_does_not_block(factory):
    ids = _seed(factory)
    start = _future_msk(days=5)
    utc_wall = start.astimezone(timezone.utc).replace(tzinfo=None)
    # Ends exactly 12h before the candidate read as UTC: provably disjoint.
    _legacy_booking(factory, ids, utc_wall - timedelta(hours=13))
    _legacy_booking(factory, ids, utc_wall + timedelta(hours=15))
    _legacy_booking(factory, ids, utc_wall - timedelta(days=30))
    assert _create(factory, ids, start)


def test_legacy_confirmation_without_move_is_not_readmitted(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _legacy_booking(factory, ids, start.replace(tzinfo=None))
    db = factory()
    begin_booking_creation_transaction(db)
    booking = db.get(Booking, booking_id)
    assert admit_booking_update(db, booking, {"status": "confirmed"}) is None
    assert admit_booking_update(db, booking, {"status": "cancelled"}) is None
    assert admit_booking_update(db, booking, {"notes": "x"}) is None
    db.rollback()
    db.close()


def test_reactivation_of_past_legacy_booking_is_allowed(factory):
    ids = _seed(factory)
    past = datetime.utcnow() - timedelta(days=2)
    booking_id = _legacy_booking(factory, ids, past, status_value="cancelled")
    db = factory()
    begin_booking_creation_transaction(db)
    assert admit_booking_update(db, db.get(Booking, booking_id), {"status": "completed"}) is None
    db.rollback()
    db.close()


def test_reactivation_of_future_legacy_booking_fails_closed(factory):
    ids = _seed(factory)
    wall = _future_msk().replace(tzinfo=None)
    booking_id = _legacy_booking(factory, ids, wall, status_value="cancelled")
    db = factory()
    begin_booking_creation_transaction(db)
    _expect(BOOKING_TIME_UNRESOLVED_CODE, admit_booking_update, db,
            db.get(Booking, booking_id), {"status": "created"})
    db.rollback()
    db.close()


def test_reactivation_into_taken_time_is_a_conflict(factory):
    ids = _seed(factory)
    start = _future_msk()
    cancelled_id = _create(factory, ids, start, status_value="cancelled")
    _create(factory, ids, start)
    db = factory()
    begin_booking_creation_transaction(db)
    _expect(BOOKING_SLOT_CONFLICT_CODE, admit_booking_update, db,
            db.get(Booking, cancelled_id), {"status": "created"})
    db.rollback()
    db.close()


def test_readiness_report_counts_only_relevant_unresolved_rows(factory):
    ids = _seed(factory)
    ready_ids = _seed(factory, "ready")
    _create(factory, ready_ids, _future_msk())
    _legacy_booking(factory, ids, _future_msk().replace(tzinfo=None))
    _legacy_booking(factory, ids, datetime.utcnow() - timedelta(days=10))
    _legacy_booking(factory, ids, _future_msk(days=4).replace(tzinfo=None), status_value="cancelled")
    _seed(factory, "no-zone", zone=None)
    db = factory()
    report = readiness_report(db)
    data = report.as_dict()
    assert data["activation_ready"] is False
    assert data["masters_total"] == 3
    assert data["masters_ready"] == 1
    assert data["unresolved_bookings"] == 1
    assert data["invalid_timezone_masters"] == 1
    assert ids["master"] in data["blocked_master_ids"]
    assert ready_ids["master"] not in data["blocked_master_ids"]
    assert data["candidate_master_zone"]["resolvable"] == 1
    assert not db.new and not db.dirty and not db.deleted
    db.close()


def test_legacy_row_with_missing_end_fails_closed_and_is_reported(factory):
    ids = _seed(factory)
    start = _future_msk()
    db = factory()
    db.add(Booking(client_id=ids["client"], master_id=ids["master"], service_id=ids["service"],
                   start_time=start.replace(tzinfo=None) - timedelta(days=3), end_time=None,
                   status="created", payment_amount=1000))
    db.commit()
    db.close()
    _expect(BOOKING_TIME_UNRESOLVED_CODE, _create, factory, ids, start)
    db = factory()
    assert readiness_report(db).unresolved_bookings == 1
    db.close()


def test_readiness_flags_future_bookings_without_a_master(factory):
    ids = _seed(factory)
    db = factory()
    wall = _future_msk().replace(tzinfo=None)
    db.add(Booking(client_id=ids["client"], service_id=ids["service"], start_time=wall,
                   end_time=wall + timedelta(hours=1), status="created", payment_amount=1000))
    db.commit()
    report = readiness_report(db)
    assert report.ownerless_bookings == 1
    assert report.as_dict()["activation_ready"] is False
    db.close()


# --- moves --------------------------------------------------------------------


def test_moving_a_cancelled_booking_keeps_canonical_columns_consistent(factory):
    from services.calendar_adapters import booking_interval

    ids = _seed(factory)
    start = _future_msk()
    booking_id = _create(factory, ids, start, status_value="cancelled")
    db = factory()
    begin_booking_creation_transaction(db)
    booking = db.get(Booking, booking_id)
    target = start + timedelta(days=1)
    changes = {"start_time": target, "end_time": target + timedelta(hours=1)}
    decision = admit_booking_update(db, booking, changes)
    booking.start_time, booking.end_time = changes["start_time"], changes["end_time"]
    mark_booking_mutated(booking, decision)
    db.commit()
    moved = db.get(Booking, booking_id)
    resolved = booking_interval(moved)
    assert resolved.is_resolved
    assert resolved.interval.start.epoch_microseconds == decision.interval.start.epoch_microseconds
    db.close()


def test_stale_canonical_columns_are_cleared_when_wall_moves_without_decision(factory):
    ids = _seed(factory)
    booking_id = _create(factory, ids, _future_msk())
    db = factory()
    booking = db.get(Booking, booking_id)
    booking.start_time = booking.start_time + timedelta(hours=2)
    booking.end_time = booking.end_time + timedelta(hours=2)
    mark_booking_mutated(booking, None)
    db.commit()
    row = db.get(Booking, booking_id)
    assert (row.start_utc_us, row.end_utc_us, row.time_zone) == (None, None, None)
    db.close()


def test_consistent_canonical_columns_survive_a_status_only_mutation(factory):
    ids = _seed(factory)
    booking_id = _create(factory, ids, _future_msk())
    db = factory()
    booking = db.get(Booking, booking_id)
    before = booking.start_utc_us
    booking.status = "confirmed"
    mark_booking_mutated(booking, None)
    db.commit()
    assert db.get(Booking, booking_id).start_utc_us == before
    db.close()


def test_reschedule_requires_full_interval_and_excludes_itself(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _create(factory, ids, start)
    db = factory()
    begin_booking_creation_transaction(db)
    booking = db.get(Booking, booking_id)
    _expect(BOOKING_TIME_INVALID_CODE, admit_booking_update, db, booking,
            {"start_time": start + timedelta(minutes=30)})
    shifted = start + timedelta(minutes=30)
    decision = admit_booking_update(
        db, booking, {"start_time": shifted, "end_time": shifted + timedelta(hours=1)}
    )
    old_version = booking.version
    booking.start_time, booking.end_time = shifted, shifted + timedelta(hours=1)
    mark_booking_mutated(booking, decision)
    db.commit()
    moved = db.get(Booking, booking_id)
    assert moved.version == old_version + 1
    assert moved.start_time == shifted.replace(tzinfo=None)
    assert moved.start_utc_us == decision.interval.start.epoch_microseconds
    db.close()


def test_reschedule_into_other_booking_is_a_conflict(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _create(factory, ids, start)
    _create(factory, ids, start + timedelta(hours=2))
    db = factory()
    begin_booking_creation_transaction(db)
    target = start + timedelta(hours=2, minutes=30)
    _expect(BOOKING_SLOT_CONFLICT_CODE, admit_booking_update, db, db.get(Booking, booking_id),
            {"start_time": target, "end_time": target + timedelta(hours=1)})
    db.rollback()
    db.close()


# --- owner isolation ---------------------------------------------------------


def test_masters_do_not_block_each_other(factory):
    first = _seed(factory, "first")
    second = _seed(factory, "second")
    start = _future_msk()
    _create(factory, first, start)
    assert _create(factory, second, start)


def test_indie_rows_occupy_their_master(factory):
    ids = _seed(factory)
    db = factory()
    indie = IndieMaster(user_id=ids["owner"], master_id=ids["master"], domain="b2-indie", timezone="Europe/Moscow")
    db.add(indie)
    db.commit()
    indie_id = indie.id
    owner = resolve_admission_owner(db, indie_master_id=indie_id)
    assert owner.master_id == ids["master"] and owner.indie_master_id == indie_id
    start = _future_msk()
    begin_booking_creation_transaction(db)
    decision = admit_booking_request(db, start=start, end=start + timedelta(hours=1), indie_master_id=indie_id)
    db.add(Booking(
        client_id=ids["client"], indie_master_id=indie_id, service_id=ids["service"],
        status="created", payment_amount=1000, **decision.time_columns(),
    ))
    db.commit()
    db.close()
    _expect(BOOKING_SLOT_CONFLICT_CODE, _create, factory, ids, start)


# --- Free cap ------------------------------------------------------------------


def test_free_cap_is_still_enforced_after_admission(factory):
    ids = _seed(factory)
    base = _future_msk(days=2, hour=0)
    for index in range(20):
        _create(factory, ids, base + timedelta(hours=index))
    error = _expect("409", _create, factory, ids, base + timedelta(days=2))
    assert error.detail["code"] == BOOKING_LIMIT_ERROR_CODE
    db = factory()
    assert db.query(Booking).count() == 20
    db.close()


# --- errors, rollback, retry, busy ----------------------------------------


def test_conflict_rolls_back_ancillary_rows_and_retry_succeeds(factory):
    ids = _seed(factory)
    start = _future_msk()
    _create(factory, ids, start)
    db = factory()
    begin_booking_creation_transaction(db)
    db.add(User(email="b2-orphan@test.local", phone="+79640000001", full_name="x",
                role=UserRole.CLIENT, is_active=True, is_verified=True))
    db.flush()
    with pytest.raises(HTTPException):
        admit_booking_request(db, start=start, end=start + timedelta(hours=1), master_id=ids["master"])
    db.rollback()
    assert db.query(User).filter(User.email == "b2-orphan@test.local").count() == 0
    begin_booking_creation_transaction(db)
    later = start + timedelta(hours=1)
    decision = admit_booking_request(db, start=later, end=later + timedelta(hours=1), master_id=ids["master"])
    db.add(Booking(client_id=ids["client"], master_id=ids["master"], service_id=ids["service"],
                   status="created", payment_amount=1000, **decision.time_columns()))
    db.commit()
    assert db.query(Booking).count() == 2
    db.close()


def test_busy_writer_is_503_and_never_a_conflict(tmp_path, unified):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'busy.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 0.05},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    holder = Session()
    holder.execute(text("BEGIN IMMEDIATE"))
    contender = Session()
    try:
        error = _expect(BOOKING_SLOT_BUSY_CODE, begin_booking_creation_transaction, contender)
        assert error.status_code == 503
        assert error.headers["Retry-After"] == "1"
    finally:
        contender.close()
        holder.rollback()
        holder.close()
        engine.dispose()


def test_busy_hold_expiry_is_503_not_500(tmp_path, unified):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'expiry-busy.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 0.05},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    holder = Session()
    holder.execute(text("BEGIN IMMEDIATE"))
    contender = Session()
    try:
        error = _expect(BOOKING_SLOT_BUSY_CODE, expire_pending_holds, contender, [1])
        assert error.status_code == 503
    finally:
        contender.close()
        holder.rollback()
        holder.close()
        engine.dispose()


def test_locked_read_during_admission_maps_to_busy(factory, monkeypatch):
    ids = _seed(factory)

    def locked(*args, **kwargs):
        raise OperationalError("SELECT", {}, Exception("database is locked"))

    monkeypatch.setattr(admission_module, "load_owner_occupancy", locked)
    db = factory()
    begin_booking_creation_transaction(db)
    error = _expect(BOOKING_SLOT_BUSY_CODE, admit_booking_request, db,
                    start=_future_msk(), end=_future_msk(hour=13), master_id=ids["master"])
    assert error.status_code == 503
    db.rollback()
    db.close()


# --- concurrency -----------------------------------------------------------------


def _race(*attempts):
    barrier = Barrier(len(attempts))
    lock = Lock()
    results = []

    def run(attempt):
        barrier.wait()
        try:
            attempt()
            outcome = "ok"
        except HTTPException as exc:
            outcome = _code(exc)
        with lock:
            results.append(outcome)

    threads = [Thread(target=run, args=(attempt,)) for attempt in attempts]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    assert all(not thread.is_alive() for thread in threads)
    return sorted(results)


def test_online_vs_online_same_slot(factory):
    ids = _seed(factory)
    start = _future_msk()
    results = _race(*[lambda: _create(factory, ids, start)] * 4)
    assert results.count("ok") == 1
    assert results.count(BOOKING_SLOT_CONFLICT_CODE) == 3


def test_online_vs_online_partial_overlap_with_different_offsets(factory):
    ids = _seed(factory)
    start = _future_msk()
    other = (start + timedelta(minutes=30)).astimezone(timezone.utc)
    results = _race(lambda: _create(factory, ids, start), lambda: _create(factory, ids, other))
    assert results == sorted(["ok", BOOKING_SLOT_CONFLICT_CODE])


def test_online_vs_hold(factory):
    ids = _seed(factory)
    start = _future_msk()
    results = _race(lambda: _create(factory, ids, start), lambda: _hold(factory, ids, start))
    assert results == sorted(["ok", BOOKING_SLOT_CONFLICT_CODE])
    db = factory()
    total = db.query(Booking).count() + db.query(TemporaryBooking).count()
    assert total == 1
    db.close()


def test_reschedule_vs_create(factory):
    ids = _seed(factory)
    start = _future_msk()
    booking_id = _create(factory, ids, start)
    target = start + timedelta(hours=3)

    def move():
        db = factory()
        try:
            begin_booking_creation_transaction(db)
            booking = db.get(Booking, booking_id)
            decision = admit_booking_update(
                db, booking, {"start_time": target, "end_time": target + timedelta(hours=1)}
            )
            booking.start_time, booking.end_time = target, target + timedelta(hours=1)
            mark_booking_mutated(booking, decision)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    results = _race(move, lambda: _create(factory, ids, target))
    assert results == sorted(["ok", BOOKING_SLOT_CONFLICT_CODE])
    db = factory()
    occupying = [b for b in db.query(Booking).all() if b.start_utc_us is not None]
    starts = sorted(b.start_utc_us for b in occupying)
    assert len(starts) == len(set(starts))
    db.close()


def test_manual_ready_block_admission_vs_online(factory):
    ids = _seed(factory)
    start = _future_msk()

    def block():
        db = factory()
        try:
            begin_booking_creation_transaction(db)
            interval = request_interval(start, start + timedelta(hours=1), "Europe/Moscow")
            decision = admit_calendar_block(db, master_id=ids["master"], interval=interval)
            columns = decision.time_columns()
            db.add(CalendarBlock(
                master_id=ids["master"], created_by_user_id=ids["owner"], category="busy",
                start_utc_us=columns["start_utc_us"], end_utc_us=columns["end_utc_us"],
                time_zone=columns["time_zone"],
            ))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    results = _race(block, lambda: _create(factory, ids, start))
    assert results == sorted(["ok", BOOKING_SLOT_CONFLICT_CODE])


def test_deleted_block_does_not_occupy(factory):
    ids = _seed(factory)
    start = _future_msk()
    interval = request_interval(start, start + timedelta(hours=1), "Europe/Moscow")
    db = factory()
    db.add(CalendarBlock(
        master_id=ids["master"], created_by_user_id=ids["owner"], category="busy",
        start_utc_us=interval.start.epoch_microseconds, end_utc_us=interval.end.epoch_microseconds,
        time_zone="Europe/Moscow", deleted_at=datetime.utcnow(),
    ))
    db.commit()
    db.close()
    assert _create(factory, ids, start)


# --- any-master selection ------------------------------------------------------------


def _salon_with(Session, ids):
    from models import AvailabilitySlot, OwnerType, Salon, master_services, salon_masters

    db = Session()
    salon = Salon(user_id=ids["owner"], name="B2 salon", domain=f"b2-salon-{ids['master']}")
    db.add(salon)
    db.flush()
    db.execute(salon_masters.insert().values(salon_id=salon.id, master_id=ids["master"]))
    db.execute(master_services.insert().values(master_id=ids["master"], service_id=ids["service"]))
    for day in range(1, 8):
        db.add(AvailabilitySlot(owner_type=OwnerType.MASTER, owner_id=ids["master"], day_of_week=day,
                                start_time=time(0, 0), end_time=time(23, 59)))
    db.commit()
    salon_id = salon.id
    db.close()
    return salon_id


def test_any_master_selection_reports_unresolved_instead_of_conflict(factory):
    from services.scheduling import get_best_master_for_slot

    ids = _seed(factory)
    salon_id = _salon_with(factory, ids)
    wall = _future_msk().replace(tzinfo=None)
    db = factory()
    best = get_best_master_for_slot(db, salon_id, ids["service"], wall, wall + timedelta(hours=1))
    assert best["id"] == ids["master"]
    db.close()

    _legacy_booking(factory, ids, wall + timedelta(hours=5))
    db = factory()
    _expect(BOOKING_TIME_UNRESOLVED_CODE, get_best_master_for_slot,
            db, salon_id, ids["service"], wall, wall + timedelta(hours=1))
    db.close()


def test_any_master_selection_skips_a_proven_busy_master(factory):
    from services.scheduling import get_best_master_for_slot

    ids = _seed(factory)
    salon_id = _salon_with(factory, ids)
    start = _future_msk()
    _create(factory, ids, start + timedelta(minutes=30))
    wall = start.replace(tzinfo=None)
    db = factory()
    assert get_best_master_for_slot(db, salon_id, ids["service"], wall, wall + timedelta(hours=1)) is None
    db.close()


# --- slot listing ------------------------------------------------------------------


def test_slot_filter_drops_occupied_and_fails_closed_on_legacy(factory):
    ids = _seed(factory)
    start = _future_msk()
    _create(factory, ids, start)
    wall = start.replace(tzinfo=None)
    slots = [
        {"start_time": wall - timedelta(hours=1), "end_time": wall},
        {"start_time": wall + timedelta(minutes=30), "end_time": wall + timedelta(minutes=90)},
        {"start_time": wall + timedelta(hours=1), "end_time": wall + timedelta(hours=2)},
    ]
    db = factory()
    owner = resolve_admission_owner(db, master_id=ids["master"])
    kept = filter_slots_unified(db, owner, slots)
    assert [slot["start_time"] for slot in kept] == [slots[0]["start_time"], slots[2]["start_time"]]
    db.close()
    _legacy_booking(factory, ids, wall + timedelta(hours=4))
    db = factory()
    assert filter_slots_unified(db, owner, slots) == []
    db.close()


# --- wiring ------------------------------------------------------------------------


def test_every_occupancy_write_path_has_a_unified_branch():
    from routers import accounting, bookings, client, master, public_master
    from services import scheduling, temporary_bookings_cleanup

    expectations = {
        bookings.create_booking: ("admit_booking_request", "online_booking_metadata"),
        bookings._validate_specific_public_booking: ("admit_booking_request",),
        bookings._create_specific_public_booking_after_proof: ("online_booking_metadata",),
        bookings._create_any_master_public_booking_after_proof: ("admit_booking_request", "online_booking_metadata"),
        bookings.update_booking: ("reserve_booking_writer", "admit_booking_update", "mark_booking_mutated"),
        bookings.create_edit_request: ("admit_booking_request",),
        bookings.update_edit_request: ("reserve_booking_writer", "admit_booking_update", "mark_booking_mutated"),
        client.create_booking: ("admit_booking_request", "online_booking_metadata"),
        client.update_booking: ("reserve_booking_writer", "admit_booking_update", "mark_booking_mutated"),
        client.create_temporary_booking: ("reserve_booking_writer", "admit_booking_request", "time_columns"),
        client.confirm_temporary_booking_payment: ("admit_hold_promotion", "online_booking_metadata"),
        client.get_temporary_booking_status: ("expire_pending_holds",),
        public_master.create_public_booking: ("admit_booking_request", "online_booking_metadata"),
        master.update_master_booking_time: ("reserve_booking_writer", "admit_booking_update", "mark_booking_mutated"),
        accounting.update_booking_status: ("reserve_booking_writer", "admit_booking_update", "mark_booking_mutated"),
        scheduling.get_available_slots: ("_unified_slot_filter",),
        scheduling.get_available_slots_any_master_logic: ("_unified_slot_filter",),
        scheduling.get_best_master_for_slot: ("slot_occupancy_state", "booking_time_unresolved"),
        temporary_bookings_cleanup.cleanup_expired_temporary_bookings: ("expire_pending_holds",),
    }
    for function, markers in expectations.items():
        source = inspect.getsource(function)
        for marker in markers:
            assert marker in source, f"{function.__qualname__} misses {marker}"


# --- API (TestClient) ------------------------------------------------------------


def _api_world(db, suffix):
    client_user = User(
        email=f"b2-api-client-{suffix}@example.com", hashed_password=get_password_hash("testpassword"),
        phone=f"+7963{abs(hash(('ac', suffix))) % 10_000_000:07d}", full_name="B2 API Client",
        role=UserRole.CLIENT, is_active=True, is_verified=True, is_phone_verified=True,
    )
    other_client = User(
        email=f"b2-api-other-{suffix}@example.com", hashed_password=get_password_hash("testpassword"),
        phone=f"+7962{abs(hash(('ao', suffix))) % 10_000_000:07d}", full_name="B2 API Other",
        role=UserRole.CLIENT, is_active=True, is_verified=True, is_phone_verified=True,
    )
    master_user = User(
        email=f"b2-api-master-{suffix}@example.com", hashed_password=get_password_hash("testpassword"),
        phone=f"+7961{abs(hash(('am', suffix))) % 10_000_000:07d}", full_name="B2 API Master",
        role=UserRole.MASTER, is_active=True, is_verified=True, is_phone_verified=True,
    )
    db.add_all([client_user, other_client, master_user])
    db.commit()
    master = Master(user_id=master_user.id, bio="", experience_years=1,
                    timezone="Europe/Moscow", timezone_confirmed=True)
    service = Service(name="B2 Haircut", price=1000, duration=60, salon_id=None)
    db.add_all([master, service])
    db.commit()
    start = _future_msk(days=3).replace(tzinfo=None)
    db.add(MasterSchedule(master_id=master.id, salon_id=None, date=start.date(),
                          start_time=time(0, 0), end_time=time(23, 59), is_available=True))
    db.commit()
    return {
        "client_phone": str(client_user.phone), "other_phone": str(other_client.phone),
        "master_phone": str(master_user.phone), "client_id": int(client_user.id),
        "master_id": int(master.id), "service_id": int(service.id), "start": start,
    }


def _login(api, phone):
    response = api.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _client_payload(world, start):
    return {
        "service_id": world["service_id"], "master_id": world["master_id"],
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
        "status": "created", "client_name": "B2", "service_name": "B2 Haircut",
        "service_duration": 60, "service_price": 1000.0,
    }


def test_api_client_create_conflict_is_409_with_stable_code(client, db, unified):
    world = _api_world(db, "create")
    headers = _login(client, world["client_phone"])
    first = client.post("/api/client/bookings/", json=_client_payload(world, world["start"]), headers=headers)
    assert first.status_code == 200, first.text
    row = db.get(Booking, first.json()["id"])
    assert row.start_utc_us is not None and row.source == "online"
    aware_alias = world["start"].replace(tzinfo=MSK).astimezone(timezone.utc)
    second = client.post("/api/client/bookings/", json=_client_payload(world, aware_alias), headers=headers)
    assert second.status_code == 409, second.text
    assert second.headers["X-Error-Code"] == BOOKING_SLOT_CONFLICT_CODE
    assert second.json()["detail"] == "Выбранное время уже занято"


def test_api_reschedules_share_409_and_update_canonical_columns(client, db, unified):
    world = _api_world(db, "move")
    client_headers = _login(client, world["client_phone"])
    start = world["start"]
    ids = [
        client.post("/api/client/bookings/", json=_client_payload(world, start + timedelta(hours=h)),
                    headers=client_headers).json()["id"]
        for h in (0, 2)
    ]
    master_headers = _login(client, world["master_phone"])
    overlap = start + timedelta(hours=1, minutes=30)
    by_client = client.put(f"/api/client/bookings/{ids[0]}", json={"start_time": overlap.isoformat()},
                           headers=client_headers)
    by_master = client.put(f"/api/master/bookings/{ids[0]}/time",
                           json={"start_time": overlap.isoformat(),
                                 "end_time": (overlap + timedelta(hours=1)).isoformat()},
                           headers=master_headers)
    for response in (by_client, by_master):
        assert response.status_code == 409, response.text
        assert response.headers["X-Error-Code"] == BOOKING_SLOT_CONFLICT_CODE

    adjacent = start + timedelta(hours=1)
    before = db.get(Booking, ids[0]).version
    moved = client.put(f"/api/client/bookings/{ids[0]}", json={"start_time": adjacent.isoformat()},
                       headers=client_headers)
    assert moved.status_code == 200, moved.text
    db.expire_all()
    row = db.get(Booking, ids[0])
    assert row.start_time == adjacent
    expected = request_interval(adjacent, adjacent + timedelta(hours=1), "Europe/Moscow")
    assert row.start_utc_us == expected.start.epoch_microseconds
    assert row.version == before + 1


def test_api_object_level_authorization_is_unchanged(client, db, unified):
    world = _api_world(db, "authz")
    headers = _login(client, world["client_phone"])
    booking_id = client.post("/api/client/bookings/", json=_client_payload(world, world["start"]),
                             headers=headers).json()["id"]
    other = _login(client, world["other_phone"])
    target = world["start"] + timedelta(hours=4)
    response = client.put(f"/api/client/bookings/{booking_id}", json={"start_time": target.isoformat()},
                          headers=other)
    assert response.status_code == 404
    response = client.put(f"/api/master/bookings/{booking_id}/time",
                          json={"start_time": target.isoformat(),
                                "end_time": (target + timedelta(hours=1)).isoformat()},
                          headers=other)
    assert response.status_code in {403, 404}
    db.expire_all()
    assert db.get(Booking, booking_id).start_time == world["start"]


def test_api_edit_request_accept_is_admitted_under_reservation(client, db, unified):
    world = _api_world(db, "edit")
    client_headers = _login(client, world["client_phone"])
    start = world["start"]
    booking_id = client.post("/api/client/bookings/", json=_client_payload(world, start),
                             headers=client_headers).json()["id"]
    target = start + timedelta(hours=3)
    proposal = {"booking_id": booking_id, "proposed_start": target.isoformat(),
                "proposed_end": (target + timedelta(hours=1)).isoformat()}
    created = client.post(f"/api/bookings/{booking_id}/edit-requests", json=proposal, headers=client_headers)
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    blocker = client.post("/api/client/bookings/",
                          json=_client_payload(world, target + timedelta(minutes=30)), headers=client_headers)
    assert blocker.status_code == 200, blocker.text
    master_headers = _login(client, world["master_phone"])
    rejected = client.put(f"/api/bookings/edit-requests/{request_id}", json={"status": "accepted"},
                          headers=master_headers)
    assert rejected.status_code == 409, rejected.text
    assert rejected.headers["X-Error-Code"] == BOOKING_SLOT_CONFLICT_CODE
    db.expire_all()
    assert db.get(Booking, booking_id).start_time == start

    db.query(Booking).filter(Booking.id == blocker.json()["id"]).update({"status": "cancelled"})
    db.commit()
    master_headers = _login(client, world["master_phone"])
    accepted = client.put(f"/api/bookings/edit-requests/{request_id}", json={"status": "accepted"},
                          headers=master_headers)
    assert accepted.status_code == 200, accepted.text
    db.expire_all()
    moved = db.get(Booking, booking_id)
    assert moved.start_time == target
    expected = request_interval(target, target + timedelta(hours=1), "Europe/Moscow")
    assert moved.start_utc_us == expected.start.epoch_microseconds


def test_api_legacy_mode_keeps_previous_contract(client, db, monkeypatch):
    monkeypatch.delenv(ADMISSION_MODE_ENV, raising=False)
    world = _api_world(db, "legacy")
    headers = _login(client, world["client_phone"])
    first = client.post("/api/client/bookings/", json=_client_payload(world, world["start"]), headers=headers)
    assert first.status_code == 200, first.text
    assert db.get(Booking, first.json()["id"]).start_utc_us is None
    second = client.post("/api/client/bookings/", json=_client_payload(world, world["start"]), headers=headers)
    assert second.status_code == 409
    other = client.post("/api/client/bookings/",
                        json=_client_payload(world, world["start"] + timedelta(hours=2)), headers=headers)
    response = client.put(f"/api/client/bookings/{other.json()['id']}",
                          json={"start_time": (world["start"] + timedelta(minutes=30)).isoformat()},
                          headers=headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Выбранное время уже занято"

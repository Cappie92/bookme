from datetime import datetime, timedelta, timezone
from threading import Barrier, Lock, Thread

import pytest
from sqlalchemy import (
    Column,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    create_engine,
    insert,
    select,
    text,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from services.calendar_admission import (
    AdmissionBusy,
    AdmissionConflict,
    AdmissionPolicyViolation,
    AdmissionUnresolvedTime,
    SQLiteAdmissionTransaction,
    TransactionState,
    ensure_candidate_available,
    run_sqlite_admission,
)
from services.calendar_availability import AvailabilityResult, AvailabilityState
from services.calendar_time import canonical_interval


metadata = MetaData()
occupancy = Table(
    "calendar_test_occupancy",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("owner_id", Integer, nullable=False),
    Column("start_us", Integer, nullable=False),
    Column("end_us", Integer, nullable=False),
)
receipts = Table(
    "calendar_test_receipts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("owner_id", Integer, nullable=False),
    Column("request_key", String, nullable=False),
    Column("intent", String, nullable=False),
    Column("occupancy_id", Integer, nullable=False),
    UniqueConstraint("owner_id", "request_key"),
)


def _database(tmp_path, name="admission", timeout=2):
    engine = create_engine(
        f"sqlite:///{tmp_path / f'{name}.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": timeout},
        poolclass=NullPool,
    )
    metadata.create_all(engine)
    return engine, sessionmaker(bind=engine, autoflush=False)


def _micros(interval):
    return interval.start.epoch_microseconds, interval.end.epoch_microseconds


def _interval(hour, minute=0, duration_minutes=60, offset_hours=0):
    offset = timezone(timedelta(hours=offset_hours))
    start = datetime(2026, 1, 1, hour, minute, tzinfo=offset)
    return canonical_interval(start, start + timedelta(minutes=duration_minutes))


def _insert_if_free(db, owner_id, interval):
    start_us, end_us = _micros(interval)
    conflict = db.execute(
        select(occupancy.c.id).where(
            occupancy.c.owner_id == owner_id,
            occupancy.c.start_us < end_us,
            occupancy.c.end_us > start_us,
        )
    ).first()
    if conflict:
        raise AdmissionConflict("BOOKING_SLOT_CONFLICT", "occupied")
    return db.execute(
        insert(occupancy).values(
            owner_id=owner_id,
            start_us=start_us,
            end_us=end_us,
        )
    ).inserted_primary_key[0]


def _concurrent_attempts(Session, intervals):
    barrier = Barrier(len(intervals))
    result_lock = Lock()
    results = []

    def attempt(interval):
        barrier.wait()
        try:
            row_id = run_sqlite_admission(
                Session,
                lambda db: _insert_if_free(db, 1, interval),
            )
            result = ("created", row_id)
        except AdmissionConflict as exc:
            result = ("conflict", exc.code)
        with result_lock:
            results.append(result)

    threads = [Thread(target=attempt, args=(interval,)) for interval in intervals]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    assert all(not thread.is_alive() for thread in threads)
    return results


def test_two_independent_connections_cannot_create_the_same_slot(tmp_path):
    engine, Session = _database(tmp_path, "same")
    results = _concurrent_attempts(Session, [_interval(10), _interval(10)])

    assert sorted(result[0] for result in results) == ["conflict", "created"]
    with engine.connect() as connection:
        assert connection.execute(select(occupancy.c.id)).all().__len__() == 1
    engine.dispose()


def test_adjacent_intervals_both_commit(tmp_path):
    engine, Session = _database(tmp_path, "adjacent")
    results = _concurrent_attempts(Session, [_interval(10), _interval(11)])

    assert [result[0] for result in results].count("created") == 2
    engine.dispose()


def test_partially_overlapping_intervals_have_one_winner(tmp_path):
    engine, Session = _database(tmp_path, "overlap")
    results = _concurrent_attempts(
        Session,
        [_interval(10, duration_minutes=90), _interval(11, duration_minutes=60)],
    )

    assert sorted(result[0] for result in results) == ["conflict", "created"]
    engine.dispose()


def test_equal_instants_with_different_offsets_conflict(tmp_path):
    engine, Session = _database(tmp_path, "offset")
    utc_interval = _interval(9, offset_hours=0)
    moscow_interval = _interval(12, offset_hours=3)
    results = _concurrent_attempts(Session, [utc_interval, moscow_interval])

    assert sorted(result[0] for result in results) == ["conflict", "created"]
    engine.dispose()


def test_idempotency_receipt_is_persisted_in_the_same_transaction(tmp_path):
    engine, Session = _database(tmp_path, "idempotency")
    interval = _interval(10)

    def operation(db, intent):
        existing = (
            db.execute(
                select(receipts).where(
                    receipts.c.owner_id == 1,
                    receipts.c.request_key == "request-1",
                )
            )
            .mappings()
            .first()
        )
        if existing:
            if existing["intent"] != intent:
                raise AdmissionConflict("IDEMPOTENCY_CONFLICT", "intent changed")
            return existing["occupancy_id"]
        row_id = _insert_if_free(db, 1, interval)
        db.execute(
            insert(receipts).values(
                owner_id=1,
                request_key="request-1",
                intent=intent,
                occupancy_id=row_id,
            )
        )
        return row_id

    first = run_sqlite_admission(Session, lambda db: operation(db, "same"))
    repeated = run_sqlite_admission(Session, lambda db: operation(db, "same"))
    assert repeated == first
    with pytest.raises(AdmissionConflict, match="intent changed"):
        run_sqlite_admission(Session, lambda db: operation(db, "different"))

    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 1
        assert len(connection.execute(select(receipts)).all()) == 1
    engine.dispose()


def test_busy_writer_is_503_class_not_domain_conflict(tmp_path):
    engine, Session = _database(tmp_path, "busy", timeout=0.05)
    holder = Session()
    holder.execute(text("BEGIN IMMEDIATE"))
    try:
        with pytest.raises(AdmissionBusy) as caught:
            run_sqlite_admission(
                Session, lambda db: _insert_if_free(db, 1, _interval(10))
            )
        assert caught.value.code == "BOOKING_SLOT_BUSY"
        assert caught.value.retry_after_seconds == 1
        assert not isinstance(caught.value, AdmissionConflict)
    finally:
        holder.rollback()
        holder.close()
        engine.dispose()


def test_busy_during_commit_is_also_503_class(tmp_path):
    engine, Session = _database(tmp_path, "busy-commit", timeout=0.05)
    with engine.begin() as connection:
        connection.execute(insert(occupancy).values(owner_id=99, start_us=1, end_us=2))
    reader = Session()
    reader.execute(text("BEGIN"))
    reader.execute(select(occupancy)).all()
    try:
        with pytest.raises(AdmissionBusy):
            run_sqlite_admission(
                Session,
                lambda db: _insert_if_free(db, 1, _interval(10)),
            )
    finally:
        reader.rollback()
        reader.close()
    with engine.connect() as connection:
        assert (
            len(
                connection.execute(
                    select(occupancy).where(occupancy.c.owner_id == 1)
                ).all()
            )
            == 0
        )
    engine.dispose()


def test_domain_error_rolls_back_all_rows_and_clears_marker(tmp_path):
    engine, Session = _database(tmp_path, "rollback")
    session = Session()
    transaction = SQLiteAdmissionTransaction(session)
    with pytest.raises(AdmissionConflict):
        with transaction:
            row_id = _insert_if_free(session, 1, _interval(10))
            session.execute(
                insert(receipts).values(
                    owner_id=1,
                    request_key="rolled-back",
                    intent="same",
                    occupancy_id=row_id,
                )
            )
            raise AdmissionConflict("BOOKING_SLOT_CONFLICT", "later validation failed")

    assert transaction.state is TransactionState.ROLLED_BACK
    assert "calendar_admission_transaction" not in session.info
    with SQLiteAdmissionTransaction(session) as next_transaction:
        _insert_if_free(session, 1, _interval(12))
    assert next_transaction.state is TransactionState.COMMITTED
    session.close()

    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 1
        assert len(connection.execute(select(receipts)).all()) == 0
    engine.dispose()


def test_operation_cannot_commit_inside_reserved_boundary(tmp_path):
    engine, Session = _database(tmp_path, "inner-commit")

    def unsafe_operation(db):
        _insert_if_free(db, 1, _interval(10))
        db.commit()

    with pytest.raises(RuntimeError, match="cannot commit"):
        run_sqlite_admission(Session, unsafe_operation)
    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 0
    engine.dispose()


def test_operation_cannot_commit_a_savepoint(tmp_path):
    engine, Session = _database(tmp_path, "savepoint")

    def unsafe_operation(db):
        with db.begin_nested():
            _insert_if_free(db, 1, _interval(10))

    with pytest.raises(RuntimeError, match="cannot commit"):
        run_sqlite_admission(Session, unsafe_operation)
    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 0
    engine.dispose()


def test_internal_rollback_clears_marker_and_later_work_is_not_committed(tmp_path):
    engine, Session = _database(tmp_path, "inner-rollback")

    def unsafe_operation(db):
        db.rollback()
        assert "calendar_admission_transaction" not in db.info
        db.execute(insert(occupancy).values(owner_id=1, start_us=1, end_us=2))

    with pytest.raises(RuntimeError, match="ended the reserved"):
        run_sqlite_admission(Session, unsafe_operation)
    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 0
    engine.dispose()


def test_database_integrity_failure_is_not_reclassified_as_conflict(tmp_path):
    engine, Session = _database(tmp_path, "integrity")

    def invalid_write(db):
        db.execute(insert(occupancy).values(owner_id=1, start_us=None, end_us=2))

    with pytest.raises(IntegrityError):
        run_sqlite_admission(Session, invalid_write)
    with engine.connect() as connection:
        assert len(connection.execute(select(occupancy)).all()) == 0
    engine.dispose()


def test_clean_autobegin_read_is_replaced_but_explicit_transaction_is_not(tmp_path):
    engine, Session = _database(tmp_path, "autobegin")
    session = Session()
    session.execute(select(occupancy)).all()
    with SQLiteAdmissionTransaction(session):
        _insert_if_free(session, 1, _interval(10))
    session.close()

    explicit = Session()
    with explicit.begin():
        with pytest.raises(RuntimeError, match="explicit transaction"):
            with SQLiteAdmissionTransaction(explicit):
                pass
    explicit.close()
    engine.dispose()


def test_reservation_rejects_prior_mutations(tmp_path):
    engine, Session = _database(tmp_path, "ordering")
    session = Session()
    session.execute(insert(occupancy).values(owner_id=1, start_us=1, end_us=2))

    with pytest.raises(RuntimeError, match="before mutations"):
        with SQLiteAdmissionTransaction(session):
            pass
    session.rollback()
    session.close()
    engine.dispose()


def test_unresolved_and_proven_conflict_have_different_classification():
    candidate = _interval(10)
    unresolved = AvailabilityResult(
        AvailabilityState.UNRESOLVED,
        (),
        ("booking:legacy",),
    )
    unavailable = AvailabilityResult(
        AvailabilityState.READY,
        (),
        occupied_intervals=(candidate,),
        grid_starts=(candidate.start,),
    )

    with pytest.raises(AdmissionUnresolvedTime):
        ensure_candidate_available(unresolved, candidate)
    with pytest.raises(AdmissionConflict):
        ensure_candidate_available(unavailable, candidate)
    ensure_candidate_available(
        AvailabilityResult(
            AvailabilityState.READY,
            (candidate,),
            working_windows=(candidate,),
            grid_starts=(candidate.start,),
        ),
        candidate,
    )


def test_outside_hours_override_never_bypasses_occupancy_or_grid():
    candidate = _interval(8)
    working = _interval(10)
    outside = AvailabilityResult(
        AvailabilityState.READY,
        (),
        working_windows=(working,),
        grid_starts=(candidate.start,),
    )

    with pytest.raises(AdmissionPolicyViolation) as outside_error:
        ensure_candidate_available(outside, candidate)
    assert outside_error.value.code == "BOOKING_OUTSIDE_WORKING_HOURS"
    ensure_candidate_available(
        outside,
        candidate,
        allow_outside_working_hours=True,
    )

    occupied = AvailabilityResult(
        AvailabilityState.READY,
        (),
        working_windows=(working,),
        occupied_intervals=(candidate,),
        grid_starts=(candidate.start,),
    )
    with pytest.raises(AdmissionConflict) as occupied_error:
        ensure_candidate_available(
            occupied,
            candidate,
            allow_outside_working_hours=True,
        )
    assert occupied_error.value.code == "BOOKING_SLOT_CONFLICT"

    with pytest.raises(AdmissionPolicyViolation) as grid_error:
        ensure_candidate_available(
            AvailabilityResult(
                AvailabilityState.READY,
                (),
                working_windows=(working,),
            ),
            candidate,
            allow_outside_working_hours=True,
        )
    assert grid_error.value.code == "BOOKING_SLOT_OFF_GRID"

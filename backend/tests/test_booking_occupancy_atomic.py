from __future__ import annotations

import inspect
from datetime import datetime, timedelta
from threading import Barrier, Lock, Thread

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    AppliedDiscount,
    Booking,
    BookingStatus,
    Master,
    OwnerType,
    Service,
    User,
    UserRole,
)
from services.scheduling import (
    _is_slot_available,
    check_booking_conflicts,
    get_available_slots,
    get_available_slots_any_master_logic,
    get_best_master_for_slot,
)
from utils.booking_limit_guard import (
    BOOKING_SLOT_BUSY_CODE,
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
)
from utils.booking_occupancy import (
    BOOKING_SLOT_CONFLICT_CODE,
    apply_occupying_filter,
    booking_slot_conflict,
    has_overlapping_booking,
    intervals_overlap,
)


def _seed_owner(db, suffix: str):
    owner = User(
        email=f"atomic-owner-{suffix}@test.local",
        phone=f"+7977{abs(hash(('owner', suffix))) % 10_000_000:07d}",
        full_name="Atomic owner",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    client = User(
        email=f"atomic-client-{suffix}@test.local",
        phone=f"+7976{abs(hash(('client', suffix))) % 10_000_000:07d}",
        full_name="Atomic client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add_all([owner, client])
    db.flush()
    master = Master(user_id=owner.id, bio="", experience_years=0)
    service = Service(name=f"Atomic service {suffix}", duration=60, price=1000)
    db.add_all([master, service])
    db.commit()
    return owner, client, master, service


def _booking_data(client_id, master_id, service_id, start, *, status_value="created"):
    return {
        "client_id": client_id,
        "master_id": master_id,
        "service_id": service_id,
        "start_time": start,
        "end_time": start + timedelta(hours=1),
        "status": status_value,
        "payment_amount": 1000,
    }


def test_half_open_interval_semantics():
    start = datetime(2026, 9, 1, 10)
    end = start + timedelta(hours=1)
    assert intervals_overlap(start, end, start, end) is True
    assert intervals_overlap(start, end, start + timedelta(minutes=30), end + timedelta(minutes=30)) is True
    assert intervals_overlap(start, end, end, end + timedelta(hours=1)) is False
    assert intervals_overlap(start, end, start - timedelta(hours=1), start) is False


@pytest.mark.parametrize(
    ("status_value", "occupies"),
    [
        (BookingStatus.CREATED.value, True),
        (BookingStatus.CONFIRMED.value, True),
        (BookingStatus.COMPLETED.value, True),
        (BookingStatus.CANCELLED.value, False),
        (BookingStatus.CANCELLED_BY_CLIENT_EARLY.value, False),
        (BookingStatus.CANCELLED_BY_CLIENT_LATE.value, False),
        (BookingStatus.PAYMENT_EXPIRED.value, False),
        ("rejected", False),
    ],
)
def test_conflict_and_availability_share_status_semantics(db, status_value, occupies):
    _, client, master, service = _seed_owner(db, status_value)
    start = datetime.utcnow() + timedelta(days=2)
    db.add(Booking(**_booking_data(client.id, master.id, service.id, start, status_value=status_value)))
    db.commit()

    assert check_booking_conflicts(
        db,
        start,
        start + timedelta(hours=1),
        OwnerType.MASTER,
        master.id,
    ) is occupies
    occupying = apply_occupying_filter(
        db.query(Booking).filter(Booking.master_id == master.id)
    ).all()
    assert _is_slot_available(start.time(), 60, occupying, start.date()) is (not occupies)


def test_same_slot_concurrent_create_is_serialized(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'same-slot.sqlite'}",
        connect_args={"check_same_thread": False, "timeout": 5},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    setup = Session()
    _, client, master, service = _seed_owner(setup, "same-slot")
    client_id, master_id, service_id = client.id, master.id, service.id
    setup.close()
    start = datetime.utcnow() + timedelta(days=3)
    barrier = Barrier(2)
    result_lock = Lock()
    results: list[str] = []

    def attempt() -> None:
        db = Session()
        data = _booking_data(client_id, master_id, service_id, start)
        barrier.wait()
        try:
            begin_booking_creation_transaction(db)
            if has_overlapping_booking(
                db,
                data["start_time"],
                data["end_time"],
                OwnerType.MASTER,
                master_id,
            ):
                raise booking_slot_conflict()
            enforce_booking_creation_limit(db, data, now_utc=datetime.utcnow())
            db.add(Booking(**data))
            db.commit()
            outcome = "created"
        except HTTPException as exc:
            db.rollback()
            outcome = (exc.headers or {}).get("X-Error-Code", str(exc.status_code))
        finally:
            db.close()
        with result_lock:
            results.append(outcome)

    threads = [Thread(target=attempt), Thread(target=attempt)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert all(not thread.is_alive() for thread in threads)
    assert sorted(results) == [BOOKING_SLOT_CONFLICT_CODE, "created"]
    verify = Session()
    assert verify.query(Booking).filter(Booking.master_id == master_id).count() == 1
    assert verify.query(Service).filter(Service.id == service_id).count() == 1
    assert verify.query(User).filter(User.id == client_id).count() == 1
    verify.close()
    engine.dispose()


def test_busy_writer_has_stable_retry_contract(tmp_path):
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
        with pytest.raises(HTTPException) as caught:
            begin_booking_creation_transaction(contender)
        assert caught.value.status_code == 503
        assert caught.value.detail == "Сервис временно недоступен, повторите попытку"
        assert caught.value.headers["X-Error-Code"] == BOOKING_SLOT_BUSY_CODE
        assert caught.value.headers["Retry-After"] == "1"
    finally:
        contender.close()
        holder.rollback()
        holder.close()
        engine.dispose()


def test_ancillary_rows_rollback_with_failed_booking(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'rollback.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    setup = Session()
    _, existing_client, master, service = _seed_owner(setup, "rollback")
    start = datetime.utcnow() + timedelta(days=4)
    setup.add(Booking(**_booking_data(existing_client.id, master.id, service.id, start)))
    setup.commit()
    existing_client_id = existing_client.id
    master_id = master.id
    service_id = service.id
    setup.close()

    db = Session()
    begin_booking_creation_transaction(db)
    orphan_client = User(
        email="atomic-orphan-client@test.local",
        phone="+79750000001",
        full_name="Must rollback",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    orphan_service = Service(name="Atomic orphan service", duration=45, price=500)
    db.add_all([orphan_client, orphan_service])
    db.flush()
    try:
        if has_overlapping_booking(
            db,
            start,
            start + timedelta(hours=1),
            OwnerType.MASTER,
            master_id,
        ):
            raise booking_slot_conflict()
    except HTTPException:
        db.rollback()
    finally:
        db.close()

    verify = Session()
    assert verify.query(User).filter(User.email == "atomic-orphan-client@test.local").count() == 0
    assert verify.query(Service).filter(Service.name == "Atomic orphan service").count() == 0
    verify.close()

    db = Session()
    begin_booking_creation_transaction(db)
    late_start = start + timedelta(hours=3)
    booking = Booking(**_booking_data(existing_client_id, master_id, service_id, late_start))
    db.add(booking)
    db.flush()
    db.add(
        AppliedDiscount(
            booking_id=booking.id,
            discount_id=None,
            personal_discount_id=None,
            discount_percent=10,
            discount_amount=100,
        )
    )
    db.flush()
    db.rollback()
    db.close()

    verify = Session()
    assert verify.query(Booking).filter(Booking.start_time == late_start).count() == 0
    assert verify.query(AppliedDiscount).count() == 0
    verify.close()
    engine.dispose()


def test_current_create_paths_keep_one_transaction_and_verify_first():
    from routers import bookings as bookings_router
    from routers import client as client_router
    from routers import public_master as public_master_router

    direct_paths = (
        bookings_router.create_booking,
        client_router.create_booking,
        client_router.confirm_temporary_booking_payment,
        public_master_router.create_public_booking,
    )
    for function in direct_paths:
        source = inspect.getsource(function)
        assert "begin_booking_creation_transaction" in source
        assert "check_booking_conflicts" in source
        assert "enforce_booking_creation_limit" in source

    confirm_source = inspect.getsource(
        bookings_router.confirm_public_booking_phone_verification
    )
    assert "begin_booking_creation_transaction" in confirm_source
    assert "_create_specific_public_booking_after_proof" in confirm_source
    assert "_create_any_master_public_booking_after_proof" in confirm_source

    preproof_source = inspect.getsource(bookings_router.create_booking_public)
    assert "Booking(" not in preproof_source
    assert "_resolve_or_create_verified_public_client" not in preproof_source

    for helper in (
        bookings_router._create_specific_public_booking_after_proof,
        bookings_router._create_any_master_public_booking_after_proof,
    ):
        source = inspect.getsource(helper)
        assert "check_booking_conflicts" in source or "_validate_specific_public_booking" in source
        assert "enforce_booking_creation_limit" in source


def test_availability_functions_use_canonical_occupancy_filter():
    assert "apply_occupying_filter" in inspect.getsource(get_available_slots)
    assert "apply_occupying_filter" in inspect.getsource(get_available_slots_any_master_logic)
    best_source = inspect.getsource(get_best_master_for_slot)
    assert "apply_occupying_filter" in best_source
    assert "has_overlapping_booking" in best_source

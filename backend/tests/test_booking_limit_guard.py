from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Barrier, Lock, Thread

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    Booking,
    BookingStatus,
    Master,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from utils.booking_limit_guard import (
    BOOKING_LIMIT_ERROR_CODE,
    FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT,
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
)


def _owner(db, suffix: str, *, always_free: bool = False):
    user = User(
        email=f"limit-{suffix}@test.local",
        phone=f"+7999{abs(hash(suffix)) % 10_000_000:07d}",
        full_name="Limit owner",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_always_free=always_free,
    )
    db.add(user)
    db.flush()
    master = Master(user_id=user.id, bio="", experience_years=0)
    service = Service(name=f"Limit service {suffix}", price=100, duration=60, salon_id=None)
    db.add_all([master, service])
    db.commit()
    return user, master, service


def _data(master, service, now, *, status=BookingStatus.CREATED.value, offset=1):
    start = now + timedelta(hours=offset)
    return {
        "client_id": master.user_id,
        "service_id": service.id,
        "master_id": master.id,
        "indie_master_id": None,
        "start_time": start,
        "end_time": start + timedelta(hours=1),
        "status": getattr(status, "value", status),
        "payment_amount": 100,
    }


def _insert(db, data):
    db.add(Booking(**data))


def test_free_19_allows_twentieth_and_20_rejects_next(db):
    now = datetime.utcnow()
    _, master, service = _owner(db, "free-boundary")
    for index in range(19):
        _insert(db, _data(master, service, now, offset=index + 1))
    db.commit()

    begin_booking_creation_transaction(db)
    twentieth = _data(master, service, now, offset=30)
    enforce_booking_creation_limit(db, twentieth, now_utc=now)
    _insert(db, twentieth)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        enforce_booking_creation_limit(db, _data(master, service, now, offset=31), now_utc=now)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == BOOKING_LIMIT_ERROR_CODE
    assert exc.value.detail["limit"] == FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT


def test_inactive_and_past_rows_do_not_count(db):
    now = datetime.utcnow()
    _, master, service = _owner(db, "inactive")
    excluded = [
        BookingStatus.CANCELLED,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY,
        BookingStatus.CANCELLED_BY_CLIENT_LATE,
        BookingStatus.COMPLETED,
        BookingStatus.PAYMENT_EXPIRED,
    ]
    for index, status in enumerate(excluded):
        _insert(db, _data(master, service, now, status=status, offset=index + 1))
    _insert(db, _data(master, service, now, offset=-3))
    for index in range(19):
        _insert(db, _data(master, service, now, offset=index + 20))
    db.commit()

    begin_booking_creation_transaction(db)
    enforce_booking_creation_limit(db, _data(master, service, now, offset=60), now_utc=now)


def test_timezone_aware_candidate_is_compared_in_utc(db):
    now = datetime.utcnow()
    _, master, service = _owner(db, "aware")
    data = _data(master, service, now, offset=1)
    data["start_time"] = (now + timedelta(hours=1)).replace(tzinfo=timezone.utc)
    begin_booking_creation_transaction(db)
    enforce_booking_creation_limit(db, data, now_utc=now)


def test_paid_unlimited_and_always_free_bypass(db):
    now = datetime.utcnow()
    paid_user, paid_master, paid_service = _owner(db, "paid")
    plan = SubscriptionPlan(
        name="Paid unlimited guard test",
        display_name="Paid",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1,
        price_3months=1,
        price_6months=1,
        price_12months=1,
        features={},
        limits={"max_future_bookings": None},
        is_active=True,
    )
    db.add(plan)
    db.flush()
    db.add(Subscription(
        user_id=paid_user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        price=1,
        daily_rate=0,
        is_active=True,
        plan_id=plan.id,
    ))
    _, free_master, free_service = _owner(db, "always-free", always_free=True)
    for master, service in ((paid_master, paid_service), (free_master, free_service)):
        for index in range(21):
            _insert(db, _data(master, service, now, offset=index + 1))
    db.commit()

    begin_booking_creation_transaction(db)
    enforce_booking_creation_limit(db, _data(paid_master, paid_service, now, offset=40), now_utc=now)
    enforce_booking_creation_limit(db, _data(free_master, free_service, now, offset=40), now_utc=now)


def test_all_business_booking_insert_paths_use_the_guard():
    root = Path(__file__).resolve().parents[1]
    expected = {
        "routers/bookings.py": (3, 3),
        "routers/client.py": (2, 2),
        "routers/public_master.py": (1, 1),
    }
    for relative, (begin_count, enforce_count) in expected.items():
        source = (root / relative).read_text(encoding="utf-8")
        assert source.count("begin_booking_creation_transaction(db)") == begin_count
        assert source.count("enforce_booking_creation_limit(db,") == enforce_count

    dev_source = (root / "routers/dev_testdata.py").read_text(encoding="utf-8")
    assert "Booking(**norm)" in dev_source  # Explicitly retained internal/test bypass.


def test_sqlite_concurrent_requests_cannot_both_cross_the_boundary(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'booking-limit.db'}",
        connect_args={"check_same_thread": False, "timeout": 5},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    setup = Session()
    now = datetime.utcnow()
    _, master, service = _owner(setup, "concurrent")
    for index in range(19):
        _insert(setup, _data(master, service, now, offset=index + 1))
    setup.commit()
    master_id, service_id, user_id = master.id, service.id, master.user_id
    setup.close()

    ready = Barrier(2)
    result_lock = Lock()
    results: list[str] = []

    def attempt(offset: int) -> None:
        session = Session()
        candidate = {
            "client_id": user_id,
            "service_id": service_id,
            "master_id": master_id,
            "indie_master_id": None,
            "start_time": now + timedelta(hours=offset),
            "end_time": now + timedelta(hours=offset + 1),
            "status": BookingStatus.CREATED.value,
            "payment_amount": 100,
        }
        ready.wait()
        try:
            begin_booking_creation_transaction(session)
            enforce_booking_creation_limit(session, candidate, now_utc=now)
            session.add(Booking(**candidate))
            session.commit()
            outcome = "created"
        except HTTPException as exc:
            session.rollback()
            outcome = str(exc.detail.get("code"))
        finally:
            session.close()
        with result_lock:
            results.append(outcome)

    # Different valid slots prove that the serialized Free-limit check, rather
    # than the slot-conflict guard, rejects the second concurrent request.
    threads = [Thread(target=attempt, args=(50,)), Thread(target=attempt, args=(52,))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert all(not thread.is_alive() for thread in threads)
    assert sorted(results) == ["created", BOOKING_LIMIT_ERROR_CODE]
    verify = Session()
    assert verify.query(Booking).filter(Booking.master_id == master_id).count() == 20
    verify.close()
    engine.dispose()

"""Phase B2.3: consumers compare a proven instant with now, and leave legacy rows alone."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from auth import get_password_hash
from models import Booking, BookingStatus, Master, Service, User, UserRole
from services.booking_visit_finalize import finalize_post_visit_booking
from utils.calendar_ics import booking_start_end_utc
from services.calendar_time import canonical_instant
from utils.booking_hard_delete import get_hard_delete_blockers
from utils.booking_limit_guard import (
    FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT,
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
)
from utils.booking_status import get_effective_booking_status
from utils.master_future_bookings_query import (
    active_future_core,
    booking_starts_after,
    cancelled_future_core,
)

UTC = timezone.utc


def _us(value: datetime) -> int:
    return canonical_instant(value).epoch_microseconds


def _pair(zone: str, wall: datetime):
    start = wall.replace(tzinfo=ZoneInfo(zone))
    end = start + timedelta(hours=1)
    return start, end


def _people(db, zone="Europe/Moscow"):
    client = User(
        email="b23-client@example.com", phone="+79002300001", full_name="B23 client",
        hashed_password=get_password_hash("testpassword"), role=UserRole.CLIENT,
        is_active=True, is_verified=True, is_phone_verified=True,
    )
    master_user = User(
        email="b23-master@example.com", phone="+79002300002", full_name="B23 master",
        hashed_password=get_password_hash("testpassword"), role=UserRole.MASTER,
        is_active=True, is_verified=True, is_phone_verified=True,
    )
    db.add_all([client, master_user])
    db.commit()
    master = Master(
        user_id=master_user.id, bio="", experience_years=1, timezone=zone,
        timezone_confirmed=True, city="Москва",
    )
    service = Service(name="B23 cut", price=1000, duration=60, salon_id=None)
    db.add_all([master, service])
    db.commit()
    return client, master, service


def _row(db, master, client, service, zone, wall, *, canonical=True, status=BookingStatus.CREATED):
    start, end = _pair(zone, wall)
    booking = Booking(
        master_id=master.id, client_id=client.id, service_id=service.id,
        start_time=wall, end_time=wall + timedelta(hours=1), status=status,
    )
    if canonical:
        booking.start_utc_us = _us(start)
        booking.end_utc_us = _us(end)
        booking.time_zone = zone
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _ids(db, clause):
    return {row.id for row in db.query(Booking).filter(clause).all()}


def test_canonical_instant_splits_from_legacy_digits_across_offsets(db):
    client, master, service = _people(db)
    now = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    # Moscow +3: wall 14:00 is 11:00 UTC, already past. Digits 14:00 still look future.
    moscow = _row(db, master, client, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0))
    # New York -4 in July: wall 09:00 is 13:00 UTC, still future. Digits 09:00 look past.
    york = _row(db, master, client, service, "America/New_York", datetime(2026, 7, 15, 9, 0))
    # UTC+0 at the exact instant is not future.
    exact = _row(db, master, client, service, "UTC", datetime(2026, 7, 15, 12, 0))
    legacy = _row(
        db, master, client, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0), canonical=False
    )
    future = _ids(db, active_future_core(now))
    assert moscow.id not in future
    assert york.id in future
    assert exact.id not in future
    assert legacy.id in future
    assert booking_starts_after(moscow, now) is False
    assert booking_starts_after(york, now) is True
    assert booking_starts_after(legacy, now) is True


def test_calendar_link_uses_the_proven_instant(db):
    person, master, service = _people(db, "UTC")
    booking = _row(db, master, person, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0))
    start_utc, end_utc = booking_start_end_utc(booking, "UTC")
    assert start_utc.astimezone(UTC) == datetime(2026, 7, 15, 11, 0, tzinfo=UTC)
    assert end_utc.astimezone(UTC) == datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    legacy = _row(
        db, master, person, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0), canonical=False
    )
    legacy_start, _legacy_end = booking_start_end_utc(legacy, "Europe/Moscow")
    assert legacy_start.astimezone(UTC) == datetime(2026, 7, 15, 11, 0, tzinfo=UTC)


def test_dst_offset_uses_the_instant_not_the_wall_digits(db):
    client, master, service = _people(db, "Europe/Berlin")
    winter = _row(db, master, client, service, "Europe/Berlin", datetime(2026, 1, 15, 12, 0))
    summer = _row(db, master, client, service, "Europe/Berlin", datetime(2026, 7, 15, 12, 0))
    # 12:00 CET is 11:00 UTC. 11:30 UTC is after it, while the wall digits are still ahead.
    assert winter.id not in _ids(db, active_future_core(datetime(2026, 1, 15, 11, 30, tzinfo=UTC)))
    # 12:00 CEST is 10:00 UTC.
    assert summer.id not in _ids(db, active_future_core(datetime(2026, 7, 15, 10, 30, tzinfo=UTC)))
    assert summer.id in _ids(db, active_future_core(datetime(2026, 7, 15, 9, 30, tzinfo=UTC)))


def test_reschedule_and_cancellation_follow_the_stored_instant(db):
    client, master, service = _people(db)
    now = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    booking = _row(db, master, client, service, "Europe/Moscow", datetime(2026, 7, 15, 18, 0))
    assert booking.id in _ids(db, active_future_core(now))
    moved, moved_end = _pair("Europe/Moscow", datetime(2026, 7, 15, 10, 0))
    booking.start_time = datetime(2026, 7, 15, 10, 0)
    booking.end_time = datetime(2026, 7, 15, 11, 0)
    booking.start_utc_us = _us(moved)
    booking.end_utc_us = _us(moved_end)
    db.commit()
    assert booking.id not in _ids(db, active_future_core(now))

    upcoming = _row(db, master, client, service, "Europe/Moscow", datetime(2026, 7, 15, 18, 0),
                    status=BookingStatus.CANCELLED)
    assert upcoming.id not in _ids(db, active_future_core(now))
    assert upcoming.id in _ids(db, cancelled_future_core(now))


def _wall(zone: str, instant: datetime) -> datetime:
    return instant.astimezone(ZoneInfo(zone)).replace(tzinfo=None)


def test_free_cap_counts_canonical_instants_and_keeps_the_limit(db):
    assert FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT == 20
    person, master, service = _people(db, "Europe/Moscow")
    now = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    naive_now = now.replace(tzinfo=None)
    # Instant already passed, but Moscow wall digits are still ahead of UTC now.
    for minute in range(20):
        instant = now - timedelta(minutes=30 + minute)
        _row(db, master, person, service, "Europe/Moscow", _wall("Europe/Moscow", instant))
    begin_booking_creation_transaction(db)
    enforce_booking_creation_limit(db, {
        "master_id": master.id, "service_id": service.id, "client_id": person.id,
        "start_time": naive_now + timedelta(hours=5), "end_time": naive_now + timedelta(hours=6),
        "status": "created",
    }, now_utc=naive_now)

    master.timezone = "America/New_York"
    db.commit()
    # Instant still ahead, while New York wall digits are behind UTC now.
    for minute in range(20):
        instant = now + timedelta(hours=2, minutes=minute)
        _row(db, master, person, service, "America/New_York", _wall("America/New_York", instant))
    begin_booking_creation_transaction(db)
    with pytest.raises(HTTPException) as caught:
        enforce_booking_creation_limit(db, {
            "master_id": master.id, "service_id": service.id, "client_id": person.id,
            "start_time": naive_now + timedelta(days=1), "end_time": naive_now + timedelta(days=1, hours=1),
            "status": "created",
        }, now_utc=naive_now)
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "free_active_booking_limit_reached"
    assert caught.value.detail["limit"] == 20


def test_status_finalize_and_hard_delete_use_the_instant(db):
    person, master, service = _people(db)
    now = datetime.now(UTC)
    passed_instant = now - timedelta(hours=2)
    passed = _row(db, master, person, service, "Europe/Moscow", _wall("Europe/Moscow", passed_instant))
    assert passed.start_time > now.replace(tzinfo=None)
    assert get_effective_booking_status(passed, db, now.replace(tzinfo=None)) == BookingStatus.AWAITING_CONFIRMATION
    assert "past_booking" in get_hard_delete_blockers(db, passed)

    upcoming_instant = now + timedelta(hours=3)
    upcoming = _row(
        db, master, person, service, "America/New_York", _wall("America/New_York", upcoming_instant)
    )
    assert upcoming.start_time < now.replace(tzinfo=None)
    with pytest.raises(ValueError, match="будущ"):
        finalize_post_visit_booking(
            db, booking=upcoming, master_row_id=master.id, master_user_id=master.user_id,
        )
    legacy = _row(
        db, master, person, service, "Europe/Moscow",
        _wall("Europe/Moscow", now + timedelta(hours=2)), canonical=False,
    )
    assert "past_booking" not in get_hard_delete_blockers(db, legacy)


def _login(api, phone):
    response = api.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_client_lists_split_canonical_rows_and_keep_legacy(client, db):
    person, master, service = _people(db)
    phone, master_id, client_id, service_id = person.phone, master.id, person.id, service.id
    headers = _login(client, phone)
    master = db.get(Master, master_id)
    person = db.get(User, client_id)
    service = db.get(Service, service_id)
    past = _row(db, master, person, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0))
    future = _row(db, master, person, service, "America/New_York", datetime(2026, 7, 15, 9, 0))
    legacy = _row(
        db, master, person, service, "Europe/Moscow", datetime(2026, 7, 15, 14, 0), canonical=False
    )
    # Freeze "now" by choosing walls around the real clock is unnecessary:
    # these walls are July 2026 and the suite runs in October 2026, so both
    # instants are past unless we move them relative to utcnow.
    moment = datetime.now(UTC)
    for booking, hours in ((past, -1), (future, 3), (legacy, 2)):
        start = moment + timedelta(hours=hours)
        wall = start.astimezone(ZoneInfo(booking.time_zone or "Europe/Moscow")).replace(tzinfo=None)
        booking.start_time = wall
        booking.end_time = wall + timedelta(hours=1)
        if booking.start_utc_us is not None:
            booking.start_utc_us = _us(start)
            booking.end_utc_us = _us(start + timedelta(hours=1))
    # past: Moscow wall of (now-1h) is still later than utcnow by +3, so the old
    # digit comparison would call it future. Canonical must call it past.
    past.time_zone = "Europe/Moscow"
    db.commit()

    upcoming = client.get("/api/client/bookings/?full=true", headers=headers)
    assert upcoming.status_code == 200, upcoming.text
    upcoming_ids = {item["id"] for item in upcoming.json()}
    gone = client.get("/api/client/bookings/past?full=true", headers=headers)
    assert gone.status_code == 200, gone.text
    gone_ids = {item["id"] for item in gone.json()}
    assert past.id in gone_ids and past.id not in upcoming_ids
    assert future.id in upcoming_ids and future.id not in gone_ids
    assert legacy.id in upcoming_ids and legacy.id not in gone_ids
    assert upcoming.json()[0]["start_time"]

"""Calendar B3: manual bookings, private blocks, Free exemption, isolation."""

from __future__ import annotations

import sqlite3
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

import test_calendar_b1_migration as b1
from auth import create_access_token, normal_session_claims
from main import app
from models import (
    master_services,
    Booking,
    BookingConfirmation,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    CalendarBlock,
    Income,
    LoyaltyTransaction,
    Master,
    MasterClientMetadata,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    Notification,
    NotificationOutbox,
    Payment,
    Service,
    TemporaryBooking,
    User,
    UserRole,
)
from services.booking_admission import request_interval
from services.booking_visit_finalize import finalize_post_visit_booking
from services.calendar_adapters import canonical_time_columns
from services.account_deletion import _deactivate_master_services
from services.calendar_b3 import (
    SERVICE_IN_USE,
    ManualWrite,
    create_manual_booking,
    delete_canonical_service,
    delete_owned_master_service,
)
from services.notification_events import (
    record_booking_cancelled_notification,
    record_booking_created_notification,
    record_booking_rescheduled_notification,
)
from utils.booking_limit_guard import (
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
)

ZONE = "Europe/Moscow"


@pytest.fixture(autouse=True)
def unified_mode(monkeypatch):
    monkeypatch.setenv("CALENDAR_ADMISSION_MODE", "unified")


def _headers(user: User) -> dict:
    token = create_access_token(normal_session_claims(user, "access"))
    return {"Authorization": f"Bearer {token}"}


def _user(db, fixture_password_hash, *, role, email, phone, name) -> User:
    user = User(
        email=email,
        hashed_password=fixture_password_hash("testpassword"),
        phone=phone,
        full_name=name,
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _master(db, user: User, domain: str, zone: str = ZONE) -> Master:
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=1,
        domain=domain,
        timezone=zone,
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


def _service(db, master: Master, *, duration: int = 60) -> Service:
    service = Service(name="Стрижка", price=1000, duration=duration, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)
    db.execute(master_services.insert().values(master_id=master.id, service_id=service.id))
    db.add(MasterService(master_id=master.id, category_id=None, name="Стрижка", duration=duration, price=1000))
    db.commit()
    return service


def _schedule(db, master: Master, day) -> None:
    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=None,
            date=day,
            start_time=datetime.min.time(),
            end_time=datetime.max.time().replace(microsecond=0),
            is_available=True,
        )
    )
    db.commit()


def _wall(days: int = 4, hour: int = 11, minutes: int = 60):
    start = datetime.now(ZoneInfo(ZONE)).replace(minute=0, second=0, microsecond=0) + timedelta(days=days, hours=0)
    start = start.replace(hour=hour)
    return start.replace(tzinfo=None), (start + timedelta(minutes=minutes)).replace(tzinfo=None)


def _body(start, end, **extra) -> dict:
    payload = {
        "client_name": "Анна",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }
    payload.update(extra)
    return payload


def _code(response) -> str | None:
    return response.headers.get("x-error-code")


def _stamp(start, end, zone: str = ZONE) -> dict:
    return canonical_time_columns(request_interval(start, end, zone), zone)


def _effects(db) -> dict:
    db.expire_all()
    return {
        "payments": db.query(Payment).count(),
        "incomes": db.query(Income).count(),
        "loyalty": db.query(LoyaltyTransaction).count(),
        "notifications": db.query(Notification).count(),
        "outbox": db.query(NotificationOutbox).count(),
        "users": db.query(User).count(),
    }


def test_routes_do_not_collide_with_existing_master_booking_paths():
    found = []
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None)
        if methods and ("/bookings/manual" in path or "/calendar-blocks" in path or path.endswith("/bookings/{booking_id}/time")):
            for method in methods - {"HEAD", "OPTIONS"}:
                found.append(f"{method} {path}")
    assert "DELETE /api/master/bookings/manual/{booking_id}" in found
    assert "POST /api/master/bookings/manual" in found
    assert "PUT /api/master/bookings/{booking_id}/time" in found
    assert found.count("POST /api/master/bookings/manual") == 1


def test_anonymous_and_non_master_cannot_write(client, db, fixture_password_hash):
    start, end = _wall()
    denied = client.post("/api/master/bookings/manual", json=_body(start, end))
    assert denied.status_code == 401
    visitor = _user(
        db, fixture_password_hash, role=UserRole.CLIENT, email="b3-client@example.com",
        phone="+79001000001", name="Client",
    )
    forbidden = client.post("/api/master/bookings/manual", json=_body(start, end), headers=_headers(visitor))
    assert forbidden.status_code == 403
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-bare@example.com",
        phone="+79001000002", name="Bare",
    )
    missing = client.post("/api/master/bookings/manual", json=_body(start, end), headers=_headers(master_user))
    assert missing.status_code == 404
    assert db.query(Booking).count() == 0


def test_manual_create_update_delete_and_response_compatibility(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-master@example.com",
        phone="+79001000003", name="Master",
    )
    master = _master(db, master_user, "b3-master")
    service_id = _service(db, master).id
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-other@example.com",
        phone="+79001000004", name="Other",
    )
    _master(db, other_user, "b3-other")
    headers = _headers(master_user)
    other_headers = _headers(other_user)
    start, end = _wall(days=5, hour=12)
    rejected = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, source="manual", client_id=1),
        headers=headers,
    )
    assert rejected.status_code == 422
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, client_phone="+79990001122", service_id=service_id, notes="  окно  "),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["source"] == "manual"
    assert body["status"] == "confirmed"
    assert body["client_id"] is None
    assert body["service_id"] == service_id
    assert body["version"] == 1
    assert body["payment_amount"] is None
    assert body["loyalty_points_used"] == 0
    assert body["time_zone"] == ZONE
    assert body["start_utc_us"] and body["end_utc_us"]
    booking_id = body["id"]
    db.expire_all()
    row = db.get(Booking, booking_id)
    assert row.client_id is None and row.source == "manual" and row.guest_name == "Анна"
    assert row.created_by_user_id == master_user.id

    listed = client.get("/api/master/bookings", headers=headers)
    assert listed.status_code == 200, listed.text
    listed_row = next(item for item in listed.json() if item["id"] == booking_id)
    assert listed_row["service_id"] == service_id
    detailed = client.get("/api/master/bookings/detailed", headers=headers)
    assert detailed.status_code == 200, detailed.text
    card = next(item for item in detailed.json() if item["id"] == booking_id)
    assert card["guest_name"] == "Анна" and card["source"] == "manual"
    assert card["client_name"] == "Анна"
    assert card["version"] == 1
    assert card["time_zone"] == ZONE
    assert card["start_utc_us"] and card["end_utc_us"]
    future = client.get("/api/master/bookings/future", headers=headers)
    assert future.status_code == 200, future.text
    assert any(item["id"] == booking_id and item["client_name"] == "Анна" for item in future.json()["bookings"])

    stale = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, version=9, notes="позже"),
        headers=headers,
    )
    assert stale.status_code == 409 and _code(stale) == "CALENDAR_VERSION_CONFLICT"
    moved_start, moved_end = _wall(days=5, hour=15)
    updated = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(moved_start, moved_end, version=1, notes="перенос", service_id=None),
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["service_id"] is None
    assert updated.json()["source"] == "manual"
    foreign = client.delete(
        f"/api/master/bookings/manual/{booking_id}?version=2",
        headers=other_headers,
    )
    assert foreign.status_code == 404
    wrong = client.delete(f"/api/master/bookings/manual/{booking_id}?version=1", headers=headers)
    assert wrong.status_code == 409 and _code(wrong) == "CALENDAR_VERSION_CONFLICT"
    deleted = client.delete(f"/api/master/bookings/manual/{booking_id}?version=2", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["status"] == "cancelled" and deleted.json()["version"] == 3
    again = client.delete(f"/api/master/bookings/manual/{booking_id}?version=3", headers=headers)
    assert again.status_code == 404
    db.expire_all()
    cancelled = db.get(Booking, booking_id)
    assert cancelled.status == BookingStatus.CANCELLED.value and cancelled.version == 3
    reopened_start, reopened_end = _wall(days=5, hour=15)
    reopened = client.post("/api/master/bookings/manual", json=_body(reopened_start, reopened_end), headers=headers)
    assert reopened.status_code == 200, reopened.text


def test_nullable_service_outside_hours_and_past_interval(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-hours@example.com",
        phone="+79001000005", name="Hours",
    )
    _master(db, master_user, "b3-hours")
    headers = _headers(master_user)
    start, end = _wall(days=6, hour=2)
    created = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    assert created.status_code == 200, created.text
    assert created.json()["service_id"] is None
    listed = client.get("/api/master/bookings", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["service_id"] is None
    now = datetime.now(ZoneInfo(ZONE)).replace(tzinfo=None)
    past = client.post(
        "/api/master/bookings/manual",
        json=_body(now - timedelta(hours=3), now - timedelta(minutes=30)),
        headers=headers,
    )
    assert past.status_code == 400 and _code(past) == "BOOKING_TIME_INVALID"
    ongoing = client.post(
        "/api/master/bookings/manual",
        json=_body(now - timedelta(minutes=20), now + timedelta(minutes=40)),
        headers=headers,
    )
    assert ongoing.status_code == 200, ongoing.text
    short = client.post(
        "/api/master/bookings/manual",
        json=_body(start + timedelta(days=1), start + timedelta(days=1, minutes=5)),
        headers=headers,
    )
    assert short.status_code == 400 and _code(short) == "BOOKING_TIME_INVALID"
    blank = client.post("/api/master/bookings/manual", json=_body(start, end, client_name="   "), headers=headers)
    assert blank.status_code == 422
    phone = client.post(
        "/api/master/bookings/manual",
        json=_body(start + timedelta(days=2), end + timedelta(days=2), client_phone="123"),
        headers=headers,
    )
    assert phone.status_code == 400 and _code(phone) != "BOOKING_TIME_INVALID"


def test_calendar_block_crud_and_conflicts(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-block@example.com",
        phone="+79001000006", name="Blocks",
    )
    master = _master(db, master_user, "b3-blocks")
    master_id = master.id
    client_user = _user(
        db, fixture_password_hash, role=UserRole.CLIENT, email="b3-hold@example.com",
        phone="+79001000007", name="Hold",
    )
    service_id = _service(db, master).id
    client_id = client_user.id
    headers = _headers(master_user)
    start, end = _wall(days=7, hour=13)
    created = client.post(
        "/api/master/calendar-blocks",
        json={"start_time": start.isoformat(), "end_time": end.isoformat(), "category": "break", "title": "обед"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    block_id = created.json()["id"]
    assert created.json()["version"] == 1 and created.json()["category"] == "break"
    listed = client.get("/api/master/calendar-blocks", headers=headers)
    assert [item["id"] for item in listed.json()] == [block_id]
    overlap = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    assert overlap.status_code == 409 and _code(overlap) == "BOOKING_SLOT_CONFLICT"
    second = client.post(
        "/api/master/calendar-blocks",
        json={"start_time": start.isoformat(), "end_time": end.isoformat(), "category": "busy"},
        headers=headers,
    )
    assert second.status_code == 409 and _code(second) == "BOOKING_SLOT_CONFLICT"
    later, later_end = _wall(days=7, hour=16)
    moved = client.put(
        f"/api/master/calendar-blocks/{block_id}",
        json={
            "start_time": later.isoformat(), "end_time": later_end.isoformat(),
            "category": "personal", "version": 1,
        },
        headers=headers,
    )
    assert moved.status_code == 200 and moved.json()["version"] == 2
    bad_category = client.post(
        "/api/master/calendar-blocks",
        json={"start_time": start.isoformat(), "end_time": end.isoformat(), "category": "vacation"},
        headers=headers,
    )
    assert bad_category.status_code == 400
    hold_start, hold_end = _wall(days=8, hour=10)
    columns = _stamp(hold_start, hold_end)
    db.add(TemporaryBooking(
        master_id=master_id, client_id=client_id, service_id=service_id,
        payment_amount=100, expires_at=datetime.utcnow() + timedelta(minutes=20), status="pending",
        **columns,
    ))
    db.commit()
    held = client.post(
        "/api/master/calendar-blocks",
        json={"start_time": hold_start.isoformat(), "end_time": hold_end.isoformat(), "category": "busy"},
        headers=headers,
    )
    assert held.status_code == 409 and _code(held) == "BOOKING_SLOT_CONFLICT"
    manual_held = client.post("/api/master/bookings/manual", json=_body(hold_start, hold_end), headers=headers)
    assert manual_held.status_code == 409 and _code(manual_held) == "BOOKING_SLOT_CONFLICT"
    removed = client.delete(f"/api/master/calendar-blocks/{block_id}?version=2", headers=headers)
    assert removed.status_code == 200 and removed.json()["deleted_at"]
    repeat = client.delete(f"/api/master/calendar-blocks/{block_id}?version=3", headers=headers)
    assert repeat.status_code == 404
    db.expire_all()
    assert db.get(CalendarBlock, block_id).version == 3
    freed = client.post("/api/master/bookings/manual", json=_body(later, later_end), headers=headers)
    assert freed.status_code == 200, freed.text
    assert client.get("/api/master/calendar-blocks", headers=headers).json() == []


def test_online_manual_and_unresolved_conflicts(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-occ@example.com",
        phone="+79001000008", name="Occ",
    )
    master = _master(db, master_user, "b3-occ")
    master_id = master.id
    headers = _headers(master_user)
    start, end = _wall(days=9, hour=10)
    online = Booking(
        master_id=master_id, client_id=None, status=BookingStatus.CONFIRMED.value,
        source="online", **_stamp(start, end),
    )
    db.add(online)
    db.commit()
    conflict = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    assert conflict.status_code == 409 and _code(conflict) == "BOOKING_SLOT_CONFLICT"
    legacy_start, legacy_end = _wall(days=9, hour=14)
    db.add(Booking(
        master_id=master_id, status=BookingStatus.CONFIRMED.value, source="online",
        start_time=legacy_start, end_time=legacy_end,
    ))
    db.commit()
    unresolved = client.post("/api/master/bookings/manual", json=_body(legacy_start, legacy_end), headers=headers)
    assert unresolved.status_code == 503 and _code(unresolved) == "BOOKING_TIME_UNRESOLVED"


def test_dst_is_rejected_and_explicit_offset_is_preserved(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-dst@example.com",
        phone="+79001000009", name="DST",
    )
    _master(db, master_user, "b3-dst", zone="Europe/Berlin")
    headers = _headers(master_user)
    fold_day = datetime(2027, 10, 31)
    while fold_day.weekday() != 6:
        fold_day -= timedelta(days=1)
    fold = fold_day.replace(hour=2, minute=30)
    gap_day = datetime(2027, 3, 31)
    while gap_day.weekday() != 6:
        gap_day -= timedelta(days=1)
    gap = gap_day.replace(hour=2, minute=30)
    for start in (fold, gap):
        response = client.post(
            "/api/master/bookings/manual",
            json=_body(start, start + timedelta(minutes=30)),
            headers=headers,
        )
        assert response.status_code == 400 and _code(response) == "BOOKING_TIME_INVALID"
    explicit = fold.replace(tzinfo=timezone(timedelta(hours=1)))
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(explicit, explicit + timedelta(minutes=30)),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["time_zone"] == "Europe/Berlin"
    aware = datetime(2026, 11, 12, 9, 0, tzinfo=timezone.utc)
    stored = client.post(
        "/api/master/bookings/manual",
        json=_body(aware, aware + timedelta(hours=1)),
        headers=headers,
    )
    assert stored.status_code == 200, stored.text
    assert stored.json()["start_time"].startswith("2026-11-12T10:00:00")


def test_idempotency_replays_and_rejects_a_different_body(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-idem@example.com",
        phone="+79001000010", name="Idem",
    )
    _master(db, master_user, "b3-idem")
    headers = _headers(master_user)
    start, end = _wall(days=10, hour=11)
    payload = _body(start, end)
    first = client.post("/api/master/bookings/manual", json=payload, headers={**headers, "Idempotency-Key": "same"})
    second = client.post("/api/master/bookings/manual", json=payload, headers={**headers, "Idempotency-Key": "same"})
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert db.query(Booking).count() == 1
    other = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=10, hour=16)),
        headers={**headers, "Idempotency-Key": "same"},
    )
    assert other.status_code == 409 and _code(other) == "IDEMPOTENCY_KEY_REUSED"
    assert db.query(Booking).count() == 1


def test_concurrent_same_slot_and_same_idempotency_key(db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-race@example.com",
        phone="+79001000011", name="Race",
    )
    master = _master(db, master_user, "b3-race")
    master_id = master.id
    actor_user_id = master_user.id
    db.rollback()
    factory = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    start, end = _wall(days=11, hour=12)
    body = ManualWrite(client_name="Гонка", start_time=start, end_time=end)

    def attempt(key):
        session = factory()
        try:
            owner = session.get(Master, master_id)
            return create_manual_booking(session, owner, actor_user_id, body, key)
        except HTTPException as exc:
            session.rollback()
            return exc
        finally:
            session.close()

    outcomes = []

    def run():
        outcomes.append(attempt(None))

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    successes = [item for item in outcomes if isinstance(item, dict)]
    failures = [item for item in outcomes if isinstance(item, HTTPException)]
    assert len(successes) == 1 and len(failures) == 1
    assert failures[0].status_code == 409
    assert db.query(Booking).count() == 1

    start2, end2 = _wall(days=11, hour=16)
    shared = ManualWrite(client_name="Ключ", start_time=start2, end_time=end2)
    keyed = []

    def replay():
        session = factory()
        try:
            owner = session.get(Master, master_id)
            keyed.append(create_manual_booking(session, owner, actor_user_id, shared, "race-key"))
        finally:
            session.close()

    threads = [threading.Thread(target=replay), threading.Thread(target=replay)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(keyed) == 2
    assert keyed[0]["id"] == keyed[1]["id"]
    assert db.query(Booking).filter(Booking.guest_name == "Ключ").count() == 1
    assert db.execute(text("PRAGMA integrity_check")).scalar() == "ok"


def test_legacy_mode_refuses_writes_without_inserting(client, db, fixture_password_hash, monkeypatch):
    monkeypatch.setenv("CALENDAR_ADMISSION_MODE", "legacy")
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-legacy@example.com",
        phone="+79001000012", name="Legacy",
    )
    _master(db, master_user, "b3-legacy")
    headers = _headers(master_user)
    start, end = _wall(days=12)
    created = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    blocked = client.post(
        "/api/master/calendar-blocks",
        json={"start_time": start.isoformat(), "end_time": end.isoformat()},
        headers=headers,
    )
    assert created.status_code == blocked.status_code == 503
    assert _code(created) == _code(blocked) == "CALENDAR_UNIFIED_REQUIRED"
    assert db.query(Booking).count() == 0 and db.query(CalendarBlock).count() == 0
    assert client.get("/api/master/calendar-blocks", headers=headers).status_code == 200


def test_contacts_stay_inside_the_current_master(client, db, fixture_password_hash):
    owner_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-owner@example.com",
        phone="+79001000013", name="Owner",
    )
    owner = _master(db, owner_user, "b3-owner")
    owner_id = owner.id
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-foreign@example.com",
        phone="+79001000014", name="Foreign",
    )
    other = _master(db, other_user, "b3-foreign")
    other_id = other.id
    phone = "+79990001122"
    db.add(MasterClientMetadata(master_id=other.id, client_phone=phone, alias_name="Секрет", note="чужое"))
    db.add(MasterClientMetadata(master_id=owner.id, client_phone=phone, alias_name="Старое", note="личное"))
    db.commit()
    users_before = db.query(User).count()
    start, end = _wall(days=13, hour=11)
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, client_name="Новое", client_phone=phone),
        headers=_headers(owner_user),
    )
    assert created.status_code == 200, created.text
    db.expire_all()
    assert db.query(User).count() == users_before
    own = db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == owner_id).one()
    foreign = db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == other_id).one()
    assert own.alias_name == "Старое" and own.note == "личное"
    assert foreign.alias_name == "Секрет" and foreign.note == "чужое"
    booking = db.get(Booking, created.json()["id"])
    assert booking.master_client_metadata_id == own.id
    assert booking.client_id is None


def test_manual_has_no_notification_payment_loyalty_or_income(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-side@example.com",
        phone="+79001000015", name="Side",
    )
    master = _master(db, master_user, "b3-side")
    master_id = master.id
    master_user_id = master_user.id
    headers = _headers(master_user)
    client_user = _user(
        db, fixture_password_hash, role=UserRole.CLIENT, email="b3-side-client@example.com",
        phone="+79001000016", name="Side client",
    )
    client_id = client_user.id
    client_headers = _headers(client_user)
    start, end = _wall(days=14, hour=12)
    created = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    booking_id = created.json()["id"]
    moved, moved_end = _wall(days=14, hour=15)
    assert client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(moved, moved_end, version=1),
        headers=headers,
    ).status_code == 200
    db.expire_all()
    booking = db.get(Booking, booking_id)
    booking.client_id = client_id
    db.commit()
    assert client.put(
        f"/api/client/bookings/{booking_id}",
        json={"notes": "нет"},
        headers=client_headers,
    ).status_code == 404
    assert client.delete(f"/api/client/bookings/{booking_id}", headers=client_headers).status_code == 404
    assert client.put(
        f"/api/master/bookings/{booking_id}/time",
        json={"start_time": start.isoformat(), "end_time": end.isoformat()},
        headers=headers,
    ).status_code == 404
    db.expire_all()
    booking = db.get(Booking, booking_id)
    assert record_booking_created_notification(db, booking, actor_user_id=client_id) is None
    assert record_booking_cancelled_notification(db, booking, actor_user_id=client_id) is None
    assert record_booking_rescheduled_notification(
        db, booking, actor_user_id=client_id, old_start=start, new_start=moved,
    ) is None
    result = finalize_post_visit_booking(
        db, booking=booking, master_row_id=master_id, master_user_id=master_user_id, require_past_start=False,
    )
    db.commit()
    assert result["confirmed_income"] == 0 and result["points_spent"] == 0
    assert _effects(db) == {
        "payments": 0, "incomes": 0, "loyalty": 0, "notifications": 0, "outbox": 0, "users": 2,
    }
    assert db.get(Booking, booking_id).status == BookingStatus.COMPLETED.value


def test_free_cap_ignores_manual_and_client_cannot_spoof_source(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-cap-master@example.com",
        phone="+79001000017", name="Cap master",
    )
    master = _master(db, master_user, "b3-cap")
    client_user = _user(
        db, fixture_password_hash, role=UserRole.CLIENT, email="b3-cap-client@example.com",
        phone="+79001000018", name="Cap client",
    )
    service = _service(db, master, duration=60)
    master_id = master.id
    service_id = service.id
    client_headers = _headers(client_user)
    master_headers = _headers(master_user)
    day = _wall(days=20)[0].date()
    for offset in range(8):
        _schedule(db, master, day + timedelta(days=offset))
    for index in range(25):
        start, end = _wall(days=20, hour=8)
        start = start + timedelta(hours=index)
        end = start + timedelta(hours=1)
        db.add(Booking(
            master_id=master_id, status=BookingStatus.CONFIRMED.value, source="manual",
            guest_name=f"M{index}", client_id=None, **_stamp(start, end),
        ))
    for index in range(19):
        start = _wall(days=21, hour=8)[0] + timedelta(hours=index)
        db.add(Booking(
            master_id=master_id, client_id=client_user.id, service_id=service_id,
            status=BookingStatus.CONFIRMED.value, source="online", **_stamp(start, start + timedelta(hours=1)),
        ))
    legacy_start = _wall(days=22, hour=8)[0]
    db.add(Booking(
        master_id=master_id, client_id=client_user.id, service_id=service_id,
        status=BookingStatus.CONFIRMED.value, source=None,
        **_stamp(legacy_start, legacy_start + timedelta(hours=1)),
    ))
    db.commit()
    online_start = _wall(days=23, hour=10)[0]
    payload = {
        "service_id": service_id, "master_id": master_id,
        "start_time": online_start.isoformat(), "end_time": (online_start + timedelta(hours=1)).isoformat(),
        "status": "created", "client_name": "Онлайн", "service_name": "Стрижка",
        "service_duration": 60, "service_price": 1000, "source": "manual",
    }
    blocked = client.post("/api/bookings/", json=payload, headers=client_headers)
    assert blocked.status_code == 409, blocked.text
    assert db.query(Booking).filter(Booking.source == "online").count() == 19
    manual = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=24, hour=18)),
        headers=master_headers,
    )
    assert manual.status_code == 200, manual.text
    assert manual.json()["source"] == "manual"
    begin_booking_creation_transaction(db)
    with pytest.raises(HTTPException) as exc:
        enforce_booking_creation_limit(db, {
            "master_id": master_id, "start_time": online_start, "end_time": online_start + timedelta(hours=1),
            "status": "created",
        })
    assert exc.value.status_code == 409
    db.rollback()
    legacy = db.query(Booking).filter(Booking.source.is_(None)).one()
    legacy.status = BookingStatus.CANCELLED.value
    db.commit()
    allowed = client.post("/api/client/bookings/", json=payload, headers=client_headers)
    assert allowed.status_code == 200, allowed.text
    db.expire_all()
    created = db.get(Booking, allowed.json()["id"])
    assert created.source == "online"
    assert created.source != "manual"
    spare = (
        db.query(Booking)
        .filter(Booking.source == "online", Booking.id != created.id)
        .first()
    )
    spare.status = BookingStatus.CANCELLED.value
    db.commit()
    public = client.post(
        "/api/public/masters/b3-cap/bookings",
        json={
            "service_id": db.query(MasterService).filter(MasterService.master_id == master_id).one().id,
            "start_time": _wall(days=25, hour=10)[0].isoformat(),
            "end_time": (_wall(days=25, hour=10)[0] + timedelta(hours=1)).isoformat(),
            "source": "manual",
        },
        headers=client_headers,
    )
    assert public.status_code == 200, public.text
    assert db.get(Booking, public.json()["id"]).source == "online"


def _snapshot(db, booking_id: int) -> dict:
    db.expire_all()
    row = db.get(Booking, booking_id)
    return {
        "start": row.start_time,
        "end": row.end_time,
        "status": row.status,
        "version": row.version,
        "notes": row.notes,
        "source": row.source,
    }


def test_legacy_mutators_leave_manual_booking_unchanged(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-seal@example.com",
        phone="+79001000030", name="Seal",
    )
    _master(db, master_user, "b3-seal")
    headers = _headers(master_user)
    start, end = _wall(days=16, hour=11)
    created = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    assert created.json()["version"] == 1
    moved, moved_end = _wall(days=16, hour=16)
    updated = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(moved, moved_end, version=1),
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    sealed = _snapshot(db, booking_id)

    generic = client.put(
        f"/api/bookings/{booking_id}",
        json={"start_time": start.isoformat(), "end_time": end.isoformat(), "notes": "обход"},
        headers=headers,
    )
    assert generic.status_code == 404
    assert _snapshot(db, booking_id) == sealed

    edit = client.post(
        f"/api/bookings/{booking_id}/edit-requests",
        json={
            "booking_id": booking_id,
            "proposed_start": start.isoformat(),
            "proposed_end": end.isoformat(),
        },
        headers=headers,
    )
    assert edit.status_code == 404
    stored = BookingEditRequest(
        booking_id=booking_id,
        proposed_start=start,
        proposed_end=end,
        status=EditRequestStatus.PENDING,
    )
    db.add(stored)
    db.commit()
    db.refresh(stored)
    request_id = stored.id
    accepted = client.put(
        f"/api/bookings/edit-requests/{request_id}",
        json={"status": "accepted"},
        headers=headers,
    )
    assert accepted.status_code == 404
    assert _snapshot(db, booking_id) == sealed
    db.expire_all()
    assert db.get(BookingEditRequest, request_id).status == EditRequestStatus.PENDING

    cancelled = client.post(
        f"/api/master/accounting/cancel-booking/{booking_id}?cancellation_reason=client_requested",
        headers=headers,
    )
    assert cancelled.status_code == 404
    assert _snapshot(db, booking_id) == sealed

    status_change = client.post(
        f"/api/master/accounting/update-booking-status/{booking_id}?new_status=cancelled",
        headers=headers,
    )
    assert status_change.status_code == 404
    assert _snapshot(db, booking_id) == sealed

    stale = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, version=1),
        headers=headers,
    )
    assert stale.status_code == 409
    assert _code(stale) == "CALENDAR_VERSION_CONFLICT"
    assert _snapshot(db, booking_id) == sealed


def test_completed_manual_bumps_version_once_and_stays_closed(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-done@example.com",
        phone="+79001000031", name="Done",
    )
    master = _master(db, master_user, "b3-done")
    master_id = master.id
    master_user_id = master_user.id
    headers = _headers(master_user)
    now = datetime.now(ZoneInfo(ZONE)).replace(tzinfo=None, microsecond=0)
    start = now - timedelta(minutes=20)
    end = now + timedelta(minutes=40)
    created = client.post("/api/master/bookings/manual", json=_body(start, end), headers=headers)
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    assert created.json()["version"] == 1
    before = _effects(db)

    confirmed = client.post(f"/api/master/accounting/confirm-booking/{booking_id}", headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["confirmed_income"] == 0
    row = _snapshot(db, booking_id)
    assert row["status"] == BookingStatus.COMPLETED.value
    assert row["version"] == 2
    db.expire_all()
    stored = db.get(Booking, booking_id)
    assert stored.start_time.isoformat() == created.json()["start_time"]
    assert db.query(BookingConfirmation).count() == 0
    assert _effects(db) == before

    again = client.post(f"/api/master/accounting/confirm-booking/{booking_id}", headers=headers)
    assert again.status_code == 404
    assert _snapshot(db, booking_id)["version"] == 2
    db.expire_all()
    repeated = finalize_post_visit_booking(
        db,
        booking=db.get(Booking, booking_id),
        master_row_id=master_id,
        master_user_id=master_user_id,
        require_past_start=False,
    )
    db.commit()
    assert repeated["already"] is True
    assert _snapshot(db, booking_id)["version"] == 2
    assert db.query(BookingConfirmation).count() == 0
    assert _effects(db) == before

    reopen, reopen_end = _wall(days=18, hour=15)
    put = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(reopen, reopen_end, version=2),
        headers=headers,
    )
    assert put.status_code == 404
    closed = _snapshot(db, booking_id)
    assert closed["status"] == BookingStatus.COMPLETED.value
    assert closed["version"] == 2
    db.expire_all()
    assert db.get(Booking, booking_id).start_time.isoformat() == created.json()["start_time"]


def test_detailed_and_future_show_manual_guest_phone_for_the_owner(client, db, fixture_password_hash):
    owner_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-phone@example.com",
        phone="+79001000032", name="Phone owner",
    )
    owner = _master(db, owner_user, "b3-phone")
    owner_id = owner.id
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-phone-other@example.com",
        phone="+79001000033", name="Phone other",
    )
    other = _master(db, other_user, "b3-phone-other")
    phone = "+79990001133"
    secret = "+79990004455"
    db.add(MasterClientMetadata(master_id=owner.id, client_phone=phone, alias_name="Старое", note="личное"))
    foreign = MasterClientMetadata(master_id=other.id, client_phone=secret, alias_name="Секрет", note="чужое")
    db.add(foreign)
    db.commit()
    db.refresh(foreign)
    foreign_id = foreign.id
    owner_headers = _headers(owner_user)
    other_headers = _headers(other_user)
    start, end = _wall(days=19, hour=12)
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, client_name="Новое", client_phone=phone),
        headers=owner_headers,
    )
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]

    detailed = client.get("/api/master/bookings/detailed", headers=owner_headers)
    assert detailed.status_code == 200, detailed.text
    item = next(row for row in detailed.json() if row["id"] == booking_id)
    assert item["client_name"] == "Новое"
    assert item["client_display_name"] == "Новое"
    assert item["guest_name"] == "Новое"
    assert item["client_phone"] == phone
    assert item["client_master_alias"] == "Старое"
    future = client.get("/api/master/bookings/future", headers=owner_headers)
    assert future.status_code == 200, future.text
    future_item = next(row for row in future.json()["bookings"] if row["id"] == booking_id)
    assert future_item["client_name"] == "Новое"
    assert future_item["client_phone"] == phone

    foreign_view = client.get("/api/master/bookings/detailed", headers=other_headers)
    assert foreign_view.status_code == 200
    assert all(row["id"] != booking_id for row in foreign_view.json())
    assert secret not in foreign_view.text
    assert phone not in foreign_view.text

    db.expire_all()
    booking = db.get(Booking, booking_id)
    booking.master_client_metadata_id = foreign_id
    db.commit()
    leaked = client.get("/api/master/bookings/detailed", headers=owner_headers)
    hidden = next(row for row in leaked.json() if row["id"] == booking_id)
    assert hidden["client_phone"] is None
    assert hidden["client_name"] == "Новое"
    assert secret not in leaked.text
    db.expire_all()
    own = db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == owner_id).one()
    assert own.alias_name == "Старое" and own.note == "личное"


def test_online_update_cancel_and_confirm_still_work(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-online@example.com",
        phone="+79001000034", name="Online master",
    )
    master = _master(db, master_user, "b3-online")
    client_user = _user(
        db, fixture_password_hash, role=UserRole.CLIENT, email="b3-online-client@example.com",
        phone="+79001000035", name="Online client",
    )
    headers = _headers(master_user)
    start, end = _wall(days=26, hour=13)
    moved, moved_end = _wall(days=26, hour=17)
    booking = Booking(
        master_id=master.id,
        client_id=client_user.id,
        status=BookingStatus.CONFIRMED.value,
        source="online",
        notes="как было",
        **_stamp(start, end),
    )
    past_start = datetime.now(ZoneInfo(ZONE)).replace(tzinfo=None, microsecond=0) - timedelta(hours=3)
    past = Booking(
        master_id=master.id,
        client_id=client_user.id,
        status=BookingStatus.CONFIRMED.value,
        source="online",
        payment_amount=500,
        **_stamp(past_start, past_start + timedelta(hours=1)),
    )
    db.add(booking)
    db.add(past)
    db.commit()
    db.refresh(booking)
    db.refresh(past)
    booking_id = booking.id
    past_id = past.id

    updated = client.put(
        f"/api/bookings/{booking_id}",
        json={"start_time": moved.isoformat(), "end_time": moved_end.isoformat(), "notes": "перенесено"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["notes"] == "перенесено"
    assert updated.json()["start_time"].startswith(moved.isoformat()[:16])

    cancelled = client.post(
        f"/api/master/accounting/cancel-booking/{booking_id}?cancellation_reason=client_requested",
        headers=headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    db.expire_all()
    assert db.get(Booking, booking_id).status == BookingStatus.CANCELLED.value

    confirmed = client.post(f"/api/master/accounting/confirm-booking/{past_id}", headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    db.expire_all()
    assert db.get(Booking, past_id).status == BookingStatus.COMPLETED.value
    assert db.query(Income).filter(Income.booking_id == past_id).count() == 1
    assert db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == past_id).count() == 1


def test_detailed_version_survives_reload_and_stale_writer_gets_409(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-ver@example.com",
        phone="+79001000041", name="Ver",
    )
    master = _master(db, master_user, "b3-ver")
    master_id = master.id
    headers = _headers(master_user)
    other = _headers(master_user)
    start, end = _wall(days=5, hour=12)
    created = client.post("/api/master/bookings/manual", json=_body(start, end, notes="первая"), headers=headers)
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    online_start, online_end = _wall(days=6, hour=16)
    columns = _stamp(online_start, online_end)
    db.add(Booking(
        master_id=master_id,
        client_id=None,
        service_id=None,
        status=BookingStatus.CONFIRMED.value,
        source=None,
        notes="онлайн",
        **columns,
    ))
    db.commit()
    detailed = client.get("/api/master/bookings/detailed", headers=headers)
    assert detailed.status_code == 200, detailed.text
    manual = next(item for item in detailed.json() if item["id"] == booking_id)
    online = next(item for item in detailed.json() if item["notes"] == "онлайн")
    assert manual["version"] == 1 and manual["source"] == "manual"
    assert online["version"] == 1 and online["source"] is None
    edited = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, version=manual["version"], notes="с телефона"),
        headers=headers,
    )
    assert edited.status_code == 200, edited.text
    reloaded = client.get("/api/master/bookings/detailed", headers=other)
    current = next(item for item in reloaded.json() if item["id"] == booking_id)
    assert current["version"] == 2 and current["notes"] == "с телефона"
    stale = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, version=1, notes="чужое"),
        headers=other,
    )
    assert stale.status_code == 409 and _code(stale) == "CALENDAR_VERSION_CONFLICT"
    final = client.get("/api/master/bookings/detailed", headers=headers)
    kept = next(item for item in final.json() if item["id"] == booking_id)
    assert kept["notes"] == "с телефона" and kept["version"] == 2


def test_calendar_services_use_canonical_service_id(client, db, fixture_password_hash):
    owner_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-svc@example.com",
        phone="+79001000042", name="Svc",
    )
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-svc2@example.com",
        phone="+79001000043", name="Svc2",
    )
    owner = _master(db, owner_user, "b3-svc")
    other = _master(db, other_user, "b3-svc2")
    owned = Service(id=9102, name="Своя", price=1000, duration=45, salon_id=None, indie_master_id=None)
    same_duration = Service(id=9103, name="Вторая", price=1200, duration=45, salon_id=None, indie_master_id=None)
    foreign = Service(id=9101, name="Чужая", price=50, duration=45, salon_id=None, indie_master_id=None)
    db.add_all([owned, same_duration, foreign])
    db.commit()
    db.execute(master_services.insert().values(master_id=owner.id, service_id=owned.id))
    db.execute(master_services.insert().values(master_id=owner.id, service_id=same_duration.id))
    db.execute(master_services.insert().values(master_id=other.id, service_id=foreign.id))
    db.add(MasterService(id=9101, master_id=owner.id, category_id=None, name="Каталог", duration=45, price=999))
    db.commit()
    listed = client.get("/api/master/calendar-services", headers=_headers(owner_user))
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert {row["service_id"] for row in rows if row["service_id"] is not None} == {9102, 9103}
    assert {row["master_service_id"] for row in rows if row["master_service_id"] is not None} == {9101}
    assert all((row["service_id"] is None) != (row["master_service_id"] is None) for row in rows)
    assert all("id" not in row for row in rows)
    assert all(row["duration"] == 45 for row in rows)
    start, end = _wall(days=4, hour=11, minutes=45)
    headers = _headers(owner_user)
    collided = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, service_id=9101),
        headers=headers,
    )
    assert collided.status_code == 404
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, service_id=9102),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["service_id"] == 9102
    assert created.json()["master_service_id"] is None
    catalog_start, catalog_end = _wall(days=4, hour=13, minutes=45)
    catalog_booking = client.post(
        "/api/master/bookings/manual",
        json=_body(catalog_start, catalog_end, master_service_id=9101),
        headers=headers,
    )
    assert catalog_booking.status_code == 200, catalog_booking.text
    assert catalog_booking.json()["service_id"] is None
    assert catalog_booking.json()["master_service_id"] == 9101
    plain_start, plain_end = _wall(days=4, hour=15, minutes=30)
    without = client.post("/api/master/bookings/manual", json=_body(plain_start, plain_end), headers=headers)
    assert without.status_code == 200, without.text
    assert without.json()["service_id"] is None


def test_dst_fold_update_keeps_the_original_offset(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-dst@example.com",
        phone="+79001000044", name="Dst",
    )
    _master(db, master_user, "b3-dst", "Europe/Berlin")
    headers = _headers(master_user)
    start = datetime(2030, 10, 27, 2, 15, tzinfo=timezone(timedelta(hours=2)))
    end = datetime(2030, 10, 27, 2, 45, tzinfo=timezone(timedelta(hours=2)))
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, notes="fold"),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    original_utc = created.json()["start_utc_us"]
    naive = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json={
            "client_name": "Анна",
            "start_time": "2030-10-27T02:15:00",
            "end_time": "2030-10-27T02:45:00",
            "notes": "без offset",
            "version": 1,
        },
        headers=headers,
    )
    assert naive.status_code == 400 and _code(naive) == "BOOKING_TIME_INVALID"
    kept = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json={
            "client_name": "Анна",
            "start_time": "2030-10-27T02:15:00+02:00",
            "end_time": "2030-10-27T02:45:00+02:00",
            "notes": "тот же instant",
            "version": 1,
        },
        headers=headers,
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["start_utc_us"] == original_utc
    assert kept.json()["notes"] == "тот же instant"
    assert kept.json()["version"] == 2


def test_posted_master_service_is_selectable_by_its_own_id(client, db, fixture_password_hash):
    owner_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-catalog@example.com",
        phone="+79001000045", name="Catalog",
    )
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-catalog2@example.com",
        phone="+79001000046", name="Catalog2",
    )
    owner = _master(db, owner_user, "b3-catalog")
    other = _master(db, other_user, "b3-catalog2")
    owner_id = owner.id
    other_id = other.id
    headers = _headers(owner_user)
    other_headers = _headers(other_user)
    category = client.post("/api/master/categories", json={"name": "Основные"}, headers=headers)
    assert category.status_code == 200, category.text
    created_service = client.post(
        "/api/master/services",
        json={"name": "Окрашивание", "duration": 40, "price": 2500, "category_id": category.json()["id"]},
        headers=headers,
    )
    assert created_service.status_code == 200, created_service.text
    catalog_id = created_service.json()["id"]
    assert db.query(Service).count() == 0
    listed = client.get("/api/master/calendar-services", headers=headers)
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json() if item["master_service_id"] == catalog_id)
    assert row["service_id"] is None
    assert row["duration"] == 40
    assert row["name"] == "Окрашивание"
    start, end = _wall(days=5, hour=12, minutes=40)
    booked = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, master_service_id=catalog_id),
        headers=headers,
    )
    assert booked.status_code == 200, booked.text
    assert booked.json()["master_service_id"] == catalog_id
    assert booked.json()["service_id"] is None
    assert db.query(Service).count() == 0
    detailed = client.get("/api/master/bookings/detailed", headers=headers)
    visible = next(item for item in detailed.json() if item["id"] == booked.json()["id"])
    assert visible["master_service_id"] == catalog_id
    assert visible["service_id"] is None
    assert visible["service_name"] == "Окрашивание"
    assert visible["service_duration"] == 40
    short_start, short_end = _wall(days=5, hour=14, minutes=30)
    mismatch = client.post(
        "/api/master/bookings/manual",
        json=_body(short_start, short_end, master_service_id=catalog_id),
        headers=headers,
    )
    assert mismatch.status_code == 400 and _code(mismatch) == "BOOKING_TIME_INVALID"
    foreign = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, master_service_id=catalog_id),
        headers=other_headers,
    )
    assert foreign.status_code == 404
    both = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=5, hour=16, minutes=40), service_id=1, master_service_id=catalog_id),
        headers=headers,
    )
    assert both.status_code == 400
    plain = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=5, hour=18, minutes=30)),
        headers=headers,
    )
    assert plain.status_code == 200
    assert plain.json()["service_id"] is None and plain.json()["master_service_id"] is None
    canonical = Service(name="Канон", price=100, duration=40, salon_id=None, indie_master_id=None)
    db.add(canonical)
    db.flush()
    canonical_id = canonical.id
    db.commit()
    db.execute(master_services.insert().values(master_id=owner_id, service_id=canonical_id))
    db.add(MasterService(
        master_id=other_id, category_id=None, name="Чужой каталог", duration=40, price=10,
    ))
    db.commit()
    foreign_catalog_id = db.query(MasterService).filter(MasterService.master_id == other_id).one().id
    assert foreign_catalog_id != canonical_id
    stolen = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=6, hour=11, minutes=40), master_service_id=foreign_catalog_id),
        headers=headers,
    )
    assert stolen.status_code == 404
    kept = client.post(
        "/api/master/bookings/manual",
        json=_body(*_wall(days=6, hour=12, minutes=40), service_id=canonical_id),
        headers=headers,
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["service_id"] == canonical_id
    assert kept.json()["master_service_id"] is None
    assert db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id == owner_id).count() == 1


def test_guest_name_migration_is_additive_and_nullable(tmp_path):
    path = tmp_path / "b3.sqlite"
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE bookings (id INTEGER PRIMARY KEY, notes TEXT)")
    connection.execute("INSERT INTO bookings (id, notes) VALUES (1, 'legacy')")
    connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
    connection.execute("INSERT INTO alembic_version VALUES ('20261028_calendar_b22')")
    connection.commit()
    connection.close()
    b1._alembic(f"sqlite:///{path}", "upgrade", "head")
    with sqlite3.connect(path) as connection:
        columns = {row[1]: row for row in connection.execute("PRAGMA table_info(bookings)")}
        assert columns["guest_name"][3] == 0
        assert list(connection.execute("SELECT notes, guest_name FROM bookings")) == [("legacy", None)]
        assert columns["master_service_id"][3] == 0
        assert columns["master_service_id"][4] == "NULL"
        assert list(connection.execute("SELECT notes, guest_name, master_service_id FROM bookings")) == [("legacy", None, None)]
        fk = connection.execute("PRAGMA foreign_key_list(bookings)").fetchall()
        assert any(
            row[2] == "master_services_list" and row[3] == "master_service_id" and row[4] == "id"
            for row in fk
        )
        assert list(connection.execute("SELECT version_num FROM alembic_version")) == [("20261031_b3_master_svc",)]
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    b1._alembic(f"sqlite:///{path}", "upgrade", "head")
    b1._alembic(f"sqlite:///{path}", "downgrade", "20261028_calendar_b22")
    with sqlite3.connect(path) as connection:
        names = {row[1] for row in connection.execute("PRAGMA table_info(bookings)")}
        assert "guest_name" not in names
        assert "master_service_id" not in names
        assert list(connection.execute("SELECT notes FROM bookings")) == [("legacy",)]
        assert connection.execute("PRAGMA foreign_key_list(bookings)").fetchall() == []


def _fk_pairs(connection):
    return {
        (row[0], row[1], row[2])
        for row in connection.execute("PRAGMA foreign_key_check").fetchall()
    }


def test_master_service_fk_is_added_inline_without_rebuilding_bookings(tmp_path):
    path = tmp_path / "b3-fk.sqlite"
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT)")
    connection.execute(
        "CREATE TABLE master_services_list (id INTEGER PRIMARY KEY, name TEXT NOT NULL, duration INTEGER, price REAL)"
    )
    connection.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            service_id INTEGER REFERENCES services(id),
            notes TEXT,
            guest_name TEXT,
            start_utc_us BIGINT,
            end_utc_us BIGINT,
            time_zone TEXT,
            version INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    connection.execute("CREATE INDEX ix_bookings_service_id ON bookings(service_id)")
    connection.execute("CREATE INDEX ix_bookings_start_utc_us ON bookings(start_utc_us)")
    connection.execute("INSERT INTO master_services_list (id, name, duration, price) VALUES (1, 'Audit40', 40, 2500)")
    connection.execute(
        """
        INSERT INTO bookings (
            id, service_id, notes, guest_name, start_utc_us, end_utc_us, time_zone, version
        ) VALUES (7, 50, 'legacy', 'Анна', 100, 200, 'Europe/Berlin', 3)
        """
    )
    connection.execute(
        """
        INSERT INTO bookings (
            id, notes, guest_name, start_utc_us, end_utc_us, time_zone, version
        ) VALUES (8, 'ok', 'Борис', 300, 400, 'Europe/Moscow', 2)
        """
    )
    connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
    connection.execute("INSERT INTO alembic_version VALUES ('20261030_calendar_b3')")
    connection.commit()
    before_rows = connection.execute(
        "SELECT id, service_id, notes, guest_name, start_utc_us, end_utc_us, time_zone, version FROM bookings ORDER BY id"
    ).fetchall()
    before_sql = connection.execute("SELECT sql FROM sqlite_master WHERE name='bookings'").fetchone()[0]
    before_indexes = {
        row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bookings'"
        )
    }
    before_fk = _fk_pairs(connection)
    connection.close()

    url = f"sqlite:///{path}"
    b1._alembic(url, "upgrade", "20261031_b3_master_svc")
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        columns = {row[1]: row for row in connection.execute("PRAGMA table_info(bookings)")}
        assert columns["master_service_id"][2] == "INTEGER"
        assert columns["master_service_id"][3] == 0
        assert columns["master_service_id"][4] == "NULL"
        fk = connection.execute("PRAGMA foreign_key_list(bookings)").fetchall()
        assert (0, 0, "master_services_list", "master_service_id", "id", "NO ACTION", "NO ACTION", "NONE") in fk
        assert any(row[2] == "services" and row[3] == "service_id" and row[4] == "id" for row in fk)
        after_rows = connection.execute(
            "SELECT id, service_id, notes, guest_name, start_utc_us, end_utc_us, time_zone, version FROM bookings ORDER BY id"
        ).fetchall()
        assert after_rows == before_rows
        assert connection.execute(
            "SELECT id, master_service_id FROM bookings ORDER BY id"
        ).fetchall() == [(7, None), (8, None)]
        after_sql = connection.execute("SELECT sql FROM sqlite_master WHERE name='bookings'").fetchone()[0]
        assert "start_utc_us" in after_sql and "end_utc_us" in after_sql and "time_zone" in after_sql
        assert "master_service_id INTEGER REFERENCES master_services_list(id)" in after_sql
        assert before_sql.rstrip().removesuffix(")").rstrip() in after_sql
        indexes = {
            row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bookings'"
            )
        }
        assert before_indexes <= indexes
        assert "ix_bookings_master_service_id" in indexes
        assert "bookings_new" not in {
            row[0] for row in connection.execute("SELECT name FROM sqlite_master")
        }
        assert _fk_pairs(connection) == before_fk
        assert ( "bookings", 7, "master_services_list") not in _fk_pairs(connection)
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "20261031_b3_master_svc"
        try:
            connection.execute(
                "INSERT INTO bookings (id, notes, version, master_service_id) VALUES (9, 'missing', 1, 999)"
            )
        except sqlite3.IntegrityError as exc:
            connection.rollback()
            assert "FOREIGN KEY" in str(exc)
        else:
            raise AssertionError("missing master service was stored")
        connection.execute(
            "INSERT INTO bookings (id, notes, version, master_service_id) VALUES (10, 'owned', 1, 1)"
        )
        connection.commit()
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute(
            "INSERT INTO bookings (id, notes, version, master_service_id) VALUES (11, 'unchecked', 1, 999)"
        )
        connection.commit()
    b1._alembic(url, "upgrade", "head")
    with sqlite3.connect(path) as connection:
        connection.execute("UPDATE alembic_version SET version_num='20261030_calendar_b3'")
        connection.commit()
    b1._alembic(url, "upgrade", "head")
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "20261031_b3_master_svc"
        assert connection.execute(
            "SELECT id, notes, guest_name, start_utc_us, end_utc_us, time_zone, version FROM bookings WHERE id IN (7, 8) ORDER BY id"
        ).fetchall() == [
            (7, "legacy", "Анна", 100, 200, "Europe/Berlin", 3),
            (8, "ok", "Борис", 300, 400, "Europe/Moscow", 2),
        ]
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_existing_master_service_column_without_fk_is_not_stamped(tmp_path):
    path = tmp_path / "b3-nofk.sqlite"
    connection = sqlite3.connect(path)
    connection.execute(
        """
        CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            notes TEXT,
            guest_name TEXT,
            start_utc_us BIGINT,
            end_utc_us BIGINT,
            time_zone TEXT
        )
        """
    )
    connection.execute(
        "INSERT INTO bookings (id, notes, guest_name, start_utc_us, end_utc_us, time_zone) "
        "VALUES (4, 'keep', 'Анна', 10, 20, 'Europe/Berlin')"
    )
    connection.execute(
        "ALTER TABLE bookings ADD COLUMN master_service_id INTEGER DEFAULT NULL"
    )
    connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
    connection.execute("INSERT INTO alembic_version VALUES ('20261030_calendar_b3')")
    connection.commit()
    connection.close()
    with pytest.raises(subprocess.CalledProcessError) as caught:
        b1._alembic(f"sqlite:///{path}", "upgrade", "head")
    assert "without a foreign key" in (caught.value.stderr or "")
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "20261030_calendar_b3"
        assert connection.execute("PRAGMA foreign_key_list(bookings)").fetchall() == []
        assert connection.execute(
            "SELECT id, notes, guest_name, start_utc_us, end_utc_us, time_zone, master_service_id FROM bookings"
        ).fetchone() == (4, "keep", "Анна", 10, 20, "Europe/Berlin", None)
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def _catalog(client, headers, name, duration, price):
    category = client.post("/api/master/categories", json={"name": f"Категория {name}"}, headers=headers)
    assert category.status_code == 200, category.text
    created = client.post(
        "/api/master/services",
        json={"name": name, "duration": duration, "price": price, "category_id": category.json()["id"]},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    return created.json()["id"]


def test_omitted_service_fields_do_not_detach_and_null_clears(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-detach@example.com",
        phone="+79001000051", name="Detach",
    )
    master = _master(db, master_user, "b3-detach")
    master_id = master.id
    headers = _headers(master_user)
    catalog_id = _catalog(client, headers, "Audit40", 40, 2500)
    canonical = Service(name="Канон30", price=900, duration=30, salon_id=None, indie_master_id=None)
    db.add(canonical)
    db.commit()
    db.refresh(canonical)
    canonical_id = canonical.id
    db.execute(master_services.insert().values(master_id=master_id, service_id=canonical_id))
    db.commit()
    start, end = _wall(days=7, hour=11, minutes=40)
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, master_service_id=catalog_id),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    quiet = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, notes="пока каталог грузится", version=1),
        headers=headers,
    )
    assert quiet.status_code == 200, quiet.text
    assert quiet.json()["master_service_id"] == catalog_id
    assert quiet.json()["service_id"] is None
    assert quiet.json()["notes"] == "пока каталог грузится"
    reloaded = client.get("/api/master/bookings/detailed", headers=headers)
    visible = next(item for item in reloaded.json() if item["id"] == booking_id)
    assert visible["master_service_id"] == catalog_id
    assert visible["service_name"] == "Audit40"
    assert visible["service_duration"] == 40
    assert visible["service_price"] == 2500
    switched = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(*_wall(days=7, hour=11, minutes=30), service_id=canonical_id, master_service_id=None, version=2),
        headers=headers,
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["service_id"] == canonical_id
    assert switched.json()["master_service_id"] is None
    other_catalog = _catalog(client, headers, "Другая40", 40, 1800)
    moved = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, master_service_id=other_catalog, service_id=None, version=3),
        headers=headers,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["master_service_id"] == other_catalog
    assert moved.json()["service_id"] is None
    both = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, service_id=canonical_id, master_service_id=other_catalog, version=4),
        headers=headers,
    )
    assert both.status_code == 400
    cleared = client.put(
        f"/api/master/bookings/manual/{booking_id}",
        json=_body(start, end, service_id=None, master_service_id=None, notes="без услуги", version=4),
        headers=headers,
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["service_id"] is None
    assert cleared.json()["master_service_id"] is None
    assert cleared.json()["notes"] == "без услуги"


def test_referenced_master_service_cannot_be_replaced_by_a_new_row(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-reuse@example.com",
        phone="+79001000052", name="Reuse",
    )
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-reuse2@example.com",
        phone="+79001000053", name="Reuse2",
    )
    master = _master(db, master_user, "b3-reuse")
    other = _master(db, other_user, "b3-reuse2")
    master_id = master.id
    other_id = other.id
    headers = _headers(master_user)
    other_headers = _headers(other_user)
    catalog_id = _catalog(client, headers, "Audit40", 40, 2500)
    free_id = _catalog(client, headers, "Свободная", 30, 500)
    start, end = _wall(days=8, hour=12, minutes=40)
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, master_service_id=catalog_id),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    renamed = client.put(
        f"/api/master/services/{catalog_id}",
        json={"name": "Audit40 плюс", "duration": 40, "price": 2500},
        headers=headers,
    )
    assert renamed.status_code == 200, renamed.text
    blocked = client.delete(f"/api/master/services/{catalog_id}", headers=headers)
    assert blocked.status_code == 409
    assert SERVICE_IN_USE in blocked.json()["detail"]
    db.expire_all()
    booking = db.get(Booking, booking_id)
    assert booking.master_service_id == catalog_id
    assert db.get(MasterService, catalog_id).name == "Audit40 плюс"
    assert db.get(MasterService, catalog_id).duration == 40
    assert db.get(MasterService, catalog_id).price == 2500
    replacement = _catalog(client, headers, "Новая90", 90, 9000)
    assert replacement != catalog_id
    detailed = client.get("/api/master/bookings/detailed", headers=headers)
    visible = next(item for item in detailed.json() if item["id"] == booking_id)
    assert visible["master_service_id"] == catalog_id
    assert visible["service_name"] == "Audit40 плюс"
    assert visible["service_duration"] == 40
    assert visible["service_price"] == 2500
    removed = client.delete(f"/api/master/services/{free_id}", headers=headers)
    assert removed.status_code == 200, removed.text
    missing = client.delete(f"/api/master/services/{free_id}", headers=headers)
    assert missing.status_code == 404
    foreign = client.delete(f"/api/master/services/{catalog_id}", headers=other_headers)
    assert foreign.status_code == 404
    assert db.get(MasterService, catalog_id) is not None
    past = Booking(
        master_id=master_id,
        master_service_id=catalog_id,
        start_time=datetime.utcnow() - timedelta(days=4),
        end_time=datetime.utcnow() - timedelta(days=4) + timedelta(minutes=40),
        status=BookingStatus.COMPLETED.value,
        guest_name="История",
        source="manual",
    )
    db.add(past)
    db.commit()
    still = client.delete(f"/api/master/services/{catalog_id}", headers=headers)
    assert still.status_code == 409
    other_free = MasterService(master_id=other_id, category_id=None, name="Чужая свободная", duration=20, price=100)
    db.add(other_free)
    db.commit()
    db.refresh(other_free)
    other_free_id = other_free.id
    gone = client.delete(f"/api/master/services/{other_free_id}", headers=other_headers)
    assert gone.status_code == 200, gone.text
    db.rollback()
    db.execute(text("PRAGMA foreign_keys=OFF"))
    assert int(db.execute(text("PRAGMA foreign_keys")).scalar() or 0) == 0
    with pytest.raises(HTTPException) as off_guard:
        delete_owned_master_service(db, master_id, catalog_id)
    assert off_guard.value.status_code == 409
    db.execute(text("PRAGMA foreign_keys=ON"))
    assert int(db.execute(text("PRAGMA foreign_keys")).scalar() or 0) == 1
    with pytest.raises(HTTPException) as on_guard:
        delete_owned_master_service(db, master_id, catalog_id)
    assert on_guard.value.status_code == 409
    assert db.get(MasterService, catalog_id) is not None
    assert db.get(Booking, booking_id).master_service_id == catalog_id
    assert db.execute(text("PRAGMA integrity_check")).scalar() == "ok"


def test_create_and_delete_of_one_service_cannot_dangle(db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-race-svc@example.com",
        phone="+79001000054", name="RaceSvc",
    )
    master = _master(db, master_user, "b3-race-svc")
    catalog = MasterService(master_id=master.id, category_id=None, name="Гонка40", duration=40, price=2500)
    db.add(catalog)
    db.commit()
    master_id = master.id
    actor_user_id = master_user.id
    catalog_id = catalog.id
    db.rollback()
    factory = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    start, end = _wall(days=9, hour=15, minutes=40)
    body = ManualWrite(client_name="Гонка", start_time=start, end_time=end, master_service_id=catalog_id)
    outcomes = {}

    def create():
        session = factory()
        try:
            owner = session.get(Master, master_id)
            outcomes["create"] = create_manual_booking(session, owner, actor_user_id, body, None)
        except HTTPException as exc:
            session.rollback()
            outcomes["create"] = exc
        finally:
            session.close()

    def remove():
        session = factory()
        try:
            delete_owned_master_service(session, master_id, catalog_id)
            outcomes["delete"] = 200
        except HTTPException as exc:
            session.rollback()
            outcomes["delete"] = exc.status_code
        finally:
            session.close()

    threads = [threading.Thread(target=create), threading.Thread(target=remove)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    check = factory()
    try:
        row = check.get(MasterService, catalog_id)
        bookings = check.query(Booking).filter(Booking.master_service_id == catalog_id).all()
        if bookings:
            assert row is not None
            assert row.name == "Гонка40" and row.duration == 40 and row.price == 2500
            assert outcomes["delete"] == 409
            assert isinstance(outcomes["create"], dict)
        else:
            assert row is None
            assert outcomes["delete"] == 200
            assert isinstance(outcomes["create"], HTTPException)
            assert outcomes["create"].status_code == 404
        assert check.execute(text("PRAGMA integrity_check")).scalar() == "ok"
    finally:
        check.close()


def test_account_cleanup_keeps_a_referenced_master_service(db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-cleanup@example.com",
        phone="+79001000055", name="Cleanup",
    )
    master = _master(db, master_user, "b3-cleanup")
    kept = MasterService(master_id=master.id, category_id=None, name="Историческая", duration=40, price=2500)
    free = MasterService(master_id=master.id, category_id=None, name="Пустая", duration=30, price=100)
    db.add_all([kept, free])
    db.commit()
    master_id = master.id
    kept_id = kept.id
    free_id = free.id
    db.add(Booking(
        master_id=master_id,
        master_service_id=kept_id,
        start_time=datetime.utcnow() - timedelta(days=2),
        end_time=datetime.utcnow() - timedelta(days=2) + timedelta(minutes=40),
        status=BookingStatus.COMPLETED.value,
        guest_name="Прошлая",
        source="manual",
    ))
    db.commit()
    _deactivate_master_services(db, master_id, None)
    db.commit()
    assert db.get(MasterService, kept_id) is not None
    assert db.get(MasterService, kept_id).name == "Историческая"
    assert db.get(MasterService, free_id) is None
    assert db.query(Booking).filter(Booking.master_service_id == kept_id).count() == 1


def test_canonical_service_delete_keeps_booking_identity(db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-online@example.com",
        phone="+79001000056", name="Online",
    )
    master = _master(db, master_user, "b3-online")
    used = Service(name="Онлайн", price=1500, duration=60, salon_id=None)
    free = Service(name="Свободная онлайн", price=800, duration=30, salon_id=None)
    db.add_all([used, free])
    db.commit()
    used_id = used.id
    free_id = free.id
    db.execute(master_services.insert().values(master_id=master.id, service_id=used_id))
    db.add(Booking(
        master_id=master.id,
        service_id=used_id,
        start_time=datetime.utcnow() - timedelta(days=1),
        end_time=datetime.utcnow() - timedelta(days=1) + timedelta(hours=1),
        status=BookingStatus.COMPLETED.value,
        source="online",
    ))
    db.commit()
    with pytest.raises(HTTPException) as blocked:
        delete_canonical_service(db, used_id)
    assert blocked.value.status_code == 409
    assert db.get(Service, used_id).name == "Онлайн"
    assert db.query(Booking).filter(Booking.service_id == used_id).count() == 1
    delete_canonical_service(db, free_id)
    assert db.get(Service, free_id) is None
    assert db.get(Service, used_id) is not None


def test_dashboard_uses_owned_master_service_snapshot(client, db, fixture_password_hash):
    master_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-dash@example.com",
        phone="+79001000057", name="Dash",
    )
    other_user = _user(
        db, fixture_password_hash, role=UserRole.MASTER, email="b3-dash2@example.com",
        phone="+79001000058", name="Dash2",
    )
    master = _master(db, master_user, "b3-dash")
    other = _master(db, other_user, "b3-dash2")
    master_id = master.id
    other_id = other.id
    headers = _headers(master_user)
    catalog_id = _catalog(client, headers, "Audit40", 40, 2500)
    colliding = Service(name="Чужой номер", price=1, duration=15, salon_id=None)
    colliding.id = catalog_id
    db.add(colliding)
    db.commit()
    start, end = _wall(days=6, hour=13, minutes=40)
    created = client.post(
        "/api/master/bookings/manual",
        json=_body(start, end, master_service_id=catalog_id, client_name="Дашборд"),
        headers=headers,
    )
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    foreign = MasterService(master_id=other_id, category_id=None, name="Чужая услуга", duration=90, price=9000)
    db.add(foreign)
    db.commit()
    db.refresh(foreign)
    stolen = Booking(
        master_id=master_id,
        master_service_id=foreign.id,
        start_time=datetime.utcnow() + timedelta(days=3),
        end_time=datetime.utcnow() + timedelta(days=3, hours=1),
        status=BookingStatus.CONFIRMED.value,
        guest_name="Чужая ссылка",
        source="manual",
    )
    db.add(stolen)
    db.commit()
    db.refresh(foreign)
    db.refresh(stolen)
    foreign_id = foreign.id
    stolen_id = stolen.id
    stats = client.get("/api/master/dashboard/stats", headers=headers)
    assert stats.status_code == 200, stats.text
    payload = stats.json()
    own = next(item for item in payload["next_bookings_list"] if item["id"] == booking_id)
    assert own["service_name"] == "Audit40"
    assert own["service_duration"] == "40 минут"
    assert own["service_price"] == 2500
    assert own["service_id"] is None
    assert own["master_service_id"] == catalog_id
    assert own["source"] == "manual"
    assert own["version"] >= 1
    assert own["time_zone"]
    assert own["start_utc_us"] and own["end_utc_us"]
    alien = next(item for item in payload["next_bookings_list"] if item["id"] == stolen_id)
    assert alien["service_name"] == "Неизвестная услуга"
    assert alien["service_price"] == 0
    assert alien["master_service_id"] == foreign_id
    assert alien["service_name"] != "Чужая услуга"
    info = payload["next_working_info"]
    first = payload["next_bookings_list"][0]
    assert info["service_name"] == first["service_name"]
    assert info["service_price"] == first["service_price"]
    assert info["master_service_id"] == first["master_service_id"]
    assert info["service_id"] == first["service_id"]
    assert info["source"] == first["source"]
    assert info["start_utc_us"] == first["start_utc_us"]

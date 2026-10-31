"""Calendar B3: manual bookings, private blocks, Free exemption, isolation."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
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
from services.calendar_b3 import ManualWrite, create_manual_booking
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
    db.rollback()
    factory = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    start, end = _wall(days=11, hour=12)
    body = ManualWrite(client_name="Гонка", start_time=start, end_time=end)

    def attempt(key):
        session = factory()
        try:
            owner = session.get(Master, master.id)
            return create_manual_booking(session, owner, master_user.id, body, key)
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
            owner = session.get(Master, master.id)
            keyed.append(create_manual_booking(session, owner, master_user.id, shared, "race-key"))
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
        assert list(connection.execute("SELECT version_num FROM alembic_version")) == [("20261030_calendar_b3",)]
    b1._alembic(f"sqlite:///{path}", "downgrade", "20261028_calendar_b22")
    with sqlite3.connect(path) as connection:
        names = {row[1] for row in connection.execute("PRAGMA table_info(bookings)")}
        assert "guest_name" not in names
        assert list(connection.execute("SELECT notes FROM bookings")) == [("legacy",)]

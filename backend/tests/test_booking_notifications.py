"""Stage 4: persistent Notification rows on booking create/cancel/reschedule."""

from datetime import datetime, timedelta, time, timezone as dt_timezone
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    Booking,
    Master,
    MasterSchedule,
    MasterService,
    Notification,
    NotificationOutbox,
    PushDevice,
    SalonMasterServiceSettings,
    Service,
    User,
    UserRole,
)
from services.notification_events import (
    _master_zoneinfo,
    _start_key,
    _wall_datetime,
    record_booking_cancelled_notification,
    record_booking_created_notification,
    record_booking_rescheduled_notification,
)
from settings import get_settings
from services.zvonok_service import ZVONOK_STUB_DIGITS


def _future_noon():
    day = datetime.now(dt_timezone.utc).date() + timedelta(days=3)
    return datetime.combine(day, time(12, 0))


def _login(client, phone: str) -> dict:
    response = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def world(db: Session):
    client_user = User(
        email="n4.client@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007770101",
        full_name="Notification Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    master_user = User(
        email="n4.master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007770102",
        full_name="Notification Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    admin = User(
        email="n4.admin@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007770103",
        full_name="Notification Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add_all([client_user, master_user, admin])
    db.commit()
    db.refresh(client_user)
    db.refresh(master_user)
    db.refresh(admin)

    master = Master(
        user_id=master_user.id,
        bio="",
        experience_years=1,
        domain="n4-notify-master",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    start = _future_noon()
    for offset in range(0, 5):
        db.add(
            MasterSchedule(
                master_id=master.id,
                salon_id=None,
                date=(start + timedelta(days=offset)).date(),
                start_time=time(0, 0),
                end_time=time(23, 59),
                is_available=True,
            )
        )

    service = Service(name="Стрижка", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)
    db.add(
        SalonMasterServiceSettings(
            master_id=master.id,
            service_id=service.id,
            is_active=True,
            master_payment_type="rub",
            master_payment_value=1000,
        )
    )
    master_service = MasterService(
        master_id=master.id,
        category_id=None,
        name="Стрижка",
        duration=60,
        price=1000.0,
    )
    db.add(master_service)
    db.commit()
    db.refresh(master_service)

    # Snapshot scalars before TestClient closes the shared session on login.
    return {
        "client": client_user,
        "master_user": master_user,
        "master": master,
        "admin": admin,
        "service": service,
        "master_service": master_service,
        "start": start,
        "client_id": int(client_user.id),
        "client_phone": str(client_user.phone),
        "master_user_id": int(master_user.id),
        "master_user_phone": str(master_user.phone),
        "master_id": int(master.id),
        "master_domain": str(master.domain),
        "admin_phone": str(admin.phone),
        "service_id": int(service.id),
        "master_service_id": int(master_service.id),
    }


def _payload(world, *, days=0, hours=0):
    start = world["start"] + timedelta(days=days, hours=hours)
    return {
        "service_id": world["service_id"],
        "master_id": world["master_id"],
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "status": "created",
        "client_name": "Notification Client",
        "service_name": "Стрижка",
        "service_duration": 60,
        "service_price": 1000.0,
    }


def _notes(db: Session, user_id: int):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.id.asc())
        .all()
    )


def _assert_no_outbox(db: Session):
    assert db.query(NotificationOutbox).count() == 0
    assert db.query(PushDevice).count() == 0


def _assert_safe_payload(row: Notification):
    blob = str(row.data_json or {})
    for forbidden in ("phone", "client_phone", "notes", "token", "password", "payment"):
        assert forbidden not in blob.lower()
    if row.data_json:
        assert set(row.data_json).issubset(
            {
                "service_name",
                "date_label",
                "time_label",
                "old_date_label",
                "old_time_label",
                "new_date_label",
                "new_time_label",
            }
        )


def test_authenticated_bookings_create_notifies_master_once(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]

    rows = _notes(db, world["master_user_id"])
    assert len(rows) == 1
    row = rows[0]
    assert row.type == "booking_created"
    assert row.title == "Новая запись"
    assert row.entity_type == "booking"
    assert row.entity_id == booking_id
    assert row.user_id == world["master_user_id"]
    assert row.read_at is None
    assert row.dedup_key == f"booking_created:{booking_id}"
    assert "Стрижка" in row.body
    _assert_safe_payload(row)
    _assert_no_outbox(db)
    assert _notes(db, world["client_id"]) == []


def test_client_router_create_notifies_master(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/client/bookings/", json=_payload(world, days=1), headers=headers)
    assert created.status_code == 200, created.text
    rows = _notes(db, world["master_user_id"])
    assert len(rows) == 1
    assert rows[0].type == "booking_created"
    assert rows[0].entity_id == created.json()["id"]
    _assert_no_outbox(db)


def test_public_master_create_notifies_master(client, db, world):
    headers = _login(client, world["client_phone"])
    start = world["start"] + timedelta(days=2)
    body = {
        "service_id": world["master_service_id"],
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
    }
    created = client.post(
        f"/api/public/masters/{world['master_domain']}/bookings",
        json=body,
        headers=headers,
    )
    assert created.status_code == 200, created.text
    rows = _notes(db, world["master_user_id"])
    assert len(rows) == 1
    assert rows[0].type == "booking_created"
    assert rows[0].entity_id == created.json()["id"]
    _assert_no_outbox(db)


def test_public_phone_proof_create_notifies_master(client, db, world, monkeypatch):
    pending = client.post(
        "/api/bookings/public",
        params={"client_phone": world["client_phone"]},
        json=_payload(world, days=3),
    )
    assert pending.status_code == 200, pending.text
    assert db.query(Notification).count() == 0
    monkeypatch.setattr(
        "routers.bookings.zvonok_service.send_verification_call",
        lambda phone: {"success": True, "call_id": "n4-call", "pincode": ZVONOK_STUB_DIGITS},
    )
    headers = {"Authorization": f"Bearer {pending.json()['verification_token']}"}
    requested = client.post("/api/bookings/public/verification/request", headers=headers)
    assert requested.status_code == 200, requested.text
    confirmed = client.post(
        "/api/bookings/public/verification/confirm",
        headers=headers,
        json={"call_id": "n4-call", "phone_digits": ZVONOK_STUB_DIGITS},
    )
    assert confirmed.status_code == 200, confirmed.text
    booking_id = confirmed.json()["booking_id"]
    rows = _notes(db, world["master_user_id"])
    assert len(rows) == 1
    assert rows[0].type == "booking_created"
    assert rows[0].entity_id == booking_id
    _assert_no_outbox(db)


def test_master_self_create_does_not_notify(client, db, world):
    headers = _login(client, world["master_user_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    assert created.status_code == 200, created.text
    assert _notes(db, world["master_user_id"]) == []
    _assert_no_outbox(db)


def test_client_cancel_notifies_once_and_retry_does_not_duplicate(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]
    cancelled = client.delete(f"/api/client/bookings/{booking_id}", headers=headers)
    assert cancelled.status_code == 200, cancelled.text
    types = [row.type for row in _notes(db, world["master_user_id"])]
    assert types == ["booking_created", "booking_cancelled"]
    cancelled_row = _notes(db, world["master_user_id"])[1]
    assert cancelled_row.dedup_key == f"booking_cancelled:{booking_id}"
    assert cancelled_row.title == "Запись отменена"
    assert "Стрижка" in cancelled_row.body
    _assert_safe_payload(cancelled_row)

    again = client.delete(f"/api/client/bookings/{booking_id}", headers=headers)
    assert again.status_code == 400
    assert [row.type for row in _notes(db, world["master_user_id"])] == [
        "booking_created",
        "booking_cancelled",
    ]
    _assert_no_outbox(db)


def test_master_accounting_cancel_does_not_notify_same_master(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]
    master_headers = _login(client, world["master_user_phone"])
    cancelled = client.post(
        f"/api/master/accounting/cancel-booking/{booking_id}",
        params={"cancellation_reason": "master_unavailable"},
        headers=master_headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    assert [row.type for row in _notes(db, world["master_user_id"])] == ["booking_created"]
    _assert_no_outbox(db)


def test_admin_hard_delete_does_not_create_notification(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]
    admin_headers = _login(client, world["admin_phone"])
    deleted = client.delete(f"/api/bookings/{booking_id}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text
    assert db.query(Booking).filter(Booking.id == booking_id).first() is None
    assert [row.type for row in _notes(db, world["master_user_id"])] == ["booking_created"]
    _assert_no_outbox(db)


def test_client_reschedule_creates_versioned_notifications(client, db, world):
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]
    first_start = world["start"] + timedelta(days=1)
    moved = client.put(
        f"/api/bookings/{booking_id}",
        json={
            "start_time": first_start.isoformat(),
            "end_time": (first_start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    assert moved.status_code == 200, moved.text
    original_start = world["start"]
    rows = _notes(db, world["master_user_id"])
    assert [row.type for row in rows] == ["booking_created", "booking_rescheduled"]
    assert rows[1].title == "Запись перенесена"
    assert rows[1].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(original_start)}:{_start_key(first_start)}"
    )
    _assert_safe_payload(rows[1])

    same = client.put(
        f"/api/bookings/{booking_id}",
        json={
            "start_time": first_start.isoformat(),
            "end_time": (first_start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    assert same.status_code == 200, same.text
    assert len(_notes(db, world["master_user_id"])) == 2

    second_start = world["start"] + timedelta(days=2)
    moved_again = client.put(
        f"/api/bookings/{booking_id}",
        json={
            "start_time": second_start.isoformat(),
            "end_time": (second_start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    assert moved_again.status_code == 200, moved_again.text
    notes = _notes(db, world["master_user_id"])
    assert [row.type for row in notes] == [
        "booking_created",
        "booking_rescheduled",
        "booking_rescheduled",
    ]
    assert notes[2].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(first_start)}:{_start_key(second_start)}"
    )
    _assert_no_outbox(db)


def _reschedule(client, headers, booking_id, start):
    response = client.put(
        f"/api/bookings/{booking_id}",
        json={
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response


def test_reschedule_back_to_original_slot_creates_second_event(client, db, world):
    headers = _login(client, world["client_phone"])
    original = world["start"]
    slot_b = original + timedelta(hours=1)
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]

    _reschedule(client, headers, booking_id, slot_b)
    _reschedule(client, headers, booking_id, original)

    notes = [row for row in _notes(db, world["master_user_id"]) if row.type == "booking_rescheduled"]
    assert len(notes) == 2
    assert notes[0].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(original)}:{_start_key(slot_b)}"
    )
    assert notes[1].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(slot_b)}:{_start_key(original)}"
    )
    _assert_no_outbox(db)


def test_reschedule_return_to_intermediate_target_creates_third_event(client, db, world):
    headers = _login(client, world["client_phone"])
    slot_a = world["start"]
    slot_b = slot_a + timedelta(hours=1)
    slot_c = slot_a + timedelta(hours=2)
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    booking_id = created.json()["id"]

    _reschedule(client, headers, booking_id, slot_b)
    _reschedule(client, headers, booking_id, slot_c)
    _reschedule(client, headers, booking_id, slot_b)

    notes = [row for row in _notes(db, world["master_user_id"]) if row.type == "booking_rescheduled"]
    assert len(notes) == 3
    assert notes[0].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(slot_a)}:{_start_key(slot_b)}"
    )
    assert notes[1].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(slot_b)}:{_start_key(slot_c)}"
    )
    assert notes[2].dedup_key == (
        f"booking_rescheduled:{booking_id}:{_start_key(slot_c)}:{_start_key(slot_b)}"
    )
    _assert_no_outbox(db)


def test_master_self_reschedule_and_edit_accept_do_not_notify(client, db, world):
    client_headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=client_headers)
    booking_id = created.json()["id"]
    master_headers = _login(client, world["master_user_phone"])

    moved_start = world["start"] + timedelta(hours=2)
    moved = client.put(
        f"/api/master/bookings/{booking_id}/time",
        json={
            "start_time": moved_start.isoformat(),
            "end_time": (moved_start + timedelta(hours=1)).isoformat(),
        },
        headers=master_headers,
    )
    assert moved.status_code == 200, moved.text
    assert [row.type for row in _notes(db, world["master_user_id"])] == ["booking_created"]

    proposed = world["start"] + timedelta(days=1)
    request = client.post(
        f"/api/bookings/{booking_id}/edit-requests",
        json={
            "booking_id": booking_id,
            "proposed_start": proposed.isoformat(),
            "proposed_end": (proposed + timedelta(hours=1)).isoformat(),
        },
        headers=client_headers,
    )
    assert request.status_code == 200, request.text
    assert [row.type for row in _notes(db, world["master_user_id"])] == ["booking_created"]

    accepted = client.put(
        f"/api/bookings/edit-requests/{request.json()['id']}",
        json={"status": "accepted"},
        headers=master_headers,
    )
    assert accepted.status_code == 200, accepted.text
    assert [row.type for row in _notes(db, world["master_user_id"])] == ["booking_created"]
    _assert_no_outbox(db)


def test_dedup_does_not_duplicate_or_fail_booking(db, world):
    start = world["start"]
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=start,
        end_time=start + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    first = record_booking_created_notification(db, booking, actor_user_id=world["client_id"])
    second = record_booking_created_notification(db, booking, actor_user_id=world["client_id"])
    assert first is not None and first[1] is True
    assert second is not None and second[1] is False
    record_booking_cancelled_notification(db, booking, actor_user_id=world["client_id"])
    record_booking_cancelled_notification(db, booking, actor_user_id=world["client_id"])
    new_start = start + timedelta(days=1)
    first_move = record_booking_rescheduled_notification(
        db, booking, actor_user_id=world["client_id"], old_start=start, new_start=new_start
    )
    retry_move = record_booking_rescheduled_notification(
        db, booking, actor_user_id=world["client_id"], old_start=start, new_start=new_start
    )
    assert first_move is not None and first_move[1] is True
    assert retry_move is not None and retry_move[1] is False
    assert first_move[0].dedup_key == (
        f"booking_rescheduled:{booking.id}:{_start_key(start)}:{_start_key(new_start)}"
    )
    assert retry_move[0].id == first_move[0].id
    db.commit()
    assert db.query(Booking).filter(Booking.id == booking.id).count() == 1
    notes = _notes(db, world["master_user_id"])
    assert [row.type for row in notes] == [
        "booking_created",
        "booking_cancelled",
        "booking_rescheduled",
    ]
    _assert_no_outbox(db)


def test_same_session_rollback_drops_booking_and_notification(db, world):
    start = world["start"]
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=start,
        end_time=start + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    record_booking_created_notification(db, booking, actor_user_id=world["client_id"])
    db.flush()
    assert db.query(Notification).count() == 1
    db.rollback()
    assert db.query(Booking).count() == 0
    assert db.query(Notification).count() == 0


def test_timezone_wall_clock_and_aware_conversion(db, world):
    naive = datetime(2030, 6, 15, 10, 0, 0)
    moscow = _master_zoneinfo(db, world["master_id"])
    assert str(moscow) == "Europe/Moscow"
    assert _wall_datetime(naive, moscow) == naive
    aware_utc = datetime(2030, 6, 15, 7, 0, 0, tzinfo=dt_timezone.utc)
    assert _wall_datetime(aware_utc, moscow).hour == 10

    master = db.query(Master).filter(Master.id == world["master_id"]).one()
    master.timezone = "Asia/Tokyo"
    db.commit()
    tokyo = _master_zoneinfo(db, world["master_id"])
    assert str(tokyo) == "Asia/Tokyo"
    assert _wall_datetime(naive, tokyo) == naive
    assert _wall_datetime(aware_utc, tokyo).hour == 16

    master = db.query(Master).filter(Master.id == world["master_id"]).one()
    master.timezone = "Not/AZone"
    db.commit()
    assert str(_master_zoneinfo(db, world["master_id"])) == "Europe/Moscow"


def test_http_booking_events_fanout_when_allowlisted(client, db, world, monkeypatch):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setattr(
        get_settings(),
        "PUSH_NOTIFICATION_USER_ALLOWLIST",
        str(world["master_user_id"]),
    )
    device = PushDevice(
        user_id=world["master_user_id"],
        installation_id=str(uuid4()),
        token=f"ExponentPushToken[{uuid4().hex[:20]}]",
        provider="expo",
        platform="ios",
        is_active=True,
    )
    db.add(device)
    db.commit()
    device_id = int(device.id)

    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    assert created.status_code == 200, created.text
    booking_id = created.json()["id"]
    assert db.query(Notification).filter(Notification.type == "booking_created").count() == 1
    assert db.query(NotificationOutbox).count() == 1

    moved_start = world["start"] + timedelta(days=1)
    moved = client.put(
        f"/api/bookings/{booking_id}",
        json={
            "start_time": moved_start.isoformat(),
            "end_time": (moved_start + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    assert moved.status_code == 200, moved.text
    cancelled = client.delete(f"/api/client/bookings/{booking_id}", headers=headers)
    assert cancelled.status_code == 200, cancelled.text

    notes = _notes(db, world["master_user_id"])
    assert [row.type for row in notes] == [
        "booking_created",
        "booking_rescheduled",
        "booking_cancelled",
    ]
    outbox = db.query(NotificationOutbox).order_by(NotificationOutbox.id.asc()).all()
    assert len(outbox) == 3
    assert {row.push_device_id for row in outbox} == {device_id}
    assert {row.status for row in outbox} == {NotificationOutbox.STATUS_QUEUED}
    assert {row.notification_id for row in outbox} == {row.id for row in notes}


def test_booking_request_does_not_send_expo(client, db, world, monkeypatch):
    calls = []

    async def forbidden(self, messages):
        calls.append(len(messages))
        raise AssertionError("Expo send must not run inside booking mutation")

    monkeypatch.setattr("services.push_sender.ExpoPushSender.send_messages", forbidden)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setattr(
        get_settings(),
        "PUSH_NOTIFICATION_USER_ALLOWLIST",
        str(world["master_user_id"]),
    )
    db.add(
        PushDevice(
            user_id=world["master_user_id"],
            installation_id=str(uuid4()),
            token=f"ExponentPushToken[{uuid4().hex[:20]}]",
            provider="expo",
            platform="ios",
            is_active=True,
        )
    )
    db.commit()
    headers = _login(client, world["client_phone"])
    created = client.post("/api/bookings/", json=_payload(world), headers=headers)
    assert created.status_code == 200, created.text
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 1
    assert db.query(NotificationOutbox).one().status == NotificationOutbox.STATUS_QUEUED
    assert calls == []

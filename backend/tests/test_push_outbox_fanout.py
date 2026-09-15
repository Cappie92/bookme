"""Stage 5A: NotificationOutbox fan-out and allowlist. No Expo HTTP."""

from __future__ import annotations

from datetime import datetime, timedelta, time, timezone as dt_timezone
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    Booking,
    Master,
    MasterSchedule,
    Notification,
    NotificationOutbox,
    PushDevice,
    SalonMasterServiceSettings,
    Service,
    User,
    UserRole,
)
from services.notification_events import (
    record_booking_cancelled_notification,
    record_booking_created_notification,
    record_booking_rescheduled_notification,
)
from services.notifications import create_notification
from services.push_outbox import fanout_notification_to_active_devices
from settings import get_settings, parse_push_user_allowlist


def _enable_fanout(monkeypatch, allowlist: str):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", allowlist)


def _add_device(
    db: Session,
    user_id: int,
    *,
    active: bool = True,
    provider: str = "expo",
    token: str | None = None,
) -> PushDevice:
    device = PushDevice(
        user_id=user_id,
        installation_id=str(uuid4()),
        token=token or f"ExponentPushToken[{uuid4().hex[:20]}]",
        provider=provider,
        platform="ios",
        is_active=active,
    )
    db.add(device)
    db.flush()
    return device


def _note(db: Session, user_id: int) -> Notification:
    row, created = create_notification(
        db,
        user_id=user_id,
        type="booking_created",
        title="Новая запись",
        body="Услуга · 1 января · 12:00",
        entity_type="booking",
        entity_id=1,
        dedup_key=f"booking_created:fanout:{user_id}:{uuid4().hex}",
    )
    assert created is True
    return row


@pytest.mark.parametrize(
    "raw,allow_all,ids",
    [
        ("", False, frozenset()),
        ("1", False, frozenset({1})),
        ("1,2,3", False, frozenset({1, 2, 3})),
        (" 1, 2 , 3 ", False, frozenset({1, 2, 3})),
        ("*", True, frozenset()),
        ("1,1,2", False, frozenset({1, 2})),
        ("abc", False, frozenset()),
        ("1,abc,2", False, frozenset()),
        ("-1", False, frozenset()),
        ("0", False, frozenset()),
        ("*,1", False, frozenset()),
        ("1,*", False, frozenset()),
    ],
)
def test_parse_push_user_allowlist(raw, allow_all, ids):
    got_all, got_ids = parse_push_user_allowlist(raw)
    assert got_all is allow_all
    assert got_ids == ids


def test_push_user_allowed_empty_is_nobody_even_when_enabled(monkeypatch, test_user):
    _enable_fanout(monkeypatch, "")
    assert get_settings().push_user_allowed(test_user.id) is False


def test_push_user_allowed_star_requires_enabled_flag(monkeypatch, test_user):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", "*")
    assert get_settings().push_user_allowed(test_user.id) is False
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "true")
    assert get_settings().push_user_allowed(test_user.id) is True


def test_flag_false_star_allowlist_creates_notification_without_outbox(
    db, test_user, monkeypatch
):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", "*")
    _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 0
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 0


def test_flag_true_empty_allowlist_creates_notification_without_outbox(
    db, test_user, monkeypatch
):
    _enable_fanout(monkeypatch, "")
    _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 0
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 0


def test_allowlist_excludes_user(db, test_user, monkeypatch):
    _enable_fanout(monkeypatch, str(test_user.id + 999))
    _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 0
    assert db.query(NotificationOutbox).count() == 0


def test_allowlist_includes_user_one_active_device(db, test_user, monkeypatch):
    _enable_fanout(monkeypatch, str(test_user.id))
    device = _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 1
    row = db.query(NotificationOutbox).one()
    assert row.notification_id == note.id
    assert row.push_device_id == device.id
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.retry_count == 0
    assert row.next_attempt_at is None
    assert row.provider_ticket_id is None


def test_star_allowlist_fans_out_all_active_expo_devices(db, test_user, monkeypatch):
    _enable_fanout(monkeypatch, "*")
    active_a = _add_device(db, test_user.id)
    active_b = _add_device(db, test_user.id)
    _add_device(db, test_user.id, active=False)
    _add_device(db, test_user.id, provider="fcm")
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 2
    device_ids = {row.push_device_id for row in db.query(NotificationOutbox).all()}
    assert device_ids == {active_a.id, active_b.id}


def test_zero_devices_keeps_notification(db, test_user, monkeypatch):
    _enable_fanout(monkeypatch, "*")
    note = _note(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert inserted == 0
    assert db.query(Notification).filter(Notification.id == note.id).count() == 1
    assert db.query(NotificationOutbox).count() == 0


def test_fanout_twice_is_idempotent_and_commits(db, test_user, monkeypatch):
    _enable_fanout(monkeypatch, "*")
    _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    first = fanout_notification_to_active_devices(db, notification=note)
    second = fanout_notification_to_active_devices(db, notification=note)
    db.commit()
    assert first == 1
    assert second == 0
    assert db.query(NotificationOutbox).count() == 1


def test_late_device_does_not_get_retroactive_outbox(db, monkeypatch):
    world = _booking_world(db)
    _enable_fanout(monkeypatch, "*")
    _add_device(db, world["master_user_id"])
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=world["start"],
        end_time=world["start"] + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    first = record_booking_created_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    assert first is not None and first[1] is True
    assert db.query(NotificationOutbox).count() == 1

    _add_device(db, world["master_user_id"])
    second = record_booking_created_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    db.commit()
    assert second is not None and second[1] is False
    assert db.query(NotificationOutbox).count() == 1


def test_outbox_keeps_device_fk_not_user_snapshot(db, test_user, test_master, monkeypatch):
    _enable_fanout(monkeypatch, "*")
    device = _add_device(db, test_user.id)
    note = _note(db, test_user.id)
    fanout_notification_to_active_devices(db, notification=note)
    device.user_id = test_master.id
    db.commit()
    row = db.query(NotificationOutbox).one()
    assert row.push_device_id == device.id
    assert row.notification.user_id == test_user.id
    assert device.user_id == test_master.id
    assert row.notification.user_id != device.user_id


def _booking_world(db: Session):
    client_user = User(
        email="n5a.client@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007770201",
        full_name="Fanout Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    master_user = User(
        email="n5a.master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79007770202",
        full_name="Fanout Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add_all([client_user, master_user])
    db.commit()
    db.refresh(client_user)
    db.refresh(master_user)
    master = Master(
        user_id=master_user.id,
        bio="",
        experience_years=1,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    start = datetime.combine(
        datetime.now(dt_timezone.utc).date() + timedelta(days=3), time(12, 0)
    )
    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=None,
            date=start.date(),
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
    db.commit()
    return {
        "client_id": int(client_user.id),
        "master_user_id": int(master_user.id),
        "master_id": int(master.id),
        "service_id": int(service.id),
        "start": start,
    }


def test_created_false_does_not_retroactively_fanout(db, monkeypatch):
    world = _booking_world(db)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", "*")
    _add_device(db, world["master_user_id"])
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=world["start"],
        end_time=world["start"] + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    first = record_booking_created_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    assert first is not None and first[1] is True
    assert db.query(NotificationOutbox).count() == 0

    _enable_fanout(monkeypatch, "*")
    second = record_booking_created_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    db.commit()
    assert second is not None and second[1] is False
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 0


def test_booking_created_cancelled_rescheduled_fanout_same_transaction(db, monkeypatch):
    world = _booking_world(db)
    _enable_fanout(monkeypatch, str(world["master_user_id"]))
    device = _add_device(db, world["master_user_id"])
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=world["start"],
        end_time=world["start"] + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    created = record_booking_created_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    cancelled = record_booking_cancelled_notification(
        db, booking, actor_user_id=world["client_id"]
    )
    moved = record_booking_rescheduled_notification(
        db,
        booking,
        actor_user_id=world["client_id"],
        old_start=world["start"],
        new_start=world["start"] + timedelta(hours=1),
    )
    db.commit()
    assert created[1] is True and cancelled[1] is True and moved[1] is True
    assert db.query(Booking).count() == 1
    assert db.query(Notification).count() == 3
    rows = db.query(NotificationOutbox).order_by(NotificationOutbox.id.asc()).all()
    assert len(rows) == 3
    assert {row.push_device_id for row in rows} == {device.id}
    assert {row.status for row in rows} == {NotificationOutbox.STATUS_QUEUED}


def test_rollback_drops_booking_notification_and_outbox(db, monkeypatch):
    world = _booking_world(db)
    _enable_fanout(monkeypatch, "*")
    _add_device(db, world["master_user_id"])
    booking = Booking(
        client_id=world["client_id"],
        service_id=world["service_id"],
        master_id=world["master_id"],
        start_time=world["start"],
        end_time=world["start"] + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.flush()
    record_booking_created_notification(db, booking, actor_user_id=world["client_id"])
    db.flush()
    assert db.query(Notification).count() == 1
    assert db.query(NotificationOutbox).count() == 1
    db.rollback()
    assert db.query(Booking).count() == 0
    assert db.query(Notification).count() == 0
    assert db.query(NotificationOutbox).count() == 0

"""Stage 5B worker: claim, send-time safety, retry, no receipts."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session, sessionmaker

from models import Notification, NotificationOutbox, PushDevice, User
from services.notifications import create_notification
from services.push_outbox import (
    ERR_DEVICE_INACTIVE,
    ERR_INVALID_CREDENTIALS,
    ERR_INVALID_TOKEN,
    ERR_NOT_ALLOWED,
    ERR_RECIPIENT_MISMATCH,
    ERR_RETRY_EXHAUSTED,
    ERR_STALE,
    PUSH_CLAIM_LEASE,
    PUSH_DELIVERY_TTL,
    PUSH_MAX_RETRY_COUNT,
    PUSH_SENT_RECEIPT_DELAY,
    claim_due_outbox_rows,
    fanout_notification_to_active_devices,
    utc_now,
)
from services.push_sender import KIND_TICKETS, KIND_TRANSIENT, ExpoSendBatchResult, ExpoTicket
from services.push_worker import (
    provider_cooling_down,
    reset_provider_cooldown,
    run_push_delivery_once,
)
from settings import get_settings


class FakeSender:
    def __init__(self, result=None, exc=None):
        self.calls = []
        self.result = result or ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[])
        self.exc = exc

    async def send_messages(self, messages):
        self.calls.append(messages)
        if self.exc:
            raise self.exc
        if (
            isinstance(self.result, ExpoSendBatchResult)
            and self.result.kind == KIND_TICKETS
            and len(self.result.tickets) != len(messages)
        ):
            tickets = [
                ExpoTicket(status="ok", ticket_id=f"auto-{index}")
                for index in range(len(messages))
            ]
            if self.result.tickets:
                tickets = list(self.result.tickets)
            return ExpoSendBatchResult(kind=KIND_TICKETS, tickets=tickets)
        return self.result


@pytest.fixture(autouse=True)
def _reset_cooldown():
    reset_provider_cooldown()
    yield
    reset_provider_cooldown()


def _enable(monkeypatch, allowlist: str = "*"):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "true")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", allowlist)


def _factory(db: Session):
    return sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)


def _add_device(db: Session, user_id: int, *, token: str | None = None, active: bool = True, provider: str = "expo"):
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


def _seed_outbox(db: Session, user: User, *, token: str | None = None) -> tuple[Notification, PushDevice, NotificationOutbox]:
    device = _add_device(db, user.id, token=token)
    note, created = create_notification(
        db,
        user_id=user.id,
        type="booking_created",
        title="Новая запись",
        body="Стрижка · 1 января · 12:00",
        entity_type="booking",
        entity_id=1,
        dedup_key=f"booking_created:worker:{user.id}:{uuid4().hex}",
    )
    assert created is True
    inserted = fanout_notification_to_active_devices(db, notification=note)
    assert inserted == 1
    db.commit()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.notification_id == note.id).one()
    return note, device, row


async def _run(db: Session, sender: FakeSender, now: datetime | None = None):
    return await run_push_delivery_once(
        session_factory=_factory(db),
        sender=sender,
        now=now or utc_now(),
        jitter_seconds=lambda: 0.0,
    )


def test_claim_only_due_queued_and_lease_does_not_increment_retry(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, _device, row = _seed_outbox(db, test_user)
    sent = NotificationOutbox(
        notification_id=note.id,
        push_device_id=_add_device(db, test_user.id).id,
        status=NotificationOutbox.STATUS_SENT,
        retry_count=0,
    )
    failed = NotificationOutbox(
        notification_id=note.id,
        push_device_id=_add_device(db, test_user.id).id,
        status=NotificationOutbox.STATUS_FAILED,
        retry_count=0,
    )
    dead = NotificationOutbox(
        notification_id=note.id,
        push_device_id=_add_device(db, test_user.id).id,
        status=NotificationOutbox.STATUS_DEAD_TOKEN,
        retry_count=0,
    )
    future = NotificationOutbox(
        notification_id=note.id,
        push_device_id=_add_device(db, test_user.id).id,
        status=NotificationOutbox.STATUS_QUEUED,
        retry_count=0,
        next_attempt_at=utc_now() + timedelta(hours=1),
    )
    exhausted = NotificationOutbox(
        notification_id=note.id,
        push_device_id=_add_device(db, test_user.id).id,
        status=NotificationOutbox.STATUS_QUEUED,
        retry_count=PUSH_MAX_RETRY_COUNT,
    )
    db.add_all([sent, failed, dead, future, exhausted])
    db.commit()
    now = utc_now()
    ids = claim_due_outbox_rows(db, now=now)
    db.commit()
    assert ids == [row.id]
    db.refresh(row)
    assert row.retry_count == 0
    assert row.next_attempt_at == now + PUSH_CLAIM_LEASE
    assert row.status == NotificationOutbox.STATUS_QUEUED


@pytest.mark.asyncio
async def test_send_success_persists_ticket(db, test_user, monkeypatch, caplog):
    _enable(monkeypatch)
    note, device, row = _seed_outbox(db, test_user)
    token = device.token
    sender = FakeSender(
        ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[ExpoTicket(status="ok", ticket_id="ticket-ok")])
    )
    caplog.set_level("INFO")
    now = utc_now()
    result = await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert result["http"] == 1
    assert len(sender.calls) == 1
    assert sender.calls[0][0]["data"]["notification_id"] == note.id
    assert row.status == NotificationOutbox.STATUS_SENT
    assert row.provider_ticket_id == "ticket-ok"
    assert row.next_attempt_at == now + PUSH_SENT_RECEIPT_DELAY
    assert row.last_error_class is None
    assert token not in caplog.text
    assert "Новая запись" not in caplog.text
    assert "Стрижка" not in caplog.text
    assert "getReceipts" not in caplog.text


@pytest.mark.asyncio
async def test_two_rows_map_to_two_tickets(db, test_user, monkeypatch):
    _enable(monkeypatch)
    first = _seed_outbox(db, test_user)
    second_device = _add_device(db, test_user.id)
    inserted = fanout_notification_to_active_devices(db, notification=first[0])
    db.commit()
    assert inserted == 1
    sender = FakeSender(
        ExpoSendBatchResult(
            kind=KIND_TICKETS,
            tickets=[
                ExpoTicket(status="ok", ticket_id="t-a"),
                ExpoTicket(status="ok", ticket_id="t-b"),
            ],
        )
    )
    await _run(db, sender)
    db.expire_all()
    rows = db.query(NotificationOutbox).order_by(NotificationOutbox.id.asc()).all()
    assert [row.provider_ticket_id for row in rows] == ["t-a", "t-b"]
    assert {row.status for row in rows} == {NotificationOutbox.STATUS_SENT}
    assert len(sender.calls[0]) == 2
    assert {row.push_device_id for row in rows} == {first[1].id, second_device.id}


@pytest.mark.asyncio
async def test_partial_batch_independent_state(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, _, _ = _seed_outbox(db, test_user)
    extra = [_add_device(db, test_user.id) for _ in range(2)]
    for device in extra:
        db.add(
            NotificationOutbox(
                notification_id=note.id,
                push_device_id=device.id,
                status=NotificationOutbox.STATUS_QUEUED,
                retry_count=0,
            )
        )
    db.commit()
    rows = db.query(NotificationOutbox).order_by(NotificationOutbox.id.asc()).all()
    sender = FakeSender(
        ExpoSendBatchResult(
            kind=KIND_TICKETS,
            tickets=[
                ExpoTicket(status="ok", ticket_id="ok-1"),
                ExpoTicket(status="error", error_code="MessageTooBig"),
                ExpoTicket(status="error", error_code="MessageRateExceeded"),
            ],
        )
    )
    await _run(db, sender)
    db.expire_all()
    rows = db.query(NotificationOutbox).order_by(NotificationOutbox.id.asc()).all()
    assert rows[0].status == NotificationOutbox.STATUS_SENT
    assert rows[0].provider_ticket_id == "ok-1"
    assert rows[1].status == NotificationOutbox.STATUS_FAILED
    assert rows[1].last_error_class == "message_too_big"
    assert rows[1].provider_ticket_id is None
    assert rows[2].status == NotificationOutbox.STATUS_QUEUED
    assert rows[2].retry_count == 1
    assert rows[2].last_error_class == "rate_exceeded"
    assert rows[2].next_attempt_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error_class",
    ["timeout", "network", "rate_exceeded", "http_5xx"],
)
async def test_transient_keeps_queued_and_increments_retry(db, test_user, monkeypatch, error_class):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    sender = FakeSender(ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class=error_class))
    now = utc_now()
    await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.retry_count == 1
    assert row.provider_ticket_id is None
    assert row.last_error_class == error_class
    assert row.next_attempt_at > now


@pytest.mark.asyncio
async def test_retry_exhaustion_marks_failed(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    row.retry_count = PUSH_MAX_RETRY_COUNT - 1
    db.commit()
    sender = FakeSender(ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="timeout"))
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.retry_count == PUSH_MAX_RETRY_COUNT
    assert row.last_error_class == ERR_RETRY_EXHAUSTED


@pytest.mark.asyncio
async def test_stale_notification_skips_http(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, _, row = _seed_outbox(db, test_user)
    now = utc_now()
    note.created_at = now - PUSH_DELIVERY_TTL - timedelta(seconds=1)
    db.commit()
    sender = FakeSender()
    await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_STALE


@pytest.mark.asyncio
async def test_ttl_boundary_still_sends(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, _, row = _seed_outbox(db, test_user)
    now = utc_now()
    note.created_at = now - PUSH_DELIVERY_TTL
    db.commit()
    sender = FakeSender(
        ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[ExpoTicket(status="ok", ticket_id="edge")])
    )
    await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert len(sender.calls) == 1
    assert row.status == NotificationOutbox.STATUS_SENT


@pytest.mark.asyncio
async def test_flag_off_releases_without_send_or_terminal(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    sender = FakeSender()
    result = await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert result["claimed"] == 0
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.last_error_class is None


@pytest.mark.asyncio
async def test_flag_off_after_claim_releases_without_http(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    retry_before = int(row.retry_count or 0)
    import services.push_worker as push_worker

    original_claim = push_worker._claim_ids

    async def claim_then_disable(*args, **kwargs):
        ids = await original_claim(*args, **kwargs)
        monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
        return ids

    monkeypatch.setattr(push_worker, "_claim_ids", claim_then_disable)
    sender = FakeSender()
    now = utc_now()
    result = await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert result["claimed"] == 1
    assert result["sent"] == 0
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.last_error_class is None
    assert row.retry_count == retry_before
    assert row.next_attempt_at == now


@pytest.mark.asyncio
async def test_invalid_credentials_sets_cooldown_and_skips_next_batch(
    db, test_user, monkeypatch
):
    _enable(monkeypatch)
    _, device, row = _seed_outbox(db, test_user)
    sender = FakeSender(
        ExpoSendBatchResult(
            kind=KIND_TICKETS,
            tickets=[ExpoTicket(status="error", error_code="InvalidCredentials")],
        )
    )
    now = utc_now()
    first = await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert first["http"] == 1
    assert len(sender.calls) == 1
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.retry_count == 1
    assert row.last_error_class == ERR_INVALID_CREDENTIALS
    assert row.provider_ticket_id is None
    assert row.next_attempt_at > now
    assert device.is_active is True
    assert provider_cooling_down(now) is True

    row.next_attempt_at = now
    db.commit()
    second = await _run(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert second.get("cooldown") is True
    assert second["claimed"] == 0
    assert len(sender.calls) == 1
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.retry_count == 1
    assert device.is_active is True


@pytest.mark.asyncio
async def test_empty_allowlist_is_nobody(db, test_user, monkeypatch):
    _enable(monkeypatch, "*")
    _, _, row = _seed_outbox(db, test_user)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", "")
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_NOT_ALLOWED


@pytest.mark.asyncio
async def test_user_removed_from_allowlist_is_terminal(db, test_user, monkeypatch):
    _enable(monkeypatch, str(test_user.id))
    _, _, row = _seed_outbox(db, test_user)
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", str(test_user.id + 999))
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_NOT_ALLOWED


@pytest.mark.asyncio
async def test_rebind_is_recipient_mismatch_without_http(db, test_user, test_master, monkeypatch):
    _enable(monkeypatch)
    _, device, row = _seed_outbox(db, test_user)
    device.user_id = test_master.id
    db.commit()
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_RECIPIENT_MISMATCH
    assert row.provider_ticket_id is None


@pytest.mark.asyncio
async def test_inactive_device_is_terminal(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, device, row = _seed_outbox(db, test_user)
    device.is_active = False
    db.commit()
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_DEVICE_INACTIVE


@pytest.mark.asyncio
async def test_sentinel_token_is_invalid_without_http(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, device, row = _seed_outbox(db, test_user)
    device.token = f"replaced:{device.id}"
    db.commit()
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_INVALID_TOKEN


@pytest.mark.asyncio
async def test_inactive_user_is_terminal(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    test_user.is_active = False
    db.commit()
    sender = FakeSender()
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.calls == []
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == "user_inactive"


@pytest.mark.asyncio
async def test_ticket_device_not_registered_deactivates_device_only(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, device, row = _seed_outbox(db, test_user)
    sibling_note, created = create_notification(
        db,
        user_id=test_user.id,
        type="booking_cancelled",
        title="Запись отменена",
        body="Стрижка · 1 января · 12:00",
        entity_type="booking",
        entity_id=2,
        dedup_key=f"booking_cancelled:worker:{test_user.id}:{uuid4().hex}",
    )
    assert created is True
    sibling = NotificationOutbox(
        notification_id=sibling_note.id,
        push_device_id=device.id,
        status=NotificationOutbox.STATUS_QUEUED,
        retry_count=0,
        next_attempt_at=utc_now() + timedelta(hours=2),
    )
    db.add(sibling)
    db.commit()
    sibling_id = int(sibling.id)
    sender = FakeSender(
        ExpoSendBatchResult(
            kind=KIND_TICKETS,
            tickets=[ExpoTicket(status="error", error_code="DeviceNotRegistered")],
        )
    )
    await _run(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    sibling = db.query(NotificationOutbox).filter(NotificationOutbox.id == sibling_id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert row.status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert row.last_error_class == "device_not_registered"
    assert device.is_active is False
    assert device.invalid_reason == "unregistered"
    assert sibling.status == NotificationOutbox.STATUS_QUEUED
    assert sibling.last_error_class is None


@pytest.mark.asyncio
async def test_crash_after_accept_can_send_again(db, test_user, monkeypatch):
    """At-least-once: Expo may accept before ticket persistence; lease expiry resends."""
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    now = utc_now()
    claimed = claim_due_outbox_rows(db, now=now)
    db.commit()
    assert claimed == [row.id]
    db.refresh(row)
    assert row.status == NotificationOutbox.STATUS_QUEUED
    assert row.provider_ticket_id is None
    row.next_attempt_at = now
    db.commit()
    sender = FakeSender(
        ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[ExpoTicket(status="ok", ticket_id="dup")])
    )
    await _run(db, sender, now=now)
    assert len(sender.calls) == 1


@pytest.mark.asyncio
async def test_sent_rows_are_ignored_by_worker(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_outbox(db, test_user)
    row.status = NotificationOutbox.STATUS_SENT
    row.provider_ticket_id = "already"
    db.commit()
    sender = FakeSender()
    result = await _run(db, sender)
    assert result["claimed"] == 0
    assert sender.calls == []
    db.refresh(row)
    assert row.status == NotificationOutbox.STATUS_SENT
    assert row.provider_ticket_id == "already"


@pytest.mark.asyncio
async def test_worker_does_not_create_missing_outbox(db, test_user, monkeypatch):
    _enable(monkeypatch)
    create_notification(
        db,
        user_id=test_user.id,
        type="booking_created",
        title="Новая запись",
        body="Стрижка · 1 января · 12:00",
        entity_type="booking",
        entity_id=9,
        dedup_key=f"booking_created:nofanout:{test_user.id}:{uuid4().hex}",
    )
    _add_device(db, test_user.id)
    db.commit()
    sender = FakeSender()
    await _run(db, sender)
    assert db.query(NotificationOutbox).count() == 0
    assert sender.calls == []

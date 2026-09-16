"""Stage 5C: Expo receipt polling, expiry, and rebind-safe dead-token cleanup."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session, sessionmaker

from models import Notification, NotificationOutbox, PushDevice, User
from services.notifications import create_notification
from services.push_devices import upsert_push_device
from services.push_outbox import (
    ERR_DEVICE_NOT_REGISTERED,
    ERR_INVALID_CREDENTIALS,
    ERR_INVALID_TOKEN,
    ERR_MESSAGE_TOO_BIG,
    ERR_MISMATCH_SENDER,
    ERR_PROVIDER_ERROR,
    ERR_RATE_EXCEEDED_RECEIPT,
    ERR_RECEIPT_EXPIRED,
    PUSH_RECEIPT_LEASE,
    PUSH_RECEIPT_RETRY_DELAY,
    PUSH_RECEIPT_TTL,
    apply_dead_token_from_receipt,
    claim_due_receipt_rows,
    utc_now,
)
from services.push_sender import (
    KIND_RECEIPTS,
    KIND_TICKETS,
    KIND_TRANSIENT,
    ExpoReceipt,
    ExpoReceiptsResult,
    ExpoSendBatchResult,
    ExpoTicket,
)
from services.push_worker import (
    provider_cooling_down,
    reset_provider_cooldown,
    run_push_receipts_once,
    run_push_tick_once,
)
from settings import get_settings


class FakeSender:
    def __init__(self, receipt_result=None, by_id=None, exc=None):
        self.send_calls = []
        self.receipt_calls = []
        self.receipt_result = receipt_result
        self.by_id = by_id or {}
        self.exc = exc

    async def send_messages(self, messages):
        self.send_calls.append(messages)
        return ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[])

    async def get_receipts(self, ticket_ids):
        self.receipt_calls.append(list(ticket_ids))
        if self.exc:
            raise self.exc
        if self.receipt_result is not None:
            return self.receipt_result
        receipts = {}
        for ticket_id in ticket_ids:
            receipt = self.by_id.get(ticket_id)
            if receipt is not None:
                receipts[ticket_id] = receipt
        return ExpoReceiptsResult(kind=KIND_RECEIPTS, receipts=receipts)


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


def _add_device(
    db: Session,
    user_id: int,
    *,
    token: str | None = None,
    active: bool = True,
    updated_at: datetime | None = None,
) -> PushDevice:
    now = updated_at or (utc_now() - timedelta(minutes=30))
    device = PushDevice(
        user_id=user_id,
        installation_id=str(uuid4()),
        token=token or f"ExponentPushToken[{uuid4().hex[:20]}]",
        provider="expo",
        platform="ios",
        is_active=active,
        created_at=now,
        updated_at=now,
        last_seen_at=now,
    )
    db.add(device)
    db.flush()
    return device


def _make_note(db: Session, user: User, *, suffix: str | None = None) -> Notification:
    note, created = create_notification(
        db,
        user_id=user.id,
        type="booking_created",
        title="Новая запись",
        body="Стрижка · 1 января · 12:00",
        entity_type="booking",
        entity_id=1,
        dedup_key=f"booking_created:receipt:{user.id}:{suffix or uuid4().hex}",
    )
    assert created is True
    return note


def _add_outbox(
    db: Session,
    note: Notification,
    device: PushDevice,
    *,
    status: str,
    ticket: str | None = None,
    next_at: datetime | None = None,
    sent_at: datetime | None = None,
    error_class: str | None = None,
) -> NotificationOutbox:
    stamp = sent_at or (utc_now() - timedelta(minutes=20))
    row = NotificationOutbox(
        notification_id=note.id,
        push_device_id=device.id,
        status=status,
        provider_ticket_id=ticket,
        retry_count=0,
        next_attempt_at=next_at,
        last_error_class=error_class,
        created_at=stamp,
        updated_at=stamp,
    )
    db.add(row)
    db.flush()
    return row


def _seed_sent(
    db: Session,
    user: User,
    *,
    ticket: str = "ticket-ok",
    device: PushDevice | None = None,
    next_at: datetime | None = None,
) -> tuple[Notification, PushDevice, NotificationOutbox]:
    device = device or _add_device(db, user.id)
    note = _make_note(db, user)
    now = utc_now()
    row = _add_outbox(
        db,
        note,
        device,
        status=NotificationOutbox.STATUS_SENT,
        ticket=ticket,
        next_at=now if next_at is None else next_at,
    )
    db.commit()
    return note, device, row


async def _run_receipts(db: Session, sender: FakeSender, now: datetime | None = None):
    return await run_push_receipts_once(
        session_factory=_factory(db),
        sender=sender,
        now=now or utc_now(),
    )


async def _run_tick(db: Session, sender: FakeSender, now: datetime | None = None):
    return await run_push_tick_once(
        session_factory=_factory(db),
        sender=sender,
        now=now or utc_now(),
        jitter_seconds=lambda: 0.0,
    )


def test_receipt_claim_only_due_sent_with_ticket(db, test_user, monkeypatch):
    _enable(monkeypatch)
    now = utc_now()
    note = _make_note(db, test_user)
    device = _add_device(db, test_user.id)
    due = _add_outbox(
        db, note, device, status=NotificationOutbox.STATUS_SENT, ticket="t-due", next_at=now
    )
    sent_at = due.updated_at
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="queued"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_QUEUED,
        next_at=now,
    )
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="noticket"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_SENT,
        ticket=None,
        next_at=now,
    )
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="future"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_SENT,
        ticket="t-future",
        next_at=now + timedelta(hours=1),
    )
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="received"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_RECEIVED,
        ticket="t-received",
        next_at=now,
    )
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="failed"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_FAILED,
        ticket="t-failed",
        next_at=now,
    )
    _add_outbox(
        db,
        _make_note(db, test_user, suffix="dead"),
        _add_device(db, test_user.id),
        status=NotificationOutbox.STATUS_DEAD_TOKEN,
        ticket="t-dead",
        next_at=now,
    )
    db.commit()
    ids = claim_due_receipt_rows(db, now=now)
    db.commit()
    assert ids == [due.id]
    db.refresh(due)
    assert due.retry_count == 0
    assert due.status == NotificationOutbox.STATUS_SENT
    assert due.next_attempt_at == now + PUSH_RECEIPT_LEASE
    assert due.updated_at == sent_at


@pytest.mark.asyncio
async def test_receipt_ok_marks_received_without_resend_or_read_at(
    db, test_user, monkeypatch, caplog
):
    _enable(monkeypatch)
    note, device, row = _seed_sent(db, test_user, ticket="ticket-ok")
    token = device.token
    sender = FakeSender(by_id={"ticket-ok": ExpoReceipt(ticket_id="ticket-ok", status="ok")})
    caplog.set_level("INFO")
    result = await _run_receipts(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    note = db.query(Notification).filter(Notification.id == note.id).one()
    assert result["http"] == 1
    assert sender.receipt_calls == [["ticket-ok"]]
    assert sender.send_calls == []
    assert row.status == NotificationOutbox.STATUS_RECEIVED
    assert row.next_attempt_at is None
    assert row.last_error_class is None
    assert row.retry_count == 0
    assert note.read_at is None
    assert token not in caplog.text
    assert "Новая запись" not in caplog.text
    assert "Стрижка" not in caplog.text


@pytest.mark.asyncio
async def test_missing_receipt_stays_sent_and_advances_next_attempt(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_sent(db, test_user, ticket="missing-t")
    retry_before = int(row.retry_count or 0)
    sent_at = row.updated_at
    now = utc_now()
    sender = FakeSender(by_id={})
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.send_calls == []
    assert row.status == NotificationOutbox.STATUS_SENT
    assert row.provider_ticket_id == "missing-t"
    assert row.retry_count == retry_before
    assert row.next_attempt_at == now + PUSH_RECEIPT_RETRY_DELAY
    assert row.updated_at == sent_at


@pytest.mark.asyncio
async def test_repeated_missing_then_expiry_is_receipt_expired(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, _, row = _seed_sent(db, test_user, ticket="expire-t")
    now = utc_now()
    sender = FakeSender(by_id={})
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert row.status == NotificationOutbox.STATUS_SENT
    note.created_at = now - PUSH_RECEIPT_TTL - timedelta(seconds=1)
    row.next_attempt_at = now
    db.commit()
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.send_calls == []
    assert len(sender.receipt_calls) == 1
    assert row.status == NotificationOutbox.STATUS_FAILED
    assert row.last_error_class == ERR_RECEIPT_EXPIRED
    assert row.next_attempt_at is None


@pytest.mark.asyncio
async def test_devicenotregistered_cleans_siblings_only_for_that_device(
    db, test_user, monkeypatch
):
    _enable(monkeypatch)
    now = utc_now()
    device = _add_device(db, test_user.id)
    other = _add_device(db, test_user.id)
    row_a = _add_outbox(
        db,
        _make_note(db, test_user, suffix="a"),
        device,
        status=NotificationOutbox.STATUS_SENT,
        ticket="t-a",
        next_at=now,
    )
    row_b = _add_outbox(
        db,
        _make_note(db, test_user, suffix="b"),
        device,
        status=NotificationOutbox.STATUS_QUEUED,
        next_at=now + timedelta(hours=1),
    )
    row_c = _add_outbox(
        db,
        _make_note(db, test_user, suffix="c"),
        device,
        status=NotificationOutbox.STATUS_SENT,
        ticket="t-c",
        next_at=now + timedelta(hours=1),
    )
    row_d = _add_outbox(
        db,
        _make_note(db, test_user, suffix="d"),
        device,
        status=NotificationOutbox.STATUS_RECEIVED,
        ticket="t-d",
    )
    row_e = _add_outbox(
        db,
        _make_note(db, test_user, suffix="e"),
        device,
        status=NotificationOutbox.STATUS_FAILED,
        error_class="http_5xx",
    )
    row_other = _add_outbox(
        db,
        _make_note(db, test_user, suffix="other"),
        other,
        status=NotificationOutbox.STATUS_SENT,
        ticket="t-other",
        next_at=now + timedelta(hours=1),
    )
    db.commit()
    ids = [row_a.id, row_b.id, row_c.id, row_d.id, row_e.id, row_other.id]
    sender = FakeSender(
        by_id={
            "t-a": ExpoReceipt(
                ticket_id="t-a", status="error", error_code="DeviceNotRegistered"
            )
        }
    )
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    rows = {row.id: row for row in db.query(NotificationOutbox).filter(NotificationOutbox.id.in_(ids))}
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    other = db.query(PushDevice).filter(PushDevice.id == other.id).one()
    assert device.is_active is False
    assert device.invalid_reason == "unregistered"
    assert device.invalidated_at is not None
    assert other.is_active is True
    assert rows[row_a.id].status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert rows[row_b.id].status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert rows[row_c.id].status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert rows[row_d.id].status == NotificationOutbox.STATUS_RECEIVED
    assert rows[row_e.id].status == NotificationOutbox.STATUS_FAILED
    assert rows[row_other.id].status == NotificationOutbox.STATUS_SENT
    assert rows[row_a.id].last_error_class == ERR_DEVICE_NOT_REGISTERED
    assert rows[row_b.id].next_attempt_at is None
    assert rows[row_c.id].next_attempt_at is None
    assert sender.send_calls == []


@pytest.mark.asyncio
async def test_dead_token_cleanup_is_idempotent(db, test_user, monkeypatch):
    _enable(monkeypatch)
    note, device, row = _seed_sent(db, test_user, ticket="t-dnr")
    sibling = _add_outbox(
        db,
        _make_note(db, test_user, suffix="sib"),
        device,
        status=NotificationOutbox.STATUS_QUEUED,
    )
    db.commit()
    sender = FakeSender(
        by_id={
            "t-dnr": ExpoReceipt(
                ticket_id="t-dnr", status="error", error_code="DeviceNotRegistered"
            )
        }
    )
    await _run_receipts(db, sender)
    db.expire_all()
    persist = _factory(db)()
    try:
        again = persist.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
        apply_dead_token_from_receipt(persist, again, now=utc_now())
        apply_dead_token_from_receipt(persist, again, now=utc_now())
        persist.commit()
    finally:
        persist.close()
    second = await _run_receipts(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    sibling = db.query(NotificationOutbox).filter(NotificationOutbox.id == sibling.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert second["claimed"] == 0
    assert row.status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert sibling.status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert device.is_active is False
    assert device.invalid_reason == "unregistered"


@pytest.mark.asyncio
async def test_stale_receipt_does_not_deactivate_rebound_device(
    db, test_user, test_master, monkeypatch
):
    _enable(monkeypatch)
    old_token = f"ExponentPushToken[{uuid4().hex[:20]}]"
    new_token = f"ExponentPushToken[{uuid4().hex[:20]}]"
    note, device, row = _seed_sent(db, test_user, ticket="old-ticket")
    sibling = _add_outbox(
        db,
        _make_note(db, test_user, suffix="queued-old"),
        device,
        status=NotificationOutbox.STATUS_QUEUED,
    )
    db.commit()
    upsert_push_device(
        db,
        user=test_master,
        installation_id=device.installation_id,
        token=new_token,
        provider="expo",
        platform="ios",
    )
    db.commit()
    sender = FakeSender(
        by_id={
            "old-ticket": ExpoReceipt(
                ticket_id="old-ticket", status="error", error_code="DeviceNotRegistered"
            )
        }
    )
    await _run_receipts(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    sibling = db.query(NotificationOutbox).filter(NotificationOutbox.id == sibling.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert row.status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert row.last_error_class == ERR_DEVICE_NOT_REGISTERED
    assert sibling.status == NotificationOutbox.STATUS_QUEUED
    assert device.is_active is True
    assert device.user_id == test_master.id
    assert device.token == new_token
    assert device.token != old_token
    assert sender.send_calls == []


@pytest.mark.asyncio
async def test_stale_receipt_does_not_deactivate_same_user_retoken(
    db, test_user, monkeypatch
):
    _enable(monkeypatch)
    new_token = f"ExponentPushToken[{uuid4().hex[:20]}]"
    _, device, row = _seed_sent(db, test_user, ticket="old-ticket")
    upsert_push_device(
        db,
        user=test_user,
        installation_id=device.installation_id,
        token=new_token,
        provider="expo",
        platform="ios",
    )
    db.commit()
    sender = FakeSender(
        by_id={
            "old-ticket": ExpoReceipt(
                ticket_id="old-ticket", status="error", error_code="DeviceNotRegistered"
            )
        }
    )
    await _run_receipts(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert row.status == NotificationOutbox.STATUS_DEAD_TOKEN
    assert device.is_active is True
    assert device.user_id == test_user.id
    assert device.token == new_token


@pytest.mark.asyncio
async def test_flag_off_skips_send_but_still_polls_receipts(db, test_user, monkeypatch):
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATIONS_ENABLED", "false")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", "*")
    note = _make_note(db, test_user, suffix="queued")
    queued_device = _add_device(db, test_user.id)
    queued = _add_outbox(
        db,
        note,
        queued_device,
        status=NotificationOutbox.STATUS_QUEUED,
        next_at=utc_now(),
    )
    _, _, sent = _seed_sent(db, test_user, ticket="flag-ticket")
    sender = FakeSender(by_id={"flag-ticket": ExpoReceipt(ticket_id="flag-ticket", status="ok")})
    result = await _run_tick(db, sender)
    db.expire_all()
    queued = db.query(NotificationOutbox).filter(NotificationOutbox.id == queued.id).one()
    sent = db.query(NotificationOutbox).filter(NotificationOutbox.id == sent.id).one()
    assert result["send"]["claimed"] == 0
    assert result["receipts"]["http"] == 1
    assert sender.send_calls == []
    assert sender.receipt_calls == [["flag-ticket"]]
    assert queued.status == NotificationOutbox.STATUS_QUEUED
    assert sent.status == NotificationOutbox.STATUS_RECEIVED


@pytest.mark.asyncio
async def test_allowlist_removed_still_finalizes_receipt(db, test_user, monkeypatch):
    _enable(monkeypatch, str(test_user.id))
    _, _, row = _seed_sent(db, test_user, ticket="allow-ticket")
    monkeypatch.setattr(get_settings(), "PUSH_NOTIFICATION_USER_ALLOWLIST", str(test_user.id + 999))
    sender = FakeSender(by_id={"allow-ticket": ExpoReceipt(ticket_id="allow-ticket", status="ok")})
    await _run_tick(db, sender)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.send_calls == []
    assert sender.receipt_calls == [["allow-ticket"]]
    assert row.status == NotificationOutbox.STATUS_RECEIVED


@pytest.mark.asyncio
async def test_malformed_receipt_response_reschedules_without_resend(db, test_user, monkeypatch):
    _enable(monkeypatch)
    _, _, row = _seed_sent(db, test_user, ticket="bad-json")
    retry_before = int(row.retry_count or 0)
    now = utc_now()
    sender = FakeSender(
        receipt_result=ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    )
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.send_calls == []
    assert row.status == NotificationOutbox.STATUS_SENT
    assert row.retry_count == retry_before
    assert row.next_attempt_at == now + PUSH_RECEIPT_RETRY_DELAY


@pytest.mark.parametrize(
    "error_code,status,error_class,device_active",
    [
        ("DeviceNotRegistered", NotificationOutbox.STATUS_DEAD_TOKEN, ERR_DEVICE_NOT_REGISTERED, False),
        ("MessageTooBig", NotificationOutbox.STATUS_FAILED, ERR_MESSAGE_TOO_BIG, True),
        ("MessageRateExceeded", NotificationOutbox.STATUS_FAILED, ERR_RATE_EXCEEDED_RECEIPT, True),
        ("InvalidCredentials", NotificationOutbox.STATUS_FAILED, ERR_INVALID_CREDENTIALS, True),
        ("MismatchSenderId", NotificationOutbox.STATUS_FAILED, ERR_MISMATCH_SENDER, True),
        ("UnknownExpoError", NotificationOutbox.STATUS_FAILED, ERR_PROVIDER_ERROR, True),
        ("InvalidPushToken", NotificationOutbox.STATUS_FAILED, ERR_INVALID_TOKEN, True),
    ],
)
@pytest.mark.asyncio
async def test_receipt_provider_errors_are_terminal_without_resend(
    db, test_user, monkeypatch, error_code, status, error_class, device_active
):
    _enable(monkeypatch)
    _, device, row = _seed_sent(db, test_user, ticket="err-ticket")
    sender = FakeSender(
        by_id={
            "err-ticket": ExpoReceipt(
                ticket_id="err-ticket", status="error", error_code=error_code
            )
        }
    )
    now = utc_now()
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    device = db.query(PushDevice).filter(PushDevice.id == device.id).one()
    assert sender.send_calls == []
    assert row.status == status
    assert row.last_error_class == error_class
    assert row.next_attempt_at is None
    assert row.provider_ticket_id == "err-ticket"
    assert device.is_active is device_active
    if error_code == "InvalidCredentials":
        assert provider_cooling_down(now) is True


@pytest.mark.asyncio
async def test_receipt_network_failure_keeps_sent_without_send_retry_count(
    db, test_user, monkeypatch
):
    _enable(monkeypatch)
    _, _, row = _seed_sent(db, test_user, ticket="net-ticket")
    retry_before = int(row.retry_count or 0)
    now = utc_now()
    sender = FakeSender(
        receipt_result=ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="timeout")
    )
    await _run_receipts(db, sender, now=now)
    db.expire_all()
    row = db.query(NotificationOutbox).filter(NotificationOutbox.id == row.id).one()
    assert sender.send_calls == []
    assert row.status == NotificationOutbox.STATUS_SENT
    assert row.retry_count == retry_before
    assert row.next_attempt_at == now + PUSH_RECEIPT_RETRY_DELAY

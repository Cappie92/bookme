"""Notification outbox fan-out, claim/lease, and retry helpers. No receipts."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Notification, NotificationOutbox, PushDevice
from settings import get_settings

PUSH_WORKER_INTERVAL_SECONDS = 20
PUSH_DELIVERY_TTL = timedelta(hours=12)
PUSH_CLAIM_BATCH_SIZE = 100
PUSH_CLAIM_LEASE = timedelta(minutes=2)
PUSH_MAX_RETRY_COUNT = 8
PUSH_SENT_RECEIPT_DELAY = timedelta(minutes=15)
PUSH_CREDENTIALS_COOLDOWN = timedelta(minutes=15)

RETRY_BACKOFF = (
    timedelta(seconds=30),
    timedelta(minutes=1),
    timedelta(minutes=2),
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(hours=1),
    timedelta(hours=2),
    timedelta(hours=4),
)

ERR_RECIPIENT_MISMATCH = "recipient_mismatch"
ERR_DEVICE_INACTIVE = "device_inactive"
ERR_INVALID_TOKEN = "invalid_token"
ERR_USER_INACTIVE = "user_inactive"
ERR_STALE = "stale"
ERR_NOT_ALLOWED = "not_allowed"
ERR_RETRY_EXHAUSTED = "retry_exhausted"
ERR_DEVICE_NOT_REGISTERED = "device_not_registered"
ERR_RATE_EXCEEDED = "rate_exceeded"
ERR_TIMEOUT = "timeout"
ERR_NETWORK = "network"
ERR_HTTP_5XX = "http_5xx"
ERR_HTTP_4XX = "http_4xx"
ERR_PROVIDER_ERROR = "provider_error"
ERR_INVALID_CREDENTIALS = "invalid_credentials"
ERR_MALFORMED_RESPONSE = "malformed_response"
ERR_MESSAGE_TOO_BIG = "message_too_big"

INVALID_REASON_UNREGISTERED = "unregistered"


def utc_now() -> datetime:
    return datetime.utcnow()


def as_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def notification_deadline(created_at: datetime | None) -> datetime | None:
    created = as_naive_utc(created_at)
    if created is None:
        return None
    return created + PUSH_DELIVERY_TTL


def is_past_ttl(created_at: datetime | None, now: datetime) -> bool:
    deadline = notification_deadline(created_at)
    if deadline is None:
        return True
    return as_naive_utc(now) > deadline


def fanout_notification_to_active_devices(
    db: Session,
    *,
    notification: Notification,
) -> int:
    """Insert queued outbox rows for the recipient's active Expo devices.

    Same SQLAlchemy session, no commit. Duplicate (notification, device) is a no-op.
    """
    if notification is None or not notification.id or not notification.user_id:
        return 0
    if not get_settings().push_user_allowed(notification.user_id):
        return 0

    devices = (
        db.query(PushDevice)
        .filter(
            PushDevice.user_id == notification.user_id,
            PushDevice.is_active.is_(True),
            PushDevice.provider == "expo",
        )
        .all()
    )
    if not devices:
        return 0

    already = {
        device_id
        for (device_id,) in db.query(NotificationOutbox.push_device_id).filter(
            NotificationOutbox.notification_id == notification.id
        )
    }
    inserted = 0
    for device in devices:
        if device.id in already:
            continue
        db.add(
            NotificationOutbox(
                notification_id=notification.id,
                push_device_id=device.id,
                status=NotificationOutbox.STATUS_QUEUED,
                retry_count=0,
                next_attempt_at=None,
            )
        )
        inserted += 1
    if inserted:
        db.flush()
    return inserted


def claim_due_outbox_rows(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = PUSH_CLAIM_BATCH_SIZE,
) -> list[int]:
    """Lease due queued rows. Does not increment retry_count. No commit."""
    current = as_naive_utc(now) or utc_now()
    rows = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.status == NotificationOutbox.STATUS_QUEUED,
            NotificationOutbox.retry_count < PUSH_MAX_RETRY_COUNT,
            or_(
                NotificationOutbox.next_attempt_at.is_(None),
                NotificationOutbox.next_attempt_at <= current,
            ),
        )
        .order_by(NotificationOutbox.id.asc())
        .limit(limit)
        .all()
    )
    lease_until = current + PUSH_CLAIM_LEASE
    ids: list[int] = []
    for row in rows:
        row.next_attempt_at = lease_until
        row.updated_at = current
        ids.append(int(row.id))
    if ids:
        db.flush()
    return ids


def mark_terminal(
    row: NotificationOutbox,
    *,
    now: datetime,
    error_class: str,
    status: str = NotificationOutbox.STATUS_FAILED,
) -> None:
    row.status = status
    row.last_error_class = error_class
    row.next_attempt_at = as_naive_utc(now)
    row.updated_at = as_naive_utc(now)


def release_to_queued(
    row: NotificationOutbox,
    *,
    now: datetime,
    next_attempt_at: datetime | None = None,
) -> None:
    row.status = NotificationOutbox.STATUS_QUEUED
    current = as_naive_utc(now)
    row.next_attempt_at = as_naive_utc(next_attempt_at) if next_attempt_at is not None else current
    row.updated_at = current


def schedule_retry(
    row: NotificationOutbox,
    *,
    now: datetime,
    error_class: str,
    jitter_seconds: float = 0,
    created_at: datetime | None = None,
) -> None:
    """Increment retry_count after a real send attempt. May become terminal."""
    current = as_naive_utc(now)
    row.retry_count = int(row.retry_count or 0) + 1
    row.last_error_class = error_class
    row.provider_ticket_id = None
    row.updated_at = current
    if row.retry_count >= PUSH_MAX_RETRY_COUNT:
        mark_terminal(row, now=current, error_class=ERR_RETRY_EXHAUSTED)
        return
    delay_index = min(row.retry_count - 1, len(RETRY_BACKOFF) - 1)
    next_at = current + RETRY_BACKOFF[delay_index] + timedelta(seconds=max(0.0, jitter_seconds))
    deadline = notification_deadline(created_at)
    if deadline is not None and next_at > deadline:
        mark_terminal(row, now=current, error_class=ERR_STALE)
        return
    row.status = NotificationOutbox.STATUS_QUEUED
    row.next_attempt_at = next_at


def mark_sent(
    row: NotificationOutbox,
    *,
    now: datetime,
    ticket_id: str | None,
) -> None:
    current = as_naive_utc(now)
    row.status = NotificationOutbox.STATUS_SENT
    row.provider_ticket_id = ticket_id
    row.next_attempt_at = current + PUSH_SENT_RECEIPT_DELAY
    row.last_error_class = None
    row.updated_at = current


def deactivate_unregistered_device(device: PushDevice, *, now: datetime) -> None:
    current = as_naive_utc(now)
    device.is_active = False
    device.invalidated_at = current
    device.invalid_reason = INVALID_REASON_UNREGISTERED
    device.updated_at = current

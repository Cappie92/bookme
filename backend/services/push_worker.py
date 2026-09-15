"""In-process outbox worker: claim, send-time safety, Expo send, retry.

Delivery is at-least-once. If Expo accepts a batch and the process crashes
before ticket persistence, the lease expires and the same queued row may be
sent again. There is no distributed lock and no exactly-once claim.

Stage 5B does not poll receipts and never transitions sent → received.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from sqlalchemy.orm import Session, joinedload, sessionmaker

from database import SessionLocal
from models import Notification, NotificationOutbox, PushDevice, User
from services.push_outbox import (
    ERR_DEVICE_INACTIVE,
    ERR_INVALID_CREDENTIALS,
    ERR_INVALID_TOKEN,
    ERR_NOT_ALLOWED,
    ERR_PROVIDER_ERROR,
    ERR_RECIPIENT_MISMATCH,
    ERR_STALE,
    ERR_USER_INACTIVE,
    PUSH_CREDENTIALS_COOLDOWN,
    PUSH_WORKER_INTERVAL_SECONDS,
    as_naive_utc,
    claim_due_outbox_rows,
    deactivate_unregistered_device,
    is_past_ttl,
    mark_sent,
    mark_terminal,
    release_to_queued,
    schedule_retry,
    utc_now,
)
from services.push_sender import (
    KIND_CREDENTIALS,
    KIND_PERMANENT,
    KIND_TICKETS,
    KIND_TRANSIENT,
    ExpoPushSender,
    ExpoSendBatchResult,
    ExpoTicket,
    build_expo_message,
    is_sendable_expo_token,
)
from settings import get_settings

logger = logging.getLogger("dedato.push")

_claim_lock = asyncio.Lock()
_provider_cooldown_until: datetime | None = None
JitterFn = Callable[[], float]


@dataclass
class _SendCandidate:
    outbox_id: int
    user_id: int
    notification_id: int
    push_device_id: int
    notification_type: str | None
    retry_count: int
    created_at: datetime | None
    message: dict


def _open_session(session_factory) -> Session:
    factory = session_factory or SessionLocal
    return factory()


def _close_quietly(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.close()
    except Exception:
        logger.exception("push worker session close failed")


def provider_cooling_down(now: datetime) -> bool:
    current = as_naive_utc(now)
    return _provider_cooldown_until is not None and current < _provider_cooldown_until


def trip_provider_cooldown(now: datetime) -> None:
    global _provider_cooldown_until
    _provider_cooldown_until = as_naive_utc(now) + PUSH_CREDENTIALS_COOLDOWN
    logger.warning(
        "expo credentials cooldown until=%s",
        _provider_cooldown_until.isoformat(timespec="seconds"),
    )


def reset_provider_cooldown() -> None:
    global _provider_cooldown_until
    _provider_cooldown_until = None


def default_jitter_seconds() -> float:
    return random.uniform(0.0, 5.0)


def _recipient_user(db: Session, notification: Notification) -> User | None:
    return db.query(User).filter(User.id == notification.user_id).first()


def evaluate_send_safety(
    db: Session,
    row: NotificationOutbox,
    *,
    now: datetime,
) -> tuple[str, str | None]:
    """Return (action, error_class). action: send | terminal | release."""
    current = as_naive_utc(now)
    if row.status != NotificationOutbox.STATUS_QUEUED:
        return "skip", None
    if not get_settings().push_notifications_enabled:
        return "release", None
    notification = row.notification
    device = row.push_device
    if notification is None or device is None:
        return "terminal", ERR_DEVICE_INACTIVE if device is None else ERR_STALE
    if is_past_ttl(notification.created_at, current):
        return "terminal", ERR_STALE
    if not get_settings().push_user_allowed(notification.user_id):
        return "terminal", ERR_NOT_ALLOWED
    if notification.user_id != device.user_id:
        return "terminal", ERR_RECIPIENT_MISMATCH
    if not device.is_active or device.provider != "expo":
        return "terminal", ERR_DEVICE_INACTIVE
    user = _recipient_user(db, notification)
    if user is None or not user.is_active or user.deleted_at is not None:
        return "terminal", ERR_USER_INACTIVE
    if not is_sendable_expo_token(device.token):
        return "terminal", ERR_INVALID_TOKEN
    return "send", None


def _load_claimed_rows(db: Session, ids: list[int]) -> list[NotificationOutbox]:
    if not ids:
        return []
    return (
        db.query(NotificationOutbox)
        .options(
            joinedload(NotificationOutbox.notification),
            joinedload(NotificationOutbox.push_device),
        )
        .filter(NotificationOutbox.id.in_(ids))
        .order_by(NotificationOutbox.id.asc())
        .all()
    )


async def _claim_ids(session_factory, *, now: datetime) -> list[int]:
    async with _claim_lock:
        db = _open_session(session_factory)
        try:
            ids = claim_due_outbox_rows(db, now=now)
            db.commit()
            return ids
        except Exception:
            db.rollback()
            logger.exception("push claim failed")
            return []
        finally:
            _close_quietly(db)


def _persist_decisions(
    session_factory,
    *,
    ids: list[int],
    now: datetime,
) -> list[_SendCandidate]:
    db = _open_session(session_factory)
    sendable: list[_SendCandidate] = []
    try:
        rows = _load_claimed_rows(db, ids)
        for row in rows:
            action, error_class = evaluate_send_safety(db, row, now=now)
            notification = row.notification
            device = row.push_device
            if action == "release":
                release_to_queued(row, now=now)
                logger.info(
                    "push release outbox_id=%s notification_id=%s reason=flag_off",
                    row.id,
                    row.notification_id,
                )
                continue
            if action == "terminal":
                mark_terminal(row, now=now, error_class=error_class or ERR_PROVIDER_ERROR)
                logger.info(
                    "push terminal outbox_id=%s notification_id=%s user_id=%s "
                    "push_device_id=%s error_class=%s",
                    row.id,
                    row.notification_id,
                    getattr(notification, "user_id", None),
                    row.push_device_id,
                    error_class,
                )
                continue
            if action != "send" or notification is None or device is None:
                continue
            sendable.append(
                _SendCandidate(
                    outbox_id=int(row.id),
                    user_id=int(notification.user_id),
                    notification_id=int(notification.id),
                    push_device_id=int(device.id),
                    notification_type=notification.type,
                    retry_count=int(row.retry_count or 0),
                    created_at=notification.created_at,
                    message=build_expo_message(notification=notification, token=device.token),
                )
            )
        db.commit()
        return sendable
    except Exception:
        db.rollback()
        logger.exception("push safety persist failed")
        return []
    finally:
        _close_quietly(db)


def _ticket_outcome(ticket: ExpoTicket) -> tuple[str, str | None]:
    if ticket.status == "ok":
        return "sent", None
    code = ticket.error_code or ""
    if code == "DeviceNotRegistered":
        return "dead_token", "device_not_registered"
    if code == "MessageRateExceeded":
        return "retry", "rate_exceeded"
    if code == "InvalidCredentials":
        return "credentials", ERR_INVALID_CREDENTIALS
    if code == "MessageTooBig":
        return "failed", "message_too_big"
    if code in {"InvalidPushToken", "ValidationError"}:
        return "failed", ERR_INVALID_TOKEN
    return "failed", "provider_error"


def _apply_batch_failure(
    db: Session,
    candidates: list[_SendCandidate],
    *,
    now: datetime,
    error_class: str,
    jitter_seconds: float,
) -> None:
    rows = {row.id: row for row in _load_claimed_rows(db, [item.outbox_id for item in candidates])}
    for item in candidates:
        row = rows.get(item.outbox_id)
        if row is None or row.status != NotificationOutbox.STATUS_QUEUED:
            continue
        schedule_retry(
            row,
            now=now,
            error_class=error_class,
            jitter_seconds=jitter_seconds,
            created_at=item.created_at,
        )
        logger.info(
            "push retry outbox_id=%s notification_id=%s attempt=%s error_class=%s",
            row.id,
            item.notification_id,
            row.retry_count,
            error_class,
        )


def _apply_tickets(
    db: Session,
    candidates: list[_SendCandidate],
    tickets: list[ExpoTicket],
    *,
    now: datetime,
    jitter_seconds: float,
) -> str | None:
    rows = {row.id: row for row in _load_claimed_rows(db, [item.outbox_id for item in candidates])}
    devices = {}
    cooldown = None
    for item, ticket in zip(candidates, tickets):
        row = rows.get(item.outbox_id)
        if row is None or row.status != NotificationOutbox.STATUS_QUEUED:
            continue
        outcome, error_class = _ticket_outcome(ticket)
        if outcome == "sent":
            mark_sent(row, now=now, ticket_id=ticket.ticket_id)
            logger.info(
                "push sent outbox_id=%s notification_id=%s user_id=%s "
                "push_device_id=%s type=%s ticket_id=%s",
                row.id,
                item.notification_id,
                item.user_id,
                item.push_device_id,
                item.notification_type,
                ticket.ticket_id,
            )
            continue
        if outcome == "dead_token":
            device = row.push_device or devices.get(item.push_device_id)
            if device is None:
                device = db.query(PushDevice).filter(PushDevice.id == item.push_device_id).first()
            if device is not None:
                deactivate_unregistered_device(device, now=now)
            mark_terminal(
                row,
                now=now,
                error_class=error_class or "device_not_registered",
                status=NotificationOutbox.STATUS_DEAD_TOKEN,
            )
            logger.info(
                "push dead_token outbox_id=%s notification_id=%s push_device_id=%s",
                row.id,
                item.notification_id,
                item.push_device_id,
            )
            continue
        if outcome == "credentials":
            cooldown = ERR_INVALID_CREDENTIALS
            schedule_retry(
                row,
                now=now,
                error_class=ERR_INVALID_CREDENTIALS,
                jitter_seconds=jitter_seconds,
                created_at=item.created_at,
            )
            continue
        if outcome == "retry":
            schedule_retry(
                row,
                now=now,
                error_class=error_class or "rate_exceeded",
                jitter_seconds=jitter_seconds,
                created_at=item.created_at,
            )
            continue
        mark_terminal(row, now=now, error_class=error_class or "provider_error")
        logger.info(
            "push failed outbox_id=%s notification_id=%s error_class=%s",
            row.id,
            item.notification_id,
            error_class,
        )
    return cooldown


def _persist_send_result(
    session_factory,
    candidates: list[_SendCandidate],
    result: ExpoSendBatchResult,
    *,
    now: datetime,
    jitter_seconds: float,
) -> None:
    db = _open_session(session_factory)
    try:
        if result.kind == KIND_TICKETS and len(result.tickets) == len(candidates):
            cooldown = _apply_tickets(
                db, candidates, result.tickets, now=now, jitter_seconds=jitter_seconds
            )
            db.commit()
            if cooldown:
                trip_provider_cooldown(now)
            return
        error_class = result.error_class or "provider_error"
        if result.kind == KIND_CREDENTIALS or error_class == ERR_INVALID_CREDENTIALS:
            _apply_batch_failure(
                db, candidates, now=now, error_class=ERR_INVALID_CREDENTIALS, jitter_seconds=jitter_seconds
            )
            db.commit()
            trip_provider_cooldown(now)
            return
        if result.kind == KIND_PERMANENT:
            rows = {
                row.id: row
                for row in _load_claimed_rows(db, [item.outbox_id for item in candidates])
            }
            for item in candidates:
                row = rows.get(item.outbox_id)
                if row is None or row.status != NotificationOutbox.STATUS_QUEUED:
                    continue
                mark_terminal(row, now=now, error_class=error_class)
            db.commit()
            return
        _apply_batch_failure(
            db,
            candidates,
            now=now,
            error_class=error_class,
            jitter_seconds=jitter_seconds,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("push result persist failed")
    finally:
        _close_quietly(db)


def _release_candidates(session_factory, candidates: list[_SendCandidate], *, now: datetime) -> None:
    db = _open_session(session_factory)
    try:
        rows = _load_claimed_rows(db, [item.outbox_id for item in candidates])
        for row in rows:
            if row.status == NotificationOutbox.STATUS_QUEUED:
                release_to_queued(row, now=now)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("push release failed")
    finally:
        _close_quietly(db)


def _pre_http_filter(
    session_factory,
    candidates: list[_SendCandidate],
    *,
    now: datetime,
) -> list[_SendCandidate]:
    if not get_settings().push_notifications_enabled:
        _release_candidates(session_factory, candidates, now=now)
        return []
    allowed: list[_SendCandidate] = []
    denied: list[_SendCandidate] = []
    for item in candidates:
        if get_settings().push_user_allowed(item.user_id):
            allowed.append(item)
        else:
            denied.append(item)
    if denied:
        db = _open_session(session_factory)
        try:
            rows = {row.id: row for row in _load_claimed_rows(db, [item.outbox_id for item in denied])}
            for item in denied:
                row = rows.get(item.outbox_id)
                if row is not None:
                    mark_terminal(row, now=now, error_class=ERR_NOT_ALLOWED)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("push allowlist persist failed")
        finally:
            _close_quietly(db)
    return allowed


async def run_push_delivery_once(
    *,
    session_factory=None,
    sender: ExpoPushSender | None = None,
    now: datetime | None = None,
    jitter_seconds: JitterFn | None = None,
) -> dict:
    """One claim → validate → HTTP → persist cycle. Caller owns sender lifecycle."""
    current = as_naive_utc(now) or utc_now()
    jitter_fn = jitter_seconds or (lambda: 0.0)
    if not get_settings().push_notifications_enabled:
        return {"claimed": 0, "sent": 0}
    if provider_cooling_down(current):
        logger.info("push worker skip cooldown")
        return {"claimed": 0, "cooldown": True}

    ids = await _claim_ids(session_factory, now=current)
    if not ids:
        return {"claimed": 0, "sent": 0}

    logger.info("push claimed batch_size=%s", len(ids))
    candidates = _persist_decisions(session_factory, ids=ids, now=current)
    candidates = _pre_http_filter(session_factory, candidates, now=current)
    if not candidates:
        return {"claimed": len(ids), "sent": 0}

    active_sender = sender or ExpoPushSender()
    owns_sender = sender is None
    try:
        result = await active_sender.send_messages([item.message for item in candidates])
    except Exception:
        logger.exception("push send failed unexpectedly")
        result = ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="provider_error")
    finally:
        if owns_sender:
            await active_sender.aclose()

    _persist_send_result(
        session_factory,
        candidates,
        result,
        now=current,
        jitter_seconds=float(jitter_fn()),
    )
    sent = 0
    if result.kind == KIND_TICKETS:
        sent = sum(1 for ticket in result.tickets if ticket.status == "ok")
    return {"claimed": len(ids), "sent": sent, "http": len(candidates)}


async def run_push_worker_task(
    *,
    session_factory=None,
    sender: ExpoPushSender | None = None,
    interval_seconds: int = PUSH_WORKER_INTERVAL_SECONDS,
) -> None:
    """Background loop. Sleeps first so TestClient startup cannot race a send."""
    active_sender = sender or ExpoPushSender()
    owns_sender = sender is None
    try:
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                if get_settings().push_notifications_enabled:
                    await run_push_delivery_once(
                        session_factory=session_factory,
                        sender=active_sender,
                    )
            except asyncio.CancelledError:
                logger.info("push worker stopped")
                raise
            except Exception:
                logger.exception("push worker loop error")
    finally:
        if owns_sender:
            await active_sender.aclose()


def worker_session_factory_from_bind(bind) -> sessionmaker:
    return sessionmaker(bind=bind, autocommit=False, autoflush=False)

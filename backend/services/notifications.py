"""In-app notification persistence. No push sender and no outbox fan-out."""

from __future__ import annotations

import base64
import re
from datetime import datetime
from typing import Any, Mapping, Optional

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Notification

ALLOWED_NOTIFICATION_TYPES = frozenset(
    {
        "booking_created",
        "booking_cancelled",
        "booking_rescheduled",
    }
)
_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
_BLOCKED_DATA_KEYS = frozenset(
    {
        "phone",
        "client_phone",
        "notes",
        "token",
        "push_token",
        "hashed_password",
    }
)
DEFAULT_LIST_LIMIT = 20
MAX_LIST_LIMIT = 100


def sanitize_notification_data(data: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if data is None:
        return None
    cleaned = {
        str(key): value
        for key, value in data.items()
        if str(key) not in _BLOCKED_DATA_KEYS
    }
    return cleaned or None


def create_notification(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    dedup_key: str | None = None,
    data: Mapping[str, Any] | None = None,
) -> tuple[Notification, bool]:
    """Insert a notification without committing.

    Returns (row, created). Duplicate ``dedup_key`` for the same user returns
    the existing row and ``created=False``.
    """
    kind = (type or "").strip()
    if kind not in ALLOWED_NOTIFICATION_TYPES and not _TYPE_RE.match(kind):
        raise ValueError("invalid notification type")
    title_text = (title or "").strip()
    body_text = (body or "").strip()
    if not title_text or not body_text:
        raise ValueError("title and body are required")
    if len(title_text) > 200 or len(body_text) > 500:
        raise ValueError("title or body exceeds max length")

    key = (dedup_key or "").strip() or None
    if key:
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.dedup_key == key,
            )
            .first()
        )
        if existing is not None:
            return existing, False

    row = Notification(
        user_id=user_id,
        type=kind,
        title=title_text,
        body=body_text,
        entity_type=(entity_type or "").strip() or None,
        entity_id=entity_id,
        dedup_key=key,
        data_json=sanitize_notification_data(data),
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        db.expunge(row)
        if not key:
            raise
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.dedup_key == key,
            )
            .first()
        )
        if existing is None:
            raise
        return existing, False
    return row, True


def encode_notification_cursor(created_at: datetime, notification_id: int) -> str:
    raw = f"{created_at.isoformat()}|{notification_id}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_notification_cursor(cursor: str) -> tuple[datetime, int]:
    padded = (cursor or "").strip() + "=" * ((4 - len((cursor or "").strip()) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        stamp, raw_id = decoded.rsplit("|", 1)
        created_at = datetime.fromisoformat(stamp)
        return created_at, int(raw_id)
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid notification cursor",
        ) from exc


def list_notifications(
    db: Session,
    *,
    user_id: int,
    limit: int = DEFAULT_LIST_LIMIT,
    cursor: str | None = None,
    unread_only: bool = False,
) -> tuple[list[Notification], Optional[str], int]:
    page_size = min(max(int(limit), 1), MAX_LIST_LIMIT)
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    if cursor:
        created_at, row_id = decode_notification_cursor(cursor)
        query = query.filter(
            (Notification.created_at < created_at)
            | (
                (Notification.created_at == created_at)
                & (Notification.id < row_id)
            )
        )
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(page_size + 1)
        .all()
    )
    next_cursor = None
    if len(rows) > page_size:
        last = rows[page_size - 1]
        next_cursor = encode_notification_cursor(last.created_at, last.id)
        rows = rows[:page_size]
    return rows, next_cursor, unread_count_for_user(db, user_id)


def unread_count_for_user(db: Session, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .count()
    )


def mark_notification_read(
    db: Session,
    *,
    user_id: int,
    notification_id: int,
) -> Notification:
    row = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    if row.read_at is None:
        row.read_at = datetime.utcnow()
        db.flush()
    return row


def mark_all_notifications_read(db: Session, *, user_id: int) -> int:
    now = datetime.utcnow()
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    return int(updated or 0)

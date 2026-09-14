"""Push device registration: upsert, reassignment, logout deactivation.

Never logs the raw push token.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models import PushDevice, User

INVALID_REASON_LOGOUT = "logout"
INVALID_REASON_REPLACED = "replaced"


def normalize_installation_id(value: str) -> str:
    try:
        return str(UUID(str(value).strip()))
    except (ValueError, AttributeError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="installation_id must be a UUID",
        ) from exc


def _now() -> datetime:
    return datetime.utcnow()


def _release_token_from_other_installs(
    db: Session,
    *,
    token: str,
    keep_installation_id: str,
) -> None:
    others = (
        db.query(PushDevice)
        .filter(
            PushDevice.token == token,
            PushDevice.installation_id != keep_installation_id,
        )
        .all()
    )
    if not others:
        return
    now = _now()
    for row in others:
        row.is_active = False
        row.invalidated_at = now
        row.invalid_reason = INVALID_REASON_REPLACED
        row.token = f"replaced:{row.id}"
        row.updated_at = now
    db.flush()


def upsert_push_device(
    db: Session,
    *,
    user: User,
    installation_id: str,
    token: str,
    provider: str,
    platform: str,
    app_version: str | None = None,
    build_number: str | None = None,
    locale: str | None = None,
    timezone: str | None = None,
) -> PushDevice:
    installation_id = normalize_installation_id(installation_id)
    token = (token or "").strip()
    now = _now()
    _release_token_from_other_installs(
        db, token=token, keep_installation_id=installation_id
    )

    device = (
        db.query(PushDevice)
        .filter(PushDevice.installation_id == installation_id)
        .first()
    )
    if device is None:
        device = PushDevice(
            user_id=user.id,
            installation_id=installation_id,
            token=token,
            provider=provider,
            platform=platform,
            is_active=True,
            app_version=app_version,
            build_number=build_number,
            locale=locale,
            timezone=timezone,
            created_at=now,
            updated_at=now,
            last_seen_at=now,
            invalidated_at=None,
            invalid_reason=None,
        )
        db.add(device)
        db.flush()
        return device

    device.user_id = user.id
    device.token = token
    device.provider = provider
    device.platform = platform
    device.is_active = True
    device.app_version = app_version
    device.build_number = build_number
    device.locale = locale
    device.timezone = timezone
    device.updated_at = now
    device.last_seen_at = now
    device.invalidated_at = None
    device.invalid_reason = None
    db.flush()
    return device


def deactivate_own_installation(
    db: Session,
    *,
    user: User,
    installation_id: str,
) -> None:
    """Idempotent logout. Unknown or foreign installations are silent 204."""
    try:
        installation_id = str(UUID(str(installation_id).strip()))
    except (ValueError, AttributeError, TypeError):
        return
    device = (
        db.query(PushDevice)
        .filter(
            PushDevice.installation_id == installation_id,
            PushDevice.user_id == user.id,
            PushDevice.is_active.is_(True),
        )
        .first()
    )
    if device is None:
        return
    now = _now()
    device.is_active = False
    device.invalidated_at = now
    device.invalid_reason = INVALID_REASON_LOGOUT
    device.updated_at = now
    db.flush()

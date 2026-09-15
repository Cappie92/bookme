"""Notification → active PushDevice fan-out. No Expo HTTP, worker, or receipts."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import Notification, NotificationOutbox, PushDevice
from settings import get_settings


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

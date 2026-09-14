"""In-app notifications and push device registration. No Expo sender."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from auth import get_current_active_user
from database import get_db
from models import Notification, User
from schemas_notifications import (
    NotificationListResponse,
    NotificationReadAllResponse,
    NotificationResponse,
    PushDeviceRegisterRequest,
    PushDeviceResponse,
    UnreadCountResponse,
)
from services.notifications import (
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    unread_count_for_user,
)
from services.push_devices import deactivate_own_installation, upsert_push_device
from settings import get_settings

push_router = APIRouter(prefix="/api/push", tags=["push"])
notifications_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _to_notification_response(row: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=row.id,
        type=row.type,
        title=row.title,
        body=row.body,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        data=row.data_json,
        read_at=row.read_at,
        created_at=row.created_at,
    )


@push_router.put("/devices", response_model=PushDeviceResponse)
def register_push_device(
    body: PushDeviceRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not get_settings().push_registration_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push device registration is disabled",
            headers={"X-Error-Code": "PUSH_REGISTRATION_DISABLED"},
        )
    device = upsert_push_device(
        db,
        user=current_user,
        installation_id=body.installation_id,
        token=body.token,
        provider=body.provider,
        platform=body.platform,
        app_version=body.app_version,
        build_number=body.build_number,
        locale=body.locale,
        timezone=body.timezone,
    )
    db.commit()
    db.refresh(device)
    return PushDeviceResponse(
        id=device.id,
        installation_id=device.installation_id,
        is_active=bool(device.is_active),
    )


@push_router.delete("/devices/{installation_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_push_device(
    installation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    deactivate_own_installation(
        db, user=current_user, installation_id=installation_id
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notifications_router.get("", response_model=NotificationListResponse)
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    cursor: Optional[str] = Query(None),
    unread_only: bool = Query(False),
):
    rows, next_cursor, unread = list_notifications(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
        unread_only=unread_only,
    )
    return NotificationListResponse(
        items=[_to_notification_response(row) for row in rows],
        next_cursor=next_cursor,
        unread_count=unread,
    )


@notifications_router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return UnreadCountResponse(unread_count=unread_count_for_user(db, current_user.id))


@notifications_router.post("/read-all", response_model=NotificationReadAllResponse)
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    updated = mark_all_notifications_read(db, user_id=current_user.id)
    db.commit()
    return NotificationReadAllResponse(updated_count=updated)


@notifications_router.post("/{notification_id}/read", response_model=NotificationResponse)
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    row = mark_notification_read(
        db, user_id=current_user.id, notification_id=notification_id
    )
    db.commit()
    db.refresh(row)
    return _to_notification_response(row)

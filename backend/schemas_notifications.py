from __future__ import annotations

import re
from datetime import datetime
from typing import Any, List, Optional, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:\[\]-]{16,512}$")
_REPLACED_SENTINEL_RE = re.compile(r"^replaced:\d+$")


class PushDeviceRegisterRequest(BaseModel):
    installation_id: str
    token: str = Field(..., min_length=16, max_length=512)
    provider: Literal["expo"] = "expo"
    platform: Literal["ios", "android"]
    app_version: Optional[str] = Field(None, max_length=32)
    build_number: Optional[str] = Field(None, max_length=32)
    locale: Optional[str] = Field(None, max_length=32)
    timezone: Optional[str] = Field(None, max_length=64)

    @field_validator("installation_id")
    @classmethod
    def installation_id_is_uuid(cls, value: str) -> str:
        try:
            return str(UUID(str(value).strip()))
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError("installation_id must be a UUID") from exc

    @field_validator("token")
    @classmethod
    def token_looks_like_push_token(cls, value: str) -> str:
        token = (value or "").strip()
        if _REPLACED_SENTINEL_RE.match(token) or not _TOKEN_RE.match(token):
            raise ValueError("token is not a valid push token")
        return token

    @field_validator("app_version", "build_number", "locale", "timezone", mode="before")
    @classmethod
    def empty_optional_to_none(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value


class PushDeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    installation_id: str
    is_active: bool


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    data: Optional[dict] = None
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    next_cursor: Optional[str] = None
    unread_count: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class NotificationReadAllResponse(BaseModel):
    updated_count: int

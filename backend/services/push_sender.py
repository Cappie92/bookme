"""Expo Push API send and receipt polling. Never logs tokens or notification text."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from models import Notification

logger = logging.getLogger("dedato.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
EXPO_HTTP_TIMEOUT_SECONDS = 15.0
EXPO_RECEIPT_BATCH_SIZE = 100

_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:\[\]-]{16,512}$")
_REPLACED_SENTINEL_RE = re.compile(r"^replaced:\d+$")

KIND_TICKETS = "tickets"
KIND_RECEIPTS = "receipts"
KIND_TRANSIENT = "transient"
KIND_PERMANENT = "permanent"
KIND_CREDENTIALS = "credentials"


@dataclass
class ExpoTicket:
    status: str
    ticket_id: str | None = None
    error_code: str | None = None


@dataclass
class ExpoSendBatchResult:
    kind: str
    error_class: str | None = None
    tickets: list[ExpoTicket] = field(default_factory=list)


@dataclass
class ExpoReceipt:
    ticket_id: str
    status: str
    error_code: str | None = None


@dataclass
class ExpoReceiptsResult:
    kind: str
    error_class: str | None = None
    receipts: dict[str, ExpoReceipt] = field(default_factory=dict)


def is_sendable_expo_token(token: str | None) -> bool:
    value = (token or "").strip()
    if not value or _REPLACED_SENTINEL_RE.match(value):
        return False
    if not _TOKEN_RE.match(value):
        return False
    return "PushToken[" in value


def build_expo_message(*, notification: Notification, token: str) -> dict[str, Any]:
    return {
        "to": token,
        "title": notification.title,
        "body": notification.body,
        "channelId": "bookings",
        "data": {
            "type": notification.type,
            "entity_type": notification.entity_type,
            "entity_id": notification.entity_id,
            "notification_id": notification.id,
        },
    }


def classify_ticket(ticket: dict[str, Any] | None) -> ExpoTicket:
    payload = ticket if isinstance(ticket, dict) else {}
    status = str(payload.get("status") or "").strip().lower()
    if status == "ok":
        ticket_id = payload.get("id")
        return ExpoTicket(status="ok", ticket_id=str(ticket_id) if ticket_id else None)
    details = payload.get("details") if isinstance(payload.get("details"), dict) else {}
    error_code = str(details.get("error") or "").strip() or None
    return ExpoTicket(status="error", error_code=error_code)


def classify_http_status(status_code: int) -> ExpoSendBatchResult:
    if status_code == 429 or status_code >= 500:
        error_class = "rate_exceeded" if status_code == 429 else "http_5xx"
        return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class=error_class)
    if status_code in (401, 403):
        return ExpoSendBatchResult(kind=KIND_CREDENTIALS, error_class="invalid_credentials")
    if 400 <= status_code < 500:
        return ExpoSendBatchResult(kind=KIND_PERMANENT, error_class="http_4xx")
    return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="provider_error")


class ExpoPushSender:
    """Reusable async client for Expo send and receipts. One instance per worker."""

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=EXPO_HTTP_TIMEOUT_SECONDS)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def send_messages(self, messages: list[dict[str, Any]]) -> ExpoSendBatchResult:
        if not messages:
            return ExpoSendBatchResult(kind=KIND_TICKETS, tickets=[])
        logger.info("expo send batch_size=%s", len(messages))
        try:
            response = await self._client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
        except httpx.TimeoutException:
            return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="timeout")
        except httpx.RequestError:
            return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="network")
        return parse_expo_send_response(response, expected=len(messages))

    async def get_receipts(self, ticket_ids: list[str]) -> ExpoReceiptsResult:
        ids = [str(ticket_id) for ticket_id in ticket_ids if ticket_id]
        if not ids:
            return ExpoReceiptsResult(kind=KIND_RECEIPTS, receipts={})
        merged: dict[str, ExpoReceipt] = {}
        for offset in range(0, len(ids), EXPO_RECEIPT_BATCH_SIZE):
            chunk = ids[offset : offset + EXPO_RECEIPT_BATCH_SIZE]
            result = await self._get_receipts_chunk(chunk)
            if result.kind != KIND_RECEIPTS:
                return result
            merged.update(result.receipts)
        return ExpoReceiptsResult(kind=KIND_RECEIPTS, receipts=merged)

    async def _get_receipts_chunk(self, ids: list[str]) -> ExpoReceiptsResult:
        logger.info("expo receipts batch_size=%s", len(ids))
        try:
            response = await self._client.post(
                EXPO_RECEIPTS_URL,
                json={"ids": ids},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
        except httpx.TimeoutException:
            return ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="timeout")
        except httpx.RequestError:
            return ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="network")
        return parse_expo_receipts_response(response, expected_ids=ids)


def parse_expo_send_response(response: httpx.Response, *, expected: int) -> ExpoSendBatchResult:
    if response.status_code != 200:
        return classify_http_status(response.status_code)
    try:
        payload = response.json()
    except ValueError:
        return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    if not isinstance(payload, dict):
        return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    data = payload.get("data")
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or len(data) != expected:
        return ExpoSendBatchResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    tickets = [classify_ticket(item) for item in data]
    return ExpoSendBatchResult(kind=KIND_TICKETS, tickets=tickets)


def parse_expo_receipts_response(
    response: httpx.Response, *, expected_ids: list[str]
) -> ExpoReceiptsResult:
    if response.status_code != 200:
        classified = classify_http_status(response.status_code)
        return ExpoReceiptsResult(kind=classified.kind, error_class=classified.error_class)
    try:
        payload = response.json()
    except ValueError:
        return ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    if not isinstance(payload, dict):
        return ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    data = payload.get("data")
    if not isinstance(data, dict):
        return ExpoReceiptsResult(kind=KIND_TRANSIENT, error_class="malformed_response")
    allowed = {str(ticket_id) for ticket_id in expected_ids}
    receipts: dict[str, ExpoReceipt] = {}
    for ticket_id, raw in data.items():
        key = str(ticket_id)
        if allowed and key not in allowed:
            continue
        if not isinstance(raw, dict):
            continue
        status = str(raw.get("status") or "").strip().lower()
        if status not in {"ok", "error"}:
            continue
        details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
        error_code = str(details.get("error") or "").strip() or None
        receipts[key] = ExpoReceipt(ticket_id=key, status=status, error_code=error_code)
    return ExpoReceiptsResult(kind=KIND_RECEIPTS, receipts=receipts)

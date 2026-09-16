"""Stage 5B/5C Expo sender: payload, tickets, receipts, HTTP classification."""

from __future__ import annotations

from datetime import datetime

import httpx
import pytest

from models import Notification
from services.push_outbox import ERR_HTTP_4XX, ERR_INVALID_CREDENTIALS, ERR_RATE_EXCEEDED
from services.push_sender import (
    EXPO_PUSH_URL,
    EXPO_RECEIPTS_URL,
    KIND_CREDENTIALS,
    KIND_PERMANENT,
    KIND_RECEIPTS,
    KIND_TICKETS,
    KIND_TRANSIENT,
    ExpoPushSender,
    classify_http_status,
    classify_ticket,
    is_sendable_expo_token,
    parse_expo_receipts_response,
    parse_expo_send_response,
    build_expo_message,
)


class _FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class _FakeClient:
    def __init__(self, response=None, exc=None):
        self.response = response
        self.exc = exc
        self.calls = []

    async def post(self, url, json=None, headers=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        if self.exc:
            raise self.exc
        return self.response

    async def aclose(self):
        pass


def test_is_sendable_expo_token_variants():
    assert is_sendable_expo_token("ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]")
    assert is_sendable_expo_token("ExpoPushToken[bbbbbbbbbbbbbbbbbbbb]")
    assert not is_sendable_expo_token("")
    assert not is_sendable_expo_token(None)
    assert not is_sendable_expo_token("replaced:1")
    assert not is_sendable_expo_token("replaced:99")
    assert not is_sendable_expo_token("not-an-expo-token-value")
    assert not is_sendable_expo_token("gmail@example.com-tokenx")


def test_build_expo_message_allowlisted_fields_only():
    note = Notification(
        id=456,
        user_id=1,
        type="booking_created",
        title="Новая запись",
        body="Стрижка · 1 января · 12:00",
        entity_type="booking",
        entity_id=123,
        data_json={"service_name": "Стрижка", "phone": "should-not-leak"},
        created_at=datetime.utcnow(),
    )
    message = build_expo_message(notification=note, token="ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]")
    assert message["to"] == "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]"
    assert message["title"] == "Новая запись"
    assert message["body"] == "Стрижка · 1 января · 12:00"
    assert message["channelId"] == "bookings"
    assert message["data"] == {
        "type": "booking_created",
        "entity_type": "booking",
        "entity_id": 123,
        "notification_id": 456,
    }
    assert "phone" not in message
    assert "data_json" not in message
    assert "service_name" not in message["data"]


def test_classify_ticket_ok_and_errors():
    ok = classify_ticket({"status": "ok", "id": "ticket-1"})
    assert ok.status == "ok" and ok.ticket_id == "ticket-1"
    unreg = classify_ticket(
        {"status": "error", "message": "x", "details": {"error": "DeviceNotRegistered"}}
    )
    assert unreg.status == "error" and unreg.error_code == "DeviceNotRegistered"
    rate = classify_ticket({"status": "error", "details": {"error": "MessageRateExceeded"}})
    assert rate.error_code == "MessageRateExceeded"


def test_classify_http_status():
    assert classify_http_status(429).kind == KIND_TRANSIENT
    assert classify_http_status(429).error_class == ERR_RATE_EXCEEDED
    assert classify_http_status(500).kind == KIND_TRANSIENT
    assert classify_http_status(503).error_class == "http_5xx"
    assert classify_http_status(401).kind == KIND_CREDENTIALS
    assert classify_http_status(403).error_class == ERR_INVALID_CREDENTIALS
    assert classify_http_status(400).kind == KIND_PERMANENT
    assert classify_http_status(400).error_class == ERR_HTTP_4XX


def test_parse_expo_send_response_order_and_malformed():
    ok = parse_expo_send_response(
        _FakeResponse(
            200,
            {
                "data": [
                    {"status": "ok", "id": "a"},
                    {"status": "error", "details": {"error": "MessageTooBig"}},
                ]
            },
        ),
        expected=2,
    )
    assert ok.kind == KIND_TICKETS
    assert [t.status for t in ok.tickets] == ["ok", "error"]
    assert ok.tickets[0].ticket_id == "a"
    mismatch = parse_expo_send_response(
        _FakeResponse(200, {"data": [{"status": "ok", "id": "only-one"}]}),
        expected=2,
    )
    assert mismatch.kind == KIND_TRANSIENT
    assert mismatch.error_class == "malformed_response"
    missing = parse_expo_send_response(_FakeResponse(200, {"errors": []}), expected=1)
    assert missing.kind == KIND_TRANSIENT
    single = parse_expo_send_response(
        _FakeResponse(200, {"data": {"status": "ok", "id": "one"}}),
        expected=1,
    )
    assert single.kind == KIND_TICKETS and single.tickets[0].ticket_id == "one"


@pytest.mark.asyncio
async def test_sender_posts_array_to_expo_and_maps_tickets():
    client = _FakeClient(
        response=_FakeResponse(
            200,
            {"data": [{"status": "ok", "id": "t-1"}, {"status": "ok", "id": "t-2"}]},
        )
    )
    sender = ExpoPushSender(client=client)
    result = await sender.send_messages(
        [
            {"to": "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]", "title": "A", "body": "B"},
            {"to": "ExpoPushToken[bbbbbbbbbbbbbbbbbbbb]", "title": "C", "body": "D"},
        ]
    )
    assert result.kind == KIND_TICKETS
    assert [t.ticket_id for t in result.tickets] == ["t-1", "t-2"]
    assert client.calls[0]["url"] == EXPO_PUSH_URL
    assert isinstance(client.calls[0]["json"], list)
    assert len(client.calls[0]["json"]) == 2


@pytest.mark.asyncio
async def test_sender_timeout_and_network_are_transient():
    timeout_sender = ExpoPushSender(client=_FakeClient(exc=httpx.TimeoutException("slow")))
    timeout = await timeout_sender.send_messages([{"to": "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]"}])
    assert timeout.kind == KIND_TRANSIENT and timeout.error_class == "timeout"
    network_sender = ExpoPushSender(client=_FakeClient(exc=httpx.ConnectError("down")))
    network = await network_sender.send_messages([{"to": "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]"}])
    assert network.kind == KIND_TRANSIENT and network.error_class == "network"


@pytest.mark.asyncio
async def test_sender_http_429_and_500_and_400():
    too_many = ExpoPushSender(client=_FakeClient(response=_FakeResponse(429, {})))
    assert (await too_many.send_messages([{"to": "x"}])).kind == KIND_TRANSIENT
    boom = ExpoPushSender(client=_FakeClient(response=_FakeResponse(500, {})))
    assert (await boom.send_messages([{"to": "x"}])).kind == KIND_TRANSIENT
    bad = ExpoPushSender(client=_FakeClient(response=_FakeResponse(400, {})))
    assert (await bad.send_messages([{"to": "x"}])).kind == KIND_PERMANENT


def test_parse_expo_receipts_maps_by_ticket_id_not_order():
    parsed = parse_expo_receipts_response(
        _FakeResponse(
            200,
            {
                "data": {
                    "t-b": {"status": "error", "details": {"error": "MessageTooBig"}},
                    "t-a": {"status": "ok"},
                }
            },
        ),
        expected_ids=["t-a", "t-b"],
    )
    assert parsed.kind == KIND_RECEIPTS
    assert parsed.receipts["t-a"].status == "ok"
    assert parsed.receipts["t-b"].error_code == "MessageTooBig"


def test_parse_expo_receipts_malformed_is_transient():
    invalid_json = parse_expo_receipts_response(_FakeResponse(200, payload=None), expected_ids=["t"])
    assert invalid_json.kind == KIND_TRANSIENT
    assert invalid_json.error_class == "malformed_response"
    missing = parse_expo_receipts_response(_FakeResponse(200, {"errors": []}), expected_ids=["t"])
    assert missing.kind == KIND_TRANSIENT
    wrong_type = parse_expo_receipts_response(
        _FakeResponse(200, {"data": [{"status": "ok"}]}),
        expected_ids=["t"],
    )
    assert wrong_type.kind == KIND_TRANSIENT
    skipped = parse_expo_receipts_response(
        _FakeResponse(200, {"data": {"t": "not-an-object", "u": {"status": "ok"}}}),
        expected_ids=["t", "u"],
    )
    assert skipped.kind == KIND_RECEIPTS
    assert "t" not in skipped.receipts
    assert skipped.receipts["u"].status == "ok"


@pytest.mark.asyncio
async def test_get_receipts_posts_ids_object_and_handles_network():
    client = _FakeClient(response=_FakeResponse(200, {"data": {"ticket-1": {"status": "ok"}}}))
    sender = ExpoPushSender(client=client)
    result = await sender.get_receipts(["ticket-1", "ticket-1-ignored-empty", ""])
    assert result.kind == KIND_RECEIPTS
    assert result.receipts["ticket-1"].status == "ok"
    assert client.calls[0]["url"] == EXPO_RECEIPTS_URL
    assert client.calls[0]["json"] == {"ids": ["ticket-1", "ticket-1-ignored-empty"]}

    timeout = await ExpoPushSender(client=_FakeClient(exc=httpx.TimeoutException("slow"))).get_receipts(
        ["t"]
    )
    assert timeout.kind == KIND_TRANSIENT and timeout.error_class == "timeout"
    network = await ExpoPushSender(client=_FakeClient(exc=httpx.ConnectError("down"))).get_receipts(["t"])
    assert network.kind == KIND_TRANSIENT and network.error_class == "network"
    too_many = await ExpoPushSender(client=_FakeClient(response=_FakeResponse(429, {}))).get_receipts(
        ["t"]
    )
    assert too_many.kind == KIND_TRANSIENT
    boom = await ExpoPushSender(client=_FakeClient(response=_FakeResponse(503, {}))).get_receipts(["t"])
    assert boom.kind == KIND_TRANSIENT
    forbidden = await ExpoPushSender(client=_FakeClient(response=_FakeResponse(401, {}))).get_receipts(
        ["t"]
    )
    assert forbidden.kind == KIND_CREDENTIALS

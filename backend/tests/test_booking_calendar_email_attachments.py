from __future__ import annotations

import base64
from datetime import datetime
from types import SimpleNamespace

import pytest

from services.email.templates import build_booking_calendar_email_bodies
from services.email.unisender_provider import UnisenderTransactionalProvider


def _dummy_booking() -> SimpleNamespace:
    # Минимальная структура, которую ожидают templates.py + build_booking_ics (без БД).
    svc = SimpleNamespace(name="Тестовая услуга", price=1000)
    master_user = SimpleNamespace(full_name="Тестовый мастер")
    master = SimpleNamespace(user=master_user, timezone="Europe/Moscow")
    booking = SimpleNamespace(
        id=123,
        public_reference="ABC123",
        start_time=datetime(2026, 5, 6, 9, 0, 0),
        end_time=datetime(2026, 5, 6, 9, 30, 0),
        status="created",
        service=svc,
        master=master,
        indie_master=None,
        salon=None,
        branch=None,
        client=None,
    )
    return booking


def test_build_booking_calendar_email_bodies_builds_valid_base64_ics_and_ascii_filename():
    booking = _dummy_booking()
    subject, html_body, text_body, fn, attachments = build_booking_calendar_email_bodies(
        booking,
        "Europe/Moscow",
        alarm_minutes=60,
    )

    assert isinstance(subject, str) and subject
    assert isinstance(html_body, str) and html_body
    assert isinstance(text_body, str) and text_body

    assert fn.endswith(".ics")
    # Диагностическая защита: filename должен быть ASCII-safe (без public_reference).
    fn.encode("ascii")

    assert isinstance(attachments, list) and len(attachments) == 1
    att = attachments[0]
    assert att["type"] == "text/calendar"
    assert att["name"] == fn
    raw = base64.standard_b64decode(att["content"])
    txt = raw.decode("utf-8", errors="ignore")
    for marker in (
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "SUMMARY",
        "DTSTART",
        "DTEND",
        "END:VEVENT",
        "END:VCALENDAR",
    ):
        assert marker in txt


def test_unisender_attachment_file_tuples_builds_multipart_field_and_content_type():
    provider = UnisenderTransactionalProvider(
        api_key="k",
        api_base_url="https://api.unisender.com/ru/api",
        from_email="from@example.com",
        from_name="DeDato",
        list_id="1",
        timeout_sec=1.0,
    )

    content = b"BEGIN:VCALENDAR\nEND:VCALENDAR\n"
    b64 = base64.standard_b64encode(content).decode("ascii")
    files = provider._attachment_file_tuples(
        [
            {"type": "text/calendar", "name": "test.ics", "content": b64},
        ]
    )
    assert len(files) == 1
    field_name, file_tuple = files[0]
    fn, raw, ct = file_tuple
    assert field_name == "attachments[test.ics]"
    assert fn == "test.ics"
    assert raw == content
    assert ct == "text/calendar"


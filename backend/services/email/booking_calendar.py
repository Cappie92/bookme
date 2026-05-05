"""Отправка письма с календарём по записи клиента (реальный провайдер + шаблон)."""
from __future__ import annotations

import base64
import logging
from typing import Any

from services.email.factory import get_transactional_provider
from services.email.templates import build_booking_calendar_email_bodies

logger = logging.getLogger(__name__)

_ICS_REQUIRED_MARKERS = (
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY",
    "DTSTART",
    "DTEND",
    "END:VEVENT",
    "END:VCALENDAR",
)


async def send_client_booking_calendar_email(
    booking,
    master_tz: str,
    recipient_email: str,
    alarm_minutes: int,
    *,
    extra_body_html: str | None = None,
) -> dict[str, Any]:
    """
    Собирает тело письма из шаблона и отправляет через transactional provider.
    Возвращает словарь для JSON-ответа API (ключ success совместим с фронтом).
    """
    to_email = str(recipient_email).strip()
    subject, html_body, text_body, _fn, attachments = build_booking_calendar_email_bodies(
        booking,
        master_tz,
        extra_body_html=extra_body_html,
        alarm_minutes=max(5, min(120, alarm_minutes)),
    )

    booking_id = getattr(booking, "id", None)
    public_ref = (getattr(booking, "public_reference", None) or "").strip()
    fn = None
    ics_bytes_len = None
    markers_ok = None
    if attachments and isinstance(attachments, list) and attachments and isinstance(attachments[0], dict):
        fn = (attachments[0].get("name") or "").strip() or None
        try:
            raw_bytes = base64.standard_b64decode(str(attachments[0].get("content") or ""))
            ics_bytes_len = len(raw_bytes)
            # Проверка структуры без логирования содержимого и без персональных данных.
            txt = raw_bytes.decode("utf-8", errors="ignore")
            markers_ok = all(m in txt for m in _ICS_REQUIRED_MARKERS)
        except Exception:
            markers_ok = False

    logger.info(
        "booking calendar email prepare booking_id=%s public_ref=%s filename=%s ics_bytes=%s attachments=%s markers_ok=%s",
        booking_id,
        public_ref[:40] if public_ref else "",
        fn,
        ics_bytes_len,
        len(attachments) if attachments else 0,
        markers_ok,
    )

    logger.info(
        "booking calendar email attempt booking_id=%s to=%s",
        booking_id,
        to_email,
    )

    provider = get_transactional_provider()
    result = await provider.send_message(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        attachments=attachments,
    )

    body = result.as_api_dict()
    if result.ok:
        logger.info(
            "booking calendar email ok booking_id=%s provider=%s message_id=%s",
            getattr(booking, "id", None),
            result.provider,
            result.message_id,
        )
    else:
        logger.error(
            "booking calendar email failed booking_id=%s provider=%s error=%s",
            getattr(booking, "id", None),
            result.provider,
            result.error,
        )
    return body

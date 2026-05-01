"""Отправка письма с календарём по записи клиента (реальный провайдер + шаблон)."""
from __future__ import annotations

import logging
from typing import Any

from services.email.factory import get_transactional_provider
from services.email.templates import build_booking_calendar_email_bodies

logger = logging.getLogger(__name__)


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

    logger.info(
        "booking calendar email attempt booking_id=%s to=%s",
        getattr(booking, "id", None),
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

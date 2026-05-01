"""Тексты и HTML для клиентских писем по записям (без вызова провайдера)."""
from __future__ import annotations

import base64
import html as html_lib
from typing import Optional
from urllib.parse import urljoin

import pytz

from settings import get_settings
from utils.calendar_ics import build_booking_ics


def booking_reference_label(booking) -> str:
    code = (getattr(booking, "public_reference", None) or "").strip()
    return code if code else str(getattr(booking, "id", "") or "")


def _local_bounds(booking, master_tz: str):
    tz = pytz.timezone(master_tz)
    st = booking.start_time
    if st is None:
        raise ValueError("booking.start_time required")
    if st.tzinfo is None:
        start_local = tz.localize(st)
    else:
        start_local = st.astimezone(tz)
    en = booking.end_time
    if en is None:
        raise ValueError("booking.end_time required")
    if en.tzinfo is None:
        end_local = tz.localize(en)
    else:
        end_local = en.astimezone(tz)
    return start_local, end_local


def build_booking_calendar_email_bodies(
    booking,
    master_tz: str,
    *,
    extra_body_html: Optional[str] = None,
    alarm_minutes: int = 60,
) -> tuple[str, str, str, str, list[dict]]:
    """
    Возвращает subject, html, plaintext, ics_filename, attachments (Unisender формат).
    """
    service_name = booking.service.name if booking.service else "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = booking.master.user.full_name or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = booking.indie_master.user.full_name or "-"

    start_local, end_local = _local_bounds(booking, master_tz)
    date_str = start_local.strftime("%d.%m.%Y")
    time_from = start_local.strftime("%H:%M")
    time_to = end_local.strftime("%H:%M")
    ref = booking_reference_label(booking)

    settings = get_settings()
    base = settings.FRONTEND_URL.rstrip("/") + "/"
    cabinet_url = urljoin(base, "client")

    subject = f"Запись: {service_name} — {master_name}"

    plain_lines = [
        "Здравствуйте!",
        "",
        f"Мастер: {master_name}",
        f"Услуга: {service_name}",
        f"Дата: {date_str}",
        f"Время: {time_from}–{time_to}",
        f"Номер записи: {ref}",
        "",
        f"Личный кабинет: {cabinet_url}",
        "",
        "Во вложении — файл календаря (.ics), который можно добавить в Outlook, Apple Calendar и др.",
        "",
        "— DeDato",
    ]
    text_body = "\n".join(plain_lines)

    extra_safe = extra_body_html or ""
    html_body = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; color: #1a1a1a;">
  <p>Здравствуйте!</p>
  <p>Ваша запись в <strong>DeDato</strong>:</p>
  <table style="border-collapse: collapse; margin: 12px 0;">
    <tr><td style="padding: 4px 16px 4px 0; color:#555;">Мастер</td><td><strong>{html_lib.escape(master_name)}</strong></td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color:#555;">Услуга</td><td>{html_lib.escape(service_name)}</td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color:#555;">Дата</td><td>{html_lib.escape(date_str)}</td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color:#555;">Время</td><td>{html_lib.escape(time_from)}–{html_lib.escape(time_to)}</td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color:#555;">Номер записи</td><td>{html_lib.escape(ref)}</td></tr>
  </table>
  <p><a href="{html_lib.escape(cabinet_url)}">Открыть личный кабинет</a></p>
  {extra_safe}
  <p style="margin-top:16px; font-size: 13px; color:#666;">Во вложении — файл календаря (.ics).</p>
  <p style="margin-top:24px; font-size: 13px; color:#888;">— DeDato</p>
</body></html>"""

    ics_content = build_booking_ics(booking, master_tz, alarm_minutes=alarm_minutes)
    fn = _calendar_attachment_filename(booking)
    b64 = base64.standard_b64encode(ics_content.encode("utf-8")).decode("ascii")
    attachments = [
        {
            "type": "text/calendar",
            "name": fn,
            "content": b64,
        }
    ]
    return subject, html_body, text_body, fn, attachments


def _calendar_attachment_filename(booking) -> str:
    pr = (getattr(booking, "public_reference", None) or "").strip()
    if pr:
        return f"booking-{pr}.ics"
    bid = getattr(booking, "id", None)
    if bid is not None:
        return f"booking-{bid}.ics"
    return "booking.ics"

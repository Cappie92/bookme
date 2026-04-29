"""
ICS calendar generator for DeDato bookings.
Events are in master timezone. UID/SEQUENCE for future UPDATE/CANCEL.
"""
from datetime import datetime
from typing import Optional
import pytz


def ensure_utc_aware(dt: datetime) -> datetime:
    """
    Normalize datetime to UTC-aware.
    - naive -> treat as UTC, make aware
    - aware -> convert to UTC
    """
    if dt is None:
        raise ValueError("datetime cannot be None")
    if dt.tzinfo is None:
        return pytz.UTC.localize(dt)
    return dt.astimezone(pytz.UTC)


def _booking_datetime_to_utc(dt: datetime, master_tz: str) -> datetime:
    """
    Момент на границе записи: naive в БД — локальное время мастера (см. scheduling store);
    aware — приводим к UTC.
    """
    if dt is None:
        raise ValueError("datetime cannot be None")
    tz = pytz.timezone(master_tz)
    if dt.tzinfo is None:
        return tz.localize(dt).astimezone(pytz.UTC)
    return dt.astimezone(pytz.UTC)


def _escape_ics_text(s: str) -> str:
    """Escape special chars for ICS (\\, ;, ,, newline)."""
    if not s:
        return ""
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def build_booking_ics(
    booking,
    master_tz: str,
    alarm_minutes: int = 60,
    method: str = "PUBLISH",
    sequence: int = 0,
) -> str:
    """
    Build ICS content for a booking.
    DTSTART/DTEND в UTC (суффикс Z).
    UID: booking-{id}@dedato
    """
    # Naive datetime в БД — локальное время мастера в master_tz, не UTC.
    start_utc = _booking_datetime_to_utc(booking.start_time, master_tz)
    end_utc = _booking_datetime_to_utc(booking.end_time, master_tz)

    service_name = getattr(booking.service, "name", None) or "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = getattr(booking.master.user, "full_name", None) or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = getattr(booking.indie_master.user, "full_name", None) or "-"

    summary = f"{service_name} — {master_name}"
    summary_escaped = _escape_ics_text(summary)

    from utils.yandex_maps_url import booking_calendar_location_string, yandex_maps_url_for_booking

    desc_parts = [f"Статус: {booking.status or 'created'}", f"Код записи: {booking.id}"]
    yandex_url = yandex_maps_url_for_booking(booking)
    if yandex_url:
        desc_parts.append(f"Яндекс.Карты: {yandex_url}")
    description = _escape_ics_text("\n".join(desc_parts))

    location = _escape_ics_text(booking_calendar_location_string(booking))

    dtstamp = datetime.now(pytz.UTC).strftime("%Y%m%dT%H%M%SZ")
    dtstart_str = start_utc.astimezone(pytz.UTC).strftime("%Y%m%dT%H%M%SZ")
    dtend_str = end_utc.astimezone(pytz.UTC).strftime("%Y%m%dT%H%M%SZ")

    alarm_minutes = max(5, min(120, alarm_minutes))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DeDato//Booking//RU",
        f"METHOD:{method}",
        "BEGIN:VEVENT",
        f"UID:booking-{booking.id}@dedato",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART:{dtstart_str}",
        f"DTEND:{dtend_str}",
        f"SUMMARY:{summary_escaped}",
        f"SEQUENCE:{sequence}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{description}")
    if location:
        lines.append(f"LOCATION:{location}")

    lines.extend([
        "BEGIN:VALARM",
        f"TRIGGER:-PT{alarm_minutes}M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Reminder",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ])
    return "\r\n".join(lines)

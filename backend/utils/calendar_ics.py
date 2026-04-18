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


def _format_ics_datetime(dt: datetime, tz: pytz.BaseTzInfo) -> str:
    """Format datetime for ICS DTSTART/DTEND with TZID."""
    return dt.strftime("%Y%m%dT%H%M%S")


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
    DTSTART/DTEND in master timezone (TZID format).
    UID: booking-{id}@dedato
    """
    tz = pytz.timezone(master_tz)
    start_utc = ensure_utc_aware(booking.start_time)
    end_utc = ensure_utc_aware(booking.end_time)
    start_local = start_utc.astimezone(tz)
    end_local = end_utc.astimezone(tz)

    service_name = getattr(booking.service, "name", None) or "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = getattr(booking.master.user, "full_name", None) or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = getattr(booking.indie_master.user, "full_name", None) or "-"

    summary = f"{service_name} — {master_name}"
    summary_escaped = _escape_ics_text(summary)

    desc_parts = [f"Статус: {booking.status or 'created'}", f"Код записи: {booking.id}"]
    description = _escape_ics_text("\n".join(desc_parts))

    location = ""
    if booking.branch:
        addr = getattr(booking.branch, "address", None)
        name = getattr(booking.branch, "name", None)
        if addr:
            location = addr
        elif name:
            location = name
    elif booking.master and getattr(booking.master, "address", None):
        location = booking.master.address or ""
    location = _escape_ics_text(location)

    dtstamp = datetime.now(pytz.UTC).strftime("%Y%m%dT%H%M%SZ")
    dtstart_str = _format_ics_datetime(start_local, tz)
    dtend_str = _format_ics_datetime(end_local, tz)

    alarm_minutes = max(5, min(120, alarm_minutes))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DeDato//Booking//RU",
        f"METHOD:{method}",
        "BEGIN:VEVENT",
        f"UID:booking-{booking.id}@dedato",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;TZID={master_tz}:{dtstart_str}",
        f"DTEND;TZID={master_tz}:{dtend_str}",
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

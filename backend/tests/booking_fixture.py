"""Explicit on-grid wall assignment for positive pytest booking fixtures.

Negative guard/interval tests must not call these helpers.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from models import Booking

from tests.calendar_grid_fixture_support import snap_naive_booking_interval


def grid_booking_walls(
    start: datetime,
    end: datetime,
) -> tuple[datetime, datetime]:
    return snap_naive_booking_interval(start, end)


def on_grid_interval(
    start: datetime,
    end: datetime | None = None,
    *,
    duration_minutes: int = 60,
) -> tuple[datetime, datetime]:
    """On-grid naive interval for positive pytest rows (30-min step, positive duration)."""
    if end is None:
        end = start + timedelta(minutes=duration_minutes)
    return grid_booking_walls(start, end)


def apply_grid_walls_to_booking(booking: Booking) -> Booking:
    if getattr(booking, "_preserve_off_grid_wall_times", False):
        return booking
    if (
        booking.start_utc_us is not None
        and booking.end_utc_us is not None
        and booking.time_zone
    ):
        return booking
    if booking.start_time is None or booking.end_time is None:
        return booking
    booking.start_time, booking.end_time = snap_naive_booking_interval(
        booking.start_time, booking.end_time
    )
    return booking
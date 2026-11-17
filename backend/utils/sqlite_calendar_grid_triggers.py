"""Compatibility shim — calendar grid SQLite guards live in sqlite_calendar_grid_guard."""

from utils.sqlite_calendar_grid_guard import (  # noqa: F401
    BOOKINGS_GRID_TRIGGER_NAMES,
    apply_sqlite_booking_grid_triggers,
    apply_sqlite_calendar_grid_guards,
)
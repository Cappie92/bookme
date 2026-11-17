"""Pure, persistence-free availability evaluation.

Grid generation and database reads stay in adapters.  This evaluator only
applies the shared invariant W minus (J union H union B) to canonical intervals.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Optional, Sequence, Tuple

from services.calendar_time import (
    CanonicalInstant,
    CanonicalInterval,
    ResolvedInterval,
    TimeResolution,
)
from utils.booking_occupancy import NON_OCCUPYING_BOOKING_STATUSES


class OccupancyKind(str, Enum):
    BOOKING = "booking"
    HOLD = "hold"
    BLOCK = "block"


class AvailabilityState(str, Enum):
    READY = "ready"
    UNRESOLVED = "unresolved"


@dataclass(frozen=True)
class IntervalInput:
    resolved: ResolvedInterval
    source_id: Optional[str] = None


@dataclass(frozen=True)
class OccupancyInput(IntervalInput):
    kind: OccupancyKind = OccupancyKind.BOOKING


@dataclass(frozen=True)
class AvailabilityResult:
    state: AvailabilityState
    slots: Tuple[CanonicalInterval, ...]
    unresolved_sources: Tuple[str, ...] = ()
    working_windows: Tuple[CanonicalInterval, ...] = ()
    occupied_intervals: Tuple[CanonicalInterval, ...] = ()
    grid_starts: Tuple[CanonicalInstant, ...] = ()


def booking_occupancy(
    *,
    status: object,
    interval: ResolvedInterval,
    source_id: Optional[str] = None,
) -> Optional[OccupancyInput]:
    """Adapt a Booking using the existing canonical status predicate."""

    normalized_status = getattr(status, "value", status)
    if normalized_status in NON_OCCUPYING_BOOKING_STATUSES:
        return None
    return OccupancyInput(interval, source_id, OccupancyKind.BOOKING)


def hold_occupancy(
    *,
    status: str,
    interval: ResolvedInterval,
    expires_at: Optional[CanonicalInstant],
    now: CanonicalInstant,
    source_id: Optional[str] = None,
) -> Optional[OccupancyInput]:
    """Adapt an existing hold; only pending and unexpired holds occupy time."""

    if status != "pending":
        return None
    if expires_at is None:
        interval = ResolvedInterval(
            TimeResolution.UNRESOLVED,
            None,
            "pending hold expiration is unresolved",
        )
    elif expires_at <= now:
        return None
    return OccupancyInput(interval, source_id, OccupancyKind.HOLD)


def _resolved_intervals(
    inputs: Iterable[IntervalInput],
) -> Tuple[Tuple[CanonicalInterval, ...], Tuple[str, ...]]:
    resolved = []
    unresolved = []
    for item in inputs:
        if item.resolved.is_resolved:
            resolved.append(item.resolved.interval)
        else:
            unresolved.append(item.source_id or "unknown")
    return tuple(resolved), tuple(unresolved)


def _merge_intervals(
    intervals: Sequence[CanonicalInterval],
) -> Tuple[CanonicalInterval, ...]:
    """Return the union, including adjacent schedule cells as one window."""

    merged = []
    for interval in sorted(intervals, key=lambda item: item.start):
        if not merged or merged[-1].end < interval.start:
            merged.append(interval)
            continue
        previous = merged[-1]
        merged[-1] = CanonicalInterval(
            previous.start,
            max(previous.end, interval.end),
        )
    return tuple(merged)


def evaluate_availability(
    *,
    working_windows: Sequence[IntervalInput],
    grid_starts: Sequence[CanonicalInstant],
    duration_microseconds: int,
    bookings: Sequence[OccupancyInput] = (),
    holds: Sequence[OccupancyInput] = (),
    blocks: Sequence[OccupancyInput] = (),
) -> AvailabilityResult:
    """Return duration-aware candidates without changing existing grid policy.

    Any unresolved interval fails closed.  Adapters should omit cancelled
    bookings and expired holds with ``booking_occupancy``/``hold_occupancy``.
    Calendar blocks are optional in Phase A and default to an empty collection.
    """

    if duration_microseconds <= 0:
        raise ValueError("duration must be positive")

    windows, unresolved_windows = _resolved_intervals(working_windows)
    occupied, unresolved_occupancy = _resolved_intervals((*bookings, *holds, *blocks))
    unresolved = unresolved_windows + unresolved_occupancy
    if unresolved:
        return AvailabilityResult(
            AvailabilityState.UNRESOLVED,
            (),
            unresolved,
        )

    windows = _merge_intervals(windows)
    grid = tuple(grid_starts)
    slots = []
    for start in grid:
        candidate = CanonicalInterval(
            start,
            CanonicalInstant(start.epoch_microseconds + duration_microseconds),
        )
        if not any(window.contains(candidate) for window in windows):
            continue
        if any(candidate.overlaps(interval) for interval in occupied):
            continue
        slots.append(candidate)
    return AvailabilityResult(
        AvailabilityState.READY,
        tuple(slots),
        working_windows=windows,
        occupied_intervals=occupied,
        grid_starts=grid,
    )

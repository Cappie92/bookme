from datetime import date, datetime, time, timedelta, timezone

import pytest

from models import BookingStatus, Master, MasterSchedule, OwnerType
from services.calendar_availability import (
    AvailabilityState,
    IntervalInput,
    OccupancyInput,
    OccupancyKind,
    booking_occupancy,
    evaluate_availability,
    hold_occupancy,
)
from services.calendar_time import (
    LegacyTimeEvidence,
    ResolvedInterval,
    TimeResolution,
    canonical_instant,
    canonical_interval,
    resolve_wall_datetime,
    resolve_wall_interval,
)
from services.scheduling import get_available_slots


UTC = timezone.utc
MINUTE = 60 * 1_000_000


def _instant(hour: int, minute: int = 0):
    return canonical_instant(datetime(2026, 1, 1, hour, minute, tzinfo=UTC))


def _resolved(start_hour: int, start_minute: int, end_hour: int, end_minute: int):
    return ResolvedInterval(
        TimeResolution.CANONICAL,
        canonical_interval(
            datetime(2026, 1, 1, start_hour, start_minute, tzinfo=UTC),
            datetime(2026, 1, 1, end_hour, end_minute, tzinfo=UTC),
        ),
    )


def _window(start_hour=9, start_minute=0, end_hour=12, end_minute=0):
    return IntervalInput(_resolved(start_hour, start_minute, end_hour, end_minute))


def _block(start_hour, start_minute, end_hour, end_minute, source_id="block"):
    return OccupancyInput(
        _resolved(start_hour, start_minute, end_hour, end_minute),
        source_id,
        OccupancyKind.BLOCK,
    )


def _evaluate(*, duration=30, blocks=(), bookings=(), holds=(), windows=None):
    return evaluate_availability(
        working_windows=[_window()] if windows is None else windows,
        grid_starts=[
            _instant(hour, minute)
            for hour, minute in [(9, 0), (9, 30), (10, 0), (10, 30), (11, 0), (11, 30)]
        ],
        duration_microseconds=duration * MINUTE,
        bookings=bookings,
        holds=holds,
        blocks=blocks,
    )


def _starts(result):
    return [slot.start for slot in result.slots]


def test_partial_overlap_checks_the_full_service_interval():
    result = _evaluate(
        duration=30,
        blocks=[_block(10, 10, 10, 20)],
    )

    assert _instant(9, 30) in _starts(result)
    assert _instant(10, 0) not in _starts(result)
    assert _instant(10, 30) in _starts(result)


def test_adjacent_interval_does_not_conflict():
    result = _evaluate(
        duration=30,
        blocks=[_block(10, 0, 10, 30)],
    )

    assert _instant(9, 30) in _starts(result)
    assert _instant(10, 0) not in _starts(result)
    assert _instant(10, 30) in _starts(result)


def test_long_service_is_rejected_when_only_its_tail_overlaps():
    result = _evaluate(
        duration=90,
        blocks=[_block(10, 20, 10, 30)],
    )

    assert _instant(9, 0) not in _starts(result)
    assert _instant(10, 30) in _starts(result)


def test_adding_a_block_is_monotonic():
    baseline = _evaluate(duration=60)
    blocked = _evaluate(duration=60, blocks=[_block(10, 10, 10, 20)])

    assert set(blocked.slots) < set(baseline.slots)


def test_block_outside_working_hours_does_not_change_slots():
    baseline = _evaluate(duration=60)
    blocked = _evaluate(duration=60, blocks=[_block(12, 30, 13, 0)])

    assert blocked.slots == baseline.slots


def test_adjacent_schedule_cells_form_one_working_window():
    result = evaluate_availability(
        working_windows=[
            IntervalInput(_resolved(9, 0, 9, 30)),
            IntervalInput(_resolved(9, 30, 10, 0)),
        ],
        grid_starts=[_instant(9)],
        duration_microseconds=60 * MINUTE,
    )

    assert result.state is AvailabilityState.READY
    assert [slot.start for slot in result.slots] == [_instant(9)]
    assert len(result.working_windows) == 1


def test_empty_working_day_never_becomes_available():
    result = _evaluate(
        duration=30,
        blocks=[_block(10, 0, 10, 30)],
        windows=[],
    )

    assert result.state is AvailabilityState.READY
    assert result.slots == ()


@pytest.mark.parametrize(
    ("status", "occupies"),
    [
        (BookingStatus.CREATED, True),
        (BookingStatus.CONFIRMED, True),
        (BookingStatus.COMPLETED, True),
        (BookingStatus.CANCELLED, False),
        (BookingStatus.CANCELLED_BY_CLIENT_EARLY, False),
        (BookingStatus.CANCELLED_BY_CLIENT_LATE, False),
        (BookingStatus.PAYMENT_EXPIRED, False),
        ("rejected", False),
    ],
)
def test_booking_statuses_reuse_existing_occupancy_contract(status, occupies):
    booking = booking_occupancy(
        status=status,
        interval=_resolved(10, 0, 10, 30),
        source_id="booking:1",
    )
    result = _evaluate(bookings=[] if booking is None else [booking])

    assert (_instant(10, 0) not in _starts(result)) is occupies


def test_pending_unexpired_hold_occupies_and_expired_hold_does_not():
    now = _instant(8)
    interval = _resolved(10, 0, 10, 30)
    active = hold_occupancy(
        status="pending",
        interval=interval,
        expires_at=_instant(8, 30),
        now=now,
        source_id="hold:active",
    )
    expired = hold_occupancy(
        status="pending",
        interval=interval,
        expires_at=_instant(7, 30),
        now=now,
        source_id="hold:expired",
    )

    assert _instant(10, 0) not in _starts(_evaluate(holds=[active]))
    assert expired is None


def test_non_pending_hold_does_not_occupy():
    hold = hold_occupancy(
        status="paid",
        interval=_resolved(10, 0, 10, 30),
        expires_at=_instant(8, 30),
        now=_instant(8),
    )

    assert hold is None


def test_unresolved_occupancy_fails_closed_with_typed_result():
    unknown = OccupancyInput(
        ResolvedInterval(TimeResolution.UNRESOLVED, None, "legacy timezone unknown"),
        "booking:legacy",
        OccupancyKind.BOOKING,
    )
    result = _evaluate(bookings=[unknown])

    assert result.state is AvailabilityState.UNRESOLVED
    assert result.slots == ()
    assert result.unresolved_sources == ("booking:legacy",)


def test_pending_hold_with_unknown_expiration_fails_closed():
    hold = hold_occupancy(
        status="pending",
        interval=_resolved(10, 0, 10, 30),
        expires_at=None,
        now=_instant(8),
        source_id="hold:legacy",
    )
    result = _evaluate(holds=[hold])

    assert result.state is AvailabilityState.UNRESOLVED
    assert result.unresolved_sources == ("hold:legacy",)


def test_duration_must_be_positive():
    with pytest.raises(ValueError, match="positive"):
        _evaluate(duration=0)


def test_existing_dated_schedule_candidates_are_unchanged_without_blocks(
    db,
    test_master,
):
    master = Master(
        user_id=test_master.id,
        bio="",
        experience_years=0,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.flush()
    target_date = date(2026, 2, 2)
    for hour, minute in [(9, 0), (9, 30), (10, 0), (10, 30)]:
        start = time(hour, minute)
        end_dt = datetime.combine(target_date, start) + timedelta(minutes=30)
        db.add(
            MasterSchedule(
                master_id=master.id,
                date=target_date,
                start_time=start,
                end_time=end_dt.time(),
                is_available=True,
            )
        )
    db.commit()

    existing = get_available_slots(
        db,
        OwnerType.MASTER,
        master.id,
        datetime.combine(target_date, time()),
        service_duration=60,
    )
    evidence = LegacyTimeEvidence("Europe/Moscow")
    windows = [
        IntervalInput(
            ResolvedInterval(
                TimeResolution.RESOLVED_WITH_EVIDENCE,
                resolve_wall_interval(
                    datetime.combine(row.date, row.start_time),
                    datetime.combine(row.date, row.end_time),
                    evidence,
                ),
            ),
            f"schedule:{row.id}",
        )
        for row in db.query(MasterSchedule)
        .filter(MasterSchedule.master_id == master.id)
        .order_by(MasterSchedule.start_time)
        .all()
    ]
    existing_starts = [
        resolve_wall_datetime(slot["start_time"], "Europe/Moscow") for slot in existing
    ]
    independent_day_grid = [
        resolve_wall_datetime(
            datetime.combine(target_date, time()) + timedelta(minutes=offset),
            "Europe/Moscow",
        )
        for offset in range(0, 24 * 60, 30)
    ]

    result = evaluate_availability(
        working_windows=windows,
        grid_starts=independent_day_grid,
        duration_microseconds=60 * MINUTE,
    )

    assert result.state is AvailabilityState.READY
    assert [slot.start for slot in result.slots] == existing_starts
    assert len(result.working_windows) == 1

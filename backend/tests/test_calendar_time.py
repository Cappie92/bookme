from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from services.calendar_time import (
    AmbiguousWallTimeError,
    CanonicalInterval,
    LegacyTimeEvidence,
    NonexistentWallTimeError,
    TimeNormalizationError,
    TimeResolution,
    canonical_instant,
    canonical_interval,
    classify_legacy_interval,
    resolve_wall_datetime,
    resolve_wall_interval,
    validate_offset_for_zone,
)


def test_equal_instants_with_different_offsets_are_equal():
    utc = datetime(2026, 10, 27, 9, tzinfo=timezone.utc)
    moscow = datetime(
        2026,
        10,
        27,
        12,
        tzinfo=timezone(timedelta(hours=3)),
    )

    assert canonical_instant(utc) == canonical_instant(moscow)


def test_half_open_overlap_and_boundary_equality():
    first = canonical_interval(
        datetime(2026, 1, 1, 10, tzinfo=timezone.utc),
        datetime(2026, 1, 1, 11, tzinfo=timezone.utc),
    )
    adjacent = canonical_interval(
        datetime(2026, 1, 1, 11, tzinfo=timezone.utc),
        datetime(2026, 1, 1, 12, tzinfo=timezone.utc),
    )
    partial = canonical_interval(
        datetime(2026, 1, 1, 10, 59, tzinfo=timezone.utc),
        datetime(2026, 1, 1, 11, 30, tzinfo=timezone.utc),
    )

    assert not first.overlaps(adjacent)
    assert first.overlaps(partial)
    assert first.contains(first)


def test_canonical_interval_rejects_empty_or_reverse_ranges():
    instant = canonical_instant(datetime(2026, 1, 1, tzinfo=timezone.utc))
    with pytest.raises(TimeNormalizationError):
        CanonicalInterval(instant, instant)


def test_explicit_offset_must_match_iana_zone_at_same_wall_time():
    valid = datetime(
        2026,
        7,
        1,
        12,
        tzinfo=timezone(timedelta(hours=2)),
    )
    invalid = valid.replace(tzinfo=timezone(timedelta(hours=1)))

    assert validate_offset_for_zone(valid, "Europe/Berlin") == canonical_instant(valid)
    with pytest.raises(TimeNormalizationError, match="does not match"):
        validate_offset_for_zone(invalid, "Europe/Berlin")


def test_explicit_offsets_validate_both_sides_of_dst_fold():
    first = datetime(
        2026,
        10,
        25,
        2,
        30,
        tzinfo=timezone(timedelta(hours=2)),
    )
    second = first.replace(tzinfo=timezone(timedelta(hours=1)))

    assert validate_offset_for_zone(first, "Europe/Berlin") == canonical_instant(first)
    assert validate_offset_for_zone(second, "Europe/Berlin") == canonical_instant(
        second
    )
    assert canonical_instant(first) != canonical_instant(second)


def test_dst_gap_is_rejected_by_round_trip_validation():
    with pytest.raises(NonexistentWallTimeError):
        resolve_wall_datetime(
            datetime(2026, 3, 29, 2, 30),
            "Europe/Berlin",
        )


def test_dst_fold_requires_selection_and_maps_to_distinct_instants():
    wall = datetime(2026, 10, 25, 2, 30)

    with pytest.raises(AmbiguousWallTimeError):
        resolve_wall_datetime(wall, "Europe/Berlin")

    first = resolve_wall_datetime(wall, "Europe/Berlin", fold=0)
    second = resolve_wall_datetime(wall, "Europe/Berlin", fold=1)
    assert second.epoch_microseconds - first.epoch_microseconds == 3_600_000_000


def test_elapsed_duration_across_dst_fold_uses_absolute_timeline():
    interval = resolve_wall_interval(
        datetime(2026, 10, 25, 2, 30),
        datetime(2026, 10, 25, 3, 30),
        LegacyTimeEvidence("Europe/Berlin", start_fold=0),
    )

    assert interval.duration_microseconds == 2 * 3_600_000_000


def test_interval_can_cross_local_midnight():
    berlin = ZoneInfo("Europe/Berlin")
    interval = canonical_interval(
        datetime(2026, 6, 1, 23, 30, tzinfo=berlin),
        datetime(2026, 6, 2, 0, 30, tzinfo=berlin),
    )

    assert interval.duration_microseconds == 3_600_000_000


def test_naive_legacy_interval_without_evidence_is_unresolved():
    result = classify_legacy_interval(
        datetime(2026, 1, 1, 10),
        datetime(2026, 1, 1, 11),
    )

    assert result.state is TimeResolution.UNRESOLVED
    assert result.interval is None
    assert "no timezone evidence" in result.reason


def test_naive_legacy_interval_with_explicit_evidence_is_resolved():
    result = classify_legacy_interval(
        datetime(2026, 1, 1, 10),
        datetime(2026, 1, 1, 11),
        evidence=LegacyTimeEvidence("Europe/Moscow"),
    )

    assert result.state is TimeResolution.RESOLVED_WITH_EVIDENCE
    assert result.interval.duration_microseconds == 3_600_000_000


def test_aware_interval_is_canonical_and_naive_aware_mix_is_unresolved():
    aware = datetime(2026, 1, 1, 10, tzinfo=timezone.utc)
    canonical = classify_legacy_interval(aware, aware + timedelta(hours=1))
    mixed = classify_legacy_interval(aware, datetime(2026, 1, 1, 11))

    assert canonical.state is TimeResolution.CANONICAL
    assert mixed.state is TimeResolution.UNRESOLVED


def test_unknown_zone_never_falls_back_to_a_default():
    with pytest.raises(TimeNormalizationError, match="unknown IANA"):
        resolve_wall_datetime(datetime(2026, 1, 1, 10), "Mars/Olympus")

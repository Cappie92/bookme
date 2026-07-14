"""Расчёт daily_rate, package_value из snapshot и границы периода."""
from __future__ import annotations

from datetime import datetime, timedelta

from constants import duration_months_to_days
from utils.subscription_billing_calc import (
    compute_daily_charge_amount,
    compute_subscription_daily_rate_float,
    resolve_snapshot_package_value,
    subscription_exclusive_end,
    subscription_inclusive_end,
    sum_daily_charges,
    to_display_period,
)


class _SnapshotStub:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


def test_daily_rate_float_without_points_3210_over_90_days():
    rate = compute_subscription_daily_rate_float(3210, duration_days=90)
    assert abs(rate - (3210 / 90)) < 1e-9


def test_daily_rate_float_with_points_2729_over_90_days():
    rate = compute_subscription_daily_rate_float(2729, duration_days=90)
    assert abs(rate - (2729 / 90)) < 1e-9


def test_daily_rate_full_points_payment_is_zero():
    assert compute_subscription_daily_rate_float(0, duration_days=30) == 0.0


def test_resolve_snapshot_package_value_prefers_price_before_points():
    snapshot = _SnapshotStub(
        price_before_points=3210.0,
        total_price=2729.0,
        subscription_points_used=481,
        final_price=2729.0,
    )
    assert resolve_snapshot_package_value(snapshot) == 3210.0


def test_sum_daily_charges_exact_for_2729_and_3210():
    assert sum_daily_charges(2729, 90) == 2729
    assert sum_daily_charges(3210, 90) == 3210


def test_daily_charge_distribution_first_days_get_remainder():
    assert compute_daily_charge_amount(2729, 90, 0) == 31
    assert compute_daily_charge_amount(2729, 90, 28) == 31
    assert compute_daily_charge_amount(2729, 90, 29) == 30


def test_resolve_subscription_apply_billing_full_points():
    snapshot = _SnapshotStub(
        price_before_points=400.0,
        total_price=0.0,
        final_price=0.0,
        subscription_points_used=400,
    )
    from utils.subscription_billing_calc import resolve_subscription_apply_billing

    billing = resolve_subscription_apply_billing(snapshot, duration_days=30)
    assert billing["package_value"] == 400.0
    assert billing["chargeable_value"] == 0.0
    assert billing["daily_rate"] == 0.0
    assert billing["points_spent"] == 400


def test_resolve_subscription_apply_billing_partial_points():
    snapshot = _SnapshotStub(
        price_before_points=3210.0,
        total_price=2729.0,
        final_price=2729.0,
        subscription_points_used=481,
    )
    from utils.subscription_billing_calc import resolve_subscription_apply_billing

    billing = resolve_subscription_apply_billing(snapshot, duration_days=90)
    assert billing["package_value"] == 3210.0
    assert billing["chargeable_value"] == 2729.0
    assert abs(billing["daily_rate"] - (2729 / 90)) < 1e-9


def test_display_period_inclusive_end_is_day_before_exclusive():
    start = datetime(2026, 10, 10, 12, 0, 0)
    days = duration_months_to_days(1)
    exclusive = subscription_exclusive_end(start, days)
    display_start, display_end = to_display_period(start, exclusive)
    assert display_start == start
    assert display_end == subscription_inclusive_end(exclusive)
    assert display_end + timedelta(days=1) == exclusive


def test_sequential_display_periods_no_same_boundary_date():
    start = datetime(2026, 10, 10, 10, 0, 0)
    days = duration_months_to_days(1)
    first_exclusive = subscription_exclusive_end(start, days)
    _, first_inclusive_end = to_display_period(start, first_exclusive)
    second_start = first_exclusive
    second_exclusive = subscription_exclusive_end(second_start, days)
    _, second_inclusive_end = to_display_period(second_start, second_exclusive)

    assert first_inclusive_end != second_start
    assert second_start - first_inclusive_end == timedelta(days=1)
    assert (first_inclusive_end - start).days == days - 1
    assert (second_inclusive_end - second_start).days == days - 1

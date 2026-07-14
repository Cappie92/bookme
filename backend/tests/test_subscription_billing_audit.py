"""Unit-тесты read-only аудита subscription billing."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from utils.subscription_billing_audit import (
    audit_passed,
    build_audit_report,
    build_audit_row_from_billing,
    run_audit_checks,
    summarize_audit_reports,
)


def _base_row(**overrides):
    start = datetime(2026, 7, 1, 10, 0, 0)
    end = start + timedelta(days=90)
    row = build_audit_row_from_billing(
        payment_id=1,
        user_id=10,
        amount_paid=3210.0,
        points_spent=0,
        package_value=3210.0,
        duration_months=3,
        monthly_price=1070.0,
        subscription_id=100,
        subscription_price=3210.0,
        daily_rate=3210.0 / 90.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=0.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    row.update(overrides)
    return row


def test_normal_cash_payment_passes():
    row = _base_row()
    checks = run_audit_checks(row)
    assert audit_passed(checks)
    assert checks["package_equals_paid_plus_points"]
    assert checks["monthly_price_correct"]
    assert checks["subscription_price_equals_chargeable"]
    assert checks["charged_not_over_total"]
    assert checks["zero_rate_valid"]
    assert checks["daily_rate_matches_expected"]
    assert checks["period_valid"]


def test_normal_payment_1160_30_legacy_daily_rate_does_not_fail_zero_rate_valid():
    start = datetime(2026, 9, 1, 10, 0, 0)
    end = start + timedelta(days=30)
    row = build_audit_row_from_billing(
        payment_id=22,
        user_id=20,
        amount_paid=1160.0,
        points_spent=0,
        package_value=1160.0,
        duration_months=1,
        monthly_price=1160.0,
        subscription_id=200,
        subscription_price=1160.0,
        daily_rate=39.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=0.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert row["expected_chargeable_total"] == 1160.0
    assert row["period_days"] == 30
    assert abs(row["expected_daily_rate"] - (1160.0 / 30.0)) < 1e-9
    assert checks["zero_rate_valid"] is True
    assert checks["daily_rate_matches_expected"] is False
    assert not audit_passed(checks)


def test_normal_payment_1160_30_exact_daily_rate_passes():
    start = datetime(2026, 9, 1, 10, 0, 0)
    end = start + timedelta(days=30)
    exact_rate = 1160.0 / 30.0
    row = build_audit_row_from_billing(
        payment_id=23,
        user_id=21,
        amount_paid=1160.0,
        points_spent=0,
        package_value=1160.0,
        duration_months=1,
        monthly_price=1160.0,
        subscription_id=201,
        subscription_price=1160.0,
        daily_rate=exact_rate,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=0.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert checks["zero_rate_valid"] is True
    assert checks["daily_rate_matches_expected"] is True
    assert audit_passed(checks)


def test_partial_points_payment_passes():
    start = datetime(2026, 7, 1, 10, 0, 0)
    end = start + timedelta(days=90)
    row = build_audit_row_from_billing(
        payment_id=2,
        user_id=11,
        amount_paid=2729.0,
        points_spent=481,
        package_value=3210.0,
        duration_months=3,
        monthly_price=1070.0,
        subscription_id=101,
        subscription_price=2729.0,
        daily_rate=2729.0 / 90.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=500.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert audit_passed(checks)
    assert row["expected_chargeable_total"] == 2729.0
    assert row["remaining_to_charge"] == 2229.0


def test_zero_rate_full_points_passes():
    start = datetime(2026, 8, 1, 12, 0, 0)
    end = start + timedelta(days=30)
    row = build_audit_row_from_billing(
        payment_id=3,
        user_id=12,
        amount_paid=0.0,
        points_spent=400,
        package_value=400.0,
        duration_months=1,
        monthly_price=400.0,
        subscription_id=102,
        subscription_price=0.0,
        daily_rate=0.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=0.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert audit_passed(checks)
    assert checks["zero_rate_valid"]
    assert checks["daily_rate_matches_expected"]


def test_zero_charge_nonzero_daily_rate_fails():
    start = datetime(2026, 8, 1, 12, 0, 0)
    end = start + timedelta(days=30)
    row = build_audit_row_from_billing(
        payment_id=5,
        user_id=14,
        amount_paid=0.0,
        points_spent=400,
        package_value=400.0,
        duration_months=1,
        monthly_price=400.0,
        subscription_id=104,
        subscription_price=0.0,
        daily_rate=34.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=0.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert not checks["zero_rate_valid"]
    assert not checks["daily_rate_matches_expected"]


def test_overcharge_detection_fails():
    row = _base_row(charged_total_so_far=3300.0, subscription_price=3210.0)
    checks = run_audit_checks(row)
    assert not checks["charged_not_over_total"]
    assert not audit_passed(checks)


def test_wrong_monthly_price_fails():
    row = _base_row(monthly_price=386.67)
    checks = run_audit_checks(row)
    assert not checks["monthly_price_correct"]
    assert not audit_passed(checks)


def test_legacy_wrong_subscription_price_fails():
    row = _base_row(subscription_price=1160.0)
    checks = run_audit_checks(row)
    assert not checks["subscription_price_equals_chargeable"]
    assert not audit_passed(checks)


def test_zero_rate_with_charges_fails():
    start = datetime(2026, 8, 1, 12, 0, 0)
    end = start + timedelta(days=30)
    row = build_audit_row_from_billing(
        payment_id=4,
        user_id=13,
        amount_paid=0.0,
        points_spent=400,
        package_value=400.0,
        duration_months=1,
        monthly_price=400.0,
        subscription_id=103,
        subscription_price=0.0,
        daily_rate=0.0,
        period_start=start,
        period_end_exclusive=end,
        charged_total_so_far=10.0,
        payment_status="paid",
        subscription_apply_status="applied",
    )
    checks = run_audit_checks(row)
    assert not checks["zero_rate_valid"]


def test_summarize_audit_reports():
    ok = build_audit_report(_base_row())
    bad = build_audit_report(_base_row(subscription_price=1160.0))
    summary = summarize_audit_reports([ok, bad])
    assert summary["checked"] == 2
    assert summary["passed"] == 1
    assert summary["failed"] == 1
    assert summary["failed_payment_ids"] == [1]


def test_serialize_audit_report_iso_dates():
    from utils.subscription_billing_audit import serialize_audit_report

    start = datetime(2026, 7, 1, 10, 0, 0)
    report = build_audit_report(_base_row())
    serialized = serialize_audit_report(report)
    assert isinstance(serialized["period_start"], str)
    assert serialized["period_start"].startswith("2026-07-01")
    assert serialized["passed"] is True

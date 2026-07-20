"""Unit tests for subscription payment split (points → balance → card)."""
from utils.subscription_payment_split import (
    compute_subscription_payment_split,
    get_active_hold_amount_from_metadata,
    is_v2_payment_metadata,
    build_payment_split_metadata,
)


def test_full_balance_coverage():
    s = compute_subscription_payment_split(
        price_before_points=24,
        points_used=0,
        available_balance=43880,
    )
    assert s.balance_portion == 24
    assert s.card_portion == 0
    assert s.requires_robokassa is False
    assert s.can_pay_fully_from_internal is True


def test_mixed_with_points():
    s = compute_subscription_payment_split(
        price_before_points=1000,
        points_used=100,
        available_balance=300,
    )
    assert s.points_portion == 100
    assert s.after_points == 900
    assert s.balance_portion == 300
    assert s.card_portion == 600
    assert s.requires_robokassa is True


def test_full_points():
    s = compute_subscription_payment_split(
        price_before_points=100,
        points_used=100,
        available_balance=500,
    )
    assert s.after_points == 0
    assert s.balance_portion == 0
    assert s.card_portion == 0
    assert s.can_pay_fully_from_internal is False  # nothing left to pay from balance


def test_no_balance_all_card():
    s = compute_subscription_payment_split(
        price_before_points=500,
        points_used=0,
        available_balance=0,
    )
    assert s.balance_portion == 0
    assert s.card_portion == 500


def test_hold_metadata_active():
    s = compute_subscription_payment_split(
        price_before_points=1000, points_used=0, available_balance=300
    )
    meta = build_payment_split_metadata(s, calculation_id=1, balance_hold_active=True)
    assert is_v2_payment_metadata(meta)
    assert get_active_hold_amount_from_metadata(meta) == 300.0
    meta["balance_hold_released"] = True
    assert get_active_hold_amount_from_metadata(meta) == 0.0


def test_legacy_metadata_no_hold():
    assert get_active_hold_amount_from_metadata({"calculation_id": 1}) == 0.0
    assert is_v2_payment_metadata({}) is False

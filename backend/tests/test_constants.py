"""Тесты для backend/constants: длительности 30/90/180/360."""
import pytest

from constants import DURATION_DAYS, duration_months_to_days


def test_duration_days():
    assert DURATION_DAYS[1] == 30
    assert DURATION_DAYS[3] == 90
    assert DURATION_DAYS[6] == 180
    assert DURATION_DAYS[12] == 360


def test_duration_months_to_days():
    assert duration_months_to_days(1) == 30
    assert duration_months_to_days(3) == 90
    assert duration_months_to_days(6) == 180
    assert duration_months_to_days(12) == 360


def test_daily_rate_from_total():
    """daily_rate = total_price / duration_days (30/90/180/360)."""
    total = 3000.0
    for months, days in [(1, 30), (3, 90), (6, 180), (12, 360)]:
        d = duration_months_to_days(months)
        assert d == days
        daily = total / d
        assert abs(daily - total / days) < 1e-9

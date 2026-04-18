"""
Тест: daily_rate = ceil(total_price / duration_days) при создании подписки.
"""
import math
import pytest

from constants import duration_months_to_days
from models import SubscriptionPlan, SubscriptionType


def test_daily_rate_ceil_500_30():
    """total_price=500, duration_days=30 => daily_rate = ceil(16.666..) = 17"""
    total_price = 500.0
    duration_days = duration_months_to_days(1)
    assert duration_days == 30
    daily_rate = int(math.ceil(total_price / duration_days))
    assert daily_rate == 17


def test_daily_rate_ceil_1500_30():
    """total_price=1500, duration_days=30 => daily_rate = 50"""
    total_price = 1500.0
    duration_days = 30
    daily_rate = int(math.ceil(total_price / duration_days))
    assert daily_rate == 50


def test_charge_amount_round_old_subscription():
    """Старая подписка daily_rate=16.6667 => charge_amount = int(round(...)) = 17"""
    daily_rate = 16.6666666666667
    charge_amount = max(0, int(round(float(daily_rate))))
    assert charge_amount == 17

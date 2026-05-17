"""Сброс резерва баллов на записи (без ledger-транзакций)."""
from __future__ import annotations

from typing import Any


def clear_loyalty_points_reserve(booking: Any) -> None:
    """
    Обнуляет booking.loyalty_points_used, если > 0.
    Не создаёт LoyaltyTransaction. Идемпотентно.
    """
    cur = int(getattr(booking, "loyalty_points_used", None) or 0)
    if cur > 0:
        booking.loyalty_points_used = 0

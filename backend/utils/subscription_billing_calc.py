"""Расчёт chargeable daily_rate и календарных границ периода подписки."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional, Tuple


def resolve_snapshot_package_value(
    snapshot,
    *,
    points_spent: int = 0,
) -> float:
    """Полная стоимость пакета из snapshot (до списания баллов)."""
    price_before_points = getattr(snapshot, "price_before_points", None)
    if price_before_points is not None:
        return float(price_before_points)

    total = float(getattr(snapshot, "total_price", 0) or 0)
    snapshot_points = int(getattr(snapshot, "subscription_points_used", 0) or 0)
    points = snapshot_points or int(points_spent or 0)
    if points > 0 and total > 0:
        return total + points
    return total


def resolve_snapshot_chargeable_value(
    snapshot,
    *,
    points_spent: int = 0,
) -> float:
    """Сумма, зачисляемая на баланс и списываемая за период (после баллов)."""
    final_price = getattr(snapshot, "final_price", None)
    if final_price is not None:
        return max(0.0, float(final_price))

    package_value = resolve_snapshot_package_value(snapshot, points_spent=points_spent)
    points = int(getattr(snapshot, "subscription_points_used", 0) or 0) or int(points_spent or 0)
    return float(compute_chargeable_value(package_value, points))


def compute_chargeable_value(package_value: float | int | Decimal, points_spent: int = 0) -> Decimal:
    return max(Decimal("0"), Decimal(str(package_value)) - Decimal(int(points_spent or 0)))


def compute_subscription_daily_rate_float(
    chargeable_value: float | int | Decimal,
    *,
    duration_days: int,
) -> float:
    """Средняя дневная ставка без округления вверх (для UI и subscription.daily_rate)."""
    days = int(duration_days or 0)
    if days <= 0:
        return 0.0
    chargeable = Decimal(str(chargeable_value))
    if chargeable <= 0:
        return 0.0
    return float(chargeable / Decimal(days))


def resolve_subscription_apply_billing(
    snapshot,
    *,
    duration_days: int,
    points_spent: int | None = None,
) -> dict[str, float | int]:
    """
    Единый расчёт для apply подписки (Robokassa, balance, free).

    Subscription.price = chargeable_value (сумма к списанию с баланса).
    package_value — только для истории/UI.
    """
    points_used = (
        int(points_spent)
        if points_spent is not None
        else int(getattr(snapshot, "subscription_points_used", 0) or 0)
    )
    package_value = resolve_snapshot_package_value(snapshot, points_spent=points_used)
    chargeable_value = float(compute_chargeable_value(package_value, points_used))
    daily_rate = compute_subscription_daily_rate_float(
        chargeable_value,
        duration_days=int(duration_days),
    )
    return {
        "package_value": float(package_value),
        "chargeable_value": chargeable_value,
        "points_spent": points_used,
        "daily_rate": daily_rate,
    }


def compute_daily_charge_amount(chargeable_total: int, period_days: int, day_index: int) -> int:
    """
    Сумма списания за day_index-й день периода (0-based).

    Первые (chargeable_total % period_days) дней получают base+1 ₽,
    остальные — base ₽. Сумма за period_days дней == chargeable_total ровно.
    """
    if period_days <= 0 or day_index < 0 or day_index >= period_days:
        return 0
    total = int(chargeable_total)
    if total <= 0:
        return 0
    base = total // period_days
    remainder = total % period_days
    if day_index < remainder:
        return base + 1
    return base


def sum_daily_charges(chargeable_total: int, period_days: int) -> int:
    """Инвариант: сумма всех дневных списаний за период."""
    return sum(
        compute_daily_charge_amount(chargeable_total, period_days, day_index)
        for day_index in range(period_days)
    )


def subscription_period_days(start: datetime, exclusive_end: datetime) -> int:
    return max(1, (exclusive_end.date() - start.date()).days)


def subscription_charge_day_index(start: datetime, charge_date: date) -> int:
    return (charge_date - start.date()).days


def subscription_exclusive_end(start: datetime, duration_days: int) -> datetime:
    """Исключительная граница end_date (как в daily_charges: cur < end.date())."""
    return start + timedelta(days=int(duration_days))


def subscription_inclusive_end(exclusive_end: datetime) -> datetime:
    """Последний включительный календарный день периода для UI."""
    return exclusive_end - timedelta(days=1)


def to_display_period(
    start: Optional[datetime],
    exclusive_end: Optional[datetime],
) -> Tuple[Optional[datetime], Optional[datetime]]:
    if start is None or exclusive_end is None:
        return start, None
    return start, subscription_inclusive_end(exclusive_end)

"""Расчёт внутреннего DEPOSIT для subscription payment (Robokassa phase1)."""
from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy.orm import Session

from models import Payment, SubscriptionPriceSnapshot

MONEY_TOLERANCE = 0.01


class SubscriptionDepositValidationError(ValueError):
    """Невалидный snapshot для subscription deposit."""


def _snapshot_price_before_points(snapshot: SubscriptionPriceSnapshot) -> float:
    raw = getattr(snapshot, "price_before_points", None)
    if raw is not None:
        return float(raw)
    return float(getattr(snapshot, "total_price", 0) or 0)


def resolve_subscription_deposit_amount(
    db: Session,
    payment: Payment,
) -> Tuple[float, int, Optional[SubscriptionPriceSnapshot]]:
    """
    Сумма внутреннего DEPOSIT для subscription payment.

    С snapshot (через доверенный calculation_id в metadata):
      deposit_amount = snapshot.price_before_points (fallback: total_price)

    Legacy без calculation_id:
      deposit_amount = payment.amount
    """
    amount_paid = float(payment.amount or 0)
    meta = payment.payment_metadata or {}
    calculation_id = meta.get("calculation_id")
    if not calculation_id:
        return amount_paid, 0, None

    snapshot = (
        db.query(SubscriptionPriceSnapshot)
        .filter(
            SubscriptionPriceSnapshot.id == int(calculation_id),
            SubscriptionPriceSnapshot.user_id == payment.user_id,
        )
        .first()
    )
    if not snapshot:
        raise SubscriptionDepositValidationError(
            f"Snapshot {calculation_id} not found for payment user_id={payment.user_id}"
        )

    if payment.plan_id is not None and int(snapshot.plan_id) != int(payment.plan_id):
        raise SubscriptionDepositValidationError("snapshot plan_id mismatch vs payment.plan_id")

    final_price = float(getattr(snapshot, "final_price", 0) or 0)
    if abs(final_price - amount_paid) > MONEY_TOLERANCE:
        raise SubscriptionDepositValidationError(
            f"snapshot.final_price ({final_price}) mismatch vs payment.amount ({amount_paid})"
        )

    points_used = int(getattr(snapshot, "subscription_points_used", 0) or 0)
    if points_used < 0:
        raise SubscriptionDepositValidationError("subscription_points_used must be >= 0")

    price_before = _snapshot_price_before_points(snapshot)
    if price_before + MONEY_TOLERANCE < amount_paid:
        raise SubscriptionDepositValidationError(
            f"price_before_points ({price_before}) < payment.amount ({amount_paid})"
        )

    return price_before, points_used, snapshot


def build_subscription_deposit_description(payment_id: int, points_used: int) -> str:
    desc = f"Оплата подписки через Robokassa (платеж {payment_id})"
    if points_used > 0:
        desc += f", включая {points_used} ₽ бонусными баллами"
    return desc

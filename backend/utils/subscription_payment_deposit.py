"""Deposit amount для subscription Payment: legacy vs scheme_version=2 (mixed)."""
from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy.orm import Session

from models import Payment, SubscriptionPriceSnapshot
from utils.subscription_payment_split import (
    MONEY_TOLERANCE,
    is_v2_payment_metadata,
)


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
    Сумма внутреннего DEPOSIT для subscription payment (фаза 1 Robokassa).

    Legacy (без scheme_version=2):
      deposit_amount = snapshot.final_price (= package − points), payment.amount должен совпадать.

    scheme_version=2 (mixed):
      deposit_amount = card_portion (== payment.amount);
      balance_portion уже в soft-hold и будет финализирован при apply.
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

    points_used = int(getattr(snapshot, "subscription_points_used", 0) or 0)
    if points_used < 0:
        raise SubscriptionDepositValidationError("subscription_points_used must be >= 0")

    price_before = _snapshot_price_before_points(snapshot)
    final_price = float(getattr(snapshot, "final_price", 0) or 0)

    if is_v2_payment_metadata(meta):
        card_portion = float(meta.get("card_portion") if meta.get("card_portion") is not None else amount_paid)
        balance_portion = float(meta.get("balance_portion") or 0.0)
        meta_points = int(meta.get("points_used") if meta.get("points_used") is not None else points_used)
        if abs(card_portion - amount_paid) > MONEY_TOLERANCE:
            raise SubscriptionDepositValidationError(
                f"v2 card_portion ({card_portion}) mismatch vs payment.amount ({amount_paid})"
            )
        if card_portion < -MONEY_TOLERANCE:
            raise SubscriptionDepositValidationError("card_portion must be >= 0")
        expected_after_points = price_before - meta_points
        if abs(expected_after_points - (balance_portion + card_portion)) > MONEY_TOLERANCE:
            raise SubscriptionDepositValidationError(
                f"v2 split mismatch: price_before ({price_before}) - points ({meta_points}) "
                f"!= balance ({balance_portion}) + card ({card_portion})"
            )
        if abs(final_price - expected_after_points) > MONEY_TOLERANCE:
            raise SubscriptionDepositValidationError(
                f"v2 snapshot.final_price ({final_price}) != after_points ({expected_after_points})"
            )
        # Депозит только карточной части (баланс уже в hold).
        return max(0.0, card_portion), meta_points, snapshot

    # --- Legacy ---
    if abs(final_price - amount_paid) > MONEY_TOLERANCE:
        raise SubscriptionDepositValidationError(
            f"snapshot.final_price ({final_price}) mismatch vs payment.amount ({amount_paid})"
        )

    if price_before + MONEY_TOLERANCE < amount_paid:
        raise SubscriptionDepositValidationError(
            f"price_before_points ({price_before}) < payment.amount ({amount_paid})"
        )

    chargeable_amount = float(getattr(snapshot, "final_price", 0) or 0)
    if chargeable_amount + MONEY_TOLERANCE < amount_paid:
        raise SubscriptionDepositValidationError(
            f"snapshot.final_price ({chargeable_amount}) < payment.amount ({amount_paid})"
        )
    expected_chargeable = price_before - points_used
    if abs(expected_chargeable - chargeable_amount) > MONEY_TOLERANCE:
        raise SubscriptionDepositValidationError(
            f"chargeable mismatch: price_before_points ({price_before}) - points ({points_used}) "
            f"!= final_price ({chargeable_amount})"
        )

    return chargeable_amount, points_used, snapshot


def build_subscription_deposit_description(payment_id: int, points_used: int) -> str:
    desc = f"Оплата подписки через Robokassa (платеж {payment_id})"
    if points_used > 0:
        desc += f", включая {points_used} ₽ бонусными баллами"
    return desc

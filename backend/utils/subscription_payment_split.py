"""Расчёт долей оплаты подписки: промобаллы → баланс → Robokassa.

Источник истины для новых платежей (scheme_version=2).
upgrade_type не влияет на split.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

MONEY_TOLERANCE = 0.01

# Маркер новых платежей со split + payment hold (старые pending без маркера не трогаем).
PAYMENT_SCHEME_VERSION = 2


@dataclass(frozen=True)
class SubscriptionPaymentSplit:
    price_before_points: float
    points_portion: float
    points_used: int
    after_points: float
    balance_portion: float
    card_portion: float
    available_balance: float
    requires_robokassa: bool
    can_pay_fully_from_internal: bool

    @property
    def final_price(self) -> float:
        """Сумма после баллов (= balance + card). Совместимость с snapshot.final_price."""
        return self.after_points


def compute_subscription_payment_split(
    *,
    price_before_points: float,
    points_used: int = 0,
    available_balance: float = 0.0,
) -> SubscriptionPaymentSplit:
    """
    Порядок:
      1) points_used (уже выбранные/валидированные баллы, 1 балл = 1 ₽)
      2) весь доступный денежный баланс (макс. покрытие)
      3) остаток → card (Robokassa)
    """
    price = max(0.0, float(price_before_points or 0.0))
    pts = max(0, int(points_used or 0))
    if pts > price + MONEY_TOLERANCE:
        pts = int(price)  # safety clamp
    points_portion = float(pts)
    after_points = max(0.0, price - points_portion)
    available = max(0.0, float(available_balance or 0.0))
    balance_portion = min(available, after_points)
    # денежная арифметика: избегаем -0.0 и микроскопических остатков
    if after_points - balance_portion <= MONEY_TOLERANCE:
        balance_portion = after_points
        card_portion = 0.0
    else:
        card_portion = round(after_points - balance_portion, 2)
        balance_portion = round(balance_portion, 2)
    return SubscriptionPaymentSplit(
        price_before_points=price,
        points_portion=points_portion,
        points_used=pts,
        after_points=round(after_points, 2),
        balance_portion=balance_portion,
        card_portion=card_portion,
        available_balance=available,
        requires_robokassa=card_portion > MONEY_TOLERANCE,
        can_pay_fully_from_internal=after_points > MONEY_TOLERANCE and card_portion <= MONEY_TOLERANCE,
    )


def build_payment_split_metadata(
    split: SubscriptionPaymentSplit,
    *,
    calculation_id: Optional[int] = None,
    upgrade_type: Optional[str] = None,
    selected_duration: Optional[int] = None,
    plan_name: Optional[str] = None,
    plan_display_name: Optional[str] = None,
    balance_hold_active: bool = False,
) -> dict:
    """Метаданные Payment для scheme_version=2."""
    meta = {
        "scheme_version": PAYMENT_SCHEME_VERSION,
        "price_before_points": split.price_before_points,
        "points_portion": split.points_portion,
        "points_used": split.points_used,
        "balance_portion": split.balance_portion,
        "card_portion": split.card_portion,
        "balance_hold_amount": split.balance_portion if balance_hold_active else 0.0,
        "balance_hold_active": bool(balance_hold_active and split.balance_portion > MONEY_TOLERANCE),
        "balance_hold_released": False,
        "balance_hold_finalized": False,
    }
    if calculation_id is not None:
        meta["calculation_id"] = calculation_id
    if upgrade_type is not None:
        meta["upgrade_type"] = upgrade_type
    if selected_duration is not None:
        meta["selected_duration"] = selected_duration
    if plan_name is not None:
        meta["plan_name"] = plan_name
    if plan_display_name is not None:
        meta["plan_display_name"] = plan_display_name
    return meta


def is_v2_payment_metadata(meta: Optional[dict]) -> bool:
    if not meta or not isinstance(meta, dict):
        return False
    try:
        return int(meta.get("scheme_version") or 0) == PAYMENT_SCHEME_VERSION
    except (TypeError, ValueError):
        return False


def get_active_hold_amount_from_metadata(meta: Optional[dict]) -> float:
    """Сумма активного soft-hold по metadata Payment (v2)."""
    if not is_v2_payment_metadata(meta):
        return 0.0
    if meta.get("balance_hold_released") or meta.get("balance_hold_finalized"):
        return 0.0
    if not meta.get("balance_hold_active"):
        return 0.0
    try:
        amount = float(meta.get("balance_hold_amount") or meta.get("balance_portion") or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, amount)


def build_split_breakdown_text(
    split: SubscriptionPaymentSplit,
    *,
    upgrade_type: Optional[str] = None,
) -> str:
    """Короткий текст для UI (не таблица строк — строки на клиенте из числовых полей)."""
    parts = []
    if (upgrade_type or "") == "after_expiry":
        parts.append("Тариф применится после окончания текущей подписки.")
    if split.points_used > 0:
        parts.append(f"Баллами: {int(split.points_portion)} ₽.")
    if split.balance_portion > MONEY_TOLERANCE:
        parts.append(f"С баланса: {int(round(split.balance_portion))} ₽.")
    if split.card_portion > MONEY_TOLERANCE:
        parts.append(f"Картой: {int(round(split.card_portion))} ₽.")
    elif split.after_points > MONEY_TOLERANCE:
        parts.append("Оплата картой не требуется.")
    elif split.points_used > 0:
        parts.append("Оплата полностью баллами.")
    else:
        parts.append("Доплата не требуется.")
    return " ".join(parts)

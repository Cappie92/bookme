"""Read-only расчёт стоимости подписки для UI (карточка тарифа, история оплат)."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from constants import DURATION_DAYS
from models import Payment, Subscription, SubscriptionPlan, SubscriptionPriceSnapshot


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def compute_monthly_price_from_package(package_value: Any, duration_months: int) -> float:
    """Стоимость одного месяца пакета: package_value / duration_months, 2 знака после запятой."""
    months = int(duration_months or 0)
    if months <= 0:
        return 0.0
    raw = _decimal(package_value) / Decimal(months)
    quantized = raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(quantized)


def _duration_from_payment_metadata(payment: Optional[Payment]) -> Optional[int]:
    if payment is None:
        return None
    meta = payment.payment_metadata or {}
    for key in ("selected_duration", "duration_months"):
        value = meta.get(key)
        if value in (1, 3, 6, 12, "1", "3", "6", "12"):
            return int(value)
    return None


def infer_duration_months_from_subscription(subscription: Optional[Subscription]) -> Optional[int]:
    """Срок пакета по датам подписки, привязанной к платежу (не текущей активной)."""
    if subscription is None:
        return None
    try:
        days = int((subscription.end_date - subscription.start_date).days)
    except Exception:
        return None

    best_months = None
    best_diff = 10**9
    for months, expected_days in DURATION_DAYS.items():
        diff = abs(days - expected_days)
        if diff < best_diff:
            best_diff = diff
            best_months = months
    if best_months is not None and best_diff <= 3:
        return int(best_months)
    return None


def _infer_duration_from_package_value(
    db,
    payment: Optional[Payment],
    package_value_dec: Decimal,
) -> Optional[int]:
    """
    Последний fallback для legacy-платежей без metadata/snapshot:
    сопоставить полную стоимость пакета с типовыми total_price плана.
    """
    if payment is None or not payment.plan_id or package_value_dec <= 0:
        return None

    plan = payment.plan
    if plan is None:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.plan_id).first()
    if plan is None:
        return None

    package_value = float(package_value_dec)
    candidates = []
    for months in (12, 6, 3, 1):
        if months == 1:
            monthly = float(getattr(plan, "price_1month", 0.0) or 0.0)
        elif months == 3:
            monthly = float(getattr(plan, "price_3months", 0.0) or 0.0)
        elif months == 6:
            monthly = float(getattr(plan, "price_6months", 0.0) or 0.0)
        else:
            monthly = float(getattr(plan, "price_12months", 0.0) or 0.0)
        expected_total = monthly * months
        candidates.append((abs(package_value - expected_total), months))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    best_diff, best_months = candidates[0]
    if best_diff <= 1.0:
        return int(best_months)
    return None


def _resolve_duration_months(
    db,
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot],
    subscription: Optional[Subscription],
    *,
    package_value_dec: Optional[Decimal] = None,
) -> int:
    """
    Срок купленного пакета — только данные момента покупки.

    Приоритет:
    1. payment_metadata.selected_duration / duration_months
    2. snapshot.duration_months
    3. legacy: package_value vs plan totals
    4. даты подписки, привязанной к платежу (DURATION_DAYS)
    """
    from_meta = _duration_from_payment_metadata(payment)
    if from_meta in (1, 3, 6, 12):
        return from_meta

    if snapshot and snapshot.duration_months in (1, 3, 6, 12):
        return int(snapshot.duration_months)

    if package_value_dec is not None:
        from_package = _infer_duration_from_package_value(db, payment, package_value_dec)
        if from_package in (1, 3, 6, 12):
            return int(from_package)

    from_subscription = infer_duration_months_from_subscription(subscription)
    if from_subscription in (1, 3, 6, 12):
        return int(from_subscription)

    return 1


def _resolve_snapshot(db, payment: Optional[Payment]) -> Optional[SubscriptionPriceSnapshot]:
    if payment is None:
        return None
    meta = payment.payment_metadata or {}
    calculation_id = meta.get("calculation_id")
    if not calculation_id:
        return None
    return (
        db.query(SubscriptionPriceSnapshot)
        .filter(
            SubscriptionPriceSnapshot.id == int(calculation_id),
            SubscriptionPriceSnapshot.user_id == payment.user_id,
        )
        .first()
    )


def _resolve_package_value_dec(
    snapshot: Optional[SubscriptionPriceSnapshot],
    subscription: Optional[Subscription],
    payment: Optional[Payment] = None,
) -> Decimal:
    if snapshot is not None:
        pbp = getattr(snapshot, "price_before_points", None)
        if pbp is not None:
            return _decimal(pbp)
        return _decimal(getattr(snapshot, "total_price", None))
    if subscription is not None:
        return _decimal(subscription.price)
    if payment is not None:
        return _decimal(payment.amount)
    return Decimal("0")


def resolve_subscription_payment_billing(
    db,
    *,
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot] = None,
    subscription: Optional[Subscription] = None,
    plan: Optional[SubscriptionPlan] = None,
) -> Dict[str, Any]:
    """
    Фактические параметры покупки для отображения.

    monthly_price = package_value / duration_months (Decimal, 2 знака).
    package_value — полная стоимость пакета.
    amount_paid — сумма, ушедшая в Robokassa (payment.amount).
    """
    if snapshot is None and payment is not None:
        snapshot = _resolve_snapshot(db, payment)

    if subscription is None and payment is not None and payment.subscription_id:
        subscription = payment.subscription

    package_value_dec = _resolve_package_value_dec(snapshot, subscription, payment)
    duration_months = _resolve_duration_months(
        db,
        payment,
        snapshot,
        subscription,
        package_value_dec=package_value_dec,
    )

    points_used = 0
    if snapshot is not None:
        points_used = int(getattr(snapshot, "subscription_points_used", 0) or 0)

    package_value = float(package_value_dec or Decimal("0"))
    amount_paid = float(_decimal(payment.amount)) if payment is not None else 0.0
    monthly_price = compute_monthly_price_from_package(package_value_dec or Decimal("0"), duration_months)

    plan_name = None
    plan_display_name = None
    if plan is not None:
        plan_name = plan.name
        plan_display_name = plan.display_name or plan.name
    elif payment is not None:
        meta = payment.payment_metadata or {}
        plan_name = meta.get("plan_name")
        plan_display_name = meta.get("plan_display_name") or plan_name
        if payment.plan_id and (not plan_name or not plan_display_name):
            linked_plan = payment.plan
            if linked_plan:
                plan_name = plan_name or linked_plan.name
                plan_display_name = plan_display_name or linked_plan.display_name or linked_plan.name

    subscription_start_date = subscription.start_date if subscription else None
    subscription_end_date = subscription.end_date if subscription else None

    status = payment.status if payment is not None else "unknown"
    subscription_apply_status = (
        payment.subscription_apply_status if payment is not None else None
    )
    is_successful_purchase = (
        status == "paid" and subscription_apply_status == "applied"
    )

    return {
        "duration_months": duration_months,
        "package_value": package_value,
        "amount_paid": amount_paid,
        "points_used": points_used,
        "monthly_price": monthly_price,
        "plan_name": plan_name,
        "plan_display_name": plan_display_name,
        "subscription_start_date": subscription_start_date,
        "subscription_end_date": subscription_end_date,
        "status": status,
        "subscription_apply_status": subscription_apply_status,
        "is_successful_purchase": is_successful_purchase,
        "paid_at": payment.paid_at if payment is not None else None,
        "public_id": payment.public_id if payment is not None else None,
        "payment_id": payment.id if payment is not None else None,
    }


def build_payment_history_item(db, payment: Payment) -> Dict[str, Any]:
    billing = resolve_subscription_payment_billing(db, payment=payment)
    return {
        "payment_id": payment.id,
        "public_id": payment.public_id,
        "paid_at": payment.paid_at or payment.created_at,
        "plan_name": billing["plan_name"],
        "plan_display_name": billing["plan_display_name"],
        "duration_months": billing["duration_months"],
        "amount_paid": billing["amount_paid"],
        "points_used": billing["points_used"],
        "package_value": billing["package_value"],
        "monthly_price": billing["monthly_price"],
        "subscription_start_date": billing["subscription_start_date"],
        "subscription_end_date": billing["subscription_end_date"],
        "status": billing["status"],
        "subscription_apply_status": billing["subscription_apply_status"],
        "is_successful_purchase": billing["is_successful_purchase"],
    }

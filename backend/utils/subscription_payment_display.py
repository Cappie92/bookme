"""Read-only расчёт стоимости подписки для UI (карточка тарифа, история оплат)."""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from constants import DURATION_DAYS, duration_months_to_days
from utils.subscription_billing_calc import (
    subscription_exclusive_end,
    to_display_period,
)
from models import (
    Master,
    Payment,
    PromoRewardGrant,
    PromoRewardGrantStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPriceSnapshot,
)


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


def _plan_monthly_price_dec(plan: SubscriptionPlan, duration_months: int) -> Decimal:
    months = int(duration_months or 0)
    if months == 1:
        return _decimal(getattr(plan, "price_1month", None))
    if months == 3:
        return _decimal(getattr(plan, "price_3months", None))
    if months == 6:
        return _decimal(getattr(plan, "price_6months", None))
    if months == 12:
        return _decimal(getattr(plan, "price_12months", None))
    return Decimal("0")


def _plan_package_total_dec(plan: SubscriptionPlan, duration_months: int) -> Decimal:
    monthly = _plan_monthly_price_dec(plan, duration_months)
    if monthly <= 0:
        return Decimal("0")
    return monthly * int(duration_months)


def _resolve_purchase_duration_months(
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot],
) -> Optional[int]:
    """Срок пакета только из данных момента покупки (metadata / snapshot)."""
    from_meta = _duration_from_payment_metadata(payment)
    if from_meta in (1, 3, 6, 12):
        return from_meta
    if snapshot and snapshot.duration_months in (1, 3, 6, 12):
        return int(snapshot.duration_months)
    return None


def _package_matches_plan_total(plan_total: Decimal, value: Decimal) -> bool:
    return plan_total > 0 and abs(value - plan_total) <= Decimal("1")


def _resolve_package_value_dec(
    db,
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot],
    subscription: Optional[Subscription],
    *,
    purchase_duration_months: Optional[int] = None,
    points_spent: int = 0,
) -> Decimal:
    """
    Полная стоимость пакета до списания баллов.

    Приоритет:
    1. snapshot.price_before_points
    2. snapshot.total_price + points (если total уже после баллов)
    3. total пакета из тарифа для duration_months
    4. subscription.price — только если совпадает с plan total
    5. payment.amount + points_spent (legacy)
    """
    points_dec = _decimal(points_spent)

    if snapshot is not None:
        pbp = getattr(snapshot, "price_before_points", None)
        if pbp is not None:
            return _decimal(pbp)

        snapshot_points = int(getattr(snapshot, "subscription_points_used", 0) or 0)
        total = _decimal(getattr(snapshot, "total_price", None))
        if snapshot_points > 0:
            return total + _decimal(snapshot_points)
        if points_spent > 0 and total > 0:
            candidate = total + points_dec
            if purchase_duration_months in (1, 3, 6, 12) and payment is not None and payment.plan_id:
                plan = payment.plan or db.query(SubscriptionPlan).filter(
                    SubscriptionPlan.id == payment.plan_id
                ).first()
                if plan is not None:
                    plan_total = _plan_package_total_dec(plan, int(purchase_duration_months))
                    if _package_matches_plan_total(plan_total, candidate):
                        return plan_total
            return candidate
        if total > 0:
            return total

    if purchase_duration_months in (1, 3, 6, 12) and payment is not None and payment.plan_id:
        plan = payment.plan
        if plan is None:
            plan = (
                db.query(SubscriptionPlan)
                .filter(SubscriptionPlan.id == payment.plan_id)
                .first()
            )
        if plan is not None:
            plan_total = _plan_package_total_dec(plan, int(purchase_duration_months))
            if plan_total > 0:
                if subscription is not None:
                    sub_price = _decimal(subscription.price)
                    if _package_matches_plan_total(plan_total, sub_price):
                        return sub_price
                return plan_total

    if subscription is not None:
        sub_price = _decimal(subscription.price)
        if purchase_duration_months in (1, 3, 6, 12) and payment is not None and payment.plan_id:
            plan = payment.plan or db.query(SubscriptionPlan).filter(
                SubscriptionPlan.id == payment.plan_id
            ).first()
            if plan is not None:
                plan_total = _plan_package_total_dec(plan, int(purchase_duration_months))
                if _package_matches_plan_total(plan_total, sub_price):
                    return sub_price
        if purchase_duration_months == 1 or purchase_duration_months is None:
            return sub_price

    if payment is not None:
        paid = _decimal(payment.amount)
        if paid > 0 or points_spent > 0:
            return paid + points_dec
    return Decimal("0")


def _resolve_master_id(db, payment: Optional[Payment]) -> Optional[int]:
    if payment is None:
        return None
    master = db.query(Master).filter(Master.user_id == payment.user_id).first()
    return master.id if master else None


def _resolve_points_spent(
    db,
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot],
    *,
    master_id: Optional[int] = None,
) -> int:
    points_spent = 0
    if master_id and payment is not None:
        debits = (
            db.query(SubscriptionPointsLedger)
            .filter(
                SubscriptionPointsLedger.master_id == master_id,
                SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
                SubscriptionPointsLedger.source_type == SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT,
                SubscriptionPointsLedger.source_id == payment.id,
            )
            .all()
        )
        points_spent = sum(int(getattr(entry, "amount", 0) or 0) for entry in debits)

    if points_spent == 0 and snapshot is not None:
        points_spent = int(getattr(snapshot, "subscription_points_used", 0) or 0)
    return points_spent


def _resolve_points_earned(
    db,
    payment: Optional[Payment],
    *,
    master_id: Optional[int] = None,
) -> int:
    if not master_id or payment is None:
        return 0

    grant_ids = [
        grant_id
        for (grant_id,) in db.query(PromoRewardGrant.id)
        .filter(
            PromoRewardGrant.payment_id == payment.id,
            PromoRewardGrant.recipient_master_id == master_id,
        )
        .all()
    ]
    points_earned = 0
    if grant_ids:
        credits = (
            db.query(SubscriptionPointsLedger)
            .filter(
                SubscriptionPointsLedger.master_id == master_id,
                SubscriptionPointsLedger.direction == SubscriptionPointsDirection.CREDIT,
                SubscriptionPointsLedger.source_type == SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
                SubscriptionPointsLedger.source_id.in_(grant_ids),
            )
            .all()
        )
        points_earned = sum(int(getattr(entry, "amount", 0) or 0) for entry in credits)

    if points_earned == 0:
        grants = (
            db.query(PromoRewardGrant)
            .filter(
                PromoRewardGrant.payment_id == payment.id,
                PromoRewardGrant.recipient_master_id == master_id,
                PromoRewardGrant.status == PromoRewardGrantStatus.APPLIED,
            )
            .all()
        )
        points_earned = sum(
            int(getattr(grant, "points_amount", 0) or 0)
            for grant in grants
            if not getattr(grant, "subscription_points_ledger_id", None)
        )

    return points_earned


def _resolve_points_movements(
    db,
    payment: Optional[Payment],
    snapshot: Optional[SubscriptionPriceSnapshot],
    *,
    master_id: Optional[int] = None,
) -> tuple[int, int]:
    points_spent = _resolve_points_spent(
        db, payment, snapshot, master_id=master_id
    )
    points_earned = _resolve_points_earned(db, payment, master_id=master_id)
    return points_spent, points_earned


def _as_naive_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value
    return None


def reconstruct_sequential_subscription_periods(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Display-only: выстраивает успешные покупки в непрерывную цепочку периодов.

    Не изменяет данные в БД — только корректирует start/end для истории оплат.
    """
    successful = sorted(
        [item for item in items if item.get("is_successful_purchase")],
        key=lambda item: (
            _as_naive_datetime(item.get("paid_at")) or datetime.min,
            item.get("payment_id") or 0,
        ),
    )
    chain_end: Optional[datetime] = None
    period_by_payment_id: Dict[int, tuple[datetime, datetime]] = {}

    for item in successful:
        duration_months = int(item.get("duration_months") or 1)
        duration_days = duration_months_to_days(duration_months)
        if chain_end is None:
            start = _as_naive_datetime(item.get("subscription_start_date")) or _as_naive_datetime(
                item.get("paid_at")
            )
        else:
            start = chain_end
        if start is None:
            continue
        end_exclusive = subscription_exclusive_end(start, duration_days)
        chain_end = end_exclusive
        payment_id = item.get("payment_id")
        if payment_id is not None:
            display_start, display_end = to_display_period(start, end_exclusive)
            period_by_payment_id[int(payment_id)] = (display_start, display_end)

    result: List[Dict[str, Any]] = []
    for item in items:
        updated = dict(item)
        payment_id = updated.get("payment_id")
        if payment_id is not None and int(payment_id) in period_by_payment_id:
            start, end = period_by_payment_id[int(payment_id)]
            updated["subscription_start_date"] = start
            updated["subscription_end_date"] = end
        result.append(updated)
    return result


def resolve_applied_subscription_payment(
    db,
    *,
    user_id: int,
    subscription_id: int,
) -> Optional[Payment]:
    """
    Последний успешный платёж, применивший подписку (paid + applied).
    """
    return (
        db.query(Payment)
        .filter(
            Payment.user_id == user_id,
            Payment.payment_type == "subscription",
            Payment.subscription_id == subscription_id,
            Payment.status == "paid",
            Payment.subscription_apply_status == "applied",
        )
        .order_by(Payment.paid_at.desc().nullslast(), Payment.id.desc())
        .first()
    )


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

    purchase_duration_months = _resolve_purchase_duration_months(payment, snapshot)

    master_id = _resolve_master_id(db, payment)
    points_spent, points_earned = _resolve_points_movements(
        db,
        payment,
        snapshot,
        master_id=master_id,
    )

    package_value_dec = _resolve_package_value_dec(
        db,
        payment,
        snapshot,
        subscription,
        purchase_duration_months=purchase_duration_months,
        points_spent=points_spent,
    )
    duration_months = _resolve_duration_months(
        db,
        payment,
        snapshot,
        subscription,
        package_value_dec=package_value_dec,
    )

    points_used = points_spent

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
    if subscription_start_date and subscription_end_date:
        _, subscription_end_date = to_display_period(subscription_start_date, subscription_end_date)

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
        "points_spent": points_spent,
        "points_earned": points_earned,
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
        "points_spent": billing["points_spent"],
        "points_earned": billing["points_earned"],
        "package_value": billing["package_value"],
        "monthly_price": billing["monthly_price"],
        "subscription_start_date": billing["subscription_start_date"],
        "subscription_end_date": billing["subscription_end_date"],
        "status": billing["status"],
        "subscription_apply_status": billing["subscription_apply_status"],
        "is_successful_purchase": billing["is_successful_purchase"],
    }


def build_subscription_payment_history(db, payments: List[Payment]) -> List[Dict[str, Any]]:
    items = [build_payment_history_item(db, payment) for payment in payments]
    return reconstruct_sequential_subscription_periods(items)

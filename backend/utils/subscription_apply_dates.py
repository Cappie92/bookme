"""Расчёт дат новой подписки при успешном apply (Robokassa, баланс)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import union_all

from constants import duration_months_to_days
from models import (
    Payment,
    Subscription,
    SubscriptionPriceSnapshot,
    SubscriptionStatus,
    SubscriptionType,
)


def _as_naive_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def _applied_subscription_ids_subquery(db, user_id: int):
    via_payment = (
        db.query(Payment.subscription_id.label("subscription_id"))
        .filter(
            Payment.user_id == user_id,
            Payment.status == "paid",
            Payment.subscription_apply_status == "applied",
            Payment.subscription_id.isnot(None),
        )
    )
    via_snapshot = (
        db.query(SubscriptionPriceSnapshot.applied_subscription_id.label("subscription_id"))
        .filter(
            SubscriptionPriceSnapshot.user_id == user_id,
            SubscriptionPriceSnapshot.applied_subscription_id.isnot(None),
        )
    )
    return union_all(via_payment, via_snapshot).subquery()


def get_latest_subscription_chain_end(
    db,
    *,
    user_id: int,
    subscription_type: SubscriptionType,
    plan_id: int,
    exclude_subscription_id: Optional[int] = None,
) -> Optional[datetime]:
    """
    Максимальный end_date среди применённых подписок того же тарифа.

    Учитываются только:
    - user_id + subscription_type + plan_id;
    - подписки, привязанные к успешно применённому payment или snapshot;
    - status != cancelled;
    - end_date IS NOT NULL.
    """
    applied_ids = _applied_subscription_ids_subquery(db, user_id)

    query = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.subscription_type == subscription_type,
            Subscription.plan_id == int(plan_id),
            Subscription.end_date.isnot(None),
            Subscription.status != SubscriptionStatus.CANCELLED,
            Subscription.id.in_(db.query(applied_ids.c.subscription_id)),
        )
    )
    if exclude_subscription_id is not None:
        query = query.filter(Subscription.id != int(exclude_subscription_id))

    chain_tip = query.order_by(Subscription.end_date.desc(), Subscription.id.desc()).first()
    if chain_tip is None:
        return None
    return _as_naive_datetime(chain_tip.end_date)


def _is_same_plan_renewal(
    plan_id: int,
    current_subscription: Optional[Subscription],
) -> bool:
    if current_subscription is None or current_subscription.plan_id is None:
        return False
    return int(current_subscription.plan_id) == int(plan_id)


def _is_same_plan_extension_without_active_current(
    db,
    *,
    user_id: int,
    subscription_type: SubscriptionType,
    plan_id: int,
    current_subscription: Optional[Subscription],
) -> bool:
    if current_subscription is not None:
        return False
    chain_end = get_latest_subscription_chain_end(
        db,
        user_id=user_id,
        subscription_type=subscription_type,
        plan_id=plan_id,
    )
    return chain_end is not None


def resolve_new_subscription_start_date(
    db,
    *,
    user_id: int,
    subscription_type: SubscriptionType,
    plan_id: int,
    effective_upgrade_type: str,
    current_subscription: Optional[Subscription],
    now: datetime,
    exclude_subscription_id: Optional[int] = None,
) -> datetime:
    """
    Начало новой подписки.

    - повторная покупка того же plan_id → конец цепочки (если end_date > now);
    - смена тарифа + after_expiry/downgrade → end_date текущей подписки;
    - смена тарифа + immediate → now;
    - иначе → now.
    """
    now_naive = _as_naive_datetime(now) or datetime.utcnow()
    upgrade_type = (effective_upgrade_type or "immediate").strip().lower()

    same_plan = _is_same_plan_renewal(plan_id, current_subscription) or _is_same_plan_extension_without_active_current(
        db,
        user_id=user_id,
        subscription_type=subscription_type,
        plan_id=plan_id,
        current_subscription=current_subscription,
    )

    if same_plan:
        chain_end = get_latest_subscription_chain_end(
            db,
            user_id=user_id,
            subscription_type=subscription_type,
            plan_id=plan_id,
            exclude_subscription_id=exclude_subscription_id,
        )
        if chain_end is not None and chain_end > now_naive:
            return chain_end
        return now_naive

    if upgrade_type == "after_expiry" and current_subscription is not None:
        current_end = _as_naive_datetime(current_subscription.end_date)
        if current_end is not None:
            return current_end

    return now_naive


def resolve_new_subscription_period(
    db,
    *,
    user_id: int,
    subscription_type: SubscriptionType,
    plan_id: int,
    duration_months: int,
    effective_upgrade_type: str,
    current_subscription: Optional[Subscription],
    now: datetime,
    exclude_subscription_id: Optional[int] = None,
) -> tuple[datetime, datetime, SubscriptionStatus, bool]:
    """start_date, end_date, status, is_active для новой подписки."""
    start_date = resolve_new_subscription_start_date(
        db,
        user_id=user_id,
        subscription_type=subscription_type,
        plan_id=plan_id,
        effective_upgrade_type=effective_upgrade_type,
        current_subscription=current_subscription,
        now=now,
        exclude_subscription_id=exclude_subscription_id,
    )
    duration_days = max(1, duration_months_to_days(int(duration_months or 1)))
    end_date = start_date + timedelta(days=duration_days)
    now_naive = _as_naive_datetime(now) or datetime.utcnow()
    will_start_now = start_date <= now_naive
    status = SubscriptionStatus.ACTIVE if will_start_now else SubscriptionStatus.PENDING
    is_active = will_start_now
    return start_date, end_date, status, is_active

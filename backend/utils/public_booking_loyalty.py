"""
Расчёт баллов для публичной записи: после скидки, с учётом активных резервов на booking.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Booking, BookingStatus
from utils.loyalty import calculate_client_balance, get_loyalty_settings

# Резерв баллов ещё «держится» на записи до завершения визита или отмены.
_LOYALTY_RESERVE_STATUSES = (
    BookingStatus.CREATED.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.AWAITING_CONFIRMATION.value,
    BookingStatus.AWAITING_PAYMENT.value,
)


def sum_active_loyalty_reserved_points(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    exclude_booking_id: Optional[int] = None,
) -> int:
    q = db.query(func.coalesce(func.sum(Booking.loyalty_points_used), 0)).filter(
        Booking.client_id == client_id,
        Booking.master_id == master_id,
        Booking.status.in_(_LOYALTY_RESERVE_STATUSES),
    )
    if exclude_booking_id is not None:
        q = q.filter(Booking.id != exclude_booking_id)
    return int(q.scalar() or 0)


def effective_available_points(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    exclude_booking_id: Optional[int] = None,
) -> int:
    ledger = int(calculate_client_balance(db, master_id, client_id))
    reserved = sum_active_loyalty_reserved_points(
        db, master_id=master_id, client_id=client_id, exclude_booking_id=exclude_booking_id
    )
    return max(0, ledger - reserved)


def compute_points_to_use_after_discount(
    discounted_price: float,
    effective_available: int,
    max_payment_percent: Optional[int],
) -> int:
    """1 балл = 1 ₽; лимит по max_payment_percent (None = 100%)."""
    if discounted_price <= 0 or effective_available <= 0:
        return 0
    pct = 100 if max_payment_percent is None else int(max_payment_percent)
    pct = max(0, min(100, pct))
    max_by_pct = float(discounted_price) * (pct / 100.0)
    raw = min(float(effective_available), float(discounted_price), max_by_pct)
    return int(raw)


def build_public_booking_price_preview_loyalty(
    db: Session,
    *,
    master_id: int,
    client_id: Optional[int],
    discounted_price: float,
    use_loyalty_points: bool,
) -> Dict[str, Any]:
    """
    Поля для расширенного preview: available_points = effective (ledger минус активные резервы).
    """
    dp = max(0.0, float(discounted_price))
    if not client_id:
        return {
            "available_points": 0,
            "max_payment_percent": None,
            "loyalty_points_to_use": 0,
            "amount_to_pay": dp,
            "points_payment_available": False,
            "use_loyalty_points": False,
            "loyalty_program_enabled": False,
        }

    settings = get_loyalty_settings(db, master_id)
    max_pct = settings.max_payment_percent if settings else None
    program_enabled = bool(settings and settings.is_enabled)
    effective = effective_available_points(db, master_id=master_id, client_id=client_id)
    # Списание уже накопленных баллов не зависит от is_enabled; лимит max_payment_percent из строки настроек,
    # если она есть; при отсутствии строки — 100% (max_pct=None в compute).
    can_pay = effective > 0 and dp > 0
    apply_pts = bool(use_loyalty_points) and can_pay
    pts = (
        compute_points_to_use_after_discount(dp, effective, max_pct)
        if apply_pts
        else 0
    )
    money = max(0.0, dp - float(pts))
    return {
        "available_points": effective,
        "max_payment_percent": max_pct,
        "loyalty_points_to_use": int(pts),
        "amount_to_pay": money,
        "points_payment_available": can_pay,
        "use_loyalty_points": bool(use_loyalty_points) and apply_pts,
        "loyalty_program_enabled": program_enabled,
    }


def compute_public_create_loyalty_points_used(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    discounted_price: float,
    use_loyalty_points: bool,
) -> int:
    """Только целое loyalty_points_used для записи в Booking (пересчёт на сервере)."""
    row = build_public_booking_price_preview_loyalty(
        db,
        master_id=master_id,
        client_id=client_id,
        discounted_price=discounted_price,
        use_loyalty_points=use_loyalty_points,
    )
    return int(row.get("loyalty_points_to_use") or 0)

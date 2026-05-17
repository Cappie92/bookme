"""
Идемпотентная финализация визита: списание зарезервированных баллов, BookingConfirmation, Income,
начисление баллов с суммы денег, service_based расходы. Общая точка для confirm-booking,
update-booking-status → completed и confirm-all.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    Income,
    LoyaltyTransaction,
    MasterExpense,
)
from utils.loyalty import earn_points, get_loyalty_settings, spend_points

logger = logging.getLogger(__name__)


def _loyalty_spent_exists(db: Session, booking_id: int) -> bool:
    return (
        db.query(LoyaltyTransaction.id)
        .filter(
            LoyaltyTransaction.booking_id == booking_id,
            LoyaltyTransaction.transaction_type == "spent",
        )
        .first()
        is not None
    )


def _loyalty_earned_exists(db: Session, booking_id: int) -> bool:
    return (
        db.query(LoyaltyTransaction.id)
        .filter(
            LoyaltyTransaction.booking_id == booking_id,
            LoyaltyTransaction.transaction_type == "earned",
        )
        .first()
        is not None
    )


def finalize_post_visit_booking(
    db: Session,
    *,
    booking: Booking,
    master_row_id: int,
    master_user_id: int,
    require_past_start: bool = True,
) -> Dict[str, Any]:
    """
    Создаёт BookingConfirmation + Income, списывает баллы (если были зарезервированы), начисляет earned.
    Идемпотентно по наличию BookingConfirmation.
    """
    if require_past_start and booking.start_time > datetime.utcnow():
        raise ValueError("Нельзя подтвердить будущую запись.")

    existing_confirmation = (
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking.id).first()
    )
    if existing_confirmation:
        if booking.status != BookingStatus.COMPLETED:
            booking.status = BookingStatus.COMPLETED
        return {
            "already": True,
            "confirmed_income": float(existing_confirmation.confirmed_income),
            "message": "Услуга уже подтверждена",
            "points_spent": int(booking.loyalty_points_used or 0) if _loyalty_spent_exists(db, booking.id) else 0,
            "expenses_created": 0,
        }

    points_reserved = int(booking.loyalty_points_used or 0)
    points_spent = 0
    if points_reserved > 0 and booking.client_id:
        if _loyalty_spent_exists(db, booking.id):
            points_spent = points_reserved
        else:
            spend_points(
                db=db,
                master_id=master_row_id,
                client_id=booking.client_id,
                amount=float(points_reserved),
                booking_id=booking.id,
            )
            points_spent = points_reserved
            logger.info("Списано %s баллов для записи %s", points_spent, booking.id)

    actual_payment_amount = max(0.0, float(booking.payment_amount or 0) - float(points_spent or 0))

    confirmation = BookingConfirmation(
        booking_id=booking.id,
        master_id=master_user_id,
        confirmed_income=actual_payment_amount,
    )
    db.add(confirmation)

    income = Income(
        indie_master_id=None,
        booking_id=booking.id,
        total_amount=actual_payment_amount,
        master_earnings=actual_payment_amount,
        salon_earnings=0,
        income_date=datetime.utcnow().date(),
        service_date=booking.start_time.date(),
    )
    db.add(income)

    if booking.client_id and not _loyalty_earned_exists(db, booking.id):
        loyalty_settings = get_loyalty_settings(db, master_row_id)
        if loyalty_settings and loyalty_settings.is_enabled and loyalty_settings.accrual_percent:
            amount_for_points = actual_payment_amount
            points_to_earn = int(amount_for_points * (loyalty_settings.accrual_percent / 100))
            if points_to_earn > 0:
                try:
                    earn_points(
                        db=db,
                        master_id=master_row_id,
                        client_id=booking.client_id,
                        amount=float(points_to_earn),
                        booking_id=booking.id,
                        service_id=booking.service_id,
                        lifetime_days=loyalty_settings.points_lifetime_days,
                    )
                    logger.info("Начислено %s баллов для записи %s", points_to_earn, booking.id)
                except Exception as e:
                    logger.error("Ошибка при начислении баллов для записи %s: %s", booking.id, e)

    service_expenses = (
        db.query(MasterExpense)
        .filter(
            MasterExpense.master_id == master_user_id,
            MasterExpense.expense_type == "service_based",
            MasterExpense.service_id == booking.service_id,
            MasterExpense.is_active == True,
        )
        .all()
    )
    expenses_created = 0
    for template in service_expenses:
        expense_record = MasterExpense(
            master_id=master_user_id,
            name=f"{template.name} (услуга #{booking.id})",
            expense_type="one_time",
            amount=template.amount,
            expense_date=datetime.utcnow(),
        )
        db.add(expense_record)
        expenses_created += 1

    booking.status = BookingStatus.COMPLETED

    return {
        "already": False,
        "confirmed_income": actual_payment_amount,
        "points_spent": points_spent,
        "expenses_created": expenses_created,
        "message": "Услуга успешно подтверждена",
    }

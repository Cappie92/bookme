"""
Утилиты для работы со статусами бронирований.
"""

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session
from models import Booking, BookingStatus

if TYPE_CHECKING:
    from models import Master


def get_effective_booking_status(booking: Booking, db: Session, now: Optional[datetime] = None) -> BookingStatus:
    """
    Вычисляет актуальный (effective) статус записи с учётом времени.
    НЕ мутирует объект booking — возвращает только вычисленное значение.

    Логика:
    - Будущая запись (start_time > now): никогда awaiting_confirmation.
      Legacy: будущая + awaiting_confirmation в БД → возвращаем CONFIRMED.
    - Прошлая CREATED (start_time + 1min < now): AWAITING_CONFIRMATION (needs post-visit outcome).
    - CONFIRMED, COMPLETED, CANCELLED: возвращаем как есть.

    Args:
        booking: Объект бронирования
        db: Сессия базы данных
        now: Время для сравнения (по умолчанию utcnow), для тестов

    Returns:
        Effective статус (локальная переменная, объект не изменяется)
    """
    current_time = now or datetime.utcnow()
    is_future = booking.start_time > current_time

    # Legacy: будущая запись с awaiting_confirmation в БД — трактуем как confirmed.
    # "На подтверждение" только для post-visit (прошлые записи).
    if booking.status == BookingStatus.AWAITING_CONFIRMATION and is_future:
        return BookingStatus.CONFIRMED

    # CONFIRMED, COMPLETED, CANCELLED и др. — без изменений
    if booking.status != BookingStatus.CREATED:
        return booking.status

    # CREATED: только для прошлых — переводим в awaiting_confirmation (needs outcome)
    transition_time = booking.start_time + timedelta(minutes=1)
    if current_time >= transition_time:
        return BookingStatus.AWAITING_CONFIRMATION
    return BookingStatus.CREATED


def is_post_visit_outcome_pending_for_past_list(
    booking: Booking,
    master: Optional["Master"],
    db: Session,
    now: Optional[datetime] = None,
) -> bool:
    """
    Совпадает с web/mobile bookingOutcome.needsOutcome для записи уже в прошлом
    (ожидается start_time < now у вызывающего контекста, напр. past-appointments).

    Используется для документации и тестов; сортировка в SQL использует эквивалентное
    правило по «сырому» статусу в БД для прошлых строк (см. комментарий в master.py).
    """
    if master is None:
        return False
    if master.auto_confirm_bookings is True:
        return False
    t = now or datetime.utcnow()
    if booking.start_time >= t:
        return False
    eff = get_effective_booking_status(booking, db, now)
    return eff in (
        BookingStatus.CREATED,
        BookingStatus.CONFIRMED,
        BookingStatus.AWAITING_CONFIRMATION,
    )


def apply_effective_status_to_bookings(bookings: list[Booking], db: Session) -> None:
    """
    Применяет get_effective_booking_status ко всем бронированиям в списке.
    Обновляет booking.status в памяти для формирования ответа API (не коммитит в БД).
    Мутация происходит здесь, не в get_effective_booking_status.
    """
    for booking in bookings:
        effective = get_effective_booking_status(booking, db)
        booking.status = effective


def get_cancellation_reasons() -> dict[str, str]:
    """
    Возвращает словарь с доступными причинами отмены.
    
    Returns:
        Словарь {значение: описание}
    """
    return {
        "client_requested": "Клиент попросил отменить",
        "client_no_show": "Клиент не пришел на запись", 
        "mutual_agreement": "Обоюдное согласие",
        "master_unavailable": "Мастер не может оказать услугу"
    }


def get_status_display_name(status: BookingStatus) -> str:
    """
    Возвращает отображаемое название статуса на русском языке.
    
    Args:
        status: Статус бронирования
        
    Returns:
        Отображаемое название статуса
    """
    status_names = {
        BookingStatus.CREATED: "Создана",
        BookingStatus.CONFIRMED: "Подтверждено",
        BookingStatus.AWAITING_CONFIRMATION: "На подтверждение",
        BookingStatus.COMPLETED: "Завершено",
        BookingStatus.CANCELLED: "Отменена",
        BookingStatus.AWAITING_PAYMENT: "Ожидает оплаты",
        BookingStatus.PAYMENT_EXPIRED: "Время оплаты истекло"
    }
    return status_names.get(status, str(status))


def is_status_transition_allowed(from_status: BookingStatus, to_status: BookingStatus) -> bool:
    """
    Проверяет, разрешен ли переход между статусами.
    
    Args:
        from_status: Исходный статус
        to_status: Целевой статус
        
    Returns:
        True если переход разрешен, False иначе
    """
    # Разрешенные переходы
    allowed_transitions = {
        BookingStatus.CREATED: [BookingStatus.CONFIRMED, BookingStatus.AWAITING_CONFIRMATION, BookingStatus.CANCELLED],
        BookingStatus.CONFIRMED: [BookingStatus.CANCELLED],
        BookingStatus.AWAITING_CONFIRMATION: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
        BookingStatus.COMPLETED: [],  # Завершенные записи нельзя изменить
        BookingStatus.CANCELLED: [],  # Отмененные записи нельзя изменить
        BookingStatus.AWAITING_PAYMENT: [BookingStatus.CANCELLED, BookingStatus.COMPLETED],
        BookingStatus.PAYMENT_EXPIRED: [BookingStatus.CANCELLED]
    }
    
    return to_status in allowed_transitions.get(from_status, [])

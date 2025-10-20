"""
Утилиты для работы со статусами бронирований.
"""

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import Booking, BookingStatus


def get_effective_booking_status(booking: Booking, db: Session) -> BookingStatus:
    """
    Вычисляет актуальный статус записи с учетом времени.
    Обновляет статус в объекте (не коммитит в БД).
    
    Логика:
    - Если статус CREATED и прошло > 1 минуты после start_time,
      возвращаем AWAITING_CONFIRMATION
    - Остальные статусы возвращаем как есть
    
    Args:
        booking: Объект бронирования
        db: Сессия базы данных
        
    Returns:
        Актуальный статус бронирования
    """
    current_time = datetime.utcnow()
    
    # Если статус CREATED и прошло > 1 минуты после start_time
    if booking.status == BookingStatus.CREATED:
        transition_time = booking.start_time + timedelta(minutes=1)
        if current_time >= transition_time:
            # Возвращаем AWAITING_CONFIRMATION (обновляем в объекте)
            booking.status = BookingStatus.AWAITING_CONFIRMATION
            return BookingStatus.AWAITING_CONFIRMATION
    
    return booking.status


def apply_effective_status_to_bookings(bookings: list[Booking], db: Session) -> None:
    """
    Применяет get_effective_booking_status ко всем бронированиям в списке.
    Обновляет статусы в памяти (не коммитит в БД).
    
    Args:
        bookings: Список бронирований
        db: Сессия базы данных
    """
    for booking in bookings:
        booking.status = get_effective_booking_status(booking, db)


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
        BookingStatus.AWAITING_CONFIRMATION: "На подтверждение",
        BookingStatus.COMPLETED: "Подтверждена",
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
        BookingStatus.CREATED: [BookingStatus.AWAITING_CONFIRMATION, BookingStatus.CANCELLED],
        BookingStatus.AWAITING_CONFIRMATION: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
        BookingStatus.COMPLETED: [],  # Завершенные записи нельзя изменить
        BookingStatus.CANCELLED: [],  # Отмененные записи нельзя изменить
        BookingStatus.AWAITING_PAYMENT: [BookingStatus.CANCELLED, BookingStatus.COMPLETED],
        BookingStatus.PAYMENT_EXPIRED: [BookingStatus.CANCELLED]
    }
    
    return to_status in allowed_transitions.get(from_status, [])

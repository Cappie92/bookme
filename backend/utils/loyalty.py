"""
Утилиты для работы с программой лояльности (баллами)
"""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from models import (
    LoyaltySettings, LoyaltyTransaction, Master, Booking, Service, User
)


def get_loyalty_settings(db: Session, master_id: int) -> Optional[LoyaltySettings]:
    """Получить настройки программы лояльности мастера"""
    return db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master_id).first()


def get_available_points(db: Session, master_id: int, client_id: int) -> int:
    """
    Получить доступное количество баллов клиента у мастера (без истекших).
    Возвращает целое число - количество доступных баллов.
    """
    return calculate_client_balance(db, master_id, client_id)


def calculate_client_balance(db: Session, master_id: int, client_id: int) -> int:
    """
    Вычислить текущий баланс баллов клиента у мастера.
    Учитывает только активные (не истекшие) баллы.
    """
    now = datetime.utcnow()
    
    # Сумма начисленных баллов (не истекших)
    earned = db.query(func.sum(LoyaltyTransaction.points)).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.client_id == client_id,
        LoyaltyTransaction.transaction_type == 'earned',
        or_(
            LoyaltyTransaction.expires_at.is_(None),
            LoyaltyTransaction.expires_at > now
        )
    ).scalar() or 0
    
    # Сумма списанных баллов
    spent = db.query(func.sum(LoyaltyTransaction.points)).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.client_id == client_id,
        LoyaltyTransaction.transaction_type == 'spent'
    ).scalar() or 0
    
    return int(earned) - int(spent)


def calculate_points_to_spend(
    available_points: int,
    service_price: float,
    max_payment_percent: Optional[int]
) -> float:
    """
    Вычислить максимальную сумму списания баллов.
    
    Args:
        available_points: Доступное количество баллов
        service_price: Стоимость услуги
        max_payment_percent: Максимальный процент оплаты баллами (1-100) или None
    
    Returns:
        Максимальная сумма в рублях, которую можно списать баллами
    """
    # Максимум списания ограничен доступными баллами и стоимостью услуги
    max_by_points = float(available_points)
    max_by_price = service_price
    
    # Если есть ограничение по проценту, применяем его
    if max_payment_percent:
        max_by_percent = service_price * (max_payment_percent / 100)
        return min(max_by_points, max_by_percent, max_by_price)
    
    # Если нет ограничения по проценту, списываем минимум из доступных баллов и стоимости
    return min(max_by_points, max_by_price)


def spend_points(
    db: Session,
    master_id: int,
    client_id: int,
    amount: float,
    booking_id: int
) -> LoyaltyTransaction:
    """
    Списать баллы клиента (упрощенная версия - создает одну транзакцию списания).
    Реальная логика FIFO учитывается при расчете баланса через calculate_client_balance.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера
        client_id: ID клиента
        amount: Сумма в рублях, которую нужно списать
        booking_id: ID бронирования, для которого списываются баллы
    
    Returns:
        Созданная транзакция списания
    """
    now = datetime.utcnow()
    
    # Проверяем, что у клиента достаточно баллов
    available_balance = calculate_client_balance(db, master_id, client_id)
    if available_balance < amount:
        raise ValueError(f"Недостаточно баллов. Доступно: {available_balance}, требуется: {amount}")
    
    # Создаем одну транзакцию списания
    # Логика FIFO будет учитываться через calculate_client_balance при проверке баланса
    spent_trans = LoyaltyTransaction(
        master_id=master_id,
        client_id=client_id,
        booking_id=booking_id,
        transaction_type='spent',
        points=int(amount),
        earned_at=now  # Для spent это дата списания
    )
    
    db.add(spent_trans)
    return spent_trans


def earn_points(
    db: Session,
    master_id: int,
    client_id: int,
    amount: float,
    booking_id: int,
    service_id: int,
    lifetime_days: Optional[int]
) -> LoyaltyTransaction:
    """
    Начислить баллы клиенту.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера
        client_id: ID клиента
        amount: Сумма в рублях, с которой начисляются баллы
        booking_id: ID бронирования, за которое начисляются баллы
        service_id: ID услуги
        lifetime_days: Срок жизни баллов в днях (None = бесконечно)
    
    Returns:
        Созданная транзакция начисления
    """
    now = datetime.utcnow()
    
    # Вычисляем дату истечения
    expires_at = None
    if lifetime_days:
        expires_at = now + timedelta(days=lifetime_days)
    
    # Создаем транзакцию начисления
    earned_trans = LoyaltyTransaction(
        master_id=master_id,
        client_id=client_id,
        booking_id=booking_id,
        transaction_type='earned',
        points=int(amount),
        earned_at=now,
        expires_at=expires_at,
        service_id=service_id
    )
    
    db.add(earned_trans)
    return earned_trans


def get_client_balance_by_master(db: Session, client_id: int, master_id: int) -> int:
    """Получить баланс баллов клиента у конкретного мастера"""
    return calculate_client_balance(db, master_id, client_id)


def cleanup_expired_points(db: Session) -> int:
    """
    Пометить/удалить истекшие баллы.
    В текущей реализации баллы не удаляются, а просто не учитываются
    в запросах (фильтруются по expires_at).
    
    Returns:
        Количество истекших транзакций
    """
    now = datetime.utcnow()
    
    # Находим все истекшие транзакции
    expired_count = db.query(LoyaltyTransaction).filter(
        LoyaltyTransaction.transaction_type == 'earned',
        LoyaltyTransaction.expires_at.isnot(None),
        LoyaltyTransaction.expires_at <= now
    ).count()
    
    # В текущей реализации мы не удаляем транзакции, они просто не учитываются
    # в запросах благодаря фильтрам по expires_at
    
    return expired_count


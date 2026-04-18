"""
Утилиты для работы с автоматическими ограничениями клиентов.
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from models import (
    ClientRestriction, 
    ClientRestrictionRule, 
    Booking, 
    BookingStatus,
    MasterPaymentSettings
)


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


def count_cancellations_by_reason(
    db: Session, 
    master_id: int, 
    client_id: int, 
    cancellation_reason: str, 
    period_days: Optional[int] = None,
    indie_master_id: Optional[int] = None
) -> int:
    """
    Подсчитывает количество отмен с указанной причиной за период.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера (из таблицы masters)
        client_id: ID клиента
        cancellation_reason: Причина отмены
        period_days: Период проверки в днях (None = все время)
        indie_master_id: ID индивидуального мастера (опционально)
    
    Returns:
        Количество отмен
    """
    # Формируем условие для поиска по master_id или indie_master_id
    master_condition = Booking.master_id == master_id
    if indie_master_id:
        master_condition = or_(Booking.master_id == master_id, Booking.indie_master_id == indie_master_id)
    
    query = db.query(func.count(Booking.id)).filter(
        master_condition,
        Booking.client_id == client_id,
        Booking.status == BookingStatus.CANCELLED.value,
        Booking.cancellation_reason == cancellation_reason
    )
    
    if period_days is not None:
        # Скользящее окно от сегодня назад на period_days дней
        today = datetime.utcnow().date()
        start_date = datetime.combine(today - timedelta(days=period_days), datetime.min.time())
        end_date = datetime.combine(today, datetime.max.time())
        
        query = query.filter(
            Booking.created_at >= start_date,
            Booking.created_at <= end_date
        )
    
    return query.scalar() or 0


def validate_restriction_rule(
    db: Session, 
    master_id: int, 
    rule_data: dict,
    exclude_rule_id: Optional[int] = None
) -> Tuple[bool, Optional[str]]:
    """
    Проверяет, что правило не противоречит существующим.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера
        rule_data: Данные правила (cancellation_reason, cancel_count, restriction_type)
        exclude_rule_id: ID правила, которое нужно исключить из проверки (для обновления)
    
    Returns:
        (is_valid, error_message)
    """
    cancellation_reason = rule_data.get('cancellation_reason')
    cancel_count = rule_data.get('cancel_count')
    restriction_type = rule_data.get('restriction_type')
    
    # Если это правило для предоплаты, проверяем что нет правил для черного списка
    # с той же причиной и меньшим или равным количеством отмен
    if restriction_type == 'advance_payment_only':
        query = db.query(ClientRestrictionRule).filter(
            ClientRestrictionRule.master_id == master_id,
            ClientRestrictionRule.cancellation_reason == cancellation_reason,
            ClientRestrictionRule.restriction_type == 'blacklist',
            ClientRestrictionRule.cancel_count <= cancel_count
        )
        
        if exclude_rule_id:
            query = query.filter(ClientRestrictionRule.id != exclude_rule_id)
        
        conflicting_rule = query.first()
        
        if conflicting_rule:
            return False, (
                f"Правило предоплаты не может требовать больше или равное количество отмен ({cancel_count}), "
                f"чем правило черного списка ({conflicting_rule.cancel_count}) для той же причины отмены."
            )
    
    return True, None


def check_client_restrictions(
    db: Session, 
    master_id: int, 
    client_id: Optional[int], 
    client_phone: str
) -> dict:
    """
    Проверяет ограничения клиента перед бронированием.
    
    Args:
        db: Сессия базы данных
        master_id: ID мастера (из таблицы masters)
        client_id: ID клиента (может быть None для незарегистрированных)
        client_phone: Номер телефона клиента
    
    Returns:
        Словарь с результатами проверки:
        - is_blocked (bool): заблокирован ли клиент
        - requires_advance_payment (bool): требуется ли предоплата
        - reason (str): причина ограничения
        - applied_rule_id (int, optional): ID применившегося правила
    """
    from models import Master, IndieMaster
    from utils.master_canon import LEGACY_INDIE_MODE

    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        return {
            'is_blocked': False,
            'requires_advance_payment': False,
            'reason': None,
            'applied_rule_id': None
        }

    indie_master_id = None
    if LEGACY_INDIE_MODE:
        indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        indie_master_id = indie_master.id if indie_master else None

    # 1. Проверяем ручные ограничения. Master-only: по master_id. Legacy: по indie_master_id.
    if LEGACY_INDIE_MODE and indie_master_id is None:
        manual_restriction = None
    else:
        q = db.query(ClientRestriction).filter(
            ClientRestriction.client_phone == client_phone,
            ClientRestriction.is_active == True
        )
        if not LEGACY_INDIE_MODE:
            q = q.filter(ClientRestriction.master_id == master_id)
        else:
            q = q.filter(ClientRestriction.indie_master_id == indie_master_id)
        manual_restriction = q.first()
    
    if manual_restriction:
        return {
            'is_blocked': manual_restriction.restriction_type.value == 'blacklist',
            'requires_advance_payment': manual_restriction.restriction_type.value == 'advance_payment_only',
            'reason': manual_restriction.reason or 'Ручное ограничение',
            'applied_rule_id': None
        }
    
    # 2. Если ручных ограничений нет и есть client_id - проверяем автоматические правила
    if client_id is None:
        # Если клиент не зарегистрирован, автоматические правила не применяем
        return {
            'is_blocked': False,
            'requires_advance_payment': False,
            'reason': None,
            'applied_rule_id': None
        }
    
    # Получаем все активные правила мастера
    rules = db.query(ClientRestrictionRule).filter(
        ClientRestrictionRule.master_id == master_id
    ).all()
    
    # Сначала проверяем правила черного списка (они приоритетнее)
    blacklist_rules = [r for r in rules if r.restriction_type == 'blacklist']
    for rule in blacklist_rules:
        count = count_cancellations_by_reason(
            db, master_id, client_id, rule.cancellation_reason, rule.period_days, indie_master_id
        )
        
        if count >= rule.cancel_count:
            # Применяем ограничение
            apply_automatic_restrictions(db, master_id, indie_master_id, client_id, client_phone, rule.id, 'blacklist')
            return {
                'is_blocked': True,
                'requires_advance_payment': False,
                'reason': f'Автоматическое ограничение: {get_cancellation_reasons().get(rule.cancellation_reason, rule.cancellation_reason)}',
                'applied_rule_id': rule.id
            }
    
    # Затем проверяем правила предоплаты
    advance_payment_rules = [r for r in rules if r.restriction_type == 'advance_payment_only']
    for rule in advance_payment_rules:
        count = count_cancellations_by_reason(
            db, master_id, client_id, rule.cancellation_reason, rule.period_days, indie_master_id
        )
        
        if count >= rule.cancel_count:
            # Применяем ограничение
            apply_automatic_restrictions(db, master_id, indie_master_id, client_id, client_phone, rule.id, 'advance_payment_only')
            return {
                'is_blocked': False,
                'requires_advance_payment': True,
                'reason': f'Автоматическое ограничение: {get_cancellation_reasons().get(rule.cancellation_reason, rule.cancellation_reason)}',
                'applied_rule_id': rule.id
            }
    
    return {
        'is_blocked': False,
        'requires_advance_payment': False,
        'reason': None,
        'applied_rule_id': None
    }


def apply_automatic_restrictions(
    db: Session,
    master_id: int,
    indie_master_id: Optional[int],
    client_id: int,
    client_phone: str,
    rule_id: int,
    restriction_type: str
) -> None:
    """
    Применяет автоматические ограничения на основе правил.
    Master-only: создаёт с master_id. Legacy: с indie_master_id.
    """
    from utils.master_canon import LEGACY_INDIE_MODE

    use_master_id = not LEGACY_INDIE_MODE
    if use_master_id:
        owner_master_id, owner_indie_id = master_id, None
    else:
        if not indie_master_id:
            return  # Legacy: нет indie профиля — не создаём ограничение
        owner_master_id, owner_indie_id = None, indie_master_id

    rule = db.query(ClientRestrictionRule).filter(ClientRestrictionRule.id == rule_id).first()
    if not rule:
        return

    reason = f'Автоматическое ограничение: {get_cancellation_reasons().get(rule.cancellation_reason, rule.cancellation_reason)}'

    q = db.query(ClientRestriction).filter(ClientRestriction.client_phone == client_phone)
    if owner_master_id is not None:
        q = q.filter(ClientRestriction.master_id == owner_master_id)
    else:
        q = q.filter(ClientRestriction.indie_master_id == owner_indie_id)
    existing_restriction = q.first()

    if existing_restriction:
        if existing_restriction.reason and 'Автоматическое ограничение' in existing_restriction.reason:
            existing_restriction.restriction_type = restriction_type
            existing_restriction.reason = reason
            existing_restriction.is_active = True
            existing_restriction.updated_at = datetime.utcnow()
    else:
        new_restriction = ClientRestriction(
            master_id=owner_master_id,
            indie_master_id=owner_indie_id,
            client_phone=client_phone,
            restriction_type=restriction_type,
            reason=reason,
            is_active=True
        )
        db.add(new_restriction)

    db.commit()


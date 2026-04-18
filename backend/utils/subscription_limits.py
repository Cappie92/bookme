from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import User, Subscription, SubscriptionType, SubscriptionStatus


def get_user_subscription(db: Session, user_id: int, subscription_type: SubscriptionType) -> Optional[Subscription]:
    """Получить активную подписку пользователя или виртуальную подписку для всегда бесплатных пользователей"""
    # Сначала проверяем, есть ли у пользователя статус "всегда бесплатно"
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_always_free:
        # Возвращаем виртуальную подписку с максимальными лимитами
        return create_virtual_subscription(subscription_type)
    
    # Обычная проверка подписки
    return db.query(Subscription).filter(
        and_(
            Subscription.user_id == user_id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.valid_until > datetime.utcnow()
        )
    ).first()


def create_virtual_subscription(subscription_type: SubscriptionType) -> Subscription:
    """Создать виртуальную подписку с максимальными лимитами для всегда бесплатных пользователей"""
    virtual_subscription = Subscription()
    virtual_subscription.id = -1  # Виртуальный ID
    virtual_subscription.subscription_type = subscription_type
    virtual_subscription.status = SubscriptionStatus.ACTIVE
    virtual_subscription.start_date = datetime.utcnow()
    virtual_subscription.end_date = datetime(2099, 12, 31)  # Очень далеко в будущем
    virtual_subscription.price = 0.0
    virtual_subscription.daily_rate = 0.0
    virtual_subscription.auto_renewal = False
    
    if subscription_type == SubscriptionType.SALON:
        virtual_subscription.salon_branches = 999999  # Неограниченно
        virtual_subscription.salon_employees = 999999  # Неограниченно
        virtual_subscription.master_bookings = 0
    else:  # MASTER
        virtual_subscription.salon_branches = 0
        virtual_subscription.salon_employees = 0
        virtual_subscription.master_bookings = 999999  # Неограниченно
    
    return virtual_subscription


def check_salon_limits(db: Session, user_id: int, required_branches: int = 1, required_employees: int = 0) -> Dict[str, Any]:
    """Проверить лимиты салона"""
    subscription = get_user_subscription(db, user_id, SubscriptionType.SALON)
    
    if not subscription:
        return {
            "allowed": False,
            "reason": "Нет активной подписки",
            "current_branches": 0,
            "current_employees": 0,
            "required_branches": required_branches,
            "required_employees": required_employees
        }
    
    # Проверяем лимиты
    branches_ok = subscription.salon_branches >= required_branches
    employees_ok = subscription.salon_employees >= required_employees
    
    return {
        "allowed": branches_ok and employees_ok,
        "reason": "Лимиты превышены" if not (branches_ok and employees_ok) else "OK",
        "current_branches": subscription.salon_branches,
        "current_employees": subscription.salon_employees,
        "required_branches": required_branches,
        "required_employees": required_employees,
        "subscription_id": subscription.id
    }


def check_master_limits(db: Session, user_id: int, required_bookings: int = 1) -> Dict[str, Any]:
    """Проверить лимиты мастера"""
    subscription = get_user_subscription(db, user_id, SubscriptionType.MASTER)
    
    if not subscription:
        return {
            "allowed": False,
            "reason": "Нет активной подписки",
            "current_bookings": 0,
            "required_bookings": required_bookings
        }
    
    # Проверяем лимиты
    bookings_ok = subscription.master_bookings >= required_bookings
    
    return {
        "allowed": bookings_ok,
        "reason": "Лимит записей превышен" if not bookings_ok else "OK",
        "current_bookings": subscription.master_bookings,
        "required_bookings": required_bookings,
        "subscription_id": subscription.id
    }


def can_create_branch(db: Session, user_id: int) -> bool:
    """Может ли салон создать новый филиал"""
    # Получаем текущее количество филиалов
    from models import Salon
    current_branches = db.query(Salon).filter(Salon.user_id == user_id).count()
    
    # Проверяем лимиты
    limits = check_salon_limits(db, user_id, required_branches=current_branches + 1)
    return limits["allowed"]


def can_add_employee(db: Session, user_id: int) -> bool:
    """Может ли салон добавить нового работника"""
    # Получаем текущее количество работников
    from models import Master
    current_employees = db.query(Master).filter(Master.user_id == user_id).count()
    
    # Проверяем лимиты
    limits = check_salon_limits(db, user_id, required_employees=current_employees + 1)
    return limits["allowed"]


def can_create_booking(db: Session, user_id: int, user_role: str) -> bool:
    """Может ли мастер создать новую запись"""
    if user_role not in ['master', 'indie']:
        return True  # Клиенты и салоны не ограничены
    
    # Получаем количество записей в текущем месяце
    from models import Booking
    from datetime import datetime, date
    
    current_month_start = date(datetime.now().year, datetime.now().month, 1)
    current_month_end = date(datetime.now().year, datetime.now().month + 1, 1) if datetime.now().month < 12 else date(datetime.now().year + 1, 1, 1)
    
    current_bookings = db.query(Booking).filter(
        and_(
            Booking.master_id == user_id,
            Booking.start_time >= current_month_start,
            Booking.start_time < current_month_end
        )
    ).count()
    
    # Проверяем лимиты
    limits = check_master_limits(db, user_id, required_bookings=current_bookings + 1)
    return limits["allowed"]


def get_subscription_info(db: Session, user_id: int, user_role: str) -> Dict[str, Any]:
    """Получить информацию о подписке пользователя"""
    if user_role == 'salon':
        subscription_type = SubscriptionType.SALON
    elif user_role in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER
    else:
        return {
            "has_subscription": False,
            "reason": "Роль не поддерживает подписки"
        }
    
    subscription = get_user_subscription(db, user_id, subscription_type)
    
    if not subscription:
        return {
            "has_subscription": False,
            "reason": "Нет активной подписки"
        }
    
    return {
        "has_subscription": True,
        "subscription_id": subscription.id,
        "status": subscription.status.value,
        "valid_until": subscription.valid_until,
        "auto_renewal": subscription.auto_renewal,
        "payment_method": subscription.payment_method,
        "price": subscription.price,
        "salon_branches": subscription.salon_branches if subscription_type == SubscriptionType.SALON else None,
        "salon_employees": subscription.salon_employees if subscription_type == SubscriptionType.SALON else None,
        "master_bookings": subscription.master_bookings if subscription_type == SubscriptionType.MASTER else None
    }


def check_service_access(db: Session, user_id: int, service_id: int) -> Dict[str, Any]:
    """Проверить доступ пользователя к услуге с учетом типа услуги и статуса пользователя"""
    from models import Service, ServiceType
    
    # Получаем услугу
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        return {
            "allowed": False,
            "reason": "Услуга не найдена",
            "service_type": None,
            "is_always_free": False
        }
    
    # Получаем пользователя
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {
            "allowed": False,
            "reason": "Пользователь не найден",
            "service_type": service.service_type,
            "is_always_free": False
        }
    
    is_always_free = user.is_always_free or False
    
    # Определяем тип услуги (по умолчанию SUBSCRIPTION если не указан)
    service_type = service.service_type or 'subscription'
    
    # Логика доступа
    if service_type == 'free':
        # Бесплатные услуги доступны всем
        return {
            "allowed": True,
            "reason": "Бесплатная услуга",
            "service_type": service_type,
            "is_always_free": is_always_free,
            "price": 0.0
        }
    elif service_type == 'subscription':
        # Услуги в подписке
        if is_always_free:
            # Всегда бесплатные пользователи имеют доступ
            return {
                "allowed": True,
                "reason": "Входит в подписку (всегда бесплатно)",
                "service_type": service_type,
                "is_always_free": True,
                "price": 0.0
            }
        else:
            # Обычные пользователи должны иметь активную подписку
            subscription = get_user_subscription(db, user_id, SubscriptionType.MASTER)
            if subscription:
                return {
                    "allowed": True,
                    "reason": "Входит в подписку",
                    "service_type": service_type,
                    "is_always_free": False,
                    "price": 0.0
                }
            else:
                return {
                    "allowed": False,
                    "reason": "Требуется подписка",
                    "service_type": service_type,
                    "is_always_free": False,
                    "price": service.price
                }
    elif service_type == 'volume_based':
        # Услуги с оплатой за объем доступны всем, но платные
        return {
            "allowed": True,
            "reason": "Оплата за объем",
            "service_type": service_type,
            "is_always_free": is_always_free,
            "price": service.price
        }
    else:
        # Неизвестный тип услуги
        return {
            "allowed": False,
            "reason": "Неизвестный тип услуги",
            "service_type": service_type,
            "is_always_free": is_always_free,
            "price": service.price
        }


def is_user_always_free(db: Session, user_id: int) -> bool:
    """Проверить, является ли пользователь всегда бесплатным"""
    user = db.query(User).filter(User.id == user_id).first()
    return user.is_always_free if user else False 
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import User, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
from datetime import datetime


def get_user_subscription_with_plan(db: Session, user_id: int, subscription_type: SubscriptionType) -> Optional[Subscription]:
    """
    Получить активную подписку пользователя с планом.
    """
    # Проверяем активную подписку
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == user_id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.end_date > datetime.utcnow()
        )
    ).first()
    
    # Если подписки нет, но пользователь имеет is_always_free, создаем подписку на план AlwaysFree автоматически
    if not subscription:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.is_always_free:
            # Находим план AlwaysFree
            from models import SubscriptionPlan
            always_free_plan = db.query(SubscriptionPlan).filter(
                SubscriptionPlan.name == 'AlwaysFree',
                SubscriptionPlan.subscription_type == subscription_type
            ).first()
            
            if always_free_plan:
                # Создаем подписку на план AlwaysFree
                new_subscription = Subscription(
                    user_id=user_id,
                    subscription_type=subscription_type,
                    plan_id=always_free_plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    start_date=datetime.utcnow(),
                    end_date=datetime(2099, 12, 31),
                    price=0.0,
                    daily_rate=0.0,
                    auto_renewal=False,
                    is_active=True,
                    salon_branches=1 if subscription_type == SubscriptionType.SALON else 0,
                    salon_employees=0,
                    master_bookings=0
                )
                db.add(new_subscription)
                db.commit()
                db.refresh(new_subscription)
                return new_subscription
            else:
                # Если план AlwaysFree не найден, используем Premium как fallback
                premium_plan = db.query(SubscriptionPlan).filter(
                    SubscriptionPlan.name == 'Premium',
                    SubscriptionPlan.subscription_type == subscription_type
                ).first()
                
                if premium_plan:
                    new_subscription = Subscription(
                        user_id=user_id,
                        subscription_type=subscription_type,
                        plan_id=premium_plan.id,
                        status=SubscriptionStatus.ACTIVE,
                        start_date=datetime.utcnow(),
                        end_date=datetime(2099, 12, 31),
                        price=0.0,
                        daily_rate=0.0,
                        auto_renewal=False,
                        is_active=True,
                        salon_branches=1 if subscription_type == SubscriptionType.SALON else 0,
                        salon_employees=0,
                        master_bookings=0
                    )
                    db.add(new_subscription)
                    db.commit()
                    db.refresh(new_subscription)
                    return new_subscription
    
    return subscription


def get_subscription_plan(db: Session, plan_id: Optional[int]) -> Optional[SubscriptionPlan]:
    """
    Получить план подписки по ID.
    """
    if not plan_id:
        return None
    return db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()


def check_feature_access(db: Session, user_id: int, feature_key: str, subscription_type: SubscriptionType = SubscriptionType.MASTER) -> bool:
    """
    Проверить доступ к конкретной функции.
    
    Args:
        db: Сессия базы данных
        user_id: ID пользователя
        feature_key: Ключ функции (например, 'can_customize_domain')
        subscription_type: Тип подписки
    
    Returns:
        True если функция доступна, False иначе
    """
    subscription = get_user_subscription_with_plan(db, user_id, subscription_type)
    if not subscription:
        return False
    
    # Всегда бесплатные пользователи имеют доступ ко всем функциям
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_always_free:
        return True
    
    # Получаем план подписки
    plan = get_subscription_plan(db, subscription.plan_id)
    if not plan:
        return False
    
    # Проверяем функцию в плане
    features = plan.features or {}
    if feature_key in features:
        return features.get(feature_key, False)
    
    return False


def get_master_features(db: Session, user_id: int) -> Dict[str, Any]:
    """
    Получить все доступные функции мастера.
    
    Returns:
        Словарь с информацией о функциях и их доступности
    """
    subscription = get_user_subscription_with_plan(db, user_id, SubscriptionType.MASTER)
    user = db.query(User).filter(User.id == user_id).first()
    
    # Если есть подписка, используем её (включая подписки для is_always_free)
    if subscription and subscription.plan_id:
        plan = get_subscription_plan(db, subscription.plan_id)
        if plan:
            features = plan.features or {}
            
            # Все пользователи (включая is_always_free) получают функции из плана подписки
            # stats_retention_days: 0 или None означает бесконечное хранение
            retention_days = features.get("stats_retention_days")
            if retention_days is None or retention_days == 0:
                retention_days = 0  # 0 = бесконечное хранение
            else:
                retention_days = int(retention_days)
            
            return {
                "can_customize_domain": features.get("can_customize_domain", False),
                "can_add_page_modules": features.get("can_add_page_modules", False),
                "has_finance_access": features.get("has_finance_access", False),
                "has_extended_stats": features.get("has_extended_stats", False),
                "has_client_restrictions": features.get("has_client_restrictions", False),
                "max_page_modules": features.get("max_page_modules", 0),
                "stats_retention_days": retention_days,
                "plan_name": plan.name,
                "plan_id": plan.id
            }
    
    # Если подписки нет, но пользователь is_always_free, возвращаем функции плана AlwaysFree
    if user and user.is_always_free:
        # Пытаемся найти план AlwaysFree
        from models import SubscriptionPlan
        always_free_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'AlwaysFree',
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if always_free_plan:
            features = always_free_plan.features or {}
            retention_days = features.get("stats_retention_days")
            if retention_days is None or retention_days == 0:
                retention_days = 0
            else:
                retention_days = int(retention_days)
            
            return {
                "can_customize_domain": features.get("can_customize_domain", False),
                "can_add_page_modules": features.get("can_add_page_modules", False),
                "has_finance_access": features.get("has_finance_access", False),
                "has_extended_stats": features.get("has_extended_stats", False),
                "has_client_restrictions": features.get("has_client_restrictions", False),
                "max_page_modules": features.get("max_page_modules", 0),
                "stats_retention_days": retention_days,
                "plan_name": always_free_plan.name,
                "plan_id": always_free_plan.id
            }
        
        # Fallback: если план AlwaysFree не найден, возвращаем максимальные функции
        return {
            "can_customize_domain": True,
            "can_add_page_modules": True,
            "has_finance_access": True,
            "has_extended_stats": True,
            "has_client_restrictions": True,
            "max_page_modules": 999999,
            "stats_retention_days": 0,
            "plan_name": "AlwaysFree",
            "plan_id": None
        }
    
    # Нет подписки и не is_always_free
    return {
        "can_customize_domain": False,
        "can_add_page_modules": False,
        "has_finance_access": False,
        "has_extended_stats": False,
        "has_client_restrictions": False,
        "max_page_modules": 0,
        "stats_retention_days": 30,
        "plan_name": None,
        "plan_id": None
    }


def can_customize_domain(db: Session, user_id: int) -> bool:
    """
    Проверить возможность изменения домена мастера.
    """
    return check_feature_access(db, user_id, "can_customize_domain", SubscriptionType.MASTER)


def can_add_page_module(db: Session, user_id: int) -> bool:
    """
    Проверить возможность добавления модулей на страницу мастера.
    """
    return check_feature_access(db, user_id, "can_add_page_modules", SubscriptionType.MASTER)


def has_finance_access(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к финансам.
    """
    return check_feature_access(db, user_id, "has_finance_access", SubscriptionType.MASTER)


def has_extended_stats(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к расширенной статистике.
    """
    return check_feature_access(db, user_id, "has_extended_stats", SubscriptionType.MASTER)


def has_client_restrictions(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к функции ограничения клиентов.
    """
    return check_feature_access(db, user_id, "has_client_restrictions", SubscriptionType.MASTER)


def get_max_page_modules(db: Session, user_id: int) -> int:
    """
    Получить максимальное количество модулей на странице мастера.
    """
    features = get_master_features(db, user_id)
    return features.get("max_page_modules", 0)


def get_current_page_modules_count(db: Session, master_id: int) -> int:
    """
    Получить текущее количество активных модулей мастера.
    """
    from models import MasterPageModule
    return db.query(MasterPageModule).filter(
        and_(
            MasterPageModule.master_id == master_id,
            MasterPageModule.is_active == True
        )
    ).count()


import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import User, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
from datetime import datetime

logger = logging.getLogger(__name__)

# Маппинг service_function ID → ключ функции в коде
SERVICE_FUNCTION_TO_FEATURE = {
    1: "has_booking_page",           # Страница бронирования мастера
    2: "has_extended_stats",         # Статистика (расширенная)
    3: "has_loyalty_access",          # Лояльность
    4: "has_finance_access",          # Финансы
    5: "has_client_restrictions",     # Стоп-листы и предоплата
    6: "can_customize_domain",        # Персональный домен
    7: "has_clients_access",          # Клиенты (платная опция)
}

# Обратный маппинг для проверки
FEATURE_TO_SERVICE_FUNCTION = {v: k for k, v in SERVICE_FUNCTION_TO_FEATURE.items()}


def get_effective_subscription(
    db: Session,
    user_id: int,
    subscription_type: SubscriptionType,
    now_utc: Optional[datetime] = None,
) -> Optional[Subscription]:
    """Алиас для совместимости с роутерами (subscriptions, payments, admin, master)."""
    return get_user_subscription_with_plan(db, user_id, subscription_type, now_utc=now_utc)


get_current_subscription = get_effective_subscription


def get_active_subscription_readonly(
    db: Session,
    user_id: int,
    subscription_type: SubscriptionType,
    now_utc: Optional[datetime] = None,
) -> Optional[Subscription]:
    """
    Только чтение: активная подписка по тем же критериям, что и ниже в get_user_subscription_with_plan,
    без автосоздания AlwaysFree и без commit — безопасно для GET /admin/users и списков.
    При нескольких кандидатах — строка с максимальным end_date.
    """
    now = now_utc if now_utc is not None else datetime.utcnow()
    return (
        db.query(Subscription)
        .filter(
            and_(
                Subscription.user_id == user_id,
                Subscription.subscription_type == subscription_type,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.end_date > now,
                Subscription.is_active == True,
            )
        )
        .order_by(Subscription.end_date.desc())
        .first()
    )


def get_user_subscription_with_plan(
    db: Session,
    user_id: int,
    subscription_type: SubscriptionType,
    now_utc: Optional[datetime] = None,
) -> Optional[Subscription]:
    """
    Получить активную подписку пользователя с планом.
    now_utc: для тестов можно передать фиксированное время (иначе datetime.utcnow()).

    Условия согласованы с биллингом: после failed daily charge выставляется is_active=False,
    такая строка не считается «текущей» для UI и feature gating.
    """
    # Проверяем активную подписку (при нескольких — берём с максимальной end_date)
    now = now_utc if now_utc is not None else datetime.utcnow()
    active_count = (
        db.query(Subscription)
        .filter(
            and_(
                Subscription.user_id == user_id,
                Subscription.subscription_type == subscription_type,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.end_date > now,
                Subscription.is_active == True,
            )
        )
        .count()
    )
    if active_count > 1:
        logger.warning("multiple_active_now_strict: user_id=%s type=%s count=%s", user_id, subscription_type, active_count)
    subscription = get_active_subscription_readonly(db, user_id, subscription_type, now_utc=now)
    
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
    
    # Проверяем функцию через service_functions
    features = plan.features or {}
    service_function_ids = features.get("service_functions", [])
    
    # Если есть service_functions, проверяем через них
    if service_function_ids and feature_key in FEATURE_TO_SERVICE_FUNCTION:
        required_sf_id = FEATURE_TO_SERVICE_FUNCTION[feature_key]
        return required_sf_id in service_function_ids
    
    # Если service_functions нет или функция не найдена в маппинге, возвращаем False
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
            limits = plan.limits or {}
            
            # Получаем список service_functions из плана
            service_function_ids = features.get("service_functions", [])
            
            # Проверяем наличие service_functions
            has_booking_page = 1 in service_function_ids
            has_extended_stats = 2 in service_function_ids
            has_loyalty_access = 3 in service_function_ids
            has_finance_access = 4 in service_function_ids
            has_client_restrictions = 5 in service_function_ids
            can_customize_domain = 6 in service_function_ids
            has_clients_access = 7 in service_function_ids
            
            # Проверяем безлимитные записи через limits
            max_future_bookings = limits.get("max_future_bookings")
            has_unlimited_bookings = max_future_bookings is None or max_future_bookings == 0
            
            # stats_retention_days: 0 или None означает бесконечное хранение
            retention_days = features.get("stats_retention_days")
            if retention_days is None or retention_days == 0:
                retention_days = 0  # 0 = бесконечное хранение
            else:
                retention_days = int(retention_days)
            
            return {
                "has_booking_page": has_booking_page,
                "has_unlimited_bookings": has_unlimited_bookings,
                "has_extended_stats": has_extended_stats,
                "has_loyalty_access": has_loyalty_access,
                "has_finance_access": has_finance_access,
                "has_client_restrictions": has_client_restrictions,
                "can_customize_domain": can_customize_domain,
                "has_clients_access": has_clients_access,
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
            limits = always_free_plan.limits or {}
            service_function_ids = features.get("service_functions", [])
            
            has_booking_page = 1 in service_function_ids
            has_extended_stats = 2 in service_function_ids
            has_loyalty_access = 3 in service_function_ids
            has_finance_access = 4 in service_function_ids
            has_client_restrictions = 5 in service_function_ids
            can_customize_domain = 6 in service_function_ids
            has_clients_access = 7 in service_function_ids
            
            max_future_bookings = limits.get("max_future_bookings")
            has_unlimited_bookings = max_future_bookings is None or max_future_bookings == 0
            
            retention_days = features.get("stats_retention_days")
            if retention_days is None or retention_days == 0:
                retention_days = 0
            else:
                retention_days = int(retention_days)
            
            return {
                "has_booking_page": has_booking_page,
                "has_unlimited_bookings": has_unlimited_bookings,
                "has_extended_stats": has_extended_stats,
                "has_loyalty_access": has_loyalty_access,
                "has_finance_access": has_finance_access,
                "has_client_restrictions": has_client_restrictions,
                "can_customize_domain": can_customize_domain,
                "has_clients_access": has_clients_access,
                "max_page_modules": features.get("max_page_modules", 0),
                "stats_retention_days": retention_days,
                "plan_name": always_free_plan.name,
                "plan_id": always_free_plan.id
            }
        
        # Fallback: если план AlwaysFree не найден, возвращаем максимальные функции
        return {
            "has_booking_page": True,
            "has_unlimited_bookings": True,
            "has_extended_stats": True,
            "has_loyalty_access": True,
            "has_finance_access": True,
            "has_client_restrictions": True,
            "can_customize_domain": True,
            "has_clients_access": True,
            "max_page_modules": 999999,
            "stats_retention_days": 0,
            "plan_name": "AlwaysFree",
            "plan_id": None
        }
    
    # Нет подписки и не is_always_free
    return {
        "has_booking_page": True,  # Базовая функция, доступна всем
        "has_unlimited_bookings": False,
        "has_extended_stats": False,
        "has_loyalty_access": False,
        "has_finance_access": False,
        "has_client_restrictions": False,
        "can_customize_domain": False,
        "has_clients_access": False,
        "max_page_modules": 0,
        "stats_retention_days": 30,
        "plan_name": None,
        "plan_id": None
    }


def has_booking_page(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к странице бронирования мастера.
    Базовая функция, доступна всем, но проверяется для единообразия.
    """
    return check_feature_access(db, user_id, "has_booking_page", SubscriptionType.MASTER)


def has_unlimited_bookings(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к безлимитным записям.
    Проверяется через limits.max_future_bookings (null или 0 = безлимит).
    """
    subscription = get_user_subscription_with_plan(db, user_id, SubscriptionType.MASTER)
    if not subscription or not subscription.plan_id:
        return False
    
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_always_free:
        return True
    
    plan = get_subscription_plan(db, subscription.plan_id)
    if not plan:
        return False
    
    limits = plan.limits or {}
    max_future_bookings = limits.get("max_future_bookings")
    return max_future_bookings is None or max_future_bookings == 0


def has_extended_stats(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к расширенной статистике.
    """
    return check_feature_access(db, user_id, "has_extended_stats", SubscriptionType.MASTER)


def has_loyalty_access(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к программе лояльности.
    """
    return check_feature_access(db, user_id, "has_loyalty_access", SubscriptionType.MASTER)


def has_finance_access(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к финансам.
    """
    return check_feature_access(db, user_id, "has_finance_access", SubscriptionType.MASTER)


def has_client_restrictions(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к функции ограничения клиентов (стоп-листы и предоплата).
    """
    return check_feature_access(db, user_id, "has_client_restrictions", SubscriptionType.MASTER)


def can_customize_domain(db: Session, user_id: int) -> bool:
    """
    Проверить возможность изменения домена мастера (персональный домен).
    """
    return check_feature_access(db, user_id, "can_customize_domain", SubscriptionType.MASTER)


def has_clients_access(db: Session, user_id: int) -> bool:
    """
    Проверить доступ к разделу «Клиенты» (платная опция).
    """
    return check_feature_access(db, user_id, "has_clients_access", SubscriptionType.MASTER)


# Обратная совместимость (можно удалить после обновления всех мест использования)
def can_add_page_module(db: Session, user_id: int) -> bool:
    """
    Проверить возможность добавления модулей на страницу мастера.
    УСТАРЕЛО: Эта функция больше не используется, оставлено для обратной совместимости.
    """
    # Возвращаем False, так как эта функция больше не используется
    return False


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


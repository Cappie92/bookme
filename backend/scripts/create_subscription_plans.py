"""
Скрипт для создания базовых планов подписки для мастеров.
Запускать после применения миграции 311b58ff9b60.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType

def create_subscription_plans():
    """Создать базовые планы подписки для мастеров"""
    db: Session = SessionLocal()
    
    try:
        # Проверяем, существуют ли уже планы
        existing_plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).all()
        
        if existing_plans:
            print(f"Найдено {len(existing_plans)} существующих планов. Пропускаем создание.")
            return
        
        # План Free
        free_plan = SubscriptionPlan(
            name="Free",
            subscription_type=SubscriptionType.MASTER,
            price_1month=0.0,
            price_3months=0.0,
            price_6months=0.0,
            price_12months=0.0,
            features={
                "can_customize_domain": False,
                "can_add_page_modules": False,
                "has_finance_access": False,
                "has_extended_stats": False,
                "max_page_modules": 0,
                "stats_retention_days": 30,
                "service_functions": [1],
            },
            limits={
                "bookings_per_month": 0,  # Безлимит (0 означает безлимит)
                "services_count": 0,
                "max_future_bookings": 30  # Лимит на 30 активных записей (все будущие записи)
            },
            is_active=True,
            display_order=1
        )
        db.add(free_plan)
        
        # План Basic
        basic_plan = SubscriptionPlan(
            name="Basic",
            subscription_type=SubscriptionType.MASTER,
            price_1month=500.0,
            price_3months=500.0,  # Можно настроить скидку
            price_6months=500.0,  # Можно настроить скидку
            price_12months=416.67,  # 5000 / 12 ≈ 416.67 (скидка ~17%)
            features={
                "can_customize_domain": True,
                "can_add_page_modules": True,
                "has_finance_access": False,
                "has_extended_stats": False,
                "max_page_modules": 1,
                "stats_retention_days": 30,
                "service_functions": [1, 6],
            },
            limits={
                "bookings_per_month": 0,
                "services_count": 0,
                "max_future_bookings": None  # Безлимит для платных планов
            },
            is_active=True,
            display_order=2
        )
        db.add(basic_plan)
        
        # План Pro
        pro_plan = SubscriptionPlan(
            name="Pro",
            subscription_type=SubscriptionType.MASTER,
            price_1month=1500.0,
            price_3months=1500.0,  # Можно настроить скидку
            price_6months=1500.0,  # Можно настроить скидку
            price_12months=1250.0,  # 15000 / 12 = 1250 (скидка ~17%)
            features={
                "can_customize_domain": True,
                "can_add_page_modules": True,
                "has_finance_access": True,
                "has_extended_stats": True,
                "max_page_modules": 3,
                "stats_retention_days": 90,
                "freeze_days_3m": 5,
                "freeze_days_6m": 12,
                "freeze_days_12m": 28,
                "service_functions": [1, 2, 3, 4, 5, 6, 7],
            },
            limits={
                "bookings_per_month": 0,
                "services_count": 0,
                "max_future_bookings": None  # Безлимит для платных планов
            },
            is_active=True,
            display_order=3
        )
        db.add(pro_plan)
        
        # План Premium
        premium_plan = SubscriptionPlan(
            name="Premium",
            subscription_type=SubscriptionType.MASTER,
            price_1month=3000.0,
            price_3months=3000.0,  # Можно настроить скидку
            price_6months=3000.0,  # Можно настроить скидку
            price_12months=2500.0,  # 30000 / 12 = 2500 (скидка ~17%)
            features={
                "can_customize_domain": True,
                "can_add_page_modules": True,
                "has_finance_access": True,
                "has_extended_stats": True,
                "max_page_modules": 999999,  # Безлимит
                "stats_retention_days": 365,
                "freeze_days_3m": 10,
                "freeze_days_6m": 15,
                "freeze_days_12m": 35,
                "service_functions": [1, 2, 3, 4, 5, 6, 7],
            },
            limits={
                "bookings_per_month": 0,
                "services_count": 0,
                "max_future_bookings": None  # Безлимит для платных планов
            },
            is_active=True,
            display_order=4
        )
        db.add(premium_plan)
        
        db.commit()
        print("✅ Базовые планы подписки успешно созданы:")
        print("   - Free (бесплатный)")
        print("   - Basic (500₽/мес)")
        print("   - Pro (1500₽/мес)")
        print("   - Premium (3000₽/мес)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при создании планов: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_subscription_plans()


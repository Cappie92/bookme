#!/usr/bin/env python3
"""
Скрипт для создания плана Always Free как скрытой копии Premium.
Always Free план:
- Нельзя купить (is_active = False)
- Не отображается в публичных списках
- Используется только для is_always_free пользователей
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType
import json

def create_always_free_plan():
    """Создать план Always Free как копию Premium"""
    db: Session = SessionLocal()
    
    try:
        # Находим Premium план
        premium_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "Premium",
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if not premium_plan:
            print("❌ Premium план не найден! Сначала создайте Premium план.")
            return False
        
        # Проверяем, существует ли Already Free план
        existing_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "AlwaysFree",
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if existing_plan:
            print(f"⚠️  План AlwaysFree уже существует (ID: {existing_plan.id})")
            print("Обновляю план AlwaysFree на основе Premium...")
            
            # Обновляем существующий план
            existing_plan.display_name = "Always Free"
            existing_plan.price_1month = premium_plan.price_1month
            existing_plan.price_3months = premium_plan.price_3months
            existing_plan.price_6months = premium_plan.price_6months
            existing_plan.price_12months = premium_plan.price_12months
            existing_plan.features = premium_plan.features.copy() if premium_plan.features else {}
            existing_plan.limits = premium_plan.limits.copy() if premium_plan.limits else {}
            existing_plan.is_active = False  # Скрыт от покупки
            existing_plan.display_order = 999  # В конец списка
            
            db.commit()
            print(f"✅ План AlwaysFree обновлен (ID: {existing_plan.id})")
            return True
        
        # Создаем новый план Always Free
        always_free_plan = SubscriptionPlan(
            name="AlwaysFree",
            display_name="Always Free",
            subscription_type=SubscriptionType.MASTER,
            price_1month=premium_plan.price_1month,
            price_3months=premium_plan.price_3months,
            price_6months=premium_plan.price_6months,
            price_12months=premium_plan.price_12months,
            features=premium_plan.features.copy() if premium_plan.features else {},
            limits=premium_plan.limits.copy() if premium_plan.limits else {},
            is_active=False,  # Скрыт от покупки
            display_order=999  # В конец списка (не будет отображаться в обычных списках)
        )
        
        db.add(always_free_plan)
        db.commit()
        db.refresh(always_free_plan)
        
        print(f"✅ План AlwaysFree создан (ID: {always_free_plan.id})")
        print(f"   Display Name: {always_free_plan.display_name}")
        print(f"   Is Active: {always_free_plan.is_active} (скрыт от покупки)")
        print(f"   Display Order: {always_free_plan.display_order}")
        print(f"   Service Functions: {always_free_plan.features.get('service_functions', []) if always_free_plan.features else []}")
        
        return True
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при создании плана AlwaysFree: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("Создание плана Always Free...")
    success = create_always_free_plan()
    if success:
        print("\n✅ Готово!")
    else:
        print("\n❌ Ошибка!")
        sys.exit(1)


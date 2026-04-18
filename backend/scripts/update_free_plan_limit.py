"""
Скрипт для обновления лимита активных записей для плана Free.
Добавляет max_future_bookings: 30 в limits плана Free.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType

def update_free_plan_limit():
    """Обновить лимит активных записей для плана Free"""
    db: Session = SessionLocal()
    
    try:
        # Находим план Free
        free_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "Free",
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if not free_plan:
            print("❌ План Free не найден")
            return
        
        # Обновляем limits
        from sqlalchemy.orm.attributes import flag_modified
        limits = dict(free_plan.limits or {})
        limits["max_future_bookings"] = 30
        
        free_plan.limits = limits
        flag_modified(free_plan, 'limits')  # Важно для JSON полей в SQLAlchemy
        db.commit()
        
        print(f"✅ Лимит активных записей для плана Free обновлен: max_future_bookings = 30")
        
        # Обновляем другие планы (устанавливаем None для безлимита)
        other_plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.name != "Free"
        ).all()
        
        for plan in other_plans:
            from sqlalchemy.orm.attributes import flag_modified
            limits = dict(plan.limits or {})
            if "max_future_bookings" not in limits:
                limits["max_future_bookings"] = None
                plan.limits = limits
                flag_modified(plan, 'limits')
        
        db.commit()
        print(f"✅ Обновлено {len(other_plans)} других планов (безлимит)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при обновлении лимита: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    update_free_plan_limit()


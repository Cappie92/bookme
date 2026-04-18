"""
Скрипт для экспорта планов подписки из локальной базы данных.
Экспортирует все планы типа MASTER в JSON файл для последующей синхронизации на сервер.
"""
import sys
import os
import json
from datetime import datetime
from pathlib import Path

# Добавляем корневую директорию проекта в путь
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType

# Путь к файлу экспорта
EXPORT_FILE = Path(__file__).parent / "subscription_plans_export.json"


def export_subscription_plans():
    """Экспортировать все планы подписки типа MASTER в JSON"""
    db: Session = SessionLocal()
    
    try:
        print("📤 Экспорт планов подписки из локальной базы...")
        
        # Получаем все планы типа MASTER
        plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).order_by(SubscriptionPlan.display_order).all()
        
        if not plans:
            print("⚠️  Планы подписки не найдены в базе данных")
            return
        
        print(f"✅ Найдено {len(plans)} планов подписки")
        
        # Формируем данные для экспорта
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "source": "local_database",
            "plans": []
        }
        
        for plan in plans:
            plan_data = {
                "name": plan.name,
                "display_name": plan.display_name,
                "subscription_type": plan.subscription_type.value,
                "price_1month": float(plan.price_1month),
                "price_3months": float(plan.price_3months),
                "price_6months": float(plan.price_6months),
                "price_12months": float(plan.price_12months),
                "freeze_days_1month": plan.freeze_days_1month or 0,
                "freeze_days_3months": plan.freeze_days_3months or 0,
                "freeze_days_6months": plan.freeze_days_6months or 0,
                "freeze_days_12months": plan.freeze_days_12months or 0,
                "features": plan.features if isinstance(plan.features, dict) else {},
                "limits": plan.limits if isinstance(plan.limits, dict) else {},
                "is_active": plan.is_active,
                "display_order": plan.display_order or 0
            }
            export_data["plans"].append(plan_data)
            
            print(f"  ✓ {plan.name}: {plan.price_1month}₽/мес (активен: {plan.is_active})")
        
        # Сохраняем в JSON файл
        with open(EXPORT_FILE, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Экспорт завершен!")
        print(f"📄 Файл сохранен: {EXPORT_FILE}")
        print(f"📊 Экспортировано планов: {len(plans)}")
        
    except Exception as e:
        print(f"❌ Ошибка при экспорте: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    export_subscription_plans()


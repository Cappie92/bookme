"""
Скрипт для синхронизации планов подписки из экспортированного JSON на сервер.
Обновляет существующие планы и создает новые, сохраняя ID существующих планов.
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Добавляем корневую директорию проекта в путь
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType

EXPORT_FILE = Path(__file__).parent / "subscription_plans_export.json"


def load_exported_plans():
    """Загрузить экспортированные планы из JSON"""
    if not EXPORT_FILE.exists():
        print(f"❌ Файл экспорта не найден: {EXPORT_FILE}")
        print("   Сначала запустите: python3 scripts/export_subscription_plans.py")
        sys.exit(1)
    
    with open(EXPORT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return data.get("plans", []), data.get("exported_at", "unknown")


def sync_subscription_plans(dry_run: bool = False):
    """Синхронизировать планы подписки"""
    print("🔄 Синхронизация планов подписки...\n")
    
    if dry_run:
        print("⚠️  РЕЖИМ ПРОВЕРКИ (dry-run): изменения не будут применены\n")
    
    # Загружаем экспортированные планы
    exported_plans, exported_at = load_exported_plans()
    print(f"📅 Экспорт создан: {exported_at}")
    print(f"📊 Планов для синхронизации: {len(exported_plans)}\n")
    
    db: Session = SessionLocal()
    
    try:
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        for plan_data in exported_plans:
            plan_name = plan_data["name"]
            subscription_type = SubscriptionType(plan_data["subscription_type"])
            
            # Ищем существующий план
            existing_plan = db.query(SubscriptionPlan).filter(
                SubscriptionPlan.name == plan_name,
                SubscriptionPlan.subscription_type == subscription_type
            ).first()
            
            if existing_plan:
                # Обновляем существующий план
                print(f"🔄 Обновление плана: {plan_name} (ID: {existing_plan.id})")
                
                if not dry_run:
                    existing_plan.display_name = plan_data.get("display_name")
                    existing_plan.price_1month = plan_data["price_1month"]
                    existing_plan.price_3months = plan_data["price_3months"]
                    existing_plan.price_6months = plan_data["price_6months"]
                    existing_plan.price_12months = plan_data["price_12months"]
                    existing_plan.freeze_days_1month = plan_data.get("freeze_days_1month", 0)
                    existing_plan.freeze_days_3months = plan_data.get("freeze_days_3months", 0)
                    existing_plan.freeze_days_6months = plan_data.get("freeze_days_6months", 0)
                    existing_plan.freeze_days_12months = plan_data.get("freeze_days_12months", 0)
                    existing_plan.features = plan_data.get("features", {})
                    existing_plan.limits = plan_data.get("limits", {})
                    existing_plan.is_active = plan_data.get("is_active", True)
                    existing_plan.display_order = plan_data.get("display_order", 0)
                    existing_plan.updated_at = datetime.utcnow()
                
                print(f"   ✓ Цены: 1м={plan_data['price_1month']}₽, 3м={plan_data['price_3months']}₽, "
                      f"6м={plan_data['price_6months']}₽, 12м={plan_data['price_12months']}₽")
                print(f"   ✓ Активен: {plan_data.get('is_active', True)}")
                
                updated_count += 1
            else:
                # Создаем новый план
                print(f"➕ Создание нового плана: {plan_name}")
                
                if not dry_run:
                    new_plan = SubscriptionPlan(
                        name=plan_name,
                        display_name=plan_data.get("display_name"),
                        subscription_type=subscription_type,
                        price_1month=plan_data["price_1month"],
                        price_3months=plan_data["price_3months"],
                        price_6months=plan_data["price_6months"],
                        price_12months=plan_data["price_12months"],
                        freeze_days_1month=plan_data.get("freeze_days_1month", 0),
                        freeze_days_3months=plan_data.get("freeze_days_3months", 0),
                        freeze_days_6months=plan_data.get("freeze_days_6months", 0),
                        freeze_days_12months=plan_data.get("freeze_days_12months", 0),
                        features=plan_data.get("features", {}),
                        limits=plan_data.get("limits", {}),
                        is_active=plan_data.get("is_active", True),
                        display_order=plan_data.get("display_order", 0)
                    )
                    db.add(new_plan)
                
                print(f"   ✓ Цены: 1м={plan_data['price_1month']}₽, 3м={plan_data['price_3months']}₽, "
                      f"6м={plan_data['price_6months']}₽, 12м={plan_data['price_12months']}₽")
                
                created_count += 1
        
        if not dry_run:
            db.commit()
            print(f"\n✅ Синхронизация завершена!")
        else:
            print(f"\n✅ Проверка завершена (dry-run)")
        
        print(f"📊 Статистика:")
        print(f"   ➕ Создано: {created_count}")
        print(f"   🔄 Обновлено: {updated_count}")
        print(f"   ⏭️  Пропущено: {skipped_count}")
        
    except Exception as e:
        if not dry_run:
            db.rollback()
        print(f"\n❌ Ошибка при синхронизации: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Синхронизация планов подписки из экспорта на сервер")
    parser.add_argument("--dry-run", action="store_true", help="Режим проверки без применения изменений")
    args = parser.parse_args()
    
    sync_subscription_plans(dry_run=args.dry_run)


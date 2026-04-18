"""
Скрипт для проверки различий между локальными планами подписки и планами на сервере.
Показывает diff без применения изменений.
"""
import sys
import os
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any

# Добавляем корневую директорию проекта в путь
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import SubscriptionPlan, SubscriptionType

EXPORT_FILE = Path(__file__).parent / "subscription_plans_export.json"


def load_exported_plans() -> Dict[str, Any]:
    """Загрузить экспортированные планы из JSON"""
    if not EXPORT_FILE.exists():
        print(f"❌ Файл экспорта не найден: {EXPORT_FILE}")
        print("   Сначала запустите: python3 scripts/export_subscription_plans.py")
        sys.exit(1)
    
    with open(EXPORT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Преобразуем список планов в словарь для удобства поиска
    plans_dict = {}
    for plan in data.get("plans", []):
        key = f"{plan['name']}_{plan['subscription_type']}"
        plans_dict[key] = plan
    
    return plans_dict, data.get("exported_at", "unknown")


def get_server_plans(db: Session) -> Dict[str, SubscriptionPlan]:
    """Получить планы с сервера"""
    plans = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER
    ).all()
    
    plans_dict = {}
    for plan in plans:
        key = f"{plan.name}_{plan.subscription_type.value}"
        plans_dict[key] = plan
    
    return plans_dict


def compare_plans(local_plan: Dict, server_plan: SubscriptionPlan) -> List[str]:
    """Сравнить два плана и вернуть список различий"""
    differences = []
    
    # Сравниваем основные поля
    if local_plan.get("display_name") != server_plan.display_name:
        differences.append(f"  display_name: '{server_plan.display_name}' -> '{local_plan.get('display_name')}'")
    
    if abs(local_plan.get("price_1month", 0) - server_plan.price_1month) > 0.01:
        differences.append(f"  price_1month: {server_plan.price_1month}₽ -> {local_plan.get('price_1month')}₽")
    
    if abs(local_plan.get("price_3months", 0) - server_plan.price_3months) > 0.01:
        differences.append(f"  price_3months: {server_plan.price_3months}₽ -> {local_plan.get('price_3months')}₽")
    
    if abs(local_plan.get("price_6months", 0) - server_plan.price_6months) > 0.01:
        differences.append(f"  price_6months: {server_plan.price_6months}₽ -> {local_plan.get('price_6months')}₽")
    
    if abs(local_plan.get("price_12months", 0) - server_plan.price_12months) > 0.01:
        differences.append(f"  price_12months: {server_plan.price_12months}₽ -> {local_plan.get('price_12months')}₽")
    
    if local_plan.get("freeze_days_1month", 0) != (server_plan.freeze_days_1month or 0):
        differences.append(f"  freeze_days_1month: {server_plan.freeze_days_1month or 0} -> {local_plan.get('freeze_days_1month', 0)}")
    
    if local_plan.get("freeze_days_3months", 0) != (server_plan.freeze_days_3months or 0):
        differences.append(f"  freeze_days_3months: {server_plan.freeze_days_3months or 0} -> {local_plan.get('freeze_days_3months', 0)}")
    
    if local_plan.get("freeze_days_6months", 0) != (server_plan.freeze_days_6months or 0):
        differences.append(f"  freeze_days_6months: {server_plan.freeze_days_6months or 0} -> {local_plan.get('freeze_days_6months', 0)}")
    
    if local_plan.get("freeze_days_12months", 0) != (server_plan.freeze_days_12months or 0):
        differences.append(f"  freeze_days_12months: {server_plan.freeze_days_12months or 0} -> {local_plan.get('freeze_days_12months', 0)}")
    
    if local_plan.get("is_active") != server_plan.is_active:
        differences.append(f"  is_active: {server_plan.is_active} -> {local_plan.get('is_active')}")
    
    if local_plan.get("display_order", 0) != (server_plan.display_order or 0):
        differences.append(f"  display_order: {server_plan.display_order or 0} -> {local_plan.get('display_order', 0)}")
    
    # Сравниваем features и limits (упрощенное сравнение)
    local_features = local_plan.get("features", {})
    server_features = server_plan.features if isinstance(server_plan.features, dict) else {}
    if local_features != server_features:
        differences.append(f"  features: будут обновлены")
    
    local_limits = local_plan.get("limits", {})
    server_limits = server_plan.limits if isinstance(server_plan.limits, dict) else {}
    if local_limits != server_limits:
        differences.append(f"  limits: будут обновлены")
    
    return differences


def check_diff():
    """Проверить различия между локальными и серверными планами"""
    print("🔍 Проверка различий между локальными и серверными планами...\n")
    
    # Загружаем экспортированные планы
    exported_plans, exported_at = load_exported_plans()
    print(f"📅 Экспорт создан: {exported_at}\n")
    
    # Получаем планы с сервера
    db: Session = SessionLocal()
    try:
        server_plans = get_server_plans(db)
        
        # Статистика
        to_update = []
        to_create = []
        only_on_server = []
        
        # Проверяем планы из экспорта
        for key, local_plan in exported_plans.items():
            if key in server_plans:
                # План существует, проверяем различия
                differences = compare_plans(local_plan, server_plans[key])
                if differences:
                    to_update.append((local_plan["name"], differences))
            else:
                # План не существует на сервере
                to_create.append(local_plan["name"])
        
        # Проверяем планы, которые есть только на сервере
        for key, server_plan in server_plans.items():
            if key not in exported_plans:
                only_on_server.append(server_plan.name)
        
        # Выводим результаты
        print("=" * 60)
        print("📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ")
        print("=" * 60)
        
        if to_create:
            print(f"\n✅ Планов для создания: {len(to_create)}")
            for name in to_create:
                print(f"   + {name}")
        
        if to_update:
            print(f"\n🔄 Планов для обновления: {len(to_update)}")
            for name, differences in to_update:
                print(f"\n   📝 {name}:")
                for diff in differences:
                    print(diff)
        
        if only_on_server:
            print(f"\n⚠️  Планов только на сервере (не будут изменены): {len(only_on_server)}")
            for name in only_on_server:
                print(f"   • {name}")
        
        if not to_create and not to_update:
            print("\n✅ Различий не найдено! Все планы синхронизированы.")
        
        print("\n" + "=" * 60)
        
        return len(to_create) > 0 or len(to_update) > 0
        
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Проверка различий между локальными и серверными планами")
    parser.add_argument("--server", action="store_true", help="Проверить различия с сервером")
    args = parser.parse_args()
    
    check_diff()


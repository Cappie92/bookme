"""
Скрипт для синхронизации service_functions из экспортированного JSON на сервер.
Обновляет существующие функции и создает новые.
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
from models import ServiceFunction, ServiceType

EXPORT_FILE = Path(__file__).parent / "service_functions_export.json"


def load_exported_functions():
    """Загрузить экспортированные функции из JSON"""
    if not EXPORT_FILE.exists():
        print(f"❌ Файл экспорта не найден: {EXPORT_FILE}")
        print("   Сначала запустите: python3 scripts/export_service_functions.py")
        sys.exit(1)
    
    with open(EXPORT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return data.get("functions", []), data.get("exported_at", "unknown")


def sync_service_functions(dry_run: bool = False):
    """Синхронизировать service_functions"""
    print("🔄 Синхронизация service_functions...\n")
    
    if dry_run:
        print("⚠️  РЕЖИМ ПРОВЕРКИ (dry-run): изменения не будут применены\n")
    
    # Загружаем экспортированные функции
    exported_functions, exported_at = load_exported_functions()
    print(f"📅 Экспорт создан: {exported_at}")
    print(f"📊 Функций для синхронизации: {len(exported_functions)}\n")
    
    db: Session = SessionLocal()
    
    try:
        created_count = 0
        updated_count = 0
        
        for func_data in exported_functions:
            func_name = func_data["name"]
            
            # Ищем существующую функцию
            existing_func = db.query(ServiceFunction).filter(
                ServiceFunction.name == func_name
            ).first()
            
            if existing_func:
                # Обновляем существующую функцию
                print(f"🔄 Обновление функции: {func_name} (ID: {existing_func.id})")
                
                if not dry_run:
                    existing_func.description = func_data.get("description", "")
                    existing_func.function_type = func_data["function_type"]
                    existing_func.is_active = func_data.get("is_active", True)
                    if hasattr(existing_func, 'display_name'):
                        existing_func.display_name = func_data.get("display_name")
                    if hasattr(existing_func, 'display_order'):
                        existing_func.display_order = func_data.get("display_order", 0)
                    existing_func.updated_at = datetime.utcnow()
                
                print(f"   ✓ Тип: {func_data['function_type']}, активен: {func_data.get('is_active', True)}")
                
                updated_count += 1
            else:
                # Создаем новую функцию
                print(f"➕ Создание новой функции: {func_name}")
                
                if not dry_run:
                    new_func = ServiceFunction(
                        name=func_name,
                        description=func_data.get("description", ""),
                        function_type=func_data["function_type"],
                        is_active=func_data.get("is_active", True)
                    )
                    if hasattr(ServiceFunction, 'display_name'):
                        new_func.display_name = func_data.get("display_name")
                    if hasattr(ServiceFunction, 'display_order'):
                        new_func.display_order = func_data.get("display_order", 0)
                    db.add(new_func)
                
                print(f"   ✓ Тип: {func_data['function_type']}, активен: {func_data.get('is_active', True)}")
                
                created_count += 1
        
        if not dry_run:
            db.commit()
            print(f"\n✅ Синхронизация завершена!")
        else:
            print(f"\n✅ Проверка завершена (dry-run)")
        
        print(f"📊 Статистика:")
        print(f"   ➕ Создано: {created_count}")
        print(f"   🔄 Обновлено: {updated_count}")
        
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
    
    parser = argparse.ArgumentParser(description="Синхронизация service_functions из экспорта на сервер")
    parser.add_argument("--dry-run", action="store_true", help="Режим проверки без применения изменений")
    args = parser.parse_args()
    
    sync_service_functions(dry_run=args.dry_run)


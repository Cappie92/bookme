"""
Скрипт для экспорта service_functions из локальной базы данных.
Экспортирует все функции в JSON файл для последующей синхронизации на сервер.
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
from models import ServiceFunction

# Путь к файлу экспорта
EXPORT_FILE = Path(__file__).parent / "service_functions_export.json"


def export_service_functions():
    """Экспортировать все service_functions в JSON"""
    db: Session = SessionLocal()
    
    try:
        print("📤 Экспорт service_functions из локальной базы...")
        
        # Получаем все функции
        functions = db.query(ServiceFunction).order_by(ServiceFunction.display_order, ServiceFunction.id).all()
        
        if not functions:
            print("⚠️  Service functions не найдены в базе данных")
            return
        
        print(f"✅ Найдено {len(functions)} функций")
        
        # Формируем данные для экспорта
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "source": "local_database",
            "functions": []
        }
        
        for func in functions:
            func_data = {
                "name": func.name,
                "description": func.description or "",
                "function_type": func.function_type,
                "is_active": func.is_active,
                "display_name": getattr(func, 'display_name', None),
                "display_order": getattr(func, 'display_order', 0) or 0
            }
            export_data["functions"].append(func_data)
            
            print(f"  ✓ {func.name} (тип: {func.function_type}, активен: {func.is_active})")
        
        # Сохраняем в JSON файл
        with open(EXPORT_FILE, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Экспорт завершен!")
        print(f"📄 Файл сохранен: {EXPORT_FILE}")
        print(f"📊 Экспортировано функций: {len(functions)}")
        
    except Exception as e:
        print(f"❌ Ошибка при экспорте: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    export_service_functions()


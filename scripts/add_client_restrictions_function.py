#!/usr/bin/env python3
"""
Скрипт для добавления функции "Ограничение клиентов" в список функций сервиса.
Запускать из корневой директории проекта: python scripts/add_client_restrictions_function.py
"""

import sys
import os

# Добавляем корневую директорию и backend в путь
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_path = os.path.join(project_root, 'backend')
sys.path.insert(0, project_root)
sys.path.insert(0, backend_path)

from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import ServiceFunction, ServiceType

def add_client_restrictions_function():
    """Добавить функцию 'Ограничение клиентов' в список функций"""
    db: Session = SessionLocal()
    
    try:
        # Проверяем, существует ли уже такая функция
        existing = db.query(ServiceFunction).filter(
            ServiceFunction.name.ilike('%ограничение%клиент%')
        ).first()
        
        if existing:
            print(f"Функция '{existing.name}' уже существует (ID: {existing.id})")
            print(f"Тип: {existing.function_type.value}")
            print(f"Активна: {existing.is_active}")
            return
        
        # Создаем новую функцию
        new_function = ServiceFunction(
            name="Ограничение клиентов",
            description="Управление ограничениями для клиентов: черный список и требование предоплаты",
            function_type=ServiceType.SUBSCRIPTION,  # В подписке
            is_active=True
        )
        
        db.add(new_function)
        db.commit()
        db.refresh(new_function)
        
        print(f"✅ Функция '{new_function.name}' успешно добавлена!")
        print(f"   ID: {new_function.id}")
        print(f"   Тип: {new_function.function_type.value}")
        print(f"   Описание: {new_function.description}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при добавлении функции: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    add_client_restrictions_function()


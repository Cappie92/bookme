#!/usr/bin/env python3
"""
Скрипт для очистки базы данных перед созданием тестовых данных
"""

from database import SessionLocal, engine
from models import Base

def clear_database():
    print("🧹 Очистка базы данных...")
    
    # Удаляем все таблицы
    Base.metadata.drop_all(bind=engine)
    print("   ✅ Все таблицы удалены")
    
    # Создаем таблицы заново
    Base.metadata.create_all(bind=engine)
    print("   ✅ Таблицы созданы заново")
    
    print("🎉 База данных очищена и готова к наполнению!")

if __name__ == "__main__":
    clear_database()

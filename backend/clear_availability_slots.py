#!/usr/bin/env python3
"""
Скрипт для очистки всех слотов доступности перед пересозданием с новой схемой дней недели.
"""

import sys
import os
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db
from models import AvailabilitySlot

def clear_availability_slots():
    """Удаляет все слоты доступности"""
    
    print("🗑️  Очистка всех слотов доступности...")
    
    db = next(get_db())
    
    try:
        # Подсчитываем количество слотов перед удалением
        total_slots = db.query(AvailabilitySlot).count()
        print(f"📊 Найдено слотов для удаления: {total_slots}")
        
        if total_slots > 0:
            # Удаляем все слоты
            db.query(AvailabilitySlot).delete()
            db.commit()
            print(f"✅ Удалено {total_slots} слотов доступности")
        else:
            print("ℹ️  Слоты для удаления не найдены")
        
        # Проверяем, что все удалено
        remaining_slots = db.query(AvailabilitySlot).count()
        print(f"📊 Оставшихся слотов: {remaining_slots}")
        
    except Exception as e:
        print(f"❌ Ошибка при очистке: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 Запуск очистки слотов доступности...")
    
    try:
        clear_availability_slots()
        print("\n🎉 Очистка завершена успешно!")
    except Exception as e:
        print(f"\n💥 Критическая ошибка: {e}")
        sys.exit(1)

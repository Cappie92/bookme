#!/usr/bin/env python3
"""
Скрипт для очистки старых данных после успешной миграции
Запускать ТОЛЬКО после полной проверки работы новой системы
"""

import sys
import os
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Добавляем путь к проекту
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
from database import get_db

def cleanup_old_data():
    """Очистка старых данных после успешной миграции"""
    
    print("🚀 Начинаем очистку старых данных...")
    print("⚠️  ВНИМАНИЕ: Этот скрипт удалит старые данные!")
    print("⚠️  Убедитесь, что новая система работает корректно!")
    
    # Запрашиваем подтверждение
    confirm = input("Вы уверены, что хотите продолжить? (yes/no): ")
    if confirm.lower() != 'yes':
        print("❌ Очистка отменена")
        return
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        # 1. Удаляем старые поля из таблицы masters
        print("📋 Удаляем старые поля из таблицы masters...")
        
        # Удаляем поля can_work_independently и can_work_in_salon
        db.execute(text("ALTER TABLE masters DROP COLUMN IF EXISTS can_work_independently"))
        db.execute(text("ALTER TABLE masters DROP COLUMN IF EXISTS can_work_in_salon"))
        db.execute(text("ALTER TABLE masters DROP COLUMN IF EXISTS domain"))
        db.execute(text("ALTER TABLE masters DROP COLUMN IF EXISTS address"))
        db.execute(text("ALTER TABLE masters DROP COLUMN IF EXISTS branch_id"))
        
        print("✅ Старые поля удалены из таблицы masters")
        
        # 2. Удаляем старые поля из таблицы bookings
        print("📋 Удаляем старые поля из таблицы bookings...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE bookings DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы bookings")
        
        # 3. Удаляем старые поля из таблицы services
        print("📋 Удаляем старые поля из таблицы services...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE services DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы services")
        
        # 4. Удаляем старые поля из таблицы client_restrictions
        print("📋 Удаляем старые поля из таблицы client_restrictions...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE client_restrictions DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы client_restrictions")
        
        # 5. Удаляем старые поля из таблицы incomes
        print("📋 Удаляем старые поля из таблицы incomes...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE incomes DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы incomes")
        
        # 6. Удаляем старые поля из таблицы expenses
        print("📋 Удаляем старые поля из таблицы expenses...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE expenses DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы expenses")
        
        # 7. Удаляем старые поля из таблицы expense_types
        print("📋 Удаляем старые поля из таблицы expense_types...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE expense_types DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы expense_types")
        
        # 8. Удаляем старые поля из таблицы expense_templates
        print("📋 Удаляем старые поля из таблицы expense_templates...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE expense_templates DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы expense_templates")
        
        # 9. Удаляем старые поля из таблицы missed_revenues
        print("📋 Удаляем старые поля из таблицы missed_revenues...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE missed_revenues DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы missed_revenues")
        
        # 10. Удаляем старые поля из таблицы indie_master_schedules
        print("📋 Удаляем старые поля из таблицы indie_master_schedules...")
        
        # Удаляем поле indie_master_id
        db.execute(text("ALTER TABLE indie_master_schedules DROP COLUMN IF EXISTS indie_master_id"))
        
        print("✅ Старые поля удалены из таблицы indie_master_schedules")
        
        # 11. Переименовываем таблицы
        print("📋 Переименовываем таблицы...")
        
        # Переименовываем indie_masters_new в indie_masters
        db.execute(text("ALTER TABLE indie_masters RENAME TO indie_masters_old"))
        db.execute(text("ALTER TABLE indie_masters_new RENAME TO indie_masters"))
        
        print("✅ Таблицы переименованы")
        
        # 12. Удаляем старую таблицу indie_masters_old
        print("📋 Удаляем старую таблицу indie_masters_old...")
        
        db.execute(text("DROP TABLE IF EXISTS indie_masters_old"))
        
        print("✅ Старая таблица indie_masters_old удалена")
        
        # 13. Обновляем связи в таблице users
        print("📋 Обновляем связи в таблице users...")
        
        # Удаляем связь с indie_profile
        db.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_indie_profile"))
        db.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS indie_profile_id"))
        
        print("✅ Связи в таблице users обновлены")
        
        # 14. Создаем новые связи
        print("📋 Создаем новые связи...")
        
        # Создаем связь между masters и salon_masters
        db.execute(text("""
            ALTER TABLE salon_masters 
            ADD CONSTRAINT fk_salon_masters_master 
            FOREIGN KEY (master_id) REFERENCES masters(id)
        """))
        
        # Создаем связь между masters и indie_masters
        db.execute(text("""
            ALTER TABLE indie_masters 
            ADD CONSTRAINT fk_indie_masters_master 
            FOREIGN KEY (master_id) REFERENCES masters(id)
        """))
        
        print("✅ Новые связи созданы")
        
        # 15. Создаем новые индексы
        print("📋 Создаем новые индексы...")
        
        # Индексы для salon_masters
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_salon_masters_master ON salon_masters(master_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_salon_masters_salon ON salon_masters(salon_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_salon_masters_branch ON salon_masters(branch_id)"))
        
        # Индексы для indie_masters
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_masters_master ON indie_masters(master_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_masters_domain ON indie_masters(domain)"))
        
        print("✅ Новые индексы созданы")
        
        # Коммитим все изменения
        db.commit()
        print("✅ Все изменения сохранены в базе данных")
        
        print("\n🎉 Очистка старых данных завершена успешно!")
        print("📊 Статистика очистки:")
        
        # Показываем статистику
        masters_count = db.execute(text("SELECT COUNT(*) FROM masters")).scalar()
        salon_masters_count = db.execute(text("SELECT COUNT(*) FROM salon_masters")).scalar()
        indie_masters_count = db.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
        
        print(f"   - Мастеров: {masters_count}")
        print(f"   - Мастеров в салонах: {salon_masters_count}")
        print(f"   - Независимых мастеров: {indie_masters_count}")
        
    except Exception as e:
        print(f"❌ Ошибка при очистке старых данных: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_old_data()


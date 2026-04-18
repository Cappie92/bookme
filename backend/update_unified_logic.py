#!/usr/bin/env python3
"""
Скрипт для обновления существующей логики под унифицированную структуру
Запускать ПОСЛЕ миграции данных
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

def update_existing_logic():
    """Обновление существующей логики под унифицированную структуру"""
    
    print("🚀 Начинаем обновление логики под унифицированную структуру...")
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        # 1. Обновляем бронирования - добавляем work_type
        print("📋 Обновляем бронирования...")
        
        # Определяем тип работы для каждого бронирования
        db.execute(text("""
            UPDATE bookings 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Бронирования обновлены")
        
        # 2. Обновляем услуги - добавляем work_type
        print("📋 Обновляем услуги...")
        
        # Определяем тип работы для каждой услуги
        db.execute(text("""
            UPDATE services 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Услуги обновлены")
        
        # 3. Обновляем ограничения клиентов - добавляем work_type
        print("📋 Обновляем ограничения клиентов...")
        
        # Определяем тип работы для каждого ограничения
        db.execute(text("""
            UPDATE client_restrictions 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Ограничения клиентов обновлены")
        
        # 4. Обновляем доходы - добавляем work_type
        print("📋 Обновляем доходы...")
        
        # Определяем тип работы для каждого дохода
        db.execute(text("""
            UPDATE incomes 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Доходы обновлены")
        
        # 5. Обновляем расходы - добавляем work_type
        print("📋 Обновляем расходы...")
        
        # Определяем тип работы для каждого расхода
        db.execute(text("""
            UPDATE expenses 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Расходы обновлены")
        
        # 6. Обновляем типы расходов - добавляем work_type
        print("📋 Обновляем типы расходов...")
        
        # Определяем тип работы для каждого типа расхода
        db.execute(text("""
            UPDATE expense_types 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Типы расходов обновлены")
        
        # 7. Обновляем шаблоны расходов - добавляем work_type
        print("📋 Обновляем шаблоны расходов...")
        
        # Определяем тип работы для каждого шаблона расхода
        db.execute(text("""
            UPDATE expense_templates 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Шаблоны расходов обновлены")
        
        # 8. Обновляем пропущенные доходы - добавляем work_type
        print("📋 Обновляем пропущенные доходы...")
        
        # Определяем тип работы для каждого пропущенного дохода
        db.execute(text("""
            UPDATE missed_revenues 
            SET work_type = CASE 
                WHEN salon_id IS NOT NULL THEN 'salon'
                WHEN indie_work_id IS NOT NULL THEN 'indie'
                ELSE 'salon'
            END
            WHERE work_type IS NULL
        """))
        
        print("✅ Пропущенные доходы обновлены")
        
        # 9. Обновляем расписание независимых мастеров - добавляем master_id
        print("📋 Обновляем расписание независимых мастеров...")
        
        # Добавляем master_id для расписания независимых мастеров
        db.execute(text("""
            UPDATE indie_master_schedules 
            SET master_id = (
                SELECT im.master_id 
                FROM indie_masters_new im 
                WHERE im.id = indie_master_schedules.indie_work_id
            )
            WHERE master_id IS NULL AND indie_work_id IS NOT NULL
        """))
        
        print("✅ Расписание независимых мастеров обновлено")
        
        # 10. Создаем индексы для производительности
        print("📋 Создаем индексы для производительности...")
        
        # Индексы для бронирований
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_work_type ON bookings(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_salon_work ON bookings(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_bookings_indie_work ON bookings(indie_work_id)"))
        
        # Индексы для услуг
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_services_work_type ON services(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_services_salon_work ON services(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_services_indie_work ON services(indie_work_id)"))
        
        # Индексы для ограничений клиентов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_client_restrictions_work_type ON client_restrictions(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_client_restrictions_salon_work ON client_restrictions(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_client_restrictions_indie_work ON client_restrictions(indie_work_id)"))
        
        # Индексы для доходов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_incomes_work_type ON incomes(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_incomes_salon_work ON incomes(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_incomes_indie_work ON incomes(indie_work_id)"))
        
        # Индексы для расходов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expenses_work_type ON expenses(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expenses_salon_work ON expenses(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expenses_indie_work ON expenses(indie_work_id)"))
        
        # Индексы для типов расходов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_types_work_type ON expense_types(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_types_salon_work ON expense_types(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_types_indie_work ON expense_types(indie_work_id)"))
        
        # Индексы для шаблонов расходов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_templates_work_type ON expense_templates(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_templates_salon_work ON expense_templates(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_templates_indie_work ON expense_templates(indie_work_id)"))
        
        # Индексы для пропущенных доходов
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_missed_revenues_work_type ON missed_revenues(work_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_missed_revenues_salon_work ON missed_revenues(salon_work_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_missed_revenues_indie_work ON missed_revenues(indie_work_id)"))
        
        # Индексы для расписания независимых мастеров
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_master_schedules_master ON indie_master_schedules(master_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_master_schedules_indie_work ON indie_master_schedules(indie_work_id)"))
        
        print("✅ Индексы созданы")
        
        # Коммитим все изменения
        db.commit()
        print("✅ Все изменения сохранены в базе данных")
        
        print("\n🎉 Обновление логики завершено успешно!")
        print("📊 Статистика обновления:")
        
        # Показываем статистику
        bookings_count = db.execute(text("SELECT COUNT(*) FROM bookings WHERE work_type IS NOT NULL")).scalar()
        services_count = db.execute(text("SELECT COUNT(*) FROM services WHERE work_type IS NOT NULL")).scalar()
        restrictions_count = db.execute(text("SELECT COUNT(*) FROM client_restrictions WHERE work_type IS NOT NULL")).scalar()
        
        print(f"   - Бронирований с work_type: {bookings_count}")
        print(f"   - Услуг с work_type: {services_count}")
        print(f"   - Ограничений с work_type: {restrictions_count}")
        
    except Exception as e:
        print(f"❌ Ошибка при обновлении логики: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    update_existing_logic()


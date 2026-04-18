#!/usr/bin/env python3
"""
Скрипт миграции данных для унифицированной структуры мастеров
Запускать ПОСЛЕ применения миграции 20250127_unified_master_structure.py
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

def migrate_data():
    """Миграция данных из старой структуры в новую"""
    
    print("🚀 Начинаем миграцию данных для унифицированной структуры мастеров...")
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        # 1. Мигрируем мастеров с can_work_in_salon = True
        print("📋 Мигрируем мастеров для работы в салонах...")
        
        masters_with_salon_work = db.query(Master).filter(
            Master.can_work_in_salon == True
        ).all()
        
        for master in masters_with_salon_work:
            # Находим салон, в котором работает мастер
            salon = db.query(Salon).join(Salon.masters).filter(
                Salon.masters.any(Master.id == master.id)
            ).first()
            
            if salon:
                # Создаем запись в salon_masters
                db.execute(text("""
                    INSERT INTO salon_masters (master_id, salon_id, can_work_in_salon, branch_id, is_active, created_at, updated_at)
                    VALUES (:master_id, :salon_id, :can_work_in_salon, :branch_id, :is_active, :created_at, :updated_at)
                """), {
                    'master_id': master.id,
                    'salon_id': salon.id,
                    'can_work_in_salon': master.can_work_in_salon,
                    'branch_id': master.branch_id,
                    'is_active': True,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                })
                print(f"✅ Мастер {master.id} добавлен в салон {salon.id}")
        
        # 2. Мигрируем независимых мастеров
        print("📋 Мигрируем независимых мастеров...")
        
        # Сначала мигрируем мастеров с can_work_independently = True
        masters_with_indie_work = db.query(Master).filter(
            Master.can_work_independently == True
        ).all()
        
        for master in masters_with_indie_work:
            # Создаем запись в indie_masters
            db.execute(text("""
                INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, payment_on_visit, payment_advance, is_active, created_at, updated_at)
                VALUES (:user_id, :can_work_independently, :domain, :address, :city, :timezone, :payment_on_visit, :payment_advance, :is_active, :created_at, :updated_at)
            """), {
                'user_id': master.id,
                'can_work_independently': master.can_work_independently,
                'domain': master.domain,
                'address': master.address,
                'city': master.city,
                'timezone': master.timezone,
                'payment_on_visit': True,  # По умолчанию
                'payment_advance': False,  # По умолчанию
                'is_active': True,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            })
            print(f"✅ Мастер {master.id} добавлен как независимый")
        
        # 3. Мигрируем пользователей с ролью INDIE
        print("📋 Мигрируем пользователей с ролью INDIE...")
        
        indie_users = db.query(User).filter(User.role == UserRole.INDIE).all()
        
        for user in indie_users:
            # Находим профиль IndieMaster
            indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == user.id).first()
            
            if indie_master:
                # Создаем запись в indie_masters
                db.execute(text("""
                    INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, payment_on_visit, payment_advance, is_active, created_at, updated_at)
                    VALUES (:user_id, :can_work_independently, :domain, :address, :city, :timezone, :payment_on_visit, :payment_advance, :is_active, :created_at, :updated_at)
                """), {
                    'user_id': indie_master.id,  # Используем ID из старой таблицы
                    'can_work_independently': True,
                    'domain': indie_master.domain,
                    'address': indie_master.address,
                    'city': indie_master.city,
                    'timezone': indie_master.timezone,
                    'payment_on_visit': indie_master.payment_on_visit,
                    'payment_advance': indie_master.payment_advance,
                    'is_active': True,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                })
                print(f"✅ Пользователь {user.id} (INDIE) добавлен как независимый мастер")
        
        # 4. Обновляем бронирования
        print("📋 Обновляем бронирования...")
        
        # Обновляем бронирования с indie_master_id на master_id
        db.execute(text("""
            UPDATE bookings 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = bookings.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Бронирования обновлены")
        
        # 5. Обновляем услуги
        print("📋 Обновляем услуги...")
        
        # Обновляем услуги с indie_master_id на master_id
        db.execute(text("""
            UPDATE services 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = services.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Услуги обновлены")
        
        # 6. Обновляем ограничения клиентов
        print("📋 Обновляем ограничения клиентов...")
        
        # Обновляем ограничения с indie_master_id на master_id
        db.execute(text("""
            UPDATE client_restrictions 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = client_restrictions.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Ограничения клиентов обновлены")
        
        # 7. Обновляем доходы
        print("📋 Обновляем доходы...")
        
        # Обновляем доходы с indie_master_id на master_id
        db.execute(text("""
            UPDATE incomes 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = incomes.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Доходы обновлены")
        
        # 8. Обновляем расходы
        print("📋 Обновляем расходы...")
        
        # Обновляем расходы с indie_master_id на master_id
        db.execute(text("""
            UPDATE expenses 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = expenses.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Расходы обновлены")
        
        # 9. Обновляем типы расходов
        print("📋 Обновляем типы расходов...")
        
        # Обновляем типы расходов с indie_master_id на master_id
        db.execute(text("""
            UPDATE expense_types 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = expense_types.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Типы расходов обновлены")
        
        # 10. Обновляем шаблоны расходов
        print("📋 Обновляем шаблоны расходов...")
        
        # Обновляем шаблоны расходов с indie_master_id на master_id
        db.execute(text("""
            UPDATE expense_templates 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = expense_templates.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Шаблоны расходов обновлены")
        
        # 11. Обновляем пропущенные доходы
        print("📋 Обновляем пропущенные доходы...")
        
        # Обновляем пропущенные доходы с indie_master_id на master_id
        db.execute(text("""
            UPDATE missed_revenues 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = missed_revenues.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Пропущенные доходы обновлены")
        
        # 12. Обновляем расписание независимых мастеров
        print("📋 Обновляем расписание независимых мастеров...")
        
        # Обновляем расписание с indie_master_id на master_id
        db.execute(text("""
            UPDATE indie_master_schedules 
            SET master_id = (
                SELECT im.user_id 
                FROM indie_masters im 
                WHERE im.id = indie_master_schedules.indie_master_id
            )
            WHERE indie_master_id IS NOT NULL
        """))
        
        print("✅ Расписание независимых мастеров обновлено")
        
        # 13. Обновляем роли пользователей
        print("📋 Обновляем роли пользователей...")
        
        # Меняем роль INDIE на MASTER
        db.execute(text("""
            UPDATE users 
            SET role = 'master' 
            WHERE role = 'indie'
        """))
        
        print("✅ Роли пользователей обновлены")
        
        # Коммитим все изменения
        db.commit()
        print("✅ Все изменения сохранены в базе данных")
        
        print("\n🎉 Миграция данных завершена успешно!")
        print("📊 Статистика миграции:")
        
        # Показываем статистику
        salon_masters_count = db.execute(text("SELECT COUNT(*) FROM salon_masters")).scalar()
        indie_masters_count = db.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
        
        print(f"   - Мастеров в салонах: {salon_masters_count}")
        print(f"   - Независимых мастеров: {indie_masters_count}")
        
    except Exception as e:
        print(f"❌ Ошибка при миграции: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_data()

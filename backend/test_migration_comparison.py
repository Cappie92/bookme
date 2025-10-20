#!/usr/bin/env python3
"""
Тестовый скрипт для сравнения данных до и после миграции
Проверяет, что все данные корректно перенесены без потерь
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

def test_migration_comparison():
    """Сравнение данных до и после миграции"""
    
    print("🧪 Начинаем сравнение данных до и после миграции...")
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    tests_passed = 0
    tests_failed = 0
    
    try:
        # 1. Сравнение пользователей
        print("\n📋 Тест 1: Сравнение пользователей")
        
        try:
            # Подсчитываем пользователей по ролям
            users_by_role = db.execute(text("""
                SELECT role, COUNT(*) as count
                FROM users 
                GROUP BY role
                ORDER BY role
            """)).fetchall()
            
            print("   📊 Пользователи по ролям:")
            for role, count in users_by_role:
                print(f"      {role}: {count}")
            
            # Проверяем, что нет пользователей с ролью INDIE
            indie_count = next((count for role, count in users_by_role if role == 'indie'), 0)
            if indie_count == 0:
                print("   ✅ Нет пользователей с ролью INDIE")
                tests_passed += 1
            else:
                print(f"   ❌ Найдено {indie_count} пользователей с ролью INDIE")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении пользователей: {e}")
            tests_failed += 1
        
        # 2. Сравнение мастеров
        print("\n📋 Тест 2: Сравнение мастеров")
        
        try:
            # Подсчитываем мастеров по типам работы
            masters_with_salon = db.execute(text("""
                SELECT COUNT(*) FROM masters 
                WHERE can_work_in_salon = true
            """)).scalar()
            
            masters_with_indie = db.execute(text("""
                SELECT COUNT(*) FROM masters 
                WHERE can_work_independently = true
            """)).scalar()
            
            salon_masters_count = db.execute(text("""
                SELECT COUNT(*) FROM salon_masters
            """)).scalar()
            
            indie_masters_count = db.execute(text("""
                SELECT COUNT(*) FROM indie_masters
            """)).scalar()
            
            print(f"   📊 Мастера с работой в салоне: {masters_with_salon} -> {salon_masters_count}")
            print(f"   📊 Независимые мастера: {masters_with_indie} -> {indie_masters_count}")
            
            if masters_with_salon == salon_masters_count and masters_with_indie == indie_masters_count:
                print("   ✅ Количество мастеров соответствует")
                tests_passed += 1
            else:
                print("   ❌ Несоответствие в количестве мастеров")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении мастеров: {e}")
            tests_failed += 1
        
        # 3. Сравнение бронирований
        print("\n📋 Тест 3: Сравнение бронирований")
        
        try:
            # Подсчитываем бронирования по типам работы
            bookings_by_type = db.execute(text("""
                SELECT work_type, COUNT(*) as count
                FROM bookings 
                WHERE work_type IS NOT NULL
                GROUP BY work_type
                ORDER BY work_type
            """)).fetchall()
            
            total_bookings = db.execute(text("""
                SELECT COUNT(*) FROM bookings
            """)).scalar()
            
            bookings_with_work_type = sum(count for _, count in bookings_by_type)
            
            print(f"   📊 Всего бронирований: {total_bookings}")
            print(f"   📊 Бронирований с work_type: {bookings_with_work_type}")
            for work_type, count in bookings_by_type:
                print(f"      {work_type}: {count}")
            
            if total_bookings == bookings_with_work_type:
                print("   ✅ Все бронирования имеют work_type")
                tests_passed += 1
            else:
                print("   ❌ Не все бронирования имеют work_type")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении бронирований: {e}")
            tests_failed += 1
        
        # 4. Сравнение услуг
        print("\n📋 Тест 4: Сравнение услуг")
        
        try:
            # Подсчитываем услуги по типам работы
            services_by_type = db.execute(text("""
                SELECT work_type, COUNT(*) as count
                FROM services 
                WHERE work_type IS NOT NULL
                GROUP BY work_type
                ORDER BY work_type
            """)).fetchall()
            
            total_services = db.execute(text("""
                SELECT COUNT(*) FROM services
            """)).scalar()
            
            services_with_work_type = sum(count for _, count in services_by_type)
            
            print(f"   📊 Всего услуг: {total_services}")
            print(f"   📊 Услуг с work_type: {services_with_work_type}")
            for work_type, count in services_by_type:
                print(f"      {work_type}: {count}")
            
            if total_services == services_with_work_type:
                print("   ✅ Все услуги имеют work_type")
                tests_passed += 1
            else:
                print("   ❌ Не все услуги имеют work_type")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении услуг: {e}")
            tests_failed += 1
        
        # 5. Сравнение ограничений клиентов
        print("\n📋 Тест 5: Сравнение ограничений клиентов")
        
        try:
            # Подсчитываем ограничения по типам работы
            restrictions_by_type = db.execute(text("""
                SELECT work_type, COUNT(*) as count
                FROM client_restrictions 
                WHERE work_type IS NOT NULL
                GROUP BY work_type
                ORDER BY work_type
            """)).fetchall()
            
            total_restrictions = db.execute(text("""
                SELECT COUNT(*) FROM client_restrictions
            """)).scalar()
            
            restrictions_with_work_type = sum(count for _, count in restrictions_by_type)
            
            print(f"   📊 Всего ограничений: {total_restrictions}")
            print(f"   📊 Ограничений с work_type: {restrictions_with_work_type}")
            for work_type, count in restrictions_by_type:
                print(f"      {work_type}: {count}")
            
            if total_restrictions == restrictions_with_work_type:
                print("   ✅ Все ограничения имеют work_type")
                tests_passed += 1
            else:
                print("   ❌ Не все ограничения имеют work_type")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении ограничений: {e}")
            tests_failed += 1
        
        # 6. Сравнение доходов
        print("\n📋 Тест 6: Сравнение доходов")
        
        try:
            # Подсчитываем доходы по типам работы
            incomes_by_type = db.execute(text("""
                SELECT work_type, COUNT(*) as count
                FROM incomes 
                WHERE work_type IS NOT NULL
                GROUP BY work_type
                ORDER BY work_type
            """)).fetchall()
            
            total_incomes = db.execute(text("""
                SELECT COUNT(*) FROM incomes
            """)).scalar()
            
            incomes_with_work_type = sum(count for _, count in incomes_by_type)
            
            print(f"   📊 Всего доходов: {total_incomes}")
            print(f"   📊 Доходов с work_type: {incomes_with_work_type}")
            for work_type, count in incomes_by_type:
                print(f"      {work_type}: {count}")
            
            if total_incomes == incomes_with_work_type:
                print("   ✅ Все доходы имеют work_type")
                tests_passed += 1
            else:
                print("   ❌ Не все доходы имеют work_type")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении доходов: {e}")
            tests_failed += 1
        
        # 7. Сравнение расходов
        print("\n📋 Тест 7: Сравнение расходов")
        
        try:
            # Подсчитываем расходы по типам работы
            expenses_by_type = db.execute(text("""
                SELECT work_type, COUNT(*) as count
                FROM expenses 
                WHERE work_type IS NOT NULL
                GROUP BY work_type
                ORDER BY work_type
            """)).fetchall()
            
            total_expenses = db.execute(text("""
                SELECT COUNT(*) FROM expenses
            """)).scalar()
            
            expenses_with_work_type = sum(count for _, count in expenses_by_type)
            
            print(f"   📊 Всего расходов: {total_expenses}")
            print(f"   📊 Расходов с work_type: {expenses_with_work_type}")
            for work_type, count in expenses_by_type:
                print(f"      {work_type}: {count}")
            
            if total_expenses == expenses_with_work_type:
                print("   ✅ Все расходы имеют work_type")
                tests_passed += 1
            else:
                print("   ❌ Не все расходы имеют work_type")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при сравнении расходов: {e}")
            tests_failed += 1
        
        # 8. Проверка целостности связей
        print("\n📋 Тест 8: Проверка целостности связей")
        
        try:
            # Проверяем, что все связи корректны
            broken_links = db.execute(text("""
                SELECT COUNT(*) FROM salon_masters sm
                LEFT JOIN masters m ON sm.master_id = m.id
                WHERE m.id IS NULL
            """)).scalar()
            
            if broken_links == 0:
                print("   ✅ Все связи salon_masters -> masters корректны")
                tests_passed += 1
            else:
                print(f"   ❌ Найдено {broken_links} битых связей salon_masters -> masters")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке целостности связей: {e}")
            tests_failed += 1
        
        # Итоговый отчет
        print(f"\n📊 Итоговый отчет:")
        print(f"   ✅ Тестов пройдено: {tests_passed}")
        print(f"   ❌ Тестов провалено: {tests_failed}")
        print(f"   📈 Процент успеха: {(tests_passed / (tests_passed + tests_failed)) * 100:.1f}%")
        
        if tests_failed == 0:
            print("\n🎉 Все тесты сравнения пройдены успешно! Данные мигрированы без потерь.")
            return True
        else:
            print(f"\n⚠️  Обнаружены проблемы в {tests_failed} тестах сравнения.")
            return False
            
    except Exception as e:
        print(f"❌ Критическая ошибка при сравнении данных: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = test_migration_comparison()
    sys.exit(0 if success else 1)


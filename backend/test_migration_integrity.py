#!/usr/bin/env python3
"""
Тестовый скрипт для проверки целостности данных после миграции
Проверяет, что все данные корректно мигрированы в новую структуру
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

def test_migration_integrity():
    """Проверка целостности данных после миграции"""
    
    print("🧪 Начинаем проверку целостности данных после миграции...")
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    tests_passed = 0
    tests_failed = 0
    
    try:
        # 1. Проверка структуры базы данных
        print("\n📋 Тест 1: Проверка структуры базы данных")
        
        # Проверяем существование новых таблиц
        new_tables = ['salon_masters', 'indie_masters']
        for table in new_tables:
            try:
                result = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                print(f"   ✅ Таблица {table} существует, записей: {result}")
                tests_passed += 1
            except Exception as e:
                print(f"   ❌ Таблица {table} не найдена: {e}")
                tests_failed += 1
        
        # 2. Проверка миграции мастеров в салонах
        print("\n📋 Тест 2: Проверка миграции мастеров в салонах")
        
        try:
            # Проверяем, что все мастера с can_work_in_salon = True мигрированы
            masters_with_salon_work = db.execute(text("""
                SELECT COUNT(*) FROM masters 
                WHERE can_work_in_salon = true
            """)).scalar()
            
            salon_masters_count = db.execute(text("""
                SELECT COUNT(*) FROM salon_masters
            """)).scalar()
            
            if masters_with_salon_work == salon_masters_count:
                print(f"   ✅ Все мастера с работой в салоне мигрированы: {salon_masters_count}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: мастеров с работой в салоне: {masters_with_salon_work}, мигрировано: {salon_masters_count}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке мастеров в салонах: {e}")
            tests_failed += 1
        
        # 3. Проверка миграции независимых мастеров
        print("\n📋 Тест 3: Проверка миграции независимых мастеров")
        
        try:
            # Проверяем, что все мастера с can_work_independently = True мигрированы
            masters_with_indie_work = db.execute(text("""
                SELECT COUNT(*) FROM masters 
                WHERE can_work_independently = true
            """)).scalar()
            
            indie_masters_count = db.execute(text("""
                SELECT COUNT(*) FROM indie_masters
            """)).scalar()
            
            if masters_with_indie_work == indie_masters_count:
                print(f"   ✅ Все независимые мастера мигрированы: {indie_masters_count}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: независимых мастеров: {masters_with_indie_work}, мигрировано: {indie_masters_count}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке независимых мастеров: {e}")
            tests_failed += 1
        
        # 4. Проверка миграции бронирований
        print("\n📋 Тест 4: Проверка миграции бронирований")
        
        try:
            # Проверяем, что все бронирования имеют work_type
            bookings_with_work_type = db.execute(text("""
                SELECT COUNT(*) FROM bookings 
                WHERE work_type IS NOT NULL
            """)).scalar()
            
            total_bookings = db.execute(text("""
                SELECT COUNT(*) FROM bookings
            """)).scalar()
            
            if bookings_with_work_type == total_bookings:
                print(f"   ✅ Все бронирования имеют work_type: {total_bookings}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: бронирований с work_type: {bookings_with_work_type}, всего: {total_bookings}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке бронирований: {e}")
            tests_failed += 1
        
        # 5. Проверка миграции услуг
        print("\n📋 Тест 5: Проверка миграции услуг")
        
        try:
            # Проверяем, что все услуги имеют work_type
            services_with_work_type = db.execute(text("""
                SELECT COUNT(*) FROM services 
                WHERE work_type IS NOT NULL
            """)).scalar()
            
            total_services = db.execute(text("""
                SELECT COUNT(*) FROM services
            """)).scalar()
            
            if services_with_work_type == total_services:
                print(f"   ✅ Все услуги имеют work_type: {total_services}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: услуг с work_type: {services_with_work_type}, всего: {total_services}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке услуг: {e}")
            tests_failed += 1
        
        # 6. Проверка миграции ограничений клиентов
        print("\n📋 Тест 6: Проверка миграции ограничений клиентов")
        
        try:
            # Проверяем, что все ограничения имеют work_type
            restrictions_with_work_type = db.execute(text("""
                SELECT COUNT(*) FROM client_restrictions 
                WHERE work_type IS NOT NULL
            """)).scalar()
            
            total_restrictions = db.execute(text("""
                SELECT COUNT(*) FROM client_restrictions
            """)).scalar()
            
            if restrictions_with_work_type == total_restrictions:
                print(f"   ✅ Все ограничения имеют work_type: {total_restrictions}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: ограничений с work_type: {restrictions_with_work_type}, всего: {total_restrictions}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке ограничений: {e}")
            tests_failed += 1
        
        # 7. Проверка миграции доходов
        print("\n📋 Тест 7: Проверка миграции доходов")
        
        try:
            # Проверяем, что все доходы имеют work_type
            incomes_with_work_type = db.execute(text("""
                SELECT COUNT(*) FROM incomes 
                WHERE work_type IS NOT NULL
            """)).scalar()
            
            total_incomes = db.execute(text("""
                SELECT COUNT(*) FROM incomes
            """)).scalar()
            
            if incomes_with_work_type == total_incomes:
                print(f"   ✅ Все доходы имеют work_type: {total_incomes}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: доходов с work_type: {incomes_with_work_type}, всего: {total_incomes}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке доходов: {e}")
            tests_failed += 1
        
        # 8. Проверка миграции расходов
        print("\n📋 Тест 8: Проверка миграции расходов")
        
        try:
            # Проверяем, что все расходы имеют work_type
            expenses_with_work_type = db.execute(text("""
                SELECT COUNT(*) FROM expenses 
                WHERE work_type IS NOT NULL
            """)).scalar()
            
            total_expenses = db.execute(text("""
                SELECT COUNT(*) FROM expenses
            """)).scalar()
            
            if expenses_with_work_type == total_expenses:
                print(f"   ✅ Все расходы имеют work_type: {total_expenses}")
                tests_passed += 1
            else:
                print(f"   ❌ Несоответствие: расходов с work_type: {expenses_with_work_type}, всего: {total_expenses}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке расходов: {e}")
            tests_failed += 1
        
        # 9. Проверка ролей пользователей
        print("\n📋 Тест 9: Проверка ролей пользователей")
        
        try:
            # Проверяем, что нет пользователей с ролью INDIE
            indie_users_count = db.execute(text("""
                SELECT COUNT(*) FROM users 
                WHERE role = 'indie'
            """)).scalar()
            
            if indie_users_count == 0:
                print(f"   ✅ Нет пользователей с ролью INDIE: {indie_users_count}")
                tests_passed += 1
            else:
                print(f"   ❌ Найдены пользователи с ролью INDIE: {indie_users_count}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке ролей пользователей: {e}")
            tests_failed += 1
        
        # 10. Проверка индексов
        print("\n📋 Тест 10: Проверка индексов")
        
        try:
            # Проверяем, что индексы созданы
            indexes = [
                'idx_salon_masters_master',
                'idx_salon_masters_salon',
                'idx_indie_masters_master',
                'idx_indie_masters_domain'
            ]
            
            for index in indexes:
                try:
                    db.execute(text(f"SELECT 1 FROM pg_indexes WHERE indexname = '{index}'"))
                    print(f"   ✅ Индекс {index} существует")
                    tests_passed += 1
                except:
                    print(f"   ❌ Индекс {index} не найден")
                    tests_failed += 1
                    
        except Exception as e:
            print(f"   ❌ Ошибка при проверке индексов: {e}")
            tests_failed += 1
        
        # Итоговый отчет
        print(f"\n📊 Итоговый отчет:")
        print(f"   ✅ Тестов пройдено: {tests_passed}")
        print(f"   ❌ Тестов провалено: {tests_failed}")
        print(f"   📈 Процент успеха: {(tests_passed / (tests_passed + tests_failed)) * 100:.1f}%")
        
        if tests_failed == 0:
            print("\n🎉 Все тесты пройдены успешно! Миграция выполнена корректно.")
            return True
        else:
            print(f"\n⚠️  Обнаружены проблемы в {tests_failed} тестах. Требуется дополнительная проверка.")
            return False
            
    except Exception as e:
        print(f"❌ Критическая ошибка при проверке целостности: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = test_migration_integrity()
    sys.exit(0 if success else 1)


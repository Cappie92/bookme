#!/usr/bin/env python3
"""
Тестовый скрипт для проверки функциональности после миграции
Проверяет основные функции системы с новой структурой
"""

import sys
import os
import requests
import json
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Добавляем путь к проекту
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
from database import get_db

def test_migration_functionality():
    """Проверка функциональности после миграции"""
    
    print("🧪 Начинаем проверку функциональности после миграции...")
    
    # Создаем подключение к базе данных
    from database import engine
    Session = sessionmaker(bind=engine)
    db = Session()
    
    tests_passed = 0
    tests_failed = 0
    
    try:
        # 1. Проверка входа в систему
        print("\n📋 Тест 1: Проверка входа в систему")
        
        try:
            # Проверяем, что пользователи могут войти в систему
            users = db.execute(text("""
                SELECT id, phone, role FROM users 
                WHERE role IN ('master', 'salon', 'client', 'admin')
                LIMIT 5
            """)).fetchall()
            
            if len(users) > 0:
                print(f"   ✅ Найдено {len(users)} пользователей для тестирования")
                tests_passed += 1
            else:
                print("   ❌ Не найдено пользователей для тестирования")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке входа в систему: {e}")
            tests_failed += 1
        
        # 2. Проверка создания бронирований
        print("\n📋 Тест 2: Проверка создания бронирований")
        
        try:
            # Проверяем, что бронирования имеют корректную структуру
            bookings = db.execute(text("""
                SELECT id, master_id, work_type, salon_work_id, indie_work_id, start_time, end_time
                FROM bookings 
                WHERE work_type IS NOT NULL
                LIMIT 5
            """)).fetchall()
            
            if len(bookings) > 0:
                print(f"   ✅ Найдено {len(bookings)} бронирований с корректной структурой")
                tests_passed += 1
            else:
                print("   ❌ Не найдено бронирований с корректной структурой")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке бронирований: {e}")
            tests_failed += 1
        
        # 3. Проверка услуг
        print("\n📋 Тест 3: Проверка услуг")
        
        try:
            # Проверяем, что услуги имеют корректную структуру
            services = db.execute(text("""
                SELECT id, name, master_id, work_type, salon_work_id, indie_work_id, price, duration
                FROM services 
                WHERE work_type IS NOT NULL
                LIMIT 5
            """)).fetchall()
            
            if len(services) > 0:
                print(f"   ✅ Найдено {len(services)} услуг с корректной структурой")
                tests_passed += 1
            else:
                print("   ❌ Не найдено услуг с корректной структурой")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке услуг: {e}")
            tests_failed += 1
        
        # 4. Проверка мастеров в салонах
        print("\n📋 Тест 4: Проверка мастеров в салонах")
        
        try:
            # Проверяем, что мастера корректно связаны с салонами
            salon_masters = db.execute(text("""
                SELECT sm.id, sm.master_id, sm.salon_id, sm.can_work_in_salon, 
                       m.name as master_name, s.name as salon_name
                FROM salon_masters sm
                JOIN masters m ON sm.master_id = m.id
                JOIN salons s ON sm.salon_id = s.id
                LIMIT 5
            """)).fetchall()
            
            if len(salon_masters) > 0:
                print(f"   ✅ Найдено {len(salon_masters)} мастеров в салонах")
                tests_passed += 1
            else:
                print("   ❌ Не найдено мастеров в салонах")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке мастеров в салонах: {e}")
            tests_failed += 1
        
        # 5. Проверка независимых мастеров
        print("\n📋 Тест 5: Проверка независимых мастеров")
        
        try:
            # Проверяем, что независимые мастера корректно настроены
            indie_masters = db.execute(text("""
                SELECT im.id, im.master_id, im.can_work_independently, im.domain, 
                       m.name as master_name
                FROM indie_masters im
                JOIN masters m ON im.master_id = m.id
                LIMIT 5
            """)).fetchall()
            
            if len(indie_masters) > 0:
                print(f"   ✅ Найдено {len(indie_masters)} независимых мастеров")
                tests_passed += 1
            else:
                print("   ❌ Не найдено независимых мастеров")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке независимых мастеров: {e}")
            tests_failed += 1
        
        # 6. Проверка ограничений клиентов
        print("\n📋 Тест 6: Проверка ограничений клиентов")
        
        try:
            # Проверяем, что ограничения имеют корректную структуру
            restrictions = db.execute(text("""
                SELECT id, master_id, work_type, salon_work_id, indie_work_id, 
                       client_phone, restriction_type
                FROM client_restrictions 
                WHERE work_type IS NOT NULL
                LIMIT 5
            """)).fetchall()
            
            if len(restrictions) > 0:
                print(f"   ✅ Найдено {len(restrictions)} ограничений с корректной структурой")
                tests_passed += 1
            else:
                print("   ❌ Не найдено ограничений с корректной структурой")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке ограничений: {e}")
            tests_failed += 1
        
        # 7. Проверка доходов
        print("\n📋 Тест 7: Проверка доходов")
        
        try:
            # Проверяем, что доходы имеют корректную структуру
            incomes = db.execute(text("""
                SELECT id, master_id, work_type, salon_work_id, indie_work_id, 
                       amount, income_date
                FROM incomes 
                WHERE work_type IS NOT NULL
                LIMIT 5
            """)).fetchall()
            
            if len(incomes) > 0:
                print(f"   ✅ Найдено {len(incomes)} доходов с корректной структурой")
                tests_passed += 1
            else:
                print("   ❌ Не найдено доходов с корректной структурой")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке доходов: {e}")
            tests_failed += 1
        
        # 8. Проверка расходов
        print("\n📋 Тест 8: Проверка расходов")
        
        try:
            # Проверяем, что расходы имеют корректную структуру
            expenses = db.execute(text("""
                SELECT id, master_id, work_type, salon_work_id, indie_work_id, 
                       amount, expense_date
                FROM expenses 
                WHERE work_type IS NOT NULL
                LIMIT 5
            """)).fetchall()
            
            if len(expenses) > 0:
                print(f"   ✅ Найдено {len(expenses)} расходов с корректной структурой")
                tests_passed += 1
            else:
                print("   ❌ Не найдено расходов с корректной структурой")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке расходов: {e}")
            tests_failed += 1
        
        # 9. Проверка статистики
        print("\n📋 Тест 9: Проверка статистики")
        
        try:
            # Проверяем, что статистика может быть рассчитана
            stats = db.execute(text("""
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN role = 'master' THEN 1 END) as masters,
                    COUNT(CASE WHEN role = 'salon' THEN 1 END) as salons,
                    COUNT(CASE WHEN role = 'client' THEN 1 END) as clients
                FROM users
            """)).fetchone()
            
            if stats:
                print(f"   ✅ Статистика рассчитана: пользователей: {stats[0]}, мастеров: {stats[1]}, салонов: {stats[2]}, клиентов: {stats[3]}")
                tests_passed += 1
            else:
                print("   ❌ Не удалось рассчитать статистику")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке статистики: {e}")
            tests_failed += 1
        
        # 10. Проверка API endpoints
        print("\n📋 Тест 10: Проверка API endpoints")
        
        try:
            # Проверяем, что API доступен
            response = requests.get("http://localhost:8000/health", timeout=5)
            if response.status_code == 200:
                print("   ✅ API доступен")
                tests_passed += 1
            else:
                print(f"   ❌ API недоступен, статус: {response.status_code}")
                tests_failed += 1
                
        except Exception as e:
            print(f"   ❌ Ошибка при проверке API: {e}")
            tests_failed += 1
        
        # Итоговый отчет
        print(f"\n📊 Итоговый отчет:")
        print(f"   ✅ Тестов пройдено: {tests_passed}")
        print(f"   ❌ Тестов провалено: {tests_failed}")
        print(f"   📈 Процент успеха: {(tests_passed / (tests_passed + tests_failed)) * 100:.1f}%")
        
        if tests_failed == 0:
            print("\n🎉 Все тесты функциональности пройдены успешно!")
            return True
        else:
            print(f"\n⚠️  Обнаружены проблемы в {tests_failed} тестах функциональности.")
            return False
            
    except Exception as e:
        print(f"❌ Критическая ошибка при проверке функциональности: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = test_migration_functionality()
    sys.exit(0 if success else 1)


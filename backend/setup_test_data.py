#!/usr/bin/env python3
"""
Скрипт для настройки тестовых данных: связывание мастеров с салонами и услугами
"""

import sqlite3
from pathlib import Path

def setup_test_data():
    """Настраиваем тестовые данные"""
    
    # Путь к базе данных
    db_path = Path(__file__).parent / "bookme.db"
    
    print(f"🔧 Настройка тестовых данных в базе: {db_path}")
    
    # Подключаемся к базе
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Связываем мастеров с салоном 1
        print("\n1️⃣ Связываем мастеров с салоном 1...")
        
        # Получаем существующих мастеров
        cursor.execute("SELECT id FROM masters LIMIT 5")
        master_ids = [row[0] for row in cursor.fetchall()]
        
        print(f"   Найдено мастеров: {len(master_ids)}")
        
        # Создаем связи с салоном 1
        for master_id in master_ids:
            cursor.execute("""
                INSERT OR IGNORE INTO salon_masters (salon_id, master_id)
                VALUES (?, ?)
            """, (1, master_id))
            print(f"   Мастер {master_id} связан с салоном 1")
        
        # 2. Связываем мастеров с услугами
        print("\n2️⃣ Связываем мастеров с услугами...")
        
        # Получаем услуги салона 1
        cursor.execute("SELECT id FROM services WHERE salon_id = 1")
        service_ids = [row[0] for row in cursor.fetchall()]
        
        print(f"   Найдено услуг: {len(service_ids)}")
        
        # Каждый мастер может оказывать все услуги
        for master_id in master_ids:
            for service_id in service_ids:
                cursor.execute("""
                    INSERT OR IGNORE INTO master_services (master_id, service_id)
                    VALUES (?, ?)
                """, (master_id, service_id))
            print(f"   Мастер {master_id} может оказывать {len(service_ids)} услуг")
        
        # 3. Создаем слоты доступности для мастеров
        print("\n3️⃣ Создаем слоты доступности для мастеров...")
        
        # Рабочие дни: понедельник-пятница (1-5)
        working_days = [1, 2, 3, 4, 5]
        
        for master_id in master_ids:
            for day in working_days:
                # Рабочее время: 9:00 - 18:00
                cursor.execute("""
                    INSERT OR IGNORE INTO availability_slots 
                    (owner_type, owner_id, day_of_week, start_time, end_time)
                    VALUES (?, ?, ?, ?, ?)
                """, ('master', master_id, day, '09:00:00', '18:00:00'))
            print(f"   Мастер {master_id}: доступен в дни {working_days}")
        
        # 4. Проверяем результат
        print("\n4️⃣ Проверяем результат...")
        
        # Проверяем связи мастер-салон
        cursor.execute("SELECT COUNT(*) FROM salon_masters WHERE salon_id = 1")
        salon_masters_count = cursor.fetchone()[0]
        print(f"   Мастеров в салоне 1: {salon_masters_count}")
        
        # Проверяем связи мастер-услуга
        cursor.execute("SELECT COUNT(*) FROM master_services")
        master_services_count = cursor.fetchone()[0]
        print(f"   Связей мастер-услуга: {master_services_count}")
        
        # Проверяем слоты доступности
        cursor.execute("SELECT COUNT(*) FROM availability_slots WHERE owner_type = 'master'")
        availability_slots_count = cursor.fetchone()[0]
        print(f"   Слотов доступности мастеров: {availability_slots_count}")
        
        # Сохраняем изменения
        conn.commit()
        print("\n✅ Тестовые данные успешно настроены!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    setup_test_data()

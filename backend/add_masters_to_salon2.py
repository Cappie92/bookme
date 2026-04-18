#!/usr/bin/env python3
"""
Скрипт для добавления мастеров в салон 2
"""

import sqlite3
from pathlib import Path

def add_masters_to_salon2():
    """Добавляем мастеров в салон 2"""
    
    # Путь к базе данных
    db_path = Path(__file__).parent / "bookme.db"
    
    print(f"🔧 Добавление мастеров в салон 2: {db_path}")
    
    # Подключаемся к базе
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Создаем новых пользователей-мастеров для салона 2
        print("\n1️⃣ Создаем пользователей-мастеров для салона 2...")
        
        salon2_masters_data = [
            ("+79435774", "Мастер Салон 2-1"),
            ("+79417916", "Мастер Салон 2-2"), 
            ("+79413566", "Мастер Салон 2-3"),
            ("+79872824", "Мастер Салон 2-4"),
            ("+79097988", "Мастер Салон 2-5")
        ]
        
        created_masters = []
        
        for phone, full_name in salon2_masters_data:
            # Создаем пользователя
            cursor.execute("""
                INSERT INTO users (phone, full_name, role, is_active, created_at)
                VALUES (?, ?, 'master', 1, datetime('now'))
            """, (phone, full_name))
            
            user_id = cursor.lastrowid
            print(f"   ✅ Создан пользователь: {full_name} (ID: {user_id})")
            
            # Создаем мастера
            cursor.execute("""
                INSERT INTO masters (user_id, bio, experience_years, created_at)
                VALUES (?, 'Опытный мастер салона красоты', 3, datetime('now'))
            """, (user_id,))
            
            master_id = cursor.lastrowid
            print(f"   ✅ Создан мастер: ID {master_id}")
            
            # Связываем мастера с салоном 2
            cursor.execute("""
                INSERT INTO salon_masters (salon_id, master_id)
                VALUES (2, ?)
            """, (master_id,))
            
            print(f"   ✅ Мастер {master_id} связан с салоном 2")
            
            created_masters.append((master_id, user_id, full_name))
        
        # 2. Связываем мастеров с услугами салона 2
        print("\n2️⃣ Связываем мастеров с услугами салона 2...")
        
        # Получаем услуги салона 2
        cursor.execute("SELECT id FROM services WHERE salon_id = 2")
        service_ids = [row[0] for row in cursor.fetchall()]
        
        print(f"   Найдено услуг: {len(service_ids)}")
        
        # Каждый мастер может оказывать все услуги
        for master_id, user_id, full_name in created_masters:
            for service_id in service_ids:
                cursor.execute("""
                    INSERT OR IGNORE INTO master_services (master_id, service_id)
                    VALUES (?, ?)
                """, (master_id, service_id))
            print(f"   Мастер {full_name} может оказывать {len(service_ids)} услуг")
        
        # 3. Создаем слоты доступности для мастеров
        print("\n3️⃣ Создаем слоты доступности для мастеров...")
        
        # Рабочие дни: понедельник-пятница (1-5)
        working_days = [1, 2, 3, 4, 5]
        
        for master_id, user_id, full_name in created_masters:
            for day in working_days:
                # Рабочее время: 9:00 - 18:00
                cursor.execute("""
                    INSERT OR IGNORE INTO availability_slots 
                    (owner_type, owner_id, day_of_week, start_time, end_time)
                    VALUES (?, ?, ?, ?, ?)
                """, ('master', master_id, day, '09:00:00', '18:00:00'))
            print(f"   Мастер {full_name}: доступен в дни {working_days}")
        
        # 4. Проверяем результат
        print("\n4️⃣ Проверяем результат...")
        
        # Проверяем связи мастер-салон
        cursor.execute("SELECT COUNT(*) FROM salon_masters WHERE salon_id = 2")
        salon_masters_count = cursor.fetchone()[0]
        print(f"   Мастеров в салоне 2: {salon_masters_count}")
        
        # Проверяем связи мастер-услуга
        cursor.execute("""
            SELECT COUNT(*) FROM master_services ms
            JOIN masters m ON ms.master_id = m.id
            JOIN salon_masters sm ON m.id = sm.master_id
            WHERE sm.salon_id = 2
        """)
        master_services_count = cursor.fetchone()[0]
        print(f"   Связей мастер-услуга для салона 2: {master_services_count}")
        
        # Проверяем слоты доступности
        cursor.execute("""
            SELECT COUNT(*) FROM availability_slots a
            JOIN masters m ON a.owner_id = m.id
            JOIN salon_masters sm ON m.id = sm.master_id
            WHERE sm.salon_id = 2 AND a.owner_type = 'master'
        """)
        availability_slots_count = cursor.fetchone()[0]
        print(f"   Слотов доступности мастеров салона 2: {availability_slots_count}")
        
        # Сохраняем изменения
        conn.commit()
        print("\n✅ Мастера успешно добавлены в салон 2!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    print("➕ Добавление мастеров в салон 2")
    print("="*50)
    
    add_masters_to_salon2()
    
    print("\n🎉 Добавление мастеров завершено!")


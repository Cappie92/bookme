#!/usr/bin/env python3
"""
Аудит расписания мастера - выясняем где хранится расписание работы в салоне
"""

import sqlite3
from datetime import datetime

def audit_master_schedule():
    conn = sqlite3.connect('bookme.db')
    cursor = conn.cursor()
    
    print("=" * 80)
    print("АУДИТ РАСПИСАНИЯ МАСТЕРА")
    print("=" * 80)
    
    # 1. Проверяем таблицы в базе данных
    print("\n1. ТАБЛИЦЫ В БАЗЕ ДАННЫХ:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    for table in tables:
        print(f"  - {table[0]}")
    
    # 2. Проверяем структуру таблицы master_schedules
    print("\n2. СТРУКТУРА ТАБЛИЦЫ master_schedules:")
    cursor.execute("PRAGMA table_info(master_schedules)")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")
    
    # 3. Проверяем все записи мастера 13
    print("\n3. ВСЕ ЗАПИСИ МАСТЕРА 13 В master_schedules:")
    cursor.execute("SELECT * FROM master_schedules WHERE master_id = 13 ORDER BY date, start_time")
    all_schedules = cursor.fetchall()
    print(f"Найдено записей: {len(all_schedules)}")
    for s in all_schedules:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    # 4. Проверяем расписание на 24 сентября
    print("\n4. РАСПИСАНИЕ НА 24 СЕНТЯБРЯ 2025:")
    cursor.execute("SELECT * FROM master_schedules WHERE master_id = 13 AND date = '2025-09-24'")
    sept_24 = cursor.fetchall()
    print(f"Найдено записей на 24.09: {len(sept_24)}")
    for s in sept_24:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    # 5. Проверяем расписание на 23 сентября
    print("\n5. РАСПИСАНИЕ НА 23 СЕНТЯБРЯ 2025:")
    cursor.execute("SELECT * FROM master_schedules WHERE master_id = 13 AND date = '2025-09-23'")
    sept_23 = cursor.fetchall()
    print(f"Найдено записей на 23.09: {len(sept_23)}")
    for s in sept_23:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    # 6. Проверяем все записи с salon_id = 1
    print("\n6. ВСЕ ЗАПИСИ С SALON_ID = 1:")
    cursor.execute("SELECT * FROM master_schedules WHERE salon_id = 1 ORDER BY date, start_time")
    salon_schedules = cursor.fetchall()
    print(f"Найдено записей: {len(salon_schedules)}")
    for s in salon_schedules:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    # 7. Проверяем все записи с salon_id IS NULL (личное расписание)
    print("\n7. ВСЕ ЗАПИСИ С SALON_ID IS NULL (личное расписание):")
    cursor.execute("SELECT * FROM master_schedules WHERE salon_id IS NULL ORDER BY date, start_time")
    personal_schedules = cursor.fetchall()
    print(f"Найдено записей: {len(personal_schedules)}")
    for s in personal_schedules:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    # 8. Проверяем таблицу availability_slots
    print("\n8. ПРОВЕРЯЕМ ТАБЛИЦУ availability_slots:")
    cursor.execute("SELECT * FROM availability_slots WHERE owner_id = 13")
    availability_slots = cursor.fetchall()
    print(f"Найдено слотов доступности: {len(availability_slots)}")
    for slot in availability_slots:
        print(f"  ID: {slot[0]}, Owner Type: {slot[1]}, Owner ID: {slot[2]}, Day: {slot[3]}, Start: {slot[4]}, End: {slot[5]}")
    
    # 9. Проверяем таблицу master_schedule_settings
    print("\n9. ПРОВЕРЯЕМ ТАБЛИЦУ master_schedule_settings:")
    cursor.execute("SELECT * FROM master_schedule_settings WHERE master_id = 13")
    schedule_settings = cursor.fetchall()
    print(f"Найдено настроек расписания: {len(schedule_settings)}")
    for setting in schedule_settings:
        print(f"  ID: {setting[0]}, Master: {setting[1]}, Type: {setting[2]}, Data: {setting[3]}")
    
    # 10. Проверяем последние записи в master_schedules
    print("\n10. ПОСЛЕДНИЕ 10 ЗАПИСЕЙ В master_schedules:")
    cursor.execute("SELECT * FROM master_schedules ORDER BY id DESC LIMIT 10")
    recent_schedules = cursor.fetchall()
    for s in recent_schedules:
        print(f"  ID: {s[0]}, Master: {s[1]}, Salon: {s[2]}, Date: {s[3]}, Start: {s[4]}, End: {s[5]}, Available: {s[6]}")
    
    conn.close()
    print("\n" + "=" * 80)
    print("АУДИТ ЗАВЕРШЕН")
    print("=" * 80)

if __name__ == "__main__":
    audit_master_schedule()

#!/usr/bin/env python3
"""
Скрипт для исправления формата данных в таблице master_schedules
Заполняет поля date, start_time, end_time на основе available
"""

import sqlite3
from datetime import datetime, timedelta
import re

def fix_schedule_data():
    conn = sqlite3.connect('bookme.db')
    cursor = conn.cursor()
    
    print("=" * 80)
    print("ИСПРАВЛЕНИЕ ФОРМАТА ДАННЫХ В master_schedules")
    print("=" * 80)
    
    # 1. Получаем все записи с NULL значениями
    cursor.execute("""
        SELECT id, master_id, salon_id, available, created_at
        FROM master_schedules 
        WHERE date IS NULL OR start_time IS NULL OR end_time IS NULL
        ORDER BY id
    """)
    
    records = cursor.fetchall()
    print(f"\nНайдено записей для исправления: {len(records)}")
    
    if len(records) == 0:
        print("Все записи уже в правильном формате!")
        conn.close()
        return
    
    # 2. Обрабатываем каждую запись
    fixed_count = 0
    for record in records:
        record_id, master_id, salon_id, available, created_at = record
        
        print(f"\nОбрабатываем запись ID {record_id}:")
        print(f"  Master: {master_id}, Salon: {salon_id}")
        print(f"  Available: {available}")
        print(f"  Created: {created_at}")
        
        if not available:
            print("  ⚠️  Пропускаем - нет данных в available")
            continue
        
        # Парсим available (формат: "09:00-18:00")
        time_match = re.match(r'(\d{2}):(\d{2})-(\d{2}):(\d{2})', available)
        if not time_match:
            print(f"  ⚠️  Пропускаем - неверный формат available: {available}")
            continue
        
        start_hour, start_min, end_hour, end_min = time_match.groups()
        start_time = f"{start_hour}:{start_min}:00"
        end_time = f"{end_hour}:{end_min}:00"
        
        # Определяем дату на основе created_at
        if created_at:
            # Если есть created_at, используем его
            created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            date = created_date.strftime('%Y-%m-%d')
        else:
            # Если нет created_at, используем сегодняшнюю дату
            date = datetime.now().strftime('%Y-%m-%d')
        
        print(f"  ✅ Обновляем: date={date}, start_time={start_time}, end_time={end_time}")
        
        # 3. Обновляем запись
        cursor.execute("""
            UPDATE master_schedules 
            SET date = ?, start_time = ?, end_time = ?
            WHERE id = ?
        """, (date, start_time, end_time, record_id))
        
        fixed_count += 1
    
    # 4. Сохраняем изменения
    conn.commit()
    
    print(f"\n✅ Исправлено записей: {fixed_count}")
    
    # 5. Проверяем результат
    print("\nПроверяем результат:")
    cursor.execute("""
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN date IS NOT NULL THEN 1 END) as with_date,
               COUNT(CASE WHEN start_time IS NOT NULL THEN 1 END) as with_start_time,
               COUNT(CASE WHEN end_time IS NOT NULL THEN 1 END) as with_end_time
        FROM master_schedules
    """)
    
    stats = cursor.fetchone()
    print(f"  Всего записей: {stats[0]}")
    print(f"  С датой: {stats[1]}")
    print(f"  С временем начала: {stats[2]}")
    print(f"  С временем окончания: {stats[3]}")
    
    # 6. Показываем примеры исправленных записей
    print("\nПримеры исправленных записей:")
    cursor.execute("""
        SELECT id, master_id, salon_id, date, start_time, end_time, available
        FROM master_schedules 
        WHERE date IS NOT NULL
        ORDER BY id
        LIMIT 5
    """)
    
    examples = cursor.fetchall()
    for ex in examples:
        print(f"  ID {ex[0]}: Master {ex[1]}, Salon {ex[2]}, Date {ex[3]}, Time {ex[4]}-{ex[5]}, Available {ex[6]}")
    
    conn.close()
    print("\n🎉 Исправление завершено!")

if __name__ == "__main__":
    fix_schedule_data()

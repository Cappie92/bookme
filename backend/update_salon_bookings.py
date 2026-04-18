#!/usr/bin/env python3
"""
Скрипт для обновления существующих записей салона:
- Назначает мастеров для записей без мастера
- Добавляет заметки о том, что услугу предоставлял "Любой мастер"
"""

import sqlite3
from pathlib import Path
from datetime import datetime
import random

def update_salon_bookings():
    """Обновляем записи салона, назначая мастеров"""
    
    # Путь к базе данных
    db_path = Path(__file__).parent / "bookme.db"
    
    print(f"🔧 Обновление записей салона в базе: {db_path}")
    
    # Подключаемся к базе
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Получаем все записи салона без мастера
        print("\n1️⃣ Получаем записи салона без мастера...")
        
        cursor.execute("""
            SELECT id, salon_id, service_id, start_time, end_time, status, notes
            FROM bookings 
            WHERE salon_id IS NOT NULL AND master_id IS NULL
            ORDER BY salon_id, start_time
        """)
        
        bookings = cursor.fetchall()
        print(f"   Найдено записей: {len(bookings)}")
        
        if not bookings:
            print("   Нет записей для обновления")
            return
        
        # 2. Получаем мастеров для каждого салона
        print("\n2️⃣ Получаем мастеров для каждого салона...")
        
        # Получаем мастеров салона 1
        cursor.execute("""
            SELECT m.id, m.user_id, u.full_name
            FROM masters m
            JOIN users u ON m.user_id = u.id
            JOIN salon_masters sm ON m.id = sm.master_id
            WHERE sm.salon_id = 1
        """)
        salon1_masters = cursor.fetchall()
        print(f"   Мастеров в салоне 1: {len(salon1_masters)}")
        
        # Получаем мастеров салона 2
        cursor.execute("""
            SELECT m.id, m.user_id, u.full_name
            FROM masters m
            JOIN users u ON m.user_id = u.id
            JOIN salon_masters sm ON m.id = sm.master_id
            WHERE sm.salon_id = 2
        """)
        salon2_masters = cursor.fetchall()
        print(f"   Мастеров в салоне 2: {len(salon2_masters)}")
        
        # 3. Обновляем каждую запись
        print("\n3️⃣ Обновляем записи, назначая мастеров...")
        
        updated_count = 0
        skipped_count = 0
        
        for booking in bookings:
            booking_id, salon_id, service_id, start_time, end_time, status, notes = booking
            
            # Выбираем мастера для салона
            if salon_id == 1:
                available_masters = salon1_masters
            elif salon_id == 2:
                available_masters = salon2_masters
            else:
                print(f"   ⚠️ Неизвестный салон {salon_id} для записи {booking_id}")
                skipped_count += 1
                continue
            
            if not available_masters:
                print(f"   ⚠️ Нет мастеров в салоне {salon_id} для записи {booking_id} - пропускаем")
                skipped_count += 1
                continue
            
            # Выбираем случайного мастера
            selected_master = random.choice(available_masters)
            master_id, user_id, master_name = selected_master
            
            # Формируем новую заметку
            if notes:
                new_notes = f"{notes}\n\nУслугу предоставлял: Любой мастер ({master_name})"
            else:
                new_notes = f"Услугу предоставлял: Любой мастер ({master_name})"
            
            try:
                # Обновляем запись
                print(f"   🔍 Отладка: master_id={master_id}, notes='{new_notes[:50]}...', booking_id={booking_id}")
                
                cursor.execute("""
                    UPDATE bookings 
                    SET master_id = ?, notes = ?
                    WHERE id = ?
                """, (master_id, new_notes, booking_id))
                
                print(f"   ✅ Запись {booking_id}: назначен мастер {master_name} (ID: {master_id})")
                updated_count += 1
                
            except Exception as e:
                print(f"   ❌ Ошибка обновления записи {booking_id}: {e}")
                print(f"   🔍 Параметры: master_id={master_id}, notes_length={len(new_notes)}, booking_id={booking_id}")
                skipped_count += 1
                continue
        
        # 4. Проверяем результат
        print(f"\n4️⃣ Результат обновления:")
        print(f"   Обновлено записей: {updated_count}")
        print(f"   Пропущено записей: {skipped_count}")
        
        # Проверяем, сколько записей осталось без мастера
        cursor.execute("""
            SELECT COUNT(*) FROM bookings 
            WHERE salon_id IS NOT NULL AND master_id IS NULL
        """)
        remaining_count = cursor.fetchone()[0]
        print(f"   Осталось записей без мастера: {remaining_count}")
        
        # Сохраняем изменения
        conn.commit()
        print("\n✅ Обновление записей завершено успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

def show_updated_bookings():
    """Показываем обновленные записи"""
    
    db_path = Path(__file__).parent / "bookme.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("\n📋 Примеры обновленных записей:")
        
        cursor.execute("""
            SELECT b.id, b.salon_id, b.service_id, b.master_id, b.start_time, b.status, b.notes
            FROM bookings b
            WHERE b.salon_id IS NOT NULL AND b.master_id IS NOT NULL
            ORDER BY b.start_time DESC
            LIMIT 5
        """)
        
        bookings = cursor.fetchall()
        
        for booking in bookings:
            booking_id, salon_id, service_id, master_id, start_time, status, notes = booking
            
            # Получаем имя мастера
            cursor.execute("""
                SELECT u.full_name FROM masters m 
                JOIN users u ON m.user_id = u.id 
                WHERE m.id = ?
            """, (master_id,))
            master_name_result = cursor.fetchone()
            master_name = master_name_result[0] if master_name_result else f"Мастер {master_id}"
            
            print(f"\n   📅 Запись {booking_id}:")
            print(f"      Салон: {salon_id}")
            print(f"      Услуга: {service_id}")
            print(f"      Мастер: {master_name} (ID: {master_id})")
            print(f"      Время: {start_time}")
            print(f"      Статус: {status}")
            if notes:
                print(f"      Заметки: {notes[:100]}...")
        
    except Exception as e:
        print(f"❌ Ошибка при показе записей: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    print("🔄 Обновление существующих записей салона")
    print("="*60)
    
    update_salon_bookings()
    show_updated_bookings()
    
    print("\n🎉 Обновление завершено!")

#!/usr/bin/env python3
"""
Скрипт для обновления тестовых данных с новыми статусами бронирований.
Обновляет существующие записи в соответствии с новой логикой статусов.
"""

import sqlite3
from datetime import datetime, timedelta
import random

def update_booking_statuses():
    """Обновляет статусы бронирований в соответствии с новой логикой."""
    
    # Подключаемся к базе данных
    conn = sqlite3.connect('backend/bookme.db')
    cursor = conn.cursor()
    
    print("🔄 Обновление статусов бронирований...")
    
    # Получаем все записи
    cursor.execute("""
        SELECT id, status, start_time, created_at 
        FROM bookings 
        ORDER BY start_time
    """)
    
    bookings = cursor.fetchall()
    print(f"📊 Найдено {len(bookings)} записей для обновления")
    
    updated_count = 0
    
    for booking_id, current_status, start_time, created_at in bookings:
        # Парсим время начала
        if isinstance(start_time, str):
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        else:
            start_dt = start_time
            
        current_time = datetime.utcnow()
        
        # Определяем новый статус на основе логики
        new_status = determine_new_status(current_status, start_dt, current_time)
        
        if new_status != current_status:
            # Обновляем статус
            cursor.execute("""
                UPDATE bookings 
                SET status = ?, updated_at = ?
                WHERE id = ?
            """, (new_status, current_time.isoformat(), booking_id))
            
            print(f"  ✅ Запись {booking_id}: {current_status} → {new_status}")
            updated_count += 1
        else:
            print(f"  ⏭️  Запись {booking_id}: статус {current_status} не изменен")
    
    # Применяем изменения
    conn.commit()
    conn.close()
    
    print(f"✅ Обновлено {updated_count} записей")
    return updated_count

def determine_new_status(current_status, start_time, current_time):
    """
    Определяет новый статус на основе текущего статуса и времени.
    
    Логика:
    - pending → created (если время еще не наступило)
    - pending → awaiting_confirmation (если время наступило)
    - confirmed → completed
    - cancelled остается cancelled
    """
    
    # Если статус уже новый, оставляем как есть
    if current_status in ['created', 'awaiting_confirmation', 'completed', 'cancelled']:
        return current_status
    
    # Переходная логика для старых статусов
    if current_status == 'pending':
        # Если время начала уже прошло более чем на 1 минуту
        if current_time >= start_time + timedelta(minutes=1):
            return 'awaiting_confirmation'
        else:
            return 'created'
    
    elif current_status == 'confirmed':
        return 'completed'
    
    # Для других статусов оставляем как есть
    return current_status

def create_sample_bookings():
    """Создает примеры записей с разными статусами для тестирования."""
    
    conn = sqlite3.connect('backend/bookme.db')
    cursor = conn.cursor()
    
    print("🔄 Создание примеров записей с новыми статусами...")
    
    # Получаем мастера
    cursor.execute("SELECT id FROM users WHERE role = 'master' LIMIT 1")
    master_result = cursor.fetchone()
    if not master_result:
        print("❌ Мастер не найден")
        return
    
    master_id = master_result[0]
    
    # Получаем клиента
    cursor.execute("SELECT id FROM users WHERE role = 'client' LIMIT 1")
    client_result = cursor.fetchone()
    if not client_result:
        print("❌ Клиент не найден")
        return
    
    client_id = client_result[0]
    
    # Получаем услугу мастера
    cursor.execute("SELECT id, duration, price FROM services WHERE indie_master_id = ? LIMIT 1", (master_id,))
    service_result = cursor.fetchone()
    if not service_result:
        print("❌ Услуга мастера не найдена")
        return
    
    service_id, service_duration, service_price = service_result
    
    current_time = datetime.utcnow()
    
    # Создаем примеры записей
    sample_bookings = [
        {
            'status': 'created',
            'start_time': current_time + timedelta(hours=2),  # Будущая запись
            'description': 'Будущая запись (статус: Создана)'
        },
        {
            'status': 'awaiting_confirmation', 
            'start_time': current_time - timedelta(minutes=30),  # Прошла 30 минут назад
            'description': 'Прошедшая запись на подтверждение'
        },
        {
            'status': 'completed',
            'start_time': current_time - timedelta(hours=2),  # Прошла 2 часа назад
            'description': 'Завершенная запись'
        },
        {
            'status': 'cancelled',
            'start_time': current_time + timedelta(hours=1),  # Будущая отмененная
            'cancellation_reason': 'client_requested',
            'description': 'Отмененная запись'
        }
    ]
    
    created_count = 0
    
    for booking_data in sample_bookings:
        start_time = booking_data['start_time']
        end_time = start_time + timedelta(minutes=service_duration)
        
        # Создаем запись
        cursor.execute("""
            INSERT INTO bookings (
                master_id, client_id, service_id, salon_id,
                start_time, end_time, status, payment_amount,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            master_id, client_id, service_id, None,
            start_time.isoformat(), end_time.isoformat(),
            booking_data['status'], service_price,
            current_time.isoformat(), current_time.isoformat()
        ))
        
        # Если запись отменена, добавляем причину отмены
        if booking_data['status'] == 'cancelled' and 'cancellation_reason' in booking_data:
            booking_id = cursor.lastrowid
            cursor.execute("""
                UPDATE bookings 
                SET cancelled_by_user_id = ?, cancellation_reason = ?
                WHERE id = ?
            """, (master_id, booking_data['cancellation_reason'], booking_id))
        
        print(f"  ✅ Создана запись: {booking_data['description']}")
        created_count += 1
    
    # Применяем изменения
    conn.commit()
    conn.close()
    
    print(f"✅ Создано {created_count} примеров записей")

def show_status_summary():
    """Показывает сводку по статусам записей."""
    
    conn = sqlite3.connect('backend/bookme.db')
    cursor = conn.cursor()
    
    print("\n📊 Сводка по статусам записей:")
    
    cursor.execute("""
        SELECT status, COUNT(*) as count
        FROM bookings
        GROUP BY status
        ORDER BY count DESC
    """)
    
    status_counts = cursor.fetchall()
    
    for status, count in status_counts:
        status_names = {
            'created': 'Создана',
            'awaiting_confirmation': 'На подтверждение', 
            'completed': 'Подтверждена',
            'cancelled': 'Отменена',
            'pending': 'Ожидает (старый)',
            'confirmed': 'Подтверждена (старый)'
        }
        
        status_name = status_names.get(status, status)
        print(f"  {status_name}: {count} записей")
    
    conn.close()

def main():
    """Основная функция скрипта."""
    
    print("🚀 Обновление тестовых данных с новыми статусами бронирований")
    print("=" * 60)
    
    try:
        # Обновляем существующие статусы
        updated_count = update_booking_statuses()
        
        # Создаем примеры записей
        create_sample_bookings()
        
        # Показываем сводку
        show_status_summary()
        
        print("\n✅ Обновление тестовых данных завершено успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка при обновлении тестовых данных: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())



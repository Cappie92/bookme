#!/usr/bin/env python3
"""
Скрипт для генерации тестовых записей мастера
Создает 100 записей с 1 марта 2025 по сегодняшний день
и 100 записей с сегодняшнего дня по 1 ноября 2025
"""

import sqlite3
import random
from datetime import datetime, timedelta
import json

def generate_test_bookings():
    # Подключаемся к базе данных
    conn = sqlite3.connect('bookme.db')
    cursor = conn.cursor()
    
    # Получаем ID мастера (первый мастер в базе)
    cursor.execute("SELECT id FROM users WHERE role = 'MASTER' LIMIT 1")
    master_result = cursor.fetchone()
    if not master_result:
        print("❌ Мастер не найден в базе данных")
        return
    
    master_id = master_result[0]
    print(f"📋 Генерируем записи для мастера ID: {master_id}")
    
    # Получаем услуги мастера
    cursor.execute("SELECT id, name, price, duration FROM services WHERE master_id = ?", (master_id,))
    services = cursor.fetchall()
    
    if not services:
        print("❌ У мастера нет услуг. Создаем тестовые услуги...")
        # Создаем тестовые услуги
        test_services = [
            ("Стрижка", 1500, 60),
            ("Окрашивание", 3000, 120),
            ("Укладка", 800, 45),
            ("Маникюр", 2000, 90),
            ("Педикюр", 2500, 120),
            ("Массаж", 2000, 60),
            ("Косметология", 4000, 90),
            ("Брови", 1500, 45),
            ("Ресницы", 3000, 120),
            ("Макияж", 2500, 90)
        ]
        
        for service_name, price, duration in test_services:
            cursor.execute("""
                INSERT INTO services (master_id, name, price, duration, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            """, (master_id, service_name, price, duration))
        
        conn.commit()
        
        # Получаем созданные услуги
        cursor.execute("SELECT id, name, price, duration FROM services WHERE master_id = ?", (master_id,))
        services = cursor.fetchall()
    
    print(f"📋 Найдено услуг: {len(services)}")
    
    # Генерируем клиентов
    cursor.execute("SELECT id FROM users WHERE role = 'CLIENT' LIMIT 20")
    client_ids = [row[0] for row in cursor.fetchall()]
    
    if not client_ids:
        print("❌ Клиенты не найдены в базе данных")
        return
    
    print(f"📋 Найдено клиентов: {len(client_ids)}")
    
    # Генерируем записи
    today = datetime.now()
    start_date = datetime(2025, 3, 1)
    end_date = datetime(2025, 11, 1)
    
    # 100 записей в прошлом (с 1 марта по сегодня)
    past_bookings = []
    current_date = start_date
    while current_date < today and len(past_bookings) < 100:
        # Генерируем случайное время в рабочее время (9:00 - 21:00)
        hour = random.randint(9, 20)
        minute = random.choice([0, 10, 20, 30, 40, 50])
        
        service = random.choice(services)
        client_id = random.choice(client_ids)
        
        start_time = current_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
        end_time = start_time + timedelta(minutes=service[3])
        
        past_bookings.append({
            'master_id': master_id,
            'client_id': client_id,
            'service_id': service[0],
            'start_time': start_time,
            'end_time': end_time,
            'duration': service[3],
            'price': service[2],
            'status': random.choice(['confirmed', 'completed', 'cancelled']),
            'notes': f'Тестовая запись - {service[1]}'
        })
        
        # Переходим к следующему дню с вероятностью 70%
        if random.random() < 0.7:
            current_date += timedelta(days=1)
        else:
            current_date += timedelta(days=random.randint(1, 3))
    
    # 100 записей в будущем (с сегодня по 1 ноября)
    future_bookings = []
    current_date = today
    while current_date < end_date and len(future_bookings) < 100:
        # Генерируем случайное время в рабочее время (9:00 - 21:00)
        hour = random.randint(9, 20)
        minute = random.choice([0, 10, 20, 30, 40, 50])
        
        service = random.choice(services)
        client_id = random.choice(client_ids)
        
        start_time = current_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
        end_time = start_time + timedelta(minutes=service[3])
        
        future_bookings.append({
            'master_id': master_id,
            'client_id': client_id,
            'service_id': service[0],
            'start_time': start_time,
            'end_time': end_time,
            'duration': service[3],
            'price': service[2],
            'status': random.choice(['confirmed', 'pending']),
            'notes': f'Тестовая запись - {service[1]}'
        })
        
        # Переходим к следующему дню с вероятностью 70%
        if random.random() < 0.7:
            current_date += timedelta(days=1)
        else:
            current_date += timedelta(days=random.randint(1, 3))
    
    # Вставляем записи в базу данных
    all_bookings = past_bookings + future_bookings
    
    for booking in all_bookings:
        cursor.execute("""
            INSERT INTO bookings (
                master_id, client_id, service_id, start_time, end_time, 
                status, notes, payment_amount, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (
            booking['master_id'],
            booking['client_id'],
            booking['service_id'],
            booking['start_time'].isoformat(),
            booking['end_time'].isoformat(),
            booking['status'],
            booking['notes'],
            booking['price']
        ))
    
    conn.commit()
    
    print(f"✅ Создано записей в прошлом: {len(past_bookings)}")
    print(f"✅ Создано записей в будущем: {len(future_bookings)}")
    print(f"✅ Всего создано записей: {len(all_bookings)}")
    
    # Статистика по месяцам
    print("\n📊 Статистика по месяцам:")
    cursor.execute("""
        SELECT 
            strftime('%Y-%m', start_time) as month,
            COUNT(*) as bookings_count,
            SUM(payment_amount) as total_income,
            AVG(payment_amount) as avg_price
        FROM bookings 
        WHERE master_id = ? 
        GROUP BY strftime('%Y-%m', start_time)
        ORDER BY month
    """, (master_id,))
    
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]} записей, {row[2]:.0f} ₽, средняя цена {row[3]:.0f} ₽")
    
    conn.close()
    print("\n🎉 Генерация тестовых данных завершена!")

if __name__ == "__main__":
    generate_test_bookings()

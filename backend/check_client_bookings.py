#!/usr/bin/env python3

from database import engine
from sqlalchemy import text

def check_client_bookings():
    try:
        with engine.connect() as conn:
            # Проверяем, есть ли пользователь с таким телефоном
            result = conn.execute(text("""
                SELECT id, email, full_name, phone 
                FROM users 
                WHERE phone = '+79735906386'
            """))
            user = result.fetchone()
            
            if not user:
                print("❌ Пользователь с телефоном +79735906386 не найден!")
                return
            
            user_id = user[0]
            print(f"✅ Найден пользователь: ID={user_id}, {user[1]}, {user[2]}, {user[3]}")
            
            # Проверяем все записи для этого пользователя
            result = conn.execute(text(f"""
                SELECT 
                    b.id,
                    b.start_time,
                    b.end_time,
                    b.status,
                    s.name as salon_name,
                    m.user_id as master_user_id,
                    im.user_id as indie_master_user_id,
                    sv.name as service_name
                FROM bookings b
                LEFT JOIN salons s ON b.salon_id = s.id
                LEFT JOIN masters m ON b.master_id = m.id
                LEFT JOIN indie_masters im ON b.indie_master_id = im.id
                LEFT JOIN services sv ON b.service_id = sv.id
                WHERE b.client_id = {user_id}
                ORDER BY b.start_time DESC
            """))
            
            bookings = result.fetchall()
            print(f"\n📅 Найдено записей: {len(bookings)}")
            
            if bookings:
                print("\n📋 Детали записей:")
                for booking in bookings:
                    print(f"  - ID: {booking[0]}")
                    print(f"    Время: {booking[1]} - {booking[2]}")
                    print(f"    Статус: {booking[3]}")
                    print(f"    Салон: {booking[4]}")
                    print(f"    Мастер: {booking[5] or booking[6] or 'Не указан'}")
                    print(f"    Услуга: {booking[7]}")
                    print()
            else:
                print("❌ Записи не найдены!")
                
            # Проверяем, есть ли записи с "Индивидуальный мастер 3"
            result = conn.execute(text(f"""
                SELECT COUNT(*) 
                FROM bookings b
                LEFT JOIN indie_masters im ON b.indie_master_id = im.id
                LEFT JOIN users u ON im.user_id = u.id
                WHERE b.client_id = {user_id} AND u.full_name = 'Индивидуальный мастер 3'
            """))
            
            indie_master_count = result.scalar()
            print(f"🎯 Записей к 'Индивидуальный мастер 3': {indie_master_count}")
            
    except Exception as e:
        print(f"❌ Ошибка: {e}")

if __name__ == "__main__":
    check_client_bookings()

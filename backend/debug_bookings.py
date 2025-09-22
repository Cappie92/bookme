from database import engine
from models import Booking, User, Master, Salon
from sqlalchemy.orm import sessionmaker
from datetime import datetime, date

def debug_bookings():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        print("=== ОТЛАДКА БРОНИРОВАНИЙ ===")
        
        # Получаем все бронирования
        all_bookings = db.query(Booking).all()
        print(f"Всего бронирований в базе: {len(all_bookings)}")
        
        for booking in all_bookings:
            print(f"ID: {booking.id}, Статус: {booking.status}, Время: {booking.start_time} - {booking.end_time}")
            print(f"  Мастер ID: {booking.master_id}, Салон ID: {booking.salon_id}")
            print(f"  Клиент ID: {booking.client_id}, Услуга ID: {booking.service_id}")
            print("---")
        
        # Проверяем конкретную дату (например, сегодня)
        today = date.today()
        start_of_day = datetime.combine(today, datetime.min.time())
        end_of_day = datetime.combine(today, datetime.max.time())
        
        print(f"\n=== БРОНИРОВАНИЯ НА {today} ===")
        today_bookings = db.query(Booking).filter(
            Booking.start_time >= start_of_day,
            Booking.end_time <= end_of_day
        ).all()
        
        print(f"Бронирований на {today}: {len(today_bookings)}")
        for booking in today_bookings:
            print(f"ID: {booking.id}, Статус: {booking.status}, Время: {booking.start_time} - {booking.end_time}")
        
        # Проверяем мастеров
        print(f"\n=== МАСТЕРЫ ===")
        masters = db.query(Master).all()
        for master in masters:
            print(f"Мастер ID: {master.id}, Пользователь ID: {master.user_id}")
        
        # Проверяем салоны
        print(f"\n=== САЛОНЫ ===")
        salons = db.query(Salon).all()
        for salon in salons:
            print(f"Салон ID: {salon.id}, Пользователь ID: {salon.user_id}")
            
    except Exception as e:
        print(f"Ошибка: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_bookings() 
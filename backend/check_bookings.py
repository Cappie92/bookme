import asyncio
from datetime import datetime, timedelta
from database import engine
from models import User, Service, Salon, Master, Booking, BookingStatus
from sqlalchemy.orm import sessionmaker

async def check_bookings():
    print("=== ПРОВЕРКА ВСЕХ БРОНИРОВАНИЙ ===\n")
    
    # Создаем сессию базы данных
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Получаем все бронирования
        bookings = db.query(Booking).all()
        
        print(f"Всего бронирований в базе: {len(bookings)}")
        
        if bookings:
            print("\nВсе бронирования:")
            for booking in bookings:
                print(f"  ID: {booking.id}")
                print(f"    Время: {booking.start_time} - {booking.end_time}")
                print(f"    Статус: {booking.status}")
                print(f"    Клиент: {booking.client_id}")
                print(f"    Мастер: {booking.master_id}")
                print(f"    Салон: {booking.salon_id}")
                print(f"    Услуга: {booking.service_id}")
                print()
        
        # Проверяем бронирования на 22.07.2025
        target_date = datetime(2025, 7, 22, 0, 0, 0)
        next_date = target_date + timedelta(days=1)
        
        date_bookings = db.query(Booking).filter(
            Booking.start_time >= target_date,
            Booking.start_time < next_date
        ).all()
        
        print(f"\nБронирования на {target_date.date()}: {len(date_bookings)}")
        
        if date_bookings:
            print("Бронирования на эту дату:")
            for booking in date_bookings:
                print(f"  ID: {booking.id}")
                print(f"    Время: {booking.start_time} - {booking.end_time}")
                print(f"    Статус: {booking.status}")
                print(f"    Клиент: {booking.client_id}")
                print(f"    Мастер: {booking.master_id}")
                print(f"    Салон: {booking.salon_id}")
                print(f"    Услуга: {booking.service_id}")
                print()
        
        # Проверяем бронирования мастера с ID 3
        master_bookings = db.query(Booking).filter(Booking.master_id == 3).all()
        
        print(f"\nБронирования мастера ID 3: {len(master_bookings)}")
        
        if master_bookings:
            print("Бронирования этого мастера:")
            for booking in master_bookings:
                print(f"  ID: {booking.id}")
                print(f"    Время: {booking.start_time} - {booking.end_time}")
                print(f"    Статус: {booking.status}")
                print(f"    Клиент: {booking.client_id}")
                print(f"    Мастер: {booking.master_id}")
                print(f"    Салон: {booking.salon_id}")
                print(f"    Услуга: {booking.service_id}")
                print()
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(check_bookings()) 
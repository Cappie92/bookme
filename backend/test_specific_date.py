import asyncio
from datetime import datetime, timedelta
from database import engine
from models import Service, Booking, AvailabilitySlot, OwnerType
from sqlalchemy.orm import sessionmaker
from services.scheduling import get_available_slots, check_booking_conflicts

async def test_specific_date():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        print("=== ТЕСТ КОНКРЕТНОЙ ДАТЫ ===\n")
        
        # Тестируем дату 22.07.2025 (как в вашем примере)
        test_date = datetime(2025, 7, 22, 0, 0, 0)
        print(f"Тестируем дату: {test_date.date()}")
        print(f"День недели: {test_date.weekday()} (0=понедельник)")
        
        # Получаем услугу
        service = db.query(Service).filter(Service.id == 1).first()
        print(f"Услуга: {service.name}, длительность: {service.duration} мин")
        
        # Получаем доступные слоты
        print("\n1. Получаем доступные слоты:")
        available_slots = get_available_slots(
            db, OwnerType.SALON, 1, test_date, service.duration
        )
        
        print(f"Доступных слотов: {len(available_slots)}")
        for i, slot in enumerate(available_slots[:10]):  # Показываем первые 10
            print(f"  Слот {i+1}: {slot['start_time'].strftime('%H:%M')} - {slot['end_time'].strftime('%H:%M')}")
        
        # Проверяем конкретный слот 9:00
        print(f"\n2. Проверяем слот 9:00:")
        start_time = datetime(2025, 7, 22, 9, 0, 0)
        end_time = start_time + timedelta(minutes=service.duration)
        
        has_conflict = check_booking_conflicts(
            db, start_time, end_time, OwnerType.SALON, 1
        )
        
        print(f"Слот {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
        print(f"Конфликт: {'ДА' if has_conflict else 'НЕТ'}")
        
        # Показываем все бронирования
        print(f"\n3. Все активные бронирования:")
        bookings = db.query(Booking).filter(
            Booking.salon_id == 1,
            Booking.status != "cancelled",
            Booking.status != "rejected"
        ).all()
        
        for booking in bookings:
            print(f"  Бронирование {booking.id}: {booking.start_time} - {booking.end_time}, статус: {booking.status}")
            print(f"    Дата: {booking.start_time.date()}")
            print(f"    Время: {booking.start_time.strftime('%H:%M')} - {booking.end_time.strftime('%H:%M')}")
        
        # Проверяем, есть ли бронирования на 22.07.2025
        print(f"\n4. Бронирования на {test_date.date()}:")
        bookings_on_date = db.query(Booking).filter(
            Booking.salon_id == 1,
            Booking.status != "cancelled",
            Booking.status != "rejected",
            Booking.start_time >= test_date,
            Booking.start_time < test_date + timedelta(days=1)
        ).all()
        
        print(f"Бронирований на эту дату: {len(bookings_on_date)}")
        for booking in bookings_on_date:
            print(f"  Бронирование {booking.id}: {booking.start_time.strftime('%H:%M')} - {booking.end_time.strftime('%H:%M')}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_specific_date()) 
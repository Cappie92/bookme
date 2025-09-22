import asyncio
from datetime import datetime, timedelta, time
from database import engine
from models import Service, Booking, AvailabilitySlot, OwnerType
from sqlalchemy.orm import sessionmaker
from services.scheduling import get_available_slots, _get_slots_for_duration, _is_slot_available

async def test_new_slots_logic():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        print("=== ТЕСТ НОВОЙ ЛОГИКИ СЛОТОВ ===\n")
        
        # Тестовые параметры
        test_date = datetime(2025, 7, 22, 0, 0, 0)  # Вторник
        master_id = 3
        service_id = 1
        
        print(f"Тестовая дата: {test_date.date()}")
        print(f"Мастер ID: {master_id}")
        print(f"Услуга ID: {service_id}")
        
        # Получаем услугу
        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            print("❌ Услуга не найдена")
            return
        
        print(f"Услуга: {service.name}, длительность: {service.duration} минут")
        
        # Получаем слоты доступности мастера
        availability_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id == master_id,
            AvailabilitySlot.day_of_week == test_date.weekday()
        ).all()
        
        print(f"\n1. Слоты доступности мастера:")
        for slot in availability_slots:
            print(f"  {slot.start_time} - {slot.end_time}")
        
        # Получаем существующие бронирования
        existing_bookings = db.query(Booking).filter(
            Booking.master_id == master_id,
            Booking.status != "cancelled",
            Booking.status != "rejected"
        ).all()
        
        print(f"\n2. Существующие бронирования:")
        for booking in existing_bookings:
            print(f"  Бронирование {booking.id}: {booking.start_time} - {booking.end_time}")
        
        # Тестируем функцию генерации слотов
        print(f"\n3. Тест генерации слотов для услуги {service.duration} мин:")
        for slot in availability_slots:
            possible_slots = _get_slots_for_duration(slot.start_time, slot.end_time, service.duration)
            print(f"  Для слота {slot.start_time} - {slot.end_time}:")
            for slot_time in possible_slots:
                is_available = _is_slot_available(slot_time, service.duration, existing_bookings, test_date)
                status = "✅" if is_available else "❌"
                slot_end = datetime.combine(test_date.date(), slot_time) + timedelta(minutes=service.duration)
                print(f"    {status} {slot_time} - {slot_end.strftime('%H:%M')}")
        
        # Тестируем основную функцию
        print(f"\n4. Результат get_available_slots:")
        available_slots = get_available_slots(
            db, OwnerType.MASTER, master_id, test_date, service.duration
        )
        
        print(f"Доступных слотов: {len(available_slots)}")
        for i, slot in enumerate(available_slots):
            print(f"  Слот {i+1}: {slot['start_time'].strftime('%H:%M')} - {slot['end_time'].strftime('%H:%M')}")
        
        # Тестируем с разными длительностями услуг
        print(f"\n5. Тест с разными длительностями:")
        test_durations = [30, 60, 90, 120, 150, 180]
        
        for duration in test_durations:
            print(f"\n  Для услуги {duration} минут:")
            slots = get_available_slots(db, OwnerType.MASTER, master_id, test_date, duration)
            print(f"    Доступных слотов: {len(slots)}")
            for slot in slots[:3]:  # Показываем первые 3
                print(f"      {slot['start_time'].strftime('%H:%M')} - {slot['end_time'].strftime('%H:%M')}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_new_slots_logic()) 
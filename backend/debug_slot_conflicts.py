import asyncio
from datetime import datetime, timedelta
from database import engine
from models import Service, Booking, AvailabilitySlot, OwnerType, Master
from sqlalchemy.orm import sessionmaker
from services.scheduling import get_available_slots, check_booking_conflicts

async def debug_slot_conflicts():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        print("=== ДИАГНОСТИКА КОНФЛИКТОВ СЛОТОВ ===\n")
        
        # Тестовые параметры
        test_date = datetime(2025, 7, 22, 0, 0, 0)
        master_id = 3  # ID мастера из теста
        service_id = 1  # ID услуги "123"
        
        print(f"Тестовая дата: {test_date.date()}")
        print(f"Мастер ID: {master_id}")
        print(f"Услуга ID: {service_id}")
        
        # Получаем информацию о мастере
        master = db.query(Master).filter(Master.id == master_id).first()
        if master:
            print(f"Мастер: ID {master.id}")
        else:
            print(f"Мастер с ID {master_id} не найден")
            return
        
        # Получаем информацию об услуге
        service = db.query(Service).filter(Service.id == service_id).first()
        if service:
            print(f"Услуга: {service.name} (длительность: {service.duration} мин)")
        else:
            print(f"Услуга с ID {service_id} не найдена")
            return
        
        # 1. Проверяем слоты доступности мастера
        print(f"\n1. Слоты доступности мастера:")
        availability_slots = db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id == master_id,
            AvailabilitySlot.day_of_week == test_date.weekday()
        ).all()
        
        if not availability_slots:
            print("  ❌ Нет слотов доступности для этого дня недели")
        else:
            for slot in availability_slots:
                print(f"  ✅ {slot.start_time} - {slot.end_time}")
        
        # 2. Получаем все активные бронирования мастера
        print(f"\n2. Все активные бронирования мастера:")
        all_bookings = db.query(Booking).filter(
            Booking.master_id == master_id,
            Booking.status != "cancelled",
            Booking.status != "rejected"
        ).all()
        
        print(f"  Всего активных бронирований: {len(all_bookings)}")
        for booking in all_bookings:
            print(f"  - Бронирование {booking.id}: {booking.start_time} - {booking.end_time}")
            print(f"    Дата: {booking.start_time.date()}, статус: {booking.status}")
        
        # 3. Получаем бронирования на конкретную дату
        print(f"\n3. Бронирования на {test_date.date()}:")
        date_bookings = db.query(Booking).filter(
            Booking.master_id == master_id,
            Booking.status != "cancelled",
            Booking.status != "rejected",
            Booking.start_time >= test_date,
            Booking.start_time < test_date + timedelta(days=1)
        ).all()
        
        print(f"  Бронирований на эту дату: {len(date_bookings)}")
        for booking in date_bookings:
            print(f"  - Бронирование {booking.id}: {booking.start_time.strftime('%H:%M')} - {booking.end_time.strftime('%H:%M')}")
        
        # 4. Проверяем конкретный слот 9:00-11:00
        print(f"\n4. Проверка слота 9:00-11:00:")
        slot_start = datetime(2025, 7, 22, 9, 0, 0)
        slot_end = slot_start + timedelta(minutes=service.duration)
        
        print(f"  Слот: {slot_start.strftime('%H:%M')} - {slot_end.strftime('%H:%M')}")
        
        # Проверяем конфликт
        has_conflict = check_booking_conflicts(
            db, slot_start, slot_end, OwnerType.MASTER, master_id
        )
        
        print(f"  Конфликт: {'ДА' if has_conflict else 'НЕТ'}")
        
        # 5. Проверяем пересечение с каждым бронированием
        print(f"\n5. Детальная проверка пересечений:")
        for booking in all_bookings:
            # Проверяем пересечение временных интервалов
            booking_start = booking.start_time
            booking_end = booking.end_time
            
            # Приводим к одной дате для сравнения
            slot_start_naive = slot_start.replace(tzinfo=None) if slot_start.tzinfo else slot_start
            slot_end_naive = slot_end.replace(tzinfo=None) if slot_end.tzinfo else slot_end
            booking_start_naive = booking_start.replace(tzinfo=None) if booking_start.tzinfo else booking_start
            booking_end_naive = booking_end.replace(tzinfo=None) if booking_end.tzinfo else booking_end
            
            # Проверяем пересечение
            overlaps = (
                (slot_start_naive < booking_end_naive and slot_end_naive > booking_start_naive) or
                (booking_start_naive < slot_end_naive and booking_end_naive > slot_start_naive)
            )
            
            if overlaps:
                print(f"  ❌ ПЕРЕСЕЧЕНИЕ с бронированием {booking.id}:")
                print(f"     Бронирование: {booking_start.strftime('%Y-%m-%d %H:%M')} - {booking_end.strftime('%H:%M')}")
                print(f"     Новый слот:   {slot_start.strftime('%Y-%m-%d %H:%M')} - {slot_end.strftime('%H:%M')}")
            else:
                print(f"  ✅ Нет пересечения с бронированием {booking.id}")
        
        # 6. Получаем доступные слоты через функцию
        print(f"\n6. Доступные слоты через get_available_slots:")
        available_slots = get_available_slots(
            db, OwnerType.MASTER, master_id, test_date, service.duration
        )
        
        print(f"  Доступных слотов: {len(available_slots)}")
        for i, slot in enumerate(available_slots):
            print(f"  - Слот {i+1}: {slot['start_time'].strftime('%H:%M')} - {slot['end_time'].strftime('%H:%M')}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(debug_slot_conflicts()) 
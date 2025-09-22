import asyncio
from datetime import datetime, timedelta
from database import engine
from models import User, Service, Salon, Master, Booking, BookingStatus
from sqlalchemy.orm import sessionmaker
from services.scheduling import get_available_slots
from schemas import OwnerType

async def test_direct_vs_api():
    print("=== ТЕСТ ПРЯМОГО ВЫЗОВА vs API ===\n")
    
    # Создаем сессию базы данных
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Параметры для теста
        test_date = datetime(2025, 7, 22, 0, 0, 0)
        service_duration = 120
        owner_type = OwnerType.MASTER
        owner_id = 3
        
        print(f"Тестируем дату: {test_date}")
        print(f"Длительность услуги: {service_duration} минут")
        print(f"Тип владельца: {owner_type}")
        print(f"ID владельца: {owner_id}")
        
        # 1. Прямой вызов функции
        print("\n1. Прямой вызов get_available_slots:")
        direct_slots = get_available_slots(db, owner_type, owner_id, test_date, service_duration)
        print(f"Получено слотов: {len(direct_slots)}")
        
        # Ищем слот на 9:00 в прямом вызове
        direct_slot_9_00 = None
        for slot in direct_slots:
            start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
            if start_time.hour == 9 and start_time.minute == 0:
                direct_slot_9_00 = slot
                break
        
        if direct_slot_9_00:
            print("✅ Слот на 9:00 найден в прямом вызове")
            start_time = datetime.fromisoformat(direct_slot_9_00['start_time'].replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(direct_slot_9_00['end_time'].replace('Z', '+00:00'))
            print(f"   Время: {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
        else:
            print("❌ Слот на 9:00 НЕ найден в прямом вызове")
        
        # 2. Проверяем, что происходит при парсинге даты из API
        print("\n2. Тест парсинга даты из API:")
        
        # Симулируем то, что делает FastAPI при парсинге параметров
        date_str = test_date.isoformat()
        print(f"Дата как строка: {date_str}")
        
        # Парсим дату как это делает FastAPI
        parsed_date = datetime.fromisoformat(date_str)
        print(f"Парсированная дата: {parsed_date}")
        print(f"Оригинальная дата: {test_date}")
        print(f"Даты равны: {parsed_date == test_date}")
        
        # 3. Вызываем функцию с парсированной датой
        print("\n3. Вызов с парсированной датой:")
        parsed_slots = get_available_slots(db, owner_type, owner_id, parsed_date, service_duration)
        print(f"Получено слотов: {len(parsed_slots)}")
        
        # Ищем слот на 9:00 в парсированном вызове
        parsed_slot_9_00 = None
        for slot in parsed_slots:
            start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
            if start_time.hour == 9 and start_time.minute == 0:
                parsed_slot_9_00 = slot
                break
        
        if parsed_slot_9_00:
            print("✅ Слот на 9:00 найден с парсированной датой")
        else:
            print("❌ Слот на 9:00 НЕ найден с парсированной датой")
        
        # 4. Сравниваем результаты
        print("\n4. Сравнение результатов:")
        print(f"Прямой вызов: {len(direct_slots)} слотов")
        print(f"Парсированный вызов: {len(parsed_slots)} слотов")
        
        if len(direct_slots) != len(parsed_slots):
            print("❌ Количество слотов различается!")
            
            # Показываем первые слоты из каждого
            print("\nПервые 5 слотов из прямого вызова:")
            for i, slot in enumerate(direct_slots[:5], 1):
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                print(f"  {i}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            
            print("\nПервые 5 слотов из парсированного вызова:")
            for i, slot in enumerate(parsed_slots[:5], 1):
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                print(f"  {i}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
        else:
            print("✅ Количество слотов одинаковое")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_direct_vs_api()) 
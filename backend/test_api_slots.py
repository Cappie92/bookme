import asyncio
import requests
import json
from datetime import datetime, timedelta

async def test_api_slots():
    base_url = "http://localhost:8000"
    
    try:
        print("=== ТЕСТ API СЛОТОВ ===\n")
        
        # Параметры для запроса
        test_date = datetime(2025, 7, 22, 0, 0, 0)
        service_duration = 120  # 2 часа
        owner_type = "master"
        owner_id = 3  # ID мастера wdwedewq
        
        print(f"Тестируем дату: {test_date.date()}")
        print(f"Длительность услуги: {service_duration} минут")
        print(f"Тип владельца: {owner_type}")
        print(f"ID владельца: {owner_id}")
        
        # Параметры для API запроса
        params = {
            "owner_type": owner_type,
            "owner_id": owner_id,
            "date": test_date.isoformat(),
            "service_duration": service_duration
        }
        
        print(f"\nПараметры запроса: {params}")
        
        # Делаем запрос к API
        response = requests.get(f"{base_url}/bookings/available-slots/public", params=params)
        
        print(f"\nСтатус ответа: {response.status_code}")
        print(f"Заголовки ответа: {dict(response.headers)}")
        
        if response.status_code == 200:
            slots = response.json()
            print(f"\nПолучено слотов: {len(slots)}")
            
            print("\nДоступные слоты:")
            for i, slot in enumerate(slots[:10], 1):  # Показываем первые 10
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                print(f"  {i}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            
            # Ищем слот на 9:00
            slot_9_00 = None
            for slot in slots:
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                if start_time.hour == 9 and start_time.minute == 0:
                    slot_9_00 = slot
                    break
            
            if slot_9_00:
                print(f"\n✅ Слот на 9:00 найден в API!")
                start_time = datetime.fromisoformat(slot_9_00['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot_9_00['end_time'].replace('Z', '+00:00'))
                print(f"   Время: {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            else:
                print(f"\n❌ Слот на 9:00 НЕ найден в API")
                
        else:
            print(f"Ошибка API: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_api_slots()) 
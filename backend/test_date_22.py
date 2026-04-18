import asyncio
import requests
import json
from datetime import datetime

async def test_date_22():
    base_url = "http://localhost:8000"
    
    try:
        print("=== ТЕСТ ДАТЫ 22 ИЮЛЯ ===\n")
        
        # Создаем дату 22 июля 2025 в локальном часовом поясе
        dateTime = datetime(2025, 7, 22, 0, 0, 0)
        
        print(f"Дата: {dateTime}")
        print(f"ISO строка: {dateTime.isoformat()}")
        
        # Параметры запроса
        params = {
            "date": dateTime.isoformat(),
            "service_duration": 120,
            "owner_type": "master",
            "owner_id": 3
        }
        
        print(f"\nПараметры запроса: {params}")
        
        # Делаем запрос к API
        response = requests.get(f"{base_url}/bookings/available-slots/public", params=params)
        
        print(f"\nСтатус ответа: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\nПолучено слотов: {len(data)}")
            
            print("\nДоступные слоты:")
            for i, slot in enumerate(data[:10], 1):
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                print(f"  {i}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            
            # Ищем слот на 9:00
            slot_9_00 = None
            for slot in data:
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                if start_time.hour == 9 and start_time.minute == 0:
                    slot_9_00 = slot
                    break
            
            if slot_9_00:
                print(f"\n❌ Слот на 9:00 найден в API (это ошибка!)")
                start_time = datetime.fromisoformat(slot_9_00['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot_9_00['end_time'].replace('Z', '+00:00'))
                print(f"   Время: {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            else:
                print(f"\n✅ Слот на 9:00 НЕ найден в API (правильно)")
                
        else:
            print(f"Ошибка API: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_date_22()) 
import requests
from datetime import datetime

def test_booking_conflicts():
    base_url = "http://localhost:8000"
    
    # Создаем тестовое бронирование на четверг с 13:00 до 14:30 (1.5 часа)
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": 1,
        "start_time": "2025-07-17T13:00:00",
        "end_time": "2025-07-17T14:30:00",
        "notes": "Тестовое бронирование"
    }
    
    print("1. Создаем тестовое бронирование...")
    try:
        response = requests.post(f"{base_url}/bookings/public", 
                               json=booking_data,
                               params={"client_phone": "+76666666666"})
        print(f"Статус создания бронирования: {response.status_code}")
        
        if response.status_code == 200:
            booking = response.json()
            print(f"✅ Бронирование создано: ID {booking['booking']['id']}")
        else:
            print(f"❌ Ошибка создания бронирования: {response.text}")
            return
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
        return
    
    print("\n2. Проверяем доступные слоты после создания бронирования...")
    
    params = {
        "date": "2025-07-17T00:00:00",
        "service_duration": 90,  # 1.5 часа
        "owner_type": "master",
        "owner_id": 3
    }
    
    try:
        response = requests.get(f"{base_url}/bookings/available-slots/public", params=params)
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            slots = response.json()
            print(f"Найдено слотов: {len(slots)}")
            
            if slots:
                print("Доступные слоты:")
                for i, slot in enumerate(slots):
                    start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                    end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                    print(f"  {i+1}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            else:
                print("  Нет доступных слотов")
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка запроса: {e}")

if __name__ == "__main__":
    test_booking_conflicts() 
import requests
from datetime import datetime

def test_master_slots():
    base_url = "http://localhost:8000"
    
    # Тестируем даты, которые пытается выбрать пользователь
    test_dates = [
        datetime(2025, 7, 21, 0, 0, 0),  # Понедельник
        datetime(2025, 7, 22, 0, 0, 0),  # Вторник (выходной)
    ]
    
    for test_date in test_dates:
        print(f"\n{'='*50}")
        print(f"Тестируем мастера ID 3 на {test_date.strftime('%A')} ({test_date.date()})")
        print(f"{'='*50}")
        
        params = {
            "date": test_date.isoformat(),
            "service_duration": 120,  # 2 часа (как в логах пользователя)
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
                    for i, slot in enumerate(slots[:5]):  # Показываем первые 5
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
    test_master_slots() 
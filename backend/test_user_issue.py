import requests
from datetime import datetime

def test_user_issue():
    base_url = "http://localhost:8000"
    
    print("=== ТЕСТ ПРОБЛЕМЫ ПОЛЬЗОВАТЕЛЯ ===")
    print("Параметры из логов пользователя:")
    print("- selectedDate: '2025-07-21'")
    print("- dateISO: '2025-07-21T00:00:00'")
    print("- service_duration: 120")
    print("- owner_type: 'master'")
    print("- owner_id: 3")
    print()
    
    # Тестируем с точно такими же параметрами
    params = {
        "date": "2025-07-21T00:00:00",
        "service_duration": 120,
        "owner_type": "master",
        "owner_id": 3
    }
    
    print(f"Отправляем запрос к API...")
    print(f"URL: {base_url}/bookings/available-slots/public")
    print(f"Параметры: {params}")
    print()
    
    try:
        response = requests.get(f"{base_url}/bookings/available-slots/public", params=params)
        print(f"Статус ответа: {response.status_code}")
        print(f"Заголовки ответа: {dict(response.headers)}")
        print()
        
        if response.status_code == 200:
            data = response.json()
            print(f"Получены слоты от API: {data}")
            print(f"Количество слотов: {len(data)}")
            
            if data:
                print("Первые 5 слотов:")
                for i, slot in enumerate(data[:5]):
                    start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                    end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                    print(f"  {i+1}. {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            else:
                print("  Нет доступных слотов")
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка запроса: {e}")
    
    print("\n" + "="*50)
    print("Тест через фронтенд прокси...")
    
    try:
        response = requests.get(f"http://localhost:5174/bookings/available-slots/public", params=params)
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Получены слоты через прокси: {len(data)} слотов")
        else:
            print(f"Ошибка через прокси: {response.text}")
            
    except Exception as e:
        print(f"Ошибка запроса через прокси: {e}")

if __name__ == "__main__":
    test_user_issue() 
import requests
from datetime import datetime, timedelta

def test_booking_flow():
    base_url = "http://localhost:8000"
    
    print("=== ТЕСТ ПОЛНОГО ФЛОУ БРОНИРОВАНИЯ ===")
    
    # 1. Создаем бронирование для существующего пользователя
    print("\n1. Создаем бронирование для пользователя +76666666666")
    
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": None,
        "start_time": "2025-07-21T10:00:00",
        "end_time": "2025-07-21T12:00:00",
        "notes": "Тестовое бронирование"
    }
    
    params = {"client_phone": "+76666666666"}
    
    try:
        response = requests.post(f"{base_url}/bookings/public", params=params, json=booking_data)
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Бронирование создано успешно!")
            print(f"   ID бронирования: {result['booking']['id']}")
            print(f"   Токен: {result['access_token'][:20]}...")
            print(f"   Новый клиент: {result['is_new_client']}")
            print(f"   Нужна установка пароля: {result['needs_password_setup']}")
            print(f"   Нужна проверка пароля: {result['needs_password_verification']}")
            
            # Сохраняем токен для дальнейших тестов
            access_token = result['access_token']
            
            # 2. Тестируем проверку пароля
            print("\n2. Тестируем проверку пароля")
            
            verify_response = requests.post(
                f"{base_url}/auth/verify-password",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}"
                },
                json={"password": "test123"}
            )
            
            print(f"Статус проверки пароля: {verify_response.status_code}")
            
            if verify_response.status_code == 200:
                print("✅ Пароль подтвержден!")
            else:
                error_data = verify_response.json()
                print(f"❌ Ошибка проверки пароля: {error_data}")
                
        else:
            error_data = response.json()
            print(f"❌ Ошибка создания бронирования: {error_data}")
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")

if __name__ == "__main__":
    test_booking_flow() 
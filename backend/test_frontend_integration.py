import requests
from datetime import datetime

def test_frontend_integration():
    base_url = "http://localhost:8000"
    frontend_url = "http://localhost:5175"
    
    print("=== ТЕСТ ИНТЕГРАЦИИ ФРОНТЕНДА ===")
    
    # 1. Проверяем доступность фронтенда
    print("\n1. Проверяем доступность фронтенда")
    try:
        frontend_response = requests.get(frontend_url, timeout=5)
        print(f"   Статус фронтенда: {frontend_response.status_code}")
        if frontend_response.status_code == 200:
            print("✅ Фронтенд доступен")
        else:
            print("❌ Фронтенд недоступен")
    except Exception as e:
        print(f"❌ Ошибка подключения к фронтенду: {e}")
    
    # 2. Проверяем доступность бэкенда
    print("\n2. Проверяем доступность бэкенда")
    try:
        backend_response = requests.get(f"{base_url}/", timeout=5)
        print(f"   Статус бэкенда: {backend_response.status_code}")
        if backend_response.status_code == 200:
            print("✅ Бэкенд доступен")
        else:
            print("❌ Бэкенд недоступен")
    except Exception as e:
        print(f"❌ Ошибка подключения к бэкенду: {e}")
    
    # 3. Тестируем публичные API
    print("\n3. Тестируем публичные API")
    
    # Тест доступных слотов
    try:
        slots_response = requests.get(
            f"{base_url}/bookings/available-slots/public",
            params={
                "owner_type": "master",
                "owner_id": 3,
                "date": "2025-07-28T00:00:00",
                "service_duration": 60
            }
        )
        print(f"   Статус API слотов: {slots_response.status_code}")
        if slots_response.status_code == 200:
            slots_data = slots_response.json()
            print(f"   Доступных слотов: {len(slots_data)}")
        else:
            print("❌ Ошибка API слотов")
    except Exception as e:
        print(f"❌ Ошибка API слотов: {e}")
    
    # Тест публичных услуг
    try:
        services_response = requests.get(
            f"{base_url}/salon/services/public",
            params={"salon_id": 1}
        )
        print(f"   Статус API услуг: {services_response.status_code}")
        if services_response.status_code == 200:
            services_data = services_response.json()
            print(f"   Услуг в салоне: {len(services_data)}")
        else:
            print("❌ Ошибка API услуг")
    except Exception as e:
        print(f"❌ Ошибка API услуг: {e}")
    
    # 4. Тестируем создание бронирования через публичный API
    print("\n4. Тестируем создание бронирования")
    
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": None,
        "start_time": "2025-07-28T10:00:00",
        "end_time": "2025-07-28T12:00:00",
        "notes": "Тест фронтенд интеграции"
    }
    
    params = {"client_phone": "+79999999997"}
    
    try:
        booking_response = requests.post(f"{base_url}/bookings/public", params=params, json=booking_data)
        print(f"   Статус создания бронирования: {booking_response.status_code}")
        
        if booking_response.status_code == 200:
            result = booking_response.json()
            print("✅ Бронирование создано!")
            print(f"   ID бронирования: {result['booking']['id']}")
            print(f"   Новый клиент: {result['is_new_client']}")
            print(f"   Нужна установка пароля: {result['needs_password_setup']}")
            
            # 5. Тестируем установку пароля
            if result['needs_password_setup']:
                print("\n5. Тестируем установку пароля")
                
                access_token = result['access_token']
                password_response = requests.post(
                    f"{base_url}/auth/set-password",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}"
                    },
                    json={"password": "test123"}
                )
                
                print(f"   Статус установки пароля: {password_response.status_code}")
                
                if password_response.status_code == 200:
                    print("✅ Пароль установлен!")
                    
                    # 6. Тестируем доступ к личному кабинету
                    print("\n6. Тестируем доступ к личному кабинету")
                    
                    client_response = requests.get(
                        f"{base_url}/client/bookings/",
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {access_token}"
                        }
                    )
                    
                    print(f"   Статус личного кабинета: {client_response.status_code}")
                    
                    if client_response.status_code == 200:
                        client_data = client_response.json()
                        print(f"   Бронирований в кабинете: {len(client_data)}")
                        print("✅ Личный кабинет доступен!")
                    else:
                        print("❌ Ошибка доступа к личному кабинету")
                else:
                    print("❌ Ошибка установки пароля")
            else:
                print("   Пароль не требуется")
                
        else:
            error_data = booking_response.json()
            print(f"❌ Ошибка создания бронирования: {error_data}")
            
    except Exception as e:
        print(f"❌ Ошибка тестирования бронирования: {e}")

if __name__ == "__main__":
    test_frontend_integration() 
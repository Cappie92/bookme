import requests
from datetime import datetime

def test_integration():
    base_url = "http://localhost:8000"
    
    print("=== ИНТЕГРАЦИОННЫЙ ТЕСТ ===")
    
    # 1. Создаем бронирование для нового пользователя
    print("\n1. Создаем бронирование для нового пользователя +79999999998")
    
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": None,
        "start_time": "2025-07-27T10:00:00",
        "end_time": "2025-07-27T12:00:00",
        "notes": "Интеграционный тест"
    }
    
    params = {"client_phone": "+79999999998"}
    
    try:
        response = requests.post(f"{base_url}/bookings/public", params=params, json=booking_data)
        print(f"Статус создания бронирования: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Бронирование создано!")
            print(f"   ID бронирования: {result['booking']['id']}")
            print(f"   Токен: {result['access_token'][:20]}...")
            print(f"   Новый клиент: {result['is_new_client']}")
            print(f"   Нужна установка пароля: {result['needs_password_setup']}")
            print(f"   Нужна проверка пароля: {result['needs_password_verification']}")
            
            access_token = result['access_token']
            
            # 2. Устанавливаем пароль для нового пользователя
            print("\n2. Устанавливаем пароль для нового пользователя")
            
            if result['needs_password_setup']:
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
                else:
                    error_data = password_response.json()
                    print(f"❌ Ошибка установки пароля: {error_data}")
                    return
                    
            # 3. Тестируем API личного кабинета
            print("\n3. Тестируем API личного кабинета")
            
            # Будущие бронирования
            future_response = requests.get(
                f"{base_url}/client/bookings/",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}"
                }
            )
            
            print(f"   Статус API будущих бронирований: {future_response.status_code}")
            
            if future_response.status_code == 200:
                future_data = future_response.json()
                print(f"   Будущих бронирований: {len(future_data)}")
                for booking in future_data:
                    print(f"     ID {booking.get('id')}: {booking.get('start_time')} - {booking.get('service_name')}")
            else:
                error_data = future_response.json()
                print(f"   Ошибка API будущих бронирований: {error_data}")
            
            # Архивные бронирования
            archive_response = requests.get(
                f"{base_url}/client/bookings/archive",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}"
                }
            )
            
            print(f"   Статус API архивных бронирований: {archive_response.status_code}")
            
            if archive_response.status_code == 200:
                archive_data = archive_response.json()
                print(f"   Архивных бронирований: {len(archive_data)}")
            else:
                error_data = archive_response.json()
                print(f"   Ошибка API архивных бронирований: {error_data}")
            
            # Избранное
            favorites_response = requests.get(
                f"{base_url}/client/bookings/favorites",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}"
                }
            )
            
            print(f"   Статус API избранного: {favorites_response.status_code}")
            
            if favorites_response.status_code == 200:
                favorites_data = favorites_response.json()
                print(f"   Избранных записей: {len(favorites_data)}")
            else:
                error_data = favorites_response.json()
                print(f"   Ошибка API избранного: {error_data}")
            
            # 4. Тестируем профиль пользователя
            print("\n4. Тестируем профиль пользователя")
            
            profile_response = requests.get(
                f"{base_url}/client/profile",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}"
                }
            )
            
            print(f"   Статус API профиля: {profile_response.status_code}")
            
            if profile_response.status_code == 200:
                profile_data = profile_response.json()
                print(f"   Профиль загружен: {profile_data.get('full_name', 'N/A')}")
            else:
                error_data = profile_response.json()
                print(f"   Ошибка API профиля: {error_data}")
                
        else:
            error_data = response.json()
            print(f"❌ Ошибка создания бронирования: {error_data}")
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")

if __name__ == "__main__":
    test_integration() 
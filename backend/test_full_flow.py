import requests
from datetime import datetime

def test_full_flow():
    base_url = "http://localhost:8000"
    
    print("=== ПОЛНЫЙ ТЕСТ ФЛОУ ===")
    
    # 1. Создаем бронирование
    print("\n1. Создаем бронирование для пользователя +76666666666")
    
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": None,
        "start_time": "2025-07-26T10:00:00",
        "end_time": "2025-07-26T12:00:00",
        "notes": "Тестовое бронирование"
    }
    
    params = {"client_phone": "+76666666666"}
    
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
            
            # 2. Проверяем, что бронирование есть в базе
            print("\n2. Проверяем бронирование в базе")
            
            # Используем токен из ответа создания бронирования
            from database import get_db
            from models import User, Booking
            
            db = next(get_db())
            user = db.query(User).filter(User.phone == '+76666666666').first()
            if user:
                print(f"   Пользователь найден: {user.phone}")
                print(f"   Токен из ответа: {access_token[:20]}...")
                
                # Проверяем бронирования
                bookings = db.query(Booking).filter(Booking.client_id == user.id).all()
                print(f"   Бронирований в базе: {len(bookings)}")
                for b in bookings:
                    print(f"     ID {b.id}: {b.start_time} - {b.end_time}")
                
                # 3. Устанавливаем пароль (для нового пользователя) или проверяем пароль (для существующего)
                print("\n3. Обрабатываем пароль")
                
                if result['needs_password_setup']:
                    print("   Устанавливаем пароль для нового пользователя")
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
                        
                elif result['needs_password_verification']:
                    print("   Проверяем пароль существующего пользователя")
                    verify_response = requests.post(
                        f"{base_url}/auth/verify-password",
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {access_token}"
                        },
                        json={"password": "test123"}
                    )
                    
                    print(f"   Статус проверки пароля: {verify_response.status_code}")
                    
                    if verify_response.status_code == 200:
                        print("✅ Пароль подтвержден!")
                    else:
                        error_data = verify_response.json()
                        print(f"❌ Ошибка проверки пароля: {error_data}")
                else:
                    print("   Пароль не требуется")
                
                # 4. Проверяем, что бронирование все еще есть
                print("\n4. Проверяем бронирование после обработки пароля")
                
                bookings_after = db.query(Booking).filter(Booking.client_id == user.id).all()
                print(f"   Бронирований после обработки пароля: {len(bookings_after)}")
                for b in bookings_after:
                    print(f"     ID {b.id}: {b.start_time} - {b.end_time}")
                
                # 5. Тестируем API личного кабинета
                print("\n5. Тестируем API личного кабинета")
                
                client_response = requests.get(
                    f"{base_url}/client/bookings/",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                
                print(f"   Статус API личного кабинета: {client_response.status_code}")
                
                if client_response.status_code == 200:
                    client_data = client_response.json()
                    print(f"   Данные личного кабинета: {len(client_data)} записей")
                    for booking in client_data:
                        print(f"     ID {booking.get('id')}: {booking.get('start_time')}")
                else:
                    error_data = client_response.json()
                    print(f"   Ошибка API: {error_data}")
                        
            else:
                print("❌ Пользователь не найден")
                
        else:
            error_data = response.json()
            print(f"❌ Ошибка создания бронирования: {error_data}")
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")

if __name__ == "__main__":
    test_full_flow() 
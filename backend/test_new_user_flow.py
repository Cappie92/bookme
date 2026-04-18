import requests
from datetime import datetime

def test_new_user_flow():
    base_url = "http://localhost:8000"
    
    print("=== ТЕСТ ФЛОУ НОВОГО ПОЛЬЗОВАТЕЛЯ С ОТМЕНОЙ РЕГИСТРАЦИИ ===")
    
    # 1. Создаем бронирование для нового пользователя
    print("\n1. Создаем бронирование для нового пользователя +78888888888")
    
    booking_data = {
        "service_id": 1,
        "master_id": 3,
        "salon_id": None,
        "start_time": "2025-07-25T10:00:00",
        "end_time": "2025-07-25T12:00:00",
        "notes": "Тестовое бронирование для нового пользователя"
    }
    
    params = {"client_phone": "+78888888888"}
    
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
            
            # 2. Проверяем, что пользователь создан как новый
            print("\n2. Проверяем создание нового пользователя")
            
            from database import get_db
            from models import User, Booking
            
            db = next(get_db())
            user = db.query(User).filter(User.phone == '+78888888888').first()
            if user:
                print(f"   Пользователь найден: {user.phone}")
                print(f"   ID пользователя: {user.id}")
                print(f"   Пароль установлен: {user.hashed_password is not None}")
                print(f"   Роль: {user.role}")
                
                # Проверяем бронирования
                bookings = db.query(Booking).filter(Booking.client_id == user.id).all()
                print(f"   Бронирований в базе: {len(bookings)}")
                for b in bookings:
                    print(f"     ID {b.id}: {b.start_time} - {b.end_time}")
                
                # 3. Симулируем отмену регистрации (пользователь не устанавливает пароль)
                print("\n3. Симулируем отмену регистрации (пользователь не устанавливает пароль)")
                
                delete_response = requests.delete(
                    f"{base_url}/auth/delete-account",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                
                print(f"   Статус удаления аккаунта: {delete_response.status_code}")
                
                if delete_response.status_code == 200:
                    print("✅ Аккаунт удален!")
                    
                    # 4. Проверяем, что пользователь и бронирование удалены
                    print("\n4. Проверяем удаление пользователя и бронирования")
                    
                    user_after = db.query(User).filter(User.phone == '+78888888888').first()
                    if user_after:
                        print("❌ Пользователь все еще существует")
                    else:
                        print("✅ Пользователь удален")
                    
                    bookings_after = db.query(Booking).filter(Booking.client_id == user.id).all()
                    if bookings_after:
                        print(f"❌ Бронирования все еще существуют: {len(bookings_after)}")
                    else:
                        print("✅ Бронирования удалены")
                        
                else:
                    error_data = delete_response.json()
                    print(f"❌ Ошибка удаления аккаунта: {error_data}")
                    
            else:
                print("❌ Пользователь не найден")
                
        else:
            error_data = response.json()
            print(f"❌ Ошибка создания бронирования: {error_data}")
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")

if __name__ == "__main__":
    test_new_user_flow() 
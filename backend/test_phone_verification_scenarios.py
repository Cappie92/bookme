#!/usr/bin/env python3
"""
Тест всех сценариев верификации телефона:
1. Верификация при регистрации
2. Верификация при восстановлении пароля
3. Верификация в CJM записи на услугу
4. Верификация при удалении аккаунта
"""

import requests
import json
from datetime import datetime

def test_phone_verification_scenarios():
    base_url = "http://localhost:8000"
    
    print("=== ТЕСТ СЦЕНАРИЕВ ВЕРИФИКАЦИИ ТЕЛЕФОНА ===")
    
    # 1. Тест верификации при регистрации
    print("\n1. Тестируем верификацию при регистрации")
    
    register_data = {
        "email": "test_phone_verification_2024_12_19@example.com",
        "phone": "+79999999994",
        "password": "testpassword123",
        "full_name": "Тестовый Пользователь",
        "role": "client"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/register", json=register_data)
        print(f"Статус регистрации: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Регистрация прошла успешно")
            if 'user' in result:
                print(f"   Пользователь ID: {result['user']['id']}")
                print(f"   Телефон верифицирован: {result['user']['is_phone_verified']}")
            print("📞 Должен быть отправлен звонок для верификации телефона")
            
            # Сохраняем токен для дальнейших тестов
            access_token = result['access_token']
        else:
            print(f"❌ Ошибка регистрации: {response.text}")
            return
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
        return
    
    # 2. Тест верификации при восстановлении пароля
    print("\n2. Тестируем верификацию при восстановлении пароля")
    
    forgot_password_data = {
        "phone": "+79999999994"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/forgot-password", json=forgot_password_data)
        print(f"Статус запроса восстановления: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {result['message']}")
            print("📞 Должен быть отправлен звонок для восстановления пароля")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    # 3. Тест верификации в CJM записи на услугу
    print("\n3. Тестируем верификацию в CJM записи на услугу")
    
    # Сначала создаем тестовое бронирование
    booking_data = {
        "service_id": 1,
        "master_id": 1,
        "salon_id": None,
        "start_time": "2024-01-15T10:00:00Z",
        "end_time": "2024-01-15T11:00:00Z",
        "notes": "Тестовое бронирование"
    }
    
    try:
        params = {"client_phone": "+79999999995"}
        response = requests.post(f"{base_url}/bookings/public", json=booking_data, params=params)
        print(f"Статус создания бронирования: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Бронирование создано")
            print(f"   Нужна верификация телефона: {result.get('needs_phone_verification', False)}")
            print(f"   Новый клиент: {result.get('is_new_client', False)}")
            print("📞 Должен быть отправлен звонок для верификации в CJM")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    # 4. Тест верификации при удалении аккаунта
    print("\n4. Тестируем верификацию при удалении аккаунта")
    
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.delete(f"{base_url}/auth/delete-account", headers=headers)
        print(f"Статус запроса удаления: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {result['message']}")
            print("📞 Должен быть отправлен звонок для подтверждения удаления")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    print("\n=== ТЕСТ ЗАВЕРШЕН ===")
    print("\nДля полного тестирования необходимо:")
    print("1. Проверить звонки на указанные номера телефонов")
    print("2. Ввести коды из звонков в соответствующие формы")
    print("3. Проверить, что верификация работает корректно")

if __name__ == "__main__":
    test_phone_verification_scenarios()

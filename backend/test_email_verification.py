import requests
from datetime import datetime

def test_email_verification_flow():
    base_url = "http://localhost:8000"
    
    print("=== ТЕСТ ВЕРИФИКАЦИИ EMAIL И СБРОСА ПАРОЛЯ ===")
    
    # 1. Регистрация нового пользователя
    print("\n1. Регистрируем нового пользователя")
    
    user_data = {
        "email": "test_verification@example.com",
        "phone": "+79999999997",
        "password": "testpassword123",
        "full_name": "Тестовый Пользователь",
        "role": "client"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/register", json=user_data)
        print(f"Статус регистрации: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Регистрация прошла успешно")
            print("📧 Должно быть отправлено письмо верификации")
        else:
            print(f"❌ Ошибка регистрации: {response.text}")
            return
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
        return
    
    # 2. Запрос повторной отправки письма верификации
    print("\n2. Запрашиваем повторную отправку письма верификации")
    
    resend_data = {
        "email": "test_verification@example.com"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/resend-verification", json=resend_data)
        print(f"Статус повторной отправки: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {result['message']}")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    # 3. Запрос сброса пароля
    print("\n3. Запрашиваем сброс пароля")
    
    reset_data = {
        "email": "test_verification@example.com"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/request-password-reset", json=reset_data)
        print(f"Статус запроса сброса пароля: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {result['message']}")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    # 4. Проверяем, что пользователь не верифицирован
    print("\n4. Проверяем статус верификации пользователя")
    
    try:
        # Логинимся, чтобы получить токен
        login_data = {
            "phone": "+79999999997",
            "password": "testpassword123"
        }
        
        response = requests.post(f"{base_url}/auth/login", json=login_data)
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data["access_token"]
            
            # Получаем информацию о пользователе
            headers = {"Authorization": f"Bearer {access_token}"}
            response = requests.get(f"{base_url}/auth/users/me", headers=headers)
            
            if response.status_code == 200:
                user_info = response.json()
                is_verified = user_info.get("is_verified", False)
                print(f"Статус верификации: {is_verified}")
                
                if not is_verified:
                    print("✅ Пользователь правильно помечен как неверифицированный")
                else:
                    print("❌ Пользователь должен быть неверифицированным")
            else:
                print(f"❌ Ошибка получения информации о пользователе: {response.text}")
        else:
            print(f"❌ Ошибка входа: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
    
    print("\n=== ТЕСТ ЗАВЕРШЕН ===")
    print("📧 Проверьте консоль сервера для просмотра отправленных писем")


def test_verification_with_invalid_token():
    base_url = "http://localhost:8000"
    
    print("\n=== ТЕСТ ВЕРИФИКАЦИИ С НЕДЕЙСТВИТЕЛЬНЫМ ТОКЕНОМ ===")
    
    # Пытаемся верифицировать email с недействительным токеном
    verify_data = {
        "token": "invalid_token_12345"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/verify-email", json=verify_data)
        print(f"Статус верификации с недействительным токеном: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if not result["success"]:
                print("✅ Правильно отклонен недействительный токен")
            else:
                print("❌ Недействительный токен должен быть отклонен")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")


def test_password_reset_with_invalid_token():
    base_url = "http://localhost:8000"
    
    print("\n=== ТЕСТ СБРОСА ПАРОЛЯ С НЕДЕЙСТВИТЕЛЬНЫМ ТОКЕНОМ ===")
    
    # Пытаемся сбросить пароль с недействительным токеном
    reset_data = {
        "token": "invalid_token_12345",
        "new_password": "newpassword123"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/reset-password", json=reset_data)
        print(f"Статус сброса пароля с недействительным токеном: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if not result["success"]:
                print("✅ Правильно отклонен недействительный токен")
            else:
                print("❌ Недействительный токен должен быть отклонен")
        else:
            print(f"❌ Ошибка: {response.text}")
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")


if __name__ == "__main__":
    test_email_verification_flow()
    test_verification_with_invalid_token()
    test_password_reset_with_invalid_token() 
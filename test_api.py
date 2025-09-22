import requests
import json

# Базовый URL
BASE_URL = "http://localhost:8000"

# Тестовые данные для входа в салон
login_data = {
    "phone": "+73333333333",  # Реальный номер салона
    "password": "123456"
}

def test_salon_login():
    """Тестируем вход в салон"""
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    print("Login response:", response.status_code)
    if response.status_code == 200:
        data = response.json()
        print("Access token:", data.get('access_token', 'No token'))
        return data.get('access_token')
    else:
        print("Login failed:", response.text)
        return None

def test_get_masters(token):
    """Тестируем получение мастеров салона"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.get(f"{BASE_URL}/salon/masters", headers=headers)
    print("Get masters response:", response.status_code)
    if response.status_code == 200:
        data = response.json()
        print("Masters data:", json.dumps(data, indent=2, ensure_ascii=False))
        return data
    else:
        print("Get masters failed:", response.text)
        return None

if __name__ == "__main__":
    token = test_salon_login()
    if token:
        test_get_masters(token) 
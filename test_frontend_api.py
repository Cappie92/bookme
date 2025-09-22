#!/usr/bin/env python3
"""
Тест API для фронтенда
"""

import requests
from urllib.parse import quote

# Базовый URL API
API_BASE = "http://localhost:8000/api/geocoder"

def test_extract_address():
    """Тестирует извлечение адреса из ссылки"""
    
    # Тестовая ссылка
    url = "https://yandex.ru/maps/213/moscow/?text=улица%20Тверская%2C%201"
    
    try:
        response = requests.get(f"{API_BASE}/extract-address-from-url?url={quote(url)}")
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ УСПЕХ: {data['address']}")
            else:
                print(f"❌ ОШИБКА: {data.get('detail', 'Неизвестная ошибка')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"💥 ОШИБКА: {str(e)}")

if __name__ == "__main__":
    print("🧪 Тестирование API для фронтенда")
    print("=" * 40)
    test_extract_address() 
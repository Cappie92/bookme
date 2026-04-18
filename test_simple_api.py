#!/usr/bin/env python3
"""
Простой тест API извлечения адреса
"""

import requests
from urllib.parse import quote

# Базовый URL API
API_BASE = "http://localhost:8001/api/extract-address"

def test_simple_extraction():
    """Тестирует простые случаи извлечения адреса"""
    
    # Тест 1: Простая ссылка с text параметром
    url1 = "https://yandex.ru/maps/213/moscow/?text=улица%20Тверская%2C%201"
    print(f"Тест 1: {url1}")
    
    try:
        response = requests.get(f"{API_BASE}?url={quote(url1)}")
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {response.text}")
        print()
    except Exception as e:
        print(f"Ошибка: {e}")
        print()
    
    # Тест 2: Ссылка с координатами
    url2 = "https://yandex.ru/maps/213/moscow/?ll=37.617635,55.755814"
    print(f"Тест 2: {url2}")
    
    try:
        response = requests.get(f"{API_BASE}?url={quote(url2)}")
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {response.text}")
        print()
    except Exception as e:
        print(f"Ошибка: {e}")
        print()
    
    # Тест 3: Ссылка с адресом в пути
    url3 = "https://yandex.ru/maps/213/moscow/улица%20Тверская%2C%201"
    print(f"Тест 3: {url3}")
    
    try:
        response = requests.get(f"{API_BASE}?url={quote(url3)}")
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {response.text}")
        print()
    except Exception as e:
        print(f"Ошибка: {e}")
        print()

if __name__ == "__main__":
    print("🧪 Простой тест API извлечения адреса")
    print("=" * 50)
    test_simple_extraction() 
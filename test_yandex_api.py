#!/usr/bin/env python3
"""
Тест API Яндекс.Геокодера с реальным ключом
"""

import requests
from urllib.parse import quote

# Базовые URL API
API_BASE = "http://localhost:8001/api/geocoder"

def test_reverse_geocode():
    """Тестирует обратное геокодирование"""
    print("🧪 Тест обратного геокодирования")
    print("-" * 40)
    
    # Координаты центра Москвы
    lon, lat = 37.617635, 55.755814
    
    try:
        response = requests.get(f"{API_BASE}/reverse-geocode?lon={lon}&lat={lat}")
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

def test_extract_address_from_url():
    """Тестирует извлечение адреса из ссылки"""
    print("\n🧪 Тест извлечения адреса из ссылки")
    print("-" * 40)
    
    # Тестовые ссылки
    test_urls = [
        "https://yandex.ru/maps/213/moscow/?text=улица%20Тверская%2C%201",
        "https://yandex.ru/maps/213/moscow/?ll=37.617635,55.755814",
        "https://yandex.ru/maps/213/moscow/улица%20Тверская%2C%201",
    ]
    
    for i, url in enumerate(test_urls, 1):
        print(f"\n📝 Тест {i}: {url}")
        print("-" * 30)
        
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

def test_geocode_address():
    """Тестирует геокодирование адреса"""
    print("\n🧪 Тест геокодирования адреса")
    print("-" * 40)
    
    address = "улица Тверская, 1"
    
    try:
        response = requests.get(f"{API_BASE}/geocode?address={quote(address)}")
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ УСПЕХ: {data['address']}")
                print(f"📍 Координаты: {data['coordinates']}")
            else:
                print(f"❌ ОШИБКА: {data.get('detail', 'Неизвестная ошибка')}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"💥 ОШИБКА: {str(e)}")

if __name__ == "__main__":
    print("🧪 Тестирование API Яндекс.Геокодера")
    print("=" * 50)
    
    # Проверяем статус API
    try:
        response = requests.get("http://localhost:8001/")
        if response.status_code == 200:
            print("✅ API сервер работает")
        else:
            print(f"❌ API сервер недоступен: {response.status_code}")
            exit(1)
    except Exception as e:
        print(f"❌ Не удалось подключиться к API: {e}")
        print("\n⚠️  Убедитесь, что сервер запущен:")
        print("   cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload")
        exit(1)
    
    # Запускаем тесты
    test_reverse_geocode()
    test_extract_address_from_url()
    test_geocode_address()
    
    print("\n🎉 Тестирование завершено!") 
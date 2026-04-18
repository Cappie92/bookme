#!/usr/bin/env python3
"""
Тестовый скрипт для проверки API извлечения адреса из ссылок Яндекс.Карт
"""

import requests
import json

# URL API
API_BASE = "http://localhost:8001/api/extract-address"

# Тестовые ссылки
test_urls = [
    # Обычная ссылка с параметром text
    "https://yandex.ru/maps/213/moscow/?ll=37.617635%2C55.755814&z=16&text=улица%20Тверская%2C%201",
    
    # Ссылка с координатами (обратное геокодирование)
    "https://yandex.ru/maps/213/moscow/?ll=37.617635%2C55.755814&z=16",
    
    # Ссылка с адресом в пути
    "https://yandex.ru/maps/213/moscow/улица%20Тверская%2C%201",
    
    # Короткая ссылка (требует веб-скрапинг)
    "https://yandex.ru/maps/-/CHXXEC87",
    
    # Еще одна короткая ссылка
    "https://yandex.ru/maps/-/CCuC8K~",
]

def test_address_extraction():
    """Тестирует API извлечения адреса"""
    print("🧪 Тестирование API извлечения адреса из ссылок Яндекс.Карт")
    print("=" * 60)
    
    for i, url in enumerate(test_urls, 1):
        print(f"\n📝 Тест {i}: {url}")
        print("-" * 40)
        
        try:
            response = requests.get(f"{API_BASE}?url={url}", timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    print(f"✅ УСПЕХ: {data['address']}")
                else:
                    print(f"❌ ОШИБКА: {data.get('detail', 'Неизвестная ошибка')}")
            else:
                print(f"❌ HTTP {response.status_code}: {response.text}")
                
        except requests.exceptions.Timeout:
            print("⏰ ТАЙМАУТ: Запрос превысил время ожидания")
        except requests.exceptions.ConnectionError:
            print("🔌 ОШИБКА ПОДКЛЮЧЕНИЯ: Не удалось подключиться к серверу")
        except Exception as e:
            print(f"💥 ОШИБКА: {str(e)}")

def test_api_status():
    """Проверяет статус API"""
    print("\n🔍 Проверка статуса API...")
    try:
        response = requests.get("http://localhost:8001/")
        if response.status_code == 200:
            print("✅ API сервер работает")
            return True
        else:
            print(f"❌ API сервер недоступен: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Не удалось подключиться к API: {e}")
        return False

if __name__ == "__main__":
    # Проверяем статус API
    if test_api_status():
        # Тестируем извлечение адреса
        test_address_extraction()
    else:
        print("\n⚠️  Убедитесь, что сервер запущен:")
        print("   cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload") 
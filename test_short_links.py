#!/usr/bin/env python3
"""
Тест для коротких ссылок Яндекс.Карт
"""

import requests
from urllib.parse import quote

# Базовый URL API
API_BASE = "http://localhost:8001/api/extract-address"

def test_short_links():
    """Тестирует короткие ссылки Яндекс.Карт"""
    
    # Тестовые короткие ссылки
    short_links = [
        "https://yandex.ru/maps/-/CHXXEC87",
        "https://yandex.ru/maps/-/CCuC8K~",
        "https://yandex.ru/maps/-/CCuC8K~",
        "https://yandex.ru/maps/-/CCuC8K~",
    ]
    
    for i, url in enumerate(short_links, 1):
        print(f"\n📝 Тест {i}: {url}")
        print("-" * 50)
        
        try:
            response = requests.get(f"{API_BASE}?url={quote(url)}", timeout=30)
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
                
        except requests.exceptions.Timeout:
            print("⏰ ТАЙМАУТ: Запрос превысил время ожидания")
        except requests.exceptions.ConnectionError:
            print("🔌 ОШИБКА ПОДКЛЮЧЕНИЯ: Не удалось подключиться к серверу")
        except Exception as e:
            print(f"💥 ОШИБКА: {str(e)}")

if __name__ == "__main__":
    print("🧪 Тестирование коротких ссылок Яндекс.Карт")
    print("=" * 60)
    test_short_links() 
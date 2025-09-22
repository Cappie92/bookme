#!/usr/bin/env python3
"""
Тестовый скрипт для проверки функции "Любой мастер"
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

def test_any_master_endpoint():
    """Тестируем endpoint для "Любого мастера" """
    
    # Получаем текущую дату
    today = datetime.now()
    tomorrow = today + timedelta(days=1)
    
    # Параметры для теста
    params = {
        'salon_id': 1,
        'service_id': 1,  # Предполагаем, что услуга 1 существует
        'year': tomorrow.year,
        'month': tomorrow.month,
        'day': tomorrow.day,
        'service_duration': 60
    }
    
    print(f"Тестируем endpoint 'Любой мастер' с параметрами:")
    print(json.dumps(params, indent=2, default=str))
    
    try:
        response = requests.get(f"{BASE_URL}/bookings/available-slots-any-master", params=params)
        
        print(f"\nСтатус ответа: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Получено слотов: {len(data)}")
            if data:
                print("Пример слота:")
                print(json.dumps(data[0], indent=2, default=str))
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка запроса: {e}")

def test_services():
    """Проверяем, какие услуги есть в системе"""
    
    print("\n" + "="*50)
    print("Проверяем услуги в системе:")
    
    try:
        response = requests.get(f"{BASE_URL}/admin/services")
        print(f"Статус: {response.status_code}")
        
        if response.status_code == 200:
            services = response.json()
            print(f"Найдено услуг: {len(services)}")
            for service in services[:5]:  # Показываем первые 5
                print(f"- ID: {service.get('id')}, Название: {service.get('name')}")
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")

def test_masters():
    """Проверяем, какие мастера есть в системе"""
    
    print("\n" + "="*50)
    print("Проверяем мастеров в системе:")
    
    try:
        response = requests.get(f"{BASE_URL}/admin/masters")
        print(f"Статус: {response.status_code}")
        
        if response.status_code == 200:
            masters = response.json()
            print(f"Найдено мастеров: {len(masters)}")
            for master in masters[:5]:  # Показываем первые 5
                print(f"- ID: {master.get('id')}, Имя: {master.get('user', {}).get('full_name', 'N/A')}")
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")

if __name__ == "__main__":
    print("🧪 Тестирование функции 'Любой мастер'")
    print("="*50)
    
    test_services()
    test_masters()
    test_any_master_endpoint()
    
    print("\n✅ Тестирование завершено!")


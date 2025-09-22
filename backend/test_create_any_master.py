#!/usr/bin/env python3
"""
Тестовый скрипт для проверки создания записи с "Любым мастером"
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

def test_create_booking_with_any_master():
    """Тестируем создание записи с "Любым мастером" """
    
    # Используем 27 января (понедельник) - рабочий день
    test_date = datetime(2025, 1, 27)
    
    # Параметры для теста
    data = {
        'salon_id': 1,
        'service_id': 1,
        'start_time': test_date.replace(hour=10, minute=0, second=0, microsecond=0).isoformat(),
        'end_time': test_date.replace(hour=11, minute=0, second=0, microsecond=0).isoformat(),
        'notes': 'Тестовая запись с любым мастером',
        'client_phone': '+79999999999'
    }
    
    print(f"Тестируем создание записи с 'Любым мастером':")
    print(json.dumps(data, indent=2, default=str))
    
    try:
        response = requests.post(f"{BASE_URL}/bookings/create-with-any-master", params=data)
        
        print(f"\nСтатус ответа: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Запись успешно создана!")
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"❌ Ошибка: {response.text}")
            
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")

def test_available_slots_any_master():
    """Тестируем получение доступных слотов для "Любого мастера" """
    
    # Используем 27 января (понедельник) - рабочий день
    test_date = datetime(2025, 1, 27)
    
    # Параметры для теста
    params = {
        'salon_id': 1,
        'service_id': 1,
        'year': test_date.year,
        'month': test_date.month,
        'day': test_date.day,
        'service_duration': 60
    }
    
    print(f"\nТестируем получение слотов для 'Любого мастера':")
    print(json.dumps(params, indent=2, default=str))
    
    try:
        response = requests.get(f"{BASE_URL}/bookings/available-slots-any-master", params=params)
        
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Получено слотов: {len(data)}")
            if data:
                print("Пример слота:")
                print(json.dumps(data[0], indent=2, default=str))
        else:
            print(f"Ошибка: {response.text}")
            
    except Exception as e:
        print(f"Ошибка: {e}")

if __name__ == "__main__":
    print("🧪 Тестирование создания записи с 'Любым мастером'")
    print("="*60)
    
    test_available_slots_any_master()
    test_create_booking_with_any_master()
    
    print("\n✅ Тестирование завершено!")

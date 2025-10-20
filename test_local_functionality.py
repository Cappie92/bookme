#!/usr/bin/env python3
"""
Тест локальной функциональности после миграции
"""

import requests
import json
import time

def test_api_health():
    """Тест здоровья API"""
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ API здоров")
            return True
        else:
            print(f"❌ API нездоров: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка подключения к API: {e}")
        return False

def test_frontend_loading():
    """Тест загрузки фронтенда"""
    try:
        start_time = time.time()
        response = requests.get("http://localhost:5173", timeout=10)
        load_time = time.time() - start_time
        
        if response.status_code == 200:
            print(f"✅ Фронтенд загружается за {load_time:.2f} секунд")
            return True
        else:
            print(f"❌ Фронтенд не загружается: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка загрузки фронтенда: {e}")
        return False

def test_database_connectivity():
    """Тест подключения к базе данных"""
    try:
        response = requests.get("http://localhost:8000/api/salon/profile/public?salon_id=1", timeout=5)
        if response.status_code == 200:
            print("✅ База данных доступна")
            return True
        else:
            print(f"❌ База данных недоступна: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка подключения к базе данных: {e}")
        return False

def test_migration_data():
    """Тест данных после миграции"""
    try:
        # Проверяем, что есть мастера в салоне
        response = requests.get("http://localhost:8000/api/salon/masters/list?salon_id=1", timeout=5)
        if response.status_code == 200:
            masters = response.json()
            if len(masters) > 0:
                print(f"✅ Найдено {len(masters)} мастеров в салоне")
                return True
            else:
                print("❌ Не найдено мастеров в салоне")
                return False
        else:
            print(f"❌ Не удалось получить мастеров: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка проверки данных: {e}")
        return False

def main():
    """Основная функция тестирования"""
    print("🧪 Тестирование локальной функциональности после миграции...")
    print("=" * 60)
    
    tests = [
        ("API Health", test_api_health),
        ("Frontend Loading", test_frontend_loading),
        ("Database Connectivity", test_database_connectivity),
        ("Migration Data", test_migration_data),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🔍 {test_name}:")
        if test_func():
            passed += 1
        time.sleep(1)  # Небольшая пауза между тестами
    
    print("\n" + "=" * 60)
    print(f"📊 Результаты: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("🎉 Все тесты пройдены! Система работает корректно.")
        return True
    else:
        print("⚠️  Некоторые тесты не пройдены. Требуется дополнительная проверка.")
        return False

if __name__ == "__main__":
    main()

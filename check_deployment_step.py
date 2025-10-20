#!/usr/bin/env python3
"""
Скрипт для проверки каждого шага деплоя
"""

import requests
import time
import sys

def check_api_health():
    """Проверка здоровья API"""
    try:
        response = requests.get("http://193.160.208.206:8000/health", timeout=10)
        if response.status_code == 200:
            print("✅ API здоров")
            return True
        else:
            print(f"❌ API нездоров: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка подключения к API: {e}")
        return False

def check_frontend_loading():
    """Проверка загрузки фронтенда"""
    try:
        start_time = time.time()
        response = requests.get("http://193.160.208.206:5173", timeout=15)
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

def check_salon_api():
    """Проверка API салона"""
    try:
        response = requests.get("http://193.160.208.206:8000/api/salon/profile/public?salon_id=1", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ API салона работает: {data.get('name', 'Unknown')}")
            return True
        else:
            print(f"❌ API салона не работает: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка API салона: {e}")
        return False

def check_masters_api():
    """Проверка API мастеров"""
    try:
        response = requests.get("http://193.160.208.206:8000/api/salon/masters/list?salon_id=1", timeout=10)
        if response.status_code == 200:
            masters = response.json()
            print(f"✅ API мастеров работает: {len(masters)} мастеров")
            return True
        else:
            print(f"❌ API мастеров не работает: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка API мастеров: {e}")
        return False

def main():
    """Основная функция проверки"""
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    
    print(f"🔍 Проверка шага деплоя: {step}")
    print("=" * 50)
    
    if step == "all" or step == "api":
        check_api_health()
    
    if step == "all" or step == "frontend":
        check_frontend_loading()
    
    if step == "all" or step == "salon":
        check_salon_api()
    
    if step == "all" or step == "masters":
        check_masters_api()
    
    print("=" * 50)
    print("✅ Проверка завершена")

if __name__ == "__main__":
    main()


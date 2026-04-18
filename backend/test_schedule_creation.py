#!/usr/bin/env python3
"""
Скрипт для создания тестовых данных расписания и записей
"""
import requests
import json
from datetime import datetime, timedelta, date, time
from typing import Dict, Any

# Базовый URL API
BASE_URL = "http://localhost:8000"

def create_user(phone: str, password: str, full_name: str, role: str = "client") -> Dict[str, Any]:
    """Создать пользователя"""
    response = requests.post(f"{BASE_URL}/api/auth/register", json={
        "phone": phone,
        "password": password,
        "full_name": full_name,
        "email": f"{phone.replace('+', '')}@test.com",
        "role": role
    })
    if response.status_code == 200:
        return response.json()
    else:
        print(f"⚠️ Пользователь {phone} уже существует или ошибка: {response.status_code} - {response.text}")
        return None

def get_auth_token(phone: str, password: str) -> str:
    """Получить токен авторизации"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "phone": phone,
        "password": password
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception(f"Ошибка авторизации: {response.status_code} - {response.text}")

def create_master_schedule(token: str, schedule_data: Dict[str, Any]) -> Dict[str, Any]:
    """Создать расписание мастера"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(f"{BASE_URL}/api/master/schedule/rules", 
                           json=schedule_data, 
                           headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Ошибка создания расписания: {response.text}")

def create_booking(token: str, booking_data: Dict[str, Any]) -> Dict[str, Any]:
    """Создать запись"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(f"{BASE_URL}/api/bookings/", 
                           json=booking_data, 
                           headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Ошибка создания записи: {response.text}")

def get_master_id(token: str) -> int:
    """Получить ID мастера"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/master/settings", headers=headers)
    if response.status_code == 200:
        return response.json()["master"]["id"]
    else:
        raise Exception(f"Ошибка получения ID мастера: {response.text}")

def get_salon_id(token: str) -> int:
    """Получить ID салона"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/master/salons", headers=headers)
    if response.status_code == 200:
        salons = response.json()
        if salons:
            return salons[0]["id"]
    raise Exception("Салон не найден")

def get_service_id(token: str, salon_id: int) -> int:
    """Получить ID услуги салона"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/salon/services/public?salon_id={salon_id}")
    if response.status_code == 200:
        services = response.json()
        if services:
            return services[0]["id"]
    raise Exception("Услуга салона не найдена")

def get_master_service_id(token: str) -> int:
    """Получить ID личной услуги мастера"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/master/services", headers=headers)
    if response.status_code == 200:
        services = response.json()
        if services:
            return services[0]["id"]
    raise Exception("Личная услуга мастера не найдена")

def main():
    print("🚀 Создание тестовых данных для расписания...")
    
    # Данные пользователей
    master_phone = "+79435774916"  # Мастер для тестирования
    master_password = "test123"
    client_phone = "+79735906386"
    client_password = "test123"
    salon_phone = "+79000000000"
    salon_password = "test123"
    
    try:
        # 1. Создание пользователей
        print("1. Создание пользователей...")
        create_user(master_phone, master_password, "Тестовый мастер", "master")
        create_user(client_phone, client_password, "Тестовый клиент", "client")
        create_user(salon_phone, salon_password, "Владелец салона", "admin")
        print("✅ Пользователи созданы")
        
        # 2. Авторизация мастера
        print("2. Авторизация мастера...")
        master_token = get_auth_token(master_phone, master_password)
        print("✅ Мастер авторизован")
        
        # 3. Авторизация клиента
        print("3. Авторизация клиента...")
        client_token = get_auth_token(client_phone, client_password)
        print("✅ Клиент авторизован")
        
        # 4. Получение ID мастера
        master_id = get_master_id(master_token)
        print(f"✅ ID мастера: {master_id}")
        
        # 5. Создание личного расписания мастера
        print("4. Создание личного расписания мастера...")
        personal_schedule = {
            "type": "weekdays",
            "validUntil": "2025-10-15",
            "weekdays": {
                "1": {"start": "09:00", "end": "18:00"},  # Понедельник
                "2": {"start": "09:00", "end": "18:00"},  # Вторник
                "3": {"start": "09:00", "end": "18:00"},  # Среда
                "4": {"start": "09:00", "end": "18:00"},  # Четверг
                "5": {"start": "09:00", "end": "18:00"},  # Пятница
            }
        }
        
        personal_result = create_master_schedule(master_token, personal_schedule)
        print(f"✅ Личное расписание создано: {personal_result['slots_created']} слотов")
        
        # 6. Создание расписания мастера в салоне
        print("5. Создание расписания мастера в салоне...")
        salon_id = get_salon_id(master_token)
        print(f"✅ ID салона: {salon_id}")
        
        # Создаем расписание для салона с конфликтами
        salon_schedule = {
            "type": "weekdays",
            "validUntil": "2025-10-15",
            "weekdays": {
                "1": {"start": "10:00", "end": "19:00"},  # Понедельник - конфликт с личным
                "2": {"start": "10:00", "end": "19:00"},  # Вторник - конфликт с личным
                "3": {"start": "10:00", "end": "19:00"},  # Среда - конфликт с личным
                "4": {"start": "10:00", "end": "19:00"},  # Четверг - конфликт с личным
                "5": {"start": "10:00", "end": "19:00"},  # Пятница - конфликт с личным
            }
        }
        
        # Создаем расписание для салона через bulk-create
        headers = {"Authorization": f"Bearer {master_token}"}
        response = requests.post(f"{BASE_URL}/api/master/schedule/bulk-create?start_date=2025-09-22&end_date=2025-10-15&salon_id={salon_id}", 
                               headers=headers)
        if response.status_code == 200:
            salon_result = response.json()
            print(f"✅ Расписание в салоне создано: {salon_result['created_records']} записей")
        else:
            print(f"⚠️ Ошибка создания расписания в салоне: {response.text}")
        
        # 7. Создание записей клиента
        print("6. Создание записей клиента...")
        
        # Получаем ID услуг
        master_service_id = get_master_service_id(master_token)
        salon_service_id = get_service_id(master_token, salon_id)
        
        print(f"✅ ID личной услуги мастера: {master_service_id}")
        print(f"✅ ID услуги салона: {salon_service_id}")
        
        # Запись на личную услугу мастера (23 сентября, 10:00-11:00)
        personal_booking = {
            "service_id": master_service_id,
            "indie_master_id": master_id,
            "start_time": "2025-09-23T10:00:00",
            "end_time": "2025-09-23T11:00:00",
            "notes": "Тестовая запись на личную услугу"
        }
        
        personal_booking_result = create_booking(client_token, personal_booking)
        print(f"✅ Личная запись создана: ID {personal_booking_result['id']}")
        
        # Запись на услугу в салоне (24 сентября, 14:00-15:00)
        salon_booking = {
            "service_id": salon_service_id,
            "master_id": master_id,
            "salon_id": salon_id,
            "start_time": "2025-09-24T14:00:00",
            "end_time": "2025-09-24T15:00:00",
            "notes": "Тестовая запись в салоне"
        }
        
        salon_booking_result = create_booking(client_token, salon_booking)
        print(f"✅ Запись в салоне создана: ID {salon_booking_result['id']}")
        
        # 8. Отчет о созданных данных
        print("\n📋 ОТЧЕТ О СОЗДАННЫХ ТЕСТОВЫХ ДАННЫХ:")
        print("=" * 50)
        print(f"1. Личное расписание мастера +{master_phone}:")
        print(f"   - Период: 22 сентября - 15 октября 2025")
        print(f"   - Дни: Понедельник-Пятница")
        print(f"   - Время: 09:00-18:00")
        print(f"   - Создано слотов: {personal_result['slots_created']}")
        
        print(f"\n2. Расписание мастера в салоне +{salon_phone}:")
        print(f"   - Период: 22 сентября - 15 октября 2025")
        print(f"   - Дни: Понедельник-Пятница")
        print(f"   - Время: 10:00-19:00 (конфликт с личным расписанием)")
        print(f"   - Создано записей: {salon_result.get('created_records', 'N/A')}")
        
        print(f"\n3. Записи клиента +{client_phone}:")
        print(f"   - Личная услуга мастера: 23 сентября 2025, 10:00-11:00")
        print(f"   - Услуга в салоне: 24 сентября 2025, 14:00-15:00")
        
        print(f"\n4. Конфликты расписания:")
        print(f"   - Личное расписание: 09:00-18:00")
        print(f"   - Салонное расписание: 10:00-19:00")
        print(f"   - Пересечение: 10:00-18:00 (8 часов конфликта в день)")
        
        print("\n✅ Тестовые данные успешно созданы!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")

if __name__ == "__main__":
    main()

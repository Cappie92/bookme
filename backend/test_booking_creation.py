import asyncio
import requests
import json
from datetime import datetime, timedelta

async def test_booking_creation():
    base_url = "http://localhost:8000"
    
    try:
        print("=== ТЕСТ СОЗДАНИЯ ЗАПИСИ ===\n")
        
        # 1. Сначала авторизуемся как клиент
        print("1. Авторизация...")
        login_data = {
            "phone": "+79999999999",
            "password": "1JaK999myproject"
        }
        
        login_response = requests.post(f"{base_url}/auth/login", json=login_data)
        print(f"Статус авторизации: {login_response.status_code}")
        
        if login_response.status_code != 200:
            print(f"Ошибка авторизации: {login_response.text}")
            return
        
        token = login_response.json().get("access_token")
        print("✅ Авторизация успешна")
        
        # 2. Получаем список мастеров
        print("\n2. Получение списка мастеров...")
        masters_response = requests.get(
            f"{base_url}/salon/masters/list?salon_id=1",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Статус получения мастеров: {masters_response.status_code}")
        
        if masters_response.status_code != 200:
            print(f"Ошибка получения мастеров: {masters_response.text}")
            return
        
        masters = masters_response.json()
        print(f"Найдено мастеров: {len(masters)}")
        
        # Ищем мастера с именем "wdwedewq"
        target_master = None
        for master in masters:
            if master.get('name') == 'wdwedewq' or master.get('user', {}).get('full_name') == 'wdwedewq':
                target_master = master
                break
        
        if not target_master:
            print("❌ Мастер 'wdwedewq' не найден")
            print("Доступные мастера:")
            for master in masters:
                name = master.get('name') or master.get('user', {}).get('full_name', f"Мастер {master['id']}")
                print(f"  - {name} (ID: {master['id']})")
            return
        
        print(f"✅ Найден мастер: {target_master.get('name')} (ID: {target_master['id']})")
        
        # 3. Получаем список услуг
        print("\n3. Получение списка услуг...")
        services_response = requests.get(f"{base_url}/salon/services/public?salon_id=1")
        print(f"Статус получения услуг: {services_response.status_code}")
        
        if services_response.status_code != 200:
            print(f"Ошибка получения услуг: {services_response.text}")
            return
        
        services = services_response.json()
        print(f"Найдено услуг: {len(services)}")
        
        # Ищем услугу с именем "123"
        target_service = None
        for service in services:
            if service.get('name') == '123':
                target_service = service
                break
        
        if not target_service:
            print("❌ Услуга '123' не найдена")
            print("Доступные услуги:")
            for service in services:
                print(f"  - {service['name']} (ID: {service['id']}, длительность: {service['duration']} мин)")
            return
        
        print(f"✅ Найдена услуга: {target_service['name']} (ID: {target_service['id']}, длительность: {target_service['duration']} мин)")
        
        # 4. Получаем доступные слоты для 22.07.2025
        print("\n4. Получение доступных слотов...")
        test_date = datetime(2025, 7, 22, 0, 0, 0)
        
        slots_params = {
            "date": test_date.isoformat(),
            "service_duration": target_service['duration'],
            "owner_type": "master",
            "owner_id": target_master['id']
        }
        
        slots_response = requests.get(f"{base_url}/bookings/available-slots/public", params=slots_params)
        print(f"Статус получения слотов: {slots_response.status_code}")
        
        if slots_response.status_code != 200:
            print(f"Ошибка получения слотов: {slots_response.text}")
            return
        
        slots = slots_response.json()
        print(f"Доступных слотов: {len(slots)}")
        
        # Ищем слот на 9:00
        target_slot = None
        for slot in slots:
            start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
            if start_time.hour == 9 and start_time.minute == 0:
                target_slot = slot
                break
        
        if not target_slot:
            print("❌ Слот на 9:00 не найден")
            print("Доступные слоты:")
            for slot in slots[:10]:  # Показываем первые 10
                start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
                print(f"  - {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
            return
        
        start_time = datetime.fromisoformat(target_slot['start_time'].replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(target_slot['end_time'].replace('Z', '+00:00'))
        print(f"✅ Найден слот: {start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}")
        
        # 5. Создаем запись
        print("\n5. Создание записи...")
        booking_data = {
            "service_id": target_service['id'],
            "master_id": target_master['id'],
            "start_time": target_slot['start_time'],
            "end_time": target_slot['end_time'],
            "notes": "Тестовая запись"
        }
        
        booking_response = requests.post(
            f"{base_url}/client/bookings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            },
            json=booking_data
        )
        
        print(f"Статус создания записи: {booking_response.status_code}")
        print(f"Ответ сервера: {booking_response.text}")
        
        if booking_response.status_code == 200:
            print("✅ Запись успешно создана!")
            booking = booking_response.json()
            print(f"ID записи: {booking['id']}")
        else:
            print("❌ Ошибка создания записи")
            
            # Попробуем проверить конфликт вручную
            print("\n6. Проверка конфликтов вручную...")
            conflict_params = {
                "start_time": target_slot['start_time'],
                "end_time": target_slot['end_time'],
                "owner_type": "master",
                "owner_id": target_master['id']
            }
            
            conflict_response = requests.get(f"{base_url}/bookings/check-conflicts", params=conflict_params)
            print(f"Статус проверки конфликтов: {conflict_response.status_code}")
            print(f"Результат проверки: {conflict_response.text}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_booking_creation()) 
import requests
import json
from datetime import datetime

# Базовый URL API
BASE_URL = "http://localhost:8000"

def test_stats_api():
    """Тестирование API статистики"""
    
    # Сначала попробуем получить статистику без авторизации
    print("1. Тестирование без авторизации:")
    response = requests.get(f"{BASE_URL}/admin/dashboard/stats")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()
    
    # Попробуем с реальным токеном
    print("2. Тестирование с реальным токеном:")
    headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbkBhcHBvaW50by5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NTI4NDA0NjZ9.K7bfb0ctpCjUGa5hH3Gg1FCClFX9Gu-janUQNSHi4Ls"}
    response = requests.get(f"{BASE_URL}/admin/dashboard/stats", headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Успешно получена статистика:")
        print(f"- Всего пользователей: {data.get('total_users', 0)}")
        print(f"- Всего салонов: {data.get('total_salons', 0)}")
        print(f"- Всего мастеров: {data.get('total_masters', 0)}")
        print(f"- Всего записей: {data.get('total_bookings', 0)}")
        print(f"- Постов в блоге: {data.get('total_blog_posts', 0)}")
        print(f"- Конверсия: {data.get('conversion_rate', 0)}%")
        print(f"- Среднее время записи: {data.get('average_booking_duration', 0)}ч")
        print(f"- Последнее обновление: {data.get('last_updated', 'N/A')}")
    else:
        print(f"Response: {response.json()}")
    print()
    
    # Попробуем получить статистику пользователей
    print("3. Тестирование статистики пользователей:")
    response = requests.get(f"{BASE_URL}/admin/stats/users", headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Успешно получена статистика пользователей:")
        print(f"- Всего пользователей: {data.get('total_users', 0)}")
        print(f"- Активных пользователей: {data.get('active_users', 0)}")
        print(f"- Новых сегодня: {data.get('new_users_today', 0)}")
        print(f"- Пользователи по ролям: {data.get('users_by_role', {})}")
    else:
        print(f"Response: {response.json()}")
    print()

if __name__ == "__main__":
    test_stats_api() 
#!/usr/bin/env python3
"""
Скрипт для генерации CSV таблицы доступа к тестовой системе
"""

from database import SessionLocal
from models import User, UserRole, Master, IndieMaster, Salon
import csv
from datetime import datetime

def generate_csv_table():
    db = SessionLocal()
    
    try:
        print("🔐 Генерация CSV таблицы доступа к тестовой системе")
        print("=" * 80)
        
        # Получаем всех пользователей
        users = db.query(User).filter(User.role != UserRole.ADMIN).all()
        
        # Группируем по ролям
        clients = [u for u in users if u.role == UserRole.CLIENT]
        masters = [u for u in users if u.role == UserRole.MASTER]
        
        # Получаем информацию о мастерах
        master_info = {}
        for master in db.query(Master).all():
            master_info[master.user_id] = "Салонный мастер"
        
        for indie_master in db.query(IndieMaster).all():
            if indie_master.user_id in master_info:
                master_info[indie_master.user_id] = "Гибридный мастер"
            else:
                master_info[indie_master.user_id] = "Индивидуальный мастер"
        
        # Получаем информацию о салонах
        salon_info = {}
        for salon in db.query(Salon).all():
            salon_info[salon.id] = salon.name
        
        # Создаем CSV файл
        print("📊 Создание CSV файла с таблицей доступа...")
        
        with open('test_system_access.csv', 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['№', 'Email', 'Пароль', 'ФИО', 'Роль', 'Тип', 'Телефон', 'Город', 'Описание']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            
            # Записываем клиентов
            for i, client in enumerate(clients, 1):
                writer.writerow({
                    '№': i,
                    'Email': client.email,
                    'Пароль': 'test123',
                    'ФИО': client.full_name,
                    'Роль': 'Клиент',
                    'Тип': '',
                    'Телефон': client.phone,
                    'Город': '',
                    'Описание': 'Тестовый клиент'
                })
            
            # Записываем мастеров
            for i, master in enumerate(masters, 1):
                master_type = master_info.get(master.id, "Неизвестно")
                writer.writerow({
                    '№': i + len(clients),
                    'Email': master.email,
                    'Пароль': 'test123',
                    'ФИО': master.full_name,
                    'Роль': 'Мастер',
                    'Тип': master_type,
                    'Телефон': master.phone,
                    'Город': '',
                    'Описание': f'Тестовый {master_type.lower()}'
                })
            
            # Записываем владельцев салонов
            salon_owners = db.query(User).filter(User.role == UserRole.ADMIN, User.email.like('salon%@test.com')).all()
            for i, owner in enumerate(salon_owners, 1):
                writer.writerow({
                    '№': i + len(clients) + len(masters),
                    'Email': owner.email,
                    'Пароль': 'test123',
                    'ФИО': owner.full_name,
                    'Роль': 'Владелец салона',
                    'Тип': '',
                    'Телефон': owner.phone,
                    'Город': 'Москва',
                    'Описание': 'Владелец тестового салона'
                })
            
            # Записываем салоны
            salons = db.query(Salon).all()
            for i, salon in enumerate(salons, 1):
                writer.writerow({
                    '№': i + len(clients) + len(masters) + len(salon_owners),
                    'Email': salon.email,
                    'Пароль': '',
                    'ФИО': salon.name,
                    'Роль': 'Салон',
                    'Тип': '',
                    'Телефон': salon.phone,
                    'Город': salon.city,
                    'Описание': 'Тестовый салон красоты'
                })
        
        print("✅ CSV файл 'test_system_access.csv' успешно создан!")
        
        # Выводим статистику
        print(f"\n📊 Статистика:")
        print(f"   • Клиентов: {len(clients)}")
        print(f"   • Мастеров: {len(masters)}")
        print(f"   • Владельцев салонов: {len(salon_owners)}")
        print(f"   • Салонов: {len(salons)}")
        print(f"   • Всего записей: {len(clients) + len(masters) + len(salon_owners) + len(salons)}")
        
        print("\n✅ Все номера телефонов содержат 10 цифр после +7 (формат: +7XXXXXXXXXX)")
        
        return {
            'clients': clients,
            'masters': masters,
            'owners': salon_owners,
            'salons': salons
        }
        
    except Exception as e:
        print(f"❌ Ошибка при генерации CSV таблицы: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    generate_csv_table()

#!/usr/bin/env python3
"""
Скрипт для генерации таблицы доступа к тестовой системе
Создает Excel файл с полной информацией о доступах
"""

from database import SessionLocal
from models import User, UserRole, Master, IndieMaster, Salon
import pandas as pd
from datetime import datetime

def generate_access_table():
    db = SessionLocal()
    
    try:
        print("🔐 Генерация таблицы доступа к тестовой системе")
        print("=" * 80)
        print("📋 ТАБЛИЦА ДОСТУПА К ТЕСТОВОЙ СИСТЕМЕ")
        print("=" * 80)
        print()
        
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
        
        print("👥 КЛИЕНТЫ (20 пользователей)")
        print("-" * 70)
        print(f"{'№':<3} {'Email':<25} {'Пароль':<10} {'ФИО':<20} {'Телефон':<15}")
        print("-" * 70)
        
        # Данные для Excel
        clients_data = []
        for i, client in enumerate(clients, 1):
            print(f"{i:<3} {client.email:<25} {'test123':<10} {client.full_name:<20} {client.phone:<15}")
            clients_data.append({
                '№': i,
                'Email': client.email,
                'Пароль': 'test123',
                'ФИО': client.full_name,
                'Телефон': client.phone,
                'Роль': 'Клиент'
            })
        
        print()
        print("👨‍💼 МАСТЕРА (10 пользователей)")
        print("-" * 80)
        print(f"{'№':<3} {'Email':<25} {'Пароль':<10} {'ФИО':<25} {'Тип':<20} {'Телефон':<15}")
        print("-" * 80)
        
        # Данные для Excel
        masters_data = []
        for i, master in enumerate(masters, 1):
            master_type = master_info.get(master.id, "Неизвестно")
            print(f"{i:<3} {master.email:<25} {'test123':<10} {master.full_name:<25} {master_type:<20} {master.phone:<15}")
            masters_data.append({
                '№': i,
                'Email': master.email,
                'Пароль': 'test123',
                'ФИО': master.full_name,
                'Тип': master_type,
                'Телефон': master.phone,
                'Роль': 'Мастер'
            })
        
        print()
        print("🏢 САЛОНЫ")
        print("-" * 40)
        salons = db.query(Salon).all()
        salons_data = []
        for i, salon in enumerate(salons, 1):
            print(f"{i}. {salon.name}")
            print(f"   Email: {salon.email}")
            print(f"   Телефон: {salon.phone}")
            print(f"   Город: {salon.city}")
            salons_data.append({
                '№': i,
                'Название': salon.name,
                'Email': salon.email,
                'Телефон': salon.phone,
                'Город': salon.city,
                'Тип': 'Салон'
            })
            print()
        
        print("👑 ВЛАДЕЛЬЦЫ САЛОНОВ")
        print("-" * 50)
        salon_owners = db.query(User).filter(User.role == UserRole.ADMIN, User.email.like('salon%@test.com')).all()
        owners_data = []
        for i, owner in enumerate(salon_owners, 1):
            print(f"{i}. {owner.full_name}")
            print(f"   Email: {owner.email}")
            print(f"   Пароль: test123")
            print(f"   Роль: Владелец салона")
            print(f"   Телефон: {owner.phone}")
            owners_data.append({
                '№': i,
                'Email': owner.email,
                'Пароль': 'test123',
                'ФИО': owner.full_name,
                'Роль': 'Владелец салона',
                'Телефон': owner.phone,
                'Тип': 'Владелец салона'
            })
            print()
        
        # Создаем Excel файл
        print("📊 Создание Excel файла с таблицей доступа...")
        
        # Объединяем все данные
        all_data = clients_data + masters_data + owners_data
        
        # Создаем DataFrame
        df = pd.DataFrame(all_data)
        
        # Создаем Excel файл с несколькими листами
        with pd.ExcelWriter('test_system_access.xlsx', engine='openpyxl') as writer:
            # Основная таблица
            df.to_excel(writer, sheet_name='Все пользователи', index=False)
            
            # Лист с клиентами
            clients_df = pd.DataFrame(clients_data)
            clients_df.to_excel(writer, sheet_name='Клиенты', index=False)
            
            # Лист с мастерами
            masters_df = pd.DataFrame(masters_data)
            masters_df.to_excel(writer, sheet_name='Мастера', index=False)
            
            # Лист с салонами
            salons_df = pd.DataFrame(salons_data)
            salons_df.to_excel(writer, sheet_name='Салоны', index=False)
            
            # Лист с владельцами
            owners_df = pd.DataFrame(owners_data)
            owners_df.to_excel(writer, sheet_name='Владельцы салонов', index=False)
        
        print("✅ Excel файл 'test_system_access.xlsx' успешно создан!")
        
        print()
        print("=" * 80)
        print("📝 ИНСТРУКЦИЯ ПО ТЕСТИРОВАНИЮ:")
        print("=" * 80)
        print("1. Запустите фронтенд и бэкенд")
        print("2. Используйте любой email и пароль 'test123' для входа")
        print("3. Тестируйте разные роли:")
        print("   • Клиенты: могут бронировать услуги")
        print("   • Мастера: могут управлять расписанием и услугами")
        print("   • Салонные мастера: работают только в салонах")
        print("   • Индивидуальные мастера: работают на себя")
        print("   • Гибридные мастера: работают и в салонах, и на себя")
        print("4. Проверьте дашборды для каждой роли")
        print("5. Тестируйте бронирования, управление услугами и расписанием")
        print()
        print("🔑 ВСЕ ПАРОЛИ: test123")
        print("📱 ВСЕ НОМЕРА ТЕЛЕФОНОВ: 10 цифр после +7 (формат +7XXXXXXXXXX)")
        print("=" * 80)
        
        return {
            'clients': clients,
            'masters': masters,
            'salons': salons,
            'owners': salon_owners
        }
        
    except Exception as e:
        print(f"❌ Ошибка при генерации таблицы: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    generate_access_table()

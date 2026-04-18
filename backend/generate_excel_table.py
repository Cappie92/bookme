#!/usr/bin/env python3
"""
Скрипт для генерации Excel таблицы с логинами и паролями тестовой системы
"""

import pandas as pd
from database import SessionLocal
from models import User, UserRole, Master, IndieMaster, Salon

def generate_excel_table():
    db = SessionLocal()
    
    try:
        print("📊 Генерация Excel таблицы с логинами и паролями...")
        
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
        
        # Создаем данные для клиентов
        clients_data = []
        for i, client in enumerate(clients, 1):
            clients_data.append({
                '№': i,
                'Email': client.email,
                'Пароль': 'test123',
                'ФИО': client.full_name,
                'Роль': 'Клиент',
                'Телефон': client.phone
            })
        
        # Создаем данные для мастеров
        masters_data = []
        for i, master in enumerate(masters, 1):
            master_type = master_info.get(master.id, "Неизвестно")
            masters_data.append({
                '№': i,
                'Email': master.email,
                'Пароль': 'test123',
                'ФИО': master.full_name,
                'Роль': master_type,
                'Телефон': master.phone
            })
        
        # Получаем владельцев салонов
        salon_owners = db.query(User).filter(User.role == UserRole.ADMIN, User.email.like('salon%@test.com')).all()
        owners_data = []
        for i, owner in enumerate(salon_owners, 1):
            owners_data.append({
                '№': i,
                'Email': owner.email,
                'Пароль': 'test123',
                'ФИО': owner.full_name,
                'Роль': 'Владелец салона',
                'Телефон': owner.phone
            })
        
        # Получаем информацию о салонах
        salons = db.query(Salon).all()
        salons_data = []
        for i, salon in enumerate(salons, 1):
            salons_data.append({
                '№': i,
                'Название': salon.name,
                'Email': salon.email,
                'Телефон': salon.phone,
                'Город': salon.city,
                'Описание': salon.description
            })
        
        # Создаем Excel файл
        with pd.ExcelWriter('test_system_access.xlsx', engine='openpyxl') as writer:
            # Лист с клиентами
            df_clients = pd.DataFrame(clients_data)
            df_clients.to_excel(writer, sheet_name='Клиенты', index=False)
            
            # Лист с мастерами
            df_masters = pd.DataFrame(masters_data)
            df_masters.to_excel(writer, sheet_name='Мастера', index=False)
            
            # Лист с владельцами салонов
            df_owners = pd.DataFrame(owners_data)
            df_owners.to_excel(writer, sheet_name='Владельцы салонов', index=False)
            
            # Лист с салонами
            df_salons = pd.DataFrame(salons_data)
            df_salons.to_excel(writer, sheet_name='Салоны', index=False)
            
            # Лист с инструкциями
            instructions_data = [
                {'Пункт': '1', 'Действие': 'Запустите фронтенд и бэкенд', 'Описание': 'Убедитесь, что оба сервиса работают'},
                {'Пункт': '2', 'Действие': 'Используйте любой email и пароль test123', 'Описание': 'Все пользователи имеют одинаковый пароль'},
                {'Пункт': '3', 'Действие': 'Тестируйте разные роли', 'Описание': 'Клиенты, мастера, владельцы салонов'},
                {'Пункт': '4', 'Действие': 'Проверьте дашборды', 'Описание': 'Каждая роль имеет свой дашборд'},
                {'Пункт': '5', 'Действие': 'Тестируйте бронирования', 'Описание': 'Создание, редактирование, отмена'},
                {'Пункт': '6', 'Действие': 'Проверьте управление услугами', 'Описание': 'Добавление, редактирование услуг'},
                {'Пункт': '7', 'Действие': 'Тестируйте расписание', 'Описание': 'Настройка рабочих часов'},
                {'Пункт': '8', 'Действие': 'Проверьте новые функции', 'Описание': 'Дашборды, ограничения, бухгалтерия'}
            ]
            df_instructions = pd.DataFrame(instructions_data)
            df_instructions.to_excel(writer, sheet_name='Инструкции по тестированию', index=False)
            
            # Лист с общей информацией
            summary_data = [
                {'Параметр': 'Всего пользователей', 'Значение': len(users) + len(salon_owners)},
                {'Параметр': 'Клиентов', 'Значение': len(clients)},
                {'Параметр': 'Мастеров', 'Значение': len(masters)},
                {'Параметр': 'Владельцев салонов', 'Значение': len(salon_owners)},
                {'Параметр': 'Салонов', 'Значение': len(salons)},
                {'Параметр': 'Филиалов', 'Значение': len(salons) * 2},
                {'Параметр': 'Услуг в салонах', 'Значение': 10},
                {'Параметр': 'Услуг у индивидуалов', 'Значение': 18},
                {'Параметр': 'Типов услуг', 'Значение': 8},
                {'Параметр': 'Бронирований', 'Значение': '~60+'},
                {'Параметр': 'Период бронирований', 'Значение': '2 недели'},
                {'Параметр': 'Все пароли', 'Значение': 'test123'}
            ]
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_excel(writer, sheet_name='Общая информация', index=False)
        
        print("✅ Excel таблица успешно создана: test_system_access.xlsx")
        print(f"📊 Содержит {len(clients)} клиентов, {len(masters)} мастеров, {len(salon_owners)} владельцев салонов")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при создании Excel таблицы: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    generate_excel_table()

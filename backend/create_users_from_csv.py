#!/usr/bin/env python3
"""
Скрипт для создания пользователей из CSV файла с доступами
Поддерживает универсальных мастеров (both, salon, indie)
"""

import csv
import bcrypt
import sqlite3
from datetime import datetime
from pathlib import Path

def hash_password(password: str) -> str:
    """Хэширует пароль"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_users_from_csv(csv_file_path: str, db_path: str = "bookme.db"):
    """Создает пользователей из CSV файла"""
    
    # Подключаемся к базе данных
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Читаем CSV файл
    with open(csv_file_path, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        
        for row in reader:
            try:
                # Извлекаем данные из строки
                email = row['email'].strip()
                phone = row['phone'].strip()
                full_name = row['full_name'].strip()
                password = row['password'].strip()
                role = row['role'].strip().upper()
                specialization = row.get('specialization', '').strip().lower()
                
                print(f"Создаем пользователя: {email} ({role})")
                
                # Хэшируем пароль
                hashed_password = hash_password(password)
                
                # Создаем пользователя
                cursor.execute('''
                    INSERT INTO users (email, phone, full_name, hashed_password, role, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (email, phone, full_name, hashed_password, role, True, datetime.now(), datetime.now()))
                
                user_id = cursor.lastrowid
                
                # Обрабатываем мастеров в зависимости от специализации
                if role == 'MASTER':
                    if specialization == 'both':
                        # Универсальный мастер - создаем Master с обеими возможностями
                        cursor.execute('''
                            INSERT INTO masters (user_id, bio, experience_years, can_work_independently, can_work_in_salon, 
                                               created_at, city, timezone)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, '', 0, True, True, datetime.now(), 'Москва', 'Europe/Moscow'))
                        
                        # Также создаем запись в indie_masters для независимой работы
                        cursor.execute('''
                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
                                                     payment_on_visit, payment_advance, is_active, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, True, None, None, 'Москва', 'Europe/Moscow', True, False, True, datetime.now(), datetime.now()))
                        
                        print(f"  ✅ Создан универсальный мастер (салон + независимый)")
                        
                    elif specialization == 'salon':
                        # Только салонный мастер
                        cursor.execute('''
                            INSERT INTO masters (user_id, bio, experience_years, can_work_independently, can_work_in_salon, 
                                               created_at, city, timezone)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, '', 0, False, True, datetime.now(), 'Москва', 'Europe/Moscow'))
                        
                        print(f"  ✅ Создан салонный мастер")
                        
                    elif specialization == 'indie':
                        # Только независимый мастер
                        cursor.execute('''
                            INSERT INTO masters (user_id, bio, experience_years, can_work_independently, can_work_in_salon, 
                                               created_at, city, timezone)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, '', 0, True, False, datetime.now(), 'Москва', 'Europe/Moscow'))
                        
                        # Создаем запись в indie_masters
                        cursor.execute('''
                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
                                                     payment_on_visit, payment_advance, is_active, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, True, None, None, 'Москва', 'Europe/Moscow', True, False, True, datetime.now(), datetime.now()))
                        
                        print(f"  ✅ Создан независимый мастер")
                        
                    else:
                        # По умолчанию - универсальный мастер
                        cursor.execute('''
                            INSERT INTO masters (user_id, bio, experience_years, can_work_independently, can_work_in_salon, 
                                               created_at, city, timezone)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, '', 0, True, True, datetime.now(), 'Москва', 'Europe/Moscow'))
                        
                        cursor.execute('''
                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
                                                     payment_on_visit, payment_advance, is_active, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (user_id, True, None, None, 'Москва', 'Europe/Moscow', True, False, True, datetime.now(), datetime.now()))
                        
                        print(f"  ✅ Создан мастер по умолчанию (универсальный)")
                
                elif role == 'SALON':
                    # Создаем салон
                    cursor.execute('''
                        INSERT INTO salons (user_id, name, description, city, timezone, is_active, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (user_id, full_name, f'Описание салона {full_name}', 'Москва', 'Europe/Moscow', True, datetime.now(), datetime.now()))
                    
                    print(f"  ✅ Создан салон")
                
                print(f"  ✅ Пользователь {email} создан успешно")
                
            except Exception as e:
                print(f"  ❌ Ошибка при создании пользователя {row.get('email', 'unknown')}: {e}")
                continue
    
    # Сохраняем изменения
    conn.commit()
    conn.close()
    
    print("\n🎉 Создание пользователей завершено!")

def main():
    """Основная функция"""
    import sys
    
    if len(sys.argv) != 2:
        print("Использование: python create_users_from_csv.py <путь_к_csv_файлу>")
        print("Пример: python create_users_from_csv.py users.csv")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    
    if not Path(csv_file).exists():
        print(f"❌ Файл {csv_file} не найден!")
        sys.exit(1)
    
    print(f"📁 Читаем файл: {csv_file}")
    create_users_from_csv(csv_file)

if __name__ == "__main__":
    main()


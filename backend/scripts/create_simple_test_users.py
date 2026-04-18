#!/usr/bin/env python3
"""
Упрощенный скрипт для создания тестовых пользователей с паролями.
Создает только пользователей без подписок и балансов.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, UserRole
from auth import get_password_hash

# Тестовые пользователи
TEST_USERS = [
    {"phone": "+79990000001", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000002", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000003", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000004", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000005", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000006", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000007", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000008", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000009", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000010", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000011", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000012", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000013", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000014", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000015", "role": UserRole.MASTER, "password": "test123"},
    {"phone": "+79990000016", "role": UserRole.MASTER, "password": "test123"},
]

def create_test_users():
    db = SessionLocal()
    
    try:
        print("🔧 Создание тестовых пользователей...\n")
        
        created_count = 0
        updated_count = 0
        existing_count = 0
        
        for user_data in TEST_USERS:
            phone = user_data["phone"]
            role = user_data["role"]
            password = user_data["password"]
            
            # Проверяем существующего пользователя
            user = db.query(User).filter(User.phone == phone).first()
            
            if user:
                # Обновляем пароль, если его нет
                if not user.hashed_password:
                    user.hashed_password = get_password_hash(password)
                    user.is_verified = True
                    user.is_phone_verified = True
                    user.is_active = True
                    db.commit()
                    print(f"  ✅ Обновлен: {phone} (пароль установлен)")
                    updated_count += 1
                else:
                    print(f"  ⏭️  Пропущен: {phone} (уже существует)")
                    existing_count += 1
            else:
                # Создаем нового пользователя
                user = User(
                    phone=phone,
                    role=role,
                    hashed_password=get_password_hash(password),
                    is_verified=True,
                    is_phone_verified=True,
                    is_active=True,
                    is_always_free=False
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"  ✅ Создан: {phone} (ID: {user.id}, пароль: {password})")
                created_count += 1
        
        print(f"\n📊 Итого:")
        print(f"  - Создано: {created_count}")
        print(f"  - Обновлено: {updated_count}")
        print(f"  - Уже существовало: {existing_count}")
        print(f"\n✅ Готово! Всего пользователей: {created_count + updated_count + existing_count}")
        print(f"\n🔑 Для входа используйте:")
        print(f"  - Телефон: +79990000001 (или любой другой из списка)")
        print(f"  - Пароль: test123")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_test_users()


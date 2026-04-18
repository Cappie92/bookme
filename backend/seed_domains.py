#!/usr/bin/env python3
"""
Скрипт для добавления тестовых поддоменов в базу данных
"""

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Salon, IndieMaster, User, UserRole
import uuid

def create_test_domains():
    db = SessionLocal()
    
    try:
        # Проверяем, существует ли тестовый салон
        test_salon = db.query(Salon).filter(Salon.domain == "test-salon").first()
        if not test_salon:
            # Создаем пользователя для салона
            salon_user = User(
                email="test-salon@example.com",
                phone="+79991234567",
                full_name="Тестовый салон",
                role=UserRole.SALON,
                is_active=True,
                is_verified=True
            )
            db.add(salon_user)
            db.flush()  # Получаем ID пользователя
            
            # Создаем салон
            test_salon = Salon(
                user_id=salon_user.id,
                name="Тестовый салон красоты",
                description="Современный салон красоты с профессиональными мастерами",
                domain="test-salon",
                phone="+7 (999) 123-45-67",
                email="info@test-salon.ru",
                address="ул. Тестовая, д. 1, Москва",
                website="https://test-salon.ru",
                instagram="test_salon",
                working_hours="Пн-Пт: 9:00-21:00\nСб-Вс: 10:00-20:00",
                city="Москва",
                timezone="Europe/Moscow",
                is_active=True
            )
            db.add(test_salon)
            print("✅ Создан тестовый салон: test-salon")
        else:
            print("ℹ️ Тестовый салон уже существует: test-salon")
        
        # Проверяем, существует ли тестовый мастер
        test_master = db.query(IndieMaster).filter(IndieMaster.domain == "test-master").first()
        if not test_master:
            # Создаем пользователя для мастера
            master_user = User(
                email="test-master@example.com",
                phone="+79991234568",
                full_name="Анна Мастер",
                role=UserRole.INDIE,
                is_active=True,
                is_verified=True
            )
            db.add(master_user)
            db.flush()  # Получаем ID пользователя
            
            # Создаем независимого мастера
            test_master = IndieMaster(
                user_id=master_user.id,
                bio="Профессиональный мастер с 5-летним опытом работы в сфере красоты",
                experience_years=5,
                domain="test-master",
                website="https://test-master.ru",
                city="Москва",
                timezone="Europe/Moscow"
            )
            db.add(test_master)
            print("✅ Создан тестовый мастер: test-master")
        else:
            print("ℹ️ Тестовый мастер уже существует: test-master")
        
        # Сохраняем изменения
        db.commit()
        print("✅ Все тестовые поддомены созданы успешно!")
        
        # Выводим информацию о созданных поддоменах
        print("\n📋 Созданные тестовые поддомены:")
        print("• http://localhost:5173/domain/test-salon - Тестовый салон")
        print("• http://localhost:5173/domain/test-master - Тестовый мастер")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при создании тестовых поддоменов: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_test_domains() 
#!/usr/bin/env python3
"""
Скрипт для создания тестовых записей для мастера
Создает 15 записей в будущем для тестирования лимитов
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import datetime, timedelta, time
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Service, Booking, BookingStatus

def create_test_bookings():
    """Создать 15 тестовых записей для мастера"""
    db: Session = SessionLocal()
    
    try:
        # Находим мастера по телефону
        master_user = db.query(User).filter(User.phone == '+79435774911').first()
        if not master_user:
            print("❌ Мастер с телефоном +79435774911 не найден")
            return
        
        print(f"✅ Мастер найден: {master_user.full_name} (ID: {master_user.id})")
        
        # Находим профиль мастера
        master = db.query(Master).filter(Master.user_id == master_user.id).first()
        if not master:
            print("❌ Профиль мастера не найден")
            return
        
        print(f"✅ Профиль мастера найден (ID: {master.id})")
        
        # Получаем реальные услуги мастера (services)
        master_services = master.services
        if not master_services:
            print("❌ У мастера нет услуг (Service). Создайте услуги перед запуском скрипта.")
            return
        
        print(f"✅ Найдено услуг: {len(master_services)}")
        for service in master_services:
            print(f"   - {service.name} (ID: {service.id}, длительность: {service.duration} мин)")
        
        # Получаем текущую дату и время
        now = datetime.now()
        today_start = datetime.combine(now.date(), time.min)  # Сегодня 00:00
        
        # Создаем 15 записей начиная с сегодняшнего дня
        bookings_created = 0
        current_date = today_start
        hour = 10  # Начинаем с 10:00
        
        # Создаем тестового клиента, если его нет
        test_client = db.query(User).filter(User.phone == '+79999999999').first()
        if not test_client:
            from models import UserRole
            test_client = User(
                phone='+79999999999',
                email='test@test.com',
                full_name='Тестовый Клиент',
                role=UserRole.CLIENT,
                is_active=True,
                is_verified=True
            )
            db.add(test_client)
            db.commit()
            db.refresh(test_client)
            print(f"✅ Создан тестовый клиент (ID: {test_client.id})")
        
        while bookings_created < 15:
            # Пропускаем выходные (суббота=5, воскресенье=6)
            if current_date.weekday() >= 5:
                current_date += timedelta(days=1)
                hour = 10  # Сбрасываем час на следующий день
                continue
            
            # Выбираем услугу
            service = master_services[bookings_created % len(master_services)]
            
            # Создаем время начала и окончания
            start_time = current_date.replace(hour=hour, minute=0, second=0, microsecond=0)
            end_time = start_time + timedelta(minutes=service.duration)
            
            # Проверяем, нет ли уже записи на это время
            existing_booking = db.query(Booking).filter(
                Booking.master_id == master.id,
                Booking.start_time == start_time,
                Booking.status != BookingStatus.CANCELLED
            ).first()
            
            if existing_booking:
                # Если запись уже есть, переходим к следующему часу
                hour += 1
                if hour >= 18:  # Если уже поздно, переходим на следующий день
                    current_date += timedelta(days=1)
                    hour = 10
                continue
            
            # Создаем запись
            booking = Booking(
                master_id=master.id,
                client_id=test_client.id,
                service_id=service.id,
                start_time=start_time,
                end_time=end_time,
                status=BookingStatus.CREATED,
                notes=f'Тестовая запись #{bookings_created + 1} - {service.name}'
            )
            booking.payment_amount = service.price or 0
            
            db.add(booking)
            bookings_created += 1
            
            print(f"✅ Создана запись #{bookings_created}: {start_time.strftime('%Y-%m-%d %H:%M')} - {master_service.name}")
            
            # Переходим к следующему часу
            hour += 2  # Делаем интервал в 2 часа между записями
            if hour >= 18:  # Если уже поздно, переходим на следующий день
                current_date += timedelta(days=1)
                hour = 10
        
        db.commit()
        print(f"\n✅ Успешно создано {bookings_created} записей для мастера {master_user.full_name}")
        print(f"   Первая запись: {today_start.strftime('%Y-%m-%d %H:%M')}")
        print(f"   Последняя запись: {current_date.strftime('%Y-%m-%d %H:%M')}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при создании записей: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_test_bookings()


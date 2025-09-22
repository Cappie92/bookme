#!/usr/bin/env python3
"""
Скрипт для сброса тестовой системы и создания новых данных
Удаляет старые тестовые аккаунты и создает новые с правильными номерами телефонов
"""

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterServiceSettings, Booking, BookingStatus
from auth import get_password_hash
import random
from datetime import datetime, timedelta

def reset_test_system():
    db = SessionLocal()
    
    try:
        print("🗑️ Очистка старой тестовой системы...")
        
        # Удаляем все тестовые данные
        print("   Удаляем бронирования...")
        db.query(Booking).delete()
        
        print("   Удаляем настройки мастеров...")
        db.query(SalonMasterServiceSettings).delete()
        
        print("   Удаляем услуги...")
        db.query(Service).delete()
        
        print("   Удаляем категории услуг...")
        db.query(ServiceCategory).delete()
        
        print("   Удаляем мастеров...")
        db.query(Master).delete()
        db.query(IndieMaster).delete()
        
        print("   Удаляем филиалы...")
        db.query(SalonBranch).delete()
        
        print("   Удаляем салоны...")
        db.query(Salon).delete()
        
        print("   Удаляем тестовых пользователей...")
        # Удаляем всех пользователей кроме админов
        test_users = db.query(User).filter(
            User.email.like('%@test.com'),
            User.role != UserRole.ADMIN
        ).all()
        
        for user in test_users:
            db.delete(user)
        
        # Удаляем владельцев салонов
        salon_owners = db.query(User).filter(
            User.email.like('salon%@test.com')
        ).all()
        
        for owner in salon_owners:
            db.delete(owner)
        
        db.commit()
        print("✅ Старая тестовая система очищена")
        
        print("\n🌱 Создание новой тестовой системы...")
        
        # 1. Создаем пользователей для салонов
        print("👤 Создаем пользователей для салонов...")
        salon_users = []
        for i in range(2):
            user = User(
                email=f"salon{i+1}@test.com",
                hashed_password=get_password_hash("test123"),
                phone=f"+7{9000000000 + i}",
                full_name=f"Владелец салона №{i+1}",
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
                is_phone_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            salon_users.append(user)
            print(f"   ✅ Создан пользователь для салона: {user.full_name}")
        
        # 2. Создаем салоны
        print("🏢 Создаем салоны...")
        salons = []
        for i, user in enumerate(salon_users):
            salon = Salon(
                user_id=user.id,
                name=f"Салон красоты №{i+1}",
                description=f"Описание салона красоты №{i+1}",
                city=f"Москва",
                phone=f"+7{9000000000 + i}",
                email=f"salon{i+1}@test.com",
                website=f"salon{i+1}.test.com",
                payment_on_visit=True,
                payment_advance=False
            )
            db.add(salon)
            db.commit()
            db.refresh(salon)
            salons.append(salon)
            print(f"   ✅ Создан салон: {salon.name}")
        
        # 3. Создаем филиалы для каждого салона
        print("🏪 Создаем филиалы...")
        branches = []
        for salon in salons:
            for j in range(2):
                branch = SalonBranch(
                    salon_id=salon.id,
                    name=f"Филиал {j+1}",
                    address=f"ул. Филиальная {j+1}, д. {j+1}",
                    phone=f"+7{random.randint(9000000000, 9999999999)}",
                    working_hours="09:00-21:00",
                    is_active=True
                )
                db.add(branch)
                db.commit()
                db.refresh(branch)
                branches.append(branch)
                print(f"   ✅ Создан филиал: {branch.name} для салона {salon.name}")
        
        # 4. Создаем типы услуг
        print("📋 Создаем типы услуг...")
        service_categories = [
            "Стрижка и укладка",
            "Окрашивание",
            "Маникюр и педикюр",
            "Массаж",
            "Косметология",
            "Макияж",
            "Эпиляция",
            "SPA-процедуры"
        ]
        
        created_categories = []
        for category_name in service_categories:
            category = ServiceCategory(name=category_name)
            db.add(category)
            db.commit()
            db.refresh(category)
            created_categories.append(category)
            print(f"   ✅ Создан тип услуги: {category.name}")
        
        # 5. Создаем мастеров
        print("👨‍💼 Создаем мастеров...")
        masters = []
        indie_masters = []
        
        # 3 индивидуала
        for i in range(3):
            user = User(
                email=f"indie_master{i+1}@test.com",
                hashed_password=get_password_hash("test123"),
                phone=f"+7{random.randint(9000000000, 9999999999)}",
                full_name=f"Индивидуальный мастер {i+1}",
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
                is_phone_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            indie_master = IndieMaster(
                user_id=user.id,
                bio=f"Опытный мастер с {random.randint(3, 15)} лет стажа",
                experience_years=random.randint(3, 15),
                domain=f"indie-master{i+1}.test.com",
                address=f"ул. Индивидуальная {i+1}, д. {i+1}",
                payment_on_visit=True,
                payment_advance=random.choice([True, False])
            )
            db.add(indie_master)
            db.commit()
            db.refresh(indie_master)
            indie_masters.append(indie_master)
            print(f"   ✅ Создан индивидуальный мастер: {user.full_name}")
        
        # 4 работают только в салонах
        for i in range(4):
            user = User(
                email=f"salon_master{i+1}@test.com",
                hashed_password=get_password_hash("test123"),
                phone=f"+7{random.randint(9000000000, 9999999999)}",
                full_name=f"Салонный мастер {i+1}",
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
                is_phone_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            master = Master(
                user_id=user.id,
                bio=f"Мастер салона с {random.randint(2, 10)} лет опыта",
                experience_years=random.randint(2, 10),
                can_work_independently=False,
                can_work_in_salon=True
            )
            db.add(master)
            db.commit()
            db.refresh(master)
            masters.append(master)
            print(f"   ✅ Создан салонный мастер: {user.full_name}")
        
        # 3 работают и на себя и в салоне
        for i in range(3):
            user = User(
                email=f"hybrid_master{i+1}@test.com",
                hashed_password=get_password_hash("test123"),
                phone=f"+7{random.randint(9000000000, 9999999999)}",
                full_name=f"Гибридный мастер {i+1}",
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
                is_phone_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            master = Master(
                user_id=user.id,
                bio=f"Универсальный мастер с {random.randint(5, 20)} лет стажа",
                experience_years=random.randint(5, 20),
                can_work_independently=True,
                can_work_in_salon=True
            )
            db.add(master)
            db.commit()
            db.refresh(master)
            masters.append(master)
            
            # Создаем также как индивидуала
            indie_master = IndieMaster(
                user_id=user.id,
                bio=f"Универсальный мастер с {random.randint(5, 20)} лет стажа",
                experience_years=random.randint(5, 20),
                domain=f"hybrid-master{i+1}.test.com",
                address=f"ул. Гибридная {i+1}, д. {i+1}",
                payment_on_visit=True,
                payment_advance=random.choice([True, False])
            )
            db.add(indie_master)
            db.commit()
            db.refresh(indie_master)
            indie_masters.append(indie_master)
            print(f"   ✅ Создан гибридный мастер: {user.full_name}")
        
        # 6. Создаем услуги для салонов
        print("💇‍♀️ Создаем услуги для салонов...")
        salon_services = []
        for salon in salons:
            for category in random.sample(created_categories, 5):  # 5 случайных категорий
                service = Service(
                    name=f"{category.name} - {salon.name}",
                    description=f"Описание услуги {category.name} в {salon.name}",
                    price=random.randint(500, 5000),
                    duration=random.randint(30, 180),
                    salon_id=salon.id,
                    category_id=category.id
                )
                db.add(service)
                db.commit()
                db.refresh(service)
                salon_services.append(service)
                print(f"   ✅ Создана услуга: {service.name} - {service.price}₽")
        
        # 7. Создаем услуги для индивидуальных мастеров
        print("👨‍🎨 Создаем услуги для индивидуальных мастеров...")
        indie_services = []
        for indie_master in indie_masters:
            for category in random.sample(created_categories, 3):  # 3 случайных категории
                service = Service(
                    name=f"{category.name} - {indie_master.user.full_name}",
                    description=f"Описание услуги {category.name} от {indie_master.user.full_name}",
                    price=random.randint(800, 6000),
                    duration=random.randint(45, 240),
                    salon_id=None,
                    category_id=category.id
                )
                db.add(service)
                db.commit()
                db.refresh(service)
                indie_services.append(service)
                print(f"   ✅ Создана услуга: {service.name} - {service.price}₽")
        
        # 8. Связываем мастеров с услугами в салонах
        print("🔗 Связываем мастеров с услугами в салонах...")
        for master in masters:
            # Распределяем мастеров по салонам
            salon = random.choice(salons)
            for service in random.sample(salon_services, 3):  # 3 случайные услуги
                if service.salon_id == salon.id:
                    settings = SalonMasterServiceSettings(
                        master_id=master.id,
                        salon_id=salon.id,
                        service_id=service.id,
                        is_active=True,
                        master_payment_type="percent",
                        master_payment_value=random.randint(30, 70)
                    )
                    db.add(settings)
                    print(f"   ✅ Мастер {master.user.full_name} связан с услугой {service.name} в {salon.name}")
        
        db.commit()
        
        # 9. Создаем клиентов
        print("👥 Создаем клиентов...")
        clients = []
        for i in range(20):
            user = User(
                email=f"client{i+1}@test.com",
                hashed_password=get_password_hash("test123"),
                phone=f"+7{random.randint(9000000000, 9999999999)}",
                full_name=f"Клиент {i+1}",
                role=UserRole.CLIENT,
                is_active=True,
                is_verified=True,
                is_phone_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            clients.append(user)
            print(f"   ✅ Создан клиент: {user.full_name}")
        
        # 10. Создаем бронирования на ближайшие 2 недели
        print("📅 Создаем бронирования...")
        start_date = datetime.now() + timedelta(days=1)
        
        for client in clients:
            # 2-4 бронирования на клиента
            num_bookings = random.randint(2, 4)
            for _ in range(num_bookings):
                # Случайная дата в ближайшие 2 недели
                random_days = random.randint(1, 14)
                random_hours = random.randint(9, 18)
                random_minutes = random.choice([0, 15, 30, 45])
                
                booking_date = start_date + timedelta(days=random_days)
                start_time = booking_date.replace(hour=random_hours, minute=random_minutes)
                
                # Выбираем случайную услугу (салонную или индивидуальную)
                if random.choice([True, False]) and salon_services:
                    # Бронирование в салон
                    service = random.choice(salon_services)
                    end_time = start_time + timedelta(minutes=service.duration)
                    
                    booking = Booking(
                        client_id=client.id,
                        service_id=service.id,
                        salon_id=service.salon_id,
                        start_time=start_time,
                        end_time=end_time,
                        status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
                        payment_amount=service.price
                    )
                else:
                    # Бронирование к индивидуальному мастеру
                    if indie_services:
                        service = random.choice(indie_services)
                        end_time = start_time + timedelta(minutes=service.duration)
                        
                        # Находим индивидуала для этой услуги
                        indie_master = None
                        for im in indie_masters:
                            if im.user.full_name in service.name:
                                indie_master = im
                                break
                        
                        if indie_master:
                            booking = Booking(
                                client_id=client.id,
                                service_id=service.id,
                                indie_master_id=indie_master.id,
                                start_time=start_time,
                                end_time=end_time,
                                status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
                                payment_amount=service.price
                            )
                        else:
                            continue
                    else:
                        continue
                
                db.add(booking)
                print(f"   ✅ Создано бронирование: {client.full_name} -> {service.name} на {start_time.strftime('%d.%m.%Y %H:%M')}")
        
        db.commit()
        
        print("\n🎉 Новая тестовая система успешно создана!")
        print("\n📊 Статистика:")
        print(f"   • Салонов: {len(salons)}")
        print(f"   • Филиалов: {len(branches)}")
        print(f"   • Мастеров в салонах: {len(masters)}")
        print(f"   • Индивидуальных мастеров: {len(indie_masters)}")
        print(f"   • Клиентов: {len(clients)}")
        print(f"   • Услуг в салонах: {len(salon_services)}")
        print(f"   • Услуг у индивидуалов: {len(indie_services)}")
        
        print("\n✅ Все номера телефонов теперь содержат 10 цифр после +7 (формат: +7XXXXXXXXXX)")
        
        return {
            'salons': salons,
            'masters': masters,
            'indie_masters': indie_masters,
            'clients': clients
        }
        
    except Exception as e:
        print(f"❌ Ошибка при сбросе тестовой системы: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    reset_test_system()

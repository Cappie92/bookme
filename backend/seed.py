import random
from datetime import datetime, timedelta

from faker import Faker

from auth import get_password_hash
from database import SessionLocal
from models import (
    Booking,
    BookingStatus,
    IndieMaster,
    Master,
    Salon,
    Service,
    User,
    UserRole,
)

fake = Faker("ru_RU")


def create_test_data():
    db = SessionLocal()
    try:
        # Создаем администратора
        admin = User(
            email="admin@example.com",
            phone="+79001234567",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()

        # Создаем владельцев салонов
        salons = []
        for _ in range(3):
            salon_owner = User(
                email=fake.email(),
                phone=fake.phone_number(),
                hashed_password=get_password_hash("password123"),
                role=UserRole.SALON,
                is_active=True,
                is_verified=True,
            )
            db.add(salon_owner)
            db.commit()

            salon = Salon(
                user_id=salon_owner.id,
                name=fake.company(),
                address=fake.address(),
                description=fake.text(),
                domain=fake.domain_word(),
            )
            db.add(salon)
            db.commit()
            salons.append(salon)

        # Создаем мастеров
        masters = []
        for _ in range(5):
            master_user = User(
                email=fake.email(),
                phone=fake.phone_number(),
                hashed_password=get_password_hash("password123"),
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
            )
            db.add(master_user)
            db.commit()

            master = Master(
                user_id=master_user.id,
                bio=fake.text(),
                experience_years=random.randint(1, 15),
            )
            db.add(master)
            db.commit()
            masters.append(master)

            # Назначаем мастеров в салоны
            for salon in random.sample(salons, random.randint(1, len(salons))):
                salon.masters.append(master)

        # Создаем независимых мастеров
        indie_masters = []
        for _ in range(3):
            indie_user = User(
                email=fake.email(),
                phone=fake.phone_number(),
                hashed_password=get_password_hash("password123"),
                role=UserRole.INDIE,
                is_active=True,
                is_verified=True,
            )
            db.add(indie_user)
            db.commit()

            indie_master = IndieMaster(
                user_id=indie_user.id,
                bio=fake.text(),
                experience_years=random.randint(1, 15),
                domain=fake.domain_word(),
            )
            db.add(indie_master)
            db.commit()
            indie_masters.append(indie_master)

        # Создаем услуги
        services = []
        service_names = [
            "Стрижка",
            "Окрашивание",
            "Укладка",
            "Маникюр",
            "Педикюр",
            "Массаж",
            "SPA-процедуры",
            "Макияж",
            "Эпиляция",
            "Уход за лицом",
        ]

        for salon in salons:
            for _ in range(random.randint(3, 7)):
                service = Service(
                    name=random.choice(service_names),
                    description=fake.text(),
                    duration=random.choice([30, 60, 90, 120, 150, 180]),
                    price=random.randint(1000, 5000),
                    salon_id=salon.id,
                )
                db.add(service)
                db.commit()
                services.append(service)

        for indie_master in indie_masters:
            for _ in range(random.randint(2, 5)):
                service = Service(
                    name=random.choice(service_names),
                    description=fake.text(),
                    duration=random.choice([30, 60, 90, 120, 150, 180]),
                    price=random.randint(1000, 5000),
                    indie_master_id=indie_master.id,
                )
                db.add(service)
                db.commit()
                services.append(service)

        # Создаем клиентов
        clients = []
        for _ in range(10):
            client = User(
                email=fake.email(),
                phone=fake.phone_number(),
                hashed_password=get_password_hash("password123"),
                role=UserRole.CLIENT,
                is_active=True,
                is_verified=True,
            )
            db.add(client)
            db.commit()
            clients.append(client)

        # Создаем записи
        for _ in range(20):
            service = random.choice(services)
            client = random.choice(clients)

            # Генерируем случайное время записи в будущем
            start_time = datetime.now() + timedelta(days=random.randint(1, 30))
            end_time = start_time + timedelta(minutes=service.duration)

            booking = Booking(
                client_id=client.id,
                service_id=service.id,
                master_id=random.choice(masters).id if service.salon_id else None,
                indie_master_id=service.indie_master_id,
                salon_id=service.salon_id,
                start_time=start_time,
                end_time=end_time,
                status=random.choice(list(BookingStatus)),
                notes=fake.text() if random.random() > 0.7 else None,
            )
            db.add(booking)
            db.commit()

        print("Тестовые данные успешно созданы!")

    except Exception as e:
        print(f"Ошибка при создании тестовых данных: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    create_test_data()

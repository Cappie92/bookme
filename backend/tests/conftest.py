import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from database import Base, get_db
from main import app
from models import User, UserRole

# Создаем тестовую базу данных в памяти
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    # Создаем таблицы перед каждым тестом
    Base.metadata.create_all(bind=engine)

    # Создаем сессию
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Удаляем таблицы после каждого теста
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(db):
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234567",
        full_name="Test User",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_admin(db):
    admin = User(
        email="admin@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234568",
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@pytest.fixture(scope="function")
def test_master(db):
    master = User(
        email="master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234569",
        full_name="Master User",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


@pytest.fixture(scope="function")
def test_salon(db):
    salon = User(
        email="salon@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001234570",
        full_name="Salon User",
        role=UserRole.SALON,
        is_active=True,
        is_verified=True,
    )
    db.add(salon)
    db.commit()
    db.refresh(salon)
    return salon


@pytest.fixture(scope="function")
def test_user_token(client, test_user):
    response = client.post(
        "/auth/login", json={"phone": test_user.phone, "password": "testpassword"}
    )
    return response.json()


@pytest.fixture(scope="function")
def test_admin_token(client, test_admin):
    response = client.post(
        "/auth/login", json={"phone": test_admin.phone, "password": "testpassword"}
    )
    return response.json()


@pytest.fixture(scope="function")
def test_master_token(client, test_master):
    response = client.post(
        "/auth/login", json={"phone": test_master.phone, "password": "testpassword"}
    )
    return response.json()


@pytest.fixture(scope="function")
def test_salon_token(client, test_salon):
    response = client.post(
        "/auth/login", json={"phone": test_salon.phone, "password": "testpassword"}
    )
    return response.json()

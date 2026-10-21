import atexit
import shutil
import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Disposable DBs must be selected before importing the application. The process
# env is otherwise empty locally and Settings would default to backend/bookme.db.
_TEST_DB_DIR = tempfile.mkdtemp(prefix="dedato-pytest-")
atexit.register(shutil.rmtree, _TEST_DB_DIR, ignore_errors=True)
_existing_database_url = (os.environ.get("DATABASE_URL") or "").strip().lower()
if (
    _existing_database_url.startswith(("postgres://", "postgresql://", "mysql://"))
    or "dedato.ru" in _existing_database_url
):
    raise RuntimeError(
        "backend pytest refuses DATABASE_URL that is not a disposable SQLite test database"
    )
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEST_DB_DIR) / 'import.db'}"

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from database import Base, get_db
from main import app
from models import User, UserRole

# Per-process tempfile SQLite: isolates parallel pytest invocations from each
# other without StaticPool, which livelocks threaded tests (Robokassa InvId).
SQLALCHEMY_DATABASE_URL = f"sqlite:///{Path(_TEST_DB_DIR) / 'test.db'}"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def fixture_password_hash():
    """Reuse real bcrypt hashes only for immutable users made by test fixtures.

    This helper is never installed on ``auth``. Registration, reset and password
    change routes therefore keep calling the production hashing function.
    """
    hashes = {}

    def for_password(password: str) -> str:
        if password not in hashes:
            hashes[password] = get_password_hash(password)
        return hashes[password]

    return for_password


@pytest.fixture(scope="function", autouse=True)
def _forbid_real_expo_http(monkeypatch):
    original = httpx.AsyncClient.request

    async def guarded(self, method, url, *args, **kwargs):
        if "exp.host" in str(url):
            raise AssertionError(f"Unexpected Expo HTTP during tests: {method} {url}")
        return await original(self, method, url, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "request", guarded)


@pytest.fixture(scope="session", autouse=True)
def canonical_authenticated_user_default():
    """Legacy test builders represent login-ready users unless explicitly unverified.

    Runtime model defaults stay unchanged. Registration/legacy lifecycle tests pass
    ``is_phone_verified=False`` explicitly and therefore bypass this test-only default.
    """
    def set_verified_default(target, args, kwargs):
        if "is_phone_verified" not in kwargs:
            target.is_phone_verified = True

    event.listen(User, "init", set_verified_default)
    try:
        yield
    finally:
        event.remove(User, "init", set_verified_default)


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
def test_user(db, fixture_password_hash):
    user = User(
        email="test@example.com",
        hashed_password=fixture_password_hash("testpassword"),
        phone="+79001234567",
        full_name="Test User",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_admin(db, fixture_password_hash):
    admin = User(
        email="admin@example.com",
        hashed_password=fixture_password_hash("testpassword"),
        phone="+79001234568",
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@pytest.fixture(scope="function")
def test_master(db, fixture_password_hash):
    master = User(
        email="master@example.com",
        hashed_password=fixture_password_hash("testpassword"),
        phone="+79001234569",
        full_name="Master User",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


@pytest.fixture(scope="function")
def test_salon(db, fixture_password_hash):
    salon = User(
        email="salon@example.com",
        hashed_password=fixture_password_hash("testpassword"),
        phone="+79001234570",
        full_name="Salon User",
        role=UserRole.SALON,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(salon)
    db.commit()
    db.refresh(salon)
    return salon


def _login(client, phone: str, password: str = "testpassword"):
    response = client.post(
        "/api/auth/login",
        json={"phone": phone, "password": password},
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert "access_token" in data
    return data


@pytest.fixture(scope="function")
def test_user_token(client, test_user):
    return _login(client, test_user.phone)


@pytest.fixture(scope="function")
def test_admin_token(client, test_admin):
    return _login(client, test_admin.phone)


@pytest.fixture(scope="function")
def test_master_token(client, test_master):
    return _login(client, test_master.phone)


@pytest.fixture(scope="function")
def test_salon_token(client, test_salon):
    return _login(client, test_salon.phone)


@pytest.fixture(scope="function")
def master_auth_headers(client, test_master):
    """Единые headers с Bearer-токеном мастера для subscription-тестов."""
    data = _login(client, test_master.phone)
    return {"Authorization": f"Bearer {data['access_token']}"}


@pytest.fixture(scope="function")
def admin_auth_headers(client, test_admin):
    """Единые headers с Bearer-токеном админа (admin-only API)."""
    data = _login(client, test_admin.phone)
    return {"Authorization": f"Bearer {data['access_token']}"}

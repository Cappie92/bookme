"""Тест: PATCH /api/master/clients/{client_key} сохраняет note и alias."""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from database import SessionLocal
from models import User, Master, MasterClientMetadata, Booking, Service, BookingStatus, Salon, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType
from auth import get_password_hash


@pytest.fixture
def master_user(db):
    u = User(
        email="master_patch@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79990000006",
        full_name="Master Patch",
        role="master",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def client_user(db):
    u = User(
        email="client_patch@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79991234567",
        full_name="Client Patch",
        role="client",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def master_record(db, master_user):
    m = Master(user_id=master_user.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def master_with_clients_plan(db, master_user):
    """План с доступом к разделу «Клиенты» (service_functions: 7)."""
    plan = SubscriptionPlan(
        name="ClientsPatchTest",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500.0,
        price_3months=450.0,
        price_6months=400.0,
        price_12months=350.0,
        features={"service_functions": [1, 2, 3, 7], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    sub = Subscription(
        user_id=master_user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=30),
        price=500.0,
        daily_rate=500.0 / 30,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()
    return master_user


@pytest.fixture
def salon(db):
    s = Salon(name="Test Salon", domain="test-salon")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def service(db, salon):
    svc = Service(name="Стрижка", price=1000, duration=60, salon_id=salon.id)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return svc


@pytest.fixture
def completed_booking(db, master_record, client_user, service, salon):
    from datetime import datetime, timedelta
    dt = datetime.utcnow() - timedelta(days=1)
    b = Booking(
        master_id=master_record.id,
        client_id=client_user.id,
        service_id=service.id,
        salon_id=salon.id,
        start_time=dt,
        end_time=dt + timedelta(minutes=60),
        status=BookingStatus.COMPLETED,
        payment_amount=1000,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@pytest.fixture
def client_user_id(client_user):
    return client_user.id


@pytest.fixture
def master_token(client, master_user, client_user_id):
    r = client.post("/api/auth/login", json={"phone": master_user.phone, "password": "test123"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_patch_clients_saves_note_and_alias(client: TestClient, db, master_user, master_with_clients_plan, client_user_id, master_record, completed_booking, master_token):
    """PATCH сохраняет note, GET detail возвращает сохранённые значения."""
    client_key = f"user:{client_user_id}"
    headers = {"Authorization": f"Bearer {master_token}"}

    # PATCH
    r = client.patch(
        f"/api/master/clients/{client_key}",
        json={"alias_name": "Вася", "note": "Хороший клиент"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("alias_name") == "Вася"
    assert data.get("note") == "Хороший клиент"
    assert data.get("has_note") is True

    # GET detail
    r2 = client.get(f"/api/master/clients/{client_key}", headers=headers)
    assert r2.status_code == 200
    d = r2.json()
    assert d.get("master_client_name") == "Вася"
    assert d.get("note") == "Хороший клиент"
    assert d.get("has_note") is True

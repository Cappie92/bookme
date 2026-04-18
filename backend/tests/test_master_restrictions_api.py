"""Smoke tests для API ограничений мастера."""
from datetime import datetime, timedelta

import pytest
from auth import get_password_hash
from models import Master, User, UserRole, IndieMaster, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType


def _auth_headers(client, phone: str = "+79001112233", password: str = "test123"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def master_only_user(db):
    """Мастер БЕЗ IndieMaster — для master-only тестов."""
    user = User(
        email="masteronly@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79990000007",
        full_name="Master Only",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(user_id=user.id, bio="", experience_years=0, can_work_independently=True)
    db.add(master)
    db.commit()
    db.refresh(master)
    return user


@pytest.fixture
def indie_master_user(db):
    """Мастер с IndieMaster (user_id = master.user_id) для тестов restrictions (legacy)."""
    user = User(
        email="restrictions@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79001112233",
        full_name="Restrictions Test",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(user_id=user.id, bio="", experience_years=0, can_work_independently=True)
    db.add(master)
    db.commit()
    db.refresh(master)
    indie = IndieMaster(user_id=user.id, master_id=master.id, domain="restrictions-test")
    db.add(indie)
    db.commit()
    # План с доступом к клиентам (service_function 7)
    plan = SubscriptionPlan(
        name="ClientsPlan",
        display_name="Clients",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500,
        price_3months=450,
        price_6months=400,
        price_12months=350,
        features={"service_functions": [1, 2, 3, 4, 5, 6, 7], "max_page_modules": 3},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=365),
        price=0,
        daily_rate=0,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.commit()
    return user


def test_get_restrictions_empty(client, db, indie_master_user):
    """GET /api/master/restrictions возвращает пустые списки."""
    headers = _auth_headers(client, indie_master_user.phone, "test123")
    r = client.get("/api/master/restrictions", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "blacklist" in data
    assert "advance_payment_only" in data
    assert data["blacklist"] == []
    assert data["advance_payment_only"] == []
    assert data["total_restrictions"] == 0


def test_get_restriction_rules_empty(client, db, indie_master_user):
    """GET /api/master/restriction-rules возвращает список."""
    headers = _auth_headers(client, indie_master_user.phone, "test123")
    r = client.get("/api/master/restriction-rules", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_and_get_restriction(client, db, indie_master_user):
    """POST /api/master/restrictions создаёт ограничение, GET возвращает его."""
    headers = _auth_headers(client, indie_master_user.phone, "test123")
    r = client.post(
        "/api/master/restrictions",
        headers=headers,
        json={"client_phone": "+79001234567", "restriction_type": "blacklist", "reason": "Test"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["restriction_type"] == "blacklist"
    assert data["client_phone"] == "+79001234567"

    r2 = client.get("/api/master/restrictions", headers=headers)
    assert r2.status_code == 200
    j = r2.json()
    assert len(j["blacklist"]) == 1
    assert j["blacklist"][0]["client_phone"] == "+79001234567"
    assert j["total_restrictions"] == 1


def test_restriction_visible_in_master_clients(client, db, indie_master_user):
    """Restriction, созданный через /api/master/restrictions, виден в карточке клиента."""
    from models import Master, IndieMaster, Service, Booking, BookingStatus

    master = db.query(Master).filter(Master.user_id == indie_master_user.id).first()
    indie = db.query(IndieMaster).filter(IndieMaster.user_id == indie_master_user.id).first()
    assert master and indie

    # Клиент с completed booking
    client_user = User(
        email="client@restrict.test",
        hashed_password=get_password_hash("x"),
        phone="+79009998877",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(client_user)
    db.commit()
    db.refresh(client_user)
    client_user_id = client_user.id

    service = Service(
        name="Test",
        duration=30,
        price=100,
        indie_master_id=indie.id,
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    from datetime import datetime, timedelta
    start = datetime.utcnow() - timedelta(days=1)
    booking = Booking(
        client_id=client_user.id,
        service_id=service.id,
        indie_master_id=indie.id,
        start_time=start,
        end_time=start + timedelta(minutes=30),
        status=BookingStatus.COMPLETED,
        payment_amount=100,
    )
    db.add(booking)
    db.commit()

    headers = _auth_headers(client, indie_master_user.phone, "test123")
    r = client.post(
        "/api/master/restrictions",
        headers=headers,
        json={"client_phone": "+79009998877", "restriction_type": "advance_payment_only", "reason": "From rules"},
    )
    assert r.status_code == 200

    r2 = client.get("/api/master/clients/phone:%2B79009998877", headers=headers)
    assert r2.status_code == 200
    detail = r2.json()
    assert "restrictions" in detail
    assert len(detail["restrictions"]) == 1
    assert detail["restrictions"][0]["type"] == "advance_payment_only"

    # Обратная проверка: restriction из master_clients виден в /api/master/restrictions
    r3 = client.post(
        f"/api/master/clients/user:{client_user_id}/restrictions",
        headers=headers,
        json={"restriction_type": "blacklist", "reason": "From card"},
    )
    assert r3.status_code == 200

    r4 = client.get("/api/master/restrictions", headers=headers)
    assert r4.status_code == 200
    j4 = r4.json()
    assert j4["total_restrictions"] == 2  # advance_payment_only + blacklist
    blacklist_phones = [r["client_phone"] for r in j4["blacklist"]]
    assert "+79009998877" in blacklist_phones


# --- Master-only тесты (мастер без IndieMaster) ---


def test_get_restrictions_empty_master_only(client, db, master_only_user):
    """Master-only: GET /api/master/restrictions → 200, empty list (без IndieMaster)."""
    headers = _auth_headers(client, master_only_user.phone, "test123")
    r = client.get("/api/master/restrictions", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "blacklist" in data
    assert "advance_payment_only" in data
    assert data["blacklist"] == []
    assert data["advance_payment_only"] == []
    assert data["total_restrictions"] == 0


def test_create_and_get_restriction_master_only(client, db, master_only_user):
    """Master-only: POST restriction → 200, GET возвращает запись."""
    headers = _auth_headers(client, master_only_user.phone, "test123")
    r = client.post(
        "/api/master/restrictions",
        headers=headers,
        json={"client_phone": "+79001234567", "restriction_type": "blacklist", "reason": "Test"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["restriction_type"] == "blacklist"
    assert data["client_phone"] == "+79001234567"

    r2 = client.get("/api/master/restrictions", headers=headers)
    assert r2.status_code == 200
    j = r2.json()
    assert len(j["blacklist"]) == 1
    assert j["blacklist"][0]["client_phone"] == "+79001234567"
    assert j["total_restrictions"] == 1

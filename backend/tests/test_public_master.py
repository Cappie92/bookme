# -*- coding: utf-8 -*-
"""Тесты публичного API записи к мастеру: GET /api/public/masters/{slug}."""
import pytest
from datetime import date, timedelta

from auth import get_password_hash
from models import (
    LoyaltyDiscount,
    LoyaltyDiscountType,
    Master,
    MasterService,
    PersonalDiscount,
    Service,
    User,
    UserRole,
)


@pytest.fixture
def public_master_user(db):
    u = User(
        email="public_master@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001112244",
        full_name="Public Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def public_master(db, public_master_user):
    m = Master(
        user_id=public_master_user.id,
        bio="Test bio",
        experience_years=5,
        domain="test-slug",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
        site_description="Запись к мастеру",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def public_master_service(db, public_master):
    s = MasterService(
        master_id=public_master.id,
        category_id=None,
        name="Стрижка",
        duration=60,
        price=1500.0,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_get_public_master_profile_ok(client, public_master, public_master_user):
    """GET /api/public/masters/{slug} → 200, профиль с timezone."""
    r = client.get("/api/public/masters/test-slug")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["master_id"] == public_master.id
    assert data["master_name"] == "Public Master"
    assert data["master_slug"] == "test-slug"
    assert data["master_timezone"] == "Europe/Moscow"
    assert "services" in data
    assert isinstance(data["services"], list)


def test_get_public_master_profile_not_found(client):
    """GET /api/public/masters/invalid-slug → 404."""
    r = client.get("/api/public/masters/invalid-slug")
    assert r.status_code == 404, r.text
    assert "не найден" in (r.json().get("detail") or "").lower()


def test_get_public_availability_ok(client, public_master, public_master_service):
    """GET /api/public/masters/{slug}/availability → 200, slots."""
    from_d = date.today()
    to_d = from_d + timedelta(days=7)
    r = client.get(
        f"/api/public/masters/test-slug/availability",
        params={
            "from_date": from_d.strftime("%Y-%m-%d"),
            "to_date": to_d.strftime("%Y-%m-%d"),
            "service_id": public_master_service.id,
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "slots" in data
    assert "master_timezone" in data
    assert data["master_timezone"] == "Europe/Moscow"


def test_get_public_client_note_without_auth(client, public_master):
    """GET /api/public/masters/{slug}/client-note без токена → 200, note_text: null."""
    r = client.get("/api/public/masters/test-slug/client-note")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "note_text" in data
    assert data["note_text"] is None


def test_get_public_eligibility_anonymous_includes_loyalty_hint(client, public_master):
    """GET /api/public/masters/{slug}/eligibility без токена — loyalty_hint отсутствует или null."""
    r = client.get("/api/public/masters/test-slug/eligibility")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "loyalty_hint" in data
    assert data["loyalty_hint"] is None


def test_booking_price_preview_guest_no_discount(client, public_master, public_master_service):
    """GET booking-price-preview без правил скидки — полная цена."""
    r = client.get(
        "/api/public/masters/test-slug/booking-price-preview",
        params={
            "service_id": public_master_service.id,
            "start_time": "2030-06-15T10:00:00+03:00",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["base_price"] == 1500.0
    assert data["discount_amount"] == 0.0
    assert data["discounted_price"] == 1500.0
    assert data["final_price"] == 1500.0
    assert data["amount_to_pay"] == 1500.0
    assert data["loyalty_points_to_use"] == 0
    assert data["points_payment_available"] is False
    assert data["use_loyalty_points"] is False
    assert data["discount_percent"] is None


def test_booking_price_preview_guest_service_discount_alt_service_id(client, db, public_master, public_master_service):
    """Гость: service_discount с service_id «дубликата» услуги — preview как у клиента с токеном."""
    master_service_id = public_master_service.id
    s_canon = Service(
        name="Стрижка",
        duration=60,
        price=1500.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_canon)
    db.flush()
    s_rule = Service(
        name="Стрижка",
        duration=60,
        price=1500.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_rule)
    db.commit()

    rule = LoyaltyDiscount(
        master_id=public_master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="SD guest",
        discount_percent=9.0,
        is_active=True,
        priority=1,
        conditions={
            "condition_type": "service_discount",
            "parameters": {"service_id": s_rule.id},
        },
    )
    db.add(rule)
    db.commit()

    params = {
        "service_id": master_service_id,
        "start_time": "2030-06-15T10:00:00+03:00",
    }
    r_guest = client.get("/api/public/masters/test-slug/booking-price-preview", params=params)
    assert r_guest.status_code == 200, r_guest.text
    g = r_guest.json()
    assert g["base_price"] == 1500.0
    assert g["discount_percent"] == 9.0
    assert abs(g["discount_amount"] - 135.0) < 0.01
    assert abs(g["discounted_price"] - 1365.0) < 0.01
    assert abs(g["final_price"] - 1365.0) < 0.01
    assert abs(g["amount_to_pay"] - 1365.0) < 0.01
    assert g["loyalty_points_to_use"] == 0


def test_booking_price_preview_guest_personal_discount_not_applied(client, db, public_master, public_master_service):
    """Гость: только персональная скидка по телефону — preview без скидки."""
    master_service_id = public_master_service.id
    db.add(
        PersonalDiscount(
            master_id=public_master.id,
            client_phone="+79991112233",
            discount_percent=25.0,
            is_active=True,
        )
    )
    db.commit()
    r = client.get(
        "/api/public/masters/test-slug/booking-price-preview",
        params={
            "service_id": master_service_id,
            "start_time": "2030-06-15T10:00:00+03:00",
        },
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["final_price"] == 1500.0
    assert d["discounted_price"] == 1500.0
    assert d["amount_to_pay"] == 1500.0
    assert d["discount_amount"] == 0.0


def test_booking_price_preview_logged_in_service_discount_still_applies(
    client, db, public_master, public_master_service, test_user
):
    """Клиент с токеном: service_discount (alt service id) по-прежнему применяется."""
    master_service_id = public_master_service.id
    s_canon = Service(
        name="Стрижка",
        duration=60,
        price=1500.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_canon)
    db.flush()
    s_rule = Service(
        name="Стрижка",
        duration=60,
        price=1500.0,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(s_rule)
    db.commit()
    db.add(
        LoyaltyDiscount(
            master_id=public_master.id,
            discount_type=LoyaltyDiscountType.QUICK,
            name="SD logged",
            discount_percent=9.0,
            is_active=True,
            priority=1,
            conditions={
                "condition_type": "service_discount",
                "parameters": {"service_id": s_rule.id},
            },
        )
    )
    db.commit()

    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    r = client.get(
        "/api/public/masters/test-slug/booking-price-preview",
        params={
            "service_id": master_service_id,
            "start_time": "2030-06-15T10:00:00+03:00",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert abs(d["final_price"] - 1365.0) < 0.01
    assert abs(d["discounted_price"] - 1365.0) < 0.01
    assert abs(d["amount_to_pay"] - 1365.0) < 0.01


def test_booking_price_preview_guest_use_loyalty_points_param_ignored(client, public_master, public_master_service):
    """Гость: use_loyalty_points=true не ломает preview."""
    r = client.get(
        "/api/public/masters/test-slug/booking-price-preview",
        params={
            "service_id": public_master_service.id,
            "start_time": "2030-06-15T10:00:00+03:00",
            "use_loyalty_points": True,
        },
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["loyalty_points_to_use"] == 0
    assert d["use_loyalty_points"] is False
    assert d["points_payment_available"] is False


def test_booking_price_preview_client_loyalty_cap_percent(
    client, db, public_master, public_master_service, test_user
):
    """Клиент с баллами: списание от цены после скидки, лимит max_payment_percent."""
    from datetime import datetime

    from models import LoyaltySettings, LoyaltyTransaction

    master_service_id = public_master_service.id
    db.add(
        LoyaltySettings(
            master_id=public_master.id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=50,
            points_lifetime_days=None,
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=public_master.id,
            client_id=test_user.id,
            booking_id=None,
            transaction_type="earned",
            points=800,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
        )
    )
    db.commit()

    login = client.post(
        "/api/auth/login",
        json={"phone": test_user.phone, "password": "testpassword"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    r = client.get(
        "/api/public/masters/test-slug/booking-price-preview",
        params={
            "service_id": master_service_id,
            "start_time": "2030-06-15T10:00:00+03:00",
            "use_loyalty_points": True,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["discounted_price"] == 1500.0
    assert d["loyalty_points_to_use"] == 750
    assert d["amount_to_pay"] == 750.0
    assert d["final_price"] == 750.0
    assert d["use_loyalty_points"] is True
    assert d["points_payment_available"] is True

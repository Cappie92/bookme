# -*- coding: utf-8 -*-
"""Тесты валидации timezone при создании/обновлении профиля мастера.
Timezone обязателен на уровне домена; fallback UTC — только safety-net.
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth import get_password_hash
from models import Master, User, UserRole
from routers.master import _validate_master_timezone_update, _reject_clear_city_timezone


def _master_token(client: TestClient, phone: str, password: str = "testpassword") -> str:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# --- Unit-тесты валидации (без HTTP) ---


def test_validate_timezone_empty_raises():
    """timezone='' или '   ' → HTTP 400."""
    m = Master(id=1, user_id=1, bio="", experience_years=1, timezone="Europe/Moscow")
    with pytest.raises(HTTPException) as exc:
        _validate_master_timezone_update("", m)
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc2:
        _validate_master_timezone_update("   ", m)
    assert exc2.value.status_code == 400


def test_validate_timezone_none_master_has_none_raises():
    """timezone не передан, у мастера нет timezone → 400."""
    m = Master(id=1, user_id=1, bio="", experience_years=1, timezone=None)
    with pytest.raises(HTTPException) as exc:
        _validate_master_timezone_update(None, m)
    assert exc.value.status_code == 400


def test_validate_timezone_valid_ok():
    """timezone непустой → не бросает."""
    m = Master(id=1, user_id=1, bio="", experience_years=1, timezone=None)
    _validate_master_timezone_update("Europe/Moscow", m)


def test_validate_timezone_none_master_has_value_ok():
    """timezone не передан, у мастера есть timezone → не бросает."""
    m = Master(id=1, user_id=1, bio="", experience_years=1, timezone="Europe/Moscow")
    _validate_master_timezone_update(None, m)


def test_reject_clear_city_unit():
    """_reject_clear_city_timezone: master имеет city, передаём city='' → 400."""
    m = Master(id=1, user_id=1, bio="", city="Москва", timezone="Europe/Moscow", experience_years=1)
    with pytest.raises(HTTPException) as exc:
        _reject_clear_city_timezone(m, "", None)
    assert exc.value.status_code == 400
    assert "не могут быть очищены" in (exc.value.detail or "").lower()


def test_reject_clear_timezone_unit():
    """_reject_clear_city_timezone: master имеет timezone, передаём timezone='' → 400."""
    m = Master(id=1, user_id=1, bio="", city="Москва", timezone="Europe/Moscow", experience_years=1)
    with pytest.raises(HTTPException) as exc:
        _reject_clear_city_timezone(m, None, "")
    assert exc.value.status_code == 400
    assert "не могут быть очищены" in (exc.value.detail or "").lower()


# --- Интеграционные тесты (HTTP) ---


@pytest.fixture
def master_user(db):
    u = User(
        email="tz_master@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79001112233",
        full_name="TZ Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def master_no_timezone(db, master_user):
    m = Master(user_id=master_user.id, bio="", experience_years=1, timezone=None)
    db.add(m)
    db.commit()
    db.refresh(m)
    m.timezone = None
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def master_with_timezone(db, master_user):
    m = Master(user_id=master_user.id, bio="", experience_years=1, timezone="Europe/Moscow")
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def master_with_city_timezone(db, master_user):
    m = Master(
        user_id=master_user.id,
        bio="",
        experience_years=1,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def test_update_profile_timezone_empty_rejected(client, db, master_user, master_no_timezone):
    """PUT /api/master/profile с timezone='' → 400 (multipart, чтобы гарантировать передачу)."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/profile",
        data={"timezone": ""},
        headers=headers,
    )
    assert r.status_code == 400, r.text
    assert "часовой пояс" in (r.json().get("detail") or "").lower()


def test_update_profile_timezone_missing_and_master_has_none_rejected(
    client, db, master_user, master_no_timezone
):
    """PUT без timezone, у мастера нет timezone → 400."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/api/master/profile", data={}, headers=headers)
    assert r.status_code == 400, r.text


def test_update_profile_timezone_valid_ok(client, db, master_user, master_no_timezone):
    """PUT с timezone='Europe/Moscow' → 200, мастер получает timezone."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/profile",
        data={"timezone": "Europe/Moscow"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert m is not None
    assert (m.timezone or "").strip() == "Europe/Moscow"


def test_update_profile_city_and_timezone_sets_confirmed(client, db, master_user, master_no_timezone):
    """PUT с city и timezone → 200, timezone_confirmed=True."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/profile",
        data={"city": "Москва", "timezone": "Europe/Moscow"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert m is not None
    assert (m.city or "").strip() == "Москва"
    assert (m.timezone or "").strip() == "Europe/Moscow"
    assert m.timezone_confirmed is True


def test_update_profile_timezone_omitted_when_set_ok(client, db, master_user, master_with_timezone):
    """PUT без timezone, у мастера уже есть timezone → 200 (не трогаем)."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/api/master/profile", data={}, headers=headers)
    assert r.status_code == 200, r.text

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert m is not None
    assert (m.timezone or "").strip() == "Europe/Moscow"


def test_loyalty_create_rejects_when_onboarding_incomplete(client, db, master_user, master_with_timezone):
    """POST /api/loyalty/quick-discounts при timezone_confirmed=False → 400."""
    master_with_timezone.timezone_confirmed = False
    master_with_timezone.city = None
    db.commit()

    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "discount_type": "quick",
        "name": "Test",
        "discount_percent": 10,
        "conditions": {"condition_type": "first_visit", "parameters": {}},
    }

    r = client.post("/api/loyalty/quick-discounts", json=payload, headers=headers)
    assert r.status_code == 400, r.text
    assert "город" in (r.json().get("detail") or "").lower() or "часовой пояс" in (r.json().get("detail") or "").lower()


def test_clear_city_rejected(client, db, master_user, master_with_city_timezone):
    """PUT с city='' или только пробелами при уже установленном city → 400."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}
    # Пробелы: клиент передаёт поле (пустая строка часто опускается), backend трактует как очистку.
    data = {
        "full_name": master_user.full_name or "TZ Master",
        "phone": master_user.phone,
        "city": "   ",
        "timezone": "Europe/Moscow",
    }

    r = client.put(
        "/api/master/profile",
        data=data,
        headers=headers,
    )
    assert r.status_code == 400, r.text
    detail = (r.json().get("detail") or "").lower()
    assert "не могут быть очищены" in detail or "город" in detail

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert (m.city or "").strip() == "Москва"


def test_clear_timezone_rejected(client, db, master_user, master_with_city_timezone):
    """PUT с timezone='' или только пробелами при уже установленном timezone → 400."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}
    data = {
        "full_name": master_user.full_name or "TZ Master",
        "phone": master_user.phone,
        "city": "Москва",
        "timezone": "   ",
    }

    r = client.put(
        "/api/master/profile",
        data=data,
        headers=headers,
    )
    assert r.status_code == 400, r.text
    detail = (r.json().get("detail") or "").lower()
    assert "не могут быть очищены" in detail or "часовой пояс" in detail

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert (m.timezone or "").strip() == "Europe/Moscow"


def test_update_without_city_timezone_keeps_values(client, db, master_user, master_with_city_timezone):
    """PUT без city/timezone (обновление других полей) не сбрасывает city и timezone."""
    token = _master_token(client, master_user.phone)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/profile",
        data={"full_name": "Updated Name"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    m = db.query(Master).filter(Master.user_id == master_user.id).first()
    assert m is not None
    assert (m.city or "").strip() == "Москва"
    assert (m.timezone or "").strip() == "Europe/Moscow"

# -*- coding: utf-8 -*-
"""Тесты публичного API записи к мастеру: GET /api/public/masters/{slug}."""
import pytest
from datetime import date, timedelta

from auth import get_password_hash
from models import Master, MasterService, User, UserRole


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

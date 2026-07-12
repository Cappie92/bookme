# -*- coding: utf-8 -*-
"""Тесты case-insensitive поиска мастера по domain/slug."""
import pytest

from auth import get_password_hash
from models import Master, User, UserRole


def _create_master(db, *, domain: str, phone_suffix: str):
    user = User(
        email=f"case_{phone_suffix}@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone=f"+7900{phone_suffix}",
        full_name=f"Master {phone_suffix}",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        domain=domain,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


@pytest.fixture
def mixed_case_master(db):
    return _create_master(db, domain="m-5haJFCMx", phone_suffix="111001")


def test_public_master_exact_case_slug_ok(client, mixed_case_master):
    r = client.get("/api/public/masters/m-5haJFCMx")
    assert r.status_code == 200, r.text
    assert r.json()["master_slug"] == "m-5haJFCMx"


def test_public_master_lowercase_slug_ok(client, mixed_case_master):
    r = client.get("/api/public/masters/m-5hajfcmx")
    assert r.status_code == 200, r.text
    assert r.json()["master_id"] == mixed_case_master.id
    assert r.json()["master_slug"] == "m-5haJFCMx"


def test_public_master_uppercase_slug_ok(client, mixed_case_master):
    r = client.get("/api/public/masters/M-5HAJFCMX")
    assert r.status_code == 200, r.text
    assert r.json()["master_id"] == mixed_case_master.id


def test_public_master_mixed_case_slug_ok(client, mixed_case_master):
    r = client.get("/api/public/masters/M-5hAjFcMx")
    assert r.status_code == 200, r.text
    assert r.json()["master_id"] == mixed_case_master.id


def test_public_master_unknown_slug_404(client, mixed_case_master):
    r = client.get("/api/public/masters/does-not-exist-xyz")
    assert r.status_code == 404


def test_public_master_ambiguous_case_collision_404(client, db):
    _create_master(db, domain="m-CollisionA", phone_suffix="111002")
    _create_master(db, domain="m-collisiona", phone_suffix="111003")

    r = client.get("/api/public/masters/m-collisiona")
    assert r.status_code == 404


def test_domain_info_case_insensitive_master(client, mixed_case_master):
    r = client.get("/api/domain/m-5hajfcmx/info")
    assert r.status_code == 200, r.text
    assert r.json()["owner_type"] == "master"
    assert r.json()["owner_id"] == mixed_case_master.id

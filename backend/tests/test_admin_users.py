"""Список пользователей админки: контракт JSON (в т.ч. is_phone_verified)."""

import pytest
from sqlalchemy import event

from auth import get_password_hash
from models import User, UserRole
from routers.admin import _admin_json_bool


def test_admin_json_bool_normalizes_db_driver_values():
    """ORM/драйверы могут отдать 0/1 — в JSON это число; нормализуем в настоящий bool для API."""
    assert _admin_json_bool(True) is True
    assert _admin_json_bool(False) is False
    assert _admin_json_bool(None) is False
    assert _admin_json_bool(1) is True
    assert _admin_json_bool(0) is False


def _auth_admin(client, phone="+79001234568", password="testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_admin_users_list_returns_phone_verified(client, db, test_admin):
    """GET /api/admin/users — 200 и у каждого элемента есть is_phone_verified (bool)."""
    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get("/api/admin/users?limit=20", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert len(body["items"]) >= 1
    for u in body["items"]:
        assert "is_phone_verified" in u
        assert isinstance(u["is_phone_verified"], bool)


def test_admin_users_list_reflects_phone_flag(client, db, test_admin):
    """Клиент с is_phone_verified=True отдаётся с флагом true в списке."""
    u = User(
        email="phone_ok_admin_list@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79005550123",
        full_name="Phone OK",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get(f"/api/admin/users?user_id={u.id}&limit=5", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    row = items[0]
    assert row["id"] == u.id
    assert row["is_phone_verified"] is True
    assert row["is_verified"] is False
    assert type(row["is_phone_verified"]) is bool
    assert type(row["is_verified"]) is bool
    assert row["is_phone_verified"] is not 1  # не число из JSON


def test_admin_user_detail_returns_phone_and_email_flags(client, db, test_admin):
    """GET /api/admin/users/{id} — те же флаги, что в списке."""
    u = User(
        email="phone_ok_admin_detail@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79005550444",
        full_name="Phone Detail",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.get(f"/api/admin/users/{u.id}", headers=headers)
    assert r.status_code == 200, r.text
    row = r.json()
    assert row["id"] == u.id
    assert row["is_phone_verified"] is True
    assert row["is_verified"] is False
    assert isinstance(row["is_phone_verified"], bool)
    assert isinstance(row["is_verified"], bool)


def test_admin_delete_client_user_no_salon_orm(client, db, test_admin):
    """DELETE /api/admin/users/{id} для клиента не дергает Salon; пользователь удаляется (200)."""
    u = User(
        email="to_delete_admin_client@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79005550999",
        full_name="Delete Me Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id
    # Иначе тот же Session держит ORM User цели — autoflush при DELETE может lazy-load salon_profile.
    db.expunge(u)

    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.delete(f"/api/admin/users/{uid}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json().get("message")

    assert db.query(User).filter(User.id == uid).first() is None


def test_admin_delete_client_emits_no_from_salons_sql(client, db, test_admin):
    """Регрессия: при DELETE клиента не выполняется SQL к таблице salons (урезанная схема SQLite)."""
    hits = []
    eng = db.get_bind()

    def before_cursor(conn, cursor, statement, parameters, context, executemany):
        if not statement:
            return
        low = " ".join(statement.lower().split())
        if "from salons" in low or "join salons" in low:
            hits.append(statement)

    event.listen(eng, "before_cursor_execute", before_cursor)
    try:
        u = User(
            email="no_salon_sql_delete@test.com",
            hashed_password=get_password_hash("x"),
            phone="+79005550888",
            full_name="No Salon SQL",
            role=UserRole.CLIENT,
            is_active=True,
            is_verified=False,
            is_phone_verified=False,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id
        db.expunge(u)

        headers = _auth_admin(client, test_admin.phone, "testpassword")
        r = client.delete(f"/api/admin/users/{uid}", headers=headers)
        assert r.status_code == 200, r.text
    finally:
        event.remove(eng, "before_cursor_execute", before_cursor)

    assert hits == [], "unexpected SQL touching salons: " + "\n---\n".join(hits)


def test_admin_put_user_updates_email(client, db, test_admin):
    """PUT /api/admin/users/{id} — админ меняет email клиента; 200 и поле в БД обновлено."""
    u = User(
        email="put_client_before@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79006660101",
        full_name="Put Email Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id

    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.put(
        f"/api/admin/users/{uid}",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "full_name": "Put Email Client",
            "email": "put_client_after@test.com",
            "phone": "+79006660101",
            "role": "client",
            "is_active": True,
            "is_verified": False,
            "is_always_free": False,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "put_client_after@test.com"
    row = db.query(User).filter(User.id == uid).first()
    assert row is not None
    assert row.email == "put_client_after@test.com"


def test_admin_put_client_emits_no_from_salons_sql(client, db, test_admin):
    """Регрессия: при PUT клиента не выполняется SQL к таблице salons."""
    hits = []
    eng = db.get_bind()

    def before_cursor(conn, cursor, statement, parameters, context, executemany):
        if not statement:
            return
        low = " ".join(statement.lower().split())
        if "from salons" in low or "join salons" in low:
            hits.append(statement)

    event.listen(eng, "before_cursor_execute", before_cursor)
    try:
        u = User(
            email="no_salon_sql_put@test.com",
            hashed_password=get_password_hash("x"),
            phone="+79006660202",
            full_name="No Salon PUT",
            role=UserRole.CLIENT,
            is_active=True,
            is_verified=False,
            is_phone_verified=False,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id
        db.expunge(u)

        headers = _auth_admin(client, test_admin.phone, "testpassword")
        r = client.put(
            f"/api/admin/users/{uid}",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "full_name": "No Salon PUT X",
                "email": "no_salon_sql_put@test.com",
                "phone": "+79006660202",
                "role": "client",
                "is_active": True,
                "is_verified": True,
                "is_always_free": False,
            },
        )
        assert r.status_code == 200, r.text
    finally:
        event.remove(eng, "before_cursor_execute", before_cursor)

    assert hits == [], "unexpected SQL touching salons: " + "\n---\n".join(hits)


def test_admin_put_duplicate_email_returns_409(client, db, test_admin):
    """Дубликат email — 409, не 500."""
    a = User(
        email="dup_owner@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79006660301",
        full_name="Owner",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=False,
    )
    b = User(
        email="dup_other@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79006660302",
        full_name="Other",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=False,
        is_phone_verified=False,
    )
    db.add(a)
    db.add(b)
    db.commit()
    db.refresh(a)
    db.refresh(b)
    aid = a.id

    headers = _auth_admin(client, test_admin.phone, "testpassword")
    r = client.put(
        f"/api/admin/users/{aid}",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "full_name": "Owner",
            "email": "dup_other@test.com",
            "phone": "+79006660301",
            "role": "client",
            "is_active": True,
            "is_verified": False,
            "is_always_free": False,
        },
    )
    assert r.status_code == 409, r.text
    assert "email" in (r.json().get("detail") or "").lower()

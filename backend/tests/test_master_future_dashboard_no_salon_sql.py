"""
Регрессия: эндпоинты будущих записей и дашборда мастера не выполняют SQL к salons
(join ORM Salon тянет salons.address — колонки нет в урезанной SQLite-схеме).
"""

from sqlalchemy import event

from auth import get_password_hash
from models import Master, User, UserRole


def _auth_headers(client, phone: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_master_future_bookings_no_salon_join_sql(client, db):
    """GET /api/master/bookings/future — 200 и нет FROM/JOIN salons в SQL запроса."""
    user = User(
        email="future_no_salon@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003334455",
        full_name="Future No Salon",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

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
        headers = _auth_headers(client, user.phone, "test123")
        r = client.get("/api/master/bookings/future?page=1&limit=20", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "bookings" in body
        assert isinstance(body["bookings"], list)
    finally:
        event.remove(eng, "before_cursor_execute", before_cursor)

    assert hits == [], "unexpected SQL touching salons:\n" + "\n---\n".join(hits)


def test_master_dashboard_stats_no_salon_join_sql(client, db):
    """GET /api/master/dashboard/stats — 200 и нет FROM/JOIN salons в SQL запроса."""
    user = User(
        email="dash_no_salon@test.com",
        hashed_password=get_password_hash("test123"),
        phone="+79003334466",
        full_name="Dash No Salon",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Master(user_id=user.id, bio="", experience_years=0))
    db.commit()

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
        headers = _auth_headers(client, user.phone, "test123")
        r = client.get("/api/master/dashboard/stats?period=week&offset=0", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "weeks_data" in data or "next_bookings_list" in data
    finally:
        event.remove(eng, "before_cursor_execute", before_cursor)

    assert hits == [], "unexpected SQL touching salons:\n" + "\n---\n".join(hits)

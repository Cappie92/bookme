"""Retire the unused GET/POST pair; keep real web/mobile schedule contracts."""
from datetime import datetime, timedelta, time
from hashlib import sha256

import pytest

from auth import create_user_access_token
from database import Base
from main import app
from models import Master, MasterSchedule, User, UserRole
from settings import get_settings


def snapshot(db):
    with db.get_bind().connect() as connection:
        rows = [(table.name, sorted(map(repr, connection.execute(table.select()).all())))
                for table in Base.metadata.sorted_tables]
    return sha256(repr(rows).encode()).hexdigest()


@pytest.fixture
def schedule_world(db, monkeypatch):
    users, masters = [], []
    for n in range(2):
        user = User(phone=f"+7900888550{n}", role=UserRole.MASTER, is_active=True,
                    is_verified=True, is_phone_verified=True, is_always_free=True)
        db.add(user)
        db.flush()
        master = Master(user_id=user.id, domain=f"demo-master-{user.id}" if n == 0 else "schedule-other",
                        timezone="Europe/Moscow", timezone_confirmed=True)
        db.add(master)
        db.flush()
        users.append(user)
        masters.append(master)
    db.commit()
    # No pin for normal sessions. Only the explicit demo variant enables it.
    monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", None)
    return users, masters


def actor_headers(client, world, actor, monkeypatch):
    user = world[0][0]
    if actor == "anonymous":
        return {}
    if actor == "demo":
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", user.id)
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_PHONE", user.phone)
        response = client.post("/api/auth/demo-master-access")
        assert response.status_code == 200
        token = response.json()["access_token"]
    else:
        claims = {"web_session_origin": "ios_app"} if actor == "ios_app" else None
        token = create_user_access_token(user, claims)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("actor", ["anonymous", "ordinary", "ios_app", "demo"])
@pytest.mark.parametrize("populated", [False, True])
@pytest.mark.parametrize("method", ["GET", "POST"])
def test_retired_pair_returns_404_without_db_changes(
    client, db, schedule_world, monkeypatch, actor, populated, method
):
    if populated:
        db.add(MasterSchedule(master_id=schedule_world[1][0].id,
                              date=datetime.utcnow().date() + timedelta(days=10),
                              start_time=time(12), end_time=time(13), is_available=True))
        db.commit()
    headers = actor_headers(client, schedule_world, actor, monkeypatch)
    before = snapshot(db)
    for path in ["/api/master/schedule", "/api/master/schedule/"]:
        payload = {"day_of_week": 3, "start_time": "2030-01-10T12:00:00",
                   "end_time": "2030-01-10T13:00:00", "is_available": True}
        response = client.request(method, path, headers=headers,
                                  **({"json": payload} if method == "POST" else {}))
        assert response.status_code == 404
        assert response.json() == {"detail": "Not Found"}
        assert snapshot(db) == before


def test_retired_pair_not_mounted_or_advertised():
    assert "/api/master/schedule" not in {getattr(r, "path", "") for r in app.routes}
    assert "/api/master/schedule" not in app.openapi()["paths"]


@pytest.mark.parametrize("actor", ["ordinary", "ios_app", "demo"])
@pytest.mark.parametrize("populated", [False, True])
def test_modern_schedule_reads_preserve_shape_ownership_and_rows(
    client, db, schedule_world, monkeypatch, actor, populated
):
    day = datetime.utcnow().date() + timedelta(days=10)
    if populated:
        db.add(MasterSchedule(master_id=schedule_world[1][0].id, date=day,
                              start_time=time(12), end_time=time(12, 30), is_available=True))
    db.add(MasterSchedule(master_id=schedule_world[1][1].id, date=day,
                          start_time=time(15), end_time=time(15, 30), is_available=True))
    db.commit()
    headers = actor_headers(client, schedule_world, actor, monkeypatch)
    before = snapshot(db)
    for path in ["/api/master/schedule/weekly?week_offset=0&weeks_ahead=4",
                 f"/api/master/schedule/monthly?year={day.year}&month={day.month}"]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        slots = response.json()["slots"]
        assert isinstance(slots, list)
        working = [s for s in slots if s["is_working"]]
        assert [(s["schedule_date"], s["hour"], s["minute"]) for s in working] == (
            [(day.isoformat(), 12, 0)] if populated else [])
        assert snapshot(db) == before
    rules = client.get("/api/master/schedule/rules", headers=headers)
    assert rules.status_code == 200 and rules.json()["has_settings"] is False
    assert snapshot(db) == before


@pytest.mark.parametrize("path", [
    "/api/master/schedule/weekly",
    "/api/master/schedule/monthly?year=2030&month=1",
    "/api/master/schedule/rules",
])
def test_modern_schedule_still_requires_auth(client, path):
    assert client.get(path).status_code == 401

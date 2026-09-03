"""PUT /api/master/schedule/day — локальная правка слотов на одну дату."""
from datetime import date, datetime, timedelta, time

import pytest
from sqlalchemy import inspect

from auth import get_password_hash
from models import (
    Booking,
    BookingStatus,
    Master,
    MasterSchedule,
    MasterScheduleSettings,
    Service,
    User,
    UserRole,
)


@pytest.fixture
def master_user_and_profile(db):
    mu = User(
        email="schedday@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79008887766",
        full_name="Sched Day Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(mu)
    db.commit()
    db.refresh(mu)
    m = Master(user_id=mu.id, bio="", experience_years=0)
    db.add(m)
    db.commit()
    db.refresh(m)
    return mu, m


@pytest.fixture
def client_user(db):
    cu = User(
        email="scheddayc@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79008887767",
        full_name="Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)
    return cu


def test_schedule_day_cannot_omit_slots_with_active_booking(client, db, master_user_and_profile, client_user):
    mu, m = master_user_and_profile
    svc = Service(name="Cut", price=1500, duration=60, salon_id=None)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    d = date.today() + timedelta(days=21)
    bk = Booking(
        client_id=client_user.id,
        service_id=svc.id,
        master_id=m.id,
        start_time=datetime.combine(d, time(10, 0)),
        end_time=datetime.combine(d, time(11, 0)),
        status=BookingStatus.CONFIRMED.value,
    )
    db.add(bk)
    db.commit()

    login = client.post("/api/auth/login", json={"phone": mu.phone, "password": "testpassword"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/schedule/day",
        headers=headers,
        json={"schedule_date": d.isoformat(), "open_slots": []},
    )
    assert r.status_code == 400
    assert "Нельзя закрыть слот" in (r.json().get("detail") or "")

    r_ok = client.put(
        "/api/master/schedule/day",
        headers=headers,
        json={
            "schedule_date": d.isoformat(),
            "open_slots": [{"hour": 10, "minute": 0}, {"hour": 10, "minute": 30}],
        },
    )
    assert r_ok.status_code == 200, r_ok.text
    data = r_ok.json()
    assert data.get("open_slots_count") == 2


def test_schedule_day_rejects_non_half_hour(client, db, master_user_and_profile):
    mu, _m = master_user_and_profile
    d = date.today() + timedelta(days=22)
    login = client.post("/api/auth/login", json={"phone": mu.phone, "password": "testpassword"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/api/master/schedule/day",
        headers=headers,
        json={"schedule_date": d.isoformat(), "open_slots": [{"hour": 9, "minute": 15}]},
    )
    assert r.status_code == 400


def test_schedule_day_post_same_as_put(client, db, master_user_and_profile):
    """POST /schedule/day — тот же контракт, что PUT (для клиентов с ограничением PUT)."""
    mu, _m = master_user_and_profile
    d = date.today() + timedelta(days=31)
    login = client.post("/api/auth/login", json={"phone": mu.phone, "password": "testpassword"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    r = client.post(
        "/api/master/schedule/day",
        headers=headers,
        json={"schedule_date": d.isoformat(), "open_slots": [{"hour": 11, "minute": 30}]},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("open_slots_count") == 1


def test_recurring_rule_create_read_replace_and_day_override_is_independent(
    client, db, master_user_and_profile
):
    """The existing recurring contract is create/read/replace; day edits stay local."""
    mu, master = master_user_and_profile
    master_id = inspect(master).identity[0]
    login = client.post("/api/auth/login", json={"phone": mu.phone, "password": "testpassword"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    start = date.today() + timedelta(days=40)
    end = start + timedelta(days=6)
    weekday_key = str(start.weekday() + 1)

    first_rule = {
        "type": "weekdays",
        "effective_start_date": start.isoformat(),
        "valid_until": end.isoformat(),
        "weekdays": {weekday_key: {"start": "09:00", "end": "10:00"}},
    }
    created = client.post("/api/master/schedule/rules", headers=headers, json=first_rule)
    assert created.status_code == 200, created.text
    assert created.json()["fixed_schedule"]["weekdays"][weekday_key] == {
        "start": "09:00",
        "end": "10:00",
    }

    read = client.get("/api/master/schedule/rules", headers=headers)
    assert read.status_code == 200, read.text
    assert read.json()["has_settings"] is True
    assert read.json()["fixed_schedule"]["type"] == "weekdays"

    replacement = {
        **first_rule,
        "weekdays": {weekday_key: {"start": "11:00", "end": "12:00"}},
    }
    replaced = client.post("/api/master/schedule/rules", headers=headers, json=replacement)
    assert replaced.status_code == 200, replaced.text
    settings_rows = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master_id,
        MasterScheduleSettings.salon_id.is_(None),
    ).all()
    assert len(settings_rows) == 1
    assert settings_rows[0].fixed_schedule["weekdays"][weekday_key] == {
        "start": "11:00",
        "end": "12:00",
    }
    replaced_slots = db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master_id,
        MasterSchedule.date == start,
    ).order_by(MasterSchedule.start_time).all()
    assert [slot.start_time for slot in replaced_slots] == [time(11, 0), time(11, 30)]

    day_override = client.post(
        "/api/master/schedule/day",
        headers=headers,
        json={"schedule_date": start.isoformat(), "open_slots": [{"hour": 14, "minute": 0}]},
    )
    assert day_override.status_code == 200, day_override.text
    persisted_settings = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master_id,
        MasterScheduleSettings.salon_id.is_(None),
    ).one()
    assert persisted_settings.fixed_schedule["weekdays"][weekday_key] == {
        "start": "11:00",
        "end": "12:00",
    }

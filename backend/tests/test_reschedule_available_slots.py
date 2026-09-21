from datetime import date, datetime, time, timedelta

from sqlalchemy import inspect

from auth import get_password_hash
from models import Booking, Master, MasterSchedule, Service, User, UserRole
from services.scheduling import parse_yyyy_mm_dd


TARGET_DAY = date(2026, 9, 26)


def _add_half_hour_schedule(db, master_id, day, start_hour=9, end_hour=18):
    current = datetime.combine(day, time(start_hour, 0))
    end = datetime.combine(day, time(end_hour, 0))
    while current < end:
        nxt = current + timedelta(minutes=30)
        db.add(
            MasterSchedule(
                master_id=master_id,
                salon_id=None,
                date=day,
                start_time=current.time(),
                end_time=nxt.time(),
                is_available=True,
            )
        )
        current = nxt
    db.commit()


def _world(db):
    client = User(
        email="reschedule-client@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990000018",
        full_name="Reschedule Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    master_user = User(
        email="reschedule-master@example.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990000008",
        full_name="Reschedule Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add_all([client, master_user])
    db.commit()
    db.refresh(client)
    db.refresh(master_user)
    master = Master(
        user_id=master_user.id,
        bio="",
        experience_years=1,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    service = Service(name="Haircut", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.refresh(service)
    _add_half_hour_schedule(db, master.id, TARGET_DAY)
    return client, master, master_user, service


def _login(client_api, phone):
    response = client_api.post(
        "/api/auth/login",
        json={"phone": phone, "password": "testpassword"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _slot_times(payload):
    return {slot["formatted_time"] for slot in payload["available_slots"]}


def test_parse_yyyy_mm_dd_rejects_iso_datetime():
    parsed = parse_yyyy_mm_dd("2026-09-26")
    assert parsed == datetime(2026, 9, 26)
    try:
        parse_yyyy_mm_dd("2026-09-26T12:00:00")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_client_available_slots_date_only_success(client, db):
    user, master, _master_user, service = _world(db)
    start = datetime.combine(TARGET_DAY, time(12, 0))
    booking = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.commit()
    booking_id = inspect(booking).identity[0]
    headers = _login(client, user.phone)

    response = client.get(
        f"/api/client/bookings/{booking_id}/available-slots",
        params={"date": "2026-09-26"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    times = _slot_times(response.json())
    assert "09:00" in times
    assert "12:00" not in times


def test_client_available_slots_iso_datetime_is_400_not_500(client, db):
    user, master, _master_user, service = _world(db)
    start = datetime.combine(TARGET_DAY, time(12, 0))
    booking = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status="created",
    )
    db.add(booking)
    db.commit()
    booking_id = inspect(booking).identity[0]
    headers = _login(client, user.phone)

    response = client.get(
        f"/api/client/bookings/{booking_id}/available-slots",
        params={"date": "2026-09-26T12:00:00"},
        headers=headers,
    )
    assert response.status_code == 400, response.text
    assert response.status_code != 500
    assert "YYYY-MM-DD" in response.json()["detail"]


def test_current_booking_is_excluded_but_other_overlap_still_blocks(client, db):
    user, master, _master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(12, 0))
    other_start = datetime.combine(TARGET_DAY, time(15, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    other = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=other_start,
        end_time=other_start + timedelta(hours=1),
        status="confirmed",
    )
    db.add_all([current, other])
    db.commit()
    booking_id = inspect(current).identity[0]
    headers = _login(client, user.phone)

    response = client.get(
        f"/api/client/bookings/{booking_id}/available-slots",
        params={"date": "2026-09-26"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    times = _slot_times(response.json())
    # Self-overlap 11:30-12:30 becomes free once current booking is excluded.
    assert "11:30" in times
    assert "12:00" not in times
    assert "14:30" not in times
    assert "15:00" not in times
    assert "09:00" in times


def test_master_available_slots_uses_same_exclusion(client, db):
    user, master, master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(12, 0))
    other_start = datetime.combine(TARGET_DAY, time(15, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    other = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=other_start,
        end_time=other_start + timedelta(hours=1),
        status="confirmed",
    )
    db.add_all([current, other])
    db.commit()
    booking_id = inspect(current).identity[0]
    headers = _login(client, master_user.phone)

    ok = client.get(
        f"/api/master/bookings/{booking_id}/available-slots",
        params={"date": "2026-09-26"},
        headers=headers,
    )
    assert ok.status_code == 200, ok.text
    times = _slot_times(ok.json())
    assert "11:30" in times
    assert "12:00" not in times
    assert "15:00" not in times

    bad = client.get(
        f"/api/master/bookings/{booking_id}/available-slots",
        params={"date": "2026-09-26T12:00:00"},
        headers=headers,
    )
    assert bad.status_code == 400, bad.text
    assert bad.status_code != 500


def _put_client_time(client_api, headers, booking_id, start, end=None):
    payload = {"start_time": start.isoformat()}
    if end is not None:
        payload["end_time"] = end.isoformat()
    return client_api.put(
        f"/api/client/bookings/{booking_id}",
        json=payload,
        headers=headers,
    )


def _put_master_time(client_api, headers, booking_id, start, end):
    return client_api.put(
        f"/api/master/bookings/{booking_id}/time",
        json={"start_time": start.isoformat(), "end_time": end.isoformat()},
        headers=headers,
    )


def test_client_reschedule_overlap_is_rejected(client, db):
    user, master, _master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(12, 0))
    other_start = datetime.combine(TARGET_DAY, time(15, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    other = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=other_start,
        end_time=other_start + timedelta(hours=1),
        status="confirmed",
    )
    db.add_all([current, other])
    db.commit()
    booking_id = inspect(current).identity[0]
    headers = _login(client, user.phone)

    overlapping = datetime.combine(TARGET_DAY, time(14, 30))
    response = _put_client_time(client, headers, booking_id, overlapping)
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Выбранное время уже занято"
    assert db.get(Booking, booking_id).start_time == current_start


def test_client_reschedule_excludes_current_booking(client, db):
    user, master, _master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(12, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    db.add(current)
    db.commit()
    booking_id = inspect(current).identity[0]
    headers = _login(client, user.phone)

    response = _put_client_time(client, headers, booking_id, current_start)
    assert response.status_code == 200, response.text
    assert db.get(Booking, booking_id).start_time == current_start


def test_client_reschedule_adjacent_slot_is_allowed(client, db):
    user, master, _master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(12, 0))
    other_start = datetime.combine(TARGET_DAY, time(15, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    other = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=other_start,
        end_time=other_start + timedelta(hours=1),
        status="confirmed",
    )
    db.add_all([current, other])
    db.commit()
    booking_id = inspect(current).identity[0]
    headers = _login(client, user.phone)

    adjacent = datetime.combine(TARGET_DAY, time(13, 0))
    response = _put_client_time(client, headers, booking_id, adjacent)
    assert response.status_code == 200, response.text
    moved = db.get(Booking, booking_id)
    assert moved.start_time == adjacent
    assert moved.end_time == adjacent + timedelta(hours=1)


def test_client_and_master_reschedule_share_overlap_semantics(client, db):
    user, master, master_user, service = _world(db)
    current_start = datetime.combine(TARGET_DAY, time(9, 0))
    other_start = datetime.combine(TARGET_DAY, time(12, 0))
    current = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=current_start,
        end_time=current_start + timedelta(hours=1),
        status="created",
    )
    other = Booking(
        client_id=user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=other_start,
        end_time=other_start + timedelta(hours=1),
        status="confirmed",
    )
    db.add_all([current, other])
    db.commit()
    booking_id = inspect(current).identity[0]
    client_phone = user.phone
    master_phone = master_user.phone
    client_headers = _login(client, client_phone)
    master_headers = _login(client, master_phone)

    overlapping = datetime.combine(TARGET_DAY, time(11, 30))
    overlapping_end = overlapping + timedelta(hours=1)
    client_rejected = _put_client_time(client, client_headers, booking_id, overlapping)
    master_rejected = _put_master_time(
        client, master_headers, booking_id, overlapping, overlapping_end
    )
    assert client_rejected.status_code == 400, client_rejected.text
    assert master_rejected.status_code == 400, master_rejected.text
    assert client_rejected.json()["detail"] == master_rejected.json()["detail"] == (
        "Выбранное время уже занято"
    )

    adjacent = datetime.combine(TARGET_DAY, time(10, 0))
    adjacent_end = adjacent + timedelta(hours=1)
    client_ok = _put_client_time(client, client_headers, booking_id, adjacent)
    assert client_ok.status_code == 200, client_ok.text
    booked = db.get(Booking, booking_id)
    booked.start_time = current_start
    booked.end_time = current_start + timedelta(hours=1)
    db.commit()
    master_ok = _put_master_time(
        client, master_headers, booking_id, adjacent, adjacent_end
    )
    assert master_ok.status_code == 200, master_ok.text
    assert db.get(Booking, booking_id).start_time == adjacent

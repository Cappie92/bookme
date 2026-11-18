"""Phase B2.2: end-to-end time source compatibility.

An explicit instant (``Z`` or a numeric offset) is persisted as the master's
wall time plus canonical UTC in every mode. A naive value keeps its legacy
meaning: unresolved with the flag off, the B2 wall contract with it on.
"""

from __future__ import annotations

import itertools
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from auth import get_password_hash
from models import (
    Booking,
    BookingEditRequest,
    ClientRestriction,
    EditRequestStatus,
    Master,
    MasterPaymentSettings,
    MasterSchedule,
    MasterService,
    Notification,
    SalonMasterServiceSettings,
    Service,
    TemporaryBooking,
    User,
    UserRole,
)
from services.booking_admission import (
    ADMISSION_MODE_ENV,
    BOOKING_TIME_INVALID_CODE,
    EDIT_REQUEST_TIME_UNRESOLVED_CODE,
)
from services.booking_time_shadow import (
    is_consistent,
    legacy_request_times,
    slot_instant_fields,
    stored_instants,
)
from services.calendar_readiness import readiness_report, write_provenance
from services.calendar_time import (
    AmbiguousWallTimeError,
    NonexistentWallTimeError,
    canonical_instant,
    resolve_wall_datetime,
)

CANONICAL = ("start_utc_us", "end_utc_us", "time_zone")
ZONES = ["Europe/Moscow", "UTC", "America/New_York", "Asia/Kolkata"]
_SEQ = itertools.count(1)


def _us(value: datetime) -> int:
    return canonical_instant(value).epoch_microseconds


def _canonical(row) -> tuple:
    return tuple(getattr(row, key) for key in CANONICAL)


def _consistent(row) -> bool:
    return is_consistent(**{key: getattr(row, key) for key in ("start_time", "end_time") + CANONICAL})


def _z(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _alias(value: datetime, hours: float) -> str:
    return value.astimezone(timezone(timedelta(hours=hours))).isoformat()


def _next_dst_wall(zone_name: str, error) -> datetime:
    """The next naive wall time (at :30) that is a DST gap or fold in the zone."""
    day = date.today() + timedelta(days=2)
    for offset in range(800):
        current = day + timedelta(days=offset)
        for hour in range(0, 4):
            wall = datetime(current.year, current.month, current.day, hour, 30)
            try:
                resolve_wall_datetime(wall, zone_name)
            except error:
                return wall
            except (AmbiguousWallTimeError, NonexistentWallTimeError):
                continue
    raise AssertionError(f"no DST transition found for {zone_name}")


@pytest.fixture
def legacy_mode(monkeypatch):
    monkeypatch.delenv(ADMISSION_MODE_ENV, raising=False)


@pytest.fixture
def unified_mode(monkeypatch):
    monkeypatch.setenv(ADMISSION_MODE_ENV, "unified")


def _make_world(db, zone="Europe/Moscow", days=(3, 4, 5, 6), dates=None, full_day=False):
    n = next(_SEQ)
    users = {}
    for role, prefix in (("client", "71"), ("master", "72"), ("other_client", "73"), ("other_master", "74")):
        user = User(
            email=f"b22.{role}.{n}@example.com", hashed_password=get_password_hash("testpassword"),
            phone=f"+7900{prefix}{n:05d}", full_name=f"B22 {role}",
            role=UserRole.MASTER if "master" in role else UserRole.CLIENT,
            is_active=True, is_verified=True, is_phone_verified=True,
        )
        db.add(user)
        users[role] = user
    db.commit()
    master = Master(user_id=users["master"].id, bio="", experience_years=1, domain=f"b22-master-{n}",
                    timezone=zone, timezone_confirmed=True, city="Москва")
    other_master = Master(user_id=users["other_master"].id, bio="", experience_years=1,
                          domain=f"b22-other-{n}", timezone=zone, timezone_confirmed=True, city="Москва")
    db.add_all([master, other_master])
    db.commit()
    today = datetime.now(ZoneInfo(zone)).date()
    dates = list(dates or [today + timedelta(days=d) for d in days])
    first, last = (0, 24 * 60) if full_day else (8 * 60, 22 * 60)
    for day in dates:
        for minute in range(first, last, 30):
            end = minute + 30
            db.add(MasterSchedule(
                master_id=master.id, salon_id=None, date=day,
                start_time=time(minute // 60, minute % 60),
                end_time=time(23, 59) if end == 24 * 60 else time(end // 60, end % 60),
                is_available=True,
            ))
    service = Service(name=f"B22 Cut {n}", price=1000, duration=60, salon_id=None)
    db.add(service)
    db.commit()
    db.add(SalonMasterServiceSettings(master_id=master.id, service_id=service.id, is_active=True,
                                      master_payment_type="rub", master_payment_value=1000))
    master_service = MasterService(master_id=master.id, category_id=None, name=f"B22 Cut {n}",
                                   duration=60, price=1000.0)
    db.add(master_service)
    db.commit()
    return {
        "zone": zone, "tz": ZoneInfo(zone), "dates": dates,
        "master_id": int(master.id), "other_master_id": int(other_master.id),
        "service_id": int(service.id), "master_service_id": int(master_service.id),
        "domain": master.domain,
        **{f"{role}_user_id": int(user.id) for role, user in users.items()},
        **{f"{role}_phone": str(user.phone) for role, user in users.items()},
    }


def _at(world, day_index: int, hour: int, minute: int = 0) -> datetime:
    day = world["dates"][day_index]
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=world["tz"])


def _login(api, phone):
    response = api.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _payload(world, start: str, end: str) -> dict:
    return {
        "service_id": world["service_id"], "master_id": world["master_id"],
        "start_time": start, "end_time": end, "status": "created", "client_name": "B22",
        "service_name": "B22 Cut", "service_duration": 60, "service_price": 1000.0,
    }


def _create(api, world, headers, start: datetime, wire=lambda v: v.isoformat()):
    response = api.post("/api/client/bookings/", headers=headers,
                        json=_payload(world, wire(start), wire(start + timedelta(hours=1))))
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _row(db, booking_id):
    db.expire_all()
    return db.get(Booking, booking_id)


# --- request contract -------------------------------------------------------------


@pytest.mark.parametrize("zone", ZONES)
def test_same_instant_with_any_offset_maps_to_one_master_wall(db, zone):
    world = _make_world(db, zone)
    target = _at(world, 0, 12)
    wall = target.replace(tzinfo=None)
    expected = (_us(target), _us(target + timedelta(hours=1)), zone)
    for start in (target, target.astimezone(timezone.utc), datetime.fromisoformat(_alias(target, -5)),
                  datetime.fromisoformat(_alias(target, 5.5))):
        new_start, new_end, columns = legacy_request_times(
            db, start, start + timedelta(hours=1), master_id=world["master_id"]
        )
        assert (new_start, new_end) == (wall, wall + timedelta(hours=1))
        assert (columns["start_utc_us"], columns["end_utc_us"], columns["time_zone"]) == expected
        assert columns["start_time"] == wall


def test_naive_mixed_invalid_and_zoneless_requests_keep_legacy_meaning(db):
    world = _make_world(db)
    aware = _at(world, 0, 12)
    naive = aware.replace(tzinfo=None)
    hour = timedelta(hours=1)
    assert legacy_request_times(db, naive, naive + hour, master_id=world["master_id"]) == (naive, naive + hour, {})
    assert legacy_request_times(db, aware, naive + hour, master_id=world["master_id"])[2] == {}
    assert legacy_request_times(db, aware, aware, master_id=world["master_id"]) == (aware, aware, {})
    db.get(Master, world["master_id"]).timezone = None
    db.commit()
    assert legacy_request_times(db, aware, aware + hour, master_id=world["master_id"]) == (aware, aware + hour, {})
    assert legacy_request_times(db, aware, aware + hour) == (aware, aware + hour, {})


def test_dst_fold_instants_share_a_wall_but_stay_distinct():
    fold = _next_dst_wall("Europe/Berlin", AmbiguousWallTimeError)
    first = fold.replace(tzinfo=ZoneInfo("Europe/Berlin"), fold=0)
    second = fold.replace(tzinfo=ZoneInfo("Europe/Berlin"), fold=1)
    assert _us(second) - _us(first) == 3_600_000_000
    for start in (first, second):
        end = start.astimezone(timezone.utc) + timedelta(minutes=10)
        assert is_consistent(start_time=fold, end_time=fold + timedelta(minutes=10),
                             start_utc_us=_us(start), end_utc_us=_us(end), time_zone="Europe/Berlin")


def test_slot_instant_fields_cover_offsets_overnight_gap_fold_and_unknown_zone():
    moscow = slot_instant_fields(datetime(2030, 7, 1, 23, 30), datetime(2030, 7, 2, 0, 30), "Europe/Moscow")
    assert moscow == {"start_at": "2030-07-01T23:30:00+03:00", "end_at": "2030-07-02T00:30:00+03:00",
                      "time_zone": "Europe/Moscow"}
    winter = slot_instant_fields(datetime(2031, 1, 15, 9, 0), datetime(2031, 1, 15, 10, 0), "America/New_York")
    summer = slot_instant_fields(datetime(2031, 7, 15, 9, 0), datetime(2031, 7, 15, 10, 0), "America/New_York")
    assert winter["start_at"].endswith("-05:00") and summer["start_at"].endswith("-04:00")
    assert slot_instant_fields(datetime(2031, 7, 15, 9), datetime(2031, 7, 15, 10), "UTC")["start_at"] == \
        "2031-07-15T09:00:00+00:00"
    for error in (NonexistentWallTimeError, AmbiguousWallTimeError):
        wall = _next_dst_wall("Europe/Berlin", error)
        fields = slot_instant_fields(wall, wall + timedelta(hours=1), "Europe/Berlin")
        assert fields == {"start_at": None, "end_at": None, "time_zone": "Europe/Berlin"}
    assert slot_instant_fields(datetime(2031, 7, 15, 9), datetime(2031, 7, 15, 10), None) == \
        {"start_at": None, "end_at": None, "time_zone": None}


def test_stored_instants_round_trip():
    start = datetime(2030, 3, 31, 0, 30, tzinfo=timezone.utc)
    assert stored_instants(_us(start), _us(start + timedelta(hours=1))) == (start, start + timedelta(hours=1))
    assert stored_instants(None, 1) is None


# --- reschedule: client web / mobile ----------------------------------------------


def _client_slot(api, headers, booking_id, day: date):
    response = api.get(f"/api/client/bookings/{booking_id}/available-slots",
                       params={"date": day.isoformat()}, headers=headers)
    assert response.status_code == 200, response.text
    slots = response.json()["available_slots"]
    assert slots
    return slots[2]


def test_off_client_slots_keep_naive_start_and_add_the_instant(client, db, legacy_mode):
    world = _make_world(db)
    headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, headers, _at(world, 0, 12))
    slot = _client_slot(client, headers, booking_id, world["dates"][1])
    wall = datetime.fromisoformat(slot["start_time"])
    assert wall.tzinfo is None
    assert slot["formatted_time"] == slot["start_time"][11:16]
    expected = wall.replace(tzinfo=world["tz"])
    assert slot["start_at"] == expected.isoformat() and slot["time_zone"] == world["zone"]

    moved = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                       json={"start_time": slot["start_at"], "end_time": slot["end_at"]})
    assert moved.status_code == 200, moved.text
    row = _row(db, booking_id)
    assert row.start_time == wall
    assert _canonical(row) == (_us(expected), _us(expected + timedelta(hours=1)), world["zone"])
    assert _consistent(row)

    again = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                       json={"start_time": slot["start_at"], "end_time": slot["end_at"]})
    assert again.status_code == 200, again.text
    assert _canonical(_row(db, booking_id)) == (_us(expected), _us(expected + timedelta(hours=1)), world["zone"])


def test_off_installed_client_naive_echo_stays_explicitly_unresolved(client, db, legacy_mode):
    world = _make_world(db)
    headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, headers, _at(world, 0, 12))
    slot = _client_slot(client, headers, booking_id, world["dates"][1])
    moved = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                       json={"start_time": slot["start_time"], "end_time": slot["end_time"]})
    assert moved.status_code == 200, moved.text
    row = _row(db, booking_id)
    assert row.start_time == datetime.fromisoformat(slot["start_time"])
    assert _canonical(row) == (None, None, None)
    assert write_provenance(db).unresolved_new_writes_still_relevant >= 1


# --- reschedule: master mobile ----------------------------------------------------


@pytest.mark.parametrize("zone", ["Europe/Moscow", "America/New_York"])
def test_off_master_slots_carry_the_offset_installed_builds_echo(client, db, legacy_mode, zone):
    world = _make_world(db, zone)
    booking_id = _create(client, world, _login(client, world["client_phone"]), _at(world, 0, 12))
    master_headers = _login(client, world["master_phone"])
    response = client.get(f"/api/master/bookings/{booking_id}/available-slots",
                          params={"date": world["dates"][1].isoformat()}, headers=master_headers)
    assert response.status_code == 200, response.text
    slot = response.json()["available_slots"][3]
    start = datetime.fromisoformat(slot["start_time"])
    assert start.tzinfo is not None and slot["start_time"] == slot["start_at"]
    assert slot["formatted_time"] == start.strftime("%H:%M")
    assert start.utcoffset() == start.astimezone(world["tz"]).utcoffset()

    moved = client.put(f"/api/master/bookings/{booking_id}/time", headers=master_headers,
                       json={"start_time": slot["start_time"], "end_time": slot["end_time"]})
    assert moved.status_code == 200, moved.text
    row = _row(db, booking_id)
    assert row.start_time == start.replace(tzinfo=None)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), zone)


def test_master_slots_on_a_dst_fold_fall_back_to_naive(client, db, legacy_mode):
    fold = _next_dst_wall("America/New_York", AmbiguousWallTimeError)
    world = _make_world(db, "America/New_York", dates=[fold.date() - timedelta(days=1), fold.date()],
                        full_day=True)
    booking_id = _create(client, world, _login(client, world["client_phone"]), _at(world, 0, 12))
    response = client.get(f"/api/master/bookings/{booking_id}/available-slots",
                          params={"date": fold.date().isoformat()}, headers=_login(client, world["master_phone"]))
    assert response.status_code == 200, response.text
    by_wall = {slot["formatted_time"]: slot for slot in response.json()["available_slots"]}
    ambiguous = by_wall[fold.strftime("%H:%M")]
    assert ambiguous["start_at"] is None and datetime.fromisoformat(ambiguous["start_time"]).tzinfo is None
    assert by_wall["12:00"]["start_at"] is not None


# --- repeat booking ---------------------------------------------------------------


def test_off_repeat_slots_offer_the_instant_and_create_proves_it(client, db, legacy_mode):
    world = _make_world(db)
    headers = _login(client, world["client_phone"])
    day = world["dates"][2]
    response = client.get("/api/bookings/available-slots-repeat", params={
        "owner_type": "master", "owner_id": world["master_id"], "year": day.year, "month": day.month,
        "day": day.day, "service_duration": 60,
    })
    assert response.status_code == 200, response.text
    slots = response.json()
    proven, fallback = slots[1], slots[5]
    assert datetime.fromisoformat(proven["start_time"]).tzinfo is None and proven["time_zone"] == world["zone"]
    created = client.post("/api/client/bookings/", headers=headers,
                          json=_payload(world, proven["start_at"], proven["end_at"]))
    assert created.status_code == 200, created.text
    row = _row(db, created.json()["id"])
    assert row.start_time == datetime.fromisoformat(proven["start_time"])
    assert row.time_zone == world["zone"] and _consistent(row)

    legacy = client.post("/api/client/bookings/", headers=headers,
                         json=_payload(world, fallback["start_time"], fallback["end_time"]))
    assert legacy.status_code == 200, legacy.text
    assert _canonical(_row(db, legacy.json()["id"])) == (None, None, None)


# --- UTC payloads: salon / branch / any-master writers -----------------------------


@pytest.mark.parametrize("zone", ["Europe/Moscow", "UTC", "America/New_York"])
def test_z_payload_occupies_the_master_wall_without_hidden_shift(client, db, legacy_mode, zone):
    world = _make_world(db, zone)
    headers = _login(client, world["client_phone"])
    taken = _at(world, 0, 12)
    _create(client, world, headers, taken)
    clash = client.post("/api/client/bookings/", headers=headers,
                        json=_payload(world, _z(taken), _z(taken + timedelta(hours=1))))
    assert clash.status_code in (400, 409), clash.text

    target = _at(world, 0, 14)
    booking_id = _create(client, world, headers, target, wire=_z)
    row = _row(db, booking_id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), zone)
    notification = db.query(Notification).filter(
        Notification.entity_id == booking_id, Notification.type == "booking_created"
    ).one()
    assert "14:00" in notification.body


def test_off_generic_put_with_only_aware_start_keeps_duration(client, db, legacy_mode):
    world = _make_world(db)
    headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, headers, _at(world, 0, 12))
    target = _at(world, 1, 16)
    moved = client.put(f"/api/bookings/{booking_id}", headers=headers, json={"start_time": _z(target)})
    assert moved.status_code == 200, moved.text
    row = _row(db, booking_id)
    assert (row.start_time, row.end_time) == (
        target.replace(tzinfo=None), target.replace(tzinfo=None) + timedelta(hours=1)
    )
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), world["zone"])


def test_off_public_master_page_and_generic_put_convert_foreign_offsets(client, db, legacy_mode):
    world = _make_world(db)
    headers = _login(client, world["client_phone"])
    start = _at(world, 1, 10)
    created = client.post(f"/api/public/masters/{world['domain']}/bookings", headers=headers, json={
        "service_id": world["master_service_id"], "start_time": _alias(start, -3),
        "end_time": _alias(start + timedelta(hours=1), -3),
    })
    assert created.status_code == 200, created.text
    row = _row(db, created.json()["id"])
    assert row.start_time == start.replace(tzinfo=None) and row.time_zone == world["zone"]

    target = _at(world, 1, 16)
    moved = client.put(f"/api/bookings/{row.id}", headers=headers,
                       json={"start_time": _z(target), "end_time": _z(target + timedelta(hours=1))})
    assert moved.status_code == 200, moved.text
    row = _row(db, row.id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), world["zone"])


def test_off_hold_converts_the_instant_and_its_promotion_inherits_it(client, db, legacy_mode):
    world = _make_world(db)
    db.add(ClientRestriction(master_id=world["master_id"], client_phone=world["client_phone"],
                             restriction_type="advance_payment_only", is_active=True))
    db.add(MasterPaymentSettings(master_id=world["master_id"], accepts_online_payment=True))
    db.commit()
    headers = _login(client, world["client_phone"])
    start = _at(world, 2, 11)
    hold = client.post("/api/client/bookings/temporary", headers=headers, json={
        "master_id": world["master_id"], "service_id": world["service_id"],
        "start_time": _z(start), "end_time": _z(start + timedelta(hours=1)), "payment_amount": 1000,
    })
    assert hold.status_code == 200, hold.text
    db.expire_all()
    row = db.get(TemporaryBooking, hold.json()["id"])
    assert row.start_time == start.replace(tzinfo=None)
    assert _canonical(row) == (_us(start), _us(start + timedelta(hours=1)), world["zone"])
    duplicate = client.post("/api/client/bookings/temporary", headers=headers, json={
        "master_id": world["master_id"], "service_id": world["service_id"],
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
        "payment_amount": 1000,
    })
    assert duplicate.status_code == 400, duplicate.text


# --- edit requests ----------------------------------------------------------------


def _propose(api, headers, booking_id, start: str, end: str):
    return api.post(f"/api/bookings/{booking_id}/edit-requests", headers=headers,
                    json={"booking_id": booking_id, "proposed_start": start, "proposed_end": end})


def _decide(api, headers, request_id, decision):
    return api.put(f"/api/bookings/edit-requests/{request_id}", headers=headers, json={"status": decision})


def _legacy_proposal(db, booking_id, start: datetime) -> int:
    proposal = BookingEditRequest(booking_id=booking_id, proposed_start=start.replace(tzinfo=None),
                                  proposed_end=start.replace(tzinfo=None) + timedelta(hours=1),
                                  status=EditRequestStatus.PENDING)
    db.add(proposal)
    db.commit()
    return proposal.id


def test_off_aware_proposal_round_trip_and_rejection(client, db, legacy_mode):
    world = _make_world(db)
    client_headers = _login(client, world["client_phone"])
    master_headers = _login(client, world["master_phone"])
    booking_id = _create(client, world, client_headers, _at(world, 0, 12))
    before = _canonical(_row(db, booking_id))

    rejected_target = _at(world, 0, 15)
    rejected = _propose(client, client_headers, booking_id, _z(rejected_target),
                        _z(rejected_target + timedelta(hours=1)))
    assert rejected.status_code == 200, rejected.text
    assert _decide(client, master_headers, rejected.json()["id"], "rejected").status_code == 200
    assert _canonical(_row(db, booking_id)) == before

    target = _at(world, 0, 17)
    created = _propose(client, client_headers, booking_id, _z(target), _z(target + timedelta(hours=1)))
    assert created.status_code == 200, created.text
    assert created.json()["proposed_start"] == target.replace(tzinfo=None).isoformat()
    db.expire_all()
    proposal = db.get(BookingEditRequest, created.json()["id"])
    assert (proposal.proposed_start_utc_us, proposal.proposed_time_zone) == (_us(target), world["zone"])
    accepted = _decide(client, master_headers, proposal.id, "accepted")
    assert accepted.status_code == 200, accepted.text
    row = _row(db, booking_id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), world["zone"])


def test_off_legacy_proposal_is_applied_without_inventing_an_instant(client, db, legacy_mode):
    world = _make_world(db)
    booking_id = _create(client, world, _login(client, world["client_phone"]), _at(world, 0, 12))
    target = _at(world, 1, 9)
    request_id = _legacy_proposal(db, booking_id, target)
    assert readiness_report(db).pending_edit_requests_without_instant == 1
    accepted = _decide(client, _login(client, world["master_phone"]), request_id, "accepted")
    assert accepted.status_code == 200, accepted.text
    row = _row(db, booking_id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (None, None, None)
    assert readiness_report(db).pending_edit_requests_without_instant == 0


def test_off_proposal_conflicting_with_a_later_booking_is_refused(client, db, legacy_mode):
    world = _make_world(db)
    client_headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, client_headers, _at(world, 0, 12))
    target = _at(world, 0, 18)
    created = _propose(client, client_headers, booking_id, target.isoformat(),
                       (target + timedelta(hours=1)).isoformat())
    assert created.status_code == 200, created.text
    _create(client, world, _login(client, world["other_client_phone"]), target, wire=_z)
    refused = _decide(client, _login(client, world["master_phone"]), created.json()["id"], "accepted")
    assert refused.status_code == 400, refused.text
    row = _row(db, booking_id)
    assert row.start_time == _at(world, 0, 12).replace(tzinfo=None) and _consistent(row)


def test_off_proposal_keeps_its_instant_when_the_master_zone_changes(client, db, legacy_mode):
    world = _make_world(db)
    client_headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, client_headers, _at(world, 0, 12))
    target = _at(world, 1, 13)
    created = _propose(client, client_headers, booking_id, target.isoformat(),
                       (target + timedelta(hours=1)).isoformat())
    assert created.status_code == 200, created.text
    db.get(Master, world["master_id"]).timezone = "Asia/Yekaterinburg"
    db.commit()
    accepted = _decide(client, _login(client, world["master_phone"]), created.json()["id"], "accepted")
    assert accepted.status_code == 200, accepted.text
    row = _row(db, booking_id)
    assert row.start_time == target.astimezone(ZoneInfo("Asia/Yekaterinburg")).replace(tzinfo=None)
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), "Asia/Yekaterinburg")


def test_unified_legacy_proposal_is_refused_with_an_explicit_code(client, db, unified_mode):
    world = _make_world(db)
    booking_id = _create(client, world, _login(client, world["client_phone"]), _at(world, 0, 12))
    before = _row(db, booking_id)
    snapshot = (before.start_time, _canonical(before), before.version)
    request_id = _legacy_proposal(db, booking_id, _at(world, 1, 9))
    refused = _decide(client, _login(client, world["master_phone"]), request_id, "accepted")
    assert refused.status_code == 409, refused.text
    assert refused.headers.get("X-Error-Code") == EDIT_REQUEST_TIME_UNRESOLVED_CODE
    after = _row(db, booking_id)
    assert (after.start_time, _canonical(after), after.version) == snapshot
    db.expire_all()
    assert db.get(BookingEditRequest, request_id).status == EditRequestStatus.PENDING


def test_unified_proposal_round_trip_bumps_the_version(client, db, unified_mode):
    world = _make_world(db)
    client_headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, client_headers, _at(world, 0, 12))
    version = _row(db, booking_id).version
    target = _at(world, 2, 10)
    created = _propose(client, client_headers, booking_id, _z(target), _z(target + timedelta(hours=1)))
    assert created.status_code == 200, created.text
    accepted = _decide(client, _login(client, world["master_phone"]), created.json()["id"], "accepted")
    assert accepted.status_code == 200, accepted.text
    row = _row(db, booking_id)
    assert row.start_time == target.replace(tzinfo=None)
    assert _canonical(row) == (_us(target), _us(target + timedelta(hours=1)), world["zone"])
    assert row.version == version + 1


# --- unified mode with updated and installed clients --------------------------------


def test_unified_slot_echoes_from_both_actors_are_admitted(client, db, unified_mode):
    world = _make_world(db)
    client_headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, client_headers, _at(world, 0, 12))
    slot = _client_slot(client, client_headers, booking_id, world["dates"][1])
    moved = client.put(f"/api/client/bookings/{booking_id}", headers=client_headers,
                       json={"start_time": slot["start_at"], "end_time": slot["end_at"]})
    assert moved.status_code == 200, moved.text
    assert _consistent(_row(db, booking_id))

    master_headers = _login(client, world["master_phone"])
    master_slot = client.get(f"/api/master/bookings/{booking_id}/available-slots",
                             params={"date": world["dates"][2].isoformat()},
                             headers=master_headers).json()["available_slots"][0]
    moved = client.put(f"/api/master/bookings/{booking_id}/time", headers=master_headers,
                       json={"start_time": master_slot["start_time"], "end_time": master_slot["end_time"]})
    assert moved.status_code == 200, moved.text
    row = _row(db, booking_id)
    assert row.start_time == datetime.fromisoformat(master_slot["start_time"]).replace(tzinfo=None)
    assert _consistent(row)


def test_unified_installed_client_naive_echo_follows_the_b2_wall_contract(client, db, unified_mode):
    fold = _next_dst_wall("America/New_York", AmbiguousWallTimeError)
    world = _make_world(db, "America/New_York", dates=[fold.date(), fold.date() + timedelta(days=1)],
                        full_day=True)
    headers = _login(client, world["client_phone"])
    booking_id = _create(client, world, headers, _at(world, 1, 12))
    naive = _at(world, 1, 15).replace(tzinfo=None)
    moved = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                       json={"start_time": naive.isoformat()})
    assert moved.status_code == 200, moved.text
    assert _row(db, booking_id).time_zone == "America/New_York"

    ambiguous = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                           json={"start_time": fold.isoformat()})
    assert ambiguous.status_code == 400, ambiguous.text
    assert ambiguous.headers.get("X-Error-Code") == BOOKING_TIME_INVALID_CODE
    explicit = fold.replace(tzinfo=world["tz"], fold=1)
    explicit = explicit.astimezone(timezone(explicit.utcoffset()))
    resolved = client.put(f"/api/client/bookings/{booking_id}", headers=headers,
                          json={"start_time": explicit.isoformat()})
    assert resolved.status_code == 200, resolved.text
    row = _row(db, booking_id)
    assert row.start_time == fold and row.start_utc_us == _us(explicit)


# --- security ---------------------------------------------------------------------


def test_slot_and_edit_request_endpoints_keep_object_ownership(client, db, legacy_mode):
    world = _make_world(db)
    booking_id = _create(client, world, _login(client, world["client_phone"]), _at(world, 0, 12))
    day = world["dates"][1].isoformat()
    stranger = _login(client, world["other_client_phone"])
    other_master = _login(client, world["other_master_phone"])
    assert client.get(f"/api/client/bookings/{booking_id}/available-slots", params={"date": day},
                      headers=stranger).status_code == 404
    assert client.get(f"/api/master/bookings/{booking_id}/available-slots", params={"date": day},
                      headers=other_master).status_code == 404
    target = _at(world, 1, 12)
    assert _propose(client, stranger, booking_id, target.isoformat(),
                    (target + timedelta(hours=1)).isoformat()).status_code in (403, 404)
    request_id = _legacy_proposal(db, booking_id, target)
    assert _decide(client, other_master, request_id, "accepted").status_code in (403, 404)
    assert _row(db, booking_id).start_time == _at(world, 0, 12).replace(tzinfo=None)

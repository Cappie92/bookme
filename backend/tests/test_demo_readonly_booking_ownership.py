"""Real HTTP/JWT regressions; only disposable test DB, no providers or seeding."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.orm import sessionmaker

from auth import ALGORITHM, SECRET_KEY, create_access_token, create_user_access_token, create_user_refresh_token
from database import Base, get_db
from main import app
from models import (
    Booking, BookingEditRequest, BookingStatus, Master, MasterSchedule,
    Service, SubscriptionPlan, SubscriptionType, TemporaryBooking, User, UserRole,
)
from services import demo_master_seed
from settings import get_settings


def snapshot(db):
    """Hash all persistent rows; assertion output never dumps user/token data."""
    db.expire_all()
    with db.get_bind().connect() as connection:
        rows = [(table.name, sorted(map(repr, connection.execute(table.select()).all())))
                for table in Base.metadata.sorted_tables]
    return sha256(repr(rows).encode()).hexdigest()


class RedactedHeaders(dict):
    def __repr__(self):
        return "{Authorization: <test bearer redacted>}"


def headers(token):
    return RedactedHeaders(Authorization=f"Bearer {token}")


@pytest.fixture
def world(db, monkeypatch):
    def no_seed(*args, **kwargs):
        pytest.fail("Public demo access must never call seed/reseed")
    monkeypatch.setattr(demo_master_seed, "ensure_demo_master_exists", no_seed)
    monkeypatch.setattr(demo_master_seed, "reseed_demo_master", no_seed)
    users = {}
    for index, (name, role) in enumerate([
        ("a", UserRole.MASTER), ("b", UserRole.MASTER), ("demo", UserRole.MASTER),
        ("ca", UserRole.CLIENT), ("cb", UserRole.CLIENT), ("admin", UserRole.ADMIN),
        ("moderator", UserRole.MODERATOR),
    ]):
        user = User(phone=f"+7900888100{index}", email=f"security-{name}@example.com",
                    full_name=f"Security {name}", role=role, is_active=True,
                    is_verified=True, is_phone_verified=True, is_always_free=role == UserRole.MASTER)
        db.add(user)
        db.flush()
        users[name] = user
    masters, services, bookings, requests, temporary = {}, {}, {}, {}, {}
    start = (datetime.utcnow() + timedelta(days=10)).replace(hour=12, minute=0, second=0, microsecond=0)
    for name in ("a", "b", "demo"):
        master = Master(user_id=users[name].id, domain=f"demo-master-{users[name].id}" if name == "demo" else f"sec-{name}",
                        timezone="Europe/Moscow", timezone_confirmed=True, auto_confirm_bookings=False)
        service = Service(name=f"Service {name}", duration=60, price=100)
        master.services.append(service)
        db.add(master)
        db.flush()
        client = users["cb" if name == "b" else "ca"]
        booking = Booking(master_id=master.id, client_id=client.id, service_id=service.id,
                          start_time=start, end_time=start + timedelta(hours=1),
                          status=BookingStatus.CREATED, notes="unchanged", payment_amount=100)
        db.add(booking)
        db.flush()
        req = BookingEditRequest(booking_id=booking.id, proposed_start=start + timedelta(days=1),
                                 proposed_end=start + timedelta(days=1, hours=1))
        temp = TemporaryBooking(master_id=master.id, client_id=client.id, service_id=service.id,
                                start_time=start + timedelta(days=2), end_time=start + timedelta(days=2, hours=1),
                                payment_amount=100, expires_at=datetime.utcnow() + timedelta(minutes=20))
        db.add_all([req, temp])
        for day in range(4):
            db.add(MasterSchedule(master_id=master.id, date=(start + timedelta(days=day)).date(),
                                  start_time=start.replace(hour=0).time(), end_time=start.replace(hour=23).time()))
        db.flush()
        masters[name], services[name], bookings[name], requests[name], temporary[name] = (
            master.id, service.id, booking.id, req.id, temp.id)
    db.add(SubscriptionPlan(name="AlwaysFree", display_name="Always Free",
                           subscription_type=SubscriptionType.MASTER,
                           price_1month=0, price_3months=0, price_6months=0, price_12months=0,
                           features={"service_functions": list(range(1, 8))}, limits={}))
    db.commit()
    result = dict(users={name: u.id for name, u in users.items()},
                  headers={name: headers(create_user_access_token(u)) for name, u in users.items()},
                  masters=masters, services=services, bookings=bookings, requests=requests,
                  temporary=temporary, start=start)
    monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", users["demo"].id)
    monkeypatch.setattr(get_settings(), "DEMO_MASTER_PHONE", users["demo"].phone)
    return result


def demo_headers(client):
    response = client.post("/api/auth/demo-master-access")
    assert response.status_code == 200
    return headers(response.json()["access_token"])


def test_demo_entry_repeat_token_read_and_no_seed(client, db, world):
    before = snapshot(db)
    for _ in range(4):
        response = client.post("/api/auth/demo-master-access")
        assert response.status_code == 200
        data = response.json()
        assert set(data) == {"access_token", "token_type", "expires_in"}
        payload = jwt.decode(data["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["demo"] is True
        assert payload["sub"] == str(world["users"]["demo"])
        assert payload["role"] == "MASTER" and payload["token_type"] == "demo_access"
        assert 0 < payload["exp"] - payload["iat"] <= 901
        assert "web_session_origin" not in payload
        me = client.get("/api/auth/users/me", headers=headers(data["access_token"]))
        assert me.status_code == 200 and me.json()["is_demo_session"] is True
    assert snapshot(db) == before


@pytest.mark.parametrize("invalid", [
    "unconfigured", "missing-user", "phone-mismatch", "wrong-pin", "admin", "client",
    "inactive", "deleted", "unverified", "phone-unverified", "not-always-free",
    "missing-master", "orphan", "duplicate-master", "domain-collision", "deleted-master",
])
def test_demo_identity_fail_closed(client, db, world, monkeypatch, invalid):
    user = db.get(User, world["users"]["demo"])
    master = db.get(Master, world["masters"]["demo"])
    if invalid == "unconfigured":
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", None)
    elif invalid == "missing-user":
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", 999999)
    elif invalid == "phone-mismatch":
        user.phone = "+79008889990"
    elif invalid == "wrong-pin":
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", world["users"]["a"])
    elif invalid in {"admin", "client"}:
        user.role = UserRole(invalid)
    elif invalid == "inactive":
        user.is_active = False
    elif invalid == "deleted":
        user.deleted_at = datetime.utcnow()
    elif invalid == "unverified":
        user.is_verified = False
    elif invalid == "phone-unverified":
        user.is_phone_verified = False
    elif invalid == "not-always-free":
        user.is_always_free = False
    elif invalid in {"missing-master", "orphan"}:
        master.user_id = None if invalid == "orphan" else world["users"]["a"]
    elif invalid == "duplicate-master":
        db.add(Master(user_id=user.id, domain="duplicate-demo"))
    elif invalid == "domain-collision":
        domain = master.domain
        master.domain = "wrong-demo"
        db.flush()
        db.get(Master, world["masters"]["b"]).domain = domain
    elif invalid == "deleted-master":
        master.is_deleted = True
    db.commit()
    before = snapshot(db)
    response = client.post("/api/auth/demo-master-access")
    assert response.status_code == 503
    assert response.json() == {"detail": "Демо временно недоступно. Попробуйте позже."}
    assert snapshot(db) == before


@pytest.mark.parametrize("available", [True, False])
def test_concurrent_demo_access_no_writes_or_500(client, db, world, monkeypatch, available):
    if not available:
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", None)
    factory = sessionmaker(bind=db.get_bind(), autoflush=False)
    previous = app.dependency_overrides[get_db]
    def isolated_db():
        with factory() as session:
            yield session
    app.dependency_overrides[get_db] = isolated_db
    before = snapshot(db)
    def request(_):
        # The outer client owns the single app lifespan. Each request gets its
        # own DB session; do not restart shared background workers per thread.
        return TestClient(app).post("/api/auth/demo-master-access").status_code
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            assert list(pool.map(request, range(8))) == [200 if available else 503] * 8
    finally:
        app.dependency_overrides[get_db] = previous
    assert snapshot(db) == before


@pytest.mark.parametrize("method,path", [
    ("PUT", "/api/master/profile"), ("POST", "/api/master/categories"),
    ("PUT", "/api/master/categories/1"), ("DELETE", "/api/master/categories/1"),
    ("POST", "/api/master/services"), ("PUT", "/api/master/services/1"),
    ("DELETE", "/api/master/services/1"), ("POST", "/api/master/schedule/day"),
    ("PUT", "/api/master/schedule/day"), ("DELETE", "/api/master/schedule/future"),
    ("PUT", "/api/bookings/{booking}"), ("DELETE", "/api/bookings/{booking}"),
    ("POST", "/api/bookings/"), ("POST", "/api/bookings/{booking}/edit-requests"),
    ("PUT", "/api/bookings/edit-requests/{request}"),
    ("PUT", "/api/master/bookings/{booking}/time"),
    ("POST", "/api/master/accounting/update-booking-status/{booking}"),
    ("POST", "/api/master/accounting/confirm-booking/{booking}"),
    ("POST", "/api/master/accounting/cancel-booking/{booking}"),
    ("POST", "/api/payments/subscription/init"), ("POST", "/api/payments/deposit/init"),
    ("DELETE", "/api/subscriptions/1"), ("PUT", "/api/subscriptions/1/activate"),
    ("POST", "/api/subscriptions/calculate"), ("POST", "/api/subscriptions/apply-upgrade-balance"),
    ("POST", "/api/balance/deposit"), ("PUT", "/api/master/payment-settings"),
    ("POST", "/api/master/promo-code/apply"), ("PUT", "/api/master/loyalty/settings"),
    ("PUT", "/api/master/ios-web/domain"), ("POST", "/api/auth/change-password"),
    ("POST", "/api/auth/request-phone-change"), ("POST", "/api/auth/request-email-change"),
    ("DELETE", "/api/auth/delete-account"), ("POST", "/api/auth/web-handoff"),
    ("POST", "/api/bookings/public"), ("POST", "/api/bookings/create-with-any-master"),
    ("POST", "/api/client/bookings/temporary/{temporary}/confirm-payment"),
    ("PUT", "/api/client/profile"), ("DELETE", "/api/client/account"),
])
def test_demo_mutation_matrix_zero_delta(client, db, world, method, path):
    h = demo_headers(client)
    path = path.format(booking=world["bookings"]["demo"], request=world["requests"]["b"],
                       temporary=world["temporary"]["a"])
    before = snapshot(db)
    response = client.request(method, path, headers=h, json={
        "notes": "forbidden", "master_id": world["masters"]["b"], "status": "accepted",
        "start_time": world["start"].isoformat(), "new_status": "confirmed",
    })
    # A missing endpoint must not give a false-green security test.
    assert response.status_code == 403
    assert response.json()["detail"] == "В демо-режиме изменение данных недоступно"
    assert snapshot(db) == before


@pytest.mark.parametrize("path", [
    "/api/auth/users/me", "/api/master/profile", "/api/master/bookings",
    "/api/master/subscription/features", "/api/balance/", "/api/balance/transactions",
    "/api/balance/subscription-status", "/api/balance/low-balance-warning",
    "/api/subscriptions/my", "/api/master/loyalty/settings", "/api/master/payment-settings",
    "/api/master/dashboard/stats", "/api/master/settings", "/api/master/categories",
    "/api/master/services", "/api/master/loyalty/history", "/api/master/loyalty/stats",
    "/api/master/accounting/expenses", "/api/master/accounting/operations",
    "/api/master/accounting/summary", "/api/master/accounting/pending-confirmations",
    "/api/master/clients", "/api/master/restrictions", "/api/master/restriction-rules",
])
def test_demo_get_no_lazy_persistent_rows(client, db, world, path):
    h = demo_headers(client)
    before = snapshot(db)
    response = client.get(path, headers=h)
    assert response.status_code == 200
    assert snapshot(db) == before
    assert not db.info.get("demo_readonly")


@pytest.mark.parametrize("path", [
    "/api/payments/apple/billing-identity", "/api/master/referral-code",
    "/api/payments/robokassa/stub-complete", "/api/auth/yandex/login",
    "/api/client/bookings/temporary/1/status",
])
def test_demo_side_effectful_get_denied(client, db, world, path):
    h = demo_headers(client)
    before = snapshot(db)
    assert client.get(path, headers=h).status_code == 403
    assert snapshot(db) == before


@pytest.mark.parametrize("kind", ["legacy-access", "legacy-refresh", "new-access", "wrong-sub", "ios-origin", "expired",
                                 "missing-sv", "wrong-role", "future-iat", "extended-ttl"])
def test_demo_cannot_refresh_or_escape_scope(client, db, world, kind):
    user = db.get(User, world["users"]["demo"])
    if kind == "legacy-access":
        token = create_user_access_token(user, {"demo": True})
    elif kind == "legacy-refresh":
        token = create_user_refresh_token(user, {"demo": True})
    else:
        response = client.post("/api/auth/demo-master-access")
        token = response.json()["access_token"]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if kind == "wrong-sub":
            payload["sub"] = str(world["users"]["a"])
        elif kind == "ios-origin":
            payload["web_session_origin"] = "ios_app"
        elif kind == "expired":
            payload["exp"] = int(datetime.utcnow().timestamp()) - 1
        elif kind == "missing-sv":
            payload.pop("sv")
        elif kind == "wrong-role":
            payload["role"] = "ADMIN"
        elif kind == "future-iat":
            payload["iat"] += 3600
            payload["exp"] += 3600
        elif kind == "extended-ttl":
            payload["exp"] += 3600
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    before = snapshot(db)
    assert client.post("/api/auth/refresh", json={"refresh_token": token}).status_code == 401
    if kind != "new-access":
        assert client.get("/api/auth/users/me", headers=headers(token)).status_code == 401
        assert client.post("/api/bookings/public", headers=headers(token), json={}).status_code == 401
    assert snapshot(db) == before


@pytest.mark.parametrize("actor,target", [("a", "b"), ("b", "a"), ("ca", "b"), ("cb", "a"), ("moderator", "a")])
@pytest.mark.parametrize("operation", ["notes", "reschedule", "edit-create", "edit-accept", "edit-reject"])
def test_cross_owner_generic_booking_and_requests(client, db, world, actor, target, operation):
    booking_id = world["bookings"][target]
    request_id = world["requests"][target]
    start = world["start"] + timedelta(days=3)
    before = snapshot(db)
    if operation == "edit-create":
        response = client.post(f"/api/bookings/{booking_id}/edit-requests", headers=world["headers"][actor],
                               json={"booking_id": booking_id, "proposed_start": start.isoformat(),
                                     "proposed_end": (start + timedelta(hours=1)).isoformat()})
    elif operation.startswith("edit-"):
        response = client.put(f"/api/bookings/edit-requests/{request_id}", headers=world["headers"][actor],
                              json={"status": "accepted" if operation == "edit-accept" else "rejected"})
    else:
        changes = {"notes": "attack"} if operation == "notes" else {
            "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat()}
        response = client.put(f"/api/bookings/{booking_id}", headers=world["headers"][actor], json=changes)
    assert response.status_code in {403, 404}
    assert snapshot(db) == before


@pytest.mark.parametrize("actor", ["a", "b", "ca", "cb"])
@pytest.mark.parametrize("field", ["master_id", "service_id", "salon_id", "branch_id", "indie_master_id"])
def test_owned_booking_cannot_transfer_context(client, db, world, actor, field):
    owner = "b" if actor in {"b", "cb"} else "a"
    target = "a" if owner == "b" else "b"
    new_value = world["services"][target] if field == "service_id" else world["masters"][target]
    before = snapshot(db)
    assert client.put(f"/api/bookings/{world['bookings'][owner]}", headers=world["headers"][actor],
                      json={field: new_value}).status_code == 403
    assert snapshot(db) == before


@pytest.mark.parametrize("actor,owner", [("a", "a"), ("b", "b"), ("ca", "a"), ("cb", "b"), ("admin", "a")])
def test_owned_request_accept_and_reschedule_remain_allowed(client, db, world, actor, owner):
    response = client.put(f"/api/bookings/edit-requests/{world['requests'][owner]}",
                          headers=world["headers"][actor], json={"status": "accepted"})
    assert response.status_code == 200
    db.expire_all()
    assert db.get(Booking, world["bookings"][owner]).start_time == world["start"] + timedelta(days=1)


@pytest.mark.parametrize("actor", ["a", "b", "admin"])
def test_master_owned_notes_and_admin_explicit_update(client, db, world, actor):
    owner = "b" if actor == "b" else "a"
    response = client.put(f"/api/bookings/{world['bookings'][owner]}", headers=world["headers"][actor],
                          json={"notes": "own notes"})
    assert response.status_code == 200
    db.expire_all()
    assert db.get(Booking, world["bookings"][owner]).notes == "own notes"


@pytest.mark.parametrize("prefix", ["/api/bookings", "/api/client/bookings"])
@pytest.mark.parametrize("changes", [{"notes": "not master"}, {"status": "completed"}, {"status": "confirmed"}, {"master_id": None}])
def test_client_owned_write_fields_restricted(client, db, world, prefix, changes):
    before = snapshot(db)
    assert client.put(f"{prefix}/{world['bookings']['a']}", headers=world["headers"]["ca"],
                      json=changes).status_code == 403
    assert snapshot(db) == before


@pytest.mark.parametrize("method,path,actor", [
    ("PUT", "/api/master/bookings/{booking}/time", "b"),
    ("POST", "/api/master/accounting/update-booking-status/{booking}?new_status=confirmed", "b"),
    ("POST", "/api/master/accounting/confirm-booking/{booking}", "b"),
    ("POST", "/api/master/accounting/cancel-booking/{booking}?cancellation_reason=master_unavailable", "b"),
    ("DELETE", "/api/client/bookings/{booking}", "cb"),
    ("PUT", "/api/client/bookings/{booking}", "cb"),
    ("POST", "/api/client/bookings/temporary/{temporary}/confirm-payment", "cb"),
    ("DELETE", "/api/client/bookings/temporary/{temporary}", "cb"),
])
def test_other_booking_mutation_boundaries(client, db, world, method, path, actor):
    before = snapshot(db)
    start = world["start"] + timedelta(days=3)
    response = client.request(method, path.format(booking=world["bookings"]["a"], temporary=world["temporary"]["a"]),
                              headers=world["headers"][actor], json={
                                  "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat()})
    assert response.status_code in {403, 404}
    assert snapshot(db) == before


def test_ordinary_auth_not_selected_by_demo_phone(client, db, world, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_MASTER_PHONE", db.get(User, world["users"]["a"]).phone)
    response = client.put(f"/api/bookings/{world['bookings']['a']}", headers=world["headers"]["a"], json={"notes": "ordinary"})
    assert response.status_code == 200
    assert client.get("/api/auth/users/me", headers=world["headers"]["a"]).json()["is_demo_session"] is False


def test_anonymous_public_flow_not_blocked(client, db, world):
    before = snapshot(db)
    # Missing required public payload reaches normal validation, not demo guard.
    assert client.post("/api/bookings/public", json={}).status_code == 422
    assert snapshot(db) == before


@pytest.mark.parametrize("write", ["orm", "bulk", "raw"])
def test_demo_get_future_write_regression_is_fail_closed(client, db, world, monkeypatch, write):
    from sqlalchemy import text
    from utils import subscription_features
    def accidental_write(session, user_id):
        if write == "orm":
            session.add(User(phone="+79008889999", full_name="Must not persist", role=UserRole.CLIENT))
            session.commit()
        elif write == "bulk":
            session.query(User).filter(User.id == user_id).update({"full_name": "Must not persist"})
        else:
            session.execute(text("UPDATE users SET full_name = 'Must not persist' WHERE id = :uid"), {"uid": user_id})
        pytest.fail("Demo GET write must not execute")
    h = demo_headers(client)
    before = snapshot(db)
    monkeypatch.setattr(subscription_features, "get_master_features", accidental_write)
    assert client.get("/api/master/subscription/features", headers=h).status_code == 403
    assert snapshot(db) == before
    assert not db.info.get("demo_readonly")


def test_client_own_time_change_and_cancel(client, db, world):
    booking_id = world["bookings"]["a"]
    h = world["headers"]["ca"]
    start = world["start"] + timedelta(days=3)
    assert client.put(f"/api/client/bookings/{booking_id}", headers=h,
                      json={"start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat()}).status_code == 200
    assert client.delete(f"/api/client/bookings/{booking_id}", headers=h).status_code == 200
    db.expire_all()
    assert db.get(Booking, booking_id).status == BookingStatus.CANCELLED


def test_trusted_ios_session_cannot_enter_demo(client, db, world):
    user = db.get(User, world["users"]["a"])
    h = headers(create_user_access_token(user, {"web_session_origin": "ios_app"}))
    before = snapshot(db)
    assert client.post("/api/auth/demo-master-access", headers=h).status_code == 403
    assert snapshot(db) == before


@pytest.mark.parametrize("configured", [True, False])
def test_pinned_demo_cannot_use_ordinary_login_or_preexisting_tokens(client, db, world, monkeypatch, configured):
    from auth import get_password_hash
    user = db.get(User, world["users"]["demo"])
    user.hashed_password = get_password_hash("test-only-demo-login")
    db.commit()
    phone = user.phone
    ordinary_refresh = create_user_refresh_token(user)
    if not configured:
        monkeypatch.setattr(get_settings(), "DEMO_MASTER_USER_ID", None)
    before = snapshot(db)
    response = client.post("/api/auth/login", json={"phone": phone, "password": "test-only-demo-login"})
    assert response.status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": ordinary_refresh}).status_code == 401
    h = world["headers"]["demo"]
    assert client.get("/api/auth/users/me", headers=h).status_code == 401
    assert client.put(f"/api/bookings/{world['bookings']['demo']}", headers=h, json={"notes": "escape"}).status_code == 401
    assert client.post("/api/bookings/public", headers=h, json={}).status_code == 401
    assert snapshot(db) == before


def test_client_route_retains_explicit_client_role_requirement(client, db, world):
    booking = db.get(Booking, world["bookings"]["b"])
    booking.client_id = world["users"]["a"]
    db.commit()
    start = world["start"] + timedelta(days=3)
    assert client.put(f"/api/client/bookings/{world['bookings']['b']}", headers=world["headers"]["a"],
                      json={"start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat()}).status_code == 403


@pytest.mark.parametrize("actor_kind", ["owner", "manager"])
@pytest.mark.parametrize("target_kind", ["own", "foreign-salon", "foreign-branch"])
def test_salon_reassignment_stays_inside_owned_context(client, db, world, actor_kind, target_kind):
    from models import Salon, SalonBranch
    actor = User(phone="+79008889980", full_name="Salon security", role=UserRole.SALON,
                 is_active=True, is_verified=True, is_phone_verified=True)
    db.add(actor)
    db.flush()
    salon = Salon(user_id=actor.id if actor_kind == "owner" else world["users"]["admin"], name="Owned")
    db.add(salon)
    db.flush()
    branch = SalonBranch(salon_id=salon.id, name="Owned branch",
                         manager_id=actor.id if actor_kind == "manager" else None)
    db.add(branch)
    db.flush()
    booking = db.get(Booking, world["bookings"]["a"])
    booking.salon_id, booking.branch_id = salon.id, branch.id
    service = db.get(Service, world["services"]["a"])
    service.salon_id = salon.id
    target = db.get(Master, world["masters"]["b"])
    target.services.append(service)
    if target_kind != "foreign-salon":
        target.salons.append(salon)
    target.branch_id = branch.id if target_kind != "foreign-branch" else None
    db.commit()
    h = headers(create_user_access_token(actor))
    before = snapshot(db)
    response = client.put(f"/api/bookings/{world['bookings']['a']}", headers=h,
                          json={"master_id": world["masters"]["b"]})
    assert response.status_code == (200 if target_kind == "own" else 403)
    if target_kind != "own":
        assert snapshot(db) == before

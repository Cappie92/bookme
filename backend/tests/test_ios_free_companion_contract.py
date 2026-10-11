"""iOS Free Companion data contract.

Generic web/Android payloads stay intact. client_surface=ios_fixed is an allowlist:
paid CRM, subscription freeze, plan identity and loyalty balances are absent.
"""

from datetime import date, datetime, time, timedelta

import pytest
from fastapi import HTTPException

from auth import get_password_hash
from models import (
    AppliedDiscount,
    Booking,
    BookingStatus,
    ClientRestriction,
    LoyaltyDiscount,
    LoyaltyDiscountType,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterClientMetadata,
    MasterSchedule,
    MasterService,
    Service,
    Subscription,
    SubscriptionFreeze,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from routers.auth import _issue_tokens_for_user
from utils.booking_limit_guard import (
    begin_booking_creation_transaction,
    enforce_booking_creation_limit,
)
from utils.ios_free_companion import IOS_FREE_FUTURE_BOOKINGS_LIMIT


def _login(client, phone: str) -> dict:
    resp = client.post("/api/auth/login", json={"phone": phone, "password": "test123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _user(db, *, role, phone, email, name, always_free=False):
    user = User(
        email=email,
        hashed_password=get_password_hash("test123"),
        phone=phone,
        full_name=name,
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
        is_always_free=always_free,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _master(db, user, *, domain=None):
    master = Master(
        user_id=user.id,
        bio="bio",
        experience_years=1,
        domain=domain,
        timezone="Europe/Moscow",
        city="Москва",
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


def _paid_plan(db, user):
    now = datetime.utcnow()
    plan = SubscriptionPlan(
        name="Paid ios contract",
        display_name="Paid",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1,
        price_3months=1,
        price_6months=1,
        price_12months=1,
        features={},
        limits={"max_future_bookings": None},
        is_active=True,
    )
    db.add(plan)
    db.flush()
    subscription = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        price=1,
        daily_rate=0,
        is_active=True,
        plan_id=plan.id,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def _booking(db, *, master, client_user, start, alias, note):
    service = Service(name="Стрижка", price=1500, duration=60, salon_id=None)
    db.add(service)
    db.flush()
    booking = Booking(
        client_id=client_user.id,
        service_id=service.id,
        master_id=master.id,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=BookingStatus.CREATED,
        payment_amount=1500,
        loyalty_points_used=0,
    )
    db.add(booking)
    db.add(
        MasterClientMetadata(
            master_id=master.id,
            client_phone=client_user.phone,
            alias_name=alias,
            note=note,
        )
    )
    db.commit()
    db.refresh(booking)
    return booking


def test_generic_booking_keeps_paid_crm_and_ios_drops_it(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000001", email="m-crm@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000002", email="c-crm@test.local", name="Анна Клиент"
    )
    master = _master(db, master_user, domain="anna-master")
    _paid_plan(db, master_user)
    start = datetime.utcnow() + timedelta(days=2)
    _booking(
        db,
        master=master,
        client_user=client_user,
        start=start,
        alias="VIP Аня",
        note="секретная заметка",
    )
    headers = _login(client, master_user.phone)

    generic = client.get("/api/master/bookings/future?page=1&limit=15", headers=headers)
    assert generic.status_code == 200, generic.text
    row = generic.json()["bookings"][0]
    assert row["client_master_alias"] == "VIP Аня"
    assert row["client_note"] == "секретная заметка"
    assert row["client_display_name"] == "VIP Аня"

    ios = client.get(
        "/api/master/bookings/future?page=1&limit=15&client_surface=ios_fixed",
        headers=headers,
    )
    assert ios.status_code == 200, ios.text
    projected = ios.json()["bookings"][0]
    assert "client_note" not in projected
    assert "has_client_note" not in projected
    assert "client_master_alias" not in projected
    assert "applied_discount" not in projected
    assert projected["client_display_name"] == "Анна Клиент"
    assert projected["client_name"] == "Анна Клиент"
    assert projected["client_display_name"] != "VIP Аня"


def test_free_and_paid_masters_share_ios_booking_contract(client, db):
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000012", email="c-par@test.local", name="Борис Клиент"
    )
    start = datetime.utcnow() + timedelta(days=3)
    phones = []
    for index, paid in enumerate((False, True)):
        master_user = _user(
            db,
            role=UserRole.MASTER,
            phone=f"+7900100002{index}",
            email=f"par-{index}@test.local",
            name="Мастер",
        )
        master = _master(db, master_user, domain=f"par-{index}")
        if paid:
            _paid_plan(db, master_user)
            alias, note = "Секрет", "заметка CRM"
        else:
            alias, note = None, None
        _booking(
            db,
            master=master,
            client_user=client_user,
            start=start,
            alias=alias,
            note=note,
        )
        phones.append(master_user.phone)

    payloads = []
    for phone in phones:
        headers = _login(client, phone)
        resp = client.get(
            "/api/master/bookings/detailed?client_surface=ios_fixed",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        row = resp.json()[0]
        payloads.append(row)
        assert row["client_display_name"] == "Борис Клиент"
        assert "client_note" not in row
        assert "client_master_alias" not in row

    assert set(payloads[0]) == set(payloads[1])


def test_ios_schedule_omits_freeze_and_web_keeps_it(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000031", email="sch@test.local", name="Мастер"
    )
    master = _master(db, master_user, domain="sch-master")
    subscription = _paid_plan(db, master_user)
    now = datetime.utcnow()
    db.add(
        SubscriptionFreeze(
            subscription_id=subscription.id,
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=14),
            freeze_days=15,
            is_cancelled=False,
        )
    )
    db.add(
        MasterSchedule(
            master_id=master.id,
            date=now.date(),
            start_time=datetime.strptime("10:00", "%H:%M").time(),
            end_time=datetime.strptime("12:00", "%H:%M").time(),
            is_available=True,
        )
    )
    db.commit()
    headers = _login(client, master_user.phone)

    web = client.get("/api/master/schedule/weekly?week_offset=0&weeks_ahead=1", headers=headers)
    assert web.status_code == 200, web.text
    web_slots = web.json()["slots"]
    assert any(slot.get("is_frozen") is True for slot in web_slots)

    ios = client.get(
        "/api/master/schedule/weekly?week_offset=0&weeks_ahead=1&client_surface=ios_fixed",
        headers=headers,
    )
    assert ios.status_code == 200, ios.text
    ios_slots = ios.json()["slots"]
    assert ios_slots
    assert all("is_frozen" not in slot for slot in ios_slots)


def test_ios_settings_allowlist_has_no_paid_fields(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000041", email="set@test.local", name="Мастер"
    )
    _master(db, master_user, domain="public-slug")
    _paid_plan(db, master_user)
    headers = _login(client, master_user.phone)
    resp = client.get("/api/master/settings?client_surface=ios_fixed", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    blob = str(body)
    for forbidden in (
        "plan_name",
        "subscription",
        "billing",
        "is_frozen",
        "has_clients_access",
        "max_future_bookings",
        "custom_domain",
    ):
        assert forbidden not in body
        assert forbidden not in blob
    assert body["master"]["domain"] == "public-slug"
    assert "bio" in body["master"]
    assert "phone" in body["user"]


def test_ios_capacity_is_20_for_paid_master_and_web_stays_unlimited(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000051", email="cap@test.local", name="Мастер"
    )
    master = _master(db, master_user)
    _paid_plan(db, master_user)
    now = datetime.utcnow()
    service = Service(name="Лимит", price=100, duration=60, salon_id=None)
    db.add(service)
    db.flush()
    for index in range(20):
        start = now + timedelta(hours=index + 1)
        db.add(
            Booking(
                client_id=master_user.id,
                service_id=service.id,
                master_id=master.id,
                start_time=start,
                end_time=start + timedelta(hours=1),
                status=BookingStatus.CREATED,
                payment_amount=100,
                loyalty_points_used=0,
            )
        )
    db.commit()
    candidate = {
        "client_id": master_user.id,
        "service_id": service.id,
        "master_id": master.id,
        "start_time": now + timedelta(days=5),
        "end_time": now + timedelta(days=5, hours=1),
        "status": BookingStatus.CREATED.value,
        "payment_amount": 100,
    }
    begin_booking_creation_transaction(db)
    enforce_booking_creation_limit(db, candidate, now_utc=now)
    with pytest.raises(HTTPException) as exc:
        enforce_booking_creation_limit(
            db, candidate, now_utc=now, client_surface="ios_fixed"
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["limit"] == IOS_FREE_FUTURE_BOOKINGS_LIMIT

    headers = _login(client, master_user.phone)

    web = client.get("/api/master/bookings/limit", headers=headers)
    assert web.status_code == 200, web.text
    assert web.json()["plan_name"] == "Paid ios contract"
    assert web.json()["max_future_bookings"] is None
    assert web.json()["has_limit"] is False

    ios = client.get("/api/master/bookings/limit?client_surface=ios_fixed", headers=headers)
    assert ios.status_code == 200, ios.text
    ios_body = ios.json()
    assert ios_body["max_future_bookings"] == 20
    assert ios_body["has_limit"] is True
    assert ios_body["is_limit_exceeded"] is True
    assert "plan_name" not in ios_body


def test_ios_dashboard_has_no_subscription_and_no_crm_alias(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000061", email="dash@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000062", email="dash-c@test.local", name="Галина"
    )
    master = _master(db, master_user, domain="dash-master")
    master.can_work_independently = True
    db.commit()
    _paid_plan(db, master_user)
    _booking(
        db,
        master=master,
        client_user=client_user,
        start=datetime.utcnow() + timedelta(days=1),
        alias="Алиас",
        note="заметка",
    )
    headers = _login(client, master_user.phone)
    resp = client.get(
        "/api/master/dashboard/stats?period=week&offset=0&client_surface=ios_fixed",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "subscription_info" not in body
    assert "plan_name" not in body
    nxt = body["next_bookings_list"][0]
    assert nxt["client_display_name"] == "Галина"
    assert "client_note" not in nxt
    assert "has_client_note" not in nxt


def test_ios_client_loyalty_balance_is_empty(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000071", email="loy-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000072", email="loy-c@test.local", name="Клиент"
    )
    master = _master(db, master_user, domain="loy-master")
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=client_user.id,
            transaction_type="earned",
            points=40,
            earned_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=30),
        )
    )
    db.commit()
    headers = _login(client, client_user.phone)
    generic = client.get("/api/client/loyalty/points", headers=headers)
    assert generic.status_code == 200, generic.text
    assert generic.json()["total_balance"] == 40

    ios = client.get("/api/client/loyalty/points?client_surface=ios_fixed", headers=headers)
    assert ios.status_code == 200, ios.text
    assert ios.json()["masters"] == []
    assert ios.json()["total_balance"] == 0


def test_ios_eligibility_keeps_blacklist_and_drops_points(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000081", email="blk-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000082", email="blk-c@test.local", name="Клиент"
    )
    master = _master(db, master_user, domain="blk-master")
    db.add(
        ClientRestriction(
            master_id=master.id,
            client_phone=client_user.phone,
            restriction_type="blacklist",
            reason="safety",
            is_active=True,
        )
    )
    db.commit()
    headers = _login(client, client_user.phone)
    resp = client.get(
        "/api/public/masters/blk-master/eligibility?client_surface=ios_fixed",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["booking_blocked"] is True
    assert "points" not in body
    assert "loyalty_hint" not in body
    assert "loyalty_program_enabled" not in body


def test_ios_price_preview_keeps_money_and_drops_loyalty_metadata(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000091", email="prv@test.local", name="Мастер"
    )
    master = _master(db, master_user, domain="prv-master")
    from models import MasterService

    svc = MasterService(master_id=master.id, name="Окрашивание", duration=60, price=2000)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    start = (datetime.utcnow() + timedelta(days=1)).isoformat()
    resp = client.get(
        f"/api/public/masters/prv-master/booking-price-preview"
        f"?service_id={svc.id}&start_time={start}&use_loyalty_points=true&client_surface=ios_fixed"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["base_price"] == 2000
    assert body["final_price"] == 2000
    assert "loyalty_points_to_use" not in body
    assert "rule_name" not in body
    assert "available_points" not in body


def _discounted_public_setup(db, *, domain, phone, email):
    master_user = _user(db, role=UserRole.MASTER, phone=phone, email=email, name="Мастер")
    master = _master(db, master_user, domain=domain)
    canon = Service(name="Стрижка", duration=30, price=1000.0, salon_id=None, indie_master_id=None)
    rule_service = Service(name="Стрижка", duration=30, price=1000.0, salon_id=None, indie_master_id=None)
    db.add_all([canon, rule_service])
    db.flush()
    master_service = MasterService(
        master_id=master.id, category_id=None, name="Стрижка", duration=30, price=1000.0
    )
    work_date = date(2031, 4, 2)
    db.add(master_service)
    db.add(
        LoyaltyDiscount(
            master_id=master.id,
            discount_type=LoyaltyDiscountType.QUICK,
            name="Service only",
            discount_percent=9.0,
            is_active=True,
            priority=1,
            conditions={
                "condition_type": "service_discount",
                "parameters": {"service_id": rule_service.id},
            },
        )
    )
    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=None,
            date=work_date,
            start_time=time(8, 0),
            end_time=time(20, 0),
            is_available=True,
        )
    )
    db.commit()
    db.refresh(master_service)
    return master, master_service, work_date


def _public_slot(work_date, hour):
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("Europe/Moscow")
    start = datetime(work_date.year, work_date.month, work_date.day, hour, 0, tzinfo=tz)
    end = datetime(work_date.year, work_date.month, work_date.day, hour, 30, tzinfo=tz)
    return start, end


def test_ios_keeps_physical_service_discount_and_hides_rule_metadata(client, db):
    master, master_service, work_date = _discounted_public_setup(
        db, domain="disc-master", phone="+79001000111", email="disc-m@test.local"
    )
    buyer = _user(
        db, role=UserRole.CLIENT, phone="+79001000112", email="disc-c@test.local", name="Клиент"
    )
    domain = master.domain
    service_id = master_service.id
    buyer_phone = buyer.phone
    headers = _login(client, buyer_phone)
    start, end = _public_slot(work_date, 10)
    body = {
        "service_id": service_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }
    generic = client.post(f"/api/public/masters/{domain}/bookings", json=body, headers=headers)
    assert generic.status_code == 200, generic.text
    assert generic.json()["final_price"] == pytest.approx(910.0)
    assert generic.json()["condition_type"] == "service_discount"

    start_ios, end_ios = _public_slot(work_date, 11)
    ios = client.post(
        f"/api/public/masters/{domain}/bookings?client_surface=ios_fixed",
        json={**body, "start_time": start_ios.isoformat(), "end_time": end_ios.isoformat()},
        headers=headers,
    )
    assert ios.status_code == 200, ios.text
    ios_body = ios.json()
    assert ios_body["final_price"] == pytest.approx(910.0)
    assert ios_body["discounted_price"] == pytest.approx(910.0)
    assert ios_body["base_price"] == pytest.approx(1000.0)
    assert "rule_name" not in ios_body
    assert "condition_type" not in ios_body
    assert "loyalty_points_used" not in ios_body
    row = db.query(Booking).filter(Booking.id == ios_body["id"]).first()
    assert float(row.payment_amount) == pytest.approx(910.0)


def test_ios_refuses_loyalty_points_spend(client, db):
    master, master_service, work_date = _discounted_public_setup(
        db, domain="pts-master", phone="+79001000121", email="pts-m@test.local"
    )
    buyer = _user(
        db, role=UserRole.CLIENT, phone="+79001000122", email="pts-c@test.local", name="Клиент"
    )
    db.add(
        LoyaltySettings(
            master_id=master.id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=100,
            points_lifetime_days=None,
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=buyer.id,
            transaction_type="earned",
            points=400,
            earned_at=datetime.utcnow(),
            expires_at=None,
        )
    )
    db.commit()
    domain = master.domain
    service_id = master_service.id
    buyer_phone = buyer.phone
    headers = _login(client, buyer_phone)
    start, end = _public_slot(work_date, 12)
    ios = client.post(
        f"/api/public/masters/{domain}/bookings?client_surface=ios_fixed",
        json={
            "service_id": service_id,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "use_loyalty_points": True,
        },
        headers=headers,
    )
    assert ios.status_code == 200, ios.text
    assert "loyalty_points_used" not in ios.json()
    assert ios.json()["final_price"] == pytest.approx(910.0)
    ios_row = db.query(Booking).filter(Booking.id == ios.json()["id"]).first()
    assert int(ios_row.loyalty_points_used or 0) == 0

    start_web, end_web = _public_slot(work_date, 13)
    generic = client.post(
        f"/api/public/masters/{domain}/bookings",
        json={
            "service_id": service_id,
            "start_time": start_web.isoformat(),
            "end_time": end_web.isoformat(),
            "use_loyalty_points": True,
        },
        headers=headers,
    )
    assert generic.status_code == 200, generic.text
    assert int(generic.json()["loyalty_points_used"]) == 400


def test_ios_booking_detail_keeps_money_and_drops_discount_metadata(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000131", email="det-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000132", email="det-c@test.local", name="Анна"
    )
    master = _master(db, master_user, domain="det-master")
    booking = _booking(
        db,
        master=master,
        client_user=client_user,
        start=datetime.utcnow() + timedelta(days=3),
        alias="Секрет",
        note="crm",
    )
    booking.payment_amount = 910
    booking.loyalty_points_used = 40
    rule = LoyaltyDiscount(
        master_id=master.id,
        discount_type=LoyaltyDiscountType.QUICK,
        name="Hidden rule",
        discount_percent=9.0,
        is_active=True,
        priority=1,
        conditions={"condition_type": "service_discount", "parameters": {}},
    )
    db.add(rule)
    db.flush()
    db.add(
        AppliedDiscount(
            booking_id=booking.id,
            discount_id=rule.id,
            discount_percent=9,
            discount_amount=90,
        )
    )
    db.commit()
    booking_id = booking.id
    service_id = booking.service_id
    master_phone = master_user.phone
    headers = _login(client, master_phone)
    generic = client.get(f"/api/bookings/{booking_id}", headers=headers)
    ios = client.get(f"/api/bookings/{booking_id}?client_surface=ios_fixed", headers=headers)
    assert generic.status_code == ios.status_code == 200
    assert generic.json()["applied_discount"]["name"] == "Hidden rule"
    assert generic.json()["payment_amount"] == pytest.approx(910)
    ios_body = ios.json()
    assert ios_body["payment_amount"] == pytest.approx(910)
    assert ios_body["service_id"] == service_id
    assert "applied_discount" not in ios_body
    assert "loyalty_points_used" not in ios_body
    listed = client.get("/api/master/bookings/detailed?client_surface=ios_fixed", headers=headers)
    assert listed.status_code == 200, listed.text
    row = listed.json()[0]
    assert "loyalty_points_used" not in row
    assert "applied_discount" not in row
    assert "client_note" not in row
    assert row["payment_amount"] == pytest.approx(910)


def test_ios_blacklist_hides_crm_reason_and_web_keeps_it(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000141", email="rsn-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000142", email="rsn-c@test.local", name="Клиент"
    )
    master = _master(db, master_user, domain="rsn-master")
    db.add(
        ClientRestriction(
            master_id=master.id,
            client_phone=client_user.phone,
            restriction_type="blacklist",
            reason="не пришёл и нагрубил",
            is_active=True,
        )
    )
    db.commit()
    domain = master.domain
    client_phone = client_user.phone
    headers = _login(client, client_phone)
    body = {
        "service_id": 1,
        "start_time": (datetime.utcnow() + timedelta(days=1)).isoformat(),
        "end_time": (datetime.utcnow() + timedelta(days=1, hours=1)).isoformat(),
    }
    ios = client.post(
        f"/api/public/masters/{domain}/bookings?client_surface=ios_fixed",
        json=body,
        headers=headers,
    )
    web = client.post(f"/api/public/masters/{domain}/bookings", json=body, headers=headers)
    assert ios.status_code == web.status_code == 403
    assert ios.json()["detail"]["code"] == "booking_blocked"
    assert "не пришёл" not in ios.text
    assert "reason" not in ios.json()["detail"]
    assert web.json()["detail"] == "не пришёл и нагрубил"


def test_client_create_blacklist_returns_403_for_ios_and_web(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000241", email="blk2-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000242", email="blk2-c@test.local", name="Клиент"
    )
    master = _master(db, master_user, domain="blk2-master")
    db.add(
        ClientRestriction(
            master_id=master.id,
            client_phone=client_user.phone,
            restriction_type="blacklist",
            reason="не пришёл и нагрубил",
            is_active=True,
        )
    )
    db.commit()
    master_id = master.id
    headers = _login(client, client_user.phone)
    start = datetime.utcnow() + timedelta(days=2)
    body = {
        "master_id": master_id,
        "service_id": 1,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "client_name": "Клиент",
        "service_name": "Стрижка",
        "service_duration": 60,
        "service_price": 1000,
    }
    ios = client.post("/api/client/bookings/?client_surface=ios_fixed", json=body, headers=headers)
    web = client.post("/api/client/bookings/", json=body, headers=headers)
    assert ios.status_code == 403, ios.text
    assert web.status_code == 403, web.text
    assert ios.json()["detail"]["code"] == "booking_blocked"
    assert "не пришёл" not in ios.text
    assert "reason" not in ios.json()["detail"]
    assert web.json()["detail"] == "не пришёл и нагрубил"


def test_ios_settings_contract_ignores_paid_customization(client, db):
    free_user = _user(
        db, role=UserRole.MASTER, phone="+79001000151", email="set-f@test.local", name="Free"
    )
    paid_user = _user(
        db,
        role=UserRole.MASTER,
        phone="+79001000152",
        email="set-p@test.local",
        name="Paid",
        always_free=True,
    )
    free_master = _master(db, free_user, domain="plain-slug")
    paid_master = _master(db, paid_user, domain="custom-slug")
    free_master.website = "https://paid.example"
    paid_master.website = "https://also-paid.example"
    free_master.background_color = "#111111"
    paid_master.background_color = "#222222"
    free_master.pre_visit_confirmations_enabled = True
    paid_master.pre_visit_confirmations_enabled = True
    db.commit()
    free_phone = free_user.phone
    paid_phone = paid_user.phone
    free_headers = _login(client, free_phone)
    paid_headers = _login(client, paid_phone)
    free_ios = client.get("/api/master/settings?client_surface=ios_fixed", headers=free_headers)
    paid_ios = client.get("/api/master/settings?client_surface=ios_fixed", headers=paid_headers)
    assert free_ios.status_code == paid_ios.status_code == 200
    assert set(free_ios.json()["master"]) == set(paid_ios.json()["master"])
    master_keys = set(free_ios.json()["master"])
    assert "pre_visit_confirmations_enabled" not in master_keys
    assert "pre_visit_confirmations_effective" in master_keys
    assert "website" not in master_keys
    assert "background_color" not in master_keys
    assert "domain" in master_keys
    assert free_ios.json()["master"]["domain"] == "plain-slug"
    assert paid_ios.json()["master"]["domain"] == "custom-slug"
    assert "subscription" not in free_ios.text


def test_ios_capacity_does_not_loosen_a_stricter_limit(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000161", email="cap10@test.local", name="Мастер"
    )
    _master(db, master_user, domain="cap10-master")
    subscription = _paid_plan(db, master_user)
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
    plan.limits = {"max_future_bookings": 10}
    db.commit()
    headers = _login(client, master_user.phone)
    web = client.get("/api/master/bookings/limit", headers=headers)
    ios = client.get("/api/master/bookings/limit?client_surface=ios_fixed", headers=headers)
    assert web.status_code == ios.status_code == 200
    assert web.json()["max_future_bookings"] == 10
    assert ios.json()["max_future_bookings"] == 10
    assert "plan_name" not in ios.json()


def test_ios_app_web_keeps_crm_and_blocks_commerce(client, db):
    master_user = _user(
        db, role=UserRole.MASTER, phone="+79001000171", email="origin-m@test.local", name="Мастер"
    )
    client_user = _user(
        db, role=UserRole.CLIENT, phone="+79001000172", email="origin-c@test.local", name="Анна"
    )
    master = _master(db, master_user, domain="origin-master")
    _paid_plan(db, master_user)
    _booking(
        db,
        master=master,
        client_user=client_user,
        start=datetime.utcnow() + timedelta(days=2),
        alias="Веб алиас",
        note="веб заметка",
    )
    tokens = _issue_tokens_for_user(master_user, web_session_origin="ios_app")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    listed = client.get("/api/master/bookings/detailed", headers=headers)
    assert listed.status_code == 200, listed.text
    row = listed.json()[0]
    assert row["client_master_alias"] == "Веб алиас"
    assert row["client_note"] == "веб заметка"
    native = client.get(
        "/api/master/bookings/detailed?client_surface=ios_fixed", headers=headers
    )
    assert "client_note" not in native.json()[0]
    blocked = client.post(
        "/api/payments/subscription/init",
        json={
            "plan_id": 1,
            "duration_months": 1,
            "payment_period": "month",
            "upgrade_type": "immediate",
        },
        headers=headers,
    )
    assert blocked.status_code == 403


def _dashboard_fingerprint(body):
    return {
        "current_week_income": body["current_week_income"],
        "previous_week_income": body["previous_week_income"],
        "income_dynamics": body["income_dynamics"],
        "current_week_bookings": body["current_week_bookings"],
        "previous_week_bookings": body["previous_week_bookings"],
        "future_week_bookings": body["future_week_bookings"],
        "weeks": [
            {
                "bookings": point.get("bookings"),
                "income": point.get("income"),
            }
            for point in body.get("weeks_data") or []
        ],
        "top_earnings": [
            {"name": row.get("service_name"), "total": row.get("total_earnings")}
            for row in body.get("top_services_by_earnings") or []
        ],
        "top_bookings": [
            {"name": row.get("service_name"), "booking_count": row.get("booking_count")}
            for row in body.get("top_services_by_bookings") or []
        ],
    }


def test_ios_dashboard_free_and_paid_stats_match(client, db):
    start = datetime.utcnow() - timedelta(days=1)
    bodies = []
    for idx, paid in enumerate((False, True)):
        master_user = _user(
            db,
            role=UserRole.MASTER,
            phone=f"+7900100018{idx}",
            email=f"par-{idx}@test.local",
            name="Мастер",
        )
        client_user = _user(
            db,
            role=UserRole.CLIENT,
            phone=f"+7900100019{idx}",
            email=f"par-c-{idx}@test.local",
            name="Галина",
        )
        master = _master(db, master_user, domain=f"par-master-{idx}")
        if paid:
            _paid_plan(db, master_user)
        booking = _booking(
            db,
            master=master,
            client_user=client_user,
            start=start,
            alias="Алиас",
            note="заметка",
        )
        booking.status = BookingStatus.COMPLETED
        booking.payment_amount = 1500
        db.commit()
        headers = _login(client, master_user.phone)
        resp = client.get(
            "/api/master/dashboard/stats?period=week&offset=0&client_surface=ios_fixed",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "subscription_info" not in body
        upcoming = body.get("next_bookings_list") or []
        for item in upcoming:
            assert "client_note" not in item
            assert "loyalty_points_used" not in item
            assert "applied_discount" not in item
        bodies.append(body)
    free_fp = _dashboard_fingerprint(bodies[0])
    paid_fp = _dashboard_fingerprint(bodies[1])
    assert free_fp == paid_fp
    assert free_fp["top_bookings"]
    assert free_fp["top_bookings"][0]["booking_count"] == 1
    assert bodies[0]["top_services_by_bookings"][0]["booking_count"] == 1
    assert "bookings_count" not in bodies[0]["top_services_by_bookings"][0]

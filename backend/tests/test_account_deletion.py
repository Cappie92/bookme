# -*- coding: utf-8 -*-
"""Integration tests: self-service account deletion (CLIENT + MASTER policies)."""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from auth import create_access_token, get_password_hash
from models import (
    AvailabilitySlot,
    Booking,
    BookingStatus,
    ClientRestriction,
    ClientRestrictionRule,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterClientMetadata,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    OwnerType,
    PersonalDiscount,
    Service,
    Subscription,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
    master_services,
)
from services.account_deletion import (
    MASTER_ACCOUNT_DELETED_REASON,
    delete_account,
    deleted_master_display_name,
)
from utils.master_domain_lookup import get_master_by_domain_slug


DOMAIN = "acct-del-master"


def _auth(client, phone: str, password: str = "testpassword"):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def deletion_world(db):
    """Мастер A + клиент C + другой мастер B + клиент с записями у обоих."""
    master_user = User(
        email="del_master@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990001001",
        full_name="Delete Me Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    other_master_user = User(
        email="keep_master@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990001002",
        full_name="Keep Master",
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    client_user = User(
        email="del_client_hist@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990001003",
        full_name="History Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    other_client = User(
        email="other_client@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990001004",
        full_name="Other Client",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add_all([master_user, other_master_user, client_user, other_client])
    db.commit()
    for u in (master_user, other_master_user, client_user, other_client):
        db.refresh(u)

    master = Master(
        user_id=master_user.id,
        bio="bio personal",
        experience_years=5,
        domain=DOMAIN,
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
        address="ул. Тест 1",
        photo="uploads/photos/fake.jpg",
        site_description="описание",
    )
    other_master = Master(
        user_id=other_master_user.id,
        bio="keep",
        experience_years=2,
        domain="keep-master-domain",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
        city="Москва",
    )
    db.add_all([master, other_master])
    db.commit()
    db.refresh(master)
    db.refresh(other_master)

    svc = Service(name="Стрижка Del", duration=60, price=1500.0)
    svc_other = Service(name="Стрижка Keep", duration=30, price=800.0)
    db.add_all([svc, svc_other])
    db.flush()
    db.execute(master_services.insert().values(master_id=master.id, service_id=svc.id))
    db.execute(master_services.insert().values(master_id=other_master.id, service_id=svc_other.id))

    cat = MasterServiceCategory(master_id=master.id, name="Категория")
    db.add(cat)
    db.flush()
    db.add(
        MasterService(
            master_id=master.id,
            category_id=cat.id,
            name="Актуальная услуга",
            duration=45,
            price=1200.0,
        )
    )

    now = datetime.utcnow()
    past = Booking(
        client_id=client_user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now - timedelta(days=3),
        end_time=now - timedelta(days=3, hours=-1),
        status=BookingStatus.COMPLETED.value,
        payment_amount=1500.0,
    )
    future = Booking(
        client_id=client_user.id,
        service_id=svc.id,
        master_id=master.id,
        start_time=now + timedelta(days=3),
        end_time=now + timedelta(days=3, hours=1),
        status=BookingStatus.CONFIRMED.value,
        payment_amount=1500.0,
        loyalty_points_used=50,
    )
    other_booking = Booking(
        client_id=client_user.id,
        service_id=svc_other.id,
        master_id=other_master.id,
        start_time=now - timedelta(days=1),
        end_time=now - timedelta(days=1, hours=-1),
        status=BookingStatus.COMPLETED.value,
        payment_amount=800.0,
    )
    db.add_all([past, future, other_booking])

    db.add(
        MasterSchedule(
            master_id=master.id,
            salon_id=None,
            date=(now + timedelta(days=1)).date(),
            start_time=datetime.strptime("10:00", "%H:%M").time(),
            end_time=datetime.strptime("18:00", "%H:%M").time(),
            is_available=True,
        )
    )
    db.add(
        AvailabilitySlot(
            owner_type=OwnerType.MASTER,
            owner_id=master.id,
            day_of_week=1,
            start_time=datetime.strptime("10:00", "%H:%M").time(),
            end_time=datetime.strptime("14:00", "%H:%M").time(),
        )
    )
    db.add(
        LoyaltySettings(
            master_id=master.id,
            is_enabled=True,
            accrual_percent=10,
            max_payment_percent=50,
        )
    )
    # Баллы у клиента от удаляемого мастера и от другого
    db.add(
        LoyaltyTransaction(
            master_id=master.id,
            client_id=client_user.id,
            transaction_type="earned",
            points=200,
            earned_at=now,
            source="test",
        )
    )
    db.add(
        LoyaltyTransaction(
            master_id=other_master.id,
            client_id=client_user.id,
            transaction_type="earned",
            points=300,
            earned_at=now,
            source="test",
        )
    )
    db.add(
        PersonalDiscount(
            master_id=master.id,
            client_phone=client_user.phone,
            discount_percent=10,
            is_active=True,
        )
    )
    db.add(
        ClientRestriction(
            master_id=master.id,
            client_phone=client_user.phone,
            restriction_type="blacklist",
            is_active=True,
        )
    )
    db.add(
        ClientRestrictionRule(
            master_id=master.id,
            cancellation_reason="client_no_show",
            cancel_count=2,
            restriction_type="blacklist",
        )
    )
    db.add(
        MasterClientMetadata(
            master_id=master.id,
            client_phone=client_user.phone,
            alias_name="Вася",
            note="заметка",
        )
    )
    db.add(
        Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            status=SubscriptionStatus.ACTIVE,
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=20),
            price=1000.0,
            daily_rate=30.0,
            is_active=True,
            auto_renewal=True,
        )
    )
    db.commit()
    db.refresh(past)
    db.refresh(future)
    db.refresh(other_booking)

    return {
        "master_user": master_user,
        "master": master,
        "other_master_user": other_master_user,
        "other_master": other_master,
        "client": client_user,
        "other_client": other_client,
        "svc": svc,
        "past": past,
        "future": future,
        "other_booking": other_booking,
        "old_phone": "+79990001001",
        "old_email": "del_master@test.com",
    }


def test_master_empty_anonymize_and_deactivate(db):
    u = User(
        email="empty_master@test.com",
        hashed_password=get_password_hash("x"),
        phone="+79990002001",
        full_name="Empty Master",
        role=UserRole.MASTER,
        is_active=True,
    )
    db.add(u)
    db.flush()
    m = Master(user_id=u.id, bio="b", timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(m)
    db.commit()
    db.refresh(u)
    db.refresh(m)

    result = delete_account(db, u, commit=True)
    db.refresh(u)
    db.refresh(m)

    assert result.already_deleted is False
    assert m.id == result.master_id
    assert m.is_deleted is True
    assert m.deleted_at is not None
    assert u.is_active is False
    assert u.deleted_at is not None
    assert u.full_name == deleted_master_display_name(m.id)
    assert u.phone is None
    assert u.email is None
    assert u.hashed_password is None


def test_master_ids_preserved_and_display_name(db, deletion_world):
    w = deletion_world
    mid = w["master"].id
    uid = w["master_user"].id
    delete_account(db, w["master_user"], commit=True)
    db.refresh(w["master"])
    db.refresh(w["master_user"])
    assert db.query(Master).filter(Master.id == mid).first() is not None
    assert db.query(User).filter(User.id == uid).first() is not None
    assert w["master_user"].full_name == f"Удалённый мастер №{mid}"


def test_phone_email_freed_for_reregistration(db, deletion_world):
    w = deletion_world
    old_phone = w["old_phone"]
    old_email = w["old_email"]
    delete_account(db, w["master_user"], commit=True)

    assert db.query(User).filter(User.phone == old_phone).first() is None
    assert db.query(User).filter(User.email == old_email).first() is None

    nu = User(
        email=old_email,
        hashed_password=get_password_hash("newpass"),
        phone=old_phone,
        full_name="New Master",
        role=UserRole.MASTER,
        is_active=True,
    )
    db.add(nu)
    db.commit()
    assert nu.id != w["master_user"].id


def test_tokens_return_401_after_master_deletion(client, db, deletion_world):
    w = deletion_world
    token = create_access_token(data={"sub": str(w["master_user"].id), "role": "MASTER"})
    headers = {"Authorization": f"Bearer {token}"}

    delete_account(db, w["master_user"], commit=True)

    r_after = client.get("/api/auth/users/me", headers=headers)
    assert r_after.status_code == 401

    legacy = create_access_token(data={"sub": w["old_phone"], "role": "MASTER"})
    r_legacy = client.get(
        "/api/auth/users/me",
        headers={"Authorization": f"Bearer {legacy}"},
    )
    assert r_legacy.status_code == 401


def test_schedule_and_slots_removed_future_cancelled_history_kept(db, deletion_world):
    w = deletion_world
    mid = w["master"].id
    past_id = w["past"].id
    future_id = w["future"].id
    other_id = w["other_booking"].id
    other_master_name = w["other_master_user"].full_name

    delete_account(db, w["master_user"], commit=True)

    assert db.query(MasterSchedule).filter(MasterSchedule.master_id == mid).count() == 0
    assert (
        db.query(AvailabilitySlot)
        .filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id == mid,
        )
        .count()
        == 0
    )

    past = db.query(Booking).filter(Booking.id == past_id).first()
    future = db.query(Booking).filter(Booking.id == future_id).first()
    other = db.query(Booking).filter(Booking.id == other_id).first()
    assert past is not None
    assert past.status == BookingStatus.COMPLETED.value
    assert future is not None
    assert future.status == BookingStatus.CANCELLED.value
    assert future.cancellation_reason == MASTER_ACCOUNT_DELETED_REASON
    assert int(future.loyalty_points_used or 0) == 0
    assert other is not None
    assert other.status == BookingStatus.COMPLETED.value
    assert other.master_id == w["other_master"].id

    db.refresh(w["other_master_user"])
    assert w["other_master_user"].full_name == other_master_name
    assert w["other_master_user"].is_active is True
    assert w["other_master_user"].phone == "+79990001002"


def test_other_users_untouched(db, deletion_world):
    w = deletion_world
    oc_phone = w["other_client"].phone
    oc_name = w["other_client"].full_name
    delete_account(db, w["master_user"], commit=True)
    db.refresh(w["other_client"])
    db.refresh(w["client"])
    assert w["other_client"].phone == oc_phone
    assert w["other_client"].full_name == oc_name
    assert w["client"].is_active is True
    assert w["client"].phone == "+79990001003"


def test_public_page_unavailable_and_services_gone(db, deletion_world, client):
    w = deletion_world
    mid = w["master"].id
    assert get_master_by_domain_slug(db, DOMAIN) is not None
    delete_account(db, w["master_user"], commit=True)
    db.refresh(w["master"])
    assert w["master"].domain is None
    assert get_master_by_domain_slug(db, DOMAIN) is None
    r = client.get(f"/api/public/masters/{DOMAIN}")
    assert r.status_code in (404, 410)

    assert db.query(MasterService).filter(MasterService.master_id == mid).count() == 0
    assert (
        db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id == mid).count()
        == 0
    )


def test_loyalty_crm_removed_only_this_master_points(db, deletion_world):
    w = deletion_world
    mid = w["master"].id
    oid = w["other_master"].id
    cid = w["client"].id

    delete_account(db, w["master_user"], commit=True)

    assert db.query(LoyaltySettings).filter(LoyaltySettings.master_id == mid).count() == 0
    assert db.query(PersonalDiscount).filter(PersonalDiscount.master_id == mid).count() == 0
    assert db.query(ClientRestriction).filter(ClientRestriction.master_id == mid).count() == 0
    assert (
        db.query(ClientRestrictionRule).filter(ClientRestrictionRule.master_id == mid).count()
        == 0
    )
    assert (
        db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == mid).count() == 0
    )
    assert (
        db.query(LoyaltyTransaction).filter(LoyaltyTransaction.master_id == mid).count() == 0
    )
    kept = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.master_id == oid, LoyaltyTransaction.client_id == cid)
        .all()
    )
    assert len(kept) == 1
    assert kept[0].points == 300


def test_subscription_stopped_financial_user_kept(db, deletion_world):
    w = deletion_world
    delete_account(db, w["master_user"], commit=True)
    subs = db.query(Subscription).filter(Subscription.user_id == w["master_user"].id).all()
    assert len(subs) == 1
    assert subs[0].is_active is False
    assert subs[0].auto_renewal is False
    assert subs[0].status == SubscriptionStatus.CANCELLED


def test_transaction_rollback_on_error(db, deletion_world):
    w = deletion_world
    mid = w["master"].id
    phone = w["master_user"].phone
    with patch(
        "services.account_deletion._delete_master_schedule",
        side_effect=RuntimeError("boom"),
    ):
        with pytest.raises(RuntimeError):
            delete_account(db, w["master_user"], commit=True)

    db.expire_all()
    u = db.query(User).filter(User.id == w["master_user"].id).first()
    m = db.query(Master).filter(Master.id == mid).first()
    assert u.phone == phone
    assert u.is_active is True
    assert m.is_deleted is False
    assert db.query(MasterSchedule).filter(MasterSchedule.master_id == mid).count() == 1


def test_idempotent_second_deletion(db, deletion_world):
    w = deletion_world
    r1 = delete_account(db, w["master_user"], commit=True)
    assert r1.already_deleted is False
    db.refresh(w["master_user"])
    r2 = delete_account(db, w["master_user"], commit=True)
    assert r2.already_deleted is True
    assert w["master_user"].full_name == deleted_master_display_name(w["master"].id)


def test_client_history_gets_deleted_master_flag(db, deletion_world):
    """Признак удалённого мастера: is_deleted + анонимное имя + domain=None (контракт клиентского API)."""
    w = deletion_world
    master_id = w["master"].id
    future_id = w["future"].id
    past_id = w["past"].id

    delete_account(db, w["master_user"], commit=True)
    db.expire_all()

    master = db.query(Master).filter(Master.id == master_id).first()
    user = db.query(User).filter(User.id == w["master_user"].id).first()
    past = db.query(Booking).filter(Booking.id == past_id).first()
    future = db.query(Booking).filter(Booking.id == future_id).first()

    assert master is not None and master.is_deleted is True
    assert master.domain is None
    assert user.full_name == deleted_master_display_name(master_id)
    assert past is not None and past.status == BookingStatus.COMPLETED.value
    assert future is not None
    assert future.status == BookingStatus.CANCELLED.value
    assert future.cancellation_reason == MASTER_ACCOUNT_DELETED_REASON

    from services.account_deletion import is_master_deleted

    assert is_master_deleted(master) is True


def test_client_self_delete_anonymizes_not_hard_delete(client, db):
    u = User(
        email="client_del@test.com",
        hashed_password=get_password_hash("testpassword"),
        phone="+79990003001",
        full_name="Client Del",
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id
    token = create_access_token(data={"sub": str(uid), "role": "CLIENT"})
    headers = {"Authorization": f"Bearer {token}"}
    r = client.request(
        "DELETE",
        "/api/client/account",
        headers=headers,
        json={"password": "testpassword"},
    )
    assert r.status_code == 200, r.text
    db.rollback()
    after = db.query(User).filter(User.id == uid).first()
    assert after is not None
    assert after.is_active is False
    assert after.deleted_at is not None
    assert after.phone is None
    assert after.full_name == f"Удалённый клиент №{uid}"

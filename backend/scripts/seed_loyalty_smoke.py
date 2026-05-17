#!/usr/bin/env python3
"""
Идемпотентный smoke-seed для loyalty / public booking / confirm flow.

Локально:
  python3 backend/scripts/seed_loyalty_smoke.py --local --enable-smoke-seed

Prod/stage smoke:
  python3 backend/scripts/seed_loyalty_smoke.py --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data

Опции:
  --create-past-booking
  --create-active-reserve

Cleanup (dry-run по умолчанию):
  python3 backend/scripts/seed_loyalty_smoke.py --cleanup --enable-smoke-seed --local
  python3 backend/scripts/seed_loyalty_smoke.py --cleanup --enable-smoke-seed --local --yes
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from database import SessionLocal
from models import (
    Booking,
    BookingConfirmation,
    BookingStatus,
    Income,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterSchedule,
    MasterService,
    Service,
    User,
    UserRole,
)
from sqlalchemy import or_
from sqlalchemy.orm import Session

SMOKE_TAG = "LOYALTY_SMOKE_2026_05"
SMOKE_PASSWORD = "test123"

MSK = ZoneInfo("Europe/Moscow")

# Стабильные идентификаторы (не пересекаются с reseed +799900000xx)
DOMAIN_DISABLED = "loyalty-smoke-master"
DOMAIN_ENABLED = "loyalty-smoke-enabled-master"

PHONE_CLIENT_POINTS = "+79990000901"
PHONE_CLIENT_EMPTY = "+79990000900"
PHONE_CLIENT_ENABLED = "+79990000902"

PHONE_MASTER_DISABLED = "+79990000911"
PHONE_MASTER_ENABLED = "+79990000912"

EMAIL_CLIENT_POINTS = f"loyalty-smoke-client.{SMOKE_TAG}@example.com"
EMAIL_CLIENT_EMPTY = f"loyalty-smoke-empty.{SMOKE_TAG}@example.com"
EMAIL_CLIENT_ENABLED = f"loyalty-smoke-enabled-client.{SMOKE_TAG}@example.com"
EMAIL_MASTER_DISABLED = f"loyalty-smoke-master.{SMOKE_TAG}@example.com"
EMAIL_MASTER_ENABLED = f"loyalty-smoke-enabled-master.{SMOKE_TAG}@example.com"

SMOKE_CLIENT_PHONES = (
    PHONE_CLIENT_POINTS,
    PHONE_CLIENT_EMPTY,
    PHONE_CLIENT_ENABLED,
)
SMOKE_MASTER_PHONES = (PHONE_MASTER_DISABLED, PHONE_MASTER_ENABLED)
SMOKE_DOMAINS = (DOMAIN_DISABLED, DOMAIN_ENABLED)

NOTE_PAST = f"{SMOKE_TAG} retro past booking"
NOTE_ACTIVE_RESERVE = f"{SMOKE_TAG} active reserve booking"

SERVICE_NAME = "Стрижка smoke"
SERVICE_PRICE = 1000.0
SERVICE_DURATION = 60
SCHEDULE_DAYS_AHEAD = 14


class AdminProtectionError(RuntimeError):
    """Попытка изменить или удалить ADMIN."""


def _msk_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=MSK)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def log_admins(db: Session) -> List[Tuple[int, str, Optional[str]]]:
    rows = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN)
        .order_by(User.id)
        .all()
    )
    out = []
    print("\n=== ADMIN users (read-only, never modified) ===")
    if not rows:
        print("  (none)")
        return out
    for u in rows:
        out.append((u.id, u.email or "", u.phone))
        print(f"  id={u.id} email={u.email!r} phone={u.phone!r}")
    return out


def _guard_not_admin(user: Optional[User], action: str) -> None:
    if user is None:
        return
    if user.role == UserRole.ADMIN:
        raise AdminProtectionError(
            f"Refusing to {action} user id={user.id} with role=ADMIN "
            f"(email={user.email!r}, phone={user.phone!r})"
        )


def _get_user_by_phone(db: Session, phone: str) -> Optional[User]:
    return db.query(User).filter(User.phone == phone).first()


def _upsert_client(
    db: Session,
    *,
    phone: str,
    email: str,
    full_name: str,
) -> User:
    user = _get_user_by_phone(db, phone)
    if user:
        _guard_not_admin(user, "update")
        if user.role != UserRole.CLIENT:
            raise RuntimeError(
                f"Smoke phone {phone} belongs to user id={user.id} with role={user.role}, expected client"
            )
        user.email = email
        user.full_name = full_name
        user.is_active = True
        user.is_verified = True
        user.hashed_password = get_password_hash(SMOKE_PASSWORD)
        return user
    user = User(
        email=email,
        phone=phone,
        full_name=full_name,
        hashed_password=get_password_hash(SMOKE_PASSWORD),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _upsert_master_user(
    db: Session,
    *,
    phone: str,
    email: str,
    full_name: str,
) -> User:
    user = _get_user_by_phone(db, phone)
    if user:
        _guard_not_admin(user, "update")
        if user.role != UserRole.MASTER:
            raise RuntimeError(
                f"Smoke master phone {phone} belongs to user id={user.id} with role={user.role}"
            )
        user.email = email
        user.full_name = full_name
        user.is_active = True
        user.is_verified = True
        user.hashed_password = get_password_hash(SMOKE_PASSWORD)
        return user
    user = User(
        email=email,
        phone=phone,
        full_name=full_name,
        hashed_password=get_password_hash(SMOKE_PASSWORD),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _upsert_master(
    db: Session,
    *,
    user: User,
    domain: str,
    display_name: str,
) -> Master:
    m = db.query(Master).filter(Master.domain == domain).first()
    if m and m.user_id != user.id:
        other = db.query(User).filter(User.id == m.user_id).first()
        _guard_not_admin(other, "reassign master")
    if not m:
        m = Master(
            user_id=user.id,
            bio=f"{SMOKE_TAG} smoke master",
            experience_years=3,
            domain=domain,
            timezone="Europe/Moscow",
            timezone_confirmed=True,
            city="Москва",
            address=f"Smoke address {SMOKE_TAG}",
            site_description=f"{SMOKE_TAG} public booking smoke",
        )
        db.add(m)
        db.flush()
    else:
        m.user_id = user.id
        m.timezone = "Europe/Moscow"
        m.timezone_confirmed = True
        m.city = "Москва"
        if not (m.site_description and SMOKE_TAG in m.site_description):
            m.site_description = f"{SMOKE_TAG} public booking smoke"
    return m


def _time_add_minutes(t: time, minutes: int) -> time:
    base = datetime.combine(date.min, t) + timedelta(minutes=minutes)
    return base.time()


def _ensure_schedule(db: Session, master_id: int) -> Tuple[int, int]:
    """
    Гранулярные слоты по 30 мин (08:00–20:00 MSK).
    Одна строка MasterSchedule на весь день не даёт bookable-слотов в get_available_slots.
    """
    today = datetime.now(MSK).date()
    end = today + timedelta(days=SCHEDULE_DAYS_AHEAD)
    db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master_id,
        MasterSchedule.salon_id.is_(None),
        MasterSchedule.date >= today,
        MasterSchedule.date <= end,
    ).delete(synchronize_session=False)

    days = 0
    slot_rows = 0
    for i in range(SCHEDULE_DAYS_AHEAD + 1):
        d = today + timedelta(days=i)
        cur = time(8, 0)
        day_end = time(20, 0)
        day_slots = 0
        while cur < day_end:
            slot_end = _time_add_minutes(cur, 30)
            if slot_end > day_end:
                break
            db.add(
                MasterSchedule(
                    master_id=master_id,
                    salon_id=None,
                    date=d,
                    start_time=cur,
                    end_time=slot_end,
                    is_available=True,
                )
            )
            slot_rows += 1
            day_slots += 1
            cur = slot_end
        if day_slots:
            days += 1
    return days, slot_rows


def verify_public_availability(db: Session) -> Dict[str, Any]:
    """Self-check: bookable-слоты через get_available_slots на 15 дней вперёд."""
    from models import OwnerType
    from services.scheduling import get_available_slots

    today = datetime.now(MSK).date()
    out: Dict[str, Any] = {"masters": {}, "any_zero": False}

    for domain in SMOKE_DOMAINS:
        master = db.query(Master).filter(Master.domain == domain).first()
        if not master:
            out["masters"][domain] = {"error": "master not found"}
            out["any_zero"] = True
            continue

        total = 0
        first_date: Optional[str] = None
        sample: List[str] = []
        for i in range(SCHEDULE_DAYS_AHEAD + 1):
            d = today + timedelta(days=i)
            day_dt = datetime.combine(d, time(12, 0))
            slots = get_available_slots(
                db, OwnerType.MASTER, master.id, day_dt, SERVICE_DURATION
            )
            if slots:
                if first_date is None:
                    first_date = d.isoformat()
                total += len(slots)
                if len(sample) < 3:
                    for s in slots[: 3 - len(sample)]:
                        st = s.get("start_time")
                        if hasattr(st, "strftime"):
                            sample.append(st.strftime("%H:%M"))
                        else:
                            sample.append(str(st))

        entry = {
            "master_id": master.id,
            "slots_count_next_14_days": total,
            "first_available_date": first_date,
            "sample_slots": sample,
        }
        out["masters"][domain] = entry
        if total == 0:
            out["any_zero"] = True

    return out


def run_loyalty_public_smoke_reseed(
    *,
    with_past_booking: bool = False,
    with_active_reserve: bool = False,
    fail_on_zero_slots: bool = True,
) -> Dict[str, Any]:
    """
    Вызывается из reseed_local_test_data (шаг 7e) после API-reseed.
    Требует доступ к той же БД, что и backend.
    """
    db = SessionLocal()
    try:
        log_admins(db)
        report = seed_core(db)
        if with_past_booking:
            create_past_booking(db)
        if with_active_reserve:
            create_active_reserve_booking(db)
        avail = verify_public_availability(db)
        print("\n--- 7e) Loyalty public smoke (+799900009xx) ---")
        print(f"  tag={SMOKE_TAG} password={SMOKE_PASSWORD}")
        for domain, info in avail.get("masters", {}).items():
            print(
                f"  {domain}: slots={info.get('slots_count_next_14_days')} "
                f"first_date={info.get('first_available_date')} "
                f"sample={info.get('sample_slots')}"
            )
        if fail_on_zero_slots and avail.get("any_zero"):
            raise RuntimeError(
                "Loyalty public smoke: нет доступных слотов на 14 дней — "
                "проверьте MasterSchedule (нужны 30-мин строки). "
                f"details={avail}"
            )
        print_seed_report(db, report)
        return {"report": report, "availability": avail}
    finally:
        db.close()


def _ensure_master_service(db: Session, master_id: int) -> MasterService:
    ms = (
        db.query(MasterService)
        .filter(MasterService.master_id == master_id, MasterService.name == SERVICE_NAME)
        .first()
    )
    if ms:
        ms.duration = SERVICE_DURATION
        ms.price = SERVICE_PRICE
        return ms
    ms = MasterService(
        master_id=master_id,
        category_id=None,
        name=SERVICE_NAME,
        duration=SERVICE_DURATION,
        price=SERVICE_PRICE,
    )
    db.add(ms)
    db.flush()
    return ms


def _ensure_canonical_service(db: Session, ms: MasterService) -> Service:
    svc = (
        db.query(Service)
        .filter(
            Service.salon_id.is_(None),
            Service.indie_master_id.is_(None),
            Service.name == ms.name,
            Service.duration == ms.duration,
            Service.price == ms.price,
        )
        .first()
    )
    if svc:
        return svc
    svc = Service(
        name=ms.name,
        duration=ms.duration,
        price=ms.price,
        salon_id=None,
        indie_master_id=None,
    )
    db.add(svc)
    db.flush()
    return svc


def _upsert_loyalty_settings(
    db: Session,
    master_id: int,
    *,
    is_enabled: bool,
    max_payment_percent: Optional[int],
    accrual_percent: Optional[int],
) -> LoyaltySettings:
    ls = db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master_id).first()
    if not ls:
        ls = LoyaltySettings(master_id=master_id)
        db.add(ls)
    ls.is_enabled = is_enabled
    ls.max_payment_percent = max_payment_percent
    ls.accrual_percent = accrual_percent
    ls.points_lifetime_days = None
    return ls


def _set_earned_points(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    points: int,
) -> None:
    """Один smoke earned-транзак на пару master/client (без spent)."""
    spent = (
        db.query(LoyaltyTransaction)
        .filter(
            LoyaltyTransaction.master_id == master_id,
            LoyaltyTransaction.client_id == client_id,
            LoyaltyTransaction.transaction_type == "spent",
        )
        .count()
    )
    if spent:
        raise RuntimeError(
            f"Refusing to reset earned: client {client_id} already has spent at master {master_id}"
        )
    db.query(LoyaltyTransaction).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.client_id == client_id,
        LoyaltyTransaction.transaction_type == "earned",
        LoyaltyTransaction.source == SMOKE_TAG,
    ).delete(synchronize_session=False)
    if points <= 0:
        return
    db.add(
        LoyaltyTransaction(
            master_id=master_id,
            client_id=client_id,
            booking_id=None,
            transaction_type="earned",
            points=points,
            earned_at=datetime.utcnow(),
            expires_at=None,
            service_id=None,
            source=SMOKE_TAG,
        )
    )


def _find_smoke_booking(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    notes: str,
) -> Optional[Booking]:
    return (
        db.query(Booking)
        .filter(
            Booking.master_id == master_id,
            Booking.client_id == client_id,
            Booking.notes == notes,
        )
        .first()
    )


def _create_smoke_booking(
    db: Session,
    *,
    master_id: int,
    client_id: int,
    service_id: int,
    start_time: datetime,
    end_time: datetime,
    payment_amount: float,
    loyalty_points_used: int,
    status: str,
    notes: str,
) -> Booking:
    b = Booking(
        client_id=client_id,
        service_id=service_id,
        master_id=master_id,
        indie_master_id=None,
        salon_id=None,
        start_time=start_time,
        end_time=end_time,
        status=status,
        payment_amount=payment_amount,
        loyalty_points_used=loyalty_points_used,
        notes=notes,
    )
    db.add(b)
    db.flush()
    return b


def seed_core(db: Session) -> Dict[str, Any]:
    report: Dict[str, Any] = {"smoke_tag": SMOKE_TAG, "entities": {}}

    client_pts = _upsert_client(
        db,
        phone=PHONE_CLIENT_POINTS,
        email=EMAIL_CLIENT_POINTS,
        full_name="Клиент Loyalty Smoke (баллы)",
    )
    client_empty = _upsert_client(
        db,
        phone=PHONE_CLIENT_EMPTY,
        email=EMAIL_CLIENT_EMPTY,
        full_name="Клиент Loyalty Smoke (пусто)",
    )
    client_en = _upsert_client(
        db,
        phone=PHONE_CLIENT_ENABLED,
        email=EMAIL_CLIENT_ENABLED,
        full_name="Клиент Loyalty Smoke (enabled master)",
    )

    mu_dis = _upsert_master_user(
        db,
        phone=PHONE_MASTER_DISABLED,
        email=EMAIL_MASTER_DISABLED,
        full_name="Мастер Loyalty Smoke",
    )
    master_dis = _upsert_master(
        db, user=mu_dis, domain=DOMAIN_DISABLED, display_name="Мастер Loyalty Smoke"
    )
    sched_dis_days, sched_dis_slots = _ensure_schedule(db, master_dis.id)
    ms_dis = _ensure_master_service(db, master_dis.id)
    svc_dis = _ensure_canonical_service(db, ms_dis)
    _upsert_loyalty_settings(
        db, master_dis.id, is_enabled=False, max_payment_percent=None, accrual_percent=10
    )
    _set_earned_points(db, master_id=master_dis.id, client_id=client_pts.id, points=100)

    mu_en = _upsert_master_user(
        db,
        phone=PHONE_MASTER_ENABLED,
        email=EMAIL_MASTER_ENABLED,
        full_name="Мастер Loyalty Smoke Enabled",
    )
    master_en = _upsert_master(
        db, user=mu_en, domain=DOMAIN_ENABLED, display_name="Мастер Loyalty Smoke Enabled"
    )
    sched_en_days, sched_en_slots = _ensure_schedule(db, master_en.id)
    ms_en = _ensure_master_service(db, master_en.id)
    svc_en = _ensure_canonical_service(db, ms_en)
    _upsert_loyalty_settings(
        db, master_en.id, is_enabled=True, max_payment_percent=50, accrual_percent=10
    )
    _set_earned_points(db, master_id=master_en.id, client_id=client_en.id, points=800)

    db.commit()

    report["entities"] = {
        "disabled_master": {
            "domain": DOMAIN_DISABLED,
            "master_id": master_dis.id,
            "master_service_id": ms_dis.id,
            "service_id": svc_dis.id,
            "schedule_days_ensured": sched_dis_days,
            "schedule_slot_rows": sched_dis_slots,
            "login_phone": PHONE_MASTER_DISABLED,
        },
        "enabled_master": {
            "domain": DOMAIN_ENABLED,
            "master_id": master_en.id,
            "master_service_id": ms_en.id,
            "service_id": svc_en.id,
            "schedule_days_ensured": sched_en_days,
            "schedule_slot_rows": sched_en_slots,
            "login_phone": PHONE_MASTER_ENABLED,
        },
        "client_with_points": {
            "phone": PHONE_CLIENT_POINTS,
            "client_id": client_pts.id,
            "points": 100,
        },
        "client_empty": {"phone": PHONE_CLIENT_EMPTY, "client_id": client_empty.id},
        "client_enabled_master": {
            "phone": PHONE_CLIENT_ENABLED,
            "client_id": client_en.id,
            "points": 800,
        },
        "password": SMOKE_PASSWORD,
        "public_urls": {
            "disabled": f"/m/{DOMAIN_DISABLED}",
            "enabled": f"/m/{DOMAIN_ENABLED}",
        },
    }
    return report


def create_past_booking(db: Session) -> Dict[str, Any]:
    master = db.query(Master).filter(Master.domain == DOMAIN_DISABLED).first()
    client = _get_user_by_phone(db, PHONE_CLIENT_POINTS)
    if not master or not client:
        raise RuntimeError("Run seed first: disabled master or client with points not found")

    existing = _find_smoke_booking(
        db, master_id=master.id, client_id=client.id, notes=NOTE_PAST
    )
    if existing:
        return {
            "created": False,
            "booking_id": existing.id,
            "loyalty_points_used": int(existing.loyalty_points_used or 0),
            "message": "Past smoke booking already exists",
        }

    ms = _ensure_master_service(db, master.id)
    svc = _ensure_canonical_service(db, ms)
    yesterday = datetime.now(MSK).date() - timedelta(days=1)
    start = _msk_naive_utc(datetime.combine(yesterday, time(10, 0), tzinfo=MSK))
    end = _msk_naive_utc(datetime.combine(yesterday, time(11, 0), tzinfo=MSK))

    b = _create_smoke_booking(
        db,
        master_id=master.id,
        client_id=client.id,
        service_id=svc.id,
        start_time=start,
        end_time=end,
        payment_amount=SERVICE_PRICE,
        loyalty_points_used=100,
        status=BookingStatus.CREATED.value,
        notes=NOTE_PAST,
    )
    db.commit()
    return {
        "created": True,
        "booking_id": b.id,
        "loyalty_points_used": 100,
        "start_time": start.isoformat(),
        "status": b.status,
    }


def create_active_reserve_booking(db: Session) -> Dict[str, Any]:
    master = db.query(Master).filter(Master.domain == DOMAIN_DISABLED).first()
    client = _get_user_by_phone(db, PHONE_CLIENT_POINTS)
    if not master or not client:
        raise RuntimeError("Run seed first: disabled master or client with points not found")

    existing = _find_smoke_booking(
        db, master_id=master.id, client_id=client.id, notes=NOTE_ACTIVE_RESERVE
    )
    if existing:
        return {
            "created": False,
            "booking_id": existing.id,
            "loyalty_points_used": int(existing.loyalty_points_used or 0),
            "message": "Active reserve smoke booking already exists",
        }

    ms = _ensure_master_service(db, master.id)
    svc = _ensure_canonical_service(db, ms)
    day = datetime.now(MSK).date() + timedelta(days=3)
    start = _msk_naive_utc(datetime.combine(day, time(12, 0), tzinfo=MSK))
    end = _msk_naive_utc(datetime.combine(day, time(13, 0), tzinfo=MSK))

    b = _create_smoke_booking(
        db,
        master_id=master.id,
        client_id=client.id,
        service_id=svc.id,
        start_time=start,
        end_time=end,
        payment_amount=SERVICE_PRICE,
        loyalty_points_used=100,
        status=BookingStatus.CREATED.value,
        notes=NOTE_ACTIVE_RESERVE,
    )
    db.commit()
    return {
        "created": True,
        "booking_id": b.id,
        "loyalty_points_used": 100,
        "start_time": start.isoformat(),
        "status": b.status,
    }


def _smoke_master_ids(db: Session) -> List[int]:
    return [m.id for m in db.query(Master).filter(Master.domain.in_(SMOKE_DOMAINS)).all()]


def _smoke_booking_ids(db: Session) -> List[int]:
    return [
        b.id
        for b in db.query(Booking)
        .filter(Booking.notes.isnot(None), Booking.notes.contains(SMOKE_TAG))
        .all()
    ]


def _collect_cleanup_plan(db: Session) -> Dict[str, List[int]]:
    master_ids = _smoke_master_ids(db)
    booking_ids = _smoke_booking_ids(db)

    tx_filters = [LoyaltyTransaction.source == SMOKE_TAG]
    if booking_ids:
        tx_filters.append(LoyaltyTransaction.booking_id.in_(booking_ids))
    loyalty_tx_ids = [
        t.id for t in db.query(LoyaltyTransaction).filter(or_(*tx_filters)).all()
    ]

    confirmation_ids = []
    income_ids = []
    if booking_ids:
        confirmation_ids = [
            c.id
            for c in db.query(BookingConfirmation)
            .filter(BookingConfirmation.booking_id.in_(booking_ids))
            .all()
        ]
        income_ids = [
            i.id for i in db.query(Income).filter(Income.booking_id.in_(booking_ids)).all()
        ]

    schedule_ids = []
    ms_ids = []
    ls_ids = []
    if master_ids:
        schedule_ids = [
            s.id
            for s in db.query(MasterSchedule)
            .filter(MasterSchedule.master_id.in_(master_ids))
            .all()
        ]
        ms_ids = [
            s.id
            for s in db.query(MasterService)
            .filter(MasterService.master_id.in_(master_ids))
            .all()
        ]
        ls_ids = [
            s.id
            for s in db.query(LoyaltySettings)
            .filter(LoyaltySettings.master_id.in_(master_ids))
            .all()
        ]

    user_ids: List[int] = []
    for phone in list(SMOKE_CLIENT_PHONES) + list(SMOKE_MASTER_PHONES):
        u = _get_user_by_phone(db, phone)
        if u:
            _guard_not_admin(u, "delete in cleanup plan")
            user_ids.append(u.id)

    return {
        "booking_confirmations": confirmation_ids,
        "incomes": income_ids,
        "loyalty_transactions": loyalty_tx_ids,
        "bookings": booking_ids,
        "loyalty_settings": ls_ids,
        "master_schedules": schedule_ids,
        "master_services": ms_ids,
        "masters": master_ids,
        "users": sorted(set(user_ids)),
    }


def cleanup_smoke(db: Session, *, dry_run: bool = True) -> Dict[str, Any]:
    plan = _collect_cleanup_plan(db)
    print("\n=== Cleanup plan (smoke-tagged only) ===")
    for key, ids in plan.items():
        print(f"  {key}: {len(ids)}")
        if ids and len(ids) <= 20:
            print(f"    ids={ids}")

    if dry_run:
        print("\nDry-run: no rows deleted. Pass --yes to execute.")
        return {"dry_run": True, "plan": {k: len(v) for k, v in plan.items()}}

    # Delete children first
    if plan["booking_confirmations"]:
        db.query(BookingConfirmation).filter(
            BookingConfirmation.id.in_(plan["booking_confirmations"])
        ).delete(synchronize_session=False)
    if plan["incomes"]:
        db.query(Income).filter(Income.id.in_(plan["incomes"])).delete(synchronize_session=False)
    if plan["loyalty_transactions"]:
        db.query(LoyaltyTransaction).filter(
            LoyaltyTransaction.id.in_(plan["loyalty_transactions"])
        ).delete(synchronize_session=False)
    if plan["bookings"]:
        db.query(Booking).filter(Booking.id.in_(plan["bookings"])).delete(synchronize_session=False)
    if plan["loyalty_settings"]:
        db.query(LoyaltySettings).filter(
            LoyaltySettings.id.in_(plan["loyalty_settings"])
        ).delete(synchronize_session=False)
    if plan["master_schedules"]:
        db.query(MasterSchedule).filter(
            MasterSchedule.id.in_(plan["master_schedules"])
        ).delete(synchronize_session=False)
    if plan["master_services"]:
        db.query(MasterService).filter(
            MasterService.id.in_(plan["master_services"])
        ).delete(synchronize_session=False)
    if plan["masters"]:
        db.query(Master).filter(Master.id.in_(plan["masters"])).delete(synchronize_session=False)
    for uid in plan["users"]:
        u = db.query(User).filter(User.id == uid).first()
        _guard_not_admin(u, "delete")
        db.query(User).filter(User.id == uid).delete(synchronize_session=False)

    db.commit()
    print("\nCleanup completed.")
    return {"dry_run": False, "deleted": {k: len(v) for k, v in plan.items()}}


def print_seed_report(db: Session, seed_report: Dict[str, Any]) -> None:
    from utils.public_booking_loyalty import effective_available_points

    print("\n=== Smoke seed report ===")
    print(f"  tag: {SMOKE_TAG}")
    print(f"  password (clients/masters): {SMOKE_PASSWORD}")
    for label, path in seed_report["entities"]["public_urls"].items():
        slug = path.replace("/m/", "")
        print(f"  URL {label}: http://localhost:5173/m/{slug}")

    master = db.query(Master).filter(Master.domain == DOMAIN_DISABLED).first()
    client = _get_user_by_phone(db, PHONE_CLIENT_POINTS)
    if master and client:
        eff = effective_available_points(db, master_id=master.id, client_id=client.id)
        print(
            f"  client {PHONE_CLIENT_POINTS} @ {DOMAIN_DISABLED}: effective_available_points={eff}"
        )


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Loyalty smoke seed (safe, tagged, idempotent)")
    p.add_argument("--enable-smoke-seed", action="store_true", help="Required to change data")
    p.add_argument("--local", action="store_true", help="Local/dev run mode")
    p.add_argument("--prod-smoke", action="store_true", help="Stage/prod smoke run mode")
    p.add_argument(
        "--i-understand-this-writes-smoke-data",
        action="store_true",
        help="Required with --prod-smoke",
    )
    p.add_argument("--cleanup", action="store_true", help="Remove smoke-tagged data only")
    p.add_argument(
        "--yes",
        action="store_true",
        help="Execute cleanup (default: dry-run)",
    )
    p.add_argument(
        "--create-past-booking",
        action="store_true",
        help="Create past booking for confirm flow (disabled master)",
    )
    p.add_argument(
        "--create-active-reserve",
        action="store_true",
        help="Create future booking with loyalty reserve",
    )
    return p.parse_args(argv)


def validate_args(args: argparse.Namespace) -> None:
    if not args.enable_smoke_seed:
        print("No-op: pass --enable-smoke-seed to run seed or cleanup.")
        sys.exit(0)

    if args.cleanup:
        if not (args.local or args.prod_smoke):
            print("Cleanup requires --local or --prod-smoke", file=sys.stderr)
            sys.exit(2)
        if args.prod_smoke and not args.i_understand_this_writes_smoke_data:
            print(
                "Prod/stage cleanup requires --i-understand-this-writes-smoke-data",
                file=sys.stderr,
            )
            sys.exit(2)
        return

    if not (args.local or args.prod_smoke):
        print("Seed requires --local or --prod-smoke", file=sys.stderr)
        sys.exit(2)
    if args.prod_smoke and not args.i_understand_this_writes_smoke_data:
        print(
            "Prod/stage seed requires --i-understand-this-writes-smoke-data",
            file=sys.stderr,
        )
        sys.exit(2)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    validate_args(args)

    db = SessionLocal()
    try:
        log_admins(db)

        if args.cleanup:
            cleanup_smoke(db, dry_run=not args.yes)
            return 0

        report = seed_core(db)
        print("\n=== Core seed OK ===")
        for k, v in report["entities"].items():
            if isinstance(v, dict):
                print(f"  {k}: {v}")

        if args.create_past_booking:
            past = create_past_booking(db)
            print("\n=== Past booking ===")
            print(f"  {past}")

        if args.create_active_reserve:
            res = create_active_reserve_booking(db)
            print("\n=== Active reserve booking ===")
            print(f"  {res}")

        avail = verify_public_availability(db)
        print("\n=== Availability self-check ===")
        for domain, info in avail.get("masters", {}).items():
            print(
                f"  {domain}: slots={info.get('slots_count_next_14_days')} "
                f"first={info.get('first_available_date')} sample={info.get('sample_slots')}"
            )
        if avail.get("any_zero"):
            print(
                "\n[FAIL] Нет bookable-слотов — проверьте MasterSchedule (30-мин строки).",
                file=sys.stderr,
            )
            return 1

        print_seed_report(db, report)
        return 0
    except AdminProtectionError as e:
        db.rollback()
        print(f"ABORT: {e}", file=sys.stderr)
        return 1
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())

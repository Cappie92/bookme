#!/usr/bin/env python3
"""
Prod-safe idempotent smoke dataset for mobile stats/finance testing.

Local:
  python3 backend/scripts/reseed_prod_stats_smoke.py --local --enable-smoke-seed

Prod (inside backend container):
  python3 scripts/reseed_prod_stats_smoke.py \\
    --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data

Dry-run (plan only):
  python3 backend/scripts/reseed_prod_stats_smoke.py --local --dry-run

Only touches entities tagged stats-smoke-* / +79990000990 / +79990001001–12.

Finance screen reads confirmed income from booking_confirmations (master_id = users.id,
confirmed_income, confirmed_at). Each completed smoke booking must have a BookingConfirmation row.
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from constants import duration_months_to_days
from database import SQLALCHEMY_DATABASE_URL, SessionLocal
from models import (
    BalanceTransaction,
    Booking,
    BookingStatus,
    DailyChargeStatus,
    DailySubscriptionCharge,
    Income,
    BookingConfirmation,
    Master,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    Payment,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionReservation,
    SubscriptionStatus,
    SubscriptionType,
    TransactionType,
    User,
    UserBalance,
    UserRole,
    master_services,
)
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session
from utils.balance_utils import (
    deposit_balance,
    get_or_create_user_balance,
    get_user_available_balance,
    get_user_reserved_total,
    move_available_to_reserve,
    withdraw_balance,
)

SMOKE_TAG = "STATS_SMOKE_2026_05"
SMOKE_PASSWORD = "test123"

EMAIL_MASTER = "stats-smoke-master@example.com"
PHONE_MASTER = "+79990000990"
DOMAIN_MASTER = "stats-smoke-master"
FULL_NAME_MASTER = "Мастер Stats Smoke"

CLIENT_COUNT = 12
CLIENT_EMAIL_PREFIX = "stats-smoke-client-"
CLIENT_EMAIL_SUFFIX = "@example.com"
CLIENT_PHONE_BASE = 79990001001

MSK = ZoneInfo("Europe/Moscow")
INITIAL_BALANCE_RUB = 50_000.0
SUBSCRIPTION_DURATION_MONTHS = 6
PREMIUM_PLAN_NAME = "Premium"

CATEGORIES = ("Стрижки", "Окрашивание", "Уход/укладка")
SERVICES_SPEC: Tuple[Tuple[str, str, float, int], ...] = (
    ("Стрижки", "Стрижка мужская", 1000.0, 30),
    ("Стрижки", "Стрижка женская", 1800.0, 60),
    ("Окрашивание", "Окрашивание корни", 2500.0, 90),
    ("Окрашивание", "Окрашивание полное", 4200.0, 120),
    ("Уход/укладка", "Укладка", 1500.0, 45),
)

CLIENT_NAMES: Tuple[str, ...] = (
    "Анна Петрова",
    "Иван Сидоров",
    "Мария Козлова",
    "Дмитрий Волков",
    "Елена Смирнова",
    "Алексей Новиков",
    "Ольга Морозова",
    "Сергей Лебедев",
    "Татьяна Кузнецова",
    "Николай Орлов",
    "Юлия Фёдорова",
    "Павел Соколов",
)


class AdminProtectionError(RuntimeError):
    pass


@dataclass
class ServiceBundle:
    master_service: MasterService
    service: Service
    category_name: str
    name: str
    price: float
    duration: int


def _msk_naive_utc(day: date, hour: int, minute: int = 0) -> datetime:
    dt = datetime.combine(day, time(hour, minute), tzinfo=MSK)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _client_email(i: int) -> str:
    return f"{CLIENT_EMAIL_PREFIX}{i:02d}{CLIENT_EMAIL_SUFFIX}"


def _client_phone(i: int) -> str:
    return f"+{CLIENT_PHONE_BASE + i - 1}"


def _smoke_emails() -> List[str]:
    return [EMAIL_MASTER] + [_client_email(i) for i in range(1, CLIENT_COUNT + 1)]


def _smoke_phones() -> List[str]:
    return [PHONE_MASTER] + [_client_phone(i) for i in range(1, CLIENT_COUNT + 1)]


def _guard_not_admin(user: Optional[User], action: str) -> None:
    if user is not None and user.role == UserRole.ADMIN:
        raise AdminProtectionError(
            f"Refusing to {action} ADMIN user id={user.id} email={user.email!r} phone={user.phone!r}"
        )


def _sqlite_db_path() -> Optional[Path]:
    url = (SQLALCHEMY_DATABASE_URL or "").strip()
    if not url.startswith("sqlite"):
        return None
    raw = url.replace("sqlite:///", "", 1)
    if raw.startswith("/"):
        return Path(raw)
    return Path(__file__).resolve().parent.parent / raw


def backup_sqlite_db() -> Optional[Path]:
    src = _sqlite_db_path()
    if src is None or not src.exists():
        print(f"WARN: SQLite backup skipped (path={src})")
        return None
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = Path(f"/data/bookme.backup_before_stats_smoke_{ts}.db")
    if not dest.parent.exists():
        dest = src.parent / f"bookme.backup_before_stats_smoke_{ts}.db"
    shutil.copy2(src, dest)
    print(f"SQLite backup: {src} -> {dest}")
    return dest


def _find_smoke_users(db: Session) -> List[User]:
    emails = _smoke_emails()
    phones = _smoke_phones()
    rows = (
        db.query(User)
        .filter(or_(User.email.in_(emails), User.phone.in_(phones)))
        .all()
    )
    out: List[User] = []
    for u in rows:
        _guard_not_admin(u, "modify in cleanup")
        out.append(u)
    return out


def _find_smoke_master(db: Session) -> Optional[Master]:
    return db.query(Master).filter(Master.domain == DOMAIN_MASTER).first()


def collect_cleanup_plan(db: Session) -> Dict[str, Any]:
    users = _find_smoke_users(db)
    user_ids = [u.id for u in users]
    master = _find_smoke_master(db)
    master_ids = [master.id] if master else []

    booking_ids: List[int] = []
    if master_ids:
        booking_ids = [
            row[0]
            for row in db.query(Booking.id)
            .filter(
                Booking.master_id.in_(master_ids),
                or_(
                    Booking.notes.contains(SMOKE_TAG),
                    Booking.notes.contains("stats-smoke"),
                ),
            )
            .all()
        ]

    income_ids: List[int] = []
    confirmation_ids: List[int] = []
    if booking_ids:
        income_ids = [i.id for i in db.query(Income).filter(Income.booking_id.in_(booking_ids)).all()]
        confirmation_ids = [
            c.id
            for c in db.query(BookingConfirmation)
            .filter(BookingConfirmation.booking_id.in_(booking_ids))
            .all()
        ]

    service_ids: List[int] = []
    if master_ids:
        service_ids = [
            row[0]
            for row in db.query(master_services.c.service_id)
            .filter(master_services.c.master_id.in_(master_ids))
            .all()
        ]
        tagged = [
            s.id
            for s in db.query(Service)
            .filter(Service.description.isnot(None), Service.description.contains(SMOKE_TAG))
            .all()
        ]
        service_ids = sorted(set(service_ids + tagged))

    sub_ids: List[int] = []
    payment_ids: List[int] = []
    snapshot_ids: List[int] = []
    balance_tx_ids: List[int] = []
    if user_ids:
        sub_ids = [s.id for s in db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()]
        payment_ids = [
            p.id
            for p in db.query(Payment)
            .filter(
                Payment.user_id.in_(user_ids),
                Payment.robokassa_invoice_id.like("stats-smoke-%"),
            )
            .all()
        ]
        snapshot_ids = [
            s.id for s in db.query(SubscriptionPriceSnapshot).filter(SubscriptionPriceSnapshot.user_id.in_(user_ids)).all()
        ]
        balance_tx_ids = [
            t.id
            for t in db.query(BalanceTransaction)
            .filter(
                BalanceTransaction.user_id.in_(user_ids),
                or_(
                    BalanceTransaction.description.contains(SMOKE_TAG),
                    BalanceTransaction.description.contains("stats-smoke"),
                ),
            )
            .all()
        ]

    schedule_ids: List[int] = []
    ms_ids: List[int] = []
    cat_ids: List[int] = []
    if master_ids:
        schedule_ids = [s.id for s in db.query(MasterSchedule).filter(MasterSchedule.master_id.in_(master_ids)).all()]
        ms_ids = [s.id for s in db.query(MasterService).filter(MasterService.master_id.in_(master_ids)).all()]
        cat_ids = [c.id for c in db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id.in_(master_ids)).all()]

    reservation_ids: List[int] = []
    daily_charge_ids: List[int] = []
    if sub_ids:
        reservation_ids = [
            r.id for r in db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id.in_(sub_ids)).all()
        ]
        # Только charges smoke-подписок (sub_ids), не трогаем чужие subscription_id.
        daily_charge_ids = [
            c.id
            for c in db.query(DailySubscriptionCharge)
            .filter(DailySubscriptionCharge.subscription_id.in_(sub_ids))
            .all()
        ]

    return {
        "users": user_ids,
        "masters": master_ids,
        "bookings": booking_ids,
        "booking_confirmations": confirmation_ids,
        "incomes": income_ids,
        "services": service_ids,
        "master_services": ms_ids,
        "master_service_categories": cat_ids,
        "master_schedules": schedule_ids,
        "daily_subscription_charges": daily_charge_ids,
        "subscriptions": sub_ids,
        "subscription_reservations": reservation_ids,
        "payments": payment_ids,
        "subscription_price_snapshots": snapshot_ids,
        "balance_transactions": balance_tx_ids,
    }


def print_cleanup_plan(plan: Dict[str, Any]) -> None:
    print("\n=== Cleanup plan (stats-smoke only) ===")
    for key, ids in plan.items():
        n = len(ids) if isinstance(ids, list) else ids
        print(f"  {key}: {n}")
        if key == "daily_subscription_charges" and isinstance(ids, list) and ids:
            print(f"    ids={ids}")
        elif isinstance(ids, list) and ids and len(ids) <= 15:
            print(f"    ids={ids}")


def cleanup_smoke_data(db: Session) -> None:
    plan = collect_cleanup_plan(db)

    if plan["booking_confirmations"]:
        db.query(BookingConfirmation).filter(
            BookingConfirmation.id.in_(plan["booking_confirmations"])
        ).delete(synchronize_session=False)
    if plan["incomes"]:
        db.query(Income).filter(Income.id.in_(plan["incomes"])).delete(synchronize_session=False)
    if plan["bookings"]:
        db.query(Booking).filter(Booking.id.in_(plan["bookings"])).delete(synchronize_session=False)
    if plan["balance_transactions"]:
        db.query(BalanceTransaction).filter(BalanceTransaction.id.in_(plan["balance_transactions"])).delete(
            synchronize_session=False
        )
    if plan["payments"]:
        db.query(Payment).filter(Payment.id.in_(plan["payments"])).delete(synchronize_session=False)
    if plan["daily_subscription_charges"]:
        db.query(DailySubscriptionCharge).filter(
            DailySubscriptionCharge.id.in_(plan["daily_subscription_charges"])
        ).delete(synchronize_session=False)
    if plan["subscription_reservations"]:
        db.query(SubscriptionReservation).filter(SubscriptionReservation.id.in_(plan["subscription_reservations"])).delete(
            synchronize_session=False
        )
    if plan["subscription_price_snapshots"]:
        db.query(SubscriptionPriceSnapshot).filter(SubscriptionPriceSnapshot.id.in_(plan["subscription_price_snapshots"])).delete(
            synchronize_session=False
        )
    if plan["subscriptions"]:
        db.query(Subscription).filter(Subscription.id.in_(plan["subscriptions"])).delete(synchronize_session=False)
    if plan["master_schedules"]:
        db.query(MasterSchedule).filter(MasterSchedule.id.in_(plan["master_schedules"])).delete(synchronize_session=False)
    if plan["master_services"]:
        db.query(MasterService).filter(MasterService.id.in_(plan["master_services"])).delete(synchronize_session=False)
    if plan["master_service_categories"]:
        db.query(MasterServiceCategory).filter(MasterServiceCategory.id.in_(plan["master_service_categories"])).delete(
            synchronize_session=False
        )
    if plan["masters"] and plan["services"]:
        db.execute(
            master_services.delete().where(
                master_services.c.master_id.in_(plan["masters"]),
                master_services.c.service_id.in_(plan["services"]),
            )
        )
    if plan["services"]:
        db.query(Service).filter(Service.id.in_(plan["services"])).delete(synchronize_session=False)
    if plan["masters"]:
        db.query(Master).filter(Master.id.in_(plan["masters"])).delete(synchronize_session=False)
    for uid in plan["users"]:
        db.query(UserBalance).filter(UserBalance.user_id == uid).delete(synchronize_session=False)
        db.query(User).filter(User.id == uid).delete(synchronize_session=False)


def _upsert_master_user(db: Session) -> User:
    user = db.query(User).filter(or_(User.email == EMAIL_MASTER, User.phone == PHONE_MASTER)).first()
    if user:
        _guard_not_admin(user, "update")
        if user.role != UserRole.MASTER:
            raise RuntimeError(f"{PHONE_MASTER} belongs to role={user.role}, expected master")
        user.email = EMAIL_MASTER
        user.phone = PHONE_MASTER
        user.full_name = FULL_NAME_MASTER
        user.hashed_password = get_password_hash(SMOKE_PASSWORD)
        user.is_active = True
        user.is_verified = True
        user.is_phone_verified = True
        return user
    user = User(
        email=EMAIL_MASTER,
        phone=PHONE_MASTER,
        full_name=FULL_NAME_MASTER,
        hashed_password=get_password_hash(SMOKE_PASSWORD),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _upsert_master_profile(db: Session, user: User) -> Master:
    master = db.query(Master).filter(Master.domain == DOMAIN_MASTER).first()
    if master and master.user_id != user.id:
        other = db.query(User).filter(User.id == master.user_id).first()
        _guard_not_admin(other, "reassign domain")
    if not master:
        master = Master(user_id=user.id, domain=DOMAIN_MASTER)
        db.add(master)
        db.flush()
    master.user_id = user.id
    master.domain = DOMAIN_MASTER
    master.bio = f"{SMOKE_TAG} stats/finance smoke master"
    master.experience_years = 5
    master.can_work_independently = True
    master.can_work_in_salon = True
    master.auto_confirm_bookings = False
    master.city = "Москва"
    master.timezone = "Europe/Moscow"
    master.timezone_confirmed = True
    master.address = "г. Москва, ул. Smoke Stats, д. 1"
    master.site_description = f"{SMOKE_TAG} mobile stats smoke"
    return master


def _upsert_client(db: Session, index: int) -> User:
    email = _client_email(index)
    phone = _client_phone(index)
    name = CLIENT_NAMES[index - 1]
    user = db.query(User).filter(or_(User.email == email, User.phone == phone)).first()
    if user:
        _guard_not_admin(user, "update client")
        if user.role != UserRole.CLIENT:
            raise RuntimeError(f"{phone} is role={user.role}, expected client")
        user.email = email
        user.phone = phone
        user.full_name = name
        user.hashed_password = get_password_hash(SMOKE_PASSWORD)
        user.is_active = True
        user.is_verified = True
        return user
    user = User(
        email=email,
        phone=phone,
        full_name=name,
        hashed_password=get_password_hash(SMOKE_PASSWORD),
        role=UserRole.CLIENT,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _ensure_categories_and_services(db: Session, master: Master) -> List[ServiceBundle]:
    cat_by_name: Dict[str, MasterServiceCategory] = {}
    for cname in CATEGORIES:
        cat = (
            db.query(MasterServiceCategory)
            .filter(MasterServiceCategory.master_id == master.id, MasterServiceCategory.name == cname)
            .first()
        )
        if not cat:
            cat = MasterServiceCategory(master_id=master.id, name=cname)
            db.add(cat)
            db.flush()
        cat_by_name[cname] = cat

    bundles: List[ServiceBundle] = []
    for cat_name, svc_name, price, duration in SERVICES_SPEC:
        ms = (
            db.query(MasterService)
            .filter(MasterService.master_id == master.id, MasterService.name == svc_name)
            .first()
        )
        if not ms:
            ms = MasterService(
                master_id=master.id,
                category_id=cat_by_name[cat_name].id,
                name=svc_name,
                price=price,
                duration=duration,
                description=f"{SMOKE_TAG} service",
            )
            db.add(ms)
            db.flush()
        else:
            ms.category_id = cat_by_name[cat_name].id
            ms.price = price
            ms.duration = duration

        svc = (
            db.query(Service)
            .filter(
                Service.name == svc_name,
                Service.salon_id.is_(None),
                Service.indie_master_id.is_(None),
            )
            .first()
        )
        if not svc:
            svc = Service(
                name=svc_name,
                duration=duration,
                price=price,
                salon_id=None,
                indie_master_id=None,
                description=f"{SMOKE_TAG} canonical service",
            )
            db.add(svc)
            db.flush()
        else:
            svc.duration = duration
            svc.price = price
            svc.description = f"{SMOKE_TAG} canonical service"

        linked = (
            db.query(master_services)
            .filter(master_services.c.master_id == master.id, master_services.c.service_id == svc.id)
            .first()
        )
        if not linked:
            db.execute(master_services.insert().values(master_id=master.id, service_id=svc.id))

        bundles.append(
            ServiceBundle(
                master_service=ms,
                service=svc,
                category_name=cat_name,
                name=svc_name,
                price=price,
                duration=duration,
            )
        )
    return bundles


def _time_add_minutes(t: time, minutes: int) -> time:
    base = datetime.combine(date.min, t) + timedelta(minutes=minutes)
    return base.time()


def _ensure_weekday_schedule(db: Session, master_id: int, *, days_back: int = 75, days_forward: int = 75) -> Tuple[int, int]:
    today = datetime.now(MSK).date()
    start = today - timedelta(days=days_back)
    end = today + timedelta(days=days_forward)
    db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master_id,
        MasterSchedule.salon_id.is_(None),
        MasterSchedule.date >= start,
        MasterSchedule.date <= end,
    ).delete(synchronize_session=False)

    day_count = 0
    slot_count = 0
    d = start
    while d <= end:
        if d.weekday() < 5:
            cur = time(9, 0)
            day_end = time(18, 0)
            day_slots = 0
            while cur < day_end:
                nxt = _time_add_minutes(cur, 30)
                if nxt > day_end:
                    break
                db.add(
                    MasterSchedule(
                        master_id=master_id,
                        salon_id=None,
                        date=d,
                        start_time=cur,
                        end_time=nxt,
                        is_available=True,
                    )
                )
                slot_count += 1
                day_slots += 1
                cur = nxt
            if day_slots:
                day_count += 1
        d += timedelta(days=1)
    return day_count, slot_count


def _get_premium_plan(db: Session) -> SubscriptionPlan:
    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.is_active == True,
            SubscriptionPlan.name == PREMIUM_PLAN_NAME,
        )
        .first()
    )
    if not plan:
        raise RuntimeError(f"Active MASTER plan '{PREMIUM_PLAN_NAME}' not found in subscription_plans")
    return plan


def _activate_premium_from_balance(db: Session, user: User, plan: SubscriptionPlan) -> Dict[str, Any]:
    _guard_not_admin(user, "activate subscription")
    duration_months = SUBSCRIPTION_DURATION_MONTHS
    duration_days = duration_months_to_days(duration_months)
    monthly_price = math.ceil(float(plan.price_6months or 0))
    total_price = float(monthly_price * duration_months)
    daily_rate = int(math.ceil(total_price / duration_days)) if duration_days else 0

    for old in (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.subscription_type == SubscriptionType.MASTER)
        .all()
    ):
        old.status = SubscriptionStatus.EXPIRED
        old.is_active = False

    ub = get_or_create_user_balance(db, user.id)
    current = float(ub.balance or 0)
    if abs(current - INITIAL_BALANCE_RUB) > 0.01:
        if current > 0:
            withdraw_balance(db, user.id, current, description=f"[{SMOKE_TAG}] reset balance before seed")
        deposit_balance(db, user.id, INITIAL_BALANCE_RUB, description=f"[{SMOKE_TAG}] initial top-up 50000 RUB")

    if total_price > INITIAL_BALANCE_RUB:
        raise RuntimeError(f"Premium 6m price {total_price} exceeds initial balance {INITIAL_BALANCE_RUB}")

    now = datetime.utcnow().replace(microsecond=0)
    end_dt = now + timedelta(days=duration_days)
    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=now,
        end_date=end_dt,
        price=total_price,
        daily_rate=daily_rate,
        payment_period="month",
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(sub)
    db.flush()

    if not move_available_to_reserve(db, sub, total_price, do_commit=False):
        raise RuntimeError(
            f"Failed to reserve {total_price} RUB for subscription (available="
            f"{get_user_available_balance(db, user.id, do_commit=False)})"
        )

    invoice_id = f"stats-smoke-{user.id}-{uuid.uuid4().hex[:12]}"
    payment = Payment(
        user_id=user.id,
        subscription_id=sub.id,
        amount=total_price,
        status="paid",
        payment_type="subscription",
        robokassa_invoice_id=invoice_id,
        plan_id=plan.id,
        subscription_period="month",
        subscription_apply_status="applied",
        paid_at=now,
        payment_metadata={"smoke_tag": SMOKE_TAG, "duration_months": duration_months, "source": "reseed_prod_stats_smoke"},
    )
    db.add(payment)
    db.flush()

    ub = get_or_create_user_balance(db, user.id)
    reserved = float(get_user_reserved_total(db, user.id))
    return {
        "subscription_id": sub.id,
        "plan_name": plan.name,
        "plan_id": plan.id,
        "start_date": now.isoformat(),
        "end_date": end_dt.isoformat(),
        "daily_rate": daily_rate,
        "total_price": total_price,
        "balance_after": float(ub.balance),
        "available_balance": float(get_user_available_balance(db, user.id)),
        "reserved_total": reserved,
        "payment_id": payment.id,
        "invoice_id": invoice_id,
    }


class SlotAllocator:
    def __init__(self) -> None:
        self._used: set[Tuple[date, int, int]] = set()

    def take(self, day: date, hour: int, minute: int = 0) -> datetime:
        key = (day, hour, minute)
        while key in self._used:
            minute += 30
            if minute >= 60:
                minute = 0
                hour += 1
            key = (day, hour, minute)
        self._used.add(key)
        return _msk_naive_utc(day, hour, minute)


def _booking_confirmed_income_amount(booking: Booking, fallback_price: float) -> float:
    """Сумма для BookingConfirmation.confirmed_income (как booking_amount_to_pay без баллов в seed)."""
    raw = booking.payment_amount if booking.payment_amount is not None else fallback_price
    return max(0.0, float(raw))


def _create_booking_confirmation_for_completed(
    *,
    master: Master,
    booking: Booking,
    confirmed_income: float,
    confirmed_at: datetime,
) -> BookingConfirmation:
    """
    Одна строка booking_confirmations на completed booking.
    master_id — users.id мастера (см. GET /api/master/accounting/*).
    """
    if not master.user_id:
        raise RuntimeError(f"master.user_id missing for master.id={master.id}")
    return BookingConfirmation(
        booking_id=booking.id,
        master_id=master.user_id,
        confirmed_income=confirmed_income,
        confirmed_at=confirmed_at,
    )


def _ensure_smoke_booking_confirmations(db: Session, master: Master) -> Dict[str, int]:
    """
    Идемпотентно: для каждой completed smoke-брони без подтверждения создаёт BookingConfirmation.
    Нужно для finance summary/operations после reseed (и если старый seed оставил только Income).
    """
    if not master.user_id:
        raise RuntimeError(f"master.user_id missing for master.id={master.id}")

    completed_bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.status == BookingStatus.COMPLETED.value,
        )
        .all()
    )

    created = 0
    skipped_existing = 0
    skipped_no_amount = 0

    for booking in completed_bookings:
        existing = (
            db.query(BookingConfirmation.id)
            .filter(BookingConfirmation.booking_id == booking.id)
            .first()
        )
        if existing:
            skipped_existing += 1
            continue

        amount = _booking_confirmed_income_amount(booking, 0.0)
        if amount <= 0:
            skipped_no_amount += 1
            continue

        confirmed_at = booking.end_time or booking.start_time or datetime.utcnow()
        db.add(
            _create_booking_confirmation_for_completed(
                master=master,
                booking=booking,
                confirmed_income=amount,
                confirmed_at=confirmed_at,
            )
        )
        created += 1

    if created:
        db.flush()

    return {
        "completed_total": len(completed_bookings),
        "created": created,
        "skipped_existing": skipped_existing,
        "skipped_no_amount": skipped_no_amount,
    }


def _add_booking(
    db: Session,
    *,
    master: Master,
    client: User,
    bundle: ServiceBundle,
    day: date,
    hour: int,
    minute: int,
    status: str,
    allocator: SlotAllocator,
    bucket: str,
    seq: int,
    is_paid: bool,
) -> Booking:
    start = allocator.take(day, hour, minute)
    end = start + timedelta(minutes=bundle.duration)
    b = Booking(
        client_id=client.id,
        service_id=bundle.service.id,
        master_id=master.id,
        indie_master_id=None,
        salon_id=None,
        start_time=start,
        end_time=end,
        status=status,
        payment_amount=bundle.price,
        is_paid=is_paid,
        notes=f"{SMOKE_TAG} {bucket} #{seq}",
    )
    db.add(b)
    db.flush()
    if status == BookingStatus.COMPLETED.value:
        amount = _booking_confirmed_income_amount(b, bundle.price)
        db.add(
            Income(
                salon_id=None,
                indie_master_id=None,
                booking_id=b.id,
                total_amount=amount,
                master_earnings=amount,
                salon_earnings=0.0,
                income_date=start.date(),
                service_date=start.date(),
            )
        )
        db.add(
            _create_booking_confirmation_for_completed(
                master=master,
                booking=b,
                confirmed_income=amount,
                confirmed_at=end,
            )
        )
    return b


def _week_bounds(base_monday: date) -> Tuple[date, date]:
    return base_monday, base_monday + timedelta(days=6)


def _build_bookings(
    db: Session,
    master: Master,
    clients: List[User],
    bundles: List[ServiceBundle],
) -> Dict[str, int]:
    today = datetime.now(MSK).date()
    yesterday = today - timedelta(days=1)
    current_monday = today - timedelta(days=today.weekday())
    prev_monday = current_monday - timedelta(days=7)
    next_monday = current_monday + timedelta(days=7)

    counts: Dict[str, int] = {}
    alloc = SlotAllocator()
    ci = 0
    si = 0

    def next_client() -> User:
        nonlocal ci
        u = clients[ci % len(clients)]
        ci += 1
        return u

    def next_service() -> ServiceBundle:
        nonlocal si
        b = bundles[si % len(bundles)]
        si += 1
        return b

    def add_many(
        bucket: str,
        n: int,
        day: date,
        hour_start: int,
        status: str,
        *,
        is_paid: bool,
    ) -> None:
        h, m = hour_start, 0
        for i in range(n):
            while day.weekday() >= 5:
                day += timedelta(days=1)
            _add_booking(
                db,
                master=master,
                client=next_client(),
                bundle=next_service(),
                day=day,
                hour=h,
                minute=m,
                status=status,
                allocator=alloc,
                bucket=bucket,
                seq=i + 1,
                is_paid=is_paid,
            )
            m += 30
            if m >= 60:
                m = 0
                h += 1
            if h >= 17:
                day += timedelta(days=1)
                h = 9
        counts[bucket] = counts.get(bucket, 0) + n

    prev_start, _ = _week_bounds(prev_monday)
    add_many("prev_week_completed", 8, prev_start, 10, BookingStatus.COMPLETED.value, is_paid=True)

    cur_start, cur_end = _week_bounds(current_monday)
    # Completed должны быть строго в прошлом (важно для реалистичного smoke финансы/статистика).
    # Внутри текущей недели: completed только до yesterday включительно.
    cur_completed_end = min(cur_end, yesterday)
    if cur_completed_end >= cur_start:
        eligible_days: List[date] = []
        d = cur_start
        while d <= cur_completed_end:
            if d.weekday() < 5:
                eligible_days.append(d)
            d += timedelta(days=1)
        if not eligible_days:
            # Если вчера попало на выходные, берём ближайший прошлый будний день.
            d = cur_completed_end
            while d >= cur_start:
                if d.weekday() < 5:
                    eligible_days.append(d)
                    break
                d -= timedelta(days=1)

        if eligible_days:
            h, m = 9, 0
            for i in range(10):
                day = eligible_days[i % len(eligible_days)]
                _add_booking(
                    db,
                    master=master,
                    client=next_client(),
                    bundle=next_service(),
                    day=day,
                    hour=h,
                    minute=m,
                    status=BookingStatus.COMPLETED.value,
                    allocator=alloc,
                    bucket="current_week_completed",
                    seq=i + 1,
                    is_paid=True,
                )
                m += 30
                if m >= 60:
                    m = 0
                    h += 1
                if h >= 17:
                    h = 9
            counts["current_week_completed"] = counts.get("current_week_completed", 0) + 10
    else:
        counts["current_week_completed"] = 0

    future_day = max(today + timedelta(days=1), cur_start)
    while future_day.weekday() >= 5:
        future_day += timedelta(days=1)
    if future_day <= cur_end:
        add_many("current_week_confirmed", 3, future_day, 14, BookingStatus.CONFIRMED.value, is_paid=False)
    # Дополнительно: created в будущем, чтобы проверить разные pending-статусы.
    created_day = future_day + timedelta(days=1)
    while created_day.weekday() >= 5:
        created_day += timedelta(days=1)
    if created_day <= cur_end:
        add_many("current_week_created", 2, created_day, 12, BookingStatus.CREATED.value, is_paid=False)

    next_start, _ = _week_bounds(next_monday)
    add_many("next_week_confirmed", 5, next_start, 10, BookingStatus.CONFIRMED.value, is_paid=False)
    add_many("next_week_awaiting", 3, next_start + timedelta(days=2), 15, BookingStatus.AWAITING_CONFIRMATION.value, is_paid=False)

    past_month_start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    pm_day = past_month_start
    while pm_day.weekday() >= 5:
        pm_day += timedelta(days=1)
    add_many("past_month_completed", 18, pm_day, 11, BookingStatus.COMPLETED.value, is_paid=True)

    cancel_day = prev_start + timedelta(days=3)
    for i in range(3):
        _add_booking(
            db,
            master=master,
            client=next_client(),
            bundle=next_service(),
            day=cancel_day,
            hour=16 + i,
            minute=0,
            status=BookingStatus.CANCELLED.value,
            allocator=alloc,
            bucket="cancelled",
            seq=i + 1,
            is_paid=False,
        )
    counts["cancelled"] = 3

    month_start = today.replace(day=1)
    month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    # completed в текущем месяце — только до вчерашнего дня включительно
    month_fill_end = min(month_end, yesterday)
    extra_day = month_start
    month_target = 28
    while extra_day <= month_fill_end:
        existing = (
            db.query(func.count(Booking.id))
            .filter(
                Booking.master_id == master.id,
                Booking.notes.contains(SMOKE_TAG),
                Booking.start_time >= _msk_naive_utc(month_start, 0, 0),
                Booking.start_time < _msk_naive_utc(month_end + timedelta(days=1), 0, 0),
            )
            .scalar()
            or 0
        )
        if existing >= month_target:
            break
        if extra_day.weekday() < 5 and month_start <= extra_day <= month_fill_end:
            _add_booking(
                db,
                master=master,
                client=next_client(),
                bundle=next_service(),
                day=extra_day,
                hour=11,
                minute=0,
                status=BookingStatus.COMPLETED.value,
                allocator=alloc,
                bucket="current_month_fill",
                seq=int(existing) + 1,
                is_paid=True,
            )
        extra_day += timedelta(days=1)
    final_month = (
        db.query(func.count(Booking.id))
        .filter(
            Booking.master_id == master.id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.start_time >= _msk_naive_utc(month_start, 0, 0),
            Booking.start_time < _msk_naive_utc(month_end + timedelta(days=1), 0, 0),
        )
        .scalar()
        or 0
    )
    # Если в начале месяца «прошлых дней» мало, добиваем до цели будущими pending-статусами
    # (created/confirmed/awaiting_confirmation) — completed в будущем запрещены.
    if int(final_month) < month_target:
        need = int(month_target) - int(final_month)
        future_start = max(today + timedelta(days=1), month_start)
        d = future_start
        h, m = 10, 0
        cycle = [
            BookingStatus.CONFIRMED.value,
            BookingStatus.AWAITING_CONFIRMATION.value,
            BookingStatus.CREATED.value,
        ]
        made = 0
        while d <= month_end and made < need:
            if d.weekday() >= 5:
                d += timedelta(days=1)
                continue
            status = cycle[made % len(cycle)]
            _add_booking(
                db,
                master=master,
                client=next_client(),
                bundle=next_service(),
                day=d,
                hour=h,
                minute=m,
                status=status,
                allocator=alloc,
                bucket="current_month_future_fill",
                seq=int(final_month) + made + 1,
                is_paid=False,
            )
            made += 1
            m += 30
            if m >= 60:
                m = 0
                h += 1
            if h >= 17:
                h = 10
                d += timedelta(days=1)
        final_month = int(final_month) + made
    counts["current_month_total"] = int(final_month)

    return counts


def seed_stats_smoke(db: Session) -> Dict[str, Any]:
    cleanup_smoke_data(db)
    db.flush()

    user = _upsert_master_user(db)
    master = _upsert_master_profile(db, user)
    clients = [_upsert_client(db, i) for i in range(1, CLIENT_COUNT + 1)]
    bundles = _ensure_categories_and_services(db, master)
    sched_days, sched_slots = _ensure_weekday_schedule(db, master.id)
    plan = _get_premium_plan(db)
    sub_info = _activate_premium_from_balance(db, user, plan)
    booking_counts = _build_bookings(db, master, clients, bundles)
    confirmation_backfill = _ensure_smoke_booking_confirmations(db, master)

    db.commit()
    return {
        "user_id": user.id,
        "master_id": master.id,
        "email": user.email,
        "phone": user.phone,
        "domain": master.domain,
        "password": SMOKE_PASSWORD,
        "schedule_days": sched_days,
        "schedule_slots": sched_slots,
        "services": len(bundles),
        "clients": len(clients),
        "subscription": sub_info,
        "booking_counts": booking_counts,
        "booking_confirmations_backfill": confirmation_backfill,
    }


def print_verification_report(db: Session, seed: Dict[str, Any]) -> None:
    user_id = seed["user_id"]
    master_id = seed["master_id"]

    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.status == SubscriptionStatus.ACTIVE)
        .order_by(Subscription.id.desc())
        .first()
    )
    ub = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
    now_naive = datetime.utcnow()

    status_rows = (
        db.query(Booking.status, func.count(Booking.id))
        .filter(Booking.master_id == master_id, Booking.notes.contains(SMOKE_TAG))
        .group_by(Booking.status)
        .all()
    )
    status_past_future = (
        db.query(
            Booking.status,
            case((Booking.start_time < now_naive, "past"), else_="future").label("bucket"),
            func.count(Booking.id),
        )
        .filter(Booking.master_id == master_id, Booking.notes.contains(SMOKE_TAG))
        .group_by(Booking.status, "bucket")
        .order_by(Booking.status.asc())
        .all()
    )
    future_completed = (
        db.query(func.count(Booking.id))
        .filter(
            Booking.master_id == master_id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.status == BookingStatus.COMPLETED.value,
            Booking.start_time >= now_naive,
        )
        .scalar()
        or 0
    )
    past_future = (
        db.query(
            func.sum(case((Booking.start_time < now_naive, 1), else_=0)).label("past"),
            func.sum(case((Booking.start_time >= now_naive, 1), else_=0)).label("future"),
        )
        .filter(Booking.master_id == master_id, Booking.notes.contains(SMOKE_TAG))
        .one()
    )

    top_bookings = (
        db.query(Service.name, func.count(Booking.id))
        .join(Service, Service.id == Booking.service_id)
        .filter(
            Booking.master_id == master_id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.status.in_(
                [
                    BookingStatus.CREATED.value,
                    BookingStatus.AWAITING_CONFIRMATION.value,
                    BookingStatus.CONFIRMED.value,
                    BookingStatus.COMPLETED.value,
                ]
            ),
        )
        .group_by(Service.name)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
        .all()
    )

    top_revenue = (
        db.query(Service.name, func.sum(Booking.payment_amount))
        .join(Service, Service.id == Booking.service_id)
        .filter(
            Booking.master_id == master_id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.status == BookingStatus.COMPLETED.value,
        )
        .group_by(Service.name)
        .order_by(func.sum(Booking.payment_amount).desc())
        .limit(5)
        .all()
    )

    print("\n=== Stats smoke master ===")
    print(f"  user_id={user_id} master_id={master_id}")
    print(f"  email={seed['email']} phone={seed['phone']} domain={seed['domain']}")
    print(f"  password={seed['password']}")

    if sub:
        print("\n=== Subscription ===")
        print(f"  id={sub.id} status={sub.status.value} is_active={sub.is_active} plan_id={sub.plan_id}")
        print(f"  start={sub.start_date} end={sub.end_date} daily_rate={sub.daily_rate} price={sub.price}")
    if ub:
        print(
            f"\n=== Balance ===\n  balance={ub.balance} RUB "
            f"available={get_user_available_balance(db, user_id)} RUB "
            f"reserved={get_user_reserved_total(db, user_id)} RUB"
        )

    completed_cnt = (
        db.query(func.count(Booking.id))
        .filter(
            Booking.master_id == master_id,
            Booking.notes.contains(SMOKE_TAG),
            Booking.status == BookingStatus.COMPLETED.value,
        )
        .scalar()
        or 0
    )
    smoke_booking_filter = (
        Booking.master_id == master_id,
        Booking.notes.contains(SMOKE_TAG),
    )
    confirmation_cnt = (
        db.query(func.count(BookingConfirmation.id))
        .join(Booking, Booking.id == BookingConfirmation.booking_id)
        .filter(*smoke_booking_filter)
        .scalar()
        or 0
    )
    confirmation_income_sum = (
        db.query(func.coalesce(func.sum(BookingConfirmation.confirmed_income), 0.0))
        .join(Booking, Booking.id == BookingConfirmation.booking_id)
        .filter(*smoke_booking_filter)
        .scalar()
        or 0.0
    )

    print("\n=== Finance seed (booking_confirmations) ===")
    print(f"  completed_bookings={int(completed_cnt)}")
    print(f"  booking_confirmations={int(confirmation_cnt)}")
    print(f"  booking_confirmations_income_sum={float(confirmation_income_sum):.2f} RUB")
    if int(completed_cnt) != int(confirmation_cnt):
        print(
            f"\n!!! WARNING: completed_bookings ({int(completed_cnt)}) != "
            f"booking_confirmations ({int(confirmation_cnt)}). "
            "Finance profit/operations will be empty until counts match."
        )
    backfill = seed.get("booking_confirmations_backfill") or {}
    if backfill:
        print(
            f"  backfill: created={backfill.get('created', 0)} "
            f"skipped_existing={backfill.get('skipped_existing', 0)} "
            f"skipped_no_amount={backfill.get('skipped_no_amount', 0)}"
        )

    print("\n=== Bookings by status ===")
    for st, cnt in status_rows:
        print(f"  {st}: {cnt}")
    print(f"  past={past_future.past or 0} future={past_future.future or 0}")
    print("\n=== Past/Future by status ===")
    for st, bucket, cnt in status_past_future:
        print(f"  {st} {bucket}: {cnt}")
    if int(future_completed) > 0:
        print(f"\n!!! WARNING: found {int(future_completed)} FUTURE completed bookings (should be 0).")

    print("\n=== Top services (raw SQL-style) ===")
    print("  by bookings:")
    for name, cnt in top_bookings:
        print(f"    {name}: {cnt}")
    print("  by revenue (completed):")
    for name, amt in top_revenue:
        print(f"    {name}: {amt} RUB")

    print("\n=== API checks ===")
    print("  GET /api/subscriptions/my")
    print("  GET /api/master/subscription/features")
    print("  GET /api/master/dashboard/stats?period=week&offset=0")
    print("  GET /api/master/stats/extended?period=week&offset=0&compare_period=true")
    print("\n=== Mobile smoke ===")
    print("  Login master -> Stats -> week KPI/top; Finance; Subscriptions (Premium active)")

    print("\n=== Daily charge smoke (after reseed) ===")
    print("  Reseed resets balance/reserve/subscription and deletes daily_subscription_charges for smoke subs.")
    print("  docker-compose -f docker-compose.prod.yml exec -T backend python3 scripts/smoke_daily_charge_one.py")
    print("  Expected BEFORE charge: balance=50000 reserved=6120 available=43880")
    print("  Expected AFTER charge:  balance=49966 reserved=6086  available=43880 (daily_rate=34)")
    print("  If existing charge for today remains, process_daily_charge skips — re-run reseed or check cleanup plan.")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Prod-safe stats smoke master reseed")
    p.add_argument("--enable-smoke-seed", action="store_true", help="Required to write data")
    p.add_argument("--dry-run", action="store_true", help="Print cleanup/seed plan only")
    p.add_argument("--local", action="store_true", help="Local/dev mode")
    p.add_argument("--prod-smoke", action="store_true", help="Prod/stage smoke mode")
    p.add_argument(
        "--i-understand-this-writes-smoke-data",
        action="store_true",
        help="Required with --prod-smoke",
    )
    p.add_argument("--skip-backup", action="store_true", help="Skip SQLite backup")
    return p.parse_args(argv)


def validate_args(args: argparse.Namespace) -> None:
    if args.dry_run:
        return
    if not args.enable_smoke_seed:
        print("No-op: pass --enable-smoke-seed (or --dry-run for plan).")
        sys.exit(0)
    if not (args.local or args.prod_smoke):
        print("Requires --local or --prod-smoke", file=sys.stderr)
        sys.exit(2)
    if args.prod_smoke and not args.i_understand_this_writes_smoke_data:
        print("Prod requires --i-understand-this-writes-smoke-data", file=sys.stderr)
        sys.exit(2)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    validate_args(args)

    db = SessionLocal()
    try:
        print(f"\n=== {SMOKE_TAG} reseed_prod_stats_smoke ===")
        plan = collect_cleanup_plan(db)
        print_cleanup_plan(plan)

        if args.dry_run:
            print("\nDry-run: would cleanup above, then create stats-smoke master dataset.")
            print(f"  master: {EMAIL_MASTER} / {PHONE_MASTER} / {DOMAIN_MASTER}")
            print(f"  clients: {CLIENT_COUNT} x stats-smoke-client-XX@example.com")
            print(f"  balance: {INITIAL_BALANCE_RUB} RUB -> Premium {SUBSCRIPTION_DURATION_MONTHS}m")
            return 0

        if not args.skip_backup:
            backup_sqlite_db()

        try:
            seed = seed_stats_smoke(db)
        except Exception:
            db.rollback()
            raise

        print("\n=== Seed completed ===")
        for k, v in seed.items():
            if k != "subscription":
                print(f"  {k}: {v}")
        print(f"  subscription: {seed['subscription']}")

        print_verification_report(db, seed)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

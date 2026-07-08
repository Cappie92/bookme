#!/usr/bin/env python3
"""
Production-safe seed for final mobile release smoke.

Creates fully registered Master A/B + Client A/B via real auth/master APIs.
No subscription plans / payments / balances / awards. Master B ends with
pending promo redemption for Master A referral code (pre-first-payment).

Default: dry-run (no writes).

Local execute:
  python3 backend/scripts/seed_final_mobile_release_smoke.py \\
    --local --execute --i-understand-this-writes-smoke-data

Prod execute (inside backend container):
  python3 scripts/seed_final_mobile_release_smoke.py \\
    --prod-smoke --execute --i-understand-this-writes-smoke-data

Cleanup:
  python3 backend/scripts/seed_final_mobile_release_smoke.py \\
    --local --cleanup --execute --i-understand-this-writes-smoke-data

Only touches phones/emails of this seed (+ marker-tagged fields).
Never modifies admin +79031078685 or any ADMIN user / subscription_plans.
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    BalanceTransaction,
    Booking,
    BookingConfirmation,
    Income,
    IndieMaster,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterClientMetadata,
    MasterPaymentSettings,
    MasterSchedule,
    MasterScheduleSettings,
    MasterService,
    MasterServiceCategory,
    Payment,
    PromoEngineCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromoRewardGrant,
    Subscription,
    SubscriptionPointsLedger,
    SubscriptionPriceSnapshot,
    SubscriptionReservation,
    User,
    UserBalance,
    UserRole,
    master_services,
)
from settings import get_settings

MARKER = "FINAL_MOBILE_SMOKE_2026"
PASSWORD = "test123"
PROTECTED_ADMIN_PHONE = "+79031078685"

PHONE_MASTER_A = "+79991701001"
PHONE_MASTER_B = "+79991701002"
PHONE_CLIENT_A = "+79991701011"
PHONE_CLIENT_B = "+79991701012"

EMAIL_MASTER_A = "final-mobile-smoke-master-a-2026@example.com"
EMAIL_MASTER_B = "final-mobile-smoke-master-b-2026@example.com"
EMAIL_CLIENT_A = "final-mobile-smoke-client-a-2026@example.com"
EMAIL_CLIENT_B = "final-mobile-smoke-client-b-2026@example.com"

SMOKE_PHONES = frozenset(
    {PHONE_MASTER_A, PHONE_MASTER_B, PHONE_CLIENT_A, PHONE_CLIENT_B}
)
SMOKE_EMAILS = frozenset(
    {EMAIL_MASTER_A, EMAIL_MASTER_B, EMAIL_CLIENT_A, EMAIL_CLIENT_B}
)

CITY = "Москва"
TIMEZONE = "Europe/Moscow"
SCHEDULE_DAYS = 21
# Mon–Sun → реальные свободные слоты минимум на 14 дней подряд
ACTIVE_WEEKDAYS = (1, 2, 3, 4, 5, 6, 7)

CATEGORIES = [
    f"Стрижки {MARKER}",
    f"Окрашивание {MARKER}",
]
SERVICES = [
    {"name": f"Стрижка мужская {MARKER}", "duration": 30, "price": 1200.0, "category_idx": 0},
    {"name": f"Стрижка женская {MARKER}", "duration": 60, "price": 1800.0, "category_idx": 0},
    {"name": f"Окрашивание корни {MARKER}", "duration": 90, "price": 2500.0, "category_idx": 1},
    {"name": f"Укладка {MARKER}", "duration": 45, "price": 1500.0, "category_idx": 0},
]

MASTER_PROFILES = {
    "A": {
        "phone": PHONE_MASTER_A,
        "email": EMAIL_MASTER_A,
        "full_name": f"Анна Смирнова {MARKER}",
        "bio": f"Мастер A для финального mobile release smoke. {MARKER}",
        "experience_years": 7,
        "address": "Москва, ул. Тверская, 12",
        "address_detail": "2 этаж, домофон 12",
        "site_description": f"Публичная страница Master A. Запись онлайн. {MARKER}",
        "website": "https://example.com/final-mobile-smoke-a",
    },
    "B": {
        "phone": PHONE_MASTER_B,
        "email": EMAIL_MASTER_B,
        "full_name": f"Борис Козлов {MARKER}",
        "bio": f"Мастер B (контроль / promo beneficiary). {MARKER}",
        "experience_years": 5,
        "address": "Москва, ул. Арбат, 25",
        "address_detail": "офис 3",
        "site_description": f"Публичная страница Master B. {MARKER}",
        "website": "https://example.com/final-mobile-smoke-b",
    },
}

CLIENT_PROFILES = {
    "A": {
        "phone": PHONE_CLIENT_A,
        "email": EMAIL_CLIENT_A,
        "full_name": f"Клиент А {MARKER}",
    },
    "B": {
        "phone": PHONE_CLIENT_B,
        "email": EMAIL_CLIENT_B,
        "full_name": f"Клиент Б {MARKER}",
    },
}


class SmokeSafetyError(RuntimeError):
    pass


@dataclass
class AdminSnapshot:
    id: Optional[int]
    phone: Optional[str]
    email: Optional[str]
    role: Optional[str]
    hashed_password: Optional[str]
    full_name: Optional[str]
    is_active: Optional[bool]


@dataclass
class MasterSeedResult:
    label: str
    phone: str
    email: str
    password: str
    user_id: Optional[int] = None
    master_id: Optional[int] = None
    domain: Optional[str] = None
    public_url: Optional[str] = None
    referral_code: Optional[str] = None
    services: List[str] = field(default_factory=list)
    schedule_slots: int = 0
    promo_status: Optional[str] = None


@dataclass
class ClientSeedResult:
    label: str
    phone: str
    email: str
    password: str
    user_id: Optional[int] = None


@dataclass
class SeedReport:
    mode: str
    marker: str = MARKER
    base_url: Optional[str] = None
    masters: Dict[str, MasterSeedResult] = field(default_factory=dict)
    clients: Dict[str, ClientSeedResult] = field(default_factory=dict)
    cleanup_summary: Dict[str, int] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Final mobile release smoke seed (production-safe, API-first)"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--local", action="store_true", help="Local/dev mode")
    mode.add_argument("--prod-smoke", action="store_true", help="Production/stage smoke mode")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Allow writes. Without this, dry-run/read-only.",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Cleanup only this seed's entities (requires --execute)",
    )
    parser.add_argument(
        "--i-understand-this-writes-smoke-data",
        action="store_true",
        help="Required for any write (--execute / --cleanup)",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="API base URL; defaults to settings.API_BASE_URL or http://127.0.0.1:8000",
    )
    return parser.parse_args(argv)


def validate_safety_flags(args: argparse.Namespace) -> str:
    if args.local and args.prod_smoke:
        raise SmokeSafetyError("Choose only one mode: --local or --prod-smoke")
    if not args.local and not args.prod_smoke:
        if args.execute or args.cleanup:
            raise SmokeSafetyError("Writes require --local or --prod-smoke")
        return "dry-run"
    if args.cleanup and not args.execute:
        raise SmokeSafetyError("--cleanup requires --execute")
    if args.execute and not args.i_understand_this_writes_smoke_data:
        raise SmokeSafetyError(
            "--execute requires --i-understand-this-writes-smoke-data"
        )
    if args.prod_smoke:
        return "prod-cleanup" if args.cleanup else ("prod-execute" if args.execute else "prod-dry-run")
    return "local-cleanup" if args.cleanup else ("local-execute" if args.execute else "local-dry-run")


def has_marker(value: Any) -> bool:
    return MARKER in str(value or "")


def is_smoke_user(user: Optional[User]) -> bool:
    if not user:
        return False
    return (
        user.email in SMOKE_EMAILS
        or user.phone in SMOKE_PHONES
        or has_marker(user.email)
        or has_marker(user.full_name)
    )


def is_protected_admin_phone(phone: Optional[str]) -> bool:
    return str(phone or "").strip() == PROTECTED_ADMIN_PHONE


def assert_safe_user(user: Optional[User], action: str) -> None:
    if not user:
        return
    if is_protected_admin_phone(user.phone):
        raise SmokeSafetyError(
            f"Refusing to {action} protected admin phone={PROTECTED_ADMIN_PHONE} "
            f"user id={user.id}"
        )
    if user.role == UserRole.ADMIN:
        raise SmokeSafetyError(
            f"Refusing to {action} ADMIN user id={user.id} email={user.email!r} phone={user.phone!r}"
        )
    if not is_smoke_user(user):
        raise SmokeSafetyError(
            f"Refusing to {action} non-smoke user id={user.id} email={user.email!r} phone={user.phone!r}"
        )


def snapshot_protected_admin(db: Session) -> AdminSnapshot:
    admin = (
        db.query(User)
        .filter(User.phone == PROTECTED_ADMIN_PHONE)
        .order_by(User.id.asc())
        .first()
    )
    if not admin:
        return AdminSnapshot(
            id=None,
            phone=PROTECTED_ADMIN_PHONE,
            email=None,
            role=None,
            hashed_password=None,
            full_name=None,
            is_active=None,
        )
    return AdminSnapshot(
        id=admin.id,
        phone=admin.phone,
        email=admin.email,
        role=admin.role.value if hasattr(admin.role, "value") else str(admin.role),
        hashed_password=admin.hashed_password,
        full_name=admin.full_name,
        is_active=admin.is_active,
    )


def assert_admin_unchanged(db: Session, before: AdminSnapshot) -> None:
    after = snapshot_protected_admin(db)
    if before.id is None and after.id is None:
        return
    mismatches: List[str] = []
    for field_name in (
        "id",
        "phone",
        "email",
        "role",
        "hashed_password",
        "full_name",
        "is_active",
    ):
        if getattr(before, field_name) != getattr(after, field_name):
            mismatches.append(field_name)
    if mismatches:
        raise SmokeSafetyError(
            f"Protected admin {PROTECTED_ADMIN_PHONE} changed during seed: {mismatches}"
        )


def resolve_base_url(raw: Optional[str]) -> str:
    value = (raw or getattr(get_settings(), "API_BASE_URL", None) or "http://127.0.0.1:8000").strip()
    return value.rstrip("/")


def resolve_frontend_url() -> str:
    return (get_settings().FRONTEND_URL or "https://dedato.ru").rstrip("/")


def public_master_url(domain: Optional[str]) -> Optional[str]:
    if not domain:
        return None
    return f"{resolve_frontend_url()}/m/{domain}"


def auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: httpx.Client, base_url: str, phone: str) -> str:
    response = client.post(
        f"{base_url}/api/auth/login",
        json={"phone": phone, "password": PASSWORD},
    )
    response.raise_for_status()
    return response.json()["access_token"]


def register_or_login_master(
    client: httpx.Client,
    base_url: str,
    *,
    phone: str,
    email: str,
    full_name: str,
) -> str:
    try:
        response = client.post(
            f"{base_url}/api/auth/register",
            json={
                "phone": phone,
                "password": PASSWORD,
                "role": "master",
                "email": email,
                "full_name": full_name,
                "city": CITY,
                "timezone": TIMEZONE,
            },
        )
        response.raise_for_status()
        return response.json()["access_token"]
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "").lower()
        if exc.response.status_code == 400 and (
            "already" in body or "registered" in body or "занят" in body
        ):
            return login(client, base_url, phone)
        raise


def register_or_login_client(
    client: httpx.Client,
    base_url: str,
    *,
    phone: str,
    email: str,
    full_name: str,
) -> str:
    try:
        response = client.post(
            f"{base_url}/api/auth/register",
            json={
                "phone": phone,
                "password": PASSWORD,
                "role": "client",
                "email": email,
                "full_name": full_name,
            },
        )
        response.raise_for_status()
        return response.json()["access_token"]
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "").lower()
        if exc.response.status_code == 400 and (
            "already" in body or "registered" in body or "занят" in body
        ):
            return login(client, base_url, phone)
        raise


def update_master_profile(
    client: httpx.Client,
    base_url: str,
    token: str,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    response = client.put(
        f"{base_url}/api/master/profile",
        headers=auth_headers(token),
        data={
            "full_name": profile["full_name"],
            "email": profile["email"],
            "bio": profile["bio"],
            "experience_years": str(profile["experience_years"]),
            "city": CITY,
            "timezone": TIMEZONE,
            "address": profile["address"],
            "address_detail": profile["address_detail"],
            "site_description": profile["site_description"],
            "website": profile["website"],
            "can_work_independently": "true",
        },
    )
    response.raise_for_status()
    return response.json()


def fetch_master_settings(client: httpx.Client, base_url: str, token: str) -> Dict[str, Any]:
    response = client.get(f"{base_url}/api/master/settings", headers=auth_headers(token))
    response.raise_for_status()
    return response.json()


def ensure_categories_and_services(
    client: httpx.Client,
    base_url: str,
    token: str,
) -> Tuple[List[str], int]:
    existing = client.get(f"{base_url}/api/master/categories", headers=auth_headers(token))
    existing.raise_for_status()
    by_name = {c["name"]: c["id"] for c in existing.json()}

    cat_ids: List[int] = []
    for name in CATEGORIES:
        if name in by_name:
            cat_ids.append(by_name[name])
            continue
        r = client.post(
            f"{base_url}/api/master/categories",
            headers=auth_headers(token),
            json={"name": name},
        )
        r.raise_for_status()
        cat_ids.append(r.json()["id"])

    existing_services = client.get(
        f"{base_url}/api/master/services", headers=auth_headers(token)
    )
    existing_services.raise_for_status()
    svc_by_name = {s["name"]: s for s in existing_services.json()}

    created_names: List[str] = []
    for svc in SERVICES:
        if svc["name"] in svc_by_name:
            created_names.append(svc["name"])
            continue
        category_id = cat_ids[svc["category_idx"]]
        r = client.post(
            f"{base_url}/api/master/services",
            headers=auth_headers(token),
            json={
                "name": svc["name"],
                "duration": svc["duration"],
                "price": svc["price"],
                "category_id": category_id,
            },
        )
        r.raise_for_status()
        created_names.append(svc["name"])
    return created_names, len(cat_ids)


def ensure_schedule(client: httpx.Client, base_url: str, token: str) -> int:
    today = date.today()
    start_str = today.isoformat()
    end_str = (today + timedelta(days=SCHEDULE_DAYS)).isoformat()
    weekdays = {
        str(d): {"start": "10:00", "end": "18:00", "enabled": True}
        for d in ACTIVE_WEEKDAYS
    }
    r = client.post(
        f"{base_url}/api/master/schedule/rules",
        headers=auth_headers(token),
        json={
            "type": "weekdays",
            "effective_start_date": start_str,
            "valid_until": end_str,
            "weekdays": weekdays,
        },
    )
    r.raise_for_status()
    slots = int(r.json().get("slots_created") or 0)
    try:
        bulk = client.post(
            f"{base_url}/api/master/schedule/bulk-create",
            params={"start_date": start_str, "end_date": end_str},
            headers=auth_headers(token),
        )
        if bulk.status_code == 200:
            slots += int(bulk.json().get("created_records") or 0)
    except Exception:
        pass
    return slots


def fetch_referral_code(client: httpx.Client, base_url: str, token: str) -> str:
    r = client.get(f"{base_url}/api/master/referral-code", headers=auth_headers(token))
    r.raise_for_status()
    code = r.json().get("code")
    if not code:
        raise SmokeSafetyError("Master A referral-code API returned empty code")
    return str(code)


def apply_promo_code(client: httpx.Client, base_url: str, token: str, code: str) -> str:
    r = client.post(
        f"{base_url}/api/master/promo-code/apply",
        headers=auth_headers(token),
        json={"code": code},
    )
    r.raise_for_status()
    data = r.json()
    status_value = data.get("status")
    return str(status_value or "unknown")


def _smoke_users(db: Session) -> List[User]:
    rows = (
        db.query(User)
        .filter(or_(User.email.in_(list(SMOKE_EMAILS)), User.phone.in_(list(SMOKE_PHONES))))
        .all()
    )
    out: List[User] = []
    for user in rows:
        assert_safe_user(user, "select for cleanup")
        out.append(user)
    return out


def _smoke_master_ids(db: Session, user_ids: List[int]) -> List[int]:
    if not user_ids:
        return []
    return [
        m.id
        for m in db.query(Master)
        .filter(Master.user_id.in_(user_ids))
        .all()
    ]


def collect_cleanup_plan(db: Session) -> Dict[str, List[int]]:
    users = _smoke_users(db)
    user_ids = [u.id for u in users]
    master_ids = _smoke_master_ids(db, user_ids)

    booking_ids: List[int] = []
    if master_ids or user_ids:
        q = db.query(Booking.id)
        filters = []
        if master_ids:
            filters.append(Booking.master_id.in_(master_ids))
        if user_ids:
            filters.append(Booking.client_id.in_(user_ids))
        filters.append(Booking.notes.contains(MARKER))
        booking_ids = [row[0] for row in q.filter(or_(*filters)).all()]

    confirmation_ids: List[int] = []
    income_ids: List[int] = []
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

    redemption_ids: List[int] = []
    if master_ids or user_ids:
        red_filters = []
        if master_ids:
            red_filters.append(PromoRedemption.redeemer_master_id.in_(master_ids))
            red_filters.append(PromoRedemption.referrer_master_id.in_(master_ids))
        if user_ids:
            red_filters.append(PromoRedemption.redeemer_user_id.in_(user_ids))
        redemption_ids = [
            r.id for r in db.query(PromoRedemption).filter(or_(*red_filters)).all()
        ]

    grant_ids: List[int] = []
    if redemption_ids or master_ids:
        g_filters = []
        if redemption_ids:
            g_filters.append(PromoRewardGrant.redemption_id.in_(redemption_ids))
        if master_ids:
            g_filters.append(PromoRewardGrant.recipient_master_id.in_(master_ids))
        grant_ids = [g.id for g in db.query(PromoRewardGrant).filter(or_(*g_filters)).all()]

    ledger_ids: List[int] = []
    if grant_ids or master_ids:
        l_filters = []
        if grant_ids:
            l_filters.append(SubscriptionPointsLedger.source_id.in_(grant_ids))
        if master_ids:
            l_filters.append(SubscriptionPointsLedger.master_id.in_(master_ids))
        ledger_ids = [
            x.id for x in db.query(SubscriptionPointsLedger).filter(or_(*l_filters)).all()
        ]

    code_ids: List[int] = []
    if user_ids:
        code_ids = [
            c.id
            for c in db.query(PromoEngineCode)
            .filter(PromoEngineCode.assigned_to_user_id.in_(user_ids))
            .all()
        ]

    payment_ids: List[int] = []
    if user_ids:
        payment_ids = [
            p.id for p in db.query(Payment).filter(Payment.user_id.in_(user_ids)).all()
        ]

    subscription_ids: List[int] = []
    if user_ids:
        subscription_ids = [
            s.id for s in db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()
        ]

    reservation_ids: List[int] = []
    if subscription_ids:
        reservation_ids = [
            r.id
            for r in db.query(SubscriptionReservation)
            .filter(SubscriptionReservation.subscription_id.in_(subscription_ids))
            .all()
        ]

    snapshot_ids: List[int] = []
    if user_ids:
        snapshot_ids = [
            s.id
            for s in db.query(SubscriptionPriceSnapshot)
            .filter(SubscriptionPriceSnapshot.user_id.in_(user_ids))
            .all()
        ]

    balance_ids: List[int] = []
    balance_transaction_ids: List[int] = []
    if user_ids:
        balance_ids = [
            b.id for b in db.query(UserBalance).filter(UserBalance.user_id.in_(user_ids)).all()
        ]
        balance_transaction_ids = [
            t.id
            for t in db.query(BalanceTransaction)
            .filter(BalanceTransaction.user_id.in_(user_ids))
            .all()
        ]

    schedule_ids: List[int] = []
    schedule_settings_ids: List[int] = []
    ms_ids: List[int] = []
    category_ids: List[int] = []
    loyalty_settings_ids: List[int] = []
    loyalty_tx_ids: List[int] = []
    payment_settings_ids: List[int] = []
    client_meta_ids: List[int] = []
    indie_ids: List[int] = []

    if master_ids:
        schedule_ids = [
            s.id for s in db.query(MasterSchedule).filter(MasterSchedule.master_id.in_(master_ids)).all()
        ]
        schedule_settings_ids = [
            s.id
            for s in db.query(MasterScheduleSettings)
            .filter(MasterScheduleSettings.master_id.in_(master_ids))
            .all()
        ]
        ms_ids = [
            s.id for s in db.query(MasterService).filter(MasterService.master_id.in_(master_ids)).all()
        ]
        category_ids = [
            c.id
            for c in db.query(MasterServiceCategory)
            .filter(MasterServiceCategory.master_id.in_(master_ids))
            .all()
        ]
        loyalty_settings_ids = [
            s.id
            for s in db.query(LoyaltySettings)
            .filter(LoyaltySettings.master_id.in_(master_ids))
            .all()
        ]
        loyalty_tx_ids = [
            t.id
            for t in db.query(LoyaltyTransaction)
            .filter(
                or_(
                    LoyaltyTransaction.master_id.in_(master_ids),
                    LoyaltyTransaction.source == MARKER,
                )
            )
            .all()
        ]
        payment_settings_ids = [
            s.id
            for s in db.query(MasterPaymentSettings)
            .filter(MasterPaymentSettings.master_id.in_(master_ids))
            .all()
        ]
        client_meta_ids = [
            m.id
            for m in db.query(MasterClientMetadata)
            .filter(MasterClientMetadata.master_id.in_(master_ids))
            .all()
        ]
        indie_ids = [
            i.id for i in db.query(IndieMaster).filter(IndieMaster.master_id.in_(master_ids)).all()
        ]

    return {
        "booking_confirmations": confirmation_ids,
        "incomes": income_ids,
        "loyalty_transactions": loyalty_tx_ids,
        "bookings": booking_ids,
        "subscription_points_ledger": ledger_ids,
        "promo_reward_grants": grant_ids,
        "promo_redemptions": redemption_ids,
        "promo_engine_codes": code_ids,
        "payments": payment_ids,
        "subscription_reservations": reservation_ids,
        "subscription_price_snapshots": snapshot_ids,
        "subscriptions": subscription_ids,
        "balance_transactions": balance_transaction_ids,
        "user_balances": balance_ids,
        "master_schedules": schedule_ids,
        "master_schedule_settings": schedule_settings_ids,
        "master_services": ms_ids,
        "master_service_categories": category_ids,
        "loyalty_settings": loyalty_settings_ids,
        "master_payment_settings": payment_settings_ids,
        "master_client_metadata": client_meta_ids,
        "indie_masters": indie_ids,
        "masters": master_ids,
        "users": user_ids,
    }


def run_cleanup(db: Session, report: SeedReport) -> None:
    before = snapshot_protected_admin(db)
    plan = collect_cleanup_plan(db)

    # Never touch subscription_plans or shared referral campaign.
    deletes: List[Tuple[str, Any, List[int]]] = [
        ("booking_confirmations", BookingConfirmation, plan["booking_confirmations"]),
        ("incomes", Income, plan["incomes"]),
        ("loyalty_transactions", LoyaltyTransaction, plan["loyalty_transactions"]),
        ("bookings", Booking, plan["bookings"]),
        ("subscription_points_ledger", SubscriptionPointsLedger, plan["subscription_points_ledger"]),
        ("promo_reward_grants", PromoRewardGrant, plan["promo_reward_grants"]),
        ("promo_redemptions", PromoRedemption, plan["promo_redemptions"]),
        ("promo_engine_codes", PromoEngineCode, plan["promo_engine_codes"]),
        ("payments", Payment, plan["payments"]),
        ("subscription_reservations", SubscriptionReservation, plan["subscription_reservations"]),
        ("subscription_price_snapshots", SubscriptionPriceSnapshot, plan["subscription_price_snapshots"]),
        ("subscriptions", Subscription, plan["subscriptions"]),
        ("balance_transactions", BalanceTransaction, plan["balance_transactions"]),
        ("user_balances", UserBalance, plan["user_balances"]),
        ("master_schedules", MasterSchedule, plan["master_schedules"]),
        ("master_schedule_settings", MasterScheduleSettings, plan["master_schedule_settings"]),
        ("master_services", MasterService, plan["master_services"]),
        ("master_service_categories", MasterServiceCategory, plan["master_service_categories"]),
        ("loyalty_settings", LoyaltySettings, plan["loyalty_settings"]),
        ("master_payment_settings", MasterPaymentSettings, plan["master_payment_settings"]),
        ("master_client_metadata", MasterClientMetadata, plan["master_client_metadata"]),
        ("indie_masters", IndieMaster, plan["indie_masters"]),
    ]

    summary: Dict[str, int] = {}
    for key, model, ids in deletes:
        if not ids:
            summary[key] = 0
            continue
        summary[key] = (
            db.query(model)
            .filter(model.id.in_(ids))
            .delete(synchronize_session=False)
        )

    if plan["masters"]:
        # Clear M2M master_services links for smoke masters
        db.execute(
            master_services.delete().where(
                master_services.c.master_id.in_(plan["masters"])
            )
        )
        summary["masters"] = (
            db.query(Master)
            .filter(Master.id.in_(plan["masters"]))
            .delete(synchronize_session=False)
        )
    else:
        summary["masters"] = 0

    for uid in plan["users"]:
        user = db.query(User).filter(User.id == uid).first()
        assert_safe_user(user, "delete")
    if plan["users"]:
        summary["users"] = (
            db.query(User)
            .filter(User.id.in_(plan["users"]))
            .delete(synchronize_session=False)
        )
    else:
        summary["users"] = 0

    db.commit()
    assert_admin_unchanged(db, before)
    report.cleanup_summary = summary


def _master_ids_for_users(db: Session, user_ids: List[int]) -> List[int]:
    if not user_ids:
        return []
    return [
        m.id
        for m in db.query(Master).filter(Master.user_id.in_(user_ids)).all()
    ]


def _assert_post_seed_clean_state(db: Session, user_ids: List[int]) -> None:
    """Strict post-seed checks: no money flow, no subs/payments/grants/ledger.

  Empty UserBalance rows (balance=0, no BalanceTransaction) are allowed — they are
  created lazily by billing helpers when subscription/balance endpoints are first touched.
    """
    if not user_ids:
        return

    master_ids = _master_ids_for_users(db, user_ids)
    payments = db.query(Payment).filter(Payment.user_id.in_(user_ids)).count()
    subs = db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).count()
    grants = (
        db.query(PromoRewardGrant)
        .join(PromoRedemption, PromoRewardGrant.redemption_id == PromoRedemption.id)
        .filter(PromoRedemption.redeemer_user_id.in_(user_ids))
        .count()
    )
    ledger_count = 0
    if master_ids:
        ledger_count = (
            db.query(SubscriptionPointsLedger)
            .filter(SubscriptionPointsLedger.master_id.in_(master_ids))
            .count()
        )
    balance_tx = (
        db.query(BalanceTransaction)
        .filter(BalanceTransaction.user_id.in_(user_ids))
        .count()
    )
    reservations = (
        db.query(SubscriptionReservation)
        .filter(SubscriptionReservation.user_id.in_(user_ids))
        .count()
    )
    balances = db.query(UserBalance).filter(UserBalance.user_id.in_(user_ids)).all()
    non_empty_balances = [
        ub for ub in balances if abs(float(ub.balance or 0)) > 0.001
    ]

    if (
        payments
        or subs
        or grants
        or ledger_count
        or balance_tx
        or reservations
        or non_empty_balances
    ):
        raise SmokeSafetyError(
            "Post-seed dirty state: "
            f"payments={payments} subscriptions={subs} grants={grants} "
            f"ledger={ledger_count} balance_transactions={balance_tx} "
            f"reservations={reservations} non_empty_balances={len(non_empty_balances)} "
            f"(empty_user_balances={len(balances)} allowed)"
        )


def seed_via_api(client: httpx.Client, base_url: str, db: Session, report: SeedReport) -> None:
    before = snapshot_protected_admin(db)

    # Idempotent: wipe previous entities of this seed only, then recreate via API
    run_cleanup(db, report)
    report.notes.append(f"pre-seed cleanup: {report.cleanup_summary}")

    # Master A
    profile_a = MASTER_PROFILES["A"]
    token_a = register_or_login_master(
        client,
        base_url,
        phone=profile_a["phone"],
        email=profile_a["email"],
        full_name=profile_a["full_name"],
    )
    update_master_profile(client, base_url, token_a, profile_a)
    settings_a = fetch_master_settings(client, base_url, token_a)
    master_a = settings_a.get("master") or {}
    services_a, _ = ensure_categories_and_services(client, base_url, token_a)
    slots_a = ensure_schedule(client, base_url, token_a)
    referral = fetch_referral_code(client, base_url, token_a)

    result_a = MasterSeedResult(
        label="A",
        phone=profile_a["phone"],
        email=profile_a["email"],
        password=PASSWORD,
        user_id=(settings_a.get("user") or {}).get("id"),
        master_id=master_a.get("id"),
        domain=master_a.get("domain"),
        public_url=public_master_url(master_a.get("domain")),
        referral_code=referral,
        services=services_a,
        schedule_slots=slots_a,
    )
    report.masters["A"] = result_a

    # Master B + pending redemption
    profile_b = MASTER_PROFILES["B"]
    token_b = register_or_login_master(
        client,
        base_url,
        phone=profile_b["phone"],
        email=profile_b["email"],
        full_name=profile_b["full_name"],
    )
    update_master_profile(client, base_url, token_b, profile_b)
    settings_b = fetch_master_settings(client, base_url, token_b)
    master_b = settings_b.get("master") or {}
    services_b, _ = ensure_categories_and_services(client, base_url, token_b)
    slots_b = ensure_schedule(client, base_url, token_b)
    promo_status = apply_promo_code(client, base_url, token_b, referral)

    result_b = MasterSeedResult(
        label="B",
        phone=profile_b["phone"],
        email=profile_b["email"],
        password=PASSWORD,
        user_id=(settings_b.get("user") or {}).get("id"),
        master_id=master_b.get("id"),
        domain=master_b.get("domain"),
        public_url=public_master_url(master_b.get("domain")),
        services=services_b,
        schedule_slots=slots_b,
        promo_status=promo_status,
    )
    report.masters["B"] = result_b

    # Clients
    for label, profile in CLIENT_PROFILES.items():
        token = register_or_login_client(
            client,
            base_url,
            phone=profile["phone"],
            email=profile["email"],
            full_name=profile["full_name"],
        )
        me = client.get(f"{base_url}/api/auth/users/me", headers=auth_headers(token))
        me.raise_for_status()
        report.clients[label] = ClientSeedResult(
            label=label,
            phone=profile["phone"],
            email=profile["email"],
            password=PASSWORD,
            user_id=me.json().get("id"),
        )

    # DB verification: pending redemption, no payments/subs/balances/grants
    db.expire_all()
    smoke_users = _smoke_users(db)
    user_ids = [u.id for u in smoke_users]
    _assert_post_seed_clean_state(db, user_ids)

    master_b_row = (
        db.query(Master).filter(Master.user_id == result_b.user_id).first()
        if result_b.user_id
        else None
    )
    if not master_b_row:
        raise SmokeSafetyError("Master B not found in DB after seed")
    pending = (
        db.query(PromoRedemption)
        .filter(
            PromoRedemption.redeemer_master_id == master_b_row.id,
            PromoRedemption.status == PromoRedemptionStatus.PENDING_FIRST_PAYMENT,
        )
        .first()
    )
    if pending is None:
        raise SmokeSafetyError(
            "Expected pending_first_payment redemption for Master B after promo apply"
        )

    assert_admin_unchanged(db, before)

    # Soft marker check on masters
    for m in db.query(Master).filter(Master.user_id.in_(user_ids)).all():
        if not (has_marker(m.bio) or has_marker(m.site_description)):
            raise SmokeSafetyError(f"Master id={m.id} missing marker in bio/site_description")


def print_dry_run_plan(db: Session, report: SeedReport) -> None:
    plan = collect_cleanup_plan(db)
    print(f"mode: {report.mode}")
    print(f"marker: {MARKER}")
    print(f"base_url: {report.base_url}")
    print(f"protected_admin: {PROTECTED_ADMIN_PHONE}")
    print("would_create:")
    print(f"  Master A phone={PHONE_MASTER_A} email={EMAIL_MASTER_A}")
    print(f"  Master B phone={PHONE_MASTER_B} email={EMAIL_MASTER_B}")
    print(f"  Client A phone={PHONE_CLIENT_A} email={EMAIL_CLIENT_A}")
    print(f"  Client B phone={PHONE_CLIENT_B} email={EMAIL_CLIENT_B}")
    print("existing_cleanup_candidates:")
    for key, ids in plan.items():
        print(f"  {key}: {len(ids)}")
    print("Dry-run only. Pass --execute --i-understand-this-writes-smoke-data to write.")


def print_final_report(report: SeedReport) -> None:
    a = report.masters.get("A")
    b = report.masters.get("B")
    ca = report.clients.get("A")
    cb = report.clients.get("B")

    print()
    print("=" * 54)
    print("FINAL MOBILE RELEASE SMOKE READY")
    print("=" * 54)
    print()
    print("MASTER A")
    if a:
        print(f"  login:          {a.phone}")
        print(f"  password:       {a.password}")
        print(f"  public link:    {a.public_url}")
        print(f"  master id:      {a.master_id}")
        print(f"  domain:         {a.domain}")
        print(f"  referral code:  {a.referral_code}")
        print(f"  services:       {len(a.services)}")
        print(f"  schedule slots: {a.schedule_slots}")
    print()
    print("MASTER B")
    if b:
        print(f"  login:          {b.phone}")
        print(f"  password:       {b.password}")
        print(f"  public link:    {b.public_url}")
        print(f"  master id:      {b.master_id}")
        print(f"  domain:         {b.domain}")
        print(f"  promo status:   {b.promo_status}")
        print(f"  services:       {len(b.services)}")
        print(f"  schedule slots: {b.schedule_slots}")
    print()
    print("CLIENT A")
    if ca:
        print(f"  login:          {ca.phone}")
        print(f"  password:       {ca.password}")
    print()
    print("CLIENT B")
    if cb:
        print(f"  login:          {cb.phone}")
        print(f"  password:       {cb.password}")
    print()
    print("PROMO")
    print(f"  Master A referral applied by Master B → pending_first_payment")
    print(f"  marker: {MARKER}")
    print(f"  password (all): {PASSWORD}")
    if report.cleanup_summary:
        print(f"  pre-seed cleanup: {report.cleanup_summary}")
    print()
    print("READY FOR FINAL MOBILE RELEASE SMOKE")
    print("=" * 54)


def print_cleanup_report(report: SeedReport) -> None:
    print()
    print("=" * 54)
    print("FINAL MOBILE RELEASE SMOKE CLEANUP DONE")
    print("=" * 54)
    print(f"marker: {MARKER}")
    for key, count in sorted(report.cleanup_summary.items()):
        print(f"  {key}: {count}")
    print("=" * 54)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        mode = validate_safety_flags(args)
    except SmokeSafetyError as exc:
        print(f"SAFETY ERROR: {exc}")
        return 2

    base_url = resolve_base_url(args.base_url)
    report = SeedReport(mode=mode, base_url=base_url)
    db = SessionLocal()
    try:
        if mode.endswith("dry-run") or mode == "dry-run":
            print_dry_run_plan(db, report)
            return 0

        if args.cleanup:
            run_cleanup(db, report)
            print_cleanup_report(report)
            return 0

        with httpx.Client(timeout=60.0) as client:
            try:
                client.get(f"{base_url}/health")
            except Exception:
                report.notes.append("health check skipped/unavailable")
            seed_via_api(client, base_url, db, report)
        print_final_report(report)
        return 0
    except SmokeSafetyError as exc:
        db.rollback()
        print(f"SAFETY ERROR: {exc}")
        return 2
    except httpx.HTTPStatusError as exc:
        db.rollback()
        print(f"HTTP ERROR: {exc.response.status_code} {exc.response.text[:500]}")
        return 1
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

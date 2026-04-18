#!/usr/bin/env python3
"""
Overlay enrichment для campaigns/contact-preferences QA.

Цель:
- запускать ПОСЛЕ канонического reseed;
- не ломать baseline-сценарии;
- добавить completed-eligible клиентов для выбранных мастеров;
- обеспечить детерминированные channel-counts (push/email/sms) по той же логике,
  что используется во frontend shared/contactChannels.js.

По умолчанию скрипт:
- не удаляет существующие данные;
- только добавляет новых клиентов и completed bookings;
- выводит отчёт по мастерам до/после enrichment.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

# Для запуска из корня репозитория
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from database import SessionLocal
from models import Booking, BookingStatus, Master, Service, User, UserRole


Channel = Literal["push", "email", "sms"]

MASTER_PHONES_DEFAULT = [
    "+79990000000",
    "+79990000001",
    "+79990000002",
]

DEFAULT_PASSWORD = "test123"


@dataclass
class MasterChannelStats:
    phone: str
    master_id: int
    total_eligible: int
    push: int
    email: int
    sms: int


def effective_channel_for_client_key(client_key: str) -> Channel:
    """
    Повтор shared/contactChannels.js::buildMockClientPreferences + getEffectiveContactChannel.
    """
    key = str(client_key or "")
    h = 0
    for ch in key:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
        if h & 0x80000000:
            h -= 0x100000000
    v = abs(h) % 3
    if v == 0:
        return "push"
    if v == 1:
        return "email"
    return "sms"


def get_master_by_phone(db: Session, phone: str) -> tuple[User, Master] | None:
    user = db.query(User).filter(User.phone == phone, User.role == UserRole.MASTER).first()
    if not user:
        return None
    master = db.query(Master).filter(Master.user_id == user.id).first()
    if not master:
        return None
    return user, master


def resolve_service_for_master(db: Session, master_id: int) -> Service | None:
    # Берём любую service из completed bookings этого мастера (самый безопасный вариант для owner linkage)
    svc = (
        db.query(Service)
        .join(Booking, Booking.service_id == Service.id)
        .filter(Booking.master_id == master_id)
        .order_by(Service.id.asc())
        .first()
    )
    if svc:
        return svc

    # fallback: любая service из booking'ов мастера
    svc = (
        db.query(Service)
        .join(Booking, Booking.service_id == Service.id)
        .filter(Booking.master_id == master_id)
        .order_by(Service.id.asc())
        .first()
    )
    return svc


def get_completed_client_ids_for_master(db: Session, master_id: int) -> list[int]:
    rows = (
        db.query(Booking.client_id)
        .filter(
            Booking.master_id == master_id,
            Booking.status == BookingStatus.COMPLETED.value,
            Booking.client_id.isnot(None),
        )
        .distinct()
        .all()
    )
    return [r[0] for r in rows if r and r[0] is not None]


def count_channels_for_master(db: Session, phone: str, master_id: int) -> MasterChannelStats:
    client_ids = get_completed_client_ids_for_master(db, master_id)

    push = 0
    email = 0
    sms = 0
    for cid in client_ids:
        ch = effective_channel_for_client_key(f"user:{cid}")
        if ch == "push":
            push += 1
        elif ch == "email":
            email += 1
        else:
            sms += 1

    return MasterChannelStats(
        phone=phone,
        master_id=master_id,
        total_eligible=len(client_ids),
        push=push,
        email=email,
        sms=sms,
    )


def ensure_unique_client_phone(db: Session, master_phone: str, seq: int) -> str:
    """
    Детерминированный phone для overlay-клиентов.
    Формат: +7988MMMMSSS
      MMMM = последние 4 цифры master_phone
      SSS  = sequence 000..999
    """
    suffix = master_phone[-4:]
    candidate = f"+7988{suffix}{seq:03d}"
    exists = db.query(User.id).filter(User.phone == candidate).first()
    if exists:
        return ""
    return candidate


def create_overlay_client(db: Session, phone: str, seq_global: int) -> User:
    user = User(
        phone=phone,
        email=f"campaign.overlay.{seq_global}.{phone.replace('+', '')}@example.com",
        hashed_password=get_password_hash(DEFAULT_PASSWORD),
        role=UserRole.CLIENT,
        full_name=f"Overlay QA Client {phone}",
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def create_completed_booking(
    db: Session,
    master_id: int,
    service: Service,
    client_id: int,
    day_offset: int,
) -> Booking:
    start_time = (datetime.utcnow() - timedelta(days=day_offset)).replace(
        hour=11 + (day_offset % 6),
        minute=0,
        second=0,
        microsecond=0,
    )
    duration = int(service.duration or 60)
    end_time = start_time + timedelta(minutes=duration)
    payment = float(service.price or 0)

    booking = Booking(
        master_id=master_id,
        client_id=client_id,
        service_id=service.id,
        salon_id=service.salon_id,
        indie_master_id=None,
        start_time=start_time,
        end_time=end_time,
        status=BookingStatus.COMPLETED.value,
        payment_amount=payment,
        notes="Overlay campaign enrichment completed booking",
    )
    db.add(booking)
    db.flush()
    return booking


def needs_top_up(stats: MasterChannelStats, min_per_channel: int) -> bool:
    return stats.push < min_per_channel or stats.email < min_per_channel or stats.sms < min_per_channel


def print_stats(title: str, stats: Iterable[MasterChannelStats]) -> None:
    print(f"\n=== {title} ===")
    print("phone | master_id | eligible | push | email | sms")
    for s in stats:
        print(f"{s.phone} | {s.master_id} | {s.total_eligible} | {s.push} | {s.email} | {s.sms}")


def run_enrichment(
    db: Session,
    target_master_phones: list[str],
    min_per_channel: int,
    max_new_clients_per_master: int,
    verify_only: bool,
) -> int:
    masters: list[tuple[str, int, Service]] = []
    for phone in target_master_phones:
        resolved = get_master_by_phone(db, phone)
        if not resolved:
            print(f"[WARN] master not found for phone={phone}")
            continue
        _, master = resolved
        service = resolve_service_for_master(db, master.id)
        if not service:
            print(f"[WARN] no service resolved for master phone={phone} master_id={master.id}; skipping")
            continue
        masters.append((phone, master.id, service))

    if not masters:
        print("[FAIL] no eligible masters/services found")
        return 1

    before = [count_channels_for_master(db, p, mid) for (p, mid, _) in masters]
    print_stats("BEFORE", before)

    if verify_only:
        failed = [s for s in before if needs_top_up(s, min_per_channel)]
        if failed:
            print(f"\n[FAIL] verify-only: {len(failed)} master(s) below target min_per_channel={min_per_channel}")
            return 1
        print(f"\n[OK] verify-only: all masters meet min_per_channel={min_per_channel}")
        return 0

    created_clients = 0
    created_completed = 0
    seq_global = int(datetime.utcnow().timestamp()) % 100000

    for phone, master_id, service in masters:
        current = count_channels_for_master(db, phone, master_id)
        if not needs_top_up(current, min_per_channel):
            continue

        added_for_master = 0
        seq_local = 0
        while needs_top_up(current, min_per_channel) and added_for_master < max_new_clients_per_master:
            candidate = ensure_unique_client_phone(db, phone, seq_local)
            seq_local += 1
            if not candidate:
                continue

            client = create_overlay_client(db, candidate, seq_global)
            seq_global += 1
            created_clients += 1

            day_offset = 14 + (created_clients % 60)
            create_completed_booking(db, master_id, service, client.id, day_offset=day_offset)
            created_completed += 1
            added_for_master += 1

            current = count_channels_for_master(db, phone, master_id)

        if needs_top_up(current, min_per_channel):
            print(
                f"[WARN] master {phone} did not reach target with limit={max_new_clients_per_master}; "
                f"current push/email/sms={current.push}/{current.email}/{current.sms}"
            )

    db.commit()

    after = [count_channels_for_master(db, p, mid) for (p, mid, _) in masters]
    print_stats("AFTER", after)

    final_failed = [s for s in after if needs_top_up(s, min_per_channel)]
    print("\n=== OVERLAY SUMMARY ===")
    print(f"masters_targeted={len(masters)}")
    print(f"created_clients={created_clients}")
    print(f"created_completed_bookings={created_completed}")
    print(f"target_min_per_channel={min_per_channel}")
    print(f"failed_masters={len(final_failed)}")
    if final_failed:
        print("failed phones:", ", ".join(s.phone for s in final_failed))
        return 2

    print("[OK] enrichment completed; all targeted masters satisfy push/email/sms minimum")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Overlay enrichment for campaign/contact-preferences QA")
    parser.add_argument(
        "--master-phones",
        nargs="+",
        default=MASTER_PHONES_DEFAULT,
        help="Target master phones (default: first 3 canonical masters)",
    )
    parser.add_argument(
        "--min-per-channel",
        type=int,
        default=8,
        help="Minimum push/email/sms eligible clients per targeted master",
    )
    parser.add_argument(
        "--max-new-clients-per-master",
        type=int,
        default=60,
        help="Safety limit for newly added overlay clients per master",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Do not create data, only verify that targets are already satisfied",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        return run_enrichment(
            db=db,
            target_master_phones=args.master_phones,
            min_per_channel=max(1, int(args.min_per_channel)),
            max_new_clients_per_master=max(1, int(args.max_new_clients_per_master)),
            verify_only=bool(args.verify_only),
        )
    except Exception as exc:
        db.rollback()
        print(f"[FAIL] enrichment error: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())


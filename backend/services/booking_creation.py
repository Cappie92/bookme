"""
Atomic Booking create. Transaction strategy lives in booking_atomic_txn.
Occupancy predicate lives in booking_occupancy.

Create-specific hooks on this module are test-only. Production callers must leave them None.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from models import AppliedDiscount, Booking, OwnerType, Service, User
from services.booking_atomic_txn import (
    BOOKING_ATOMIC_UNSUPPORTED_CODE,
    BOOKING_SLOT_BUSY_CODE,
    BOOKING_SLOT_CONFLICT_CODE,
    SLOT_BUSY_DETAIL,
    SLOT_BUSY_RETRY_AFTER,
    SLOT_CONFLICT_DETAIL,
    BookingAtomicPendingWrites,
    BookingAtomicUnsupported,
    BookingPublicClientInvalid,
    BookingSlotBusy,
    BookingSlotConflict,
    http_exception_for_booking_atomic,
    http_exception_for_booking_create,
    release_request_session,
    run_atomic_writer,
)
from services.booking_occupancy import (
    NON_OCCUPYING_BOOKING_STATUSES,
    has_overlapping_booking,
    intervals_overlap,
    to_naive,
)

after_overlap_check_hook: Optional[Callable[[], None]] = None
fail_after_flush_hook: Optional[Callable[[], None]] = None
fail_after_service_flush_hook: Optional[Callable[[], None]] = None


@dataclass(frozen=True)
class AppliedDiscountSnapshot:
    rule_type: str
    rule_id: Optional[int]
    discount_percent: float
    discount_amount: float


@dataclass(frozen=True)
class PublicClientSnapshot:
    phone: str
    email: str
    full_name: str


@dataclass(frozen=True)
class CanonicalServiceSnapshot:
    name: str
    duration: int
    price: float


@dataclass(frozen=True)
class BookingCreateSnapshot:
    start_time: datetime
    end_time: datetime
    status: str
    payment_amount: float
    owner_type: OwnerType
    owner_id: int
    service_id: Optional[int] = None
    client_id: Optional[int] = None
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None
    loyalty_points_used: int = 0
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    applied_discount: Optional[AppliedDiscountSnapshot] = None
    public_client: Optional[PublicClientSnapshot] = None
    ensure_client_email: Optional[str] = None
    canonical_service: Optional[CanonicalServiceSnapshot] = None


@dataclass(frozen=True)
class BookingCreateResult:
    booking_id: int
    client_id: int
    created_new_user: bool
    service_id: int
    created_new_service: bool = False


def find_canonical_solo_service(
    db: Session, spec: CanonicalServiceSnapshot
) -> Optional[Service]:
    return (
        db.query(Service)
        .filter(
            Service.salon_id.is_(None),
            Service.indie_master_id.is_(None),
            Service.name == spec.name,
            Service.duration == spec.duration,
            Service.price == spec.price,
        )
        .first()
    )


def get_or_create_canonical_service(
    db: Session, spec: CanonicalServiceSnapshot
) -> tuple[int, bool]:
    existing = find_canonical_solo_service(db, spec)
    if existing is not None:
        return existing.id, False
    service = Service(
        name=spec.name,
        duration=spec.duration,
        price=spec.price,
        salon_id=None,
        indie_master_id=None,
        category_id=None,
    )
    db.add(service)
    db.flush()
    if fail_after_service_flush_hook is not None:
        fail_after_service_flush_hook()
    return service.id, True


def _resolve_client(atomic_db: Session, snapshot: BookingCreateSnapshot) -> tuple[int, bool]:
    if snapshot.public_client is not None:
        spec = snapshot.public_client
        client = atomic_db.query(User).filter(User.phone == spec.phone).first()
        if client is None:
            client = User(
                phone=spec.phone,
                email=spec.email,
                role="client",
                is_active=True,
                is_verified=True,
                is_phone_verified=False,
                full_name=spec.full_name,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            atomic_db.add(client)
            atomic_db.flush()
            return client.id, True
        role = getattr(client.role, "value", client.role)
        if role != "client":
            raise BookingPublicClientInvalid(
                "Запись не удалась, войдите под аккаунтом клиента"
            )
        if snapshot.ensure_client_email and not client.email:
            client.email = snapshot.ensure_client_email
        return client.id, False

    if snapshot.client_id is None:
        raise ValueError("client_id or public_client is required")
    return snapshot.client_id, False


def _resolve_service_id(atomic_db: Session, snapshot: BookingCreateSnapshot) -> tuple[int, bool]:
    if snapshot.canonical_service is not None:
        return get_or_create_canonical_service(atomic_db, snapshot.canonical_service)
    if snapshot.service_id is None:
        raise ValueError("service_id or canonical_service is required")
    return snapshot.service_id, False


def create_booking_atomic(
    snapshot: BookingCreateSnapshot,
    *,
    bind: Any = None,
) -> BookingCreateResult:
    def _write(atomic_db: Session) -> BookingCreateResult:
        client_id, created_new_user = _resolve_client(atomic_db, snapshot)
        service_id, created_new_service = _resolve_service_id(atomic_db, snapshot)

        if has_overlapping_booking(
            atomic_db,
            snapshot.start_time,
            snapshot.end_time,
            snapshot.owner_type,
            snapshot.owner_id,
        ):
            raise BookingSlotConflict(SLOT_CONFLICT_DETAIL)

        if after_overlap_check_hook is not None:
            after_overlap_check_hook()

        booking = Booking(
            client_id=client_id,
            service_id=service_id,
            master_id=snapshot.master_id,
            indie_master_id=snapshot.indie_master_id,
            salon_id=snapshot.salon_id,
            branch_id=snapshot.branch_id,
            start_time=to_naive(snapshot.start_time),
            end_time=to_naive(snapshot.end_time),
            status=snapshot.status,
            payment_amount=snapshot.payment_amount,
            loyalty_points_used=snapshot.loyalty_points_used,
            notes=snapshot.notes,
            payment_method=snapshot.payment_method,
        )
        atomic_db.add(booking)
        atomic_db.flush()

        if snapshot.applied_discount is not None:
            disc = snapshot.applied_discount
            atomic_db.add(
                AppliedDiscount(
                    booking_id=booking.id,
                    discount_id=disc.rule_id if disc.rule_type != "personal" else None,
                    personal_discount_id=(
                        disc.rule_id if disc.rule_type == "personal" else None
                    ),
                    discount_percent=disc.discount_percent,
                    discount_amount=disc.discount_amount,
                )
            )
            atomic_db.flush()

        if fail_after_flush_hook is not None:
            fail_after_flush_hook()

        return BookingCreateResult(
            booking_id=booking.id,
            client_id=client_id,
            created_new_user=created_new_user,
            service_id=service_id,
            created_new_service=created_new_service,
        )

    return run_atomic_writer(_write, bind=bind)


def discount_snapshot_from_data(
    applied_discount_data: Optional[dict],
) -> Optional[AppliedDiscountSnapshot]:
    if not applied_discount_data:
        return None
    rule_type = applied_discount_data.get("rule_type")
    rule_id = applied_discount_data.get("rule_id")
    percent = applied_discount_data.get("discount_percent")
    amount = applied_discount_data.get("discount_amount")
    if rule_type is None or percent is None or amount is None:
        return None
    return AppliedDiscountSnapshot(
        rule_type=str(rule_type),
        rule_id=rule_id,
        discount_percent=float(percent),
        discount_amount=float(amount),
    )


__all__ = [
    "AppliedDiscountSnapshot",
    "BOOKING_ATOMIC_UNSUPPORTED_CODE",
    "BOOKING_SLOT_BUSY_CODE",
    "BOOKING_SLOT_CONFLICT_CODE",
    "BookingAtomicPendingWrites",
    "BookingAtomicUnsupported",
    "BookingCreateResult",
    "BookingCreateSnapshot",
    "BookingPublicClientInvalid",
    "BookingSlotBusy",
    "BookingSlotConflict",
    "CanonicalServiceSnapshot",
    "NON_OCCUPYING_BOOKING_STATUSES",
    "PublicClientSnapshot",
    "SLOT_BUSY_DETAIL",
    "SLOT_BUSY_RETRY_AFTER",
    "SLOT_CONFLICT_DETAIL",
    "after_overlap_check_hook",
    "create_booking_atomic",
    "discount_snapshot_from_data",
    "fail_after_flush_hook",
    "fail_after_service_flush_hook",
    "find_canonical_solo_service",
    "get_or_create_canonical_service",
    "has_overlapping_booking",
    "http_exception_for_booking_atomic",
    "http_exception_for_booking_create",
    "intervals_overlap",
    "release_request_session",
]

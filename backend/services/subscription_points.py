"""Списание subscription points при покупке/продлении тарифа мастера."""
from __future__ import annotations

import math
from typing import Optional

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    Master,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionPriceSnapshot,
)

# Бизнес-правило: 1 subscription point = 1 ₽ (не путать с booking loyalty points).
SUBSCRIPTION_POINT_RUBLES = 1

_DEBIT_DIRECTION = SubscriptionPointsDirection.DEBIT.name
_CREDIT_DIRECTION = SubscriptionPointsDirection.CREDIT.name
_ACTIVE_STATUS = SubscriptionPointsStatus.ACTIVE.name
_CONSUMED_STATUS = SubscriptionPointsStatus.CONSUMED.name


class InsufficientSubscriptionPointsError(Exception):
    """Недостаточно subscription points для списания."""


class SubscriptionPointsValidationError(ValueError):
    pass


def get_master_id_for_user(db: Session, user_id: int) -> Optional[int]:
    master = db.query(Master).filter(Master.user_id == user_id).first()
    return master.id if master else None


def normalize_subscription_points_to_use(raw: Optional[int]) -> int:
    if raw is None:
        return 0
    value = int(raw)
    if value < 0:
        raise SubscriptionPointsValidationError("subscription_points_to_use must be >= 0")
    return value


def compute_subscription_points_redemption(
    *,
    price_before_points: float,
    requested_points: int,
    available_points: int,
) -> tuple[int, float]:
    """
    Возвращает (points_used, final_price).
    points_used = min(requested, available, floor(price_before_points)).
    """
    requested = normalize_subscription_points_to_use(requested_points)
    price_cap = max(0, int(math.floor(float(price_before_points or 0))))
    used = min(requested, max(0, int(available_points or 0)), price_cap)
    final_price = max(0.0, float(price_before_points) - used * SUBSCRIPTION_POINT_RUBLES)
    return used, final_price


def _is_sqlite(db: Session) -> bool:
    return db.get_bind().dialect.name == "sqlite"


def _ensure_sqlite_write_lock(db: Session) -> None:
    """
    SQLite: BEGIN IMMEDIATE для сериализации writers.
    SELECT FOR UPDATE на SQLite не даёт row-level lock — полагаемся на write lock + atomic UPDATE.
    """
    if not _is_sqlite(db):
        return
    # Если транзакция уже начата (autobegin), повторный BEGIN даст ошибку — это нормально:
    # дальше защищают atomic UPDATE ... WHERE remaining_amount >= take.
    in_tx = db.in_transaction()
    if not in_tx:
        db.execute(text("BEGIN IMMEDIATE"))


def _debit_source_type(*, payment_id: Optional[int]) -> SubscriptionPointsSourceType:
    if payment_id is not None:
        return SubscriptionPointsSourceType.SUBSCRIPTION_PAYMENT
    return SubscriptionPointsSourceType.SUBSCRIPTION_SNAPSHOT


def _existing_debit(
    db: Session,
    *,
    master_id: int,
    source_type: SubscriptionPointsSourceType,
    source_id: int,
) -> Optional[SubscriptionPointsLedger]:
    return (
        db.query(SubscriptionPointsLedger)
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.DEBIT,
            SubscriptionPointsLedger.source_type == source_type,
            SubscriptionPointsLedger.source_id == source_id,
        )
        .first()
    )


def _is_debit_unique_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    message = str(orig or exc).lower()
    return "uq_subscription_points_debit_source" in message or "unique constraint failed" in message


def _atomic_take_from_credit(db: Session, *, credit_id: int, master_id: int, take: int) -> bool:
    """Атомарно уменьшает remaining_amount; возвращает False, если take нельзя списать."""
    result = db.execute(
        text(
            """
            UPDATE subscription_points_ledger
            SET remaining_amount = remaining_amount - :take,
                status = CASE
                    WHEN remaining_amount - :take <= 0 THEN :consumed
                    ELSE status
                END
            WHERE id = :credit_id
              AND master_id = :master_id
              AND direction = :credit_direction
              AND status = :active_status
              AND remaining_amount >= :take
            """
        ),
        {
            "take": take,
            "credit_id": credit_id,
            "master_id": master_id,
            "credit_direction": _CREDIT_DIRECTION,
            "active_status": _ACTIVE_STATUS,
            "consumed": _CONSUMED_STATUS,
        },
    )
    return int(result.rowcount or 0) == 1


def debit_subscription_points_fifo(
    db: Session,
    *,
    master_id: int,
    points: int,
    source_type: SubscriptionPointsSourceType,
    source_id: int,
    description: str,
    metadata: Optional[dict] = None,
) -> Optional[SubscriptionPointsLedger]:
    """
    FIFO-списание по CREDIT.remaining_amount.
    Идемпотентно по (master_id, direction=DEBIT, source_type, source_id).
    Concurrency-safe на SQLite: atomic UPDATE + optional BEGIN IMMEDIATE + unique index на DEBIT.
    """
    amount = int(points or 0)
    if amount <= 0:
        return None

    existing = _existing_debit(db, master_id=master_id, source_type=source_type, source_id=source_id)
    if existing:
        return existing

    _ensure_sqlite_write_lock(db)

    remaining = amount
    allocations: list[dict] = []
    max_iterations = max(amount * 4, 32)
    iterations = 0

    while remaining > 0:
        iterations += 1
        if iterations > max_iterations:
            raise InsufficientSubscriptionPointsError(
                f"Insufficient subscription points: allocation loop exceeded for master {master_id}"
            )

        credit = (
            db.query(SubscriptionPointsLedger)
            .filter(
                SubscriptionPointsLedger.master_id == master_id,
                SubscriptionPointsLedger.direction == SubscriptionPointsDirection.CREDIT,
                SubscriptionPointsLedger.status == SubscriptionPointsStatus.ACTIVE,
                SubscriptionPointsLedger.remaining_amount > 0,
            )
            .order_by(SubscriptionPointsLedger.created_at.asc(), SubscriptionPointsLedger.id.asc())
            .first()
        )
        if not credit:
            raise InsufficientSubscriptionPointsError(
                f"Insufficient subscription points: need {amount}, short {remaining}"
            )

        take = min(int(credit.remaining_amount or 0), remaining)
        if take <= 0:
            db.expire(credit)
            continue

        if not _atomic_take_from_credit(db, credit_id=int(credit.id), master_id=master_id, take=take):
            db.expire(credit)
            continue

        remaining -= take
        allocations.append({"credit_id": int(credit.id), "amount": take})
        db.expire(credit)

    entry = SubscriptionPointsLedger(
        master_id=master_id,
        amount=amount,
        remaining_amount=0,
        direction=SubscriptionPointsDirection.DEBIT,
        source_type=source_type,
        source_id=source_id,
        status=SubscriptionPointsStatus.ACTIVE,
        description=description,
        extra_metadata={"allocations": allocations, **(metadata or {})},
    )

    savepoint = db.begin_nested()
    try:
        db.add(entry)
        db.flush()
    except IntegrityError as exc:
        savepoint.rollback()
        if _is_debit_unique_violation(exc):
            existing = _existing_debit(
                db, master_id=master_id, source_type=source_type, source_id=source_id
            )
            if existing:
                return existing
        raise InsufficientSubscriptionPointsError(
            f"Concurrent debit conflict for master {master_id} source {source_type.value}:{source_id}"
        ) from exc

    return entry


def apply_snapshot_subscription_points_debit(
    db: Session,
    *,
    snapshot: SubscriptionPriceSnapshot,
    master_id: int,
    payment_id: Optional[int] = None,
) -> Optional[SubscriptionPointsLedger]:
    """
    Списать баллы, зафиксированные в snapshot.subscription_points_used.
    Идемпотентно: повторный вызов не создаёт второй DEBIT.
    """
    points_used = int(getattr(snapshot, "subscription_points_used", 0) or 0)
    if points_used <= 0:
        return None

    if getattr(snapshot, "subscription_points_debit_ledger_id", None):
        existing = (
            db.query(SubscriptionPointsLedger)
            .filter(SubscriptionPointsLedger.id == snapshot.subscription_points_debit_ledger_id)
            .first()
        )
        if existing:
            return existing

    source_type = _debit_source_type(payment_id=payment_id)
    source_id = int(payment_id) if payment_id is not None else int(snapshot.id)
    meta = {
        "snapshot_id": snapshot.id,
        "payment_id": payment_id,
        "subscription_points_used": points_used,
    }
    entry = debit_subscription_points_fifo(
        db,
        master_id=master_id,
        points=points_used,
        source_type=source_type,
        source_id=source_id,
        description="Списание баллов на оплату подписки",
        metadata=meta,
    )
    if entry:
        snapshot.subscription_points_debit_ledger_id = entry.id
    return entry

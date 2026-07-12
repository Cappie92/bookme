"""Публичный идентификатор платежа для внешних URL и API (не DB id)."""
from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

_MAX_ATTEMPTS = 64


def generate_payment_public_id_candidate() -> str:
    return secrets.token_urlsafe(24)


def _is_public_id_integrity_error(exc: IntegrityError) -> bool:
    err = str(getattr(exc, "orig", exc)).lower()
    return "public_id" in err or "ix_payments_public_id" in err


def backfill_payment_public_ids(connection: Any) -> int:
    """Заполняет public_id для строк payments без значения. Возвращает число обновлённых строк."""
    rows = connection.execute(
        text("SELECT id FROM payments WHERE public_id IS NULL OR public_id = ''")
    ).fetchall()
    updated = 0
    for (pid,) in rows:
        assigned = False
        for _ in range(_MAX_ATTEMPTS):
            cand = generate_payment_public_id_candidate()
            exists = connection.execute(
                text("SELECT 1 FROM payments WHERE public_id = :p LIMIT 1"),
                {"p": cand},
            ).scalar()
            if not exists:
                connection.execute(
                    text("UPDATE payments SET public_id = :p WHERE id = :id"),
                    {"p": cand, "id": pid},
                )
                updated += 1
                assigned = True
                break
        if not assigned:
            raise RuntimeError(f"Could not backfill public_id for payment id={pid}")

    remaining = connection.execute(
        text("SELECT COUNT(*) FROM payments WHERE public_id IS NULL OR public_id = ''")
    ).scalar()
    if remaining:
        raise RuntimeError(
            f"payments.public_id backfill incomplete: {remaining} rows without public_id"
        )

    duplicates = connection.execute(
        text(
            "SELECT public_id FROM payments "
            "GROUP BY public_id HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).fetchall()
    if duplicates:
        raise RuntimeError(
            f"payments.public_id backfill produced duplicate: {duplicates[0][0]}"
        )

    return updated


def ensure_payment_public_id_allocated(connection: Any, target: Any) -> None:
    """Вызывается из SQLAlchemy before_insert: заполняет target.public_id, если пусто."""
    existing = getattr(target, "public_id", None)
    if existing is not None and str(existing).strip():
        return
    for _ in range(_MAX_ATTEMPTS):
        cand = generate_payment_public_id_candidate()
        row = connection.execute(
            text("SELECT 1 FROM payments WHERE public_id = :p LIMIT 1"),
            {"p": cand},
        ).first()
        if row is None:
            target.public_id = cand
            return
    raise RuntimeError("Could not allocate unique payment public_id")


def persist_new_payment(db: Session, payment: Any) -> Any:
    """Сохраняет Payment; при коллизии public_id повторяет с новым токеном."""
    for attempt in range(_MAX_ATTEMPTS):
        if attempt > 0:
            payment.public_id = None
        db.add(payment)
        try:
            db.commit()
            db.refresh(payment)
            return payment
        except IntegrityError as exc:
            db.rollback()
            if not _is_public_id_integrity_error(exc):
                raise
            if attempt >= _MAX_ATTEMPTS - 1:
                raise RuntimeError("Could not persist payment with unique public_id") from exc
    raise RuntimeError("Could not persist payment with unique public_id")


def _temp_robokassa_invoice_placeholder() -> str:
    return f"tmp-{secrets.token_hex(16)}"


def _is_robokassa_invoice_integrity_error(exc: IntegrityError) -> bool:
    err = str(getattr(exc, "orig", exc)).lower()
    return "robokassa_invoice_id" in err or "idx_payment_robokassa_invoice" in err


def persist_new_robokassa_payment(db: Session, payment: Any) -> Any:
    """
    Сохраняет Payment для Robokassa:
    flush → robokassa_invoice_id = str(payment.id) → commit.

    Временный placeholder существует только внутри транзакции до commit.
    """
    from utils.robokassa import robokassa_invoice_id_from_payment_id

    for attempt in range(_MAX_ATTEMPTS):
        if attempt > 0:
            payment.public_id = None
        payment.robokassa_invoice_id = _temp_robokassa_invoice_placeholder()
        db.add(payment)
        try:
            db.flush()
            payment.robokassa_invoice_id = robokassa_invoice_id_from_payment_id(payment.id)
            db.commit()
            db.refresh(payment)
            return payment
        except IntegrityError as exc:
            db.rollback()
            if _is_public_id_integrity_error(exc) or _is_robokassa_invoice_integrity_error(exc):
                if attempt >= _MAX_ATTEMPTS - 1:
                    raise RuntimeError(
                        "Could not persist Robokassa payment with unique public_id/invoice_id"
                    ) from exc
                continue
            raise
    raise RuntimeError("Could not persist Robokassa payment with unique public_id/invoice_id")

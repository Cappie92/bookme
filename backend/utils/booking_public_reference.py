"""
Публичный код записи для клиентских экранов (не DB id).
Формат: DD- + 8 символов Crockford base32 (без I, L, O, U), только верхний регистр.
"""
from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy import text

# Crockford base32 — без похожих символов
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_PREFIX = "DD-"
_CODE_LEN = 8
_MAX_ATTEMPTS = 64


def normalize_public_booking_reference(ref: str | None) -> str:
    if not ref:
        return ""
    return str(ref).strip().upper()


def generate_public_booking_reference_candidate() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))
    return f"{_PREFIX}{body}"


def ensure_booking_public_reference_allocated(connection: Any, target: Any) -> None:
    """Вызывается из SQLAlchemy before_insert: заполняет target.public_reference, если пусто."""
    existing = getattr(target, "public_reference", None)
    if existing is not None and str(existing).strip():
        target.public_reference = normalize_public_booking_reference(str(existing))
        return
    for _ in range(_MAX_ATTEMPTS):
        cand = generate_public_booking_reference_candidate()
        row = connection.execute(
            text("SELECT 1 FROM bookings WHERE public_reference = :r LIMIT 1"),
            {"r": cand},
        ).first()
        if row is None:
            target.public_reference = cand
            return
    raise RuntimeError("Could not allocate unique booking public_reference")

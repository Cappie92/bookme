"""Persisted idempotency receipts for future calendar writes.

A receipt is written in the same reserved transaction as the domain row, so a
rollback never leaves a success receipt behind. Only digests are stored.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Optional

from sqlalchemy.orm import Session

from models import IdempotencyReceipt
from services.calendar_admission import in_admission_transaction


MAX_IDEMPOTENCY_KEY_LENGTH = 255
IDEMPOTENCY_KEY_REUSED_CODE = "IDEMPOTENCY_KEY_REUSED"


class IdempotencyKeyReused(Exception):
    """Same key, different intent. HTTP adapters may map this to 409."""

    code = IDEMPOTENCY_KEY_REUSED_CODE


def hash_idempotency_key(raw_key: str) -> str:
    if (
        not isinstance(raw_key, str)
        or not raw_key
        or len(raw_key) > MAX_IDEMPOTENCY_KEY_LENGTH
    ):
        raise ValueError("idempotency key must be 1-255 characters")
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def request_fingerprint(intent: Mapping[str, Any]) -> str:
    """SHA-256 of canonical JSON; non-JSON values must be serialized by the caller."""

    canonical = json.dumps(
        intent, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def find_receipt(
    db: Session,
    *,
    actor_user_id: int,
    scope: str,
    raw_key: str,
    fingerprint: str,
) -> Optional[IdempotencyReceipt]:
    receipt = (
        db.query(IdempotencyReceipt)
        .filter(
            IdempotencyReceipt.actor_user_id == actor_user_id,
            IdempotencyReceipt.scope == scope,
            IdempotencyReceipt.key_hash == hash_idempotency_key(raw_key),
        )
        .first()
    )
    if receipt is not None and receipt.request_hash != fingerprint:
        raise IdempotencyKeyReused("idempotency key was used for a different request")
    return receipt


def record_receipt(
    db: Session,
    *,
    actor_user_id: int,
    scope: str,
    raw_key: str,
    fingerprint: str,
    resource_type: str,
    resource_id: int,
) -> IdempotencyReceipt:
    if db.get_bind().dialect.name == "sqlite" and not in_admission_transaction(db):
        raise RuntimeError(
            "receipts must be recorded inside a calendar admission transaction"
        )
    receipt = IdempotencyReceipt(
        actor_user_id=actor_user_id,
        scope=scope,
        key_hash=hash_idempotency_key(raw_key),
        request_hash=fingerprint,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    db.add(receipt)
    db.flush()
    return receipt

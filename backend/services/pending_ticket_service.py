import json
import secrets
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status

from settings import get_settings


pending_ticket_memory_store: dict[str, dict] = {}


def _storage_key(purpose: str, ticket: str) -> str:
    return f"pending_ticket:{purpose}:{ticket}"


def _memory_key(purpose: str, ticket: str) -> str:
    return f"{purpose}:{ticket}"


def _unavailable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


def _cleanup_memory() -> None:
    now = int(datetime.utcnow().timestamp())
    for key, value in list(pending_ticket_memory_store.items()):
        if int(value.get("exp") or 0) <= now:
            pending_ticket_memory_store.pop(key, None)


def store_pending_ticket(
    *, purpose: str, payload: dict, ttl_seconds: int, unavailable_detail: str
) -> str:
    ticket = secrets.token_urlsafe(32)
    data = {
        "purpose": purpose,
        **payload,
        "exp": int(datetime.utcnow().timestamp()) + ttl_seconds,
    }
    try:
        from sms import redis_client

        redis_client.setex(
            _storage_key(purpose, ticket),
            ttl_seconds,
            json.dumps(data, separators=(",", ":")),
        )
    except Exception:
        if get_settings().is_production:
            raise _unavailable(unavailable_detail)
        _cleanup_memory()
        pending_ticket_memory_store[_memory_key(purpose, ticket)] = data
    return ticket


def get_pending_ticket(
    ticket: str, *, purpose: str, unavailable_detail: str
) -> Optional[dict]:
    normalized = str(ticket or "").strip()
    if not normalized:
        return None
    try:
        from sms import redis_client

        raw = redis_client.get(_storage_key(purpose, normalized))
        if not raw:
            return None
        data = json.loads(raw)
    except Exception:
        if get_settings().is_production:
            raise _unavailable(unavailable_detail)
        _cleanup_memory()
        data = pending_ticket_memory_store.get(_memory_key(purpose, normalized))
        if not data:
            return None
    if (
        data.get("purpose") != purpose
        or int(data.get("exp") or 0) <= int(datetime.utcnow().timestamp())
    ):
        delete_pending_ticket(
            normalized, purpose=purpose, unavailable_detail=unavailable_detail
        )
        return None
    return dict(data)


def save_pending_ticket(
    ticket: str, data: dict, *, purpose: str, unavailable_detail: str
) -> None:
    normalized = str(ticket or "").strip()
    if data.get("purpose") != purpose:
        raise ValueError("Pending ticket purpose mismatch")
    ttl = max(1, int(data.get("exp") or 0) - int(datetime.utcnow().timestamp()))
    try:
        from sms import redis_client

        redis_client.setex(
            _storage_key(purpose, normalized),
            ttl,
            json.dumps(data, separators=(",", ":")),
        )
    except Exception:
        if get_settings().is_production:
            raise _unavailable(unavailable_detail)
        pending_ticket_memory_store[_memory_key(purpose, normalized)] = dict(data)


def delete_pending_ticket(
    ticket: str, *, purpose: str, unavailable_detail: str
) -> None:
    normalized = str(ticket or "").strip()
    try:
        from sms import redis_client

        redis_client.delete(_storage_key(purpose, normalized))
    except Exception:
        if get_settings().is_production:
            raise _unavailable(unavailable_detail)
        pending_ticket_memory_store.pop(_memory_key(purpose, normalized), None)


def claim_pending_ticket(
    ticket: str, *, purpose: str, unavailable_detail: str
) -> Optional[dict]:
    """Atomically consume a ticket after proof, preventing confirm replay."""
    normalized = str(ticket or "").strip()
    try:
        from sms import redis_client

        raw = redis_client.getdel(_storage_key(purpose, normalized))
        if not raw:
            return None
        data = json.loads(raw)
    except Exception:
        if get_settings().is_production:
            raise _unavailable(unavailable_detail)
        _cleanup_memory()
        data = pending_ticket_memory_store.pop(_memory_key(purpose, normalized), None)
        if not data:
            return None
    if (
        data.get("purpose") != purpose
        or int(data.get("exp") or 0) <= int(datetime.utcnow().timestamp())
    ):
        return None
    return dict(data)

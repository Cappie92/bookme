"""
SQLite Connection-owned writer transactions (pattern B).

    conn.exec_driver_sql("BEGIN IMMEDIATE")
    atomic_db = Session(bind=conn)
    ... query / add / flush ...
    conn.commit()

Writer-level test hooks live on this module. Production callers must leave them None.
"""
from __future__ import annotations

from typing import Any, Callable, Optional, TypeVar

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

T = TypeVar("T")

BOOKING_SLOT_CONFLICT_CODE = "BOOKING_SLOT_CONFLICT"
BOOKING_SLOT_BUSY_CODE = "BOOKING_SLOT_BUSY"
BOOKING_ATOMIC_UNSUPPORTED_CODE = "BOOKING_ATOMIC_UNSUPPORTED"

SLOT_CONFLICT_DETAIL = "Выбранное время уже занято"
SLOT_BUSY_DETAIL = "Сервис временно недоступен, повторите попытку"
SLOT_BUSY_RETRY_AFTER = "1"

before_begin_hook: Optional[Callable[[], None]] = None


class BookingSlotConflict(Exception):
    """Requested interval overlaps an occupying Booking."""


class BookingSlotBusy(Exception):
    """SQLite writer lock timed out."""


class BookingAtomicUnsupported(Exception):
    """Non-SQLite dialect has no implemented slot-locking strategy."""


class BookingAtomicPendingWrites(Exception):
    """Request Session still has uncommitted ORM writes; refuse silent rollback."""


class BookingPublicClientInvalid(Exception):
    """Phone belongs to a non-client account."""


class BookingNotFound(Exception):
    """Target Booking / request / temporary row is missing."""


class BookingForbidden(Exception):
    """Caller is not allowed to mutate this Booking."""


class BookingMutationInvalid(Exception):
    """Business-rule rejection that is not a slot conflict."""


def release_request_session(db: Session) -> None:
    if db.new or db.dirty or db.deleted:
        raise BookingAtomicPendingWrites(
            "request Session has pending writes; move them into the atomic core"
        )
    db.rollback()


def _as_engine(bind: Any):
    if bind is None:
        from database import engine

        return engine
    if hasattr(bind, "connect") and hasattr(bind, "dialect") and hasattr(bind, "url"):
        return bind
    if hasattr(bind, "engine"):
        return bind.engine
    raise TypeError(f"Unsupported bind type for atomic booking: {type(bind)!r}")


def _is_sqlite_lock_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "database is locked" in text or "database is busy" in text


def _begin_writer_transaction(conn) -> None:
    dialect = conn.dialect.name
    if dialect == "sqlite":
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        except OperationalError as exc:
            if _is_sqlite_lock_error(exc):
                raise BookingSlotBusy(str(exc)) from exc
            raise
        return
    raise BookingAtomicUnsupported(
        f"Atomic booking writer lock is not implemented for dialect {dialect!r}"
    )


def run_atomic_writer(fn: Callable[[Session], T], *, bind: Any = None) -> T:
    """
    Open a Connection-owned IMMEDIATE transaction and run fn(atomic_db).
    fn must only query/add/flush. Do not call external I/O inside fn.
    """
    engine = _as_engine(bind)
    if before_begin_hook is not None:
        before_begin_hook()

    conn = engine.connect()
    atomic_db: Optional[Session] = None
    try:
        begin = globals()["_begin_writer_transaction"]
        begin(conn)
        atomic_db = Session(bind=conn, autocommit=False, autoflush=False)
        try:
            result = fn(atomic_db)
            try:
                conn.commit()
            except OperationalError as exc:
                if _is_sqlite_lock_error(exc):
                    raise BookingSlotBusy(str(exc)) from exc
                raise
            return result
        except Exception:
            try:
                if atomic_db is not None:
                    atomic_db.rollback()
            except Exception:
                pass
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            if atomic_db is not None:
                atomic_db.close()
    finally:
        conn.close()


def http_exception_for_booking_atomic(exc: BaseException):
    from fastapi import HTTPException

    if isinstance(exc, BookingSlotConflict):
        return HTTPException(
            status_code=409,
            detail=SLOT_CONFLICT_DETAIL,
            headers={"X-Error-Code": BOOKING_SLOT_CONFLICT_CODE},
        )
    if isinstance(exc, BookingSlotBusy):
        return HTTPException(
            status_code=503,
            detail=SLOT_BUSY_DETAIL,
            headers={
                "X-Error-Code": BOOKING_SLOT_BUSY_CODE,
                "Retry-After": SLOT_BUSY_RETRY_AFTER,
            },
        )
    if isinstance(exc, BookingAtomicUnsupported):
        return HTTPException(
            status_code=500,
            detail="Atomic booking is not configured for this database dialect",
            headers={"X-Error-Code": BOOKING_ATOMIC_UNSUPPORTED_CODE},
        )
    if isinstance(exc, BookingPublicClientInvalid):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, BookingAtomicPendingWrites):
        return HTTPException(
            status_code=500,
            detail="Booking write aborted: request session had pending writes",
        )
    if isinstance(exc, BookingNotFound):
        return HTTPException(status_code=404, detail=str(exc) or "Not found")
    if isinstance(exc, BookingForbidden):
        return HTTPException(status_code=403, detail=str(exc) or "Доступ запрещён")
    if isinstance(exc, BookingMutationInvalid):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


http_exception_for_booking_create = http_exception_for_booking_atomic

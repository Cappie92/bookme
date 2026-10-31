"""Transactional foundation for future calendar write adapters.

No production route is connected in Phase A.  The boundary is intentionally
SQLite-specific: it reserves the single writer before the business callback can
read occupancy and owns the complete commit/rollback lifecycle.
"""

from __future__ import annotations

import sqlite3
from enum import Enum
from typing import Callable, TypeVar

from sqlalchemy import event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, SessionTransactionOrigin

from services.calendar_availability import AvailabilityResult, AvailabilityState
from services.calendar_time import CanonicalInterval


T = TypeVar("T")
_TRANSACTION_MARKER = "calendar_admission_transaction"


class AdmissionError(Exception):
    pass


class AdmissionConflict(AdmissionError):
    """A proven domain conflict.  HTTP adapters may map this to 409."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class AdmissionPolicyViolation(AdmissionError):
    """A request violates hours/grid policy; it is not an occupancy conflict."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class AdmissionUnresolvedTime(AdmissionError):
    """Occupancy cannot be interpreted safely; this is not a 409 conflict."""

    def __init__(self, unresolved_sources: tuple[str, ...]):
        super().__init__("calendar occupancy contains unresolved time")
        self.unresolved_sources = unresolved_sources


class AdmissionBusy(AdmissionError):
    """SQLite could not reserve the writer; HTTP adapters should return 503."""

    code = "BOOKING_SLOT_BUSY"
    retry_after_seconds = 1


class AdmissionUnsupportedDatabase(AdmissionError):
    """A dialect needs its own row-locking adapter before production use."""


class TransactionState(str, Enum):
    NEW = "new"
    RESERVED = "reserved"
    COMMITTED = "committed"
    ROLLED_BACK = "rolled_back"


def ensure_candidate_available(
    result: AvailabilityResult,
    candidate: CanonicalInterval,
    *,
    allow_outside_working_hours: bool = False,
) -> None:
    """Apply hours/grid/occupancy policy without allowing override to bypass occupancy.

    Adapters supporting outside-hours bookings must provide an owner-authorized
    all-day grid; the override only bypasses the working-window containment check.
    """

    if result.state is AvailabilityState.UNRESOLVED:
        raise AdmissionUnresolvedTime(result.unresolved_sources)
    if candidate.start not in result.grid_starts:
        raise AdmissionPolicyViolation(
            "BOOKING_SLOT_OFF_GRID", "requested start is off grid"
        )
    if any(candidate.overlaps(interval) for interval in result.occupied_intervals):
        raise AdmissionConflict(
            "BOOKING_SLOT_CONFLICT", "requested interval is occupied"
        )
    inside_working_hours = any(
        window.contains(candidate) for window in result.working_windows
    )
    if not inside_working_hours and not allow_outside_working_hours:
        raise AdmissionPolicyViolation(
            "BOOKING_OUTSIDE_WORKING_HOURS",
            "requested interval is outside working hours",
        )


def in_admission_transaction(session: Session) -> bool:
    return session.info.get(_TRANSACTION_MARKER) is not None


def _is_sqlite_busy(exc: OperationalError) -> bool:
    error_code = getattr(exc.orig, "sqlite_errorcode", None)
    if isinstance(error_code, int) and error_code & 0xFF in (
        sqlite3.SQLITE_BUSY,
        sqlite3.SQLITE_LOCKED,
    ):
        return True
    message = str(exc).lower()
    return "database is locked" in message or "database is busy" in message


class SQLiteAdmissionTransaction:
    """One reserved SQLite transaction around all admission reads/writes.

    The operation may not commit, rollback, close the Session, or use savepoints.
    Phase A intentionally guarantees one root commit or one full rollback.
    """

    def __init__(self, session: Session):
        self.session = session
        self.state = TransactionState.NEW
        self._transaction = None
        self._finishing = False

    def _reject_internal_commit(self, session: Session) -> None:
        if not self._finishing:
            raise RuntimeError("admission operation cannot commit its transaction")

    def _observe_transaction_end(self, session: Session, transaction) -> None:
        if transaction is self._transaction and not self._finishing:
            session.info.pop(_TRANSACTION_MARKER, None)
            self.state = TransactionState.ROLLED_BACK

    def __enter__(self) -> "SQLiteAdmissionTransaction":
        if self.state is not TransactionState.NEW:
            raise RuntimeError("calendar admission transaction cannot be reused")
        if self.session.get_bind().dialect.name != "sqlite":
            raise AdmissionUnsupportedDatabase(
                "non-SQLite admission requires an owner row-lock adapter"
            )
        if self.session.info.get(_TRANSACTION_MARKER):
            raise RuntimeError("nested calendar admission transaction")
        if self.session.new or self.session.dirty or self.session.deleted:
            raise RuntimeError("writer reservation must happen before mutations")
        if self.session.in_transaction():
            transaction = self.session.get_transaction()
            if transaction.origin is not SessionTransactionOrigin.AUTOBEGIN:
                raise RuntimeError(
                    "calendar admission cannot replace an explicit transaction"
                )
            raw_connection = self.session.connection().connection.driver_connection
            if getattr(raw_connection, "in_transaction", False):
                raise RuntimeError("writer reservation must happen before mutations")

        # Authentication may have autobegun a read transaction.  Closing a clean
        # read transaction is safe; all business reads must happen after enter.
        if self.session.in_transaction():
            self.session.rollback()
        try:
            self.session.execute(text("BEGIN IMMEDIATE"))
        except OperationalError as exc:
            self.session.rollback()
            if _is_sqlite_busy(exc):
                raise AdmissionBusy("SQLite writer is busy") from exc
            raise

        self.session.info[_TRANSACTION_MARKER] = self
        self._transaction = self.session.get_transaction()
        event.listen(self.session, "before_commit", self._reject_internal_commit)
        event.listen(
            self.session,
            "after_transaction_end",
            self._observe_transaction_end,
        )
        self.state = TransactionState.RESERVED
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        try:
            if exc_type is not None:
                self._finishing = True
                self.session.rollback()
                self.state = TransactionState.ROLLED_BACK
                if isinstance(exc, OperationalError) and _is_sqlite_busy(exc):
                    raise AdmissionBusy("SQLite writer is busy") from exc
            elif (
                self.session.get_transaction() is not self._transaction
                or not self._transaction.is_active
            ):
                self._finishing = True
                self.session.rollback()
                self.state = TransactionState.ROLLED_BACK
                raise RuntimeError("admission operation ended the reserved transaction")
            else:
                self._finishing = True
                self.session.commit()
                self.state = TransactionState.COMMITTED
        except OperationalError as db_exc:
            self.session.rollback()
            self.state = TransactionState.ROLLED_BACK
            if _is_sqlite_busy(db_exc):
                raise AdmissionBusy("SQLite writer is busy") from db_exc
            raise
        except Exception:
            self.session.rollback()
            self.state = TransactionState.ROLLED_BACK
            raise
        finally:
            event.remove(
                self.session,
                "after_transaction_end",
                self._observe_transaction_end,
            )
            event.remove(self.session, "before_commit", self._reject_internal_commit)
            self.session.info.pop(_TRANSACTION_MARKER, None)
        return False


def run_sqlite_admission(
    session_factory: Callable[[], Session], operation: Callable[[Session], T]
) -> T:
    """Run an operation in an independently owned Session and one transaction."""

    session = session_factory()
    try:
        with SQLiteAdmissionTransaction(session):
            return operation(session)
    finally:
        session.close()

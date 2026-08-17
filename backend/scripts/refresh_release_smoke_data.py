#!/usr/bin/env python3
"""Safely refresh the additive Release 1.0 smoke layer.

The script never creates, deletes, or edits User/Master anchors. By default it
executes the complete refresh and verification flow inside one transaction and
then rolls it back. Use --apply for the single final commit.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Iterable, Sequence
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from sqlalchemy import func, inspect, or_, select, text
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from database import SessionLocal  # noqa: E402
from models import (  # noqa: E402
    AppliedDiscount,
    AvailabilitySlot,
    Booking,
    BookingConfirmation,
    BookingEditRequest,
    BookingStatus,
    Income,
    LoyaltyDiscount,
    LoyaltyDiscountType,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterExpense,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    MissedRevenue,
    OwnerType,
    PersonalDiscount,
    Service,
    ServiceType,
    User,
    UserRole,
    master_services,
)
from services.booking_visit_finalize import finalize_post_visit_booking  # noqa: E402
from services.scheduling import get_available_slots  # noqa: E402
from settings import get_settings  # noqa: E402
from utils.booking_loyalty_reserve import clear_loyalty_points_reserve  # noqa: E402
from utils.loyalty import calculate_client_balance  # noqa: E402
from utils.loyalty_discounts import (  # noqa: E402
    create_applied_discount,
    evaluate_and_prepare_applied_discount,
    evaluate_discount_candidates,
)
from utils.public_booking_loyalty import effective_available_points  # noqa: E402


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_MANIFEST = SCRIPT_DIR / "data" / "release_smoke_manifest.yaml"
EXPECTED_MARKER = "RELEASE_SMOKE:v1"
EXPECTED_MASTER_PHONES = (
    "+79990000008",
    "+79990000002",
    "+79990000003",
)
EXPECTED_CLIENT_PHONES = (
    "+79990000101",
    "+79990000102",
)
ABSOLUTE_MAX_SCHEDULE_ROWS = 3000
SCENARIO_LABELS = (
    "COMPLETED_PAID",
    "COMPLETED_UNPAID",
    "UPCOMING_PAID",
    "UPCOMING_UNPAID",
    "AWAITING_CONFIRMATION",
    "CANCELLED",
    "WITH_DISCOUNT",
    "LOYALTY_RESERVE",
    "COMPLETED_LOYALTY_SPEND_EARN",
)
LOYALTY_DISCOUNT_KEYS = ("first_visit", "returning", "birthday", "happy_hours")


class SmokeRefreshError(RuntimeError):
    """A fail-closed preflight or verification failure."""


@dataclass(frozen=True)
class Anchors:
    masters_by_phone: dict[str, tuple[User, Master]]
    clients_by_phone: dict[str, User]

    @property
    def master_ids(self) -> set[int]:
        return {master.id for _, master in self.masters_by_phone.values()}

    @property
    def master_user_ids(self) -> set[int]:
        return {user.id for user, _ in self.masters_by_phone.values()}

    @property
    def client_ids(self) -> set[int]:
        return {user.id for user in self.clients_by_phone.values()}


@dataclass
class RefreshCounters:
    users_found: int = 0
    users_modified: int = 0
    services_created: int = 0
    master_services_created: int = 0
    loyalty_settings_created: int = 0
    schedule_deleted: int = 0
    schedule_created: int = 0
    bookings_deleted: int = 0
    bookings_created: int = 0
    discount_rules_created: int = 0
    loyalty_transactions_created: int = 0


@dataclass(frozen=True)
class OwnedIds:
    bookings_by_label: dict[str, Booking]
    booking_ids: frozenset[int]
    loyalty_transactions_by_source: dict[str, LoyaltyTransaction]
    loyalty_transaction_ids: frozenset[int]
    loyalty_discount_ids: frozenset[int]
    personal_discount_ids: frozenset[int]
    applied_discount_ids: frozenset[int]
    booking_confirmation_ids: frozenset[int]
    income_ids: frozenset[int]
    missed_revenue_ids: frozenset[int]
    booking_edit_request_ids: frozenset[int]


@dataclass
class CreatedIds:
    services: set[int]
    master_services: set[int]
    master_service_categories: set[int]
    service_links: set[tuple[int, int]]
    loyalty_settings: set[int]
    schedules: set[int]

    @classmethod
    def empty(cls) -> "CreatedIds":
        return cls(set(), set(), set(), set(), set(), set())


def _fail(message: str) -> None:
    raise SmokeRefreshError(message)


def _parse_hhmm(value: Any, field: str) -> time:
    try:
        parsed = datetime.strptime(str(value), "%H:%M").time()
    except (TypeError, ValueError) as exc:
        raise SmokeRefreshError(
            f"Invalid {field}: expected HH:MM, got {value!r}"
        ) from exc
    return parsed


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SmokeRefreshError(f"Manifest not found: {path}") from exc
    except yaml.YAMLError as exc:
        raise SmokeRefreshError(f"Invalid YAML in {path}: {exc}") from exc
    if not isinstance(raw, dict):
        _fail("Manifest root must be a mapping")
    return raw


def _canonical_booking_notes(marker: str) -> dict[str, str]:
    return {label: f"[{marker}][{label}]" for label in SCENARIO_LABELS}


def _canonical_loyalty_sources(marker: str) -> dict[str, str]:
    return {
        "OPENING_PRIMARY": f"{marker}:OPENING_BALANCE_PRIMARY:EARNED",
        "OPENING_SECONDARY": f"{marker}:OPENING_BALANCE_SECONDARY:EARNED",
        "COMPLETED_PAID_EARNED": f"{marker}:COMPLETED_PAID:EARNED",
        "COMPLETED_UNPAID_EARNED": f"{marker}:COMPLETED_UNPAID:EARNED",
        "COMPLETED_LOYALTY_SPEND_EARN_SPENT": (
            f"{marker}:COMPLETED_LOYALTY_SPEND_EARN:SPENT"
        ),
        "COMPLETED_LOYALTY_SPEND_EARN_EARNED": (
            f"{marker}:COMPLETED_LOYALTY_SPEND_EARN:EARNED"
        ),
    }


def _canonical_discount_identifiers(marker: str) -> dict[str, dict[str, str]]:
    description = f"[{marker}] Release smoke discount"
    return {
        "first_visit": {"name": f"First visit [{marker}]", "description": description},
        "returning": {"name": f"Returning [{marker}]", "description": description},
        "birthday": {"name": f"Birthday [{marker}]", "description": description},
        "happy_hours": {"name": f"Happy hours [{marker}]", "description": description},
    }


def _validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("version") != 1:
        _fail("Manifest version must be 1")
    if manifest.get("marker") != EXPECTED_MARKER:
        _fail(f"Manifest marker must be exactly {EXPECTED_MARKER!r}")

    ownership = manifest.get("ownership") or {}
    if ownership.get("booking_notes") != _canonical_booking_notes(EXPECTED_MARKER):
        _fail("ownership.booking_notes must equal the canonical exact note map")
    if ownership.get("loyalty_sources") != _canonical_loyalty_sources(EXPECTED_MARKER):
        _fail("ownership.loyalty_sources must equal the canonical exact source map")
    if ownership.get("loyalty_discounts") != _canonical_discount_identifiers(
        EXPECTED_MARKER
    ):
        _fail(
            "ownership.loyalty_discounts must equal the canonical exact identifier map"
        )
    if ownership.get("personal_discount") != {
        "description": f"Personal discount [{EXPECTED_MARKER}]"
    }:
        _fail("ownership.personal_discount must equal the canonical exact identifier")
    if set(ownership) != {
        "booking_notes",
        "loyalty_sources",
        "loyalty_discounts",
        "personal_discount",
    }:
        _fail("Manifest ownership contains unknown or missing sections")

    users = manifest.get("users") or {}
    masters = tuple(users.get("masters") or ())
    clients = tuple(users.get("clients") or ())
    if masters != EXPECTED_MASTER_PHONES:
        _fail(f"Master allowlist must be exactly {EXPECTED_MASTER_PHONES}")
    if clients != EXPECTED_CLIENT_PHONES:
        _fail(f"Client allowlist must be exactly {EXPECTED_CLIENT_PHONES}")

    allowed = {
        str(x).strip().lower() for x in manifest.get("allowed_environments") or []
    }
    if allowed != {"development", "staging", "test"}:
        _fail("allowed_environments must be exactly development, staging, test")

    for key, expected in (
        ("primary_master_phone", EXPECTED_MASTER_PHONES[0]),
        ("primary_client_phone", EXPECTED_CLIENT_PHONES[0]),
        ("secondary_client_phone", EXPECTED_CLIENT_PHONES[1]),
    ):
        if manifest.get(key) != expected:
            _fail(f"{key} must be {expected}")

    window = manifest.get("refresh_window") or {}
    if (
        int(window.get("days_before", -1)) != 7
        or int(window.get("days_after", -1)) != 35
    ):
        _fail("Refresh window must remain today -7 through today +35")

    service_specs = manifest.get("services") or []
    if [int(x.get("duration", 0)) for x in service_specs] != [30, 60, 90]:
        _fail("Service durations must be exactly 30, 60, 90 minutes")

    schedule_limit = int(
        (manifest.get("schedule") or {}).get("max_existing_rows_in_scope", 0)
    )
    if schedule_limit <= 0 or schedule_limit > ABSOLUTE_MAX_SCHEDULE_ROWS:
        _fail(
            "schedule.max_existing_rows_in_scope must be between 1 and "
            f"{ABSOLUTE_MAX_SCHEDULE_ROWS}"
        )
    schedule = manifest.get("schedule") or {}
    offsets = [int(value) for value in schedule.get("working_day_offsets") or []]
    if offsets != [-3, 3, 4, 5, 6, 7] or len(offsets) != len(set(offsets)):
        _fail("schedule.working_day_offsets must equal the canonical relative dates")
    if int(schedule.get("closed_day_offset", 0)) != 6:
        _fail("schedule.closed_day_offset must be 6")
    if int(schedule.get("partial_day_offset", 0)) != 7:
        _fail("schedule.partial_day_offset must be 7")


def _guard_environment(manifest: dict[str, Any], *, apply: bool) -> str:
    explicit_environment = (os.environ.get("ENVIRONMENT") or "").strip().lower()
    if apply and not explicit_environment:
        _fail("--apply requires ENVIRONMENT to be explicitly set")
    environment = get_settings().ENVIRONMENT.strip().lower()
    if apply and explicit_environment != environment:
        _fail("Explicit ENVIRONMENT does not match the loaded application settings")
    allowed = {str(x).strip().lower() for x in manifest["allowed_environments"]}
    if environment in {"prod", "production", "live"}:
        _fail(f"Production-like ENVIRONMENT={environment!r} is always forbidden")
    if environment not in allowed:
        _fail(
            f"Refusing to run in ENVIRONMENT={environment!r}; allowed: "
            + ", ".join(sorted(allowed))
        )
    return environment


def _configure_connection_safety(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        db.execute(text("PRAGMA foreign_keys = ON"))
        enabled = int(db.execute(text("PRAGMA foreign_keys")).scalar() or 0)
        if enabled != 1:
            _fail("Could not enable SQLite foreign key enforcement")


def _sqlite_main_database_path(db: Session) -> Path:
    rows = db.execute(text("PRAGMA database_list")).all()
    main_rows = [row for row in rows if str(row[1]) == "main"]
    if len(main_rows) != 1 or not str(main_rows[0][2] or "").strip():
        _fail("Could not resolve the active SQLite main database path")
    return Path(str(main_rows[0][2])).expanduser().resolve()


def _guard_database_target(
    db: Session, *, apply: bool, expected_db: Path | None
) -> str:
    dialect = db.get_bind().dialect.name
    if dialect != "sqlite":
        if apply:
            _fail("--apply is supported only for an exact verified SQLite target")
        return f"dialect={dialect}"

    actual = _sqlite_main_database_path(db)
    if expected_db is not None:
        expected = expected_db.expanduser().resolve()
        if actual != expected:
            _fail(
                "Active SQLite database does not match --expected-db: "
                f"actual={actual}, expected={expected}"
            )
    elif apply:
        _fail("--apply requires --expected-db with the exact SQLite database path")
    return str(actual)


def _assert_schema_compatible(db: Session) -> None:
    """Fail clearly before ORM queries when a local/staging schema is stale."""
    inspector = inspect(db.get_bind())
    required_models = (
        User,
        Master,
        Service,
        MasterServiceCategory,
        MasterService,
        MasterSchedule,
        AvailabilitySlot,
        Booking,
        BookingEditRequest,
        AppliedDiscount,
        LoyaltyDiscount,
        PersonalDiscount,
        LoyaltySettings,
        LoyaltyTransaction,
        BookingConfirmation,
        Income,
        MissedRevenue,
        MasterExpense,
    )
    existing_tables = set(inspector.get_table_names())
    problems: list[str] = []
    for model in required_models:
        table_name = model.__tablename__
        if table_name not in existing_tables:
            problems.append(f"missing table {table_name}")
            continue
        actual_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        expected_columns = {column.name for column in model.__table__.columns}
        missing = sorted(expected_columns - actual_columns)
        if missing:
            problems.append(f"{table_name} missing columns {missing}")
    if problems:
        _fail(
            "Database schema is not compatible with current models: "
            + "; ".join(problems)
        )


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _model_snapshot(rows: Iterable[Any], model: Any) -> dict[int, tuple[Any, ...]]:
    columns = tuple(model.__table__.columns)
    result: dict[int, tuple[Any, ...]] = {}
    for row in rows:
        result[int(row.id)] = tuple(
            _enum_value(getattr(row, col.name)) for col in columns
        )
    return result


def _query_snapshot(
    db: Session, model: Any, *filters: Any
) -> dict[int, tuple[Any, ...]]:
    query = db.query(model)
    if filters:
        query = query.filter(*filters)
    return _model_snapshot(query.order_by(model.id).all(), model)


def _association_snapshot(db: Session) -> tuple[tuple[int, int], ...]:
    rows = db.execute(
        select(master_services.c.master_id, master_services.c.service_id).order_by(
            master_services.c.master_id, master_services.c.service_id
        )
    ).all()
    return tuple((int(master_id), int(service_id)) for master_id, service_id in rows)


def _query_snapshot_excluding_ids(
    db: Session, model: Any, excluded_ids: Iterable[int]
) -> dict[int, tuple[Any, ...]]:
    ids = tuple(int(row_id) for row_id in excluded_ids)
    if ids:
        return _query_snapshot(db, model, ~model.id.in_(ids))
    return _query_snapshot(db, model)


def _capture_protected_state(
    db: Session,
    owned: OwnedIds,
) -> dict[str, Any]:
    return {
        "users": _query_snapshot(db, User),
        "masters": _query_snapshot(db, Master),
        "bookings": _query_snapshot_excluding_ids(db, Booking, owned.booking_ids),
        "services": _query_snapshot(db, Service),
        "master_services_list": _query_snapshot(db, MasterService),
        "master_service_categories": _query_snapshot(db, MasterServiceCategory),
        "service_links": _association_snapshot(db),
        "schedules": _query_snapshot(db, MasterSchedule),
        "availability_slots": _query_snapshot(db, AvailabilitySlot),
        "loyalty_discounts": _query_snapshot_excluding_ids(
            db, LoyaltyDiscount, owned.loyalty_discount_ids
        ),
        "personal_discounts": _query_snapshot_excluding_ids(
            db, PersonalDiscount, owned.personal_discount_ids
        ),
        "loyalty_transactions": _query_snapshot_excluding_ids(
            db, LoyaltyTransaction, owned.loyalty_transaction_ids
        ),
        "loyalty_settings": _query_snapshot(db, LoyaltySettings),
        "booking_edit_requests": _query_snapshot_excluding_ids(
            db, BookingEditRequest, owned.booking_edit_request_ids
        ),
        "applied_discounts": _query_snapshot_excluding_ids(
            db, AppliedDiscount, owned.applied_discount_ids
        ),
        "incomes": _query_snapshot_excluding_ids(db, Income, owned.income_ids),
        "missed_revenues": _query_snapshot_excluding_ids(
            db, MissedRevenue, owned.missed_revenue_ids
        ),
        "booking_confirmations": _query_snapshot_excluding_ids(
            db, BookingConfirmation, owned.booking_confirmation_ids
        ),
    }


def _assert_protected_state(
    before: dict[str, Any],
    after: dict[str, Any],
    created: CreatedIds,
    allowlist_master_ids: set[int],
) -> None:
    allowed_new_ids = {
        "services": created.services,
        "master_services_list": created.master_services,
        "master_service_categories": created.master_service_categories,
        "loyalty_settings": created.loyalty_settings,
        "schedules": created.schedules,
    }
    for name, expected in before.items():
        actual = after[name]
        if name == "service_links":
            expected_counts = Counter(expected)
            expected_counts.update(created.service_links)
            if Counter(actual) != expected_counts:
                _fail("Service associations differ from exact existing + created sets")
            continue
        if name in allowed_new_ids:
            for row_id, row_value in expected.items():
                if actual.get(row_id) != row_value:
                    _fail(f"Existing protected {name} row {row_id} changed")
            actual_new = set(actual) - set(expected)
            if actual_new != allowed_new_ids[name]:
                _fail(
                    f"Created {name} ID set mismatch: expected "
                    f"{sorted(allowed_new_ids[name])}, got {sorted(actual_new)}"
                )
            continue
        if actual != expected:
            _fail(f"Protected non-smoke state changed: {name}")

    for row_id in created.loyalty_settings:
        row = after["loyalty_settings"].get(row_id)
        if row is None:
            _fail(f"Created LoyaltySettings row {row_id} disappeared")
    # master_id is the second model column after id.
    for row_id in created.loyalty_settings:
        if int(after["loyalty_settings"][row_id][1]) not in allowlist_master_ids:
            _fail(f"LoyaltySettings row {row_id} is outside the allowlist")


def _foreign_key_orphans(db: Session) -> dict[str, int]:
    bind = db.get_bind()
    inspector = inspect(bind)
    quote = bind.dialect.identifier_preparer.quote
    result: dict[str, int] = {}
    for table_name in inspector.get_table_names():
        for fk in inspector.get_foreign_keys(table_name):
            child_cols = fk.get("constrained_columns") or []
            parent_cols = fk.get("referred_columns") or []
            parent_table = fk.get("referred_table")
            if (
                not parent_table
                or not child_cols
                or len(child_cols) != len(parent_cols)
            ):
                continue
            child = quote(table_name)
            parent = quote(parent_table)
            join = " AND ".join(
                f"c.{quote(c)} = p.{quote(p)}" for c, p in zip(child_cols, parent_cols)
            )
            nonnull = " AND ".join(f"c.{quote(c)} IS NOT NULL" for c in child_cols)
            missing = f"p.{quote(parent_cols[0])} IS NULL"
            sql = f"SELECT COUNT(*) FROM {child} c LEFT JOIN {parent} p ON {join} WHERE {nonnull} AND {missing}"
            key = f"{table_name}({','.join(child_cols)})->{parent_table}({','.join(parent_cols)})"
            result[key] = int(db.execute(text(sql)).scalar() or 0)
    return result


def _assert_no_new_orphans(before: dict[str, int], after: dict[str, int]) -> None:
    increases = {
        key: (before.get(key, 0), count)
        for key, count in after.items()
        if count > before.get(key, 0)
    }
    if increases:
        details = ", ".join(f"{k}: {a}->{b}" for k, (a, b) in sorted(increases.items()))
        _fail(f"Refresh created new FK orphans: {details}")


def _assert_no_booking_child_orphans(db: Session) -> None:
    """Fail before mutations when a stale child could bind to a reused Booking PK."""
    child_models = (
        AppliedDiscount,
        BookingConfirmation,
        Income,
        MissedRevenue,
        BookingEditRequest,
        LoyaltyTransaction,
    )
    diagnostics: list[tuple[str, int, int]] = []
    for model in child_models:
        rows = (
            db.query(model.id, model.booking_id)
            .outerjoin(Booking, model.booking_id == Booking.id)
            .filter(model.booking_id.isnot(None), Booking.id.is_(None))
            .order_by(model.id)
            .all()
        )
        diagnostics.extend(
            (model.__tablename__, int(child_id), int(booking_id))
            for child_id, booking_id in rows
        )

    if diagnostics:
        details = "; ".join(
            f"table={table}, child_id={child_id}, missing_booking_id={booking_id}"
            for table, child_id, booking_id in diagnostics
        )
        _fail(f"Booking-child orphan preflight failed: {details}")


def _resolve_anchors(db: Session, manifest: dict[str, Any]) -> Anchors:
    masters_by_phone: dict[str, tuple[User, Master]] = {}
    clients_by_phone: dict[str, User] = {}

    for phone in manifest["users"]["masters"]:
        users = db.query(User).filter(User.phone == phone).all()
        if len(users) != 1:
            _fail(
                f"Expected exactly one existing User for master phone {phone}; found {len(users)}"
            )
        user = users[0]
        if user.role != UserRole.MASTER:
            _fail(f"User {phone} has role {_enum_value(user.role)!r}, expected master")
        if not user.is_active or user.deleted_at is not None:
            _fail(f"Master User {phone} is inactive or deleted")
        masters = db.query(Master).filter(Master.user_id == user.id).all()
        if len(masters) != 1:
            _fail(
                f"User {phone} must have exactly one Master row; found {len(masters)}"
            )
        master = masters[0]
        if master.is_deleted or master.deleted_at is not None:
            _fail(f"Master profile for {phone} is deleted")
        if not (master.timezone or "").strip():
            _fail(
                f"Master {phone} has no timezone; immutable profile cannot be repaired by this script"
            )
        masters_by_phone[phone] = (user, master)

    for phone in manifest["users"]["clients"]:
        users = db.query(User).filter(User.phone == phone).all()
        if len(users) != 1:
            _fail(
                f"Expected exactly one existing User for client phone {phone}; found {len(users)}"
            )
        user = users[0]
        if user.role != UserRole.CLIENT:
            _fail(f"User {phone} has role {_enum_value(user.role)!r}, expected client")
        if not user.is_active or user.deleted_at is not None:
            _fail(f"Client User {phone} is inactive or deleted")
        clients_by_phone[phone] = user

    return Anchors(masters_by_phone=masters_by_phone, clients_by_phone=clients_by_phone)


def _resolve_owned_ids(
    db: Session, manifest: dict[str, Any], anchors: Anchors
) -> OwnedIds:
    ownership = manifest["ownership"]
    note_by_label = ownership["booking_notes"]
    label_by_note = {note: label for label, note in note_by_label.items()}
    primary_master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    primary_client = anchors.clients_by_phone[manifest["primary_client_phone"]]
    secondary_client = anchors.clients_by_phone[manifest["secondary_client_phone"]]
    client_by_label = {
        "COMPLETED_PAID": primary_client.id,
        "COMPLETED_UNPAID": secondary_client.id,
        "UPCOMING_PAID": primary_client.id,
        "UPCOMING_UNPAID": secondary_client.id,
        "AWAITING_CONFIRMATION": secondary_client.id,
        "CANCELLED": primary_client.id,
        "WITH_DISCOUNT": primary_client.id,
        "LOYALTY_RESERVE": primary_client.id,
        "COMPLETED_LOYALTY_SPEND_EARN": primary_client.id,
    }

    bookings_by_label: dict[str, Booking] = {}
    booking_rows = (
        db.query(Booking)
        .filter(Booking.notes.in_(tuple(note_by_label.values())))
        .order_by(Booking.id)
        .all()
    )
    for booking in booking_rows:
        label = label_by_note.get(booking.notes)
        if label is None:
            _fail(f"Booking {booking.id} does not have an exact canonical smoke note")
        if label in bookings_by_label:
            _fail(f"Duplicate exact smoke booking note for scenario {label}")
        if booking.master_id != primary_master.id:
            _fail(f"Exact smoke booking {booking.id} has the wrong master")
        if booking.client_id != client_by_label[label]:
            _fail(f"Exact smoke booking {booking.id} has the wrong client")
        bookings_by_label[label] = booking
    booking_ids = frozenset(int(row.id) for row in bookings_by_label.values())

    source_by_key = ownership["loyalty_sources"]
    key_by_source = {source: key for key, source in source_by_key.items()}
    expected_loyalty = {
        "OPENING_PRIMARY": (primary_client.id, "earned", None),
        "OPENING_SECONDARY": (secondary_client.id, "earned", None),
        "COMPLETED_PAID_EARNED": (primary_client.id, "earned", "COMPLETED_PAID"),
        "COMPLETED_UNPAID_EARNED": (
            secondary_client.id,
            "earned",
            "COMPLETED_UNPAID",
        ),
        "COMPLETED_LOYALTY_SPEND_EARN_SPENT": (
            primary_client.id,
            "spent",
            "COMPLETED_LOYALTY_SPEND_EARN",
        ),
        "COMPLETED_LOYALTY_SPEND_EARN_EARNED": (
            primary_client.id,
            "earned",
            "COMPLETED_LOYALTY_SPEND_EARN",
        ),
    }
    loyalty_by_source: dict[str, LoyaltyTransaction] = {}
    loyalty_rows = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.source.in_(tuple(source_by_key.values())))
        .order_by(LoyaltyTransaction.id)
        .all()
    )
    for row in loyalty_rows:
        key = key_by_source.get(row.source)
        if key is None:
            _fail(f"Loyalty transaction {row.id} has no exact canonical source")
        if row.source in loyalty_by_source:
            _fail(f"Duplicate exact loyalty source {row.source!r}")
        client_id, transaction_type, booking_label = expected_loyalty[key]
        if (
            row.master_id != primary_master.id
            or row.client_id != client_id
            or row.transaction_type != transaction_type
        ):
            _fail(f"Exact smoke loyalty transaction {row.id} has unsafe ownership")
        if booking_label is None:
            if row.booking_id is not None:
                _fail(f"Opening loyalty transaction {row.id} must be detached")
        else:
            booking = bookings_by_label.get(booking_label)
            if booking is None or row.booking_id != booking.id:
                _fail(
                    f"Exact smoke loyalty transaction {row.id} is not attached to "
                    f"scenario {booking_label}"
                )
        loyalty_by_source[str(row.source)] = row
    loyalty_transaction_ids = frozenset(int(row.id) for row in loyalty_rows)

    if booking_ids:
        unexpected_tx = (
            db.query(LoyaltyTransaction.id)
            .filter(
                LoyaltyTransaction.booking_id.in_(booking_ids),
                ~LoyaltyTransaction.id.in_(loyalty_transaction_ids),
            )
            .first()
        )
        if unexpected_tx:
            _fail("An exact smoke booking has a non-owned loyalty transaction")

    loyalty_discount_ids: set[int] = set()
    for key in LOYALTY_DISCOUNT_KEYS:
        identifier = ownership["loyalty_discounts"][key]
        rows = (
            db.query(LoyaltyDiscount)
            .filter(
                LoyaltyDiscount.name == identifier["name"],
                LoyaltyDiscount.description == identifier["description"],
            )
            .all()
        )
        if len(rows) > 1:
            _fail(f"Duplicate exact smoke loyalty discount identifier {key}")
        if rows:
            if rows[0].master_id != primary_master.id:
                _fail(f"Exact smoke loyalty discount {key} has the wrong master")
            loyalty_discount_ids.add(int(rows[0].id))

    personal_identifier = ownership["personal_discount"]
    personal_rows = (
        db.query(PersonalDiscount)
        .filter(
            PersonalDiscount.client_phone == primary_client.phone,
            PersonalDiscount.description == personal_identifier["description"],
        )
        .all()
    )
    if len(personal_rows) > 1:
        _fail("Duplicate exact smoke personal discount identifier")
    if personal_rows and personal_rows[0].master_id != primary_master.id:
        _fail("Exact smoke personal discount has the wrong master")
    personal_discount_ids = frozenset(int(row.id) for row in personal_rows)

    def child_rows(model: Any) -> list[Any]:
        if not booking_ids:
            return []
        return db.query(model).filter(model.booking_id.in_(booking_ids)).all()

    applied_rows = child_rows(AppliedDiscount)
    discount_booking = bookings_by_label.get("WITH_DISCOUNT")
    if len(applied_rows) > 1:
        _fail("Exact smoke bookings have unexpected AppliedDiscount rows")
    if applied_rows:
        applied = applied_rows[0]
        if discount_booking is None or applied.booking_id != discount_booking.id:
            _fail("AppliedDiscount is attached to the wrong exact smoke scenario")
        has_loyalty_rule = applied.discount_id is not None
        has_personal_rule = applied.personal_discount_id is not None
        if has_loyalty_rule == has_personal_rule:
            _fail("Owned AppliedDiscount must reference exactly one discount rule")
        if has_loyalty_rule and int(applied.discount_id) not in loyalty_discount_ids:
            _fail("Owned AppliedDiscount references a non-canonical LoyaltyDiscount")
        if (
            has_personal_rule
            and int(applied.personal_discount_id) not in personal_discount_ids
        ):
            _fail("Owned AppliedDiscount references a non-canonical PersonalDiscount")

    completed_ids = {
        bookings_by_label[label].id
        for label in (
            "COMPLETED_PAID",
            "COMPLETED_UNPAID",
            "COMPLETED_LOYALTY_SPEND_EARN",
        )
        if label in bookings_by_label
    }
    confirmation_rows = child_rows(BookingConfirmation)
    income_rows = child_rows(Income)
    for model_name, rows in (
        ("BookingConfirmation", confirmation_rows),
        ("Income", income_rows),
    ):
        if len({row.booking_id for row in rows}) != len(rows):
            _fail(f"Duplicate {model_name} rows for an exact smoke booking")
        if any(row.booking_id not in completed_ids for row in rows):
            _fail(f"Unexpected {model_name} on a non-completed smoke scenario")
    master_user = anchors.masters_by_phone[manifest["primary_master_phone"]][0]
    if any(row.master_id != master_user.id for row in confirmation_rows):
        _fail("Exact smoke BookingConfirmation has the wrong master")
    if any(
        row.salon_id is not None
        or row.indie_master_id is not None
        or row.branch_id is not None
        for row in income_rows
    ):
        _fail("Exact smoke Income has an unexpected owner scope")

    missed_rows = child_rows(MissedRevenue)
    edit_rows = child_rows(BookingEditRequest)
    if missed_rows:
        _fail("Exact smoke bookings have unexpected MissedRevenue rows")
    if edit_rows:
        _fail("Exact smoke bookings have unexpected BookingEditRequest rows")

    return OwnedIds(
        bookings_by_label=bookings_by_label,
        booking_ids=booking_ids,
        loyalty_transactions_by_source=loyalty_by_source,
        loyalty_transaction_ids=loyalty_transaction_ids,
        loyalty_discount_ids=frozenset(loyalty_discount_ids),
        personal_discount_ids=personal_discount_ids,
        applied_discount_ids=frozenset(int(row.id) for row in applied_rows),
        booking_confirmation_ids=frozenset(int(row.id) for row in confirmation_rows),
        income_ids=frozenset(int(row.id) for row in income_rows),
        missed_revenue_ids=frozenset(),
        booking_edit_request_ids=frozenset(),
    )


def _prepare_existing_smoke_transactions(
    db: Session,
    owned: OwnedIds,
) -> dict[str, LoyaltyTransaction]:
    """Park and zero only the exact preflight-owned ledger rows."""
    result = dict(owned.loyalty_transactions_by_source)
    for source, row in result.items():
        if row.source != source or row.id not in owned.loyalty_transaction_ids:
            _fail(f"Owned loyalty natural-key mismatch for row {row.id}")
        row.booking_id = None
        row.points = 0
    db.flush()
    return result


def _schedule_snapshot_hash(snapshot: Sequence[tuple[Any, ...]]) -> str:
    return hashlib.sha256(repr(tuple(snapshot)).encode("utf-8")).hexdigest()[:16]


def _delete_previous_smoke_layer(
    db: Session, owned: OwnedIds, counters: RefreshCounters
) -> None:
    booking_ids = tuple(sorted(owned.booking_ids))

    if booking_ids:
        still_attached = (
            db.query(LoyaltyTransaction.id)
            .filter(LoyaltyTransaction.booking_id.in_(booking_ids))
            .first()
        )
        if still_attached:
            _fail(
                "Marker loyalty transactions were not safely parked before booking deletion"
            )
        child_sets = (
            (BookingConfirmation, owned.booking_confirmation_ids),
            (Income, owned.income_ids),
            (MissedRevenue, owned.missed_revenue_ids),
            (AppliedDiscount, owned.applied_discount_ids),
            (BookingEditRequest, owned.booking_edit_request_ids),
        )
        for model, exact_ids in child_sets:
            if not exact_ids:
                continue
            deleted = (
                db.query(model)
                .filter(model.id.in_(tuple(exact_ids)))
                .delete(synchronize_session=False)
            )
            if deleted != len(exact_ids):
                _fail(
                    f"Exact owned delete count mismatch for {model.__tablename__}: "
                    f"expected {len(exact_ids)}, got {deleted}"
                )
        deleted_bookings = (
            db.query(Booking)
            .filter(Booking.id.in_(booking_ids))
            .delete(synchronize_session=False)
        )
        if deleted_bookings != len(booking_ids):
            _fail(
                "Exact owned booking delete count mismatch: "
                f"expected {len(booking_ids)}, got {deleted_bookings}"
            )
        counters.bookings_deleted = deleted_bookings
        for booking in owned.bookings_by_label.values():
            if booking in db:
                db.expunge(booking)
    db.flush()

    loyalty_rule_ids = tuple(sorted(owned.loyalty_discount_ids))
    personal_rule_ids = tuple(sorted(owned.personal_discount_ids))
    dangling_applied = (
        db.query(AppliedDiscount.id)
        .filter(
            or_(
                (
                    AppliedDiscount.discount_id.in_(loyalty_rule_ids)
                    if loyalty_rule_ids
                    else text("0=1")
                ),
                (
                    AppliedDiscount.personal_discount_id.in_(personal_rule_ids)
                    if personal_rule_ids
                    else text("0=1")
                ),
            )
        )
        .first()
    )
    if dangling_applied:
        _fail(
            "An exact owned discount is referenced outside the owned AppliedDiscount set"
        )
    if loyalty_rule_ids:
        deleted = (
            db.query(LoyaltyDiscount)
            .filter(LoyaltyDiscount.id.in_(loyalty_rule_ids))
            .delete(synchronize_session=False)
        )
        if deleted != len(loyalty_rule_ids):
            _fail("Exact owned LoyaltyDiscount delete count mismatch")
    if personal_rule_ids:
        deleted = (
            db.query(PersonalDiscount)
            .filter(PersonalDiscount.id.in_(personal_rule_ids))
            .delete(synchronize_session=False)
        )
        if deleted != len(personal_rule_ids):
            _fail("Exact owned PersonalDiscount delete count mismatch")
    db.flush()


def _find_service(
    db: Session,
    master: Master,
    spec: dict[str, Any],
    marker: str,
    counters: RefreshCounters,
    created: CreatedIds,
) -> Service:
    duration = int(spec["duration"])
    preferred_name = str(spec["preferred_name"])
    fallback_name = f"{spec['fallback_name']} [{marker}]"
    associated = (
        db.query(Service)
        .join(master_services, master_services.c.service_id == Service.id)
        .filter(master_services.c.master_id == master.id, Service.duration == duration)
        .order_by(Service.id)
        .all()
    )
    if len(associated) > 1:
        _fail(f"Master {master.id} has ambiguous {duration}-minute services")
    preferred = [service for service in associated if service.name == preferred_name]
    owned = [service for service in associated if service.name == fallback_name]
    if len(preferred) == 1:
        service = preferred[0]
    elif len(preferred) > 1:
        _fail(f"Master {master.id} has duplicate preferred {duration}-minute services")
    elif len(owned) == 1:
        service = owned[0]
    elif len(owned) > 1:
        _fail(f"Master {master.id} has duplicate marker {duration}-minute services")
    elif len(associated) == 1:
        service = associated[0]
    else:
        service = Service(
            name=fallback_name,
            description=f"[{marker}] Release smoke fallback service",
            duration=duration,
            price=float(spec["fallback_price"]),
            service_type=ServiceType.SUBSCRIPTION,
            salon_id=None,
            indie_master_id=None,
        )
        db.add(service)
        db.flush()
        db.execute(
            master_services.insert().values(master_id=master.id, service_id=service.id)
        )
        created.services.add(int(service.id))
        created.service_links.add((int(master.id), int(service.id)))
        counters.services_created += 1

    if service.price is None or float(service.price) <= 0:
        _fail(f"Service {service.id} has invalid price {service.price}")
    if int(service.duration or 0) != duration:
        _fail(f"Service {service.id} duration changed during resolution")
    return service


def _ensure_master_catalog_service(
    db: Session,
    master: Master,
    spec: dict[str, Any],
    marker: str,
    counters: RefreshCounters,
    created: CreatedIds,
) -> MasterService:
    duration = int(spec["duration"])
    preferred_name = str(spec["preferred_name"])
    fallback_name = f"{spec['fallback_name']} [{marker}]"
    candidates = (
        db.query(MasterService)
        .filter(
            MasterService.master_id == master.id, MasterService.duration == duration
        )
        .order_by(MasterService.id)
        .all()
    )
    if len(candidates) > 1:
        _fail(
            f"Master {master.id} has ambiguous catalog services for {duration} minutes"
        )
    preferred = [service for service in candidates if service.name == preferred_name]
    owned = [service for service in candidates if service.name == fallback_name]
    if len(preferred) == 1:
        return preferred[0]
    if len(preferred) > 1:
        _fail(
            f"Master {master.id} has duplicate preferred catalog services for {duration} minutes"
        )
    if len(owned) == 1:
        return owned[0]
    if len(owned) > 1:
        _fail(
            f"Master {master.id} has duplicate marker catalog services for {duration} minutes"
        )
    if len(candidates) == 1:
        return candidates[0]
    category_name = f"Release Smoke [{marker}]"
    categories = (
        db.query(MasterServiceCategory)
        .filter(
            MasterServiceCategory.master_id == master.id,
            MasterServiceCategory.name == category_name,
        )
        .all()
    )
    if len(categories) > 1:
        _fail(f"Master {master.id} has duplicate marker service categories")
    if categories:
        category = categories[0]
    else:
        category = MasterServiceCategory(master_id=master.id, name=category_name)
        db.add(category)
        db.flush()
        created.master_service_categories.add(int(category.id))

    service = MasterService(
        master_id=master.id,
        category_id=category.id,
        name=fallback_name,
        description=f"[{marker}] Release smoke fallback catalog service",
        duration=duration,
        price=float(spec["fallback_price"]),
    )
    db.add(service)
    db.flush()
    created.master_services.add(int(service.id))
    counters.master_services_created += 1
    return service


def _resolve_services(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
    counters: RefreshCounters,
    created: CreatedIds,
) -> dict[int, dict[int, Service]]:
    marker = manifest["marker"]
    result: dict[int, dict[int, Service]] = {}
    for _, master in anchors.masters_by_phone.values():
        by_duration: dict[int, Service] = {}
        for spec in manifest["services"]:
            service = _find_service(db, master, spec, marker, counters, created)
            catalog_service = _ensure_master_catalog_service(
                db, master, spec, marker, counters, created
            )
            if (
                catalog_service.name != service.name
                or int(catalog_service.duration or 0) != int(service.duration or 0)
                or float(catalog_service.price or 0) != float(service.price or 0)
            ):
                _fail(
                    f"Master {master.id} catalog/canonical service mismatch for "
                    f"{spec['duration']} minutes"
                )
            by_duration[int(spec["duration"])] = service
        result[master.id] = by_duration
    db.flush()
    return result


def _time_range(
    start: time, end: time, step_minutes: int
) -> Iterable[tuple[time, time]]:
    cursor = datetime.combine(date(2000, 1, 1), start)
    boundary = datetime.combine(date(2000, 1, 1), end)
    step = timedelta(minutes=step_minutes)
    while cursor + step <= boundary:
        yield cursor.time(), (cursor + step).time()
        cursor += step


def _refresh_schedule(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
    today: date,
    window_start: date,
    window_end: date,
    counters: RefreshCounters,
    created: CreatedIds,
) -> tuple[date, date, dict[int, set[tuple[date, time, time]]]]:
    schedule_cfg = manifest["schedule"]
    max_rows = min(
        int(schedule_cfg["max_existing_rows_in_scope"]),
        ABSOLUTE_MAX_SCHEDULE_ROWS,
    )
    primary_master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    offsets = [int(value) for value in schedule_cfg["working_day_offsets"]]
    target_dates = [today + timedelta(days=offset) for offset in offsets]
    if any(not (window_start <= target <= window_end) for target in target_dates):
        _fail("Canonical relative schedule dates are outside the refresh window")
    closed_day = today + timedelta(days=int(schedule_cfg["closed_day_offset"]))
    partial_day = today + timedelta(days=int(schedule_cfg["partial_day_offset"]))
    if (
        closed_day == partial_day
        or closed_day not in target_dates
        or partial_day not in target_dates
    ):
        _fail(
            "Closed and partial schedule dates must be distinct canonical target dates"
        )

    start = _parse_hhmm(schedule_cfg["work_start"], "schedule.work_start")
    end = _parse_hhmm(schedule_cfg["work_end"], "schedule.work_end")
    partial_start = _parse_hhmm(
        schedule_cfg["partial_closed_start"], "schedule.partial_closed_start"
    )
    partial_end = _parse_hhmm(
        schedule_cfg["partial_closed_end"], "schedule.partial_closed_end"
    )
    step = int(schedule_cfg["slot_minutes"])
    if step != 30 or start >= end or not (start < partial_start < partial_end < end):
        _fail("Invalid managed schedule configuration")

    scoped_rows = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id.in_(anchors.master_ids),
            MasterSchedule.date.in_(target_dates),
        )
        .order_by(
            MasterSchedule.master_id,
            MasterSchedule.date,
            MasterSchedule.start_time,
            MasterSchedule.id,
        )
        .all()
    )
    if len(scoped_rows) > max_rows:
        _fail(f"Exact schedule scope has {len(scoped_rows)} rows; limit is {max_rows}")
    scoped_snapshot = [
        (
            row.id,
            row.master_id,
            row.salon_id,
            row.branch_id,
            row.place_id,
            row.date,
            row.start_time,
            row.end_time,
            bool(row.is_available),
        )
        for row in scoped_rows
    ]
    print(
        f"Schedule preflight: rows={len(scoped_rows)}, "
        f"snapshot={_schedule_snapshot_hash(scoped_snapshot)}, "
        f"dates={','.join(day.isoformat() for day in target_dates)}"
    )

    recurring_closed = (
        db.query(AvailabilitySlot.id)
        .filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id == primary_master.id,
            AvailabilitySlot.day_of_week == closed_day.isoweekday(),
        )
        .first()
    )
    if recurring_closed:
        _fail(
            "Canonical closed day has recurring AvailabilitySlot rows; refusing to alter effective availability"
        )

    generated: dict[int, set[tuple[date, time, time]]] = {
        master_id: set() for master_id in anchors.master_ids
    }
    existing_by_owner_date: dict[tuple[int, date], list[MasterSchedule]] = {}
    for row in scoped_rows:
        existing_by_owner_date.setdefault((int(row.master_id), row.date), []).append(
            row
        )

    pending: list[MasterSchedule] = []
    for master_id in sorted(anchors.master_ids):
        for day in target_dates:
            expected: set[tuple[time, time, bool, None, None, None]] = set()
            if not (master_id == primary_master.id and day == closed_day):
                for slot_start, slot_end in _time_range(start, end, step):
                    if (
                        master_id == primary_master.id
                        and day == partial_day
                        and slot_start < partial_end
                        and slot_end > partial_start
                    ):
                        continue
                    expected.add((slot_start, slot_end, True, None, None, None))

            existing = existing_by_owner_date.get((master_id, day), [])
            actual = [
                (
                    row.start_time,
                    row.end_time,
                    bool(row.is_available),
                    row.salon_id,
                    row.branch_id,
                    row.place_id,
                )
                for row in existing
            ]
            if existing:
                if len(actual) != len(set(actual)) or set(actual) != expected:
                    _fail(
                        "Existing MasterSchedule is partial, duplicate, closed, or non-canonical: "
                        f"master_id={master_id}, date={day}"
                    )
            elif expected:
                for slot_start, slot_end, *_ in sorted(expected):
                    row = MasterSchedule(
                        master_id=master_id,
                        salon_id=None,
                        branch_id=None,
                        place_id=None,
                        date=day,
                        start_time=slot_start,
                        end_time=slot_end,
                        is_available=True,
                    )
                    db.add(row)
                    pending.append(row)

            for slot_start, slot_end, *_ in expected:
                generated[master_id].add((day, slot_start, slot_end))

    if len(pending) > max_rows:
        _fail(f"Generated schedule has {len(pending)} rows; limit is {max_rows}")
    db.flush()
    for row in pending:
        created.schedules.add(int(row.id))
    counters.schedule_created = len(pending)
    counters.schedule_deleted = 0
    return closed_day, partial_day, generated


def _ensure_loyalty_settings(
    db: Session,
    master: Master,
    manifest: dict[str, Any],
    counters: RefreshCounters,
) -> tuple[LoyaltySettings, set[int]]:
    rows = (
        db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master.id).all()
    )
    if len(rows) > 1:
        _fail(f"Master {master.id} has duplicate LoyaltySettings rows")
    created_ids: set[int] = set()
    if rows:
        settings = rows[0]
        if not settings.is_enabled:
            _fail(
                "Existing primary-master LoyaltySettings is disabled; refusing to modify it"
            )
        if (
            not settings.accrual_percent
            or not 1 <= int(settings.accrual_percent) <= 100
        ):
            _fail("Existing LoyaltySettings.accrual_percent is incompatible")
        if (
            settings.max_payment_percent is not None
            and not 1 <= int(settings.max_payment_percent) <= 100
        ):
            _fail("Existing LoyaltySettings.max_payment_percent is incompatible")
        if (
            settings.points_lifetime_days is not None
            and int(settings.points_lifetime_days) <= 0
        ):
            _fail("Existing LoyaltySettings.points_lifetime_days is incompatible")
        return settings, created_ids

    cfg = manifest["loyalty"]
    settings = LoyaltySettings(
        master_id=master.id,
        is_enabled=True,
        accrual_percent=int(cfg["default_accrual_percent"]),
        max_payment_percent=int(cfg["default_max_payment_percent"]),
        points_lifetime_days=int(cfg["default_points_lifetime_days"]),
    )
    db.add(settings)
    db.flush()
    counters.loyalty_settings_created += 1
    created_ids.add(settings.id)
    return settings, created_ids


def _create_discount_rules(
    db: Session,
    master: Master,
    client: User,
    manifest: dict[str, Any],
    counters: RefreshCounters,
) -> None:
    cfg = manifest["discounts"]
    identifiers = manifest["ownership"]["loyalty_discounts"]
    rules = (
        (
            "first_visit",
            "first_visit",
            {},
            float(cfg["first_visit_percent"]),
        ),
        (
            "returning",
            "returning_client",
            {
                "min_days_since_last_visit": int(cfg["returning_min_days"]),
                "max_days_since_last_visit": int(cfg["returning_max_days"]),
            },
            float(cfg["returning_percent"]),
        ),
        (
            "birthday",
            "birthday",
            {
                "days_before": int(cfg["birthday_days_before"]),
                "days_after": int(cfg["birthday_days_after"]),
            },
            float(cfg["birthday_percent"]),
        ),
        (
            "happy_hours",
            "happy_hours",
            {
                "days": [int(day) for day in cfg["happy_hours_days"]],
                "intervals": [
                    {
                        "start": str(cfg["happy_hours_start"]),
                        "end": str(cfg["happy_hours_end"]),
                    }
                ],
            },
            float(cfg["happy_hours_percent"]),
        ),
    )
    for key, condition_type, parameters, percent in rules:
        identifier = identifiers[key]
        db.add(
            LoyaltyDiscount(
                master_id=master.id,
                salon_id=None,
                discount_type=LoyaltyDiscountType.QUICK,
                name=identifier["name"],
                description=identifier["description"],
                discount_percent=percent,
                max_discount_amount=None,
                conditions={"condition_type": condition_type, "parameters": parameters},
                is_active=True,
                priority=1,
            )
        )
        counters.discount_rules_created += 1
    db.add(
        PersonalDiscount(
            master_id=master.id,
            salon_id=None,
            client_phone=client.phone,
            discount_percent=float(cfg["personal_percent"]),
            max_discount_amount=None,
            description=manifest["ownership"]["personal_discount"]["description"],
            is_active=True,
        )
    )
    counters.discount_rules_created += 1
    db.flush()


def _slot_is_in_schedule(
    generated: set[tuple[date, time, time]], day: date, start: time, duration: int
) -> bool:
    cursor = datetime.combine(day, start)
    finish = cursor + timedelta(minutes=duration)
    while cursor < finish:
        next_cursor = cursor + timedelta(minutes=30)
        if (day, cursor.time(), next_cursor.time()) not in generated:
            return False
        cursor = next_cursor
    return True


def _overlaps(
    start: datetime, end: datetime, other_start: datetime, other_end: datetime
) -> bool:
    return start < other_end and other_start < end


def _allocate_booking_time(
    *,
    generated: set[tuple[date, time, time]],
    candidate_days: Sequence[date],
    duration: int,
    occupied: list[tuple[datetime, datetime]],
    preferred_hours: Sequence[int] = (10, 11, 12, 15, 16),
) -> datetime:
    for day in candidate_days:
        starts = [time(hour, 0) for hour in preferred_hours]
        starts += [time(hour, minute) for hour in range(9, 18) for minute in (0, 30)]
        seen: set[time] = set()
        for slot_start in starts:
            if slot_start in seen:
                continue
            seen.add(slot_start)
            if not _slot_is_in_schedule(generated, day, slot_start, duration):
                continue
            start_dt = datetime.combine(day, slot_start)
            end_dt = start_dt + timedelta(minutes=duration)
            if any(_overlaps(start_dt, end_dt, a, b) for a, b in occupied):
                continue
            occupied.append((start_dt, end_dt))
            return start_dt
    _fail(
        f"Could not allocate a collision-free {duration}-minute booking in the managed schedule"
    )


def _new_booking(
    db: Session,
    *,
    manifest: dict[str, Any],
    label: str,
    client: User,
    master: Master,
    service: Service,
    start: datetime,
    status: str,
    is_paid: bool,
    loyalty_points_used: int = 0,
    payment_amount: float | None = None,
) -> Booking:
    booking = Booking(
        client_id=client.id,
        service_id=service.id,
        master_id=master.id,
        indie_master_id=None,
        salon_id=None,
        branch_id=None,
        start_time=start,
        end_time=start + timedelta(minutes=int(service.duration)),
        status=status,
        notes=manifest["ownership"]["booking_notes"][label],
        payment_method="on_visit",
        payment_deadline=None,
        payment_amount=float(
            service.price if payment_amount is None else payment_amount
        ),
        is_paid=is_paid,
        loyalty_points_used=int(loyalty_points_used),
    )
    db.add(booking)
    db.flush()
    return booking


def _upsert_smoke_transaction(
    db: Session,
    existing: dict[str, LoyaltyTransaction],
    counters: RefreshCounters,
    *,
    manifest: dict[str, Any],
    source: str,
    master_id: int,
    client_id: int,
    booking_id: int | None,
    transaction_type: str,
    points: int,
    earned_at: datetime,
    expires_at: datetime | None,
    service_id: int | None,
) -> LoyaltyTransaction:
    exact_sources = set(manifest["ownership"]["loyalty_sources"].values())
    if source not in exact_sources:
        _fail(f"Unsafe loyalty source outside canonical manifest: {source!r}")
    if points <= 0:
        _fail(f"Smoke loyalty transaction {source} must have positive points")
    row = existing.get(source)
    if row is None:
        row = LoyaltyTransaction(source=source)
        db.add(row)
        existing[source] = row
        counters.loyalty_transactions_created += 1
    elif row.source != source:
        _fail(f"Loyalty natural-key mismatch for row {row.id}: {row.source!r}")

    row.master_id = master_id
    row.client_id = client_id
    row.booking_id = booking_id
    row.transaction_type = transaction_type
    row.points = int(points)
    row.earned_at = earned_at
    row.expires_at = expires_at
    row.service_id = service_id
    db.flush()
    return row


def _prepare_completion_transactions(
    db: Session,
    existing: dict[str, LoyaltyTransaction],
    counters: RefreshCounters,
    *,
    manifest: dict[str, Any],
    label: str,
    booking: Booking,
    master: Master,
    settings: LoyaltySettings,
    spent_points: int = 0,
) -> None:
    now = datetime.utcnow()
    if spent_points > 0:
        _upsert_smoke_transaction(
            db,
            existing,
            counters,
            manifest=manifest,
            source=manifest["ownership"]["loyalty_sources"][f"{label}_SPENT"],
            master_id=master.id,
            client_id=booking.client_id,
            booking_id=booking.id,
            transaction_type="spent",
            points=spent_points,
            earned_at=now,
            expires_at=None,
            service_id=booking.service_id,
        )

    actual_payment = max(0.0, float(booking.payment_amount or 0) - float(spent_points))
    earned_points = int(actual_payment * (int(settings.accrual_percent) / 100))
    lifetime_days = settings.points_lifetime_days
    expires_at = (
        now + timedelta(days=int(lifetime_days)) if lifetime_days is not None else None
    )
    _upsert_smoke_transaction(
        db,
        existing,
        counters,
        manifest=manifest,
        source=manifest["ownership"]["loyalty_sources"][f"{label}_EARNED"],
        master_id=master.id,
        client_id=booking.client_id,
        booking_id=booking.id,
        transaction_type="earned",
        points=earned_points,
        earned_at=now,
        expires_at=expires_at,
        service_id=booking.service_id,
    )


def _finalize_booking(
    db: Session,
    booking: Booking,
    master: Master,
    master_user: User,
) -> dict[str, Any]:
    result = finalize_post_visit_booking(
        db,
        booking=booking,
        master_row_id=master.id,
        master_user_id=master_user.id,
        require_past_start=True,
    )
    db.flush()
    return result


def _assert_no_service_expense_side_effects(
    db: Session, master_user: User, services: Iterable[Service]
) -> None:
    service_ids = [service.id for service in services]
    count = (
        db.query(MasterExpense)
        .filter(
            MasterExpense.master_id == master_user.id,
            MasterExpense.expense_type == "service_based",
            MasterExpense.service_id.in_(service_ids),
            MasterExpense.is_active.is_(True),
        )
        .count()
    )
    if count:
        _fail(
            "Completed smoke bookings would create unmarked MasterExpense rows; "
            "disable/remove those templates outside this script or choose other services"
        )


def _seed_opening_loyalty_balance(
    db: Session,
    existing: dict[str, LoyaltyTransaction],
    counters: RefreshCounters,
    manifest: dict[str, Any],
    master: Master,
    client: User,
    service: Service,
    source: str,
    target_available: int,
) -> LoyaltyTransaction:
    effective_before = effective_available_points(
        db, master_id=master.id, client_id=client.id
    )
    amount = max(target_available, target_available - effective_before)
    now = datetime.utcnow()
    return _upsert_smoke_transaction(
        db,
        existing,
        counters,
        manifest=manifest,
        source=source,
        master_id=master.id,
        client_id=client.id,
        booking_id=None,
        transaction_type="earned",
        points=int(amount),
        earned_at=now,
        expires_at=now + timedelta(days=90),
        service_id=service.id,
    )


def _create_booking_scenarios(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
    services: dict[int, dict[int, Service]],
    generated_schedule: dict[int, set[tuple[date, time, time]]],
    today: date,
    loyalty_settings: LoyaltySettings,
    existing_transactions: dict[str, LoyaltyTransaction],
    counters: RefreshCounters,
) -> dict[str, Any]:
    marker = manifest["marker"]
    master_user, master = anchors.masters_by_phone[manifest["primary_master_phone"]]
    client = anchors.clients_by_phone[manifest["primary_client_phone"]]
    second_client = anchors.clients_by_phone[manifest["secondary_client_phone"]]
    service30 = services[master.id][30]
    service60 = services[master.id][60]
    service90 = services[master.id][90]
    _assert_no_service_expense_side_effects(
        db, master_user, (service30, service60, service90)
    )

    existing = db.query(Booking).filter(Booking.master_id == master.id).all()
    occupied = [
        (booking.start_time, booking.end_time)
        for booking in existing
        if booking.start_time is not None and booking.end_time is not None
    ]
    available_days = sorted({slot[0] for slot in generated_schedule[master.id]})
    past_days = [day for day in available_days if day < today]
    future_days = [day for day in available_days if day > today]
    if not past_days or not future_days:
        _fail("Managed schedule does not contain both past and future working days")

    def allocate(
        past: bool, duration: int, preferred: Sequence[int] = (10, 11, 12, 15, 16)
    ) -> datetime:
        return _allocate_booking_time(
            generated=generated_schedule[master.id],
            candidate_days=past_days if past else future_days,
            duration=duration,
            occupied=occupied,
            preferred_hours=preferred,
        )

    created: dict[str, Booking] = {}
    completed_paid = _new_booking(
        db,
        manifest=manifest,
        label="COMPLETED_PAID",
        client=client,
        master=master,
        service=service90,
        start=allocate(True, 90),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        is_paid=True,
    )
    _prepare_completion_transactions(
        db,
        existing_transactions,
        counters,
        manifest=manifest,
        label="COMPLETED_PAID",
        booking=completed_paid,
        master=master,
        settings=loyalty_settings,
    )
    _finalize_booking(db, completed_paid, master, master_user)
    created["COMPLETED_PAID"] = completed_paid

    completed_unpaid = _new_booking(
        db,
        manifest=manifest,
        label="COMPLETED_UNPAID",
        client=second_client,
        master=master,
        service=service30,
        start=allocate(True, 30),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        is_paid=False,
    )
    _prepare_completion_transactions(
        db,
        existing_transactions,
        counters,
        manifest=manifest,
        label="COMPLETED_UNPAID",
        booking=completed_unpaid,
        master=master,
        settings=loyalty_settings,
    )
    _finalize_booking(db, completed_unpaid, master, master_user)
    created["COMPLETED_UNPAID"] = completed_unpaid

    spend_points = int(manifest["loyalty"]["completed_spend_points"])
    if calculate_client_balance(db, master.id, client.id) < spend_points:
        _fail(
            "Opening/earned loyalty balance is insufficient for completed spend scenario"
        )
    completed_spend = _new_booking(
        db,
        manifest=manifest,
        label="COMPLETED_LOYALTY_SPEND_EARN",
        client=client,
        master=master,
        service=service60,
        start=allocate(True, 60),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        is_paid=True,
        loyalty_points_used=spend_points,
    )
    _prepare_completion_transactions(
        db,
        existing_transactions,
        counters,
        manifest=manifest,
        label="COMPLETED_LOYALTY_SPEND_EARN",
        booking=completed_spend,
        master=master,
        settings=loyalty_settings,
        spent_points=spend_points,
    )
    spend_result = _finalize_booking(db, completed_spend, master, master_user)
    created["COMPLETED_LOYALTY_SPEND_EARN"] = completed_spend

    awaiting = _new_booking(
        db,
        manifest=manifest,
        label="AWAITING_CONFIRMATION",
        client=second_client,
        master=master,
        service=service60,
        start=allocate(True, 60),
        status=BookingStatus.AWAITING_CONFIRMATION.value,
        is_paid=False,
    )
    created["AWAITING_CONFIRMATION"] = awaiting

    upcoming_paid = _new_booking(
        db,
        manifest=manifest,
        label="UPCOMING_PAID",
        client=client,
        master=master,
        service=service30,
        start=allocate(False, 30),
        status=BookingStatus.CONFIRMED.value,
        is_paid=True,
    )
    created["UPCOMING_PAID"] = upcoming_paid

    upcoming_unpaid = _new_booking(
        db,
        manifest=manifest,
        label="UPCOMING_UNPAID",
        client=second_client,
        master=master,
        service=service60,
        start=allocate(False, 60),
        status=BookingStatus.CREATED.value,
        is_paid=False,
    )
    created["UPCOMING_UNPAID"] = upcoming_unpaid

    cancelled_points = int(manifest["loyalty"]["cancelled_reserve_points"])
    if (
        effective_available_points(db, master_id=master.id, client_id=client.id)
        < cancelled_points
    ):
        _fail("Insufficient effective points for cancellation reserve scenario")
    cancelled = _new_booking(
        db,
        manifest=manifest,
        label="CANCELLED",
        client=client,
        master=master,
        service=service30,
        start=allocate(False, 30),
        status=BookingStatus.CREATED.value,
        is_paid=False,
        loyalty_points_used=cancelled_points,
    )
    reserve_before_cancel = int(cancelled.loyalty_points_used or 0)
    clear_loyalty_points_reserve(cancelled)
    if reserve_before_cancel != cancelled_points:
        _fail("Cancellation scenario did not start with the expected loyalty reserve")
    cancelled.status = BookingStatus.CANCELLED.value
    cancelled.cancelled_by_user_id = client.id
    cancelled.cancellation_reason = f"[{marker}] Smoke cancellation"
    db.flush()
    if int(cancelled.loyalty_points_used or 0) != 0:
        _fail("Cancelled booking retained loyalty reserve")
    created["CANCELLED"] = cancelled

    discount_start = allocate(False, 60, preferred=(10, 11, 12))
    discounted_amount, applied_data = evaluate_and_prepare_applied_discount(
        master_id=master.id,
        client_id=client.id,
        client_phone=client.phone,
        booking_start=discount_start,
        service_id=service60.id,
        db=db,
        now=datetime.utcnow(),
    )
    candidates, best = evaluate_discount_candidates(
        master_id=master.id,
        client_id=client.id,
        client_phone=client.phone,
        booking_payload={
            "start_time": discount_start,
            "service_id": service60.id,
            "service_price": service60.price,
            "category_id": service60.category_id,
        },
        db=db,
        now=datetime.utcnow(),
    )
    applicable = [
        candidate
        for candidate in candidates
        if candidate["is_active"] and candidate["match"]
    ]
    if not applied_data or discounted_amount is None or not best or not applicable:
        _fail("Real discount engine did not select a rule for WITH_DISCOUNT")
    max_percent = max(
        float(candidate["discount_percent"] or 0) for candidate in applicable
    )
    if float(applied_data["discount_percent"]) != max_percent:
        _fail("Discount engine did not select the maximum applicable percentage")
    discounted = _new_booking(
        db,
        manifest=manifest,
        label="WITH_DISCOUNT",
        client=client,
        master=master,
        service=service60,
        start=discount_start,
        status=BookingStatus.CONFIRMED.value,
        is_paid=False,
        payment_amount=float(discounted_amount),
    )
    db.add(create_applied_discount(discounted.id, applied_data))
    db.flush()
    created["WITH_DISCOUNT"] = discounted

    reserve_points = int(manifest["loyalty"]["active_reserve_points"])
    available_before_reserve = effective_available_points(
        db, master_id=master.id, client_id=client.id
    )
    if available_before_reserve < reserve_points:
        _fail("Insufficient effective points for active reserve scenario")
    reserve = _new_booking(
        db,
        manifest=manifest,
        label="LOYALTY_RESERVE",
        client=client,
        master=master,
        service=service90,
        start=allocate(False, 90),
        status=BookingStatus.CONFIRMED.value,
        is_paid=False,
        loyalty_points_used=reserve_points,
    )
    available_after_reserve = effective_available_points(
        db, master_id=master.id, client_id=client.id
    )
    if available_after_reserve != available_before_reserve - reserve_points:
        _fail("Active loyalty reserve did not reduce effective available balance")
    created["LOYALTY_RESERVE"] = reserve

    if set(created) != set(SCENARIO_LABELS):
        _fail(f"Booking scenario mismatch: {sorted(created)}")
    if int(spend_result.get("points_spent") or 0) != spend_points:
        _fail("Completed loyalty booking did not spend the expected points")
    spent_types = Counter(
        transaction.transaction_type
        for transaction in db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.booking_id == completed_spend.id)
        .all()
    )
    if spent_types["spent"] != 1 or spent_types["earned"] != 1:
        _fail(
            "Completed loyalty booking must have exactly one spent and one earned transaction"
        )
    counters.bookings_created = len(created)
    return {
        "bookings": created,
        "discount_winner": {
            "rule_type": str(_enum_value(best["rule_type"])),
            "condition_type": best.get("condition_type"),
            "percent": float(best["discount_percent"]),
        },
    }


def _verify_schedule_and_scenarios(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
    services: dict[int, dict[int, Service]],
    closed_day: date,
    partial_day: date,
    today: date,
    scenario_result: dict[str, Any],
    generated_schedule: dict[int, set[tuple[date, time, time]]],
    owned: OwnedIds,
) -> None:
    master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    service30 = services[master.id][30]
    bookings = scenario_result["bookings"]

    marker_rows = list(owned.bookings_by_label.values())
    if set(owned.bookings_by_label) != set(SCENARIO_LABELS):
        _fail("Exact canonical booking notes are missing or duplicated")

    expected = {
        "COMPLETED_PAID": (BookingStatus.COMPLETED.value, True, False),
        "COMPLETED_UNPAID": (BookingStatus.COMPLETED.value, False, False),
        "UPCOMING_PAID": (BookingStatus.CONFIRMED.value, True, True),
        "UPCOMING_UNPAID": (BookingStatus.CREATED.value, False, True),
        "AWAITING_CONFIRMATION": (
            BookingStatus.AWAITING_CONFIRMATION.value,
            False,
            False,
        ),
        "CANCELLED": (BookingStatus.CANCELLED.value, False, True),
        "WITH_DISCOUNT": (BookingStatus.CONFIRMED.value, False, True),
        "LOYALTY_RESERVE": (BookingStatus.CONFIRMED.value, False, True),
        "COMPLETED_LOYALTY_SPEND_EARN": (BookingStatus.COMPLETED.value, True, False),
    }
    for label, (status, is_paid, future) in expected.items():
        booking = bookings[label]
        if (
            str(_enum_value(booking.status)) != status
            or bool(booking.is_paid) != is_paid
        ):
            _fail(f"Booking scenario {label} has incorrect status/payment state")
        if future and booking.start_time.date() <= today:
            _fail(f"Booking scenario {label} must be in the future")
        if not future and booking.start_time.date() >= today:
            _fail(f"Booking scenario {label} must be in the past")

    earned_without_spend = (
        db.query(LoyaltyTransaction)
        .filter(
            LoyaltyTransaction.booking_id == bookings["COMPLETED_PAID"].id,
            LoyaltyTransaction.transaction_type == "earned",
            LoyaltyTransaction.source
            == manifest["ownership"]["loyalty_sources"]["COMPLETED_PAID_EARNED"],
        )
        .count()
    )
    if (
        earned_without_spend != 1
        or int(bookings["COMPLETED_PAID"].loyalty_points_used or 0) != 0
    ):
        _fail(
            "Completed booking without points must create exactly one earned transaction"
        )

    if len(owned.loyalty_discount_ids) != 4 or len(owned.personal_discount_ids) != 1:
        _fail("Smoke discount rules are missing or duplicated")
    if len(owned.applied_discount_ids) != 1:
        _fail("WITH_DISCOUNT must have exactly one owned AppliedDiscount")
    if len(owned.booking_confirmation_ids) != 3 or len(owned.income_ids) != 3:
        _fail("Completed scenarios must have exact BookingConfirmation and Income sets")

    expected_loyalty_sources = set(manifest["ownership"]["loyalty_sources"].values())
    marker_sources = list(owned.loyalty_transactions_by_source)
    if len(marker_sources) != len(set(marker_sources)):
        _fail("Marker loyalty natural keys are duplicated")
    if set(marker_sources) != expected_loyalty_sources:
        _fail(
            "Marker loyalty natural-key set mismatch: "
            f"expected {sorted(expected_loyalty_sources)}, got {sorted(marker_sources)}"
        )

    target_dates = [
        today + timedelta(days=int(offset))
        for offset in manifest["schedule"]["working_day_offsets"]
    ]
    expected_schedule_count = sum(len(slots) for slots in generated_schedule.values())
    schedule_count = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id.in_(anchors.master_ids),
            MasterSchedule.date.in_(target_dates),
        )
        .count()
    )
    if schedule_count != expected_schedule_count:
        _fail(
            f"Managed schedule row count mismatch: expected {expected_schedule_count}, got {schedule_count}"
        )

    duplicate_schedule = (
        db.query(
            MasterSchedule.master_id,
            MasterSchedule.date,
            MasterSchedule.start_time,
            MasterSchedule.end_time,
            func.count(MasterSchedule.id),
        )
        .filter(
            MasterSchedule.master_id.in_(anchors.master_ids),
            MasterSchedule.date.in_(target_dates),
        )
        .group_by(
            MasterSchedule.master_id,
            MasterSchedule.date,
            MasterSchedule.start_time,
            MasterSchedule.end_time,
        )
        .having(func.count(MasterSchedule.id) > 1)
        .first()
    )
    if duplicate_schedule:
        _fail(f"Duplicate managed schedule rows detected: {duplicate_schedule}")

    if get_available_slots(
        db, OwnerType.MASTER, master.id, closed_day, int(service30.duration)
    ):
        _fail(f"Closed day {closed_day} still exposes available slots")

    partial_slots = get_available_slots(
        db, OwnerType.MASTER, master.id, partial_day, int(service30.duration)
    )
    partial_start = _parse_hhmm(
        manifest["schedule"]["partial_closed_start"], "partial_closed_start"
    )
    partial_end = _parse_hhmm(
        manifest["schedule"]["partial_closed_end"], "partial_closed_end"
    )
    if not partial_slots:
        _fail("Partial day has no free slots")
    if any(
        partial_start <= slot["start_time"].time() < partial_end
        for slot in partial_slots
    ):
        _fail("Partial closed window still exposes free slots")

    occupied_booking = bookings["UPCOMING_PAID"]
    occupied_slots = get_available_slots(
        db,
        OwnerType.MASTER,
        master.id,
        occupied_booking.start_time.date(),
        int(occupied_booking.service.duration),
    )
    if any(
        slot["start_time"] == occupied_booking.start_time for slot in occupied_slots
    ):
        _fail("Occupied booking slot is still exposed as available")
    if not occupied_slots:
        _fail("Occupied booking day has no remaining free slot")

    balances = [
        calculate_client_balance(db, master.id, client.id)
        for client in anchors.clients_by_phone.values()
    ]
    if any(balance < 0 for balance in balances):
        _fail(f"Negative loyalty balance detected: {balances}")

    for booking in marker_rows:
        tx_types = [
            transaction.transaction_type
            for transaction in db.query(LoyaltyTransaction)
            .filter(LoyaltyTransaction.booking_id == booking.id)
            .all()
        ]
        if len(tx_types) != len(set(tx_types)):
            _fail(f"Duplicate loyalty transaction type for booking {booking.id}")


def _run_refresh(
    db: Session, manifest: dict[str, Any]
) -> tuple[RefreshCounters, dict[str, Any]]:
    anchors = _resolve_anchors(db, manifest)
    _assert_no_booking_child_orphans(db)
    primary_master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    try:
        today = datetime.now(ZoneInfo(primary_master.timezone)).date()
    except ZoneInfoNotFoundError as exc:
        raise SmokeRefreshError(
            f"Primary master has invalid immutable timezone {primary_master.timezone!r}"
        ) from exc
    window_start = today - timedelta(
        days=int(manifest["refresh_window"]["days_before"])
    )
    window_end = today + timedelta(days=int(manifest["refresh_window"]["days_after"]))

    counters = RefreshCounters(
        users_found=len(anchors.master_ids) + len(anchors.client_ids)
    )
    created = CreatedIds.empty()
    owned_before = _resolve_owned_ids(db, manifest, anchors)
    protected_before = _capture_protected_state(db, owned_before)
    orphans_before = _foreign_key_orphans(db)

    existing_transactions = _prepare_existing_smoke_transactions(db, owned_before)
    _delete_previous_smoke_layer(db, owned_before, counters)
    services = _resolve_services(db, manifest, anchors, counters, created)

    primary_client = anchors.clients_by_phone[manifest["primary_client_phone"]]
    secondary_client = anchors.clients_by_phone[manifest["secondary_client_phone"]]
    loyalty_settings, created_loyalty_setting_ids = _ensure_loyalty_settings(
        db, primary_master, manifest, counters
    )
    created.loyalty_settings.update(created_loyalty_setting_ids)
    _create_discount_rules(db, primary_master, primary_client, manifest, counters)

    closed_day, partial_day, generated_schedule = _refresh_schedule(
        db,
        manifest,
        anchors,
        today,
        window_start,
        window_end,
        counters,
        created,
    )
    opening = _seed_opening_loyalty_balance(
        db,
        existing_transactions,
        counters,
        manifest,
        primary_master,
        primary_client,
        services[primary_master.id][90],
        manifest["ownership"]["loyalty_sources"]["OPENING_PRIMARY"],
        int(manifest["loyalty"]["target_available_points"]),
    )
    if opening.points <= 0:
        _fail("Opening loyalty balance must be positive")
    secondary_opening = _seed_opening_loyalty_balance(
        db,
        existing_transactions,
        counters,
        manifest,
        primary_master,
        secondary_client,
        services[primary_master.id][30],
        manifest["ownership"]["loyalty_sources"]["OPENING_SECONDARY"],
        int(manifest["loyalty"]["target_available_points"]),
    )
    if secondary_opening.points <= 0:
        _fail("Secondary-client opening loyalty balance must be positive")

    scenario_result = _create_booking_scenarios(
        db,
        manifest,
        anchors,
        services,
        generated_schedule,
        today,
        loyalty_settings,
        existing_transactions,
        counters,
    )
    db.flush()
    owned_after = _resolve_owned_ids(db, manifest, anchors)
    marker_loyalty_total = len(owned_after.loyalty_transaction_ids)

    _verify_schedule_and_scenarios(
        db,
        manifest,
        anchors,
        services,
        closed_day,
        partial_day,
        today,
        scenario_result,
        generated_schedule,
        owned_after,
    )
    protected_after = _capture_protected_state(db, owned_after)
    _assert_protected_state(
        protected_before,
        protected_after,
        created,
        anchors.master_ids,
    )
    _assert_no_new_orphans(orphans_before, _foreign_key_orphans(db))

    if protected_before["users"] != protected_after["users"]:
        counters.users_modified = 1
        _fail("User snapshot changed")
    if protected_before["masters"] != protected_after["masters"]:
        _fail("Master snapshot changed")

    details = {
        "window": f"{window_start}..{window_end}",
        "closed_day": closed_day.isoformat(),
        "partial_day": partial_day.isoformat(),
        "discount_winner": scenario_result["discount_winner"],
        "marker_bookings": len(owned_after.booking_ids),
        "marker_loyalty_transactions": marker_loyalty_total,
    }
    return counters, details


def _print_summary(
    *, mode: str, environment: str, counters: RefreshCounters, details: dict[str, Any]
) -> None:
    verb = "planned" if mode == "dry-run" else "applied"
    print(f"Release smoke refresh {verb} successfully")
    print(f"Mode: {mode}")
    print(f"Environment: {environment}")
    print(f"Database target: {details['database_target']}")
    print(f"Window: {details['window']}")
    print(f"Closed day: {details['closed_day']}")
    print(f"Partial closed day: {details['partial_day']}")
    print(f"Users found: {counters.users_found}")
    print(f"Users modified: {counters.users_modified}")
    print(f"Services created: {counters.services_created}")
    print(f"Master catalog services created: {counters.master_services_created}")
    print(f"Loyalty settings created: {counters.loyalty_settings_created}")
    print(f"Schedule rows deleted: {counters.schedule_deleted}")
    print(f"Schedule rows created: {counters.schedule_created}")
    print(f"Bookings deleted: {counters.bookings_deleted}")
    print(f"Bookings created: {counters.bookings_created}")
    print(f"Discount rules created: {counters.discount_rules_created}")
    print(f"Loyalty transactions created: {counters.loyalty_transactions_created}")
    print(
        f"Marker loyalty transactions total: {details['marker_loyalty_transactions']}"
    )
    print(f"Discount winner: {details['discount_winner']}")


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run", action="store_true", help="simulate and roll back (default)"
    )
    mode.add_argument(
        "--apply", action="store_true", help="commit the verified refresh"
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"manifest path (default: {DEFAULT_MANIFEST})",
    )
    parser.add_argument(
        "--expected-db",
        type=Path,
        default=None,
        help="exact SQLite database file required by --apply",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    mode = "apply" if args.apply else "dry-run"
    db: Session | None = None
    try:
        manifest = _load_manifest(args.manifest.resolve())
        _validate_manifest(manifest)
        environment = _guard_environment(manifest, apply=bool(args.apply))
        db = SessionLocal()
        _configure_connection_safety(db)
        database_target = _guard_database_target(
            db, apply=bool(args.apply), expected_db=args.expected_db
        )
        _assert_schema_compatible(db)
        counters, details = _run_refresh(db, manifest)
        details["database_target"] = database_target
        if args.apply:
            db.commit()
        else:
            db.rollback()
        _print_summary(
            mode=mode, environment=environment, counters=counters, details=details
        )
        if not args.apply:
            print("Dry-run rollback complete; database was not changed")
        return 0
    except Exception as exc:
        if db is not None:
            db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    raise SystemExit(main())

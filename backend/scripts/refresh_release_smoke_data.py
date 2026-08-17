#!/usr/bin/env python3
"""Safely refresh the additive Release 1.0 smoke layer.

The script never creates, deletes, or edits User/Master anchors. By default it
executes the complete refresh and verification flow inside one transaction and
then rolls it back. Use --apply for the single final commit.
"""

from __future__ import annotations

import argparse
import hashlib
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


def _fail(message: str) -> None:
    raise SmokeRefreshError(message)


def _contains_marker(column: Any, marker: str) -> Any:
    return func.coalesce(column, "").contains(marker)


def _not_contains_marker(column: Any, marker: str) -> Any:
    return ~_contains_marker(column, marker)


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


def _validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("version") != 1:
        _fail("Manifest version must be 1")
    if manifest.get("marker") != EXPECTED_MARKER:
        _fail(f"Manifest marker must be exactly {EXPECTED_MARKER!r}")

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


def _guard_environment(manifest: dict[str, Any]) -> str:
    environment = get_settings().ENVIRONMENT.strip().lower()
    allowed = {str(x).strip().lower() for x in manifest["allowed_environments"]}
    if environment not in allowed:
        _fail(
            f"Refusing to run in ENVIRONMENT={environment!r}; allowed: "
            + ", ".join(sorted(allowed))
        )
    if environment == "production":
        _fail("Production is always forbidden")
    return environment


def _configure_connection_safety(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        db.execute(text("PRAGMA foreign_keys = ON"))
        enabled = int(db.execute(text("PRAGMA foreign_keys")).scalar() or 0)
        if enabled != 1:
            _fail("Could not enable SQLite foreign key enforcement")


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


def _association_snapshot(db: Session, marker: str) -> tuple[tuple[int, int], ...]:
    rows = db.execute(
        select(master_services.c.master_id, master_services.c.service_id)
        .join(Service, Service.id == master_services.c.service_id)
        .where(
            _not_contains_marker(Service.name, marker),
            _not_contains_marker(Service.description, marker),
        )
        .order_by(master_services.c.master_id, master_services.c.service_id)
    ).all()
    return tuple((int(master_id), int(service_id)) for master_id, service_id in rows)


def _protected_child_snapshot(
    db: Session, model: Any, marker: str
) -> dict[int, tuple[Any, ...]]:
    rows = (
        db.query(model)
        .outerjoin(Booking, Booking.id == model.booking_id)
        .filter(or_(Booking.id.is_(None), _not_contains_marker(Booking.notes, marker)))
        .order_by(model.id)
        .all()
    )
    return _model_snapshot(rows, model)


def _capture_protected_state(
    db: Session,
    marker: str,
    master_ids: set[int],
    window_start: date,
    window_end: date,
) -> dict[str, Any]:
    schedule_outside = or_(
        MasterSchedule.master_id.is_(None),
        ~MasterSchedule.master_id.in_(master_ids),
        MasterSchedule.date.is_(None),
        MasterSchedule.date < window_start,
        MasterSchedule.date > window_end,
    )
    return {
        "users": _query_snapshot(db, User),
        "masters": _query_snapshot(db, Master),
        "bookings": _query_snapshot(
            db, Booking, _not_contains_marker(Booking.notes, marker)
        ),
        "services": _query_snapshot(
            db,
            Service,
            _not_contains_marker(Service.name, marker),
            _not_contains_marker(Service.description, marker),
        ),
        "master_services_list": _query_snapshot(
            db,
            MasterService,
            _not_contains_marker(MasterService.name, marker),
            _not_contains_marker(MasterService.description, marker),
        ),
        "master_service_categories": _query_snapshot(
            db,
            MasterServiceCategory,
            _not_contains_marker(MasterServiceCategory.name, marker),
        ),
        "service_links": _association_snapshot(db, marker),
        "schedule_outside": _query_snapshot(db, MasterSchedule, schedule_outside),
        "availability_slots": _query_snapshot(db, AvailabilitySlot),
        "loyalty_discounts": _query_snapshot(
            db,
            LoyaltyDiscount,
            _not_contains_marker(LoyaltyDiscount.name, marker),
            _not_contains_marker(LoyaltyDiscount.description, marker),
        ),
        "personal_discounts": _query_snapshot(
            db,
            PersonalDiscount,
            _not_contains_marker(PersonalDiscount.description, marker),
        ),
        "loyalty_transactions": _query_snapshot(
            db,
            LoyaltyTransaction,
            _not_contains_marker(LoyaltyTransaction.source, marker),
        ),
        "loyalty_settings": _query_snapshot(db, LoyaltySettings),
        "booking_edit_requests": _protected_child_snapshot(
            db, BookingEditRequest, marker
        ),
        "applied_discounts": _protected_child_snapshot(db, AppliedDiscount, marker),
        "incomes": _protected_child_snapshot(db, Income, marker),
        "missed_revenues": _protected_child_snapshot(db, MissedRevenue, marker),
        "booking_confirmations": _protected_child_snapshot(
            db, BookingConfirmation, marker
        ),
    }


def _assert_protected_state(
    before: dict[str, Any],
    after: dict[str, Any],
    created_loyalty_setting_ids: set[int],
    allowlist_master_ids: set[int],
) -> None:
    for name, expected in before.items():
        actual = after[name]
        if name == "loyalty_settings":
            for row_id, row_value in expected.items():
                if actual.get(row_id) != row_value:
                    _fail(
                        f"Existing LoyaltySettings row {row_id} was modified or removed"
                    )
            unexpected = set(actual) - set(expected) - created_loyalty_setting_ids
            if unexpected:
                _fail(f"Unexpected LoyaltySettings rows created: {sorted(unexpected)}")
            continue
        if actual != expected:
            _fail(f"Protected non-smoke state changed: {name}")

    for row_id in created_loyalty_setting_ids:
        row = after["loyalty_settings"].get(row_id)
        if row is None:
            _fail(f"Created LoyaltySettings row {row_id} disappeared")
    # master_id is the second model column after id.
    for row_id in created_loyalty_setting_ids:
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


def _assert_marker_scope(db: Session, marker: str, anchors: Anchors) -> None:
    marker_bookings = (
        db.query(Booking).filter(_contains_marker(Booking.notes, marker)).all()
    )
    for booking in marker_bookings:
        if (
            booking.master_id not in anchors.master_ids
            or booking.client_id not in anchors.client_ids
        ):
            _fail(f"Marker booking {booking.id} is outside the allowlist")

    marker_loyalty = (
        db.query(LoyaltyTransaction)
        .filter(_contains_marker(LoyaltyTransaction.source, marker))
        .all()
    )
    marker_booking_ids = {booking.id for booking in marker_bookings}
    unmarked_booking_transaction = (
        db.query(LoyaltyTransaction.id)
        .join(Booking, Booking.id == LoyaltyTransaction.booking_id)
        .filter(
            Booking.id.in_(marker_booking_ids),
            _not_contains_marker(LoyaltyTransaction.source, marker),
        )
        .first()
        if marker_booking_ids
        else None
    )
    if unmarked_booking_transaction:
        _fail(
            "A marker booking has a loyalty transaction without the release smoke marker"
        )
    for transaction in marker_loyalty:
        if (
            transaction.master_id not in anchors.master_ids
            or transaction.client_id not in anchors.client_ids
        ):
            _fail(
                f"Marker loyalty transaction {transaction.id} is outside the allowlist"
            )
        if (
            transaction.booking_id is not None
            and transaction.booking_id not in marker_booking_ids
        ):
            _fail(
                f"Marker loyalty transaction {transaction.id} references a non-marker booking"
            )

    for rule in db.query(LoyaltyDiscount).filter(
        or_(
            _contains_marker(LoyaltyDiscount.name, marker),
            _contains_marker(LoyaltyDiscount.description, marker),
        )
    ):
        if rule.master_id not in anchors.master_ids:
            _fail(f"Marker loyalty discount {rule.id} is outside the allowlist")

    for rule in db.query(PersonalDiscount).filter(
        _contains_marker(PersonalDiscount.description, marker)
    ):
        if rule.master_id not in anchors.master_ids:
            _fail(f"Marker personal discount {rule.id} is outside the allowlist")

    for item in db.query(MasterService).filter(
        or_(
            _contains_marker(MasterService.name, marker),
            _contains_marker(MasterService.description, marker),
        )
    ):
        if item.master_id not in anchors.master_ids:
            _fail(f"Marker MasterService {item.id} is outside the allowlist")

    for category in db.query(MasterServiceCategory).filter(
        _contains_marker(MasterServiceCategory.name, marker)
    ):
        if category.master_id not in anchors.master_ids:
            _fail(f"Marker service category {category.id} is outside the allowlist")

    marker_services = (
        db.query(Service)
        .filter(
            or_(
                _contains_marker(Service.name, marker),
                _contains_marker(Service.description, marker),
            )
        )
        .all()
    )
    for service in marker_services:
        linked_master_ids = set(
            db.execute(
                select(master_services.c.master_id).where(
                    master_services.c.service_id == service.id
                )
            ).scalars()
        )
        if not linked_master_ids or not linked_master_ids.issubset(anchors.master_ids):
            _fail(
                f"Marker Service {service.id} has missing or out-of-allowlist ownership"
            )


def _booking_scenario_label(booking: Booking) -> str:
    matches = [
        label for label in SCENARIO_LABELS if f"[{label}]" in (booking.notes or "")
    ]
    if len(matches) != 1:
        _fail(f"Marker booking {booking.id} has no unique smoke scenario label")
    return matches[0]


def _loyalty_source(marker: str, label: str, transaction_type: str) -> str:
    return f"{marker}:{label}:{transaction_type.upper()}"


def _opening_loyalty_source(marker: str, client_slot: str) -> str:
    return _loyalty_source(marker, f"OPENING_BALANCE_{client_slot}", "earned")


def _prepare_existing_smoke_transactions(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
) -> dict[str, LoyaltyTransaction]:
    """Normalize, park, and zero only owned ledger rows before booking rebuild."""
    marker = manifest["marker"]
    primary_client = anchors.clients_by_phone[manifest["primary_client_phone"]]
    secondary_client = anchors.clients_by_phone[manifest["secondary_client_phone"]]
    completed_labels = {
        "COMPLETED_PAID",
        "COMPLETED_UNPAID",
        "COMPLETED_LOYALTY_SPEND_EARN",
    }
    result: dict[str, LoyaltyTransaction] = {}
    rows = (
        db.query(LoyaltyTransaction)
        .filter(_contains_marker(LoyaltyTransaction.source, marker))
        .order_by(LoyaltyTransaction.id)
        .all()
    )
    for row in rows:
        if row.booking_id is not None:
            booking = db.get(Booking, row.booking_id)
            if booking is None:
                _fail(
                    f"Marker loyalty transaction {row.id} references a missing booking"
                )
            label = _booking_scenario_label(booking)
            if label not in completed_labels:
                _fail(
                    f"Marker loyalty transaction {row.id} belongs to unexpected scenario {label}"
                )
            source = _loyalty_source(marker, label, str(row.transaction_type))
        elif "OPENING_BALANCE" in (row.source or ""):
            if row.client_id == primary_client.id:
                source = _opening_loyalty_source(marker, "PRIMARY")
            elif row.client_id == secondary_client.id:
                source = _opening_loyalty_source(marker, "SECONDARY")
            else:
                _fail(
                    f"Opening-balance transaction {row.id} is outside the client allowlist"
                )
            if row.transaction_type != "earned":
                _fail(f"Opening-balance transaction {row.id} must be earned")
        else:
            _fail(
                f"Detached marker loyalty transaction {row.id} has unsupported source {row.source!r}"
            )

        if source in result:
            _fail(f"Duplicate marker loyalty natural key: {source}")
        row.source = source
        row.booking_id = None
        row.points = 0
        result[source] = row
    db.flush()
    return result


def _schedule_snapshot(
    db: Session, master_ids: set[int], window_start: date, window_end: date
) -> list[tuple[Any, ...]]:
    rows = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id.in_(master_ids),
            MasterSchedule.date >= window_start,
            MasterSchedule.date <= window_end,
        )
        .order_by(
            MasterSchedule.master_id,
            MasterSchedule.date,
            MasterSchedule.start_time,
            MasterSchedule.id,
        )
        .all()
    )
    return [
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
        for row in rows
    ]


def _schedule_snapshot_hash(snapshot: Sequence[tuple[Any, ...]]) -> str:
    return hashlib.sha256(repr(tuple(snapshot)).encode("utf-8")).hexdigest()[:16]


def _validate_schedule_scope(
    snapshot: Sequence[tuple[Any, ...]],
    master_ids: set[int],
    window_start: date,
    window_end: date,
    max_rows: int,
) -> None:
    if len(snapshot) > max_rows:
        _fail(f"Schedule scope has {len(snapshot)} rows; safety limit is {max_rows}")
    for row in snapshot:
        _, master_id, _, _, _, row_date, *_ = row
        if master_id not in master_ids:
            _fail(f"Schedule snapshot contains non-allowlist master_id={master_id}")
        if row_date is None or not (window_start <= row_date <= window_end):
            _fail(f"Schedule snapshot contains out-of-window date={row_date}")


def _delete_previous_smoke_layer(
    db: Session, marker: str, anchors: Anchors, counters: RefreshCounters
) -> None:
    marker_bookings = (
        db.query(Booking).filter(_contains_marker(Booking.notes, marker)).all()
    )
    booking_ids = [booking.id for booking in marker_bookings]

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
        for model in (
            BookingConfirmation,
            Income,
            MissedRevenue,
            AppliedDiscount,
            BookingEditRequest,
        ):
            db.query(model).filter(model.booking_id.in_(booking_ids)).delete(
                synchronize_session=False
            )
        counters.bookings_deleted = (
            db.query(Booking)
            .filter(Booking.id.in_(booking_ids))
            .delete(synchronize_session=False)
        )
    db.flush()

    marker_loyalty_rules = (
        db.query(LoyaltyDiscount)
        .filter(
            or_(
                _contains_marker(LoyaltyDiscount.name, marker),
                _contains_marker(LoyaltyDiscount.description, marker),
            )
        )
        .all()
    )
    marker_personal_rules = (
        db.query(PersonalDiscount)
        .filter(_contains_marker(PersonalDiscount.description, marker))
        .all()
    )
    loyalty_rule_ids = [rule.id for rule in marker_loyalty_rules]
    personal_rule_ids = [rule.id for rule in marker_personal_rules]
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
            "A marker discount is referenced by a non-marker booking; refusing to delete the rule"
        )
    if loyalty_rule_ids:
        db.query(LoyaltyDiscount).filter(
            LoyaltyDiscount.id.in_(loyalty_rule_ids)
        ).delete(synchronize_session=False)
    if personal_rule_ids:
        db.query(PersonalDiscount).filter(
            PersonalDiscount.id.in_(personal_rule_ids)
        ).delete(synchronize_session=False)
    db.flush()


def _find_service(
    db: Session,
    master: Master,
    spec: dict[str, Any],
    marker: str,
    counters: RefreshCounters,
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
    counters.master_services_created += 1
    return service


def _resolve_services(
    db: Session,
    manifest: dict[str, Any],
    anchors: Anchors,
    counters: RefreshCounters,
) -> dict[int, dict[int, Service]]:
    marker = manifest["marker"]
    result: dict[int, dict[int, Service]] = {}
    for _, master in anchors.masters_by_phone.values():
        by_duration: dict[int, Service] = {}
        for spec in manifest["services"]:
            service = _find_service(db, master, spec, marker, counters)
            catalog_service = _ensure_master_catalog_service(
                db, master, spec, marker, counters
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


def _pick_special_schedule_dates(
    db: Session,
    primary_master: Master,
    today: date,
    window_end: date,
    workdays: set[int],
) -> tuple[date, date]:
    recurring_days = {
        int(day)
        for (day,) in db.query(AvailabilitySlot.day_of_week)
        .filter(
            AvailabilitySlot.owner_type == OwnerType.MASTER,
            AvailabilitySlot.owner_id == primary_master.id,
        )
        .all()
        if day is not None
    }
    candidates = [
        today + timedelta(days=offset)
        for offset in range(3, (window_end - today).days + 1)
        if (today + timedelta(days=offset)).isoweekday() in workdays
        and (today + timedelta(days=offset)).isoweekday() not in recurring_days
    ]
    if len(candidates) < 2:
        _fail(
            "Cannot select closed/partial days without touching recurring AvailabilitySlot rows"
        )
    return candidates[0], candidates[1]


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
) -> tuple[date, date, dict[int, set[tuple[date, time, time]]]]:
    schedule_cfg = manifest["schedule"]
    max_rows = min(
        int(schedule_cfg["max_existing_rows_in_scope"]),
        ABSOLUTE_MAX_SCHEDULE_ROWS,
    )
    before = _schedule_snapshot(db, anchors.master_ids, window_start, window_end)
    _validate_schedule_scope(
        before, anchors.master_ids, window_start, window_end, max_rows
    )
    print(
        f"Schedule preflight: rows={len(before)}, snapshot={_schedule_snapshot_hash(before)}, "
        f"window={window_start}..{window_end}"
    )

    counters.schedule_deleted = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id.in_(anchors.master_ids),
            MasterSchedule.date >= window_start,
            MasterSchedule.date <= window_end,
        )
        .delete(synchronize_session=False)
    )

    primary_master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    workdays = {int(day) for day in schedule_cfg["weekdays"]}
    closed_day, partial_day = _pick_special_schedule_dates(
        db, primary_master, today, window_end, workdays
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

    generated: dict[int, set[tuple[date, time, time]]] = {
        master_id: set() for master_id in anchors.master_ids
    }
    day = window_start
    while day <= window_end:
        if day.isoweekday() in workdays:
            for master_id in sorted(anchors.master_ids):
                if master_id == primary_master.id and day == closed_day:
                    continue
                for slot_start, slot_end in _time_range(start, end, step):
                    if (
                        master_id == primary_master.id
                        and day == partial_day
                        and slot_start < partial_end
                        and slot_end > partial_start
                    ):
                        continue
                    db.add(
                        MasterSchedule(
                            master_id=master_id,
                            salon_id=None,
                            branch_id=None,
                            place_id=None,
                            date=day,
                            start_time=slot_start,
                            end_time=slot_end,
                            is_available=True,
                        )
                    )
                    generated[master_id].add((day, slot_start, slot_end))
                    counters.schedule_created += 1
        day += timedelta(days=1)
    if counters.schedule_created > max_rows:
        _fail(
            f"Generated schedule has {counters.schedule_created} rows; limit is {max_rows}"
        )
    db.flush()
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
    marker = manifest["marker"]
    cfg = manifest["discounts"]
    rules = (
        (
            "First visit",
            "first_visit",
            {},
            float(cfg["first_visit_percent"]),
        ),
        (
            "Returning",
            "returning_client",
            {
                "min_days_since_last_visit": int(cfg["returning_min_days"]),
                "max_days_since_last_visit": int(cfg["returning_max_days"]),
            },
            float(cfg["returning_percent"]),
        ),
        (
            "Birthday",
            "birthday",
            {
                "days_before": int(cfg["birthday_days_before"]),
                "days_after": int(cfg["birthday_days_after"]),
            },
            float(cfg["birthday_percent"]),
        ),
        (
            "Happy hours",
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
    for name, condition_type, parameters, percent in rules:
        db.add(
            LoyaltyDiscount(
                master_id=master.id,
                salon_id=None,
                discount_type=LoyaltyDiscountType.QUICK,
                name=f"{name} [{marker}]",
                description=f"[{marker}] Release smoke discount",
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
            description=f"Personal discount [{marker}]",
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
    marker: str,
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
        notes=f"[{marker}][{label}]",
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
    if not source.startswith(f"{EXPECTED_MARKER}:"):
        _fail(f"Unsafe loyalty source outside marker namespace: {source!r}")
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
    marker: str,
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
            source=_loyalty_source(marker, label, "spent"),
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
        source=_loyalty_source(marker, label, "earned"),
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
        marker=marker,
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
        marker=marker,
        label="COMPLETED_PAID",
        booking=completed_paid,
        master=master,
        settings=loyalty_settings,
    )
    _finalize_booking(db, completed_paid, master, master_user)
    created["COMPLETED_PAID"] = completed_paid

    completed_unpaid = _new_booking(
        db,
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
        marker=marker,
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
    window_start: date,
    window_end: date,
    scenario_result: dict[str, Any],
    expected_schedule_count: int,
) -> None:
    marker = manifest["marker"]
    master = anchors.masters_by_phone[manifest["primary_master_phone"]][1]
    service30 = services[master.id][30]
    bookings = scenario_result["bookings"]

    marker_rows = (
        db.query(Booking).filter(_contains_marker(Booking.notes, marker)).all()
    )
    labels = [
        next(
            (label for label in SCENARIO_LABELS if f"[{label}]" in (row.notes or "")),
            None,
        )
        for row in marker_rows
    ]
    if len(marker_rows) != len(SCENARIO_LABELS) or Counter(labels) != Counter(
        SCENARIO_LABELS
    ):
        _fail("Marker booking labels are missing or duplicated")

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
            _contains_marker(LoyaltyTransaction.source, marker),
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

    marker_loyalty_rules = (
        db.query(LoyaltyDiscount)
        .filter(
            or_(
                _contains_marker(LoyaltyDiscount.name, marker),
                _contains_marker(LoyaltyDiscount.description, marker),
            )
        )
        .count()
    )
    marker_personal_rules = (
        db.query(PersonalDiscount)
        .filter(_contains_marker(PersonalDiscount.description, marker))
        .count()
    )
    if marker_loyalty_rules != 4 or marker_personal_rules != 1:
        _fail("Smoke discount rules are missing or duplicated")

    expected_loyalty_sources = {
        _opening_loyalty_source(marker, "PRIMARY"),
        _opening_loyalty_source(marker, "SECONDARY"),
        _loyalty_source(marker, "COMPLETED_PAID", "earned"),
        _loyalty_source(marker, "COMPLETED_UNPAID", "earned"),
        _loyalty_source(marker, "COMPLETED_LOYALTY_SPEND_EARN", "spent"),
        _loyalty_source(marker, "COMPLETED_LOYALTY_SPEND_EARN", "earned"),
    }
    marker_sources = [
        source
        for (source,) in db.query(LoyaltyTransaction.source)
        .filter(_contains_marker(LoyaltyTransaction.source, marker))
        .all()
    ]
    if len(marker_sources) != len(set(marker_sources)):
        _fail("Marker loyalty natural keys are duplicated")
    if set(marker_sources) != expected_loyalty_sources:
        _fail(
            "Marker loyalty natural-key set mismatch: "
            f"expected {sorted(expected_loyalty_sources)}, got {sorted(marker_sources)}"
        )

    schedule_count = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id.in_(anchors.master_ids),
            MasterSchedule.date >= window_start,
            MasterSchedule.date <= window_end,
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
            MasterSchedule.date >= window_start,
            MasterSchedule.date <= window_end,
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
    marker = manifest["marker"]
    anchors = _resolve_anchors(db, manifest)
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
    _assert_marker_scope(db, marker, anchors)
    protected_before = _capture_protected_state(
        db, marker, anchors.master_ids, window_start, window_end
    )
    orphans_before = _foreign_key_orphans(db)

    schedule_before = _schedule_snapshot(
        db, anchors.master_ids, window_start, window_end
    )
    _validate_schedule_scope(
        schedule_before,
        anchors.master_ids,
        window_start,
        window_end,
        int(manifest["schedule"]["max_existing_rows_in_scope"]),
    )
    existing_transactions = _prepare_existing_smoke_transactions(db, manifest, anchors)
    _delete_previous_smoke_layer(db, marker, anchors, counters)
    services = _resolve_services(db, manifest, anchors, counters)

    primary_client = anchors.clients_by_phone[manifest["primary_client_phone"]]
    secondary_client = anchors.clients_by_phone[manifest["secondary_client_phone"]]
    loyalty_settings, created_loyalty_setting_ids = _ensure_loyalty_settings(
        db, primary_master, manifest, counters
    )
    _create_discount_rules(db, primary_master, primary_client, manifest, counters)

    closed_day, partial_day, generated_schedule = _refresh_schedule(
        db,
        manifest,
        anchors,
        today,
        window_start,
        window_end,
        counters,
    )
    opening = _seed_opening_loyalty_balance(
        db,
        existing_transactions,
        counters,
        primary_master,
        primary_client,
        services[primary_master.id][90],
        _opening_loyalty_source(marker, "PRIMARY"),
        int(manifest["loyalty"]["target_available_points"]),
    )
    if opening.points <= 0:
        _fail("Opening loyalty balance must be positive")
    secondary_opening = _seed_opening_loyalty_balance(
        db,
        existing_transactions,
        counters,
        primary_master,
        secondary_client,
        services[primary_master.id][30],
        _opening_loyalty_source(marker, "SECONDARY"),
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
    marker_loyalty_total = (
        db.query(LoyaltyTransaction)
        .filter(_contains_marker(LoyaltyTransaction.source, marker))
        .count()
    )

    _verify_schedule_and_scenarios(
        db,
        manifest,
        anchors,
        services,
        closed_day,
        partial_day,
        today,
        window_start,
        window_end,
        scenario_result,
        counters.schedule_created,
    )
    protected_after = _capture_protected_state(
        db, marker, anchors.master_ids, window_start, window_end
    )
    _assert_protected_state(
        protected_before,
        protected_after,
        created_loyalty_setting_ids,
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
        "marker_bookings": db.query(Booking)
        .filter(_contains_marker(Booking.notes, marker))
        .count(),
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


def _parse_args() -> argparse.Namespace:
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
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    mode = "apply" if args.apply else "dry-run"
    db: Session | None = None
    try:
        manifest = _load_manifest(args.manifest.resolve())
        _validate_manifest(manifest)
        environment = _guard_environment(manifest)
        db = SessionLocal()
        _configure_connection_safety(db)
        _assert_schema_compatible(db)
        counters, details = _run_refresh(db, manifest)
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

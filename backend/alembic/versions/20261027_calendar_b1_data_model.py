"""calendar B1: booking contact/source/time metadata, calendar blocks, receipts

Additive only. Existing rows keep NULL in every new nullable column: their
source, creator and UTC offset are unknown and are not backfilled. ``version``
starts at 1 for every row as an optimistic-lock counter, not a fact claim.

Revision ID: 20261027_calendar_b1
Revises: 20260914_push_notifications_v1
Create Date: 2026-10-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20261027_calendar_b1"
down_revision = "20260914_push_notifications_v1"
branch_labels = None
depends_on = None


BOOKING_CONTACT_INDEX = "ix_bookings_master_client_metadata_id"


def _columns(bind, table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table: str) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(table)}


def _booking_columns(with_foreign_keys: bool = False) -> list[sa.Column]:
    # SQLite cannot ALTER-add a constraint and production SQLite runs without
    # PRAGMA foreign_keys, so references there are enforced by application code.
    def ref(target: str) -> tuple:
        return (sa.ForeignKey(target),) if with_foreign_keys else ()

    return [
        sa.Column(
            "master_client_metadata_id",
            sa.Integer(),
            *ref("master_client_metadata.id"),
            nullable=True,
        ),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), *ref("users.id"), nullable=True),
        sa.Column("start_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("end_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("time_zone", sa.String(length=64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    ]


def _hold_columns() -> list[sa.Column]:
    return [
        sa.Column("start_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("end_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("time_zone", sa.String(length=64), nullable=True),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    required = {
        "bookings",
        "temporary_bookings",
        "master_client_metadata",
        "masters",
        "users",
    }
    missing = required - tables
    if missing:
        raise RuntimeError(f"Required tables do not exist: {sorted(missing)}")

    existing = _columns(bind, "bookings")
    for column in _booking_columns(with_foreign_keys=bind.dialect.name != "sqlite"):
        if column.name not in existing:
            op.add_column("bookings", column)
    if BOOKING_CONTACT_INDEX not in _indexes(bind, "bookings"):
        op.create_index(
            BOOKING_CONTACT_INDEX, "bookings", ["master_client_metadata_id"]
        )

    existing = _columns(bind, "temporary_bookings")
    for column in _hold_columns():
        if column.name not in existing:
            op.add_column("temporary_bookings", column)

    if "calendar_blocks" not in tables:
        op.create_table(
            "calendar_blocks",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("master_id", sa.Integer(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(length=16), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=True),
            sa.Column("description", sa.String(length=1000), nullable=True),
            sa.Column("start_utc_us", sa.BigInteger(), nullable=False),
            sa.Column("end_utc_us", sa.BigInteger(), nullable=False),
            sa.Column("time_zone", sa.String(length=64), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["master_id"], ["masters.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.CheckConstraint(
                "end_utc_us > start_utc_us", name="ck_calendar_blocks_interval"
            ),
            sa.CheckConstraint(
                "category IN ('personal', 'break', 'busy')",
                name="ck_calendar_blocks_category",
            ),
            sa.CheckConstraint("version >= 1", name="ck_calendar_blocks_version"),
        )
        op.create_index(
            "idx_calendar_blocks_master_range",
            "calendar_blocks",
            ["master_id", "start_utc_us", "end_utc_us"],
        )
        op.create_index(op.f("ix_calendar_blocks_id"), "calendar_blocks", ["id"])

    if "idempotency_receipts" not in tables:
        op.create_table(
            "idempotency_receipts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=False),
            sa.Column("scope", sa.String(length=64), nullable=False),
            sa.Column("key_hash", sa.String(length=64), nullable=False),
            sa.Column("request_hash", sa.String(length=64), nullable=False),
            sa.Column("resource_type", sa.String(length=32), nullable=False),
            sa.Column("resource_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "actor_user_id",
                "scope",
                "key_hash",
                name="uq_idempotency_receipts_actor_scope_key",
            ),
            sa.CheckConstraint(
                "length(key_hash) = 64", name="ck_idempotency_receipts_key_hash"
            ),
            sa.CheckConstraint(
                "length(request_hash) = 64", name="ck_idempotency_receipts_request_hash"
            ),
        )
        op.create_index(
            op.f("ix_idempotency_receipts_id"), "idempotency_receipts", ["id"]
        )


def downgrade() -> None:
    # Destroys calendar blocks and receipts. After B2/C start writing blocks this
    # is not a safe rollback; see Phase B rollout notes.
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "idempotency_receipts" in tables:
        op.drop_table("idempotency_receipts")
    if "calendar_blocks" in tables:
        op.drop_table("calendar_blocks")

    # Native DROP COLUMN only (SQLite >= 3.35). Batch copy-and-move is avoided on
    # purpose: recreating bookings would drop unnamed inline constraints.
    existing = _columns(bind, "temporary_bookings")
    for column in _hold_columns():
        if column.name in existing:
            op.drop_column("temporary_bookings", column.name)

    if BOOKING_CONTACT_INDEX in _indexes(bind, "bookings"):
        op.drop_index(BOOKING_CONTACT_INDEX, table_name="bookings")
    existing = _columns(bind, "bookings")
    for column in _booking_columns():
        if column.name in existing:
            op.drop_column("bookings", column.name)

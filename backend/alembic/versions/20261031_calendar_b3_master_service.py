"""calendar B3: optional master catalog service on bookings

Additive only. Existing rows stay NULL. The column is not Service.id.

Revision ID: 20261031_b3_master_svc
Revises: 20261030_calendar_b3
Create Date: 2026-10-31
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20261031_b3_master_svc"
down_revision = "20261030_calendar_b3"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, name: str) -> bool:
    if table not in set(sa.inspect(bind).get_table_names()):
        return False
    return name in {column["name"] for column in sa.inspect(bind).get_columns(table)}


def _has_master_service_fk(bind) -> bool:
    if bind.dialect.name == "sqlite":
        rows = bind.execute(sa.text("PRAGMA foreign_key_list(bookings)")).fetchall()
        return any(
            row[2] == "master_services_list" and row[3] == "master_service_id" and row[4] == "id"
            for row in rows
        )
    for fk in sa.inspect(bind).get_foreign_keys("bookings"):
        if (
            fk.get("referred_table") == "master_services_list"
            and tuple(fk.get("constrained_columns") or ()) == ("master_service_id",)
            and tuple(fk.get("referred_columns") or ()) == ("id",)
        ):
            return True
    return False


def _ensure_index(bind) -> None:
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("bookings")}
    if "ix_bookings_master_service_id" not in indexes:
        op.create_index("ix_bookings_master_service_id", "bookings", ["master_service_id"])


def upgrade() -> None:
    bind = op.get_bind()
    has_column = _has_column(bind, "bookings", "master_service_id")
    has_fk = _has_master_service_fk(bind) if has_column else False
    if has_column and not has_fk:
        raise RuntimeError(
            "bookings.master_service_id exists without a foreign key to "
            "master_services_list(id). SQLite cannot attach that constraint "
            "without rebuilding bookings, so this revision refuses to stamp "
            "the schema as complete."
        )
    if not has_column:
        if bind.dialect.name == "sqlite":
            # One ADD COLUMN. Alembic 1.13 has no inline_references and would
            # emit a second ADD CONSTRAINT, which SQLite rejects.
            op.execute(
                sa.text(
                    "ALTER TABLE bookings ADD COLUMN master_service_id "
                    "INTEGER REFERENCES master_services_list(id) DEFAULT NULL"
                )
            )
        else:
            op.add_column(
                "bookings",
                sa.Column(
                    "master_service_id",
                    sa.Integer(),
                    sa.ForeignKey("master_services_list.id"),
                    nullable=True,
                ),
            )
    _ensure_index(bind)


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "bookings", "master_service_id"):
        return
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("bookings")}
    if "ix_bookings_master_service_id" in indexes:
        op.drop_index("ix_bookings_master_service_id", table_name="bookings")
    op.drop_column("bookings", "master_service_id")

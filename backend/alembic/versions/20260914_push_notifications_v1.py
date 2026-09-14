"""add notifications, push_devices and notification_outbox

Revision ID: 20260914_push_notifications_v1
Revises: 20260830_free_booking_limit
Create Date: 2026-09-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260914_push_notifications_v1"
down_revision = "20260830_free_booking_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        raise RuntimeError("Required table does not exist: users")

    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("body", sa.String(length=500), nullable=False),
            sa.Column("entity_type", sa.String(length=32), nullable=True),
            sa.Column("entity_id", sa.Integer(), nullable=True),
            sa.Column("dedup_key", sa.String(length=128), nullable=True),
            sa.Column("data_json", sa.JSON(), nullable=True),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id", "dedup_key", name="uq_notifications_user_dedup_key"
            ),
        )
        op.create_index(
            "idx_notifications_user_created",
            "notifications",
            ["user_id", "created_at"],
        )
        op.create_index(
            "idx_notifications_user_read",
            "notifications",
            ["user_id", "read_at"],
        )
        op.create_index(
            op.f("ix_notifications_id"), "notifications", ["id"], unique=False
        )

    tables = set(sa.inspect(bind).get_table_names())
    if "push_devices" not in tables:
        op.create_table(
            "push_devices",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("installation_id", sa.String(length=36), nullable=False),
            sa.Column("token", sa.String(length=512), nullable=False),
            sa.Column("provider", sa.String(length=16), nullable=False),
            sa.Column("platform", sa.String(length=16), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("app_version", sa.String(length=32), nullable=True),
            sa.Column("build_number", sa.String(length=32), nullable=True),
            sa.Column("locale", sa.String(length=32), nullable=True),
            sa.Column("timezone", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("invalidated_at", sa.DateTime(), nullable=True),
            sa.Column("invalid_reason", sa.String(length=64), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "installation_id", name="uq_push_devices_installation_id"
            ),
            sa.UniqueConstraint("token", name="uq_push_devices_token"),
        )
        op.create_index(
            "idx_push_devices_user_active",
            "push_devices",
            ["user_id", "is_active"],
        )
        op.create_index(
            op.f("ix_push_devices_id"), "push_devices", ["id"], unique=False
        )

    tables = set(sa.inspect(bind).get_table_names())
    if "notification_outbox" not in tables:
        op.create_table(
            "notification_outbox",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("notification_id", sa.Integer(), nullable=False),
            sa.Column("push_device_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("provider_ticket_id", sa.String(length=128), nullable=True),
            sa.Column("retry_count", sa.Integer(), nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
            sa.Column("last_error_class", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"]),
            sa.ForeignKeyConstraint(["push_device_id"], ["push_devices.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "notification_id",
                "push_device_id",
                name="uq_notification_outbox_notification_device",
            ),
        )
        op.create_index(
            "idx_notification_outbox_status_next",
            "notification_outbox",
            ["status", "next_attempt_at"],
        )
        op.create_index(
            op.f("ix_notification_outbox_id"),
            "notification_outbox",
            ["id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    # Drop dependent outbox first. No ON DELETE CASCADE: audit rows must not
    # disappear implicitly if a notification/device is removed later.
    if "notification_outbox" in tables:
        op.drop_table("notification_outbox")
    if "push_devices" in tables:
        op.drop_table("push_devices")
    if "notifications" in tables:
        op.drop_table("notifications")

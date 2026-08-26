"""Apple IAP subscription fields and stable app account token storage.

Revision ID: 20260809_apple_iap_fields
Revises: 20260721_account_deletion_fields
Create Date: 2026-08-09
"""
from alembic import op
import sqlalchemy as sa


revision = "20260809_apple_iap_fields"
down_revision = "20260721_account_deletion_fields"
branch_labels = None
depends_on = None


def _table_schema(bind, table_name):
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        raise RuntimeError(f"Required table does not exist: {table_name}")
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    indexes = {index["name"] for index in inspector.get_indexes(table_name)}
    return columns, indexes


def upgrade():
    bind = op.get_bind()
    users_columns, users_indexes = _table_schema(bind, "users")
    subscription_columns, subscription_indexes = _table_schema(bind, "subscriptions")

    user_column_missing = "revenuecat_app_user_id" not in users_columns
    user_index_missing = "ix_users_revenuecat_app_user_id" not in users_indexes
    if user_column_missing or user_index_missing:
        with op.batch_alter_table("users") as batch:
            if user_column_missing:
                batch.add_column(
                    sa.Column("revenuecat_app_user_id", sa.String(length=36), nullable=True)
                )
            if user_index_missing:
                batch.create_index(
                    "ix_users_revenuecat_app_user_id",
                    ["revenuecat_app_user_id"],
                    unique=True,
                )

    subscription_additions = (
        sa.Column(
            "billing_provider",
            sa.String(length=32),
            nullable=False,
            server_default="robokassa",
        ),
        sa.Column("apple_original_transaction_id", sa.String(length=128), nullable=True),
        sa.Column("apple_transaction_id", sa.String(length=128), nullable=True),
        sa.Column("apple_product_id", sa.String(length=128), nullable=True),
        sa.Column("apple_environment", sa.String(length=32), nullable=True),
    )
    missing_subscription_columns = [
        column
        for column in subscription_additions
        if column.name not in subscription_columns
    ]
    original_transaction_index_missing = (
        "ix_subscriptions_apple_original_transaction_id" not in subscription_indexes
    )
    product_index_missing = "ix_subscriptions_apple_product_id" not in subscription_indexes

    if (
        missing_subscription_columns
        or original_transaction_index_missing
        or product_index_missing
    ):
        with op.batch_alter_table("subscriptions") as batch:
            for column in missing_subscription_columns:
                batch.add_column(column)
            if original_transaction_index_missing:
                batch.create_index(
                    "ix_subscriptions_apple_original_transaction_id",
                    ["apple_original_transaction_id"],
                    unique=True,
                )
            if product_index_missing:
                batch.create_index(
                    "ix_subscriptions_apple_product_id",
                    ["apple_product_id"],
                    unique=False,
                )


def downgrade():
    with op.batch_alter_table("subscriptions") as batch:
        batch.drop_index("ix_subscriptions_apple_product_id")
        batch.drop_index("ix_subscriptions_apple_original_transaction_id")
        batch.drop_column("apple_environment")
        batch.drop_column("apple_product_id")
        batch.drop_column("apple_transaction_id")
        batch.drop_column("apple_original_transaction_id")
        batch.drop_column("billing_provider")

    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_revenuecat_app_user_id")
        batch.drop_column("revenuecat_app_user_id")

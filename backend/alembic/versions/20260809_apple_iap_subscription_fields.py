"""apple iap subscription fields and revenuecat app user id

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


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("revenuecat_app_user_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_users_revenuecat_app_user_id", ["revenuecat_app_user_id"], unique=True)

    with op.batch_alter_table("subscriptions") as batch:
        batch.add_column(sa.Column("billing_provider", sa.String(length=32), nullable=False, server_default="robokassa"))
        batch.add_column(sa.Column("apple_original_transaction_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("apple_transaction_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("apple_product_id", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("apple_environment", sa.String(length=32), nullable=True))
        batch.create_index("ix_subscriptions_apple_original_transaction_id", ["apple_original_transaction_id"], unique=True)
        batch.create_index("ix_subscriptions_apple_product_id", ["apple_product_id"], unique=False)


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

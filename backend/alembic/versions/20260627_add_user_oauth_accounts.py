"""add user oauth accounts

Revision ID: 20260627_add_user_oauth_accounts
Revises: 20260620_add_promo_engine_foundation
Create Date: 2026-06-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20260627_add_user_oauth_accounts"
down_revision = "20260620_add_promo_engine_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(sa.inspect(bind).get_table_names())
    if "user_oauth_accounts" in existing_tables:
        return

    op.create_table(
        "user_oauth_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_user_oauth_provider_user"),
    )
    op.create_index("idx_user_oauth_user", "user_oauth_accounts", ["user_id"])
    op.create_index("idx_user_oauth_provider", "user_oauth_accounts", ["provider"])


def downgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(sa.inspect(bind).get_table_names())
    if "user_oauth_accounts" not in existing_tables:
        return
    op.drop_index("idx_user_oauth_provider", table_name="user_oauth_accounts")
    op.drop_index("idx_user_oauth_user", table_name="user_oauth_accounts")
    op.drop_table("user_oauth_accounts")

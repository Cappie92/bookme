"""add payments.public_id

Revision ID: 20260708_payment_public_id
Revises: 20260627_add_user_oauth_accounts
Create Date: 2026-07-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260708_payment_public_id"
down_revision: Union[str, None] = "20260627_add_user_oauth_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("payments")}
    if "public_id" not in cols:
        op.add_column(
            "payments",
            sa.Column("public_id", sa.String(), nullable=True),
        )

    from utils.payment_public_id import backfill_payment_public_ids

    backfill_payment_public_ids(conn)

    insp = sa.inspect(conn)
    index_names = {ix["name"] for ix in insp.get_indexes("payments")}
    if "ix_payments_public_id" not in index_names:
        op.create_index(
            "ix_payments_public_id",
            "payments",
            ["public_id"],
            unique=True,
        )

    # SQLite не поддерживает ALTER COLUMN ... SET NOT NULL (см. booking public_reference).
    # После backfill значения заданы; NOT NULL на уровне PostgreSQL / приложения.
    if conn.dialect.name != "sqlite":
        op.alter_column(
            "payments",
            "public_id",
            existing_type=sa.String(),
            nullable=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("payments")}
    if "public_id" not in cols:
        return

    index_names = {ix["name"] for ix in insp.get_indexes("payments")}
    if "ix_payments_public_id" in index_names:
        op.drop_index("ix_payments_public_id", table_name="payments")

    op.drop_column("payments", "public_id")

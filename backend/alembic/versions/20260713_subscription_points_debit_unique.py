"""subscription points debit unique index + snapshot source type

Revision ID: 20260713_subscription_points_debit_unique
Revises: 20260712_snapshot_subscription_points
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260713_subscription_points_debit_unique"
down_revision: Union[str, None] = "20260712_snapshot_subscription_points"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscription_points_ledger" not in insp.get_table_names():
        return

    indexes = {idx["name"] for idx in insp.get_indexes("subscription_points_ledger")}
    if "uq_subscription_points_debit_source" not in indexes:
        dialect = conn.dialect.name
        if dialect == "sqlite":
            op.execute(
                sa.text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_points_debit_source
                    ON subscription_points_ledger (master_id, source_type, source_id)
                    WHERE direction = 'DEBIT'
                    """
                )
            )
        elif dialect == "postgresql":
            op.execute(
                sa.text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_points_debit_source
                    ON subscription_points_ledger (master_id, source_type, source_id)
                    WHERE direction = 'DEBIT'
                    """
                )
            )
        else:
            op.create_index(
                "uq_subscription_points_debit_source",
                "subscription_points_ledger",
                ["master_id", "source_type", "source_id"],
                unique=True,
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscription_points_ledger" not in insp.get_table_names():
        return
    indexes = {idx["name"] for idx in insp.get_indexes("subscription_points_ledger")}
    if "uq_subscription_points_debit_source" in indexes:
        op.drop_index("uq_subscription_points_debit_source", table_name="subscription_points_ledger")

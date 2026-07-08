"""normalize subscriptions.status active -> ACTIVE

Revision ID: 20260709_subscription_status_active
Revises: 20260708_payment_public_id
Create Date: 2026-07-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260709_subscription_status_active"
down_revision: Union[str, None] = "20260708_payment_public_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscriptions" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("subscriptions")}
    if "status" not in cols:
        return
    op.execute(
        sa.text("UPDATE subscriptions SET status='ACTIVE' WHERE status='active'")
    )


def downgrade() -> None:
    # Historical data fix is irreversible.
    pass

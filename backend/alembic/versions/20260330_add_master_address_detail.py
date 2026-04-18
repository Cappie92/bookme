"""add master.address_detail

Revision ID: 20260330_addr_detail
Revises: 20260311_sf_clients
Create Date: 2026-03-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260330_addr_detail"
down_revision: Union[str, None] = "20260311_sf_clients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("masters")}
    if "address_detail" not in cols:
        op.add_column("masters", sa.Column("address_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("masters")}
    if "address_detail" in cols:
        op.drop_column("masters", "address_detail")

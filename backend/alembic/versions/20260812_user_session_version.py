"""add user session version for normal JWT revocation

Revision ID: 20260812_session_version
Revises: 20260809_apple_iap_fields
Create Date: 2026-08-12
"""
from alembic import op
import sqlalchemy as sa


revision = "20260812_session_version"
down_revision = "20260809_apple_iap_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "session_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("session_version")

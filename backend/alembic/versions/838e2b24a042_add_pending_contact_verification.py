"""add_pending_contact_verification

Revision ID: 838e2b24a042
Revises: 20260413_pre_visit_bf
Create Date: 2026-05-07 16:18:35.819362

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '838e2b24a042'
down_revision: Union[str, None] = '20260413_pre_visit_bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_verification_call_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("phone_verification_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("phone_verification_target_phone", sa.String(), nullable=True))
    op.add_column("users", sa.Column("phone_verification_purpose", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pending_phone", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pending_phone_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("pending_email", sa.String(), nullable=True))

    op.add_column("email_verifications", sa.Column("purpose", sa.String(), nullable=False, server_default="signup"))
    op.add_column("email_verifications", sa.Column("email_to_verify", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("email_verifications", "email_to_verify")
    op.drop_column("email_verifications", "purpose")

    op.drop_column("users", "pending_email")
    op.drop_column("users", "pending_phone_expires_at")
    op.drop_column("users", "pending_phone")
    op.drop_column("users", "phone_verification_purpose")
    op.drop_column("users", "phone_verification_target_phone")
    op.drop_column("users", "phone_verification_attempts")
    op.drop_column("users", "phone_verification_call_id")

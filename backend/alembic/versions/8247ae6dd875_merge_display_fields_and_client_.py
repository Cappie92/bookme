"""merge display_fields and client_restrictions

Revision ID: 8247ae6dd875
Revises: add_display_fields, add_client_restriction_rules_and_payment
Create Date: 2025-12-22 22:45:41.477519

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8247ae6dd875'
down_revision: Union[str, None] = ('add_display_fields', 'add_client_restriction_rules_and_payment')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

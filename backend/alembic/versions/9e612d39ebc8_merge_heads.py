"""merge_heads

Revision ID: 9e612d39ebc8
Revises: add_loyalty_system, add_logo_field_to_salon_and_master
Create Date: 2025-07-28 20:19:25.077791

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e612d39ebc8'
down_revision: Union[str, None] = ('add_loyalty_system', 'add_logo_field_to_salon_and_master')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

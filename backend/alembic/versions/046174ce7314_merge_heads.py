"""merge_heads

Revision ID: 046174ce7314
Revises: 10f894bb7b08, add_subscription_fields
Create Date: 2025-09-14 18:51:23.288049

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '046174ce7314'
down_revision: Union[str, None] = ('10f894bb7b08', 'add_subscription_fields')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

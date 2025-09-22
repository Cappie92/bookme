"""Add payment_period and auto_renewal to subscriptions

Revision ID: add_subscription_fields
Revises: simple_salon_notes
Create Date: 2025-09-10 10:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_subscription_fields'
down_revision: Union[str, None] = 'simple_salon_notes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем только недостающие колонки
    try:
        op.add_column('subscriptions', sa.Column('payment_period', sa.String(), nullable=True))
    except Exception:
        pass  # Колонка уже существует
    
    try:
        op.add_column('subscriptions', sa.Column('auto_renewal', sa.Boolean(), nullable=True))
    except Exception:
        pass  # Колонка уже существует


def downgrade() -> None:
    # Удаляем добавленные колонки
    try:
        op.drop_column('subscriptions', 'payment_period')
    except Exception:
        pass
    
    try:
        op.drop_column('subscriptions', 'auto_renewal')
    except Exception:
        pass

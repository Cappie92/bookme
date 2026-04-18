"""remove_valid_until_column

Revision ID: remove_valid_until_column
Revises: update_subscriptions_columns
Create Date: 2024-12-19 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'remove_valid_until_column'
down_revision = 'update_subscriptions_columns'
branch_labels = None
depends_on = None


def upgrade():
    # Удаляем колонку valid_until из таблицы subscriptions
    try:
        op.drop_column('subscriptions', 'valid_until')
    except:
        pass  # Колонка уже удалена


def downgrade():
    # Добавляем обратно колонку valid_until
    try:
        op.add_column('subscriptions', sa.Column('valid_until', sa.DateTime(), nullable=True))
    except:
        pass  # Колонка уже существует 
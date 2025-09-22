"""update_subscriptions_columns

Revision ID: update_subscriptions_columns
Revises: add_balance_system
Create Date: 2024-12-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'update_subscriptions_columns'
down_revision = 'add_balance_system'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем недостающие колонки в таблицу subscriptions
    try:
        op.add_column('subscriptions', sa.Column('start_date', sa.DateTime(), nullable=True))
    except:
        pass  # Колонка уже существует
    
    try:
        op.add_column('subscriptions', sa.Column('end_date', sa.DateTime(), nullable=True))
    except:
        pass  # Колонка уже существует
    
    try:
        op.add_column('subscriptions', sa.Column('daily_rate', sa.Float(), nullable=True))
    except:
        pass  # Колонка уже существует
    
    try:
        op.add_column('subscriptions', sa.Column('is_active', sa.Boolean(), nullable=True))
    except:
        pass  # Колонка уже существует


def downgrade():
    # Удаляем добавленные колонки
    try:
        op.drop_column('subscriptions', 'is_active')
    except:
        pass
    
    try:
        op.drop_column('subscriptions', 'daily_rate')
    except:
        pass
    
    try:
        op.drop_column('subscriptions', 'end_date')
    except:
        pass
    
    try:
        op.drop_column('subscriptions', 'start_date')
    except:
        pass 
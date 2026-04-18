"""add_payments_table

Revision ID: add_payments_table
Revises: add_freeze_days
Create Date: 2025-01-28 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'add_payments_table'
down_revision: Union[str, None] = 'add_freeze_days'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем, существует ли таблица payments
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'payments' in existing_tables:
        print("⚠️ Таблица payments уже существует, проверяем структуру...")
        # Проверяем структуру таблицы
        columns = {col['name']: col for col in inspector.get_columns('payments')}
        
        # Проверяем и переименовываем metadata в payment_metadata если нужно
        if 'metadata' in columns and 'payment_metadata' not in columns:
            print("Переименовываем колонку metadata в payment_metadata")
            try:
                conn.execute(text("ALTER TABLE payments RENAME COLUMN metadata TO payment_metadata"))
                conn.commit()
                print("✅ Колонка переименована")
            except Exception as e:
                print(f"⚠️ Не удалось переименовать колонку: {e}")
        elif 'payment_metadata' in columns:
            print("✅ Колонка payment_metadata уже существует")
        elif 'payment_metadata' not in columns:
            print("Добавляем колонку payment_metadata")
            try:
                op.add_column('payments', sa.Column('payment_metadata', sa.JSON(), nullable=True))
                print("✅ Колонка добавлена")
            except Exception as e:
                print(f"⚠️ Не удалось добавить колонку: {e}")
        
        print("✅ Миграция для таблицы payments пропущена (таблица уже существует)")
        return
    
    # Создаем таблицу payments
    op.create_table('payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('payment_type', sa.String(), nullable=False),
        sa.Column('robokassa_invoice_id', sa.String(), nullable=False),
        sa.Column('robokassa_payment_id', sa.String(), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=True, server_default='0'),
        sa.Column('robokassa_recurring_id', sa.String(), nullable=True),
        sa.Column('subscription_period', sa.String(), nullable=True),
        sa.Column('plan_id', sa.Integer(), nullable=True),
        sa.Column('payment_metadata', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('robokassa_invoice_id')
    )
    
    # Создаем индексы
    op.create_index('idx_payment_user_status', 'payments', ['user_id', 'status'], unique=False)
    op.create_index('idx_payment_robokassa_invoice', 'payments', ['robokassa_invoice_id'], unique=False)
    op.create_index('idx_payment_type_status', 'payments', ['payment_type', 'status'], unique=False)
    op.create_index('idx_payments_user_id', 'payments', ['user_id'], unique=False)
    op.create_index('idx_payments_subscription_id', 'payments', ['subscription_id'], unique=False)
    op.create_index('idx_payments_status', 'payments', ['status'], unique=False)
    op.create_index('idx_payments_payment_type', 'payments', ['payment_type'], unique=False)
    op.create_index('idx_payments_is_recurring', 'payments', ['is_recurring'], unique=False)
    op.create_index('idx_payments_created_at', 'payments', ['created_at'], unique=False)


def downgrade() -> None:
    # Удаляем индексы
    op.drop_index('idx_payments_created_at', table_name='payments')
    op.drop_index('idx_payments_is_recurring', table_name='payments')
    op.drop_index('idx_payments_payment_type', table_name='payments')
    op.drop_index('idx_payments_status', table_name='payments')
    op.drop_index('idx_payments_subscription_id', table_name='payments')
    op.drop_index('idx_payments_user_id', table_name='payments')
    op.drop_index('idx_payment_type_status', table_name='payments')
    op.drop_index('idx_payment_robokassa_invoice', table_name='payments')
    op.drop_index('idx_payment_user_status', table_name='payments')
    
    # Удаляем таблицу
    op.drop_table('payments')


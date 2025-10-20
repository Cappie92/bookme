"""Simple unified master structure update

Revision ID: 20250127_simple_unified_master_update
Revises: cb9773884a4f
Create Date: 2025-01-27 12:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250127_simple_unified_master_update'
down_revision = 'cb9773884a4f'
branch_labels = None
depends_on = None


def upgrade():
    """Простое обновление для унифицированной структуры мастеров"""
    
    # 1. Добавляем поля work_type в основные таблицы
    print("Добавляем поля work_type в основные таблицы...")
    
    # Добавляем work_type в bookings
    op.add_column('bookings', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('bookings', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в services
    op.add_column('services', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('services', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('services', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('services', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в client_restrictions
    op.add_column('client_restrictions', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('client_restrictions', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('client_restrictions', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('client_restrictions', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в incomes
    op.add_column('incomes', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('incomes', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('incomes', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('incomes', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в expenses
    op.add_column('expenses', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('expenses', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('expenses', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('expenses', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в expense_types
    op.add_column('expense_types', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('expense_types', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('expense_types', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('expense_types', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в expense_templates
    op.add_column('expense_templates', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('expense_templates', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('expense_templates', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('expense_templates', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в missed_revenues
    op.add_column('missed_revenues', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('missed_revenues', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('missed_revenues', sa.Column('salon_work_id', sa.Integer(), nullable=True))
    op.add_column('missed_revenues', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # Добавляем work_type в indie_master_schedules
    op.add_column('indie_master_schedules', sa.Column('work_type', sa.String(), nullable=True))
    op.add_column('indie_master_schedules', sa.Column('master_id', sa.Integer(), nullable=True))
    op.add_column('indie_master_schedules', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    
    # 2. Обновляем таблицу salon_masters - добавляем недостающие поля
    print("Обновляем таблицу salon_masters...")
    
    # Добавляем поля в salon_masters
    op.add_column('salon_masters', sa.Column('can_work_in_salon', sa.Boolean(), nullable=True, default=True))
    op.add_column('salon_masters', sa.Column('branch_id', sa.Integer(), nullable=True))
    op.add_column('salon_masters', sa.Column('is_active', sa.Boolean(), nullable=True, default=True))
    op.add_column('salon_masters', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('salon_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
    
    # Заполняем значения по умолчанию
    op.execute("UPDATE salon_masters SET can_work_in_salon = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")
    
    # 3. Обновляем таблицу indie_masters - добавляем недостающие поля
    print("Обновляем таблицу indie_masters...")
    
    # Добавляем поля в indie_masters
    op.add_column('indie_masters', sa.Column('can_work_independently', sa.Boolean(), nullable=True, default=True))
    op.add_column('indie_masters', sa.Column('is_active', sa.Boolean(), nullable=True, default=True))
    op.add_column('indie_masters', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
    
    # Заполняем значения по умолчанию
    op.execute("UPDATE indie_masters SET can_work_independently = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")
    
    # 4. Создаем индексы для производительности
    print("Создаем индексы...")
    
    # Индексы для work_type
    op.create_index('idx_bookings_work_type', 'bookings', ['work_type'])
    op.create_index('idx_services_work_type', 'services', ['work_type'])
    op.create_index('idx_client_restrictions_work_type', 'client_restrictions', ['work_type'])
    op.create_index('idx_incomes_work_type', 'incomes', ['work_type'])
    op.create_index('idx_expenses_work_type', 'expenses', ['work_type'])
    op.create_index('idx_expense_types_work_type', 'expense_types', ['work_type'])
    op.create_index('idx_expense_templates_work_type', 'expense_templates', ['work_type'])
    op.create_index('idx_missed_revenues_work_type', 'missed_revenues', ['work_type'])
    
    print("Миграция завершена успешно!")


def downgrade():
    """Откат миграции"""
    
    # Удаляем индексы
    op.drop_index('idx_missed_revenues_work_type', table_name='missed_revenues')
    op.drop_index('idx_expense_templates_work_type', table_name='expense_templates')
    op.drop_index('idx_expense_types_work_type', table_name='expense_types')
    op.drop_index('idx_expenses_work_type', table_name='expenses')
    op.drop_index('idx_incomes_work_type', table_name='incomes')
    op.drop_index('idx_client_restrictions_work_type', table_name='client_restrictions')
    op.drop_index('idx_services_work_type', table_name='services')
    op.drop_index('idx_bookings_work_type', table_name='bookings')
    
    # Удаляем поля work_type
    op.drop_column('indie_master_schedules', 'indie_work_id')
    op.drop_column('indie_master_schedules', 'master_id')
    op.drop_column('indie_master_schedules', 'work_type')
    
    op.drop_column('missed_revenues', 'indie_work_id')
    op.drop_column('missed_revenues', 'salon_work_id')
    op.drop_column('missed_revenues', 'master_id')
    op.drop_column('missed_revenues', 'work_type')
    
    op.drop_column('expense_templates', 'indie_work_id')
    op.drop_column('expense_templates', 'salon_work_id')
    op.drop_column('expense_templates', 'master_id')
    op.drop_column('expense_templates', 'work_type')
    
    op.drop_column('expense_types', 'indie_work_id')
    op.drop_column('expense_types', 'salon_work_id')
    op.drop_column('expense_types', 'master_id')
    op.drop_column('expense_types', 'work_type')
    
    op.drop_column('expenses', 'indie_work_id')
    op.drop_column('expenses', 'salon_work_id')
    op.drop_column('expenses', 'master_id')
    op.drop_column('expenses', 'work_type')
    
    op.drop_column('incomes', 'indie_work_id')
    op.drop_column('incomes', 'salon_work_id')
    op.drop_column('incomes', 'master_id')
    op.drop_column('incomes', 'work_type')
    
    op.drop_column('client_restrictions', 'indie_work_id')
    op.drop_column('client_restrictions', 'salon_work_id')
    op.drop_column('client_restrictions', 'master_id')
    op.drop_column('client_restrictions', 'work_type')
    
    op.drop_column('services', 'indie_work_id')
    op.drop_column('services', 'salon_work_id')
    op.drop_column('services', 'master_id')
    op.drop_column('services', 'work_type')
    
    op.drop_column('bookings', 'indie_work_id')
    op.drop_column('bookings', 'salon_work_id')
    op.drop_column('bookings', 'work_type')
    
    # Удаляем поля из salon_masters
    op.drop_column('salon_masters', 'updated_at')
    op.drop_column('salon_masters', 'created_at')
    op.drop_column('salon_masters', 'is_active')
    op.drop_column('salon_masters', 'branch_id')
    op.drop_column('salon_masters', 'can_work_in_salon')
    
    # Удаляем поля из indie_masters
    op.drop_column('indie_masters', 'updated_at')
    op.drop_column('indie_masters', 'created_at')
    op.drop_column('indie_masters', 'is_active')
    op.drop_column('indie_masters', 'can_work_independently')


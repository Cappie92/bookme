"""Final unified master structure update

Revision ID: 20250127_final_unified_master_update
Revises: 20250127_simple_unified_master_update
Create Date: 2025-01-27 12:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250127_final_unified_master_update'
down_revision = '20250127_simple_unified_master_update'
branch_labels = None
depends_on = None


def upgrade():
    """Финальное обновление для унифицированной структуры мастеров"""
    
    # 1. Добавляем недостающие поля в indie_masters
    print("Обновляем таблицу indie_masters...")
    
    # Добавляем поля в indie_masters
    op.add_column('indie_masters', sa.Column('can_work_independently', sa.Boolean(), nullable=True, default=True))
    op.add_column('indie_masters', sa.Column('is_active', sa.Boolean(), nullable=True, default=True))
    op.add_column('indie_masters', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
    
    # Заполняем значения по умолчанию
    op.execute("UPDATE indie_masters SET can_work_independently = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")
    
    # 2. Добавляем поля work_type в основные таблицы (если их еще нет)
    print("Добавляем поля work_type в основные таблицы...")
    
    # Проверяем и добавляем work_type в bookings
    try:
        op.add_column('bookings', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('bookings', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('bookings', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в bookings")
    
    # Проверяем и добавляем work_type в services
    try:
        op.add_column('services', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('services', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('services', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('services', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в services")
    
    # Проверяем и добавляем work_type в client_restrictions
    try:
        op.add_column('client_restrictions', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('client_restrictions', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('client_restrictions', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('client_restrictions', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в client_restrictions")
    
    # Проверяем и добавляем work_type в incomes
    try:
        op.add_column('incomes', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('incomes', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('incomes', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('incomes', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в incomes")
    
    # Проверяем и добавляем work_type в expenses
    try:
        op.add_column('expenses', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('expenses', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('expenses', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('expenses', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в expenses")
    
    # Проверяем и добавляем work_type в expense_types
    try:
        op.add_column('expense_types', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('expense_types', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('expense_types', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('expense_types', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в expense_types")
    
    # Проверяем и добавляем work_type в expense_templates
    try:
        op.add_column('expense_templates', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('expense_templates', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('expense_templates', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('expense_templates', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в expense_templates")
    
    # Проверяем и добавляем work_type в missed_revenues
    try:
        op.add_column('missed_revenues', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('missed_revenues', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('missed_revenues', sa.Column('salon_work_id', sa.Integer(), nullable=True))
        op.add_column('missed_revenues', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в missed_revenues")
    
    # Проверяем и добавляем work_type в indie_master_schedules
    try:
        op.add_column('indie_master_schedules', sa.Column('work_type', sa.String(), nullable=True))
        op.add_column('indie_master_schedules', sa.Column('master_id', sa.Integer(), nullable=True))
        op.add_column('indie_master_schedules', sa.Column('indie_work_id', sa.Integer(), nullable=True))
    except:
        print("Поля work_type уже существуют в indie_master_schedules")
    
    # 3. Создаем индексы для производительности
    print("Создаем индексы...")
    
    # Индексы для work_type
    try:
        op.create_index('idx_bookings_work_type', 'bookings', ['work_type'])
    except:
        print("Индекс idx_bookings_work_type уже существует")
    
    try:
        op.create_index('idx_services_work_type', 'services', ['work_type'])
    except:
        print("Индекс idx_services_work_type уже существует")
    
    try:
        op.create_index('idx_client_restrictions_work_type', 'client_restrictions', ['work_type'])
    except:
        print("Индекс idx_client_restrictions_work_type уже существует")
    
    try:
        op.create_index('idx_incomes_work_type', 'incomes', ['work_type'])
    except:
        print("Индекс idx_incomes_work_type уже существует")
    
    try:
        op.create_index('idx_expenses_work_type', 'expenses', ['work_type'])
    except:
        print("Индекс idx_expenses_work_type уже существует")
    
    try:
        op.create_index('idx_expense_types_work_type', 'expense_types', ['work_type'])
    except:
        print("Индекс idx_expense_types_work_type уже существует")
    
    try:
        op.create_index('idx_expense_templates_work_type', 'expense_templates', ['work_type'])
    except:
        print("Индекс idx_expense_templates_work_type уже существует")
    
    try:
        op.create_index('idx_missed_revenues_work_type', 'missed_revenues', ['work_type'])
    except:
        print("Индекс idx_missed_revenues_work_type уже существует")
    
    print("Миграция завершена успешно!")


def downgrade():
    """Откат миграции"""
    
    # Удаляем индексы
    try:
        op.drop_index('idx_missed_revenues_work_type', table_name='missed_revenues')
    except:
        pass
    
    try:
        op.drop_index('idx_expense_templates_work_type', table_name='expense_templates')
    except:
        pass
    
    try:
        op.drop_index('idx_expense_types_work_type', table_name='expense_types')
    except:
        pass
    
    try:
        op.drop_index('idx_expenses_work_type', table_name='expenses')
    except:
        pass
    
    try:
        op.drop_index('idx_incomes_work_type', table_name='incomes')
    except:
        pass
    
    try:
        op.drop_index('idx_client_restrictions_work_type', table_name='client_restrictions')
    except:
        pass
    
    try:
        op.drop_index('idx_services_work_type', table_name='services')
    except:
        pass
    
    try:
        op.drop_index('idx_bookings_work_type', table_name='bookings')
    except:
        pass
    
    # Удаляем поля work_type
    try:
        op.drop_column('indie_master_schedules', 'indie_work_id')
        op.drop_column('indie_master_schedules', 'master_id')
        op.drop_column('indie_master_schedules', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('missed_revenues', 'indie_work_id')
        op.drop_column('missed_revenues', 'salon_work_id')
        op.drop_column('missed_revenues', 'master_id')
        op.drop_column('missed_revenues', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('expense_templates', 'indie_work_id')
        op.drop_column('expense_templates', 'salon_work_id')
        op.drop_column('expense_templates', 'master_id')
        op.drop_column('expense_templates', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('expense_types', 'indie_work_id')
        op.drop_column('expense_types', 'salon_work_id')
        op.drop_column('expense_types', 'master_id')
        op.drop_column('expense_types', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('expenses', 'indie_work_id')
        op.drop_column('expenses', 'salon_work_id')
        op.drop_column('expenses', 'master_id')
        op.drop_column('expenses', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('incomes', 'indie_work_id')
        op.drop_column('incomes', 'salon_work_id')
        op.drop_column('incomes', 'master_id')
        op.drop_column('incomes', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('client_restrictions', 'indie_work_id')
        op.drop_column('client_restrictions', 'salon_work_id')
        op.drop_column('client_restrictions', 'master_id')
        op.drop_column('client_restrictions', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('services', 'indie_work_id')
        op.drop_column('services', 'salon_work_id')
        op.drop_column('services', 'master_id')
        op.drop_column('services', 'work_type')
    except:
        pass
    
    try:
        op.drop_column('bookings', 'indie_work_id')
        op.drop_column('bookings', 'salon_work_id')
        op.drop_column('bookings', 'work_type')
    except:
        pass
    
    # Удаляем поля из indie_masters
    try:
        op.drop_column('indie_masters', 'updated_at')
        op.drop_column('indie_masters', 'created_at')
        op.drop_column('indie_masters', 'is_active')
        op.drop_column('indie_masters', 'can_work_independently')
    except:
        pass


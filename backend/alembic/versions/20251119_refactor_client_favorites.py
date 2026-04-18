"""refactor client favorites table

Revision ID: refactor_client_favorites
Revises: 
Create Date: 2025-11-19 02:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


# revision identifiers, used by Alembic.
revision = '20251119_refactor_client_favorites'
down_revision = '62bed6fe1c6d'  # Последняя миграция
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Проверяем существование таблицы
    if 'client_favorites' not in inspector.get_table_names():
        print("⚠️ Таблица client_favorites не найдена, пропускаем миграцию")
        return
    
    # Получаем список колонок
    columns = [col['name'] for col in inspector.get_columns('client_favorites')]
    
    # Переименовываем колонку id в client_favorite_id только если она существует
    if 'id' in columns and 'client_favorite_id' not in columns:
        print("  Переименовываем колонку id в client_favorite_id...")
        # SQLite не поддерживает ALTER TABLE RENAME COLUMN напрямую через op.alter_column
        # Используем raw SQL
        conn.execute(text("ALTER TABLE client_favorites RENAME COLUMN id TO client_favorite_id"))
        print("  ✅ Колонка переименована")
    elif 'client_favorite_id' in columns:
        print("  ⏭️  Колонка уже переименована, пропускаем")
    else:
        print("  ⚠️  Колонка id не найдена")
    
    # Удаляем лишние колонки только если они существуют
    columns_to_drop = ['favorite_description', 'favorite_image', 'created_at']
    for col_name in columns_to_drop:
        if col_name in columns:
            print(f"  Удаляем колонку {col_name}...")
            op.drop_column('client_favorites', col_name)
            print(f"  ✅ Колонка {col_name} удалена")
        else:
            print(f"  ⏭️  Колонка {col_name} не найдена, пропускаем")


def downgrade():
    # Возвращаем лишние колонки
    op.add_column('client_favorites', sa.Column('created_at', sa.DateTime(), nullable=True))
    op.add_column('client_favorites', sa.Column('favorite_image', sa.String(), nullable=True))
    op.add_column('client_favorites', sa.Column('favorite_description', sa.Text(), nullable=True))
    
    # Возвращаем старое имя колонки
    op.alter_column('client_favorites', 'client_favorite_id', new_column_name='id', existing_type=sa.Integer(), existing_nullable=False, existing_server_default=None)


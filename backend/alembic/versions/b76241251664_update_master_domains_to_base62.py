"""update_master_domains_to_base62

Revision ID: b76241251664
Revises: 20251119_refactor_client_favorites
Create Date: 2025-11-24 23:29:33.552208

"""
from typing import Sequence, Union
import random
import string

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'b76241251664'
down_revision: Union[str, None] = '20251119_refactor_client_favorites'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Base62 алфавит: 0-9, a-z, A-Z
BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase


def generate_base62_id(length: int = 8) -> str:
    """Генерирует случайный Base62 ID заданной длины."""
    return ''.join(random.choice(BASE62_ALPHABET) for _ in range(length))


def generate_unique_domain(master_id: int, connection, existing_domains: set, max_attempts: int = 10) -> str:
    """Генерирует уникальный domain в формате m-{base62_id}."""
    for attempt in range(max_attempts):
        base62_id = generate_base62_id(length=8)
        domain = f"m-{base62_id}"
        
        if domain not in existing_domains:
            # Проверяем в БД
            result = connection.execute(
                text("SELECT COUNT(*) FROM masters WHERE domain = :domain"),
                {"domain": domain}
            )
            if result.scalar() == 0:
                existing_domains.add(domain)
                return domain
    
    # Если не удалось сгенерировать, увеличиваем длину
    for attempt in range(max_attempts):
        base62_id = generate_base62_id(length=10)
        domain = f"m-{base62_id}"
        
        if domain not in existing_domains:
            result = connection.execute(
                text("SELECT COUNT(*) FROM masters WHERE domain = :domain"),
                {"domain": domain}
            )
            if result.scalar() == 0:
                existing_domains.add(domain)
                return domain
    
    # В крайнем случае используем ID мастера (fallback)
    return f"m-{master_id}"


def upgrade() -> None:
    """Обновляет domain для всех мастеров с can_work_independently=True."""
    connection = op.get_bind()
    
    # Получаем всех мастеров с can_work_independently=True
    result = connection.execute(
        text("""
            SELECT id, domain 
            FROM masters 
            WHERE can_work_independently = 1
        """)
    )
    
    masters = result.fetchall()
    existing_domains = set()
    
    # Собираем все существующие domain
    all_domains_result = connection.execute(
        text("SELECT domain FROM masters WHERE domain IS NOT NULL AND domain != ''")
    )
    for row in all_domains_result:
        if row[0]:
            existing_domains.add(row[0])
    
    # Обновляем domain для мастеров, у которых его нет или он в старом формате master-{id}
    for master_id, current_domain in masters:
        needs_update = False
        
        if not current_domain or current_domain == '':
            needs_update = True
        elif current_domain.startswith('master-'):
            # Старый формат, нужно обновить
            needs_update = True
        
        if needs_update:
            new_domain = generate_unique_domain(master_id, connection, existing_domains)
            connection.execute(
                text("UPDATE masters SET domain = :domain WHERE id = :id"),
                {"domain": new_domain, "id": master_id}
            )
            print(f"Обновлен domain для мастера {master_id}: {new_domain}")


def downgrade() -> None:
    """Откат миграции - восстанавливаем старый формат master-{id} для тех, у кого был m-{base62}."""
    connection = op.get_bind()
    
    # Получаем всех мастеров с domain в формате m-{base62}
    result = connection.execute(
        text("""
            SELECT id, domain 
            FROM masters 
            WHERE domain LIKE 'm-%' AND domain NOT LIKE 'master-%'
        """)
    )
    
    masters = result.fetchall()
    
    # Восстанавливаем старый формат master-{id}
    for master_id, current_domain in masters:
        old_domain = f"master-{master_id}"
        connection.execute(
            text("UPDATE masters SET domain = :domain WHERE id = :id"),
            {"domain": old_domain, "id": master_id}
        )
        print(f"Восстановлен старый domain для мастера {master_id}: {old_domain}")

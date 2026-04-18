"""
Утилиты для генерации Base62 ID для доменов мастеров.
Base62 использует символы: 0-9, a-z, A-Z (62 символа)
"""
import random
import string
from sqlalchemy.orm import Session
from models import Master


# Base62 алфавит: 0-9, a-z, A-Z
BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase


def generate_base62_id(length: int = 8) -> str:
    """
    Генерирует случайный Base62 ID заданной длины.
    
    Args:
        length: Длина ID (по умолчанию 8 символов)
    
    Returns:
        Случайная строка Base62
    """
    return ''.join(random.choice(BASE62_ALPHABET) for _ in range(length))


def is_domain_unique(domain: str, db: Session, exclude_master_id: int = None) -> bool:
    """
    Проверяет уникальность domain в таблице masters.
    
    Args:
        domain: Проверяемый domain
        db: Сессия базы данных
        exclude_master_id: ID мастера, который нужно исключить из проверки (для обновления)
    
    Returns:
        True если domain уникален, False если уже существует
    """
    query = db.query(Master).filter(Master.domain == domain)
    
    # Исключаем текущего мастера при обновлении
    if exclude_master_id is not None:
        query = query.filter(Master.id != exclude_master_id)
    
    existing = query.first()
    return existing is None


def generate_unique_domain(master_id: int, db: Session, max_attempts: int = 10) -> str:
    """
    Генерирует уникальный domain в формате m-{base62_id}.
    
    Args:
        master_id: ID мастера (для исключения из проверки при обновлении)
        db: Сессия базы данных
        max_attempts: Максимальное количество попыток генерации уникального ID
    
    Returns:
        Уникальный domain в формате m-{base62_id}
    """
    for attempt in range(max_attempts):
        base62_id = generate_base62_id(length=8)
        domain = f"m-{base62_id}"
        
        if is_domain_unique(domain, db, exclude_master_id=master_id):
            return domain
    
    # Если не удалось сгенерировать за max_attempts попыток, увеличиваем длину
    # Это крайне маловероятно, но на всякий случай
    for attempt in range(max_attempts):
        base62_id = generate_base62_id(length=10)
        domain = f"m-{base62_id}"
        
        if is_domain_unique(domain, db, exclude_master_id=master_id):
            return domain
    
    # В крайнем случае используем ID мастера (fallback)
    return f"m-{master_id}"


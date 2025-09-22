import os
import random
from datetime import datetime, timedelta
from typing import Optional

import redis
from dotenv import load_dotenv

load_dotenv()

# Подключение к Redis
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
    decode_responses=True,
)


def generate_sms_code() -> str:
    """Генерация 6-значного кода подтверждения"""
    return str(random.randint(100000, 999999))


def save_sms_code(email: str, code: str, expires_in: int = 300) -> None:
    """Сохранение кода в Redis с временем жизни"""
    key = f"sms_code:{email}"
    redis_client.setex(key, expires_in, code)


def verify_sms_code(email: str, code: str) -> bool:
    """Проверка кода подтверждения"""
    key = f"sms_code:{email}"
    saved_code = redis_client.get(key)
    if saved_code and saved_code == code:
        redis_client.delete(key)
        return True
    return False


def send_sms_code(phone: str, code: str) -> bool:
    """
    Отправка SMS с кодом подтверждения.
    В реальном приложении здесь будет интеграция с SMS-сервисом.
    """
    # TODO: Добавить реальную отправку SMS
    print(f"Sending SMS to {phone} with code: {code}")
    return True

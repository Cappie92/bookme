"""
Канонический формат телефона: +7 + 10 цифр = 12 символов.
Соответствует: zvonok_service, AuthModal, mobile login.
"""
from __future__ import annotations

import re
from typing import Optional

# Канонический формат: +7 и ровно 10 цифр
CANONICAL_PHONE_PATTERN = re.compile(r"^\+7\d{10}$")


def is_canonical_phone(phone: str) -> bool:
    """Проверяет, что телефон в каноническом формате +7XXXXXXXXXX."""
    return bool(phone and CANONICAL_PHONE_PATTERN.match(phone))


def normalize_to_canonical(phone: str) -> Optional[str]:
    """
    Приводит телефон к каноническому формату +7XXXXXXXXXX.
    Возвращает None, если номер не удаётся нормализовать.
    """
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if digits.startswith("7") and len(digits) == 11:
        return "+" + digits
    if len(digits) == 10 and not digits.startswith("7"):
        return "+7" + digits
    return None


def ensure_canonical(phone: str) -> str:
    """
    Возвращает канонический формат или поднимает ValueError.
    Используется в reseed для sanity-check.
    """
    if is_canonical_phone(phone):
        return phone
    normalized = normalize_to_canonical(phone)
    if normalized:
        return normalized
    raise ValueError(f"Phone {phone!r} is not in canonical format +7XXXXXXXXXX")

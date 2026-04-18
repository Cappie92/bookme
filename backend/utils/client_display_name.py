"""
Утилита для единообразного отображения имени клиента.
Приоритет: master-specific alias → full_name → phone → fallback.
"""
import re
from typing import Optional, Any, Dict


def _normalize_phone_digits(phone: Optional[str]) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))


def get_meta_for_client(meta_map: Dict[str, Any], client_phone: Optional[str]) -> Optional[Any]:
    """
    Ищет metadata по client_phone. Пробует точное совпадение и по цифрам
    (на случай разного формата: +7999 vs 7999).
    """
    if not client_phone:
        return None
    m = meta_map.get(client_phone)
    if m:
        return m
    digits = _normalize_phone_digits(client_phone)
    if not digits:
        return None
    for k, v in meta_map.items():
        if _normalize_phone_digits(k) == digits:
            return v
    return None


def get_client_display_name(
    meta: Optional[Any],
    client: Optional[Any],
    fallback: str = "Клиент",
) -> str:
    """
    Возвращает отображаемое имя клиента по приоритету:
    1) alias_name из MasterClientMetadata (если задан мастером)
    2) full_name из User
    3) phone из User
    4) fallback (по умолчанию "Клиент")
    """
    alias = (meta.alias_name if meta and meta.alias_name else None) or None
    if alias and str(alias).strip():
        return str(alias).strip()

    if client:
        if client.full_name and str(client.full_name).strip():
            return str(client.full_name).strip()
        if getattr(client, "phone", None) and str(client.phone or "").strip():
            return str(client.phone).strip()

    return fallback


def strip_indie_service_prefix(name: Optional[str]) -> str:
    """
    Убирает префикс "Инди: " или "Инди:" из названия услуги.
    Возвращает чистый service_name для отображения.
    """
    if not name or not isinstance(name, str):
        return name or ""
    s = name.strip()
    if s.startswith("Инди:"):
        s = s[5:].strip()
    return s

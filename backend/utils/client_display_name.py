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


def guest_manual_metadata(booking: Any, metadata_by_id: Dict[int, Any]) -> Optional[Any]:
    """Metadata for a guest manual booking, matched by id and the same master."""

    if getattr(booking, "source", None) != "manual" or getattr(booking, "client_id", None) is not None:
        return None
    meta_id = getattr(booking, "master_client_metadata_id", None)
    if meta_id is None:
        return None
    meta = metadata_by_id.get(meta_id)
    if meta is None or getattr(meta, "master_id", None) != getattr(booking, "master_id", None):
        return None
    return meta


def resolve_booking_client_contact(
    booking: Any,
    client: Optional[Any],
    meta_by_phone: Dict[str, Any],
    meta_by_id: Dict[int, Any],
) -> tuple[Optional[str], Optional[Any]]:
    """Phone shown to the current master.

    A guest manual booking reads the phone from its own metadata row.
    Every other booking keeps the account phone and the phone-keyed alias lookup.
    """

    if getattr(booking, "source", None) == "manual" and getattr(booking, "client_id", None) is None:
        meta = guest_manual_metadata(booking, meta_by_id)
        phone = str(meta.client_phone).strip() if meta is not None and getattr(meta, "client_phone", None) else ""
        return (phone or None), meta
    phone = client.phone if client and getattr(client, "phone", None) else None
    return phone, get_meta_for_client(meta_by_phone, phone)


def booking_visible_client_name(booking: Any, meta: Optional[Any], client: Optional[Any], fallback: str = "Клиент") -> str:
    """Manual bookings keep their own guest label and never borrow another client's alias."""

    if client is None:
        guest = getattr(booking, "guest_name", None)
        if isinstance(guest, str) and guest.strip():
            return guest.strip()
    return get_client_display_name(meta, client, fallback)


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

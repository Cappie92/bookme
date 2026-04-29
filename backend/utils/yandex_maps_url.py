"""
Единая сборка ссылок на Яндекс.Карты (тот же принцип, что и в public master profile).
"""
from __future__ import annotations

import html
from typing import Any, Optional
from urllib.parse import quote_plus


def build_yandex_maps_url(*, city: Optional[str], address: Optional[str]) -> Optional[str]:
    """Ссылка `https://yandex.ru/maps/?text=...` из города и/или адреса. Без дублирования логики."""
    parts: list[str] = []
    if city and str(city).strip():
        parts.append(str(city).strip())
    if address and str(address).strip():
        parts.append(str(address).strip())
    if not parts:
        return None
    query = quote_plus(", ".join(parts))
    return f"https://yandex.ru/maps/?text={query}"


def booking_calendar_location_string(booking: Any) -> str:
    """Одна строка адреса для Google Calendar `location` и поля LOCATION в .ics (как раньше в client.py)."""
    if booking.branch and booking.branch.address:
        return (booking.branch.address or "").strip()
    if booking.branch and booking.branch.name:
        return (booking.branch.name or "").strip()
    if booking.master and getattr(booking.master, "address", None):
        return (booking.master.address or "").strip()
    return ""


def _city_and_address_for_yandex_text(booking: Any) -> tuple[Optional[str], Optional[str]]:
    city, addr = None, None
    if booking.branch:
        br = booking.branch
        a = getattr(br, "address", None)
        if a and str(a).strip():
            addr = str(a).strip()
        sal = getattr(br, "salon", None)
        if sal is not None:
            c = getattr(sal, "city", None)
            if c and str(c).strip():
                city = str(c).strip()
    if booking.master:
        m = booking.master
        if not city:
            c = getattr(m, "city", None)
            if c and str(c).strip():
                city = str(c).strip()
        if not addr:
            a = getattr(m, "address", None)
            if a and str(a).strip():
                addr = str(a).strip()
    if booking.indie_master:
        im = booking.indie_master
        if not city:
            c = getattr(im, "city", None)
            if c and str(c).strip():
                city = str(c).strip()
        if not addr:
            a = getattr(im, "address", None)
            if a and str(a).strip():
                addr = str(a).strip()
    return city, addr


def yandex_maps_url_for_booking(booking: Any) -> Optional[str]:
    city, address = _city_and_address_for_yandex_text(booking)
    return build_yandex_maps_url(city=city, address=address)


def yandex_link_html_for_email(maps_url: Optional[str]) -> str:
    """Короткий HTML-блок с явной ссылкой для письма (пустая строка, если URL нет)."""
    if not maps_url:
        return ""
    safe = html.escape(maps_url, quote=True)
    return (
        f'<p>Карта: <a href="{safe}">Открыть на Яндекс.Картах</a></p>'
    )

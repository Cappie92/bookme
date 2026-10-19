"""iOS Free Companion projection.

Native iOS is `client_surface=ios_fixed` only. An `ios_app` web session stays on
the ordinary web contract; commerce isolation keeps its own origin check.

Spoofing `ios_fixed` only tightens feature projections. It does not grant paid
features and does not change the ordinary booking-count capacity.
"""

from __future__ import annotations

from typing import Any, Mapping

from fastapi.responses import JSONResponse

IOS_FREE_SURFACE = "ios_fixed"
IOS_APP_ORIGIN = "ios_app"

_BLOCKED_BOOKING_KEYS = frozenset(
    {
        "client_note",
        "has_client_note",
        "client_master_alias",
        "alias_name",
        "applied_discount",
        "loyalty_points_used",
        "master_client_name",
    }
)

# `domain` is the canonical public slug (`/m/{domain}`), not a paid hostname.
_SETTINGS_USER_KEYS = frozenset({"id", "email", "phone", "full_name", "birth_date"})
_SETTINGS_MASTER_KEYS = frozenset(
    {
        "id",
        "bio",
        "experience_years",
        "can_work_independently",
        "can_work_in_salon",
        "auto_confirm_bookings",
        "pre_visit_confirmations_effective",
        "domain",
        "logo",
        "photo",
        "use_photo_as_logo",
        "address",
        "address_detail",
        "city",
        "timezone",
        "site_description",
    }
)

_LOYALTY_PREVIEW_KEYS = frozenset(
    {
        "rule_name",
        "condition_type",
        "rule_id",
        "rule_type",
        "use_loyalty_points",
        "points_payment_available",
        "available_points",
        "max_payment_percent",
        "loyalty_points_to_use",
        "loyalty_program_enabled",
        "loyalty_points_used",
    }
)
_LOYALTY_ELIGIBILITY_KEYS = frozenset(
    {
        "points",
        "loyalty_hint",
        "points_payment_available",
        "loyalty_program_enabled",
    }
)


def is_ios_free_surface(client_surface: str | None = None, user: Any = None) -> bool:
    """Native projection. The user argument is not a projection switch."""
    del user
    return client_surface == IOS_FREE_SURFACE


def is_ios_originated_web_session(user: Any = None) -> bool:
    """Web handoff session. Commerce isolation only; not a free-data projection."""
    origin = getattr(user, "web_session_origin", None) if user is not None else None
    return origin == IOS_APP_ORIGIN


def remember_restrictive_surface(payload: dict, client_surface: str | None) -> dict:
    """Store the originating native marker as a narrowing context, not a privilege."""
    if client_surface == IOS_FREE_SURFACE:
        payload["restrictive_surface"] = IOS_FREE_SURFACE
    return payload


def effective_booking_surface(
    client_surface: str | None, pending: Mapping[str, Any] | None = None
) -> str | None:
    stored = (pending or {}).get("restrictive_surface")
    if stored == IOS_FREE_SURFACE or client_surface == IOS_FREE_SURFACE:
        return IOS_FREE_SURFACE
    return client_surface


def ios_booking_blocked_detail() -> dict[str, str]:
    return {
        "code": "booking_blocked",
        "message": "Запись к этому мастеру сейчас недоступна",
    }


def free_client_display_name(row: Mapping[str, Any]) -> str:
    """Account name or phone. Never a paid CRM alias, even if it was already copied into display name."""
    account = row.get("client_account_name")
    if isinstance(account, str):
        cleaned = account.strip()
        if cleaned and cleaned.lower() != "клиент":
            return cleaned
    phone = row.get("client_phone")
    if isinstance(phone, str) and phone.strip():
        return phone.strip()
    return "Клиент"


def project_ios_booking(row: Mapping[str, Any]) -> dict[str, Any]:
    projected = {key: value for key, value in row.items() if key not in _BLOCKED_BOOKING_KEYS}
    name = free_client_display_name(row)
    if "client_display_name" in row or "client_name" in row:
        projected["client_display_name"] = name
        projected["client_name"] = name
    return projected


def model_json_without(model: Any, keys: frozenset[str]) -> JSONResponse:
    payload = model.model_dump(mode="json")
    for key in keys:
        payload.pop(key, None)
    return JSONResponse(content=payload)


def omit_schedule_freeze(response: Any) -> JSONResponse:
    payload = response.model_dump(mode="json")
    for slot in payload.get("slots") or []:
        if isinstance(slot, dict):
            slot.pop("is_frozen", None)
    return JSONResponse(content=payload)


def project_ios_settings(payload: Mapping[str, Any]) -> dict[str, Any]:
    user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
    master = payload.get("master") if isinstance(payload.get("master"), dict) else {}
    return {
        "user": {key: user[key] for key in _SETTINGS_USER_KEYS if key in user},
        "master": {key: master[key] for key in _SETTINGS_MASTER_KEYS if key in master},
    }


def ios_price_preview_json(preview: Any) -> JSONResponse:
    return model_json_without(preview, _LOYALTY_PREVIEW_KEYS)


def ios_booking_detail_json(booking_model: Any) -> JSONResponse:
    payload = booking_model.model_dump(mode="json")
    payload.pop("applied_discount", None)
    payload.pop("loyalty_points_used", None)
    return JSONResponse(content=payload)


def ios_eligibility_json(result: Any) -> JSONResponse:
    return model_json_without(result, _LOYALTY_ELIGIBILITY_KEYS)


def ios_public_profile_json(profile: Any) -> JSONResponse:
    return model_json_without(profile, frozenset({"loyalty_visual"}))

import base64
import hashlib
import hmac
import json
import secrets
from datetime import date, datetime, timedelta
from typing import Any, List, Optional, Union
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    PASSWORD_RESET_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES,
    SECRET_KEY,
    SIGNUP_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES,
    create_password_reset_phone_verification_token,
    create_signup_phone_verification_token,
    decode_signup_phone_verification_token,
    decode_password_reset_phone_verification_token,
    get_current_active_user,
    get_password_hash,
    issue_tokens_for_user,
    normal_session_extra_claims,
    refresh_token_type_matches,
    resolve_user_from_token_sub,
    session_version_matches,
    signup_phone_verification_version_matches,
    update_password_and_revoke_sessions,
    verify_password,
)
from database import get_db
from models import User, Master, Booking, UserRole, EmailVerification, PasswordReset, UserOAuthAccount
from schemas import (
    ChangePasswordRequest,
    ConfirmSignupPhoneVerificationRequest,
    LoginRequest,
    MessageOut,
    PhoneVerificationRequiredResponse,
    SetPasswordRequest,
    Token,
)
from schemas import User as UserSchema
from schemas import UserCreate, VerifyRequest
from services.verification_service import PhoneChallengeError, VerificationService
from services.zvonok_service import zvonok_service
from services.demo_master_seed import ensure_demo_master_exists
from services.promo_engine import (
    PromoEngineError,
    create_pending_redemption,
    validate_promo_code_for_registration,
)
from services.pending_ticket_service import (
    claim_pending_ticket,
    delete_pending_ticket,
    get_pending_ticket,
    pending_ticket_memory_store,
    save_pending_ticket,
    store_pending_ticket,
)
from settings import get_settings
from sms import verify_sms_code
from schemas import (
    EmailVerificationRequest, EmailVerificationResponse,
    PasswordResetRequest, PasswordResetResponse,
    RequestPasswordResetPhoneRequest, RequestPasswordResetPhoneResponse,
    ConfirmPasswordResetPhoneRequest, ConfirmPasswordResetPhoneResponse,
    VerifyEmailRequest, VerifyEmailResponse,
    ResetPasswordRequest, ResetPasswordResponse, ResetPasswordByPhoneRequest,
    ResendVerificationRequest, ResendVerificationResponse,
    PhoneVerificationRequest, PhoneVerificationResponse,
    VerifyPhoneRequest, VerifyPhoneResponse
    , RequestPhoneChangeRequest, RequestPhoneChangeResponse,
    ConfirmPhoneChangeRequest, ConfirmPhoneChangeResponse,
    RequestEmailChangeRequest, RequestEmailChangeResponse,
    ConfirmEmailChangeRequest, ConfirmEmailChangeResponse
)
from utils.phone import normalize_to_canonical
from utils.cities import get_timezone_by_city


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    responses={401: {"description": "Unauthorized"}},
)

YANDEX_PROVIDER = "yandex"
YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_PROFILE_URL = "https://login.yandex.ru/info"
OAUTH_STATE_TTL_SECONDS = 10 * 60
OAUTH_TICKET_TTL_SECONDS = 120
OAUTH_ONBOARDING_TICKET_TTL_SECONDS = 10 * 60
_oauth_ticket_memory_store: dict[str, dict] = {}
REGISTRATION_TICKET_TTL_SECONDS = 15 * 60
REGISTRATION_TICKET_PURPOSE = "signup_registration"
LEGACY_ACCOUNT_VERIFICATION_PURPOSE = "legacy_existing_account"
_registration_ticket_memory_store = pending_ticket_memory_store
registration_verification_bearer = HTTPBearer()

WEB_HANDOFF_TTL_SECONDS = 60
WEB_SESSION_ORIGIN_IOS_APP = "ios_app"
WEB_SESSION_ORIGIN_ANDROID_APP = "android_app"
WEB_HANDOFF_ALLOWED_ORIGINS = {WEB_SESSION_ORIGIN_IOS_APP, WEB_SESSION_ORIGIN_ANDROID_APP}
WEB_HANDOFF_IOS_DESTINATIONS = {
    "schedule": "/master?tab=schedule",
    "services": "/master?tab=services",
    "settings": "/master?tab=settings&section=public-page",
}
PASSWORD_RESET_TOKEN_TTL_MINUTES = 15
PASSWORD_RESET_GENERIC_MESSAGE = (
    "Если аккаунт с таким номером существует, звонок для восстановления будет отправлен."
)
PASSWORD_RESET_CONFIRM_ERROR = "Неверные или истекшие данные подтверждения"
WEB_HANDOFF_REDIRECT_TO = "/pricing"
_web_handoff_memory_store: dict[str, dict] = {}


class OAuthExchangeRequest(BaseModel):
    ticket: str


class OAuthOnboardingPhoneRequest(BaseModel):
    ticket: str
    phone: str


class OAuthOnboardingValidateRequest(BaseModel):
    ticket: str


class OAuthOnboardingCompleteRequest(BaseModel):
    ticket: str
    role: str
    phone: str
    city: Optional[str] = None
    timezone: Optional[str] = None
    phone_verification_code: str
    call_id: Optional[str] = None
    accepted_terms: bool = False
    accepted_personal_data: bool = False
    accepted_marketing: bool = False


class WebHandoffCreateRequest(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None


class WebHandoffExchangeRequest(BaseModel):
    code: str


def _oauth_enabled_or_404():
    settings = get_settings()
    if not settings.yandex_auth_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Yandex auth disabled")
    if not settings.YANDEX_CLIENT_ID or not settings.YANDEX_CLIENT_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Yandex auth is not configured")
    return settings


def _yandex_redirect_uri(settings) -> str:
    explicit = (settings.YANDEX_REDIRECT_URI or "").strip()
    if explicit:
        return explicit
    return f"{settings.API_BASE_URL.rstrip('/')}/api/auth/yandex/callback"


def _sanitize_oauth_return_to(return_to: Optional[str], fallback: str = "/client/profile") -> str:
    value = (return_to or "").strip() or fallback
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc or not value.startswith("/"):
        return fallback
    if value.startswith("//"):
        return fallback
    return value


def _default_link_return_to(user: User) -> str:
    role = user.role
    if role in (UserRole.MASTER, UserRole.INDIE):
        return "/master?tab=settings"
    if role == UserRole.ADMIN or role == UserRole.MODERATOR:
        return "/admin/settings"
    if role == UserRole.SALON:
        return "/salon"
    return "/client/profile"


def _yandex_authorize_redirect(settings, state: str) -> RedirectResponse:
    redirect_uri = _yandex_redirect_uri(settings)
    query = urlencode({
        "response_type": "code",
        "client_id": settings.YANDEX_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": "login:email login:info",
    })
    return RedirectResponse(f"{YANDEX_AUTHORIZE_URL}?{query}")


def _state_signature(payload: str) -> str:
    digest = hmac.new(SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _b64_json(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_b64_json(value: str) -> dict:
    padded = value + "=" * (-len(value) % 4)
    return json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))


def _create_oauth_state(
    mode: str = "login",
    user_id: Optional[int] = None,
    return_to: Optional[str] = None,
    source_session_version: Optional[int] = None,
) -> str:
    normalized_mode = mode if mode in {"login", "link"} else "login"
    data = {
        "provider": YANDEX_PROVIDER,
        "mode": normalized_mode,
        "nonce": secrets.token_urlsafe(16),
        "exp": int((datetime.utcnow() + timedelta(seconds=OAUTH_STATE_TTL_SECONDS)).timestamp()),
    }
    if normalized_mode == "link":
        data["user_id"] = int(user_id or 0)
        data["return_to"] = _sanitize_oauth_return_to(return_to)
        data["source_session_version"] = int(source_session_version or 0)
    payload = _b64_json({
        **data,
    })
    return f"{payload}.{_state_signature(payload)}"


def _verify_oauth_state(state: str) -> dict:
    try:
        payload, signature = (state or "").split(".", 1)
        if not hmac.compare_digest(_state_signature(payload), signature):
            raise ValueError("bad signature")
        data = _decode_b64_json(payload)
        if data.get("provider") != YANDEX_PROVIDER:
            raise ValueError("bad provider")
        if int(data.get("exp") or 0) < int(datetime.utcnow().timestamp()):
            raise ValueError("expired")
        mode = data.get("mode") or "login"
        if mode not in {"login", "link"}:
            raise ValueError("bad mode")
        data["mode"] = mode
        if mode == "link":
            if not int(data.get("user_id") or 0):
                raise ValueError("missing link user")
            if not int(data.get("source_session_version") or 0):
                raise ValueError("missing link session version")
        return data
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительная OAuth-сессия")


def _issue_tokens_for_user(
    user: User,
    web_session_origin: Optional[str] = None,
    extra_claims: Optional[dict] = None,
) -> dict:
    claims = dict(extra_claims or {})
    if web_session_origin:
        claims["web_session_origin"] = web_session_origin
    return issue_tokens_for_user(user, claims)


def _token_response_for_user(user: User) -> dict:
    tokens = _issue_tokens_for_user(user)
    tokens["user"] = {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "full_name": user.full_name,
        "is_verified": user.is_verified,
        "is_phone_verified": user.is_phone_verified,
        "phone_required": user.phone_required,
        "phone_verified": user.phone_verified,
    }
    return tokens


def _legacy_phone_verification_required_response(user: User) -> dict:
    return {
        "status": "phone_verification_required",
        "verification_token": create_signup_phone_verification_token(
            user.id,
            user.session_version,
        ),
        "phone": user.phone,
        "expires_in": SIGNUP_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES * 60,
        "verification_kind": "existing_account",
    }


def _store_registration_ticket(payload: dict) -> str:
    return store_pending_ticket(
        purpose=REGISTRATION_TICKET_PURPOSE,
        payload={"registration": payload},
        ttl_seconds=REGISTRATION_TICKET_TTL_SECONDS,
        unavailable_detail="Registration ticket storage unavailable",
    )


def _get_registration_ticket(ticket: str) -> Optional[dict]:
    return get_pending_ticket(
        ticket,
        purpose=REGISTRATION_TICKET_PURPOSE,
        unavailable_detail="Registration ticket storage unavailable",
    )


def _save_registration_ticket(ticket: str, data: dict) -> None:
    save_pending_ticket(
        ticket,
        data,
        purpose=REGISTRATION_TICKET_PURPOSE,
        unavailable_detail="Registration ticket storage unavailable",
    )


def _delete_registration_ticket(ticket: str) -> None:
    delete_pending_ticket(
        ticket,
        purpose=REGISTRATION_TICKET_PURPOSE,
        unavailable_detail="Registration ticket storage unavailable",
    )


def _claim_registration_ticket(ticket: str) -> Optional[dict]:
    return claim_pending_ticket(
        ticket,
        purpose=REGISTRATION_TICKET_PURPOSE,
        unavailable_detail="Registration ticket storage unavailable",
    )


def _registration_ticket_response(ticket: str, phone: str) -> dict:
    return {
        "status": "phone_verification_required",
        "verification_token": ticket,
        "phone": phone,
        "expires_in": REGISTRATION_TICKET_TTL_SECONDS,
        "verification_kind": "new_registration",
    }


def _oauth_error_redirect(message: str, mode: str = "login", return_to: Optional[str] = None) -> RedirectResponse:
    frontend = get_settings().FRONTEND_URL.rstrip("/")
    query_data = {"error": message}
    if mode == "link":
        query_data["mode"] = "link"
        query_data["return_to"] = _sanitize_oauth_return_to(return_to)
    query = urlencode(query_data)
    return RedirectResponse(f"{frontend}/auth/oauth/callback?{query}")


def _oauth_ticket_key(ticket: str) -> str:
    return f"oauth_ticket:{ticket}"


def _oauth_onboarding_ticket_key(ticket: str) -> str:
    return f"oauth_onboarding_ticket:{ticket}"


def _cleanup_memory_oauth_tickets() -> None:
    now = int(datetime.utcnow().timestamp())
    for key, value in list(_oauth_ticket_memory_store.items()):
        if int(value.get("exp") or 0) < now:
            _oauth_ticket_memory_store.pop(key, None)


def _store_oauth_ticket(
    user_id: int,
    purpose: str = "oauth_login",
    provider: str = YANDEX_PROVIDER,
    status_value: str = "success",
    message: Optional[str] = None,
    return_to: Optional[str] = None,
) -> str:
    ticket = secrets.token_urlsafe(32)
    payload_dict = {
        "user_id": int(user_id),
        "purpose": purpose,
        "provider": provider,
        "status": status_value,
    }
    if message:
        payload_dict["message"] = message
    if return_to:
        payload_dict["return_to"] = _sanitize_oauth_return_to(return_to)
    payload = json.dumps(payload_dict, separators=(",", ":"))
    settings = get_settings()
    try:
        from sms import redis_client
        redis_client.setex(_oauth_ticket_key(ticket), OAUTH_TICKET_TTL_SECONDS, payload)
        return ticket
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth ticket storage unavailable")
        _cleanup_memory_oauth_tickets()
        _oauth_ticket_memory_store[ticket] = {
            **payload_dict,
            "exp": int((datetime.utcnow() + timedelta(seconds=OAUTH_TICKET_TTL_SECONDS)).timestamp()),
        }
        return ticket


def _consume_oauth_ticket(ticket: str) -> dict:
    normalized = str(ticket or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный OAuth ticket")

    settings = get_settings()
    try:
        from sms import redis_client
        key = _oauth_ticket_key(normalized)
        raw = redis_client.get(key)
        if not raw:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth ticket")
        redis_client.delete(key)
        data = json.loads(raw)
        data["user_id"] = int(data["user_id"])
        data.setdefault("purpose", "oauth_login")
        data.setdefault("provider", YANDEX_PROVIDER)
        data.setdefault("status", "success")
        return data
    except HTTPException:
        raise
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth ticket storage unavailable")
        _cleanup_memory_oauth_tickets()
        data = _oauth_ticket_memory_store.pop(normalized, None)
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth ticket")
        if int(data.get("exp") or 0) < int(datetime.utcnow().timestamp()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth ticket")
        data["user_id"] = int(data["user_id"])
        data.setdefault("purpose", "oauth_login")
        data.setdefault("provider", YANDEX_PROVIDER)
        data.setdefault("status", "success")
        return data



def _web_handoff_key(code: str) -> str:
    return f"web_handoff:{code}"


def _cleanup_memory_web_handoff() -> None:
    now = int(datetime.utcnow().timestamp())
    for key, value in list(_web_handoff_memory_store.items()):
        if int(value.get("exp") or 0) < now:
            _web_handoff_memory_store.pop(key, None)


def _store_web_handoff(
    user_id: int,
    origin: str,
    source_session_version: int,
    destination: Optional[str] = None,
) -> str:
    code = secrets.token_urlsafe(32)
    payload_dict = {
        "user_id": int(user_id),
        "origin": origin,
        "purpose": "web_handoff",
        "source_session_version": int(source_session_version),
        "destination": destination,
    }
    payload = json.dumps(payload_dict, separators=(",", ":"))
    settings = get_settings()
    try:
        from sms import redis_client
        redis_client.setex(_web_handoff_key(code), WEB_HANDOFF_TTL_SECONDS, payload)
        return code
    except Exception:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Web handoff storage unavailable",
            )
        _cleanup_memory_web_handoff()
        _web_handoff_memory_store[code] = {
            **payload_dict,
            "exp": int((datetime.utcnow() + timedelta(seconds=WEB_HANDOFF_TTL_SECONDS)).timestamp()),
        }
        return code


def _consume_web_handoff(code: str) -> dict:
    normalized = str(code or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный handoff code")

    settings = get_settings()
    try:
        from sms import redis_client
        key = _web_handoff_key(normalized)
        getdel = getattr(redis_client, "getdel", None)
        if callable(getdel):
            raw = getdel(key)
        else:
            raw = redis_client.eval(
                "local v = redis.call('GET', KEYS[1]); "
                "if v then redis.call('DEL', KEYS[1]); end; return v",
                1,
                key,
            )
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недействительный или истекший handoff code",
            )
        data = json.loads(raw)
        data["user_id"] = int(data["user_id"])
        data.setdefault("purpose", "web_handoff")
        return data
    except HTTPException:
        raise
    except Exception:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Web handoff storage unavailable",
            )
        _cleanup_memory_web_handoff()
        data = _web_handoff_memory_store.pop(normalized, None)
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недействительный или истекший handoff code",
            )
        if int(data.get("exp") or 0) < int(datetime.utcnow().timestamp()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недействительный или истекший handoff code",
            )
        data["user_id"] = int(data["user_id"])
        data.setdefault("purpose", "web_handoff")
        return data


def _store_oauth_onboarding_ticket(profile_data: dict) -> str:
    ticket = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    payload_dict = {
        "provider": YANDEX_PROVIDER,
        "provider_user_id": str(profile_data.get("provider_user_id") or "").strip(),
        "email": str(profile_data.get("email") or "").strip().lower(),
        "display_name": str(profile_data.get("display_name") or "").strip() or None,
        "avatar": profile_data.get("avatar"),
        "exp": int((now + timedelta(seconds=OAUTH_ONBOARDING_TICKET_TTL_SECONDS)).timestamp()),
    }
    if not payload_dict["provider_user_id"] or not payload_dict["email"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул данные для регистрации")
    payload = json.dumps(payload_dict, separators=(",", ":"))
    settings = get_settings()
    try:
        from sms import redis_client
        redis_client.setex(_oauth_onboarding_ticket_key(ticket), OAUTH_ONBOARDING_TICKET_TTL_SECONDS, payload)
        return ticket
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth onboarding storage unavailable")
        _cleanup_memory_oauth_tickets()
        _oauth_ticket_memory_store[_oauth_onboarding_ticket_key(ticket)] = payload_dict
        return ticket


def _get_oauth_onboarding_ticket(ticket: str) -> dict:
    normalized = str(ticket or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный OAuth onboarding ticket")
    settings = get_settings()
    try:
        from sms import redis_client
        raw = redis_client.get(_oauth_onboarding_ticket_key(normalized))
        if not raw:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth onboarding ticket")
        data = json.loads(raw)
    except HTTPException:
        raise
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth onboarding storage unavailable")
        _cleanup_memory_oauth_tickets()
        data = _oauth_ticket_memory_store.get(_oauth_onboarding_ticket_key(normalized))
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth onboarding ticket")
    if int(data.get("exp") or 0) < int(datetime.utcnow().timestamp()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный или истекший OAuth onboarding ticket")
    return dict(data)


def _save_oauth_onboarding_ticket(ticket: str, data: dict) -> None:
    normalized = str(ticket or "").strip()
    ttl = max(1, int(data.get("exp") or 0) - int(datetime.utcnow().timestamp()))
    payload = json.dumps(data, separators=(",", ":"))
    settings = get_settings()
    try:
        from sms import redis_client
        redis_client.setex(_oauth_onboarding_ticket_key(normalized), ttl, payload)
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth onboarding storage unavailable")
        _oauth_ticket_memory_store[_oauth_onboarding_ticket_key(normalized)] = dict(data)


def _delete_oauth_onboarding_ticket(ticket: str) -> None:
    normalized = str(ticket or "").strip()
    settings = get_settings()
    try:
        from sms import redis_client
        redis_client.delete(_oauth_onboarding_ticket_key(normalized))
    except Exception:
        if settings.is_production:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OAuth onboarding storage unavailable")
        _oauth_ticket_memory_store.pop(_oauth_onboarding_ticket_key(normalized), None)


def _exchange_yandex_code_for_token(code: str, redirect_uri: str, settings) -> str:
    try:
        response = httpx.post(
            YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_CLIENT_ID,
                "client_secret": settings.YANDEX_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
            },
            timeout=15,
        )
        response.raise_for_status()
        token = response.json().get("access_token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось получить токен Яндекса")
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул access token")
    return token


def _fetch_yandex_profile(access_token: str) -> dict:
    try:
        response = httpx.get(
            YANDEX_PROFILE_URL,
            headers={"Authorization": f"OAuth {access_token}"},
            params={"format": "json"},
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось получить профиль Яндекса")


def _extract_yandex_default_phone(profile: dict) -> Optional[str]:
    raw_phone = None
    default_phone = profile.get("default_phone")
    if isinstance(default_phone, dict):
        raw_phone = default_phone.get("number")
    normalized = normalize_to_canonical(str(raw_phone or ""))
    return normalized


def _assign_yandex_phone_if_empty(db: Session, user: User, phone: Optional[str]) -> bool:
    if not phone or user.phone:
        return False
    existing = db.query(User).filter(User.phone == phone, User.id != user.id).first()
    if existing:
        return False
    user.phone = phone
    user.updated_at = datetime.utcnow()
    return True


def cleanup_orphan_oauth_account(db: Session, account: UserOAuthAccount) -> None:
    db.delete(account)
    db.commit()


def _yandex_onboarding_profile_data(profile: dict) -> dict:
    provider_user_id = str(profile.get("id") or "").strip()
    email = str(profile.get("default_email") or profile.get("email") or "").strip().lower()
    name = str(profile.get("real_name") or profile.get("display_name") or profile.get("login") or "").strip()
    avatar = profile.get("default_avatar_id") or profile.get("avatar_id")
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул идентификатор пользователя")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул email")
    return {
        "provider": YANDEX_PROVIDER,
        "provider_user_id": provider_user_id,
        "email": email,
        "display_name": name or None,
        "avatar": avatar,
    }


def _user_from_yandex_profile(db: Session, profile: dict) -> Optional[User]:
    provider_user_id = str(profile.get("id") or "").strip()
    email = str(profile.get("default_email") or profile.get("email") or "").strip().lower()
    name = str(profile.get("real_name") or profile.get("display_name") or profile.get("login") or "").strip()
    yandex_phone = _extract_yandex_default_phone(profile)
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул идентификатор пользователя")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул email")

    account = (
        db.query(UserOAuthAccount)
        .filter(
            UserOAuthAccount.provider == YANDEX_PROVIDER,
            UserOAuthAccount.provider_user_id == provider_user_id,
        )
        .first()
    )
    if account:
        linked_user = account.user
        if linked_user is None:
            cleanup_orphan_oauth_account(db, account)
        else:
            account.email = email
            account.updated_at = datetime.utcnow()
            _assign_yandex_phone_if_empty(db, linked_user, yandex_phone)
            db.commit()
            db.refresh(linked_user)
            return linked_user

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if name and not user.full_name:
        user.full_name = name
        user.updated_at = datetime.utcnow()
    _assign_yandex_phone_if_empty(db, user, yandex_phone)

    db.add(UserOAuthAccount(
        user_id=user.id,
        provider=YANDEX_PROVIDER,
        provider_user_id=provider_user_id,
        email=email,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    ))
    db.commit()
    db.refresh(user)
    return user


def _link_yandex_profile_to_user(db: Session, profile: dict, user_id: int) -> tuple[User, str, str]:
    provider_user_id = str(profile.get("id") or "").strip()
    email = str(profile.get("default_email") or profile.get("email") or "").strip().lower()
    yandex_phone = _extract_yandex_default_phone(profile)
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Яндекс не вернул идентификатор пользователя")
    user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пользователь для привязки не найден")

    account = (
        db.query(UserOAuthAccount)
        .filter(
            UserOAuthAccount.provider == YANDEX_PROVIDER,
            UserOAuthAccount.provider_user_id == provider_user_id,
        )
        .first()
    )
    if account and account.user is None:
        cleanup_orphan_oauth_account(db, account)
        account = None
    if account and account.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот Яндекс уже привязан к другому аккаунту",
        )
    if account and account.user_id == user.id:
        account.email = email or account.email
        account.updated_at = datetime.utcnow()
        _assign_yandex_phone_if_empty(db, user, yandex_phone)
        db.commit()
        db.refresh(user)
        return user, "already_linked", "Яндекс уже привязан"

    db.add(UserOAuthAccount(
        user_id=user.id,
        provider=YANDEX_PROVIDER,
        provider_user_id=provider_user_id,
        email=email or None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    ))
    _assign_yandex_phone_if_empty(db, user, yandex_phone)
    db.commit()
    db.refresh(user)
    return user, "linked", "Яндекс аккаунт привязан"


def _create_master_profile_for_user(db: Session, user: User, city: str, timezone: str) -> Master:
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        can_work_independently=True,
        can_work_in_salon=True,
        website=None,
        created_at=datetime.utcnow(),
        city=city,
        timezone=timezone,
        timezone_confirmed=bool(city and timezone),
    )
    db.add(master)
    db.commit()
    db.refresh(master)

    from utils.base62 import generate_unique_domain
    master.domain = generate_unique_domain(master.id, db)
    db.commit()
    db.refresh(master)
    return master


def _create_user_from_oauth_onboarding(db: Session, ticket_data: dict, payload: OAuthOnboardingCompleteRequest) -> User:
    role_value = (payload.role or "").strip().lower()
    if role_value not in {UserRole.CLIENT.value, UserRole.MASTER.value}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Выберите роль: client или master")
    if not payload.accepted_terms or not payload.accepted_personal_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Примите пользовательское соглашение и согласие на обработку персональных данных")

    phone = normalize_to_canonical(payload.phone)
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите корректный номер телефона")

    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already registered")

    email = str(ticket_data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth ticket не содержит email")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    provider_user_id = str(ticket_data.get("provider_user_id") or "").strip()
    if not provider_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth ticket не содержит идентификатор Яндекса")
    if (
        db.query(UserOAuthAccount)
        .filter(UserOAuthAccount.provider == YANDEX_PROVIDER, UserOAuthAccount.provider_user_id == provider_user_id)
        .first()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Этот Яндекс уже привязан")

    if ticket_data.get("phone") != phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Телефон не совпадает с подтвержденным")
    if not ticket_data.get("phone_verification_code") or not ticket_data.get("phone_verification_expires"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Подтвердите телефон звонком")
    if int(ticket_data.get("phone_verification_expires") or 0) < int(datetime.utcnow().timestamp()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Код истёк. Запросите звонок ещё раз.")
    if ticket_data.get("call_id") and str(ticket_data.get("call_id")) != str(payload.call_id or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверная сессия верификации")
    if str(ticket_data.get("phone_verification_code") or "") != str(payload.phone_verification_code or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверные цифры номера телефона")

    city = (payload.city or "").strip()
    timezone = (payload.timezone or "").strip() or "Europe/Moscow"
    role = UserRole(role_value)
    if role == UserRole.MASTER:
        expected_timezone = get_timezone_by_city(city)
        if not expected_timezone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Выберите город из списка")
        if timezone and timezone != expected_timezone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Часовой пояс не соответствует выбранному городу")
        timezone = expected_timezone

    user = User(
        email=email,
        phone=phone,
        hashed_password=None,
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
        full_name=ticket_data.get("display_name"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if role == UserRole.MASTER:
        _create_master_profile_for_user(db, user, city, timezone)

    db.add(UserOAuthAccount(
        user_id=user.id,
        provider=YANDEX_PROVIDER,
        provider_user_id=provider_user_id,
        email=email,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    ))
    db.commit()
    db.refresh(user)
    return user

# --- Контракты смены контактов (pending) ---


@router.post("/request-phone-change", response_model=RequestPhoneChangeResponse)
async def request_phone_change(
    request: RequestPhoneChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    """Запрос на смену телефона: сохраняет pending_phone и инициирует flashcall."""
    new_phone = request.phone

    # Uniqueness
    existing = db.query(User).filter(User.phone == new_phone, User.id != current_user.id).first()
    if existing:
        return RequestPhoneChangeResponse(message="Телефон уже используется", success=False)

    current_user.pending_phone = new_phone
    current_user.pending_phone_expires_at = datetime.utcnow() + timedelta(minutes=10)
    current_user.phone_verification_attempts = 0
    current_user.phone_verification_purpose = "phone_change"

    call_result = zvonok_service.send_verification_call(new_phone)
    if not call_result.get("success"):
        return RequestPhoneChangeResponse(
            message=call_result.get("error") or "Ошибка инициации звонка",
            success=False,
        )

    current_user.phone_verification_code = str(
        call_result.get("pincode") or call_result.get("verification_number") or ""
    ).strip() or None
    current_user.phone_verification_call_id = str(call_result.get("call_id") or "").strip() or None
    current_user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
    current_user.phone_verification_target_phone = new_phone
    db.commit()

    return RequestPhoneChangeResponse(
        message="Звонок для подтверждения нового телефона инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
        success=True,
        call_id=call_result.get("call_id"),
    )


@router.post("/confirm-phone-change", response_model=ConfirmPhoneChangeResponse)
async def confirm_phone_change(
    request: ConfirmPhoneChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    """Подтверждение смены телефона по 4 цифрам (pincode)."""
    if not current_user.pending_phone or current_user.pending_phone != request.phone:
        return ConfirmPhoneChangeResponse(message="Нет ожидающей смены телефона", success=False)
    if current_user.pending_phone_expires_at and current_user.pending_phone_expires_at <= datetime.utcnow():
        return ConfirmPhoneChangeResponse(message="Ожидание смены телефона истекло", success=False)
    if not current_user.phone_verification_code or not current_user.phone_verification_expires:
        return ConfirmPhoneChangeResponse(message="Верификация не инициирована", success=False)
    if current_user.phone_verification_expires <= datetime.utcnow():
        return ConfirmPhoneChangeResponse(message="Код истёк. Запросите звонок ещё раз.", success=False)
    if current_user.phone_verification_call_id and str(current_user.phone_verification_call_id) != str(request.call_id):
        return ConfirmPhoneChangeResponse(message="Неверная сессия верификации", success=False)
    attempts = int(current_user.phone_verification_attempts or 0)
    if attempts >= 5:
        return ConfirmPhoneChangeResponse(message="Превышено число попыток. Запросите звонок ещё раз.", success=False)
    if str(current_user.phone_verification_code) != str(request.phone_digits):
        current_user.phone_verification_attempts = attempts + 1
        db.commit()
        return ConfirmPhoneChangeResponse(message="Неверные цифры номера телефона", success=False)

    # Apply
    current_user.phone = current_user.pending_phone
    current_user.pending_phone = None
    current_user.pending_phone_expires_at = None
    current_user.is_phone_verified = True

    current_user.phone_verification_code = None
    current_user.phone_verification_call_id = None
    current_user.phone_verification_expires = None
    current_user.phone_verification_attempts = 0
    current_user.phone_verification_target_phone = None
    current_user.phone_verification_purpose = None

    db.commit()
    return ConfirmPhoneChangeResponse(message="Телефон успешно изменён и подтверждён", success=True)


@router.post("/request-email-change", response_model=RequestEmailChangeResponse)
async def request_email_change(
    request: RequestEmailChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    """Запрос на смену email: сохраняет pending_email и отправляет письмо со ссылкой."""
    new_email = request.email
    existing = db.query(User).filter(User.email == new_email, User.id != current_user.id).first()
    if existing:
        return RequestEmailChangeResponse(message="Email уже используется", success=False)

    current_user.pending_email = str(new_email)
    db.commit()

    try:
        verification = VerificationService.create_email_change_verification(current_user, str(new_email), db)
        from services.email_service import get_email_service
        from urllib.parse import urljoin
        base_url = get_settings().FRONTEND_URL
        verify_url = urljoin(base_url, f"/verify-email?token={verification.token}")

        subject = "Подтвердите новый email"
        html = f"""
        <html><body>
          <h2>Подтверждение смены email</h2>
          <p>Вы запросили смену email в DeDato.</p>
          <p><a href="{verify_url}">Подтвердить новый email</a></p>
          <p>Если ссылка не работает, скопируйте её в браузер:</p>
          <p>{verify_url}</p>
          <p>Ссылка действительна в течение 24 часов.</p>
        </body></html>
        """
        await get_email_service().send_email(str(new_email), subject, html)
    except Exception as e:
        print(f"Ошибка отправки письма смены email: {e}")
        return RequestEmailChangeResponse(message="Не удалось отправить письмо подтверждения", success=False)

    return RequestEmailChangeResponse(
        message="Письмо для подтверждения нового email отправлено. Перейдите по ссылке в письме.",
        success=True,
    )


@router.post("/confirm-email-change", response_model=ConfirmEmailChangeResponse)
async def confirm_email_change(
    request: ConfirmEmailChangeRequest,
    db: Session = Depends(get_db),
) -> Any:
    """Подтверждение смены email по токену из письма."""
    try:
        user = VerificationService.verify_email_token(request.token, db)
        if not user:
            return ConfirmEmailChangeResponse(message="Недействительный или истекший токен", success=False)

        # ensure this token is for email_change and matches
        ver = db.query(EmailVerification).filter(EmailVerification.token == request.token).first()
        if not ver or ver.purpose != "email_change":
            return ConfirmEmailChangeResponse(message="Недействительный токен для смены email", success=False)
        if not user.pending_email or (ver.email_to_verify and user.pending_email != ver.email_to_verify):
            return ConfirmEmailChangeResponse(message="Нет ожидающей смены email", success=False)

        # uniqueness on apply
        existing = db.query(User).filter(User.email == user.pending_email, User.id != user.id).first()
        if existing:
            return ConfirmEmailChangeResponse(message="Email уже используется", success=False)

        user.email = user.pending_email
        user.pending_email = None
        user.is_verified = True
        db.commit()

        return ConfirmEmailChangeResponse(message="Email успешно изменён и подтверждён", success=True)
    except Exception as e:
        print(f"Ошибка confirm-email-change: {e}")
        return ConfirmEmailChangeResponse(message="Внутренняя ошибка сервера", success=False)


@router.post("/demo-master-access", response_model=Token)
def demo_master_access(db: Session = Depends(get_db)) -> Any:
    """
    One-click доступ в демо-кабинет мастера без логина/пароля.
    Выдаёт обычные токены демо-пользователя (read-only enforcement на backend).
    """
    ensure_demo_master_exists(db)
    demo_phone = get_settings().DEMO_MASTER_PHONE
    user = db.query(User).filter(User.phone == demo_phone).first()
    if not user:
        raise HTTPException(status_code=500, detail="Не удалось подготовить demo master")

    return _issue_tokens_for_user(user, extra_claims={"demo": True})


@router.get("/yandex/login", include_in_schema=False)
def yandex_login() -> RedirectResponse:
    settings = _oauth_enabled_or_404()
    state = _create_oauth_state()
    return _yandex_authorize_redirect(settings, state)


@router.get("/yandex/link", include_in_schema=False)
def yandex_link(
    return_to: Optional[str] = Query(None),
    as_json: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    settings = _oauth_enabled_or_404()
    safe_return_to = _sanitize_oauth_return_to(return_to, _default_link_return_to(current_user))
    existing = (
        db.query(UserOAuthAccount)
        .filter(UserOAuthAccount.provider == YANDEX_PROVIDER, UserOAuthAccount.user_id == current_user.id)
        .first()
    )
    if existing:
        ticket = _store_oauth_ticket(
            current_user.id,
            purpose="oauth_link",
            status_value="already_linked",
            message="Яндекс уже привязан",
            return_to=safe_return_to,
        )
        query = urlencode({"ticket": ticket, "mode": "link"})
        redirect_url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/oauth/callback?{query}"
        return {"redirect_url": redirect_url} if as_json else RedirectResponse(redirect_url)
    state = _create_oauth_state(
        mode="link",
        user_id=current_user.id,
        return_to=safe_return_to,
        source_session_version=current_user.session_version,
    )
    redirect = _yandex_authorize_redirect(settings, state)
    return {"redirect_url": redirect.headers["location"]} if as_json else redirect


@router.get("/yandex/callback", include_in_schema=False)
def yandex_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = _oauth_enabled_or_404()
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отсутствует code/state")
    state_data = _verify_oauth_state(state)
    redirect_uri = _yandex_redirect_uri(settings)

    try:
        access_token = _exchange_yandex_code_for_token(code, redirect_uri, settings)
        profile = _fetch_yandex_profile(access_token)
        if state_data["mode"] == "link":
            source_user = (
                db.query(User)
                .filter(
                    User.id == int(state_data["user_id"]),
                    User.is_active == True,
                    User.deleted_at.is_(None),
                )
                .first()
            )
            if (
                not source_user
                or int(state_data["source_session_version"])
                != int(source_user.session_version)
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="OAuth-сессия была отозвана",
                )
            user, link_status, message = _link_yandex_profile_to_user(db, profile, int(state_data["user_id"]))
            ticket = _store_oauth_ticket(
                user.id,
                purpose="oauth_link",
                status_value=link_status,
                message=message,
                return_to=state_data.get("return_to"),
            )
            query = urlencode({"ticket": ticket, "mode": "link"})
        else:
            user = _user_from_yandex_profile(db, profile)
            if user:
                ticket = _store_oauth_ticket(user.id, purpose="oauth_login")
                query = urlencode({"ticket": ticket})
            else:
                onboarding_ticket = _store_oauth_onboarding_ticket(_yandex_onboarding_profile_data(profile))
                query = urlencode({"onboarding_ticket": onboarding_ticket})
    except HTTPException as exc:
        mode = state_data.get("mode", "login") if isinstance(state_data, dict) else "login"
        return _oauth_error_redirect(str(exc.detail), mode=mode, return_to=state_data.get("return_to") if isinstance(state_data, dict) else None)

    return RedirectResponse(f"{settings.FRONTEND_URL.rstrip('/')}/auth/oauth/callback?{query}")


@router.post("/oauth/exchange")
def oauth_exchange(payload: OAuthExchangeRequest, db: Session = Depends(get_db)) -> Any:
    ticket_data = _consume_oauth_ticket(payload.ticket)
    user = db.query(User).filter(User.id == ticket_data["user_id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный OAuth ticket")
    response = _token_response_for_user(user)
    response["oauth"] = {
        "purpose": ticket_data.get("purpose", "oauth_login"),
        "provider": ticket_data.get("provider", YANDEX_PROVIDER),
        "status": ticket_data.get("status", "success"),
        "message": ticket_data.get("message"),
        "return_to": ticket_data.get("return_to"),
    }
    return response


@router.get("/oauth/accounts")
def oauth_accounts(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)) -> Any:
    accounts = db.query(UserOAuthAccount).filter(UserOAuthAccount.user_id == current_user.id).all()
    return {
        "items": [
            {
                "provider": account.provider,
                "email": account.email,
                "created_at": account.created_at,
                "is_linked": True,
            }
            for account in accounts
        ]
    }


@router.post("/oauth/onboarding-validate")
def oauth_onboarding_validate(payload: OAuthOnboardingValidateRequest) -> Any:
    ticket_data = _get_oauth_onboarding_ticket(payload.ticket)
    return {
        "valid": True,
        "provider": ticket_data.get("provider", YANDEX_PROVIDER),
        "email": ticket_data.get("email"),
        "display_name": ticket_data.get("display_name"),
    }


@router.post("/oauth/onboarding-phone-request", response_model=PhoneVerificationResponse)
def oauth_onboarding_phone_request(payload: OAuthOnboardingPhoneRequest, db: Session = Depends(get_db)) -> Any:
    ticket_data = _get_oauth_onboarding_ticket(payload.ticket)
    phone = normalize_to_canonical(payload.phone)
    if not phone:
        return PhoneVerificationResponse(message="Укажите корректный номер телефона", success=False)
    if db.query(User).filter(User.phone == phone).first():
        return PhoneVerificationResponse(message="Телефон уже используется", success=False)

    call_result = zvonok_service.send_verification_call(phone)
    if not call_result.get("success"):
        return PhoneVerificationResponse(
            message=call_result.get("error") or "Ошибка инициации звонка",
            success=False,
        )

    pin_raw = str(call_result.get("pincode") or call_result.get("verification_number") or "").strip() or None
    ticket_data["phone"] = phone
    ticket_data["phone_verification_code"] = pin_raw
    ticket_data["call_id"] = str(call_result.get("call_id") or "").strip() or None
    ticket_data["phone_verification_expires"] = int((datetime.utcnow() + timedelta(minutes=5)).timestamp())
    _save_oauth_onboarding_ticket(payload.ticket, ticket_data)

    stub = bool(getattr(get_settings(), "zvonok_stub", False))
    return PhoneVerificationResponse(
        message="Звонок для подтверждения телефона инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
        success=True,
        call_id=call_result.get("call_id"),
        verification_number=pin_raw if stub else None,
    )


@router.post("/oauth/onboarding-complete")
def oauth_onboarding_complete(payload: OAuthOnboardingCompleteRequest, db: Session = Depends(get_db)) -> Any:
    ticket_data = _get_oauth_onboarding_ticket(payload.ticket)
    user = _create_user_from_oauth_onboarding(db, ticket_data, payload)
    _delete_oauth_onboarding_ticket(payload.ticket)
    return _token_response_for_user(user)


@router.post(
    "/register",
    response_model=PhoneVerificationRequiredResponse,
    summary="Регистрация нового пользователя",
    responses={
        400: {"description": "Email или телефон уже заняты / не указаны город и часовой пояс для мастера"},
        422: {"description": "Ошибка валидации тела запроса"},
    },
)
async def register(user_in: UserCreate, db: Session = Depends(get_db)) -> Any:
    """Validate and store a pre-registration ticket without creating any account rows."""
    if user_in.role not in {UserRole.CLIENT, UserRole.MASTER}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для password-регистрации выберите роль client или master",
        )
    if not user_in.accept_terms or not user_in.accept_personal_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Примите пользовательское соглашение и согласие на обработку персональных данных",
        )

    phone = normalize_to_canonical(user_in.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Укажите корректный номер телефона")
    email = str(user_in.email or "").strip().lower() or None
    promo_code = (user_in.promo_code or "").strip()
    if promo_code and user_in.role != UserRole.MASTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промокод доступен только при регистрации мастера",
        )

    if promo_code:
        try:
            promo_code = validate_promo_code_for_registration(db, promo_code)
        except PromoEngineError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": exc.code, "message": exc.message})

    if email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            raise HTTPException(status_code=400, detail="Email already registered")

    phone_user = db.query(User).filter(User.phone == phone).first()
    if phone_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    city = None
    timezone = None
    if user_in.role == UserRole.MASTER:
        city = (user_in.city or "").strip()
        timezone = (user_in.timezone or "").strip()
        expected_timezone = get_timezone_by_city(city)
        if not city or not timezone or not expected_timezone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для регистрации мастера укажите город. Часовой пояс определяется автоматически.",
            )
        if timezone != expected_timezone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Часовой пояс не соответствует выбранному городу",
            )

    pending_payload = {
        "email": email,
        "phone": phone,
        "hashed_password": get_password_hash(user_in.password),
        "role": user_in.role.value,
        "full_name": user_in.full_name,
        "birth_date": user_in.birth_date.isoformat() if user_in.birth_date else None,
        "city": city,
        "timezone": timezone,
        "promo_code": promo_code or None,
        "accept_terms": True,
        "accept_personal_data": True,
        "marketing_opt_in": bool(user_in.marketing_opt_in),
    }
    ticket = _store_registration_ticket(pending_payload)
    return _registration_ticket_response(ticket, phone)


@router.post("/verify", response_model=Token, summary="Подтверждение регистрации")
def verify(verify_data: VerifyRequest, db: Session = Depends(get_db)) -> Any:
    """
    Подтверждение регистрации по SMS-коду.

    - **email**: Email пользователя
    - **code**: Код подтверждения из SMS
    """
    if not verify_sms_code(verify_data.email, verify_data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user = db.query(User).filter(User.email == verify_data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Активируем пользователя
    user.is_active = True
    user.is_verified = True
    db.commit()

    return _issue_tokens_for_user(user)


@router.post(
    "/login",
    response_model=Union[Token, PhoneVerificationRequiredResponse],
    summary="Вход в систему",
    responses={
        401: {"description": "Неверный телефон или пароль"},
        422: {"description": "Ошибка валидации тела запроса"},
    },
)
def login(login_data: LoginRequest, db: Session = Depends(get_db)) -> Any:
    """
    Аутентификация пользователя.

    - **phone**: Телефон пользователя
    - **password**: Пароль
    """
    user = db.query(User).filter(User.phone == login_data.phone).first()
    if not user or not user.hashed_password or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный номер телефона или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active or getattr(user, "deleted_at", None) is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный номер телефона или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_phone_verified:
        return _legacy_phone_verification_required_response(user)

    return _issue_tokens_for_user(user)



@router.post(
    "/web-handoff",
    summary="Создать one-time код для iOS/Android → web handoff",
    responses={401: {"description": "Требуется авторизация"}},
)
def create_web_handoff(
    body: Optional[WebHandoffCreateRequest] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Выдать одноразовый код для открытия web-сессии из мобильного приложения.

    JWT в URL не кладётся — только opaque code.
    """
    _ = db  # dependency for consistent auth stack / future audit hooks
    origin = WEB_SESSION_ORIGIN_IOS_APP
    if body is not None and body.origin is not None and str(body.origin).strip():
        origin = str(body.origin).strip()
    if origin not in WEB_HANDOFF_ALLOWED_ORIGINS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported handoff origin",
        )
    destination = None
    if body is not None and body.destination is not None:
        destination = str(body.destination).strip()
    if origin == WEB_SESSION_ORIGIN_IOS_APP and destination not in WEB_HANDOFF_IOS_DESTINATIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported iOS handoff destination",
        )
    if not current_user.is_active or getattr(current_user, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    code = _store_web_handoff(
        current_user.id,
        origin,
        current_user.session_version,
        destination,
    )
    frontend = get_settings().FRONTEND_URL.rstrip("/")
    url = f"{frontend}/auth/mobile-handoff?code={code}"
    return {
        "code": code,
        "url": url,
        "expires_in": WEB_HANDOFF_TTL_SECONDS,
    }


@router.post(
    "/web-handoff/exchange",
    summary="Обменять handoff code на web JWT",
)
def exchange_web_handoff(
    body: WebHandoffExchangeRequest,
    db: Session = Depends(get_db),
):
    """Атомарно потребить code и выдать Bearer JWT для web (localStorage)."""
    ticket_data = _consume_web_handoff(body.code)
    if ticket_data.get("purpose") != "web_handoff":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный handoff code")

    user = db.query(User).filter(User.id == int(ticket_data["user_id"])).first()
    if not user or not user.is_active or getattr(user, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if int(ticket_data.get("source_session_version") or 0) != int(user.session_version):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Handoff session was revoked",
        )

    origin = str(ticket_data.get("origin") or "").strip()
    web_session_origin = origin if origin == WEB_SESSION_ORIGIN_IOS_APP else None
    tokens = _issue_tokens_for_user(user, web_session_origin=web_session_origin)
    tokens["user"] = {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "full_name": user.full_name,
        "is_verified": user.is_verified,
        "is_phone_verified": user.is_phone_verified,
        "phone_required": user.phone_required,
        "phone_verified": user.phone_verified,
        "web_session_origin": web_session_origin,
    }
    destination = str(ticket_data.get("destination") or "").strip()
    tokens["redirect_to"] = (
        WEB_HANDOFF_IOS_DESTINATIONS.get(destination, "/master")
        if origin == WEB_SESSION_ORIGIN_IOS_APP
        else WEB_HANDOFF_REDIRECT_TO
    )
    tokens["web_session_origin"] = web_session_origin
    return tokens


@router.post(
    "/refresh",
    response_model=Token,
    summary="Обновление токена",
    responses={401: {"description": "Невалидный или истёкший refresh token"}},
)
def refresh_token(refresh_data: dict, db: Session = Depends(get_db)) -> Any:
    """
    Обновление access token с помощью refresh token.

    - **refresh_token**: Refresh token для обновления
    """
    try:
        payload = jwt.decode(
            refresh_data["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM]
        )
        if payload.get("purpose") or not refresh_token_type_matches(payload):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
        sub: str = payload.get("sub")
        if sub is None or not str(sub).strip().isdigit():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user = resolve_user_from_token_sub(db, sub)
    if not user or not user.is_active or getattr(user, "deleted_at", None) is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    if not session_version_matches(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    return _issue_tokens_for_user(
        user,
        extra_claims=normal_session_extra_claims(payload),
    )


@router.get(
    "/users/me",
    response_model=UserSchema,
    summary="Текущий пользователь",
    responses={401: {"description": "Требуется авторизация"}},
)
def get_me(
    current_user=Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """
    Получить данные текущего пользователя.
    """
    return current_user


@router.post(
    "/change-password",
    response_model=MessageOut,
    summary="Изменение пароля",
    responses={400: {"description": "Неверный текущий пароль"}, 401: {"description": "Требуется авторизация"}},
)
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Изменение пароля пользователя.
    
    - **old_password**: Текущий пароль
    - **new_password**: Новый пароль (минимум 6 символов)
    """
    # Проверяем текущий пароль
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль"
        )
    
    current_hash = current_user.hashed_password
    if not update_password_and_revoke_sessions(
        db,
        current_user,
        password_data.new_password,
        expected_hashed_password=current_hash,
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пароль уже был изменён. Войдите снова.",
        )
    db.commit()
    db.refresh(current_user)
    
    return MessageOut(message="Пароль успешно изменен")


@router.post(
    "/set-password",
    response_model=MessageOut,
    summary="Установка пароля для нового клиента",
    responses={400: {"description": "Пароль уже установлен или короче 6 символов"}, 401: {"description": "Требуется авторизация"}},
)
def set_password(
    password_data: SetPasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Установка пароля для нового клиента (после создания бронирования).
    
    - **password**: Новый пароль
    """
    if current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль уже установлен"
        )
    
    if len(password_data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать минимум 6 символов"
        )
    
    if not update_password_and_revoke_sessions(
        db,
        current_user,
        password_data.password,
        expected_hashed_password=None,
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пароль уже установлен",
        )
    db.commit()
    db.refresh(current_user)
    
    return MessageOut(message="Пароль успешно установлен")


@router.post(
    "/verify-password",
    response_model=MessageOut,
    summary="Проверка пароля существующего пользователя",
    responses={400: {"description": "Пароль не установлен"}, 401: {"description": "Неверный пароль или требуется авторизация"}},
)
def verify_user_password(
    password_data: SetPasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Проверка пароля существующего пользователя (после создания бронирования).
    
    - **password**: Пароль для проверки
    """
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль не установлен"
        )
    
    if not verify_password(password_data.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный пароль"
        )
    
    return MessageOut(message="Пароль подтвержден")


@router.delete("/delete-account", summary="Удаление аккаунта пользователя")
async def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Удаление аккаунта пользователя и всех связанных данных.
    Используется для отмены регистрации нового клиента.
    """
    try:
        # Отправляем звонок для подтверждения удаления
        verification_code = VerificationService.generate_verification_code()
        current_user.phone_verification_code = verification_code
        current_user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
        
        call_result = zvonok_service.send_verification_call(current_user.phone)
        if call_result["success"]:
            return {
                "message": "Звонок с кодом подтверждения удаления отправлен",
                "success": True,
                "call_id": call_result.get("call_id")
            }
        else:
            return {
                "message": f"Ошибка отправки звонка: {call_result['message']}",
                "success": False
            }
        
    except Exception as e:
        print(f"Ошибка при отправке звонка подтверждения: {e}")
        return {
            "message": "Внутренняя ошибка сервера",
            "success": False
        }


@router.post("/confirm-delete-account", summary="Подтверждение удаления аккаунта")
async def confirm_delete_account(
    code: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Подтверждение удаления аккаунта по коду из звонка.
    MASTER: anonymize/deactivate. CLIENT: anonymize personal account.
    """
    try:
        if (current_user.phone_verification_code == code and
            current_user.phone_verification_expires and
            current_user.phone_verification_expires > datetime.utcnow()):

            from services.account_deletion import delete_account

            current_user.phone_verification_code = None
            current_user.phone_verification_expires = None
            result = delete_account(db, current_user, commit=True)
            return {"message": result.message, "success": True, "already_deleted": result.already_deleted}
        else:
            return {
                "message": "Неверный код или код истек",
                "success": False
            }

    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении аккаунта: {str(e)}"
        )


@router.post("/request-email-verification", response_model=EmailVerificationResponse)
async def request_email_verification(request: EmailVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на отправку письма для верификации email"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return EmailVerificationResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Проверяем, не верифицирован ли уже email
        if user.is_verified:
            return EmailVerificationResponse(
                message="Email уже верифицирован",
                success=False
            )
        
        # Отправляем письмо верификации
        success = await VerificationService.send_verification_email(user, db)

        if success:
            return EmailVerificationResponse(
                message="Письмо для верификации email отправлено",
                success=True
            )
        else:
            return EmailVerificationResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса верификации email: {e}")
        return EmailVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Подтверждение email по токену"""
    try:
        token = request.token
        # Проверяем токен
        user = VerificationService.verify_email_token(token, db)
        
        if not user:
            return VerifyEmailResponse(
                message="Недействительный или истекший токен",
                success=False
            )

        ver = db.query(EmailVerification).filter(EmailVerification.token == token).first()
        purpose = (ver.purpose if ver else "signup") if ver else "signup"

        # signup: просто подтверждаем текущий email пользователя
        if purpose == "signup":
            user.is_verified = True
            db.commit()
            return VerifyEmailResponse(message="Email успешно подтвержден", success=True, user_id=user.id)

        # email_change: переносим pending_email в email (если совпадает)
        if purpose == "email_change":
            if not user.pending_email:
                return VerifyEmailResponse(message="Нет ожидающей смены email", success=False, user_id=user.id)
            if ver and ver.email_to_verify and user.pending_email != ver.email_to_verify:
                return VerifyEmailResponse(message="Нет ожидающей смены email", success=False, user_id=user.id)

            existing = db.query(User).filter(User.email == user.pending_email, User.id != user.id).first()
            if existing:
                return VerifyEmailResponse(message="Email уже используется", success=False, user_id=user.id)

            user.email = user.pending_email
            user.pending_email = None
            user.is_verified = True
            db.commit()
            return VerifyEmailResponse(message="Email успешно изменён и подтвержден", success=True, user_id=user.id)

        return VerifyEmailResponse(message="Недействительный токен", success=False, user_id=user.id)
        
    except Exception as e:
        print(f"Ошибка верификации email: {e}")
        return VerifyEmailResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/request-password-reset", response_model=PasswordResetResponse)
async def request_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Запрос на сброс пароля"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return PasswordResetResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Отправляем письмо сброса пароля
        success = await VerificationService.send_password_reset_email(user, db)
        
        if success:
            return PasswordResetResponse(
                message="Письмо для сброса пароля отправлено",
                success=True
            )
        else:
            return PasswordResetResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса сброса пароля: {e}")
        return PasswordResetResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post(
    "/request-password-reset-phone",
    response_model=RequestPasswordResetPhoneResponse,
)
async def request_password_reset_phone(
    request: RequestPasswordResetPhoneRequest,
    db: Session = Depends(get_db),
):
    """Start a purpose-bound challenge while keeping existing/unknown responses equivalent."""
    target_phone = normalize_to_canonical(request.phone) or "+70000000000"
    challenge_id = secrets.token_urlsafe(24)
    user = None
    if normalize_to_canonical(request.phone):
        user = (
            db.query(User)
            .filter(User.phone == target_phone)
            .with_for_update()
            .first()
        )
    eligible = bool(
        user
        and user.is_active
        and getattr(user, "deleted_at", None) is None
        and user.hashed_password
    )
    if eligible and user is not None:
        # Every resend invalidates the previous challenge before contacting the provider.
        VerificationService.clear_phone_challenge(user)
        db.commit()
        call_result = zvonok_service.send_verification_call(user.phone)
        if call_result.get("success"):
            internal_result = dict(call_result)
            internal_result["call_id"] = challenge_id
            try:
                VerificationService.start_phone_challenge(
                    user,
                    purpose="password_reset",
                    target_phone=user.phone,
                    call_result=internal_result,
                    db=db,
                )
            except PhoneChallengeError:
                VerificationService.clear_phone_challenge(user)
                db.commit()

    challenge_token = create_password_reset_phone_verification_token(
        target_phone,
        challenge_id,
    )
    return RequestPasswordResetPhoneResponse(
        message=PASSWORD_RESET_GENERIC_MESSAGE,
        challenge_token=challenge_token,
        call_id=challenge_id,
        expires_in=PASSWORD_RESET_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/confirm-password-reset-phone",
    response_model=ConfirmPasswordResetPhoneResponse,
)
async def confirm_password_reset_phone(
    request: ConfirmPasswordResetPhoneRequest,
    db: Session = Depends(get_db),
):
    """Consume the current phone challenge and issue a short-lived PasswordReset token."""
    try:
        payload = decode_password_reset_phone_verification_token(request.challenge_token)
    except JWTError:
        raise HTTPException(status_code=400, detail=PASSWORD_RESET_CONFIRM_ERROR)

    target_phone = str(payload.get("target") or "")
    token_challenge_id = str(payload.get("challenge_id") or "")
    if not hmac.compare_digest(token_challenge_id, request.call_id):
        raise HTTPException(status_code=400, detail=PASSWORD_RESET_CONFIRM_ERROR)
    user = (
        db.query(User)
        .filter(User.phone == target_phone)
        .with_for_update()
        .first()
    )
    if (
        not user
        or not user.is_active
        or getattr(user, "deleted_at", None) is not None
        or not user.hashed_password
    ):
        raise HTTPException(status_code=400, detail=PASSWORD_RESET_CONFIRM_ERROR)
    try:
        VerificationService.consume_phone_challenge(
            user,
            purpose="password_reset",
            target_phone=user.phone,
            call_id=request.call_id,
            phone_digits=request.phone_digits,
            db=db,
        )
        reset = VerificationService.create_password_reset(
            user,
            db,
            ttl_minutes=PASSWORD_RESET_TOKEN_TTL_MINUTES,
            commit=False,
        )
        db.commit()
        db.refresh(reset)
    except PhoneChallengeError:
        raise HTTPException(status_code=400, detail=PASSWORD_RESET_CONFIRM_ERROR)
    except Exception:
        db.rollback()
        raise
    return ConfirmPasswordResetPhoneResponse(
        reset_token=reset.token,
        expires_in=PASSWORD_RESET_TOKEN_TTL_MINUTES * 60,
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Atomically consume a one-time PasswordReset token and update the password."""
    try:
        reset = (
            db.query(PasswordReset)
            .filter(
                PasswordReset.token == request.token,
                PasswordReset.is_used == False,
                PasswordReset.expires_at > datetime.utcnow(),
            )
            .with_for_update()
            .first()
        )
        if not reset:
            return ResetPasswordResponse(
                message="Недействительный или истекший токен",
                success=False
            )
        user = (
            db.query(User)
            .filter(User.id == reset.user_id)
            .with_for_update()
            .first()
        )
        if not user or not user.is_active or getattr(user, "deleted_at", None) is not None:
            return ResetPasswordResponse(
                message="Недействительный или истекший токен",
                success=False,
            )
        if not update_password_and_revoke_sessions(db, user, request.new_password):
            raise RuntimeError("password reset user update failed")
        reset.is_used = True
        db.commit()
        
        return ResetPasswordResponse(
            message="Пароль успешно изменен",
            success=True,
            user_id=user.id
        )
        
    except Exception as e:
        db.rollback()
        print(f"Ошибка сброса пароля: {e}")
        return ResetPasswordResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/reset-password-by-phone", response_model=ResetPasswordResponse)
async def reset_password_by_phone(request: ResetPasswordByPhoneRequest, db: Session = Depends(get_db)):
    """Deprecated insecure legacy contract; use the tokenized three-step flow."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Используйте новый безопасный flow восстановления пароля по телефону",
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(request: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Повторная отправка письма верификации"""
    try:
        # Ищем пользователя по email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            return ResendVerificationResponse(
                message="Пользователь с таким email не найден",
                success=False
            )
        
        # Проверяем, не верифицирован ли уже email
        if user.is_verified:
            return ResendVerificationResponse(
                message="Email уже верифицирован",
                success=False
            )
        
        # Отправляем письмо верификации
        success = await VerificationService.send_verification_email(user, db)

        if success:
            return ResendVerificationResponse(
                message="Письмо для верификации email отправлено повторно",
                success=True
            )
        else:
            return ResendVerificationResponse(
                message="Ошибка отправки письма",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка повторной отправки верификации: {e}")
        return ResendVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post(
    "/request-signup-phone-verification",
    response_model=PhoneVerificationResponse,
)
async def request_signup_phone_verification(
    creds: HTTPAuthorizationCredentials = Depends(registration_verification_bearer),
    db: Session = Depends(get_db),
):
    """Start either a new-registration proof or a historical-account proof."""
    ticket = creds.credentials
    registration_state = _get_registration_ticket(ticket)
    current_user = None
    if registration_state:
        phone = str(registration_state.get("registration", {}).get("phone") or "")
        purpose = REGISTRATION_TICKET_PURPOSE
    else:
        try:
            user_id = decode_signup_phone_verification_token(ticket)
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid phone verification token")
        current_user = db.query(User).filter(User.id == user_id).first()
        if (
            not current_user
            or not current_user.is_active
            or current_user.deleted_at is not None
        ):
            raise HTTPException(status_code=401, detail="Invalid phone verification token")
        try:
            version_matches = signup_phone_verification_version_matches(ticket, current_user)
        except JWTError:
            version_matches = False
        if not version_matches:
            raise HTTPException(status_code=401, detail="Invalid phone verification token")
        if current_user.is_phone_verified:
            raise HTTPException(status_code=409, detail="Телефон уже подтверждён")
        phone = current_user.phone
        purpose = LEGACY_ACCOUNT_VERIFICATION_PURPOSE

    call_result = zvonok_service.send_verification_call(phone)
    if not call_result.get("success"):
        return PhoneVerificationResponse(
            message=call_result.get("error") or "Ошибка инициации звонка",
            success=False,
        )

    try:
        if registration_state:
            challenge = VerificationService.create_phone_challenge_state(
                purpose=purpose,
                target_phone=phone,
                call_result=call_result,
            )
            registration_state.update(challenge)
            _save_registration_ticket(ticket, registration_state)
            call_id = challenge["phone_verification_call_id"]
        else:
            call_id = VerificationService.start_phone_challenge(
                current_user,
                purpose=purpose,
                target_phone=phone,
                call_result=call_result,
                db=db,
            )
    except PhoneChallengeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail,
        )

    return PhoneVerificationResponse(
        message="Звонок для верификации инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
        success=True,
        call_id=call_id,
        verification_number=(
            str(call_result.get("pincode") or call_result.get("verification_number") or "")
            if get_settings().zvonok_stub
            else None
        ),
    )


def _create_password_account_from_registration(
    registration: dict,
    db: Session,
) -> User:
    """Create User + mandatory role rows + promo side effect in one DB transaction."""
    phone = str(registration.get("phone") or "")
    email = str(registration.get("email") or "").strip().lower() or None
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(status_code=409, detail="Phone number already registered")
    if email and db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        role = UserRole(str(registration.get("role") or ""))
        birth_date_raw = registration.get("birth_date")
        user = User(
            email=email,
            phone=phone,
            hashed_password=str(registration.get("hashed_password") or ""),
            role=role,
            is_active=True,
            is_verified=False,
            is_phone_verified=True,
            full_name=registration.get("full_name"),
            birth_date=date.fromisoformat(birth_date_raw) if birth_date_raw else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()

        if role == UserRole.MASTER:
            city = str(registration.get("city") or "").strip()
            timezone = str(registration.get("timezone") or "").strip()
            master = Master(
                user_id=user.id,
                bio="",
                experience_years=0,
                can_work_independently=True,
                can_work_in_salon=True,
                website=None,
                created_at=datetime.utcnow(),
                city=city,
                timezone=timezone,
                timezone_confirmed=bool(city and timezone),
            )
            db.add(master)
            db.flush()
            from utils.base62 import generate_unique_domain
            master.domain = generate_unique_domain(master.id, db)
            promo_code = str(registration.get("promo_code") or "").strip()
            if promo_code:
                create_pending_redemption(db, master.id, promo_code)

        db.commit()
        db.refresh(user)
        return user
    except HTTPException:
        db.rollback()
        raise
    except PromoEngineError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": exc.code, "message": exc.message},
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone or email already registered",
        )
    except Exception:
        db.rollback()
        raise


@router.post(
    "/confirm-signup-phone-verification",
    response_model=Token,
)
async def confirm_signup_phone_verification(
    request: ConfirmSignupPhoneVerificationRequest,
    creds: HTTPAuthorizationCredentials = Depends(registration_verification_bearer),
    db: Session = Depends(get_db),
):
    """Complete new registration or verify one historical unverified account."""
    ticket = creds.credentials
    registration_state = _get_registration_ticket(ticket)
    if registration_state:
        phone = str(registration_state.get("registration", {}).get("phone") or "")
        try:
            VerificationService.consume_phone_challenge_state(
                registration_state,
                purpose=REGISTRATION_TICKET_PURPOSE,
                target_phone=phone,
                call_id=request.call_id,
                phone_digits=request.phone_digits,
            )
        except PhoneChallengeError as exc:
            _save_registration_ticket(ticket, registration_state)
            raise HTTPException(status_code=400, detail=exc.detail)

        claimed = _claim_registration_ticket(ticket)
        if not claimed:
            raise HTTPException(status_code=409, detail="Верификация уже завершена")
        try:
            VerificationService.consume_phone_challenge_state(
                claimed,
                purpose=REGISTRATION_TICKET_PURPOSE,
                target_phone=phone,
                call_id=request.call_id,
                phone_digits=request.phone_digits,
            )
        except PhoneChallengeError:
            raise HTTPException(status_code=409, detail="Верификация уже завершена")
        user = _create_password_account_from_registration(claimed["registration"], db)
        try:
            await VerificationService.send_verification_email(user, db)
        except Exception:
            pass
        return _issue_tokens_for_user(user)

    try:
        user_id = decode_signup_phone_verification_token(ticket)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid phone verification token")
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .first()
    )
    if not user or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Invalid phone verification token")
    try:
        version_matches = signup_phone_verification_version_matches(ticket, user)
    except JWTError:
        version_matches = False
    if not version_matches:
        raise HTTPException(status_code=401, detail="Invalid phone verification token")
    if user.is_phone_verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Верификация уже завершена",
        )
    try:
        VerificationService.consume_phone_challenge(
            user,
            purpose=LEGACY_ACCOUNT_VERIFICATION_PURPOSE,
            target_phone=user.phone,
            call_id=request.call_id,
            phone_digits=request.phone_digits,
            db=db,
        )
    except PhoneChallengeError as exc:
        raise HTTPException(status_code=400, detail=exc.detail)

    user.is_phone_verified = True
    db.commit()

    return _issue_tokens_for_user(user)


@router.post("/cancel-signup-phone-verification", status_code=204)
async def cancel_signup_phone_verification(
    creds: HTTPAuthorizationCredentials = Depends(registration_verification_bearer),
    db: Session = Depends(get_db),
):
    """Explicitly discard pending registration; historical accounts themselves are preserved."""
    ticket = creds.credentials
    if _get_registration_ticket(ticket):
        _delete_registration_ticket(ticket)
        return None
    try:
        user_id = decode_signup_phone_verification_token(ticket)
    except JWTError:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    try:
        version_matches = bool(user) and signup_phone_verification_version_matches(ticket, user)
    except JWTError:
        version_matches = False
    if user and version_matches and not user.is_phone_verified:
        VerificationService.clear_phone_challenge(user)
        db.commit()
    return None


@router.post("/request-phone-verification", response_model=PhoneVerificationResponse)
async def request_phone_verification(request: PhoneVerificationRequest, db: Session = Depends(get_db)):
    """Deprecated: signup and recovery now use purpose-bound restricted contracts."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Используйте purpose-bound endpoint подтверждения телефона",
    )


@router.post("/verify-phone", response_model=VerifyPhoneResponse)
async def verify_phone(request: VerifyPhoneRequest, db: Session = Depends(get_db)):
    """Deprecated insecure phone-only verifier; purpose-bound endpoints replace it."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Используйте purpose-bound endpoint подтверждения телефона",
    )


@router.post("/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(request: dict, db: Session = Depends(get_db)):
    """Email compatibility wrapper; insecure legacy phone branch is retired."""
    if request.get("phone"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Используйте /api/auth/request-password-reset-phone",
        )
    email = request.get("email")
    if not email:
        return PasswordResetResponse(message="Необходимо указать email", success=False)
    try:
        payload = PasswordResetRequest(email=email)
    except Exception:
        return PasswordResetResponse(message="Некорректный email", success=False)
    return await request_password_reset(payload, db)


@router.get("/zvonok/balance")
async def get_zvonok_balance():
    """Получение информации об аккаунте Zvonok (без секретов)."""
    try:
        from services.zvonok_service import zvonok_service
        mode = "stub" if getattr(zvonok_service, "_stub_mode", False) else "live"
        return {
            "success": True,
            "service": "Zvonok",
            "mode": mode,
            "message": "Сервис Zvonok активен"
        }
    except Exception as e:
        print(f"Ошибка получения информации об аккаунте Zvonok: {e}")
        return {
            "success": False,
            "message": "Внутренняя ошибка сервера"
        }


@router.post("/request-reverse-phone-verification", response_model=PhoneVerificationResponse)
async def request_reverse_phone_verification(request: PhoneVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на верификацию телефона через обратный FlashCall (для мобильных устройств)"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return PhoneVerificationResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )
        
        # Генерируем код верификации
        verification_code = VerificationService.generate_verification_code()
        
        # Сохраняем код в базе данных
        user.phone_verification_code = verification_code
        user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
        db.commit()
        
        # Инициируем обычный звонок через Zvonok (reverse flashcall не поддерживается)
        call_result = zvonok_service.send_verification_call(request.phone)
        
        if call_result["success"]:
            return PhoneVerificationResponse(
                message="Звонок для верификации инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
                success=True,
                call_id=call_result.get("call_id")
            )
        else:
            return PhoneVerificationResponse(
                message=f"Ошибка инициации обратного FlashCall: {call_result['message']}",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса обратной верификации телефона: {e}")
        return PhoneVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/check-reverse-phone-verification", response_model=VerifyPhoneResponse)
async def check_reverse_phone_verification(request: dict, db: Session = Depends(get_db)):
    """Проверка статуса обратного FlashCall верификации"""
    try:
        call_id = request.get("call_id")
        phone = request.get("phone")
        
        if not call_id or not phone:
            return VerifyPhoneResponse(
                message="Необходимо указать call_id и phone",
                success=False
            )
        
        # Проверяем статус звонка через Zvonok
        status_result = zvonok_service.check_call_status(call_id)
        
        if status_result["success"] and status_result.get("verified"):
            # Ищем пользователя по телефону
            user = db.query(User).filter(User.phone == phone).first()
            if not user:
                return VerifyPhoneResponse(
                    message="Пользователь с таким номером телефона не найден",
                    success=False
                )
            
            # Отмечаем телефон как верифицированный
            user.is_phone_verified = True
            user.phone_verification_code = None
            user.phone_verification_expires = None
            db.commit()
            
            return VerifyPhoneResponse(
                message="Телефон успешно верифицирован через обратный FlashCall",
                success=True,
                user_id=user.id
            )
        else:
            return VerifyPhoneResponse(
                message="Верификация еще не завершена или произошла ошибка",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка проверки обратной верификации телефона: {e}")
        return VerifyPhoneResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.get("/users/search", response_model=List[UserSchema])
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Поиск пользователей по номеру телефона"""
    if not q or len(q) < 7:
        raise HTTPException(status_code=400, detail="Query must be at least 7 characters long")
    
    # Ищем пользователей только по номеру телефона
    users = db.query(User).filter(
        User.is_active == True,
        User.id != current_user.id,  # Исключаем текущего пользователя
        User.phone.ilike(f"%{q}%")
    ).limit(10).all()
    
    return users

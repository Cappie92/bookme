import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Any, List, Optional
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    get_current_active_user,
    get_password_hash,
    verify_password,
)
from database import get_db
from models import User, Master, Booking, UserRole, EmailVerification, UserOAuthAccount
from schemas import LoginRequest, Token, ChangePasswordRequest, SetPasswordRequest, MessageOut
from schemas import User as UserSchema
from schemas import UserCreate, VerifyRequest
from services.verification_service import VerificationService
from services.zvonok_service import zvonok_service
from services.demo_master_seed import ensure_demo_master_exists
from services.promo_engine import PromoEngineError, create_pending_redemption, normalize_promo_code
from settings import get_settings
from sms import verify_sms_code
from schemas import (
    EmailVerificationRequest, EmailVerificationResponse,
    PasswordResetRequest, PasswordResetResponse,
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
_oauth_ticket_memory_store: dict[str, dict] = {}


class OAuthExchangeRequest(BaseModel):
    ticket: str


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


def _create_oauth_state(mode: str = "login", user_id: Optional[int] = None, return_to: Optional[str] = None) -> str:
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
        if mode == "link" and not int(data.get("user_id") or 0):
            raise ValueError("missing link user")
        return data
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительная OAuth-сессия")


def _issue_tokens_for_user(user: User) -> dict:
    token_sub = (user.phone or "").strip() or (user.email or "").strip()
    if not token_sub:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="У пользователя нет идентификатора для токена")
    access_token = create_access_token(
        data={"sub": token_sub, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": token_sub, "role": user.role.value.upper()})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


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


def _user_from_yandex_profile(db: Session, profile: dict) -> User:
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
        account.email = email
        account.updated_at = datetime.utcnow()
        _assign_yandex_phone_if_empty(db, account.user, yandex_phone)
        db.commit()
        db.refresh(account.user)
        return account.user

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=None,
            full_name=name or None,
            hashed_password=None,
            role=UserRole.CLIENT,
            is_active=True,
            is_verified=True,
            is_phone_verified=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()
    elif name and not user.full_name:
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

    token_sub = user.phone if user.phone else str(user.id)
    access_token = create_access_token(
        data={"sub": token_sub, "role": user.role.value.upper(), "demo": True},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": token_sub, "role": user.role.value.upper(), "demo": True})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


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
    state = _create_oauth_state(mode="link", user_id=current_user.id, return_to=safe_return_to)
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
            ticket = _store_oauth_ticket(user.id, purpose="oauth_login")
            query = urlencode({"ticket": ticket})
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


@router.post(
    "/register",
    response_model=Token,
    summary="Регистрация нового пользователя",
    responses={
        400: {"description": "Email или телефон уже заняты / не указаны город и часовой пояс для мастера"},
        422: {"description": "Ошибка валидации тела запроса"},
    },
)
async def register(user_in: UserCreate, db: Session = Depends(get_db)) -> Any:
    """
    Регистрация нового пользователя.

    - **email**: Email пользователя
    - **phone**: Номер телефона
    - **password**: Пароль
    - **role**: Роль пользователя (client, master, salon, admin)
    """
    promo_code = (user_in.promo_code or "").strip()
    if promo_code and user_in.role != UserRole.MASTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промокод доступен только при регистрации мастера",
        )

    if promo_code:
        try:
            promo_code = normalize_promo_code(promo_code)
        except PromoEngineError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": exc.code, "message": exc.message})

    if user_in.email:
        user = db.query(User).filter(User.email == user_in.email).first()
        if user:
            raise HTTPException(status_code=400, detail="Email already registered")

    # Проверяем, не занят ли телефон
    phone_user = db.query(User).filter(User.phone == user_in.phone).first()
    if phone_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    master = None
    if user_in.role == UserRole.MASTER:
        city = (user_in.city or "").strip()
        tz = (user_in.timezone or "").strip()
        if not city or not tz:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для регистрации мастера укажите город. Часовой пояс определяется автоматически.",
            )

    # Создаем пользователя с неподтвержденным email и телефоном
    print(f"🔍 [REGISTER] Начало создания пользователя: email={user_in.email}, phone={user_in.phone}, role={user_in.role}")
    try:
        user = User(
            email=user_in.email,
            phone=user_in.phone,
            hashed_password=get_password_hash(user_in.password),
            role=user_in.role,
            is_active=True,  # Пользователь активен
            is_verified=False,  # Email не подтвержден
            is_phone_verified=False,  # Телефон не подтвержден
            full_name=user_in.full_name,
            birth_date=user_in.birth_date,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(user)
        print(f"🔍 [REGISTER] Пользователь добавлен в сессию, выполняю commit...")
        db.commit()
        print(f"🔍 [REGISTER] Commit выполнен успешно")
        db.refresh(user)
        print(f"✅ [REGISTER] Пользователь создан: id={user.id}, email={user.email}, phone={user.phone}, role={user.role}")
    except Exception as e:
        db.rollback()
        print(f"❌ [REGISTER] Ошибка создания пользователя: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка создания пользователя: {str(e)}")

    # Если пользователь регистрируется как мастер, создаем профиль мастера
    if user_in.role == UserRole.MASTER:
        city = (user_in.city or "").strip()
        tz = (user_in.timezone or "").strip()
        timezone_confirmed = bool(city and tz)
        master = Master(
            user_id=user.id,
            bio="",
            experience_years=0,
            can_work_independently=True,
            can_work_in_salon=True,
            website=None,
            created_at=datetime.utcnow(),
            city=city,
            timezone=tz,
            timezone_confirmed=timezone_confirmed,
        )
        db.add(master)
        db.commit()
        db.refresh(master)

        from utils.base62 import generate_unique_domain
        master.domain = generate_unique_domain(master.id, db)
        db.commit()

        if promo_code:
            try:
                create_pending_redemption(db, master.id, promo_code)
                db.commit()
            except PromoEngineError as exc:
                db.rollback()
                try:
                    db.delete(master)
                    db.delete(user)
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": exc.code, "message": exc.message},
                )
            except Exception as exc:
                db.rollback()
                try:
                    db.delete(master)
                    db.delete(user)
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(status_code=500, detail=f"Ошибка применения промокода: {str(exc)}")

    # Отправляем письмо верификации email (та же сессия db, что и при создании пользователя)
    try:
        await VerificationService.send_verification_email(user, db)
    except Exception as e:
        print(f"Ошибка отправки письма верификации: {e}")
        # Не прерываем регистрацию, если письмо не отправилось

    # Звонок для верификации телефона будет отправлен по запросу пользователя
    # через /api/auth/request-phone-verification

    # Генерируем токены для входа (sub как в login: телефон, если email нет)
    token_sub = (user.email or "").strip() or user.phone
    access_token = create_access_token(
        data={"sub": token_sub, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": token_sub, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "is_verified": user.is_verified,
            "is_phone_verified": user.is_phone_verified,
        }
    }


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

    # Генерируем токены
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post(
    "/login",
    response_model=Token,
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

    # Используем phone вместо email для sub, так как phone всегда есть, а email может отсутствовать
    token_sub = user.phone if user.phone else str(user.id)
    access_token = create_access_token(
        data={"sub": token_sub, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": token_sub, "role": user.role.value.upper()})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


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
        sub: str = payload.get("sub")
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    # Логин кладёт в sub телефон (user.phone); ищем пользователя по email или по телефону
    if "@" in sub:
        user = db.query(User).filter(User.email == sub).first()
    else:
        user = db.query(User).filter(User.phone == sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    token_sub = user.phone if user.phone else str(user.id)
    access_token = create_access_token(
        data={"sub": token_sub, "role": user.role.value.upper()},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_refresh_token = create_refresh_token(
        data={"sub": token_sub, "role": user.role.value.upper()}
    )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


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
    
    # Хешируем новый пароль
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.utcnow()
    
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
    
    current_user.hashed_password = get_password_hash(password_data.password)
    current_user.updated_at = datetime.utcnow()
    db.commit()
    
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
    """
    try:
        # Проверяем код верификации
        if (current_user.phone_verification_code == code and 
            current_user.phone_verification_expires and 
            current_user.phone_verification_expires > datetime.utcnow()):
            
            # Удаляем все бронирования пользователя
            bookings = db.query(Booking).filter(Booking.client_id == current_user.id).all()
            for booking in bookings:
                db.delete(booking)
            
            # Удаляем профиль мастера, если есть
            if current_user.master_profile:
                db.delete(current_user.master_profile)
            
            # Удаляем профиль салона, если есть
            if current_user.salon_profile:
                db.delete(current_user.salon_profile)
            
            # Удаляем профиль независимого мастера, если есть
            if current_user.indie_profile:
                db.delete(current_user.indie_profile)
            
            # Очищаем код верификации
            current_user.phone_verification_code = None
            current_user.phone_verification_expires = None
            
            # Удаляем самого пользователя
            db.delete(current_user)
            db.commit()
            
            return {"message": "Аккаунт успешно удален"}
        else:
            return {
                "message": "Неверный код или код истек",
                "success": False
            }
            
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
        success = await VerificationService.send_password_reset_email(user)
        
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


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Сброс пароля по токену"""
    try:
        # Проверяем токен
        user = VerificationService.verify_password_reset_token(request.token, db)
        
        if not user:
            return ResetPasswordResponse(
                message="Недействительный или истекший токен",
                success=False
            )
        
        # Хешируем новый пароль
        hashed_password = get_password_hash(request.new_password)
        user.hashed_password = hashed_password
        db.commit()
        
        return ResetPasswordResponse(
            message="Пароль успешно изменен",
            success=True,
            user_id=user.id
        )
        
    except Exception as e:
        print(f"Ошибка сброса пароля: {e}")
        return ResetPasswordResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/reset-password-by-phone", response_model=ResetPasswordResponse)
async def reset_password_by_phone(request: ResetPasswordByPhoneRequest, db: Session = Depends(get_db)):
    """Сброс пароля после верификации по звонку (call_id + digits)."""
    try:
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return ResetPasswordResponse(message="Пользователь не найден", success=False)
        verification_result = zvonok_service.verify_phone_digits(request.call_id, request.phone_digits)
        if not (verification_result.get("success") and verification_result.get("verified")):
            return ResetPasswordResponse(
                message=verification_result.get("message", "Неверный код верификации"),
                success=False
            )
        hashed_password = get_password_hash(request.new_password)
        user.hashed_password = hashed_password
        user.password_reset_code = None
        user.password_reset_expires = None
        db.commit()
        return ResetPasswordResponse(message="Пароль успешно изменен", success=True, user_id=user.id)
    except Exception as e:
        print(f"Ошибка сброса пароля по телефону: {e}")
        return ResetPasswordResponse(message="Внутренняя ошибка сервера", success=False)


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


@router.post("/request-phone-verification", response_model=PhoneVerificationResponse)
async def request_phone_verification(request: PhoneVerificationRequest, db: Session = Depends(get_db)):
    """Запрос на верификацию телефона через звонок"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return PhoneVerificationResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )
        
        # Инициируем звонок через Zvonok (без генерации кода)
        call_result = zvonok_service.send_verification_call(request.phone)
        
        if call_result["success"]:
            # Сохраняем pincode/expiry/attempts для безопасной проверки на backend
            pin_raw = str(
                call_result.get("pincode")
                or call_result.get("verification_number")
                or ""
            ).strip() or None
            user.phone_verification_code = pin_raw
            user.phone_verification_call_id = str(call_result.get("call_id") or "").strip() or None
            user.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
            user.phone_verification_attempts = 0
            user.phone_verification_target_phone = user.phone
            user.phone_verification_purpose = "signup"
            db.commit()
            from settings import get_settings
            stub = get_settings().zvonok_stub
            return PhoneVerificationResponse(
                message="Звонок для верификации инициирован. Введите последние 4 цифры номера, с которого вам звонят.",
                success=True,
                call_id=call_result.get("call_id"),
                verification_number=pin_raw if stub else None,
            )
        else:
            error_message = call_result.get('error', 'Неизвестная ошибка')
            return PhoneVerificationResponse(
                message=f"Ошибка инициации звонка: {error_message}",
                success=False
            )
            
    except Exception as e:
        print(f"Ошибка запроса верификации телефона: {e}")
        return PhoneVerificationResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/verify-phone", response_model=VerifyPhoneResponse)
async def verify_phone(request: VerifyPhoneRequest, db: Session = Depends(get_db)):
    """Верификация телефона по коду"""
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == request.phone).first()
        if not user:
            return VerifyPhoneResponse(
                message="Пользователь с таким номером телефона не найден",
                success=False
            )

        # Безопасная backend-проверка: сверяем введённые 4 цифры с pincode, сохранённым при flashcall.
        if not user.phone_verification_code or not user.phone_verification_expires:
            return VerifyPhoneResponse(message="Верификация не инициирована", success=False)
        if user.phone_verification_expires <= datetime.utcnow():
            return VerifyPhoneResponse(message="Код истёк. Запросите звонок ещё раз.", success=False)
        if user.phone_verification_call_id and str(user.phone_verification_call_id) != str(request.call_id):
            return VerifyPhoneResponse(message="Неверная сессия верификации. Запросите звонок ещё раз.", success=False)
        attempts = int(user.phone_verification_attempts or 0)
        if attempts >= 5:
            return VerifyPhoneResponse(message="Превышено число попыток. Запросите звонок ещё раз.", success=False)
        if str(user.phone_verification_code) != str(request.phone_digits):
            user.phone_verification_attempts = attempts + 1
            db.commit()
            return VerifyPhoneResponse(message="Неверные цифры номера телефона", success=False)

        # Успех
        user.is_phone_verified = True
        user.phone_verification_code = None
        user.phone_verification_call_id = None
        user.phone_verification_expires = None
        user.phone_verification_attempts = 0
        user.phone_verification_target_phone = None
        user.phone_verification_purpose = None
        db.commit()

        return VerifyPhoneResponse(message="Телефон успешно верифицирован", success=True, user_id=user.id)
            
    except Exception as e:
        print(f"Ошибка верификации телефона: {e}")
        return VerifyPhoneResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


@router.post("/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(request: dict, db: Session = Depends(get_db)):
    """Универсальный endpoint для восстановления пароля (email или телефон)"""
    try:
        phone = request.get("phone")
        email = request.get("email")
        
        if not phone and not email:
            return PasswordResetResponse(
                message="Необходимо указать телефон или email",
                success=False
            )
        
        # Ищем пользователя
        user = None
        if phone:
            user = db.query(User).filter(User.phone == phone).first()
        elif email:
            user = db.query(User).filter(User.email == email).first()
        
        if not user:
            return PasswordResetResponse(
                message="Пользователь не найден",
                success=False
            )
        
        # Если указан телефон, используем звонок
        if phone:
            # Генерируем код для сброса пароля
            reset_code = VerificationService.generate_verification_code()
            user.password_reset_code = reset_code
            user.password_reset_expires = datetime.utcnow() + timedelta(minutes=10)
            db.commit()
            
            # Инициируем звонок (FlashCall - пользователь вводит последние 4 цифры номера)
            call_result = zvonok_service.send_verification_call(phone)
            
            if call_result["success"]:
                return PasswordResetResponse(
                    message="Звонок с кодом для сброса пароля инициирован",
                    success=True,
                    call_id=call_result.get("call_id")
                )
            else:
                return PasswordResetResponse(
                    message=f"Ошибка инициации звонка: {call_result['message']}",
                    success=False
                )
        
        # Если указан email, используем email
        elif email:
            success = await VerificationService.send_password_reset_email(user)
            
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
        print(f"Ошибка восстановления пароля: {e}")
        return PasswordResetResponse(
            message="Внутренняя ошибка сервера",
            success=False
        )


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

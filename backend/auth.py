from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserRole
from schemas import TokenData
from settings import get_settings

_conf = get_settings()
SECRET_KEY = _conf.JWT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = _conf.ACCESS_TOKEN_EXPIRE_DAYS
REFRESH_TOKEN_EXPIRE_DAYS = _conf.REFRESH_TOKEN_EXPIRE_DAYS
ACCESS_TOKEN_EXPIRE_MINUTES = ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
http_bearer_optional = HTTPBearer(auto_error=False)
signup_phone_verification_bearer = HTTPBearer()

SIGNUP_PHONE_VERIFICATION_PURPOSE = "signup_phone_verification"
SIGNUP_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES = 15
PASSWORD_RESET_PHONE_VERIFICATION_PURPOSE = "password_reset_phone_verification"
PASSWORD_RESET_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES = 5


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


NORMAL_ACCESS_TOKEN_TYPE = "access"
NORMAL_REFRESH_TOKEN_TYPE = "refresh"
NORMAL_SESSION_EXTRA_CLAIMS = ("web_session_origin", "demo")


def normal_session_claims(
    user: User,
    token_type: str,
    extra_claims: Optional[dict] = None,
) -> dict:
    """Canonical claims for normal access/refresh sessions only."""
    if token_type not in {NORMAL_ACCESS_TOKEN_TYPE, NORMAL_REFRESH_TOKEN_TYPE}:
        raise ValueError("invalid normal session token type")
    role = user.role.value if isinstance(user.role, UserRole) else str(user.role)
    data = {
        "sub": str(user.id),
        "role": role.upper(),
        "sv": int(user.session_version),
        "token_type": token_type,
    }
    if extra_claims:
        data.update(
            {
                claim: extra_claims[claim]
                for claim in NORMAL_SESSION_EXTRA_CLAIMS
                if extra_claims.get(claim) is not None
            }
        )
    return data


def normal_session_extra_claims(payload: dict) -> dict:
    return {
        claim: payload[claim]
        for claim in NORMAL_SESSION_EXTRA_CLAIMS
        if payload.get(claim) is not None
    }


def create_user_access_token(user: User, extra_claims: Optional[dict] = None) -> str:
    return create_access_token(
        data=normal_session_claims(user, NORMAL_ACCESS_TOKEN_TYPE, extra_claims)
    )


def create_user_refresh_token(user: User, extra_claims: Optional[dict] = None) -> str:
    return create_refresh_token(
        data=normal_session_claims(user, NORMAL_REFRESH_TOKEN_TYPE, extra_claims)
    )


def issue_tokens_for_user(user: User, extra_claims: Optional[dict] = None) -> dict:
    return {
        "access_token": create_user_access_token(user, extra_claims),
        "refresh_token": create_user_refresh_token(user, extra_claims),
        "token_type": "bearer",
    }


_UNSET: Any = object()


def update_password_and_revoke_sessions(
    db: Session,
    user: User,
    new_password: str,
    *,
    expected_hashed_password: Any = _UNSET,
) -> bool:
    """Atomically update password hash and increment the user's session version.

    The caller owns commit/rollback so related security artifacts can participate in
    the same DB transaction. Passing an expected hash (including ``None``) provides
    compare-and-swap semantics for concurrent change/set-password requests.
    """
    query = db.query(User).filter(User.id == user.id)
    if expected_hashed_password is not _UNSET:
        if expected_hashed_password is None:
            query = query.filter(User.hashed_password.is_(None))
        else:
            query = query.filter(User.hashed_password == expected_hashed_password)
    changed = query.update(
        {
            User.hashed_password: get_password_hash(new_password),
            User.session_version: User.session_version + 1,
            User.updated_at: datetime.utcnow(),
        },
        synchronize_session=False,
    )
    return changed == 1


def session_version_matches(payload: dict, user: User) -> bool:
    """Validate normal JWT version under explicit compatibility/strict policy."""
    if "sv" not in payload:
        if get_settings().jwt_session_version_required:
            return False
        sub = str(payload.get("sub") or "").strip()
        return bool(sub and sub.isdigit())
    token_version = payload.get("sv")
    if isinstance(token_version, bool) or not isinstance(token_version, int):
        return False
    return token_version == int(user.session_version)


def bearer_token_type_matches(payload: dict) -> bool:
    """Accept typed access, plus numeric untyped legacy bearer during rollout."""
    token_type = payload.get("token_type")
    if token_type == NORMAL_ACCESS_TOKEN_TYPE:
        return True
    if token_type is not None or get_settings().jwt_token_type_required:
        return False
    sub = str(payload.get("sub") or "").strip()
    return bool(sub and sub.isdigit())


def refresh_token_type_matches(payload: dict) -> bool:
    """Refresh never accepts untyped JWTs because historical access/refresh are ambiguous."""
    return payload.get("token_type") == NORMAL_REFRESH_TOKEN_TYPE


def create_signup_phone_verification_token(
    user_id: int,
    source_session_version: Optional[int] = None,
) -> str:
    """Restricted token only for a historical unverified account."""
    data = {
        "sub": str(user_id),
        "purpose": SIGNUP_PHONE_VERIFICATION_PURPOSE,
    }
    if source_session_version is not None:
        data["source_session_version"] = int(source_session_version)
    return create_access_token(
        data=data,
        expires_delta=timedelta(minutes=SIGNUP_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES),
    )


def decode_signup_phone_verification_token(token: str) -> int:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("purpose") != SIGNUP_PHONE_VERIFICATION_PURPOSE:
        raise JWTError("wrong signup phone verification purpose")
    sub = str(payload.get("sub") or "")
    if not sub.isdigit():
        raise JWTError("invalid signup phone verification subject")
    return int(sub)


def signup_phone_verification_version_matches(token: str, user: User) -> bool:
    """Bind legacy-account verification to the password state that issued it."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("purpose") != SIGNUP_PHONE_VERIFICATION_PURPOSE:
        return False
    source_version = payload.get("source_session_version")
    if isinstance(source_version, bool) or not isinstance(source_version, int):
        return False
    return source_version == int(user.session_version)


def create_password_reset_phone_verification_token(phone: str, challenge_id: str) -> str:
    """Restricted token for one password-reset phone challenge; never a login JWT."""
    return create_access_token(
        data={
            "sub": phone,
            "target": phone,
            "challenge_id": challenge_id,
            "purpose": PASSWORD_RESET_PHONE_VERIFICATION_PURPOSE,
        },
        expires_delta=timedelta(
            minutes=PASSWORD_RESET_PHONE_VERIFICATION_TOKEN_EXPIRE_MINUTES
        ),
    )


def decode_password_reset_phone_verification_token(token: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("purpose") != PASSWORD_RESET_PHONE_VERIFICATION_PURPOSE:
        raise JWTError("wrong password reset phone verification purpose")
    target = str(payload.get("target") or "")
    challenge_id = str(payload.get("challenge_id") or "")
    if not target or payload.get("sub") != target or not challenge_id:
        raise JWTError("invalid password reset phone verification token")
    return payload


def resolve_user_from_token_sub(db: Session, sub: Optional[str]) -> Optional[User]:
    """Resolve normal-session identity exclusively from numeric user.id."""
    if not sub:
        return None
    s = str(sub).strip()
    if not s.isdigit():
        return None
    return db.query(User).filter(User.id == int(s)).first()


def get_web_session_origin_from_payload(payload: Optional[dict]) -> Optional[str]:
    """Читает server-trusted claim web_session_origin из decoded JWT payload."""
    if not payload:
        return None
    origin = payload.get("web_session_origin")
    if origin is None:
        return None
    value = str(origin).strip()
    return value or None


def _reject_if_deleted_or_inactive(user: Optional[User]) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if user is None:
        raise credentials_exception
    if getattr(user, "deleted_at", None) is not None or not user.is_active:
        raise credentials_exception
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") or not bearer_token_type_matches(payload):
            raise credentials_exception
        sub: str = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = resolve_user_from_token_sub(db, sub)
    user = _reject_if_deleted_or_inactive(user)
    if not session_version_matches(payload, user):
        raise credentials_exception
    user.web_session_origin = get_web_session_origin_from_payload(payload)
    return user


async def get_current_user_optional(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer_optional),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Возвращает User при наличии валидного токена, иначе None."""
    if not creds or not creds.credentials:
        return None
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") or not bearer_token_type_matches(payload):
            return None
        sub = payload.get("sub")
        if not sub:
            return None
        user = resolve_user_from_token_sub(db, sub)
        if user is None or getattr(user, "deleted_at", None) is not None or not user.is_active:
            return None
        if not session_version_matches(payload, user):
            return None
        user.web_session_origin = get_web_session_origin_from_payload(payload)
        return user
    except JWTError:
        return None


async def get_signup_phone_verification_user(
    creds: HTTPAuthorizationCredentials = Depends(signup_phone_verification_bearer),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid signup phone verification token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_signup_phone_verification_token(creds.credentials)
    except JWTError:
        raise credentials_exception

    user = _reject_if_deleted_or_inactive(
        db.query(User).filter(User.id == user_id).first()
    )
    try:
        if not signup_phone_verification_version_matches(creds.credentials, user):
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return user


async def get_current_active_user(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active or getattr(current_user, "deleted_at", None) is not None:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Demo master: только read-only в кабинете (блокируем write даже при прямых API-вызовах)
    demo_phone = (get_settings().DEMO_MASTER_PHONE or "").strip()
    if demo_phone and current_user.phone == demo_phone:
        method = (request.method or "").upper()
        if method in {"POST", "PUT", "PATCH", "DELETE"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="В демо-режиме изменение данных недоступно",
            )
    return current_user


def require_role(role: UserRole):
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires role: {role}",
            )
        return current_user

    return role_checker


# Специфичные проверки ролей
require_client = require_role(UserRole.CLIENT)
require_master = require_role(UserRole.MASTER)
require_salon = require_role(UserRole.SALON)
require_indie = require_role(UserRole.INDIE)
require_admin = require_role(UserRole.ADMIN)
require_moderator = require_role(UserRole.MODERATOR)


def require_admin_or_moderator():
    async def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role not in [UserRole.ADMIN, UserRole.MODERATOR]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation requires admin or moderator role",
            )
        return current_user
    return role_checker


def require_moderator_permission(permission_name: str):
    async def permission_checker(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ):
        # Администраторы имеют все права
        if current_user.role == UserRole.ADMIN:
            return current_user
        
        # Проверяем только модераторов
        if current_user.role != UserRole.MODERATOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation requires moderator role",
            )
        
        # Проверяем права модератора
        from models import ModeratorPermissions
        permissions = db.query(ModeratorPermissions).filter(
            ModeratorPermissions.user_id == current_user.id
        ).first()
        
        if not permissions or not getattr(permissions, permission_name, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Moderator does not have permission: {permission_name}",
            )
        
        return current_user
    return permission_checker

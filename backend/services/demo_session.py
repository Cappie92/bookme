"""Pre-created demo identity and request-scoped, server-enforced readonly access."""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy import event
from sqlalchemy.orm import Session

from database import get_db
from models import Master, User, UserRole
from settings import get_settings

DEMO_TOKEN_TYPE = "demo_access"
DEMO_TTL_SECONDS = 15 * 60
READONLY_DETAIL = "В демо-режиме изменение данных недоступно"


def canonical_demo_user(db: Session) -> User:
    """Never discover/adopt identity by phone, repair data, or invoke seed tools."""
    conf = get_settings()
    user_id = conf.DEMO_MASTER_USER_ID
    phone = (conf.DEMO_MASTER_PHONE or "").strip()
    unavailable = HTTPException(503, "Демо временно недоступно. Попробуйте позже.")
    if not user_id or user_id <= 0 or not phone:
        raise unavailable
    user = db.query(User).filter(User.id == user_id).first()
    if (
        not user or user.phone != phone or user.role != UserRole.MASTER
        or not user.is_active or user.deleted_at is not None
        or not user.is_verified or not user.is_phone_verified or not user.is_always_free
    ):
        raise unavailable
    if db.query(User).filter(User.phone == phone).count() != 1:
        raise unavailable
    masters = db.query(Master).filter(Master.user_id == user.id).all()
    domain = f"demo-master-{user.id}"
    if (
        len(masters) != 1 or masters[0].domain != domain
        or masters[0].is_deleted or masters[0].deleted_at is not None
        or db.query(Master).filter(Master.domain == domain).count() != 1
    ):
        raise unavailable
    return user


def issue_demo_access(db: Session) -> dict:
    from auth import create_access_token

    user = canonical_demo_user(db)
    issued_at = datetime.utcnow()
    return {
        "access_token": create_access_token({
            "sub": str(user.id), "role": "MASTER", "sv": int(user.session_version),
            "token_type": DEMO_TOKEN_TYPE, "demo": True, "iat": issued_at,
        }, expires_delta=timedelta(seconds=DEMO_TTL_SECONDS)),
        "token_type": "bearer",
        "expires_in": DEMO_TTL_SECONDS,
    }


def is_demo_payload(payload: dict) -> bool:
    return "demo" in payload or payload.get("token_type") == DEMO_TOKEN_TYPE


def reject_ordinary_demo_identity(user_id, phone=None) -> None:
    # The legacy ops seed used a known password. Pinning this identity must also
    # reject old/ordinary sessions, not only sessions carrying demo=true.
    conf = get_settings()
    canonical_id = conf.DEMO_MASTER_USER_ID
    pinned = canonical_id and str(user_id) == str(canonical_id)
    # Missing config must not reopen the legacy known-password login. This is
    # a deny-only fence for the reserved demo phone, NEVER an identity grant.
    reserved_without_pin = (
        not canonical_id and phone and phone == (conf.DEMO_MASTER_PHONE or "").strip()
    )
    if pinned or reserved_without_pin:
        raise HTTPException(401, "Use readonly demo access")


def validate_demo_payload(payload: dict, db: Session) -> User:
    from auth import session_version_matches

    invalid = HTTPException(401, "Invalid demo session")
    try:
        user = canonical_demo_user(db)
        lifetime = payload["exp"] - payload["iat"]
        if (
            payload.get("demo") is not True or payload.get("token_type") != DEMO_TOKEN_TYPE
            or payload.get("sub") != str(user.id) or payload.get("role") != "MASTER"
            or payload.get("purpose") or payload.get("web_session_origin")
            or type(payload.get("sv")) is not int
            or type(payload.get("iat")) is not int or type(payload.get("exp")) is not int
            or payload["iat"] > datetime.now(timezone.utc).timestamp() + 5
            or not (0 < lifetime <= DEMO_TTL_SECONDS + 1)
            or not session_version_matches(payload, user)
        ):
            raise invalid
    except (HTTPException, KeyError, TypeError, ValueError):
        raise invalid
    return user


def _deny_flush(session, flush_context, instances):
    raise HTTPException(403, READONLY_DETAIL)


def _deny_nonselect(execute_state):
    if not execute_state.is_select:
        raise HTTPException(403, READONLY_DETAIL)


async def enforce_demo_readonly(request: Request, db: Session = Depends(get_db)):
    """Global API dependency: also covers optional/no-auth business handlers.

    Only a signed demo claim opts into this boundary. Anonymous verification
    tickets and ordinary sessions retain their existing route-level auth.
    Session listeners are request-scoped and never applied to ordinary sessions.
    """
    from auth import ALGORITHM, SECRET_KEY

    authorization = request.headers.get("authorization", "").split()
    payload = None
    signed = None
    if len(authorization) == 2 and authorization[0].lower() == "bearer":
        try:
            signed = jwt.decode(authorization[1], SECRET_KEY, algorithms=[ALGORITHM],
                                options={"verify_exp": False})
            if not is_demo_payload(signed):
                phone = None
                sub = str(signed.get("sub") or "")
                if not get_settings().DEMO_MASTER_USER_ID and sub.isdigit():
                    # Do not autobegin the handler's transaction. Some explicit
                    # admin/payment flows own db.begin() and authorize separately.
                    with Session(bind=db.get_bind(), autoflush=False) as identity_db:
                        phone = identity_db.query(User.phone).filter(User.id == int(sub)).scalar()
                reject_ordinary_demo_identity(sub, phone)
            if (
                request.url.path.rstrip("/") == "/api/auth/demo-master-access"
                and signed.get("web_session_origin") == "ios_app"
            ):
                raise HTTPException(403, "Demo unavailable in this session")
            if is_demo_payload(signed):
                payload = jwt.decode(authorization[1], SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            if signed is not None and is_demo_payload(signed):
                raise HTTPException(401, "Invalid demo session")
    if payload is None:
        yield
        return
    validate_demo_payload(payload, db)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        raise HTTPException(403, READONLY_DETAIL)
    # GETs that initiate provider/account/referral actions are not demo reads.
    path = request.url.path.rstrip("/")
    if (
        path.startswith("/api/payments/apple")
        or path == "/api/payments/robokassa/stub-complete"
        or path == "/api/master/referral-code"
        or path.startswith("/api/auth/yandex")
        or path.startswith("/api/client/bookings/temporary/")
    ):
        raise HTTPException(403, READONLY_DETAIL)
    db.info["demo_readonly"] = True
    event.listen(db, "before_flush", _deny_flush)
    event.listen(db, "do_orm_execute", _deny_nonselect)
    try:
        yield
    finally:
        event.remove(db, "before_flush", _deny_flush)
        event.remove(db, "do_orm_execute", _deny_nonselect)
        db.info.pop("demo_readonly", None)

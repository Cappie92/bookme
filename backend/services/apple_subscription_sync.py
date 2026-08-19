"""
Server-side Apple IAP entitlement sync via RevenueCat REST API.

Backend remains SSOT for Subscription / feature gates.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionType,
    User,
)
from services.apple_store_verification import VerifiedAppleTransaction
from settings import get_settings
from utils.apple_iap_products import (
    list_apple_iap_product_ids,
    resolve_apple_product_details,
)

logger = logging.getLogger(__name__)

KNOWN_PRODUCT_IDS = set(list_apple_iap_product_ids())

_PRICE_FIELDS = {
    1: "price_1month",
    3: "price_3months",
    6: "price_6months",
    12: "price_12months",
}


def _price_from_plan(
    plan: SubscriptionPlan,
    months: int,
    purchase: datetime,
    expires: datetime,
) -> Tuple[float, float]:
    field = _PRICE_FIELDS[int(months)]
    monthly = float(getattr(plan, field) or 0)
    total = monthly * int(months)
    days = max((expires - purchase).days, 1)
    daily = (total / days) if total else 0.0
    return total, daily


def ensure_app_account_token(db: Session, user: User) -> str:
    """Return the stable server-owned Apple appAccountToken for this user."""
    existing = getattr(user, "revenuecat_app_user_id", None)
    if existing:
        try:
            return str(UUID(str(existing)))
        except (TypeError, ValueError, AttributeError) as exc:
            raise HTTPException(
                status_code=409,
                detail="Stored Apple app account token is not a valid UUID",
            ) from exc

    for _attempt in range(3):
        new_id = str(uuid.uuid4())
        try:
            db.query(User).filter(
                User.id == user.id,
                User.revenuecat_app_user_id.is_(None),
            ).update(
                {User.revenuecat_app_user_id: new_id},
                synchronize_session=False,
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            db.refresh(user)
            if user.revenuecat_app_user_id:
                return str(UUID(str(user.revenuecat_app_user_id)))
            continue

        db.refresh(user)
        persisted = user.revenuecat_app_user_id
        if persisted:
            try:
                return str(UUID(str(persisted)))
            except (TypeError, ValueError, AttributeError) as exc:
                raise HTTPException(
                    status_code=409,
                    detail="Stored Apple app account token is not a valid UUID",
                ) from exc

    raise HTTPException(
        status_code=500,
        detail="Failed to initialize Apple app account token",
    )


# Temporary compatibility alias until the RevenueCat mobile path is removed.
ensure_revenuecat_app_user_id = ensure_app_account_token


def _parse_rc_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # RevenueCat uses ISO8601 with Z
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def fetch_revenuecat_subscriber(app_user_id: str) -> Dict[str, Any]:
    settings = get_settings()
    secret = (settings.REVENUECAT_SECRET_API_KEY or "").strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="RevenueCat secret API key is not configured",
        )
    base = (settings.REVENUECAT_API_BASE_URL or "https://api.revenuecat.com/v1").rstrip(
        "/"
    )
    url = f"{base}/subscribers/{app_user_id}"
    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.get(
                url,
                headers={
                    "Authorization": f"Bearer {secret}",
                    "Accept": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        logger.error("RevenueCat request failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Failed to reach RevenueCat"
        ) from exc

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="RevenueCat subscriber not found")
    if resp.status_code >= 400:
        logger.error("RevenueCat error %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(status_code=502, detail="RevenueCat returned an error")

    data = resp.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Invalid RevenueCat response")
    return data


def _pick_active_known_subscription(
    subscriber: Dict[str, Any],
) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Return (product_id, sub_payload) for the best active known product."""
    subs = (subscriber.get("subscriber") or {}).get("subscriptions") or {}
    if not isinstance(subs, dict):
        return None

    now = datetime.utcnow()
    best: Optional[Tuple[str, Dict[str, Any], datetime]] = None

    for product_id, payload in subs.items():
        if product_id not in KNOWN_PRODUCT_IDS:
            continue
        if not isinstance(payload, dict):
            continue
        expires = _parse_rc_datetime(payload.get("expires_date"))
        if expires is None or expires <= now:
            continue
        if payload.get("unsubscribe_detected_at") and expires <= now:
            continue
        if best is None or expires > best[2]:
            best = (product_id, payload, expires)

    if best is None:
        return None
    return best[0], best[1]


def _environment_from_payload(payload: Dict[str, Any]) -> str:
    if payload.get("is_sandbox") is True:
        return "sandbox"
    return "production"


def _idempotency_key(product_id: str, payload: Dict[str, Any]) -> str:
    store_tx = payload.get("store_transaction_id") or payload.get(
        "original_transaction_id"
    )
    if store_tx:
        return str(store_tx)[:128]
    # Fallback stable key when RC omits store transaction id
    original_purchase = (
        payload.get("original_purchase_date") or payload.get("purchase_date") or ""
    )
    return f"{product_id}:{original_purchase}"[:128]


def _resolve_plan(db: Session, plan_name: str) -> SubscriptionPlan:
    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.name == plan_name,
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.is_active == True,  # noqa: E712
        )
        .one_or_none()
    )
    if not plan:
        raise HTTPException(
            status_code=409,
            detail=f"Active MASTER SubscriptionPlan '{plan_name}' is not configured",
        )
    return plan


def get_active_non_apple_subscription(
    db: Session, user_id: int
) -> Optional[Subscription]:
    """Active subscription that is not Apple (legacy/default robokassa)."""
    now = datetime.utcnow()
    rows = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.is_active == True,  # noqa: E712
            Subscription.start_date <= now,
            Subscription.end_date > now,
            or_(
                Subscription.billing_provider.is_(None),
                Subscription.billing_provider != "apple",
            ),
        )
        .order_by(Subscription.end_date.desc())
        .all()
    )
    return rows[0] if rows else None


def _expire_other_active_apple_subs(
    db: Session,
    user_id: int,
    keep_subscription_id: Optional[int],
) -> None:
    q = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.billing_provider == "apple",
        Subscription.is_active == True,  # noqa: E712
    )
    if keep_subscription_id is not None:
        q = q.filter(Subscription.id != keep_subscription_id)
    for row in q.all():
        row.is_active = False
        row.status = SubscriptionStatus.EXPIRED
        db.add(row)


def _require_matching_app_account_token(user: User, verified_token: str) -> str:
    stored = getattr(user, "revenuecat_app_user_id", None)
    if not stored:
        raise HTTPException(
            status_code=409,
            detail="Apple billing identity has not been initialized",
        )
    try:
        stored_uuid = str(UUID(str(stored)))
        verified_uuid = str(UUID(str(verified_token)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=409,
            detail="Apple app account token is invalid",
        ) from exc
    if stored_uuid != verified_uuid:
        raise HTTPException(
            status_code=403,
            detail="Apple app account token does not match the authenticated user",
        )
    return stored_uuid


def upsert_verified_apple_subscription(
    db: Session,
    user: User,
    transaction: VerifiedAppleTransaction,
    *,
    now_utc: Optional[datetime] = None,
    authoritative_status_refresh: bool = False,
) -> Dict[str, Any]:
    """Upsert one verified Apple transaction without committing the DB session."""
    locked_user = (
        db.query(User)
        .filter(User.id == user.id)
        .populate_existing()
        .with_for_update()
        .one_or_none()
    )
    if locked_user is None:
        raise HTTPException(
            status_code=409, detail="Subscription owner no longer exists"
        )
    if locked_user.role.value not in ("master", "indie"):
        raise HTTPException(status_code=403, detail="Only masters can use Apple IAP")

    existing = (
        db.query(Subscription)
        .filter(
            Subscription.apple_original_transaction_id
            == transaction.original_transaction_id
        )
        .one_or_none()
    )
    if existing is not None and existing.user_id != user.id:
        raise HTTPException(
            status_code=409,
            detail="Apple transaction is already linked to another user",
        )

    _require_matching_app_account_token(
        locked_user,
        transaction.app_account_token,
    )
    same_transaction = (
        existing is not None
        and existing.apple_transaction_id == transaction.transaction_id
    )
    if (
        existing is not None
        and existing.end_date is not None
        and transaction.expires_date < existing.end_date
    ):
        return {
            "recorded": True,
            "active": bool(existing.is_active),
            "reason": "stale_verified_transaction_ignored",
            "conflict": existing.status == SubscriptionStatus.PENDING,
            "subscription_id": existing.id,
            "product_id": transaction.product_id,
            "plan_name": transaction.internal_plan_name,
            "external_tier": transaction.external_tier,
            "duration_months": transaction.duration_months,
            "transaction_id": transaction.transaction_id,
            "original_transaction_id": transaction.original_transaction_id,
            "environment": transaction.environment,
            "expires_date": existing.end_date.isoformat(),
            "revoked": existing.status == SubscriptionStatus.CANCELLED,
            "expired": existing.status == SubscriptionStatus.EXPIRED,
        }
    if (
        existing is not None
        and existing.end_date is not None
        and transaction.expires_date == existing.end_date
        and not same_transaction
        and not authoritative_status_refresh
    ):
        raise HTTPException(
            status_code=409,
            detail="apple_transaction_requires_status_refresh",
        )
    plan = _resolve_plan(db, transaction.internal_plan_name)
    now = now_utc or datetime.utcnow()
    is_revoked = transaction.is_revoked
    is_expired = transaction.is_expired_at(now)
    entitlement_active = not is_revoked and not is_expired
    non_apple = (
        get_active_non_apple_subscription(db, locked_user.id)
        if entitlement_active
        else None
    )
    conflict = non_apple is not None

    total_price, daily_rate = _price_from_plan(
        plan,
        transaction.duration_months,
        transaction.purchase_date,
        transaction.expires_date,
    )

    created = existing is None
    if existing is None:
        existing = Subscription(
            user_id=locked_user.id,
            subscription_type=SubscriptionType.MASTER,
            start_date=transaction.purchase_date,
            end_date=transaction.expires_date,
            price=total_price,
            daily_rate=daily_rate,
            payment_period="month",
            auto_renewal=True,
            plan_id=plan.id,
            billing_provider="apple",
            apple_original_transaction_id=transaction.original_transaction_id,
        )
    else:
        existing.start_date = min(
            existing.start_date or transaction.purchase_date,
            transaction.purchase_date,
        )

    existing.end_date = transaction.expires_date
    existing.price = total_price
    existing.daily_rate = daily_rate
    existing.plan_id = plan.id
    existing.billing_provider = "apple"
    existing.apple_transaction_id = transaction.transaction_id
    existing.apple_product_id = transaction.product_id
    existing.apple_environment = transaction.environment
    existing.payment_period = "month"

    if is_revoked:
        existing.status = SubscriptionStatus.CANCELLED
        existing.is_active = False
        reason = "revoked"
    elif is_expired:
        existing.status = SubscriptionStatus.EXPIRED
        existing.is_active = False
        reason = "expired"
    elif conflict:
        existing.status = SubscriptionStatus.PENDING
        existing.is_active = False
        reason = "blocked_by_active_non_apple_subscription"
    else:
        existing.status = SubscriptionStatus.ACTIVE
        existing.is_active = True
        reason = "created" if created else "updated"

    db.add(existing)
    db.flush()
    if existing.is_active:
        _expire_other_active_apple_subs(
            db,
            locked_user.id,
            keep_subscription_id=existing.id,
        )

    result: Dict[str, Any] = {
        "recorded": True,
        "active": bool(existing.is_active),
        "reason": reason,
        "conflict": conflict,
        "subscription_id": existing.id,
        "product_id": transaction.product_id,
        "plan_name": transaction.internal_plan_name,
        "external_tier": transaction.external_tier,
        "duration_months": transaction.duration_months,
        "transaction_id": transaction.transaction_id,
        "original_transaction_id": transaction.original_transaction_id,
        "environment": transaction.environment,
        "expires_date": transaction.expires_date.isoformat(),
        "revoked": is_revoked,
        "expired": is_expired,
    }
    if non_apple is not None:
        result.update(
            {
                "blocking_subscription_id": non_apple.id,
                "blocking_billing_provider": non_apple.billing_provider or "robokassa",
                "blocking_end_date": (
                    non_apple.end_date.isoformat() if non_apple.end_date else None
                ),
            }
        )
    return result


def sync_apple_entitlement_for_user(
    db: Session,
    user: User,
    *,
    expected_app_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch RevenueCat subscriber state and upsert DeDato Subscription.

    Idempotent on apple_original_transaction_id.
    """
    if user.role.value not in ("master", "indie"):
        raise HTTPException(
            status_code=403, detail="Only masters can sync Apple entitlements"
        )

    app_user_id = ensure_revenuecat_app_user_id(db, user)
    if expected_app_user_id and str(expected_app_user_id).strip() != app_user_id:
        raise HTTPException(
            status_code=403,
            detail="RevenueCat identity mismatch",
        )

    rc_data = fetch_revenuecat_subscriber(app_user_id)
    picked = _pick_active_known_subscription(rc_data)

    if picked is None:
        # Expire local Apple actives when no known product is active.
        # Robokassa remains untouched.
        _expire_other_active_apple_subs(db, user.id, keep_subscription_id=None)
        db.commit()
        return {
            "ok": True,
            "active": False,
            "reason": "no_active_apple_entitlement",
            "revenuecat_app_user_id": app_user_id,
            "subscription": None,
        }

    product_id, payload = picked
    product = resolve_apple_product_details(product_id)
    if product is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown Apple product: {product_id}"
        )

    expires = _parse_rc_datetime(payload.get("expires_date"))
    purchase = _parse_rc_datetime(payload.get("purchase_date")) or datetime.utcnow()
    if expires is None:
        expires = purchase + timedelta(days=30 * int(product.duration_months))

    original_tx = _idempotency_key(product_id, payload)
    store_tx = payload.get("store_transaction_id") or original_tx
    environment = _environment_from_payload(payload)
    transaction = VerifiedAppleTransaction(
        transaction_id=str(store_tx),
        original_transaction_id=original_tx,
        product_id=product.product_id,
        internal_plan_name=product.internal_plan_name,
        external_tier=product.external_tier,
        duration_months=product.duration_months,
        app_account_token=app_user_id,
        purchase_date=purchase,
        expires_date=expires,
        revocation_date=None,
        revocation_reason=None,
        environment=environment,
    )
    try:
        result = upsert_verified_apple_subscription(db, user, transaction)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "ok": True,
        "revenuecat_app_user_id": app_user_id,
        **result,
    }

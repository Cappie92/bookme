"""
Server-side Apple IAP entitlement sync via RevenueCat REST API.

Backend remains SSOT for Subscription / feature gates.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, User
from settings import get_settings
from utils.apple_iap_products import list_apple_iap_product_ids, resolve_apple_product

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


def ensure_revenuecat_app_user_id(db: Session, user: User) -> str:
    """Stable opaque UUID for RevenueCat; created once server-side."""
    existing = getattr(user, "revenuecat_app_user_id", None)
    if existing:
        return str(existing)
    new_id = str(uuid.uuid4())
    # Extremely unlikely collision; retry once.
    clash = db.query(User).filter(User.revenuecat_app_user_id == new_id).first()
    if clash:
        new_id = str(uuid.uuid4())
    user.revenuecat_app_user_id = new_id
    db.add(user)
    db.commit()
    db.refresh(user)
    return new_id


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
    base = (settings.REVENUECAT_API_BASE_URL or "https://api.revenuecat.com/v1").rstrip("/")
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
        raise HTTPException(status_code=502, detail="Failed to reach RevenueCat") from exc

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
    store_tx = payload.get("store_transaction_id") or payload.get("original_transaction_id")
    if store_tx:
        return str(store_tx)[:128]
    # Fallback stable key when RC omits store transaction id
    original_purchase = payload.get("original_purchase_date") or payload.get("purchase_date") or ""
    return f"{product_id}:{original_purchase}"[:128]


def _resolve_plan(db: Session, plan_name: str) -> SubscriptionPlan:
    plan = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.name == plan_name, SubscriptionPlan.is_active == True)  # noqa: E712
        .order_by(SubscriptionPlan.id.asc())
        .first()
    )
    if not plan:
        # Allow inactive AlwaysFree-style mismatches — still require exact name
        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.name == plan_name)
            .order_by(SubscriptionPlan.id.asc())
            .first()
        )
    if not plan:
        raise HTTPException(
            status_code=409,
            detail=f"SubscriptionPlan '{plan_name}' is not configured in database",
        )
    return plan


def get_active_non_apple_subscription(db: Session, user_id: int) -> Optional[Subscription]:
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
        raise HTTPException(status_code=403, detail="Only masters can sync Apple entitlements")

    app_user_id = ensure_revenuecat_app_user_id(db, user)
    if expected_app_user_id and str(expected_app_user_id).strip() != app_user_id:
        raise HTTPException(
            status_code=403,
            detail="RevenueCat identity mismatch",
        )

    rc_data = fetch_revenuecat_subscriber(app_user_id)
    picked = _pick_active_known_subscription(rc_data)

    if picked is None:
        # No active known Apple product — expire local apple actives; leave robokassa alone
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
    resolved = resolve_apple_product(product_id)
    if not resolved:
        raise HTTPException(status_code=400, detail=f"Unknown Apple product: {product_id}")

    plan_name, months = resolved
    plan = _resolve_plan(db, plan_name)

    expires = _parse_rc_datetime(payload.get("expires_date"))
    purchase = _parse_rc_datetime(payload.get("purchase_date")) or datetime.utcnow()
    if expires is None:
        expires = purchase + timedelta(days=30 * int(months))

    original_tx = _idempotency_key(product_id, payload)
    store_tx = payload.get("store_transaction_id") or original_tx
    environment = _environment_from_payload(payload)

    # Never deactivate Robokassa/non-apple. Do not activate overlapping Apple entitlement.
    non_apple = get_active_non_apple_subscription(db, user.id)
    if non_apple is not None:
        return {
            "ok": True,
            "active": False,
            "reason": "blocked_by_active_non_apple_subscription",
            "revenuecat_app_user_id": app_user_id,
            "product_id": product_id,
            "conflict": True,
            "blocking_subscription_id": non_apple.id,
            "blocking_billing_provider": non_apple.billing_provider or "robokassa",
            "blocking_end_date": non_apple.end_date.isoformat() if non_apple.end_date else None,
            "subscription": None,
            "message": "Active non-Apple subscription remains in force until its end date",
        }

    existing = (
        db.query(Subscription)
        .filter(Subscription.apple_original_transaction_id == original_tx)
        .first()
    )

    if existing:
        if existing.user_id != user.id:
            raise HTTPException(
                status_code=409,
                detail="Apple transaction already linked to another user",
            )
        existing.plan_id = plan.id
        existing.start_date = min(existing.start_date or purchase, purchase)
        existing.end_date = expires
        existing.status = SubscriptionStatus.ACTIVE
        existing.is_active = True
        existing.billing_provider = "apple"
        existing.apple_product_id = product_id
        existing.apple_transaction_id = str(store_tx)[:128] if store_tx else existing.apple_transaction_id
        existing.apple_environment = environment
        existing.payment_period = "month"
        total_price, daily_rate = _price_from_plan(plan, months, purchase, expires)
        existing.price = total_price
        existing.daily_rate = daily_rate
        db.add(existing)
        _expire_other_active_apple_subs(db, user.id, keep_subscription_id=existing.id)
        db.commit()
        db.refresh(existing)
        return {
            "ok": True,
            "active": True,
            "reason": "updated",
            "revenuecat_app_user_id": app_user_id,
            "product_id": product_id,
            "plan_name": plan_name,
            "duration_months": months,
            "subscription_id": existing.id,
        }

    total_price, daily_rate = _price_from_plan(plan, months, purchase, expires)

    sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        is_active=True,
        start_date=purchase,
        end_date=expires,
        price=total_price,
        daily_rate=daily_rate,
        payment_period="month",
        auto_renewal=True,
        plan_id=plan.id,
        billing_provider="apple",
        apple_original_transaction_id=original_tx,
        apple_transaction_id=str(store_tx)[:128] if store_tx else None,
        apple_product_id=product_id,
        apple_environment=environment,
    )
    db.add(sub)
    db.flush()
    _expire_other_active_apple_subs(db, user.id, keep_subscription_id=sub.id)
    db.commit()
    db.refresh(sub)
    return {
        "ok": True,
        "active": True,
        "reason": "created",
        "revenuecat_app_user_id": app_user_id,
        "product_id": product_id,
        "plan_name": plan_name,
        "duration_months": months,
        "subscription_id": sub.id,
    }

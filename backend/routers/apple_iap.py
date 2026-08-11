"""
Apple IAP (RevenueCat) billing identity + entitlement sync endpoints.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from services.apple_subscription_sync import (
    ensure_revenuecat_app_user_id,
    get_active_non_apple_subscription,
    sync_apple_entitlement_for_user,
)

router = APIRouter(
    prefix="/payments/apple",
    tags=["apple-iap"],
    responses={401: {"description": "Требуется авторизация"}},
)


class SyncEntitlementBody(BaseModel):
    expected_app_user_id: Optional[str] = Field(default=None)


def _require_master_or_indie(user: User) -> None:
    if user.role.value not in ("master", "indie"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apple IAP доступен только мастерам",
        )


@router.get("/billing-identity")
async def apple_billing_identity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ensure opaque RevenueCat app_user_id and return it to the client."""
    _require_master_or_indie(current_user)
    app_user_id = ensure_revenuecat_app_user_id(db, current_user)
    return {"revenuecat_app_user_id": app_user_id}


@router.get("/purchase-eligibility")
async def apple_purchase_eligibility(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Whether App Store purchase may proceed (no overlapping non-Apple sub)."""
    _require_master_or_indie(current_user)
    non_apple = get_active_non_apple_subscription(db, current_user.id)
    if non_apple is not None:
        return {
            "allowed": False,
            "reason": "blocked_by_active_non_apple_subscription",
            "blocking_end_date": non_apple.end_date.isoformat() if non_apple.end_date else None,
            "blocking_subscription_id": non_apple.id,
            "blocking_billing_provider": non_apple.billing_provider or "robokassa",
        }
    return {"allowed": True}


@router.post("/sync-entitlement")
async def apple_sync_entitlement(
    body: Optional[SyncEntitlementBody] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pull RevenueCat subscriber state and upsert local Subscription (SSOT)."""
    _require_master_or_indie(current_user)
    expected = body.expected_app_user_id if body else None
    return sync_apple_entitlement_for_user(
        db,
        current_user,
        expected_app_user_id=expected,
    )

"""Apple IAP identity, direct transaction verification, and legacy RC sync."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from services.apple_store_status import (
    AppleStoreStatusError,
    refresh_apple_subscriptions_for_user,
)
from services.apple_store_verification import (
    AppleStoreVerificationError,
    verify_apple_signed_transaction,
)
from services.apple_subscription_sync import (
    ensure_app_account_token,
    get_active_non_apple_subscription,
    sync_apple_entitlement_for_user,
    upsert_verified_apple_subscription,
)

router = APIRouter(
    prefix="/payments/apple",
    tags=["apple-iap"],
    responses={401: {"description": "Требуется авторизация"}},
)


class SyncEntitlementBody(BaseModel):
    expected_app_user_id: Optional[str] = Field(default=None)


class AppleTransactionSource(str, Enum):
    PURCHASE = "purchase"
    RESTORE = "restore"
    CURRENT_ENTITLEMENT = "current_entitlement"
    TRANSACTION_UPDATE = "transaction_update"


class VerifyTransactionBody(BaseModel):
    signed_transaction: str = Field(min_length=1)
    source: AppleTransactionSource


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
    """Ensure and return the stable server-owned Apple appAccountToken."""
    _require_master_or_indie(current_user)
    app_account_token = ensure_app_account_token(db, current_user)
    return {"app_account_token": app_account_token}


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
            "blocking_end_date": (
                non_apple.end_date.isoformat() if non_apple.end_date else None
            ),
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


@router.post("/transactions/verify")
def apple_verify_transaction(
    body: VerifyTransactionBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify an Apple JWS and atomically record its subscription entitlement."""
    _require_master_or_indie(current_user)
    try:
        transaction = verify_apple_signed_transaction(body.signed_transaction)
        result = upsert_verified_apple_subscription(db, current_user, transaction)
        db.commit()
    except AppleStoreVerificationError as exc:
        db.rollback()
        raise HTTPException(
            status_code=(status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else 400),
            detail=exc.code,
        ) from exc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record verified Apple transaction",
        ) from exc

    return {
        "verified": True,
        "recorded": True,
        "finish_transaction": True,
        "source": body.source.value,
        **result,
    }


@router.post("/subscriptions/refresh")
def apple_refresh_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Refresh recorded Apple subscriptions from App Store Server API status."""
    _require_master_or_indie(current_user)
    try:
        result = refresh_apple_subscriptions_for_user(db, current_user)
        db.commit()
    except AppleStoreStatusError as exc:
        db.rollback()
        raise HTTPException(
            status_code=(status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else 409),
            detail=exc.code,
        ) from exc
    except AppleStoreVerificationError as exc:
        db.rollback()
        raise HTTPException(
            status_code=(status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else 409),
            detail=exc.code,
        ) from exc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh Apple subscription status",
        ) from exc
    return {"verified": True, "recorded": True, **result}

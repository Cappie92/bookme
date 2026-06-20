from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_active_user
from database import get_db
from models import Master, PromoRewardType, SubscriptionPointsLedger, User, UserRole
from schemas import (
    CurrentPromoResponse,
    PromoApplyRequest,
    PromoApplyResponse,
    ReferralCodeResponse,
    SubscriptionPointsResponse,
)
from services.promo_engine import (
    DEFAULT_BENEFICIARY_POINTS_CONFIG,
    DEFAULT_REFERRER_POINTS_CONFIG,
    PromoEngineError,
    build_promo_apply_response,
    create_pending_redemption,
    ensure_master_referral_code,
    get_current_acquisition_redemption,
    get_referral_stats,
    get_subscription_points_balance,
    list_subscription_points_history,
    serialize_current_redemption,
)


router = APIRouter(
    prefix="/master",
    tags=["promo-engine"],
    responses={401: {"description": "Требуется авторизация"}},
)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _get_current_master(db: Session, current_user: User) -> Master:
    if current_user.role not in (UserRole.MASTER, UserRole.INDIE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Промокоды доступны только мастерам",
        )
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль мастера не найден")
    return master


def _promo_error(exc: PromoEngineError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/referral-code", response_model=ReferralCodeResponse)
def get_master_referral_code(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    master = _get_current_master(db, current_user)
    try:
        code = ensure_master_referral_code(db, master.id)
        db.commit()
        db.refresh(code)
    except PromoEngineError as exc:
        db.rollback()
        raise _promo_error(exc)

    return {
        "code": code.code,
        "share_text": f"Попробуйте DeDato с моим промокодом {code.code}",
        "share_url": f"https://dedato.ru/register?promo_code={code.code}",
        "beneficiary_bonus_rules": DEFAULT_BENEFICIARY_POINTS_CONFIG,
        "referrer_bonus_rules": DEFAULT_REFERRER_POINTS_CONFIG,
        "stats": get_referral_stats(db, master.id),
    }


@router.post("/promo-code/apply", response_model=PromoApplyResponse)
def apply_master_promo_code(
    payload: PromoApplyRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    master = _get_current_master(db, current_user)
    try:
        redemption = create_pending_redemption(db, master.id, payload.code)
        db.commit()
        db.refresh(redemption)
    except PromoEngineError as exc:
        db.rollback()
        raise _promo_error(exc)
    return build_promo_apply_response(redemption)


@router.get("/promo-code/current", response_model=CurrentPromoResponse)
def get_current_master_promo_code(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    master = _get_current_master(db, current_user)
    redemption = get_current_acquisition_redemption(db, master.id)
    return {"promo_code": serialize_current_redemption(redemption)}


@router.get("/subscription-points", response_model=SubscriptionPointsResponse)
def get_master_subscription_points(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    master = _get_current_master(db, current_user)
    items = []
    for entry in list_subscription_points_history(db, master.id):
        items.append(
            {
                "id": entry.id,
                "amount": entry.amount,
                "remaining_amount": entry.remaining_amount,
                "direction": _enum_value(entry.direction),
                "source_type": _enum_value(entry.source_type),
                "description": entry.description,
                "created_at": entry.created_at,
                "expires_at": entry.expires_at,
                "metadata": entry.extra_metadata or {},
                "promo": entry.extra_metadata if _enum_value(entry.source_type) == "promo_reward_grant" else None,
            }
        )
    return {
        "balance": get_subscription_points_balance(db, master.id),
        "items": items,
    }

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_active_user
from database import get_db
from models import User, PromoCode, PromoCodeActivation, Subscription, SubscriptionType, SubscriptionStatus, UserRole

router = APIRouter(
    prefix="/promo-codes",
    tags=["promo-codes"],
)


@router.post("/activate")
def activate_promo_code(
    code_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """Активация промо-кода пользователем"""
    
    code = code_data.get("code", "").strip().upper()
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промо-код не может быть пустым"
        )
    
    # Ищем промо-код
    promo_code = db.query(PromoCode).filter(PromoCode.code == code).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Проверяем активность промо-кода
    if not promo_code.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промо-код деактивирован"
        )
    
    # Проверяем срок действия
    now = datetime.utcnow()
    if promo_code.expires_at and promo_code.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промо-код истек"
        )
    
    # Проверяем лимит использований
    if promo_code.used_count >= promo_code.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промо-код исчерпан"
        )
    
    # Проверяем, что пользователь еще не активировал этот промо-код
    existing_activation = db.query(PromoCodeActivation).filter(
        PromoCodeActivation.promo_code_id == promo_code.id,
        PromoCodeActivation.user_id == current_user.id
    ).first()
    
    if existing_activation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже активировали этот промо-код"
        )
    
    # Проверяем, что промо-код подходит для роли пользователя
    if promo_code.subscription_type == SubscriptionType.MASTER and current_user.role not in [UserRole.MASTER, UserRole.INDIE]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот промо-код предназначен только для мастеров"
        )
    
    if promo_code.subscription_type == SubscriptionType.SALON and current_user.role != UserRole.SALON:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот промо-код предназначен только для салонов"
        )
    
    try:
        # Создаем активацию промо-кода
        activation = PromoCodeActivation(
            promo_code_id=promo_code.id,
            user_id=current_user.id,
            activated_at=now,
            subscription_start=now,
            subscription_end=now + timedelta(days=promo_code.subscription_duration_days),
            paid_after_expiry=False
        )
        
        # Увеличиваем счетчик использований
        promo_code.used_count += 1
        
        # Создаем или обновляем подписку пользователя
        subscription = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
        
        if subscription:
            # Обновляем существующую подписку
            subscription.subscription_type = promo_code.subscription_type
            subscription.status = SubscriptionStatus.ACTIVE
            subscription.start_date = now
            subscription.end_date = now + timedelta(days=promo_code.subscription_duration_days)
            subscription.auto_renewal = False  # Промо-коды не продлеваются автоматически
        else:
            # Создаем новую подписку
            subscription = Subscription(
                user_id=current_user.id,
                subscription_type=promo_code.subscription_type,
                status=SubscriptionStatus.ACTIVE,
                start_date=now,
                end_date=now + timedelta(days=promo_code.subscription_duration_days),
                auto_renewal=False,
                price=0,  # Промо-коды бесплатные
                daily_rate=0.0,  # Промо-коды бесплатные
                salon_branches=1 if promo_code.subscription_type == SubscriptionType.SALON else 0,
                salon_employees=0,
                master_bookings=100 if promo_code.subscription_type == SubscriptionType.MASTER else 0,
                payment_period=30,
                is_active=True
            )
            db.add(subscription)
        
        db.add(activation)
        db.commit()
        
        return {
            "message": "Промо-код успешно активирован!",
            "subscription_type": promo_code.subscription_type.value,
            "duration_days": promo_code.subscription_duration_days,
            "expires_at": (now + timedelta(days=promo_code.subscription_duration_days)).isoformat()
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка активации промо-кода: {str(e)}"
        )

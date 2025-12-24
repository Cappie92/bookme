from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import SubscriptionPlan, SubscriptionType
from schemas import SubscriptionPlanOut

router = APIRouter(
    prefix="/api/subscription-plans",
    tags=["subscription-plans-public"],
)


@router.get("/available", response_model=List[SubscriptionPlanOut])
def get_available_subscription_plans(
    subscription_type: str,
    db: Session = Depends(get_db),
) -> List[SubscriptionPlanOut]:
    """
    Получить список доступных планов подписки для пользователя (публичный эндпоинт).
    """
    try:
        sub_type = SubscriptionType(subscription_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный тип подписки: {subscription_type}"
        )
    
    plans = db.query(SubscriptionPlan).filter(
        and_(
            SubscriptionPlan.subscription_type == sub_type,
            SubscriptionPlan.is_active == True,
            SubscriptionPlan.name != "AlwaysFree"  # Скрываем план AlwaysFree из публичных списков
        )
    ).order_by(SubscriptionPlan.display_order, SubscriptionPlan.id).all()
    
    return plans


from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func as sa_func

from database import get_db
from models import SubscriptionPlan, SubscriptionType, ServiceFunction
from schemas import (
    SubscriptionPlanOut,
    SubscriptionPlanPricingCatalogResponse,
    PricingCatalogServiceFunctionItem,
)

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


@router.get(
    "/pricing-catalog",
    response_model=SubscriptionPlanPricingCatalogResponse,
)
def get_pricing_catalog(
    subscription_type: str,
    db: Session = Depends(get_db),
) -> SubscriptionPlanPricingCatalogResponse:
    """
    Данные для публичной страницы тарифов: активные планы + активные subscription service_functions.
    Без авторизации; не дублирует бизнес-логику оплаты.
    """
    try:
        sub_type = SubscriptionType(subscription_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный тип подписки: {subscription_type}",
        )

    plans = db.query(SubscriptionPlan).filter(
        and_(
            SubscriptionPlan.subscription_type == sub_type,
            SubscriptionPlan.is_active == True,
            SubscriptionPlan.name != "AlwaysFree",
        )
    ).order_by(SubscriptionPlan.display_order, SubscriptionPlan.id).all()

    sf_query = db.query(ServiceFunction).filter(
        sa_func.upper(ServiceFunction.function_type) == "SUBSCRIPTION",
        ServiceFunction.is_active == True,
    )
    service_functions = sf_query.order_by(
        ServiceFunction.display_order, ServiceFunction.id
    ).all()

    return SubscriptionPlanPricingCatalogResponse(
        plans=plans,
        service_functions=[
            PricingCatalogServiceFunctionItem(
                id=fn.id,
                name=fn.name,
                display_name=fn.display_name,
                description=fn.description,
                display_order=fn.display_order or 0,
            )
            for fn in service_functions
        ],
    )


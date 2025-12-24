from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from auth import require_admin
from database import get_db
from models import SubscriptionPlan, SubscriptionType, ServiceFunction, ServiceType
from schemas import (
    SubscriptionPlanCreate,
    SubscriptionPlanUpdate,
    SubscriptionPlanOut
)

router = APIRouter(
    prefix="/api/admin/subscription-plans",
    tags=["subscription-plans"],
    dependencies=[Depends(require_admin)],
)


def validate_service_functions(db: Session, service_function_ids: List[int]) -> None:
    """
    Валидировать service_functions: проверить, что все существуют, активны и имеют тип SUBSCRIPTION.
    """
    if not service_function_ids:
        return
    
    functions = db.query(ServiceFunction).filter(
        ServiceFunction.id.in_(service_function_ids)
    ).all()
    
    found_ids = {f.id for f in functions}
    missing_ids = set(service_function_ids) - found_ids
    
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service functions с ID {missing_ids} не найдены"
        )
    
    inactive_functions = [f for f in functions if not f.is_active]
    if inactive_functions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service functions с ID {[f.id for f in inactive_functions]} неактивны"
        )
    
    # В service_functions.function_type храним строку в верхнем регистре (FREE / SUBSCRIPTION / VOLUME_BASED)
    wrong_type_functions = [f for f in functions if f.function_type != ServiceType.SUBSCRIPTION.name]
    if wrong_type_functions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Service functions с ID {[f.id for f in wrong_type_functions]} не имеют тип SUBSCRIPTION"
        )


def disable_service_functions_for_plan(db: Session, plan_id: int, removed_function_ids: List[int]) -> None:
    """
    Автоматически отключить удаленные service_functions для всех мастеров с этим планом.
    В реальности функции автоматически станут недоступны при следующей проверке через план,
    но можно добавить логирование для отслеживания изменений.
    """
    if not removed_function_ids:
        return
    
    from models import Subscription, SubscriptionStatus
    from datetime import datetime
    
    # Находим все активные подписки на этот план
    active_subscriptions = db.query(Subscription).filter(
        and_(
            Subscription.plan_id == plan_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.end_date > datetime.utcnow()
        )
    ).all()
    
    # Логируем изменения (можно добавить в таблицу логов)
    for subscription in active_subscriptions:
        # Функции автоматически станут недоступны при следующей проверке через plan.features.service_functions
        # Здесь можно добавить логирование или отправку уведомлений
        pass


@router.get("", response_model=List[SubscriptionPlanOut])
def get_subscription_plans(
    subscription_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
) -> List[SubscriptionPlanOut]:
    """
    Получить список планов подписки.
    """
    query = db.query(SubscriptionPlan)
    
    if subscription_type:
        try:
            sub_type = SubscriptionType(subscription_type)
            query = query.filter(SubscriptionPlan.subscription_type == sub_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверный тип подписки: {subscription_type}"
            )
    
    if is_active is not None:
        query = query.filter(SubscriptionPlan.is_active == is_active)
    
    plans = query.order_by(SubscriptionPlan.display_order, SubscriptionPlan.id).all()
    return plans


@router.get("/{plan_id}", response_model=SubscriptionPlanOut)
def get_subscription_plan(
    plan_id: int,
    db: Session = Depends(get_db),
) -> SubscriptionPlanOut:
    """
    Получить план подписки по ID.
    """
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="План подписки не найден"
        )
    return plan


@router.post("", response_model=SubscriptionPlanOut, status_code=status.HTTP_201_CREATED)
def create_subscription_plan(
    plan_data: SubscriptionPlanCreate,
    db: Session = Depends(get_db),
) -> SubscriptionPlanOut:
    """
    Создать новый план подписки.
    """
    # Проверяем уникальность названия
    existing_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == plan_data.name
    ).first()
    if existing_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"План с названием '{plan_data.name}' уже существует"
        )
    
    # Проверяем тип подписки
    try:
        sub_type = SubscriptionType(plan_data.subscription_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный тип подписки: {plan_data.subscription_type}"
        )
    
    # Валидация цен: price_1month >= price_3months >= price_6months >= price_12months
    if plan_data.price_1month < plan_data.price_3months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц не может быть меньше цены за 1 месяц в пакете на 3 месяца"
        )
    if plan_data.price_3months < plan_data.price_6months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц в пакете на 3 месяца не может быть меньше цены за 1 месяц в пакете на 6 месяцев"
        )
    if plan_data.price_6months < plan_data.price_12months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц в пакете на 6 месяцев не может быть меньше цены за 1 месяц в пакете на 12 месяцев"
        )
    
    # Валидация service_functions
    features = plan_data.features or {}
    service_function_ids = features.get('service_functions', [])
    if service_function_ids:
        validate_service_functions(db, service_function_ids)
    
    plan = SubscriptionPlan(
        name=plan_data.name,
        display_name=plan_data.display_name,
        subscription_type=sub_type,
        price_1month=plan_data.price_1month,
        price_3months=plan_data.price_3months,
        price_6months=plan_data.price_6months,
        price_12months=plan_data.price_12months,
        features=features,
        limits=plan_data.limits or {},
        is_active=plan_data.is_active,
        display_order=plan_data.display_order
    )
    
    db.add(plan)
    db.commit()
    db.refresh(plan)
    
    return plan


@router.put("/{plan_id}", response_model=SubscriptionPlanOut)
def update_subscription_plan(
    plan_id: int,
    plan_data: SubscriptionPlanUpdate,
    db: Session = Depends(get_db),
) -> SubscriptionPlanOut:
    """
    Обновить план подписки.
    """
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="План подписки не найден"
        )
    
    # Сохраняем старый список service_functions для сравнения
    old_features = plan.features or {}
    old_service_function_ids = set(old_features.get('service_functions', []))
    
    # Проверяем уникальность названия, если оно изменяется
    if plan_data.name and plan_data.name != plan.name:
        existing_plan = db.query(SubscriptionPlan).filter(
            and_(
                SubscriptionPlan.name == plan_data.name,
                SubscriptionPlan.id != plan_id
            )
        ).first()
        if existing_plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"План с названием '{plan_data.name}' уже существует"
            )
        plan.name = plan_data.name
    
    # Обновляем остальные поля
    update_data = plan_data.dict(exclude_unset=True, exclude={'name'})
    
    # Валидация service_functions при обновлении
    if 'features' in update_data:
        new_features = update_data['features'] or {}
        new_service_function_ids = set(new_features.get('service_functions', []))
        
        # Валидируем новые service_functions
        if new_service_function_ids:
            validate_service_functions(db, list(new_service_function_ids))
        
        # Находим удаленные функции
        removed_function_ids = list(old_service_function_ids - new_service_function_ids)
        
        # Автоматически отключаем удаленные функции
        if removed_function_ids:
            disable_service_functions_for_plan(db, plan_id, removed_function_ids)
    
    if 'subscription_type' in update_data:
        try:
            plan.subscription_type = SubscriptionType(update_data['subscription_type'])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверный тип подписки: {update_data['subscription_type']}"
            )
    
    # Валидация цен при обновлении
    price_1month = update_data.get('price_1month', plan.price_1month)
    price_3months = update_data.get('price_3months', plan.price_3months)
    price_6months = update_data.get('price_6months', plan.price_6months)
    price_12months = update_data.get('price_12months', plan.price_12months)
    
    if price_1month < price_3months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц не может быть меньше цены за 1 месяц в пакете на 3 месяца"
        )
    if price_3months < price_6months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц в пакете на 3 месяца не может быть меньше цены за 1 месяц в пакете на 6 месяцев"
        )
    if price_6months < price_12months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Цена за 1 месяц в пакете на 6 месяцев не может быть меньше цены за 1 месяц в пакете на 12 месяцев"
        )
    
    for field, value in update_data.items():
        if field != 'subscription_type':
            setattr(plan, field, value)
    
    db.commit()
    db.refresh(plan)
    
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription_plan(
    plan_id: int,
    db: Session = Depends(get_db),
) -> None:
    """
    Удалить план подписки.
    """
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="План подписки не найден"
        )
    
    # Проверяем, есть ли активные подписки на этот план
    from models import Subscription
    active_subscriptions = db.query(Subscription).filter(
        Subscription.plan_id == plan_id
    ).count()
    
    if active_subscriptions > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Невозможно удалить план: существует {active_subscriptions} активных подписок на этот план"
        )
    
    db.delete(plan)
    db.commit()




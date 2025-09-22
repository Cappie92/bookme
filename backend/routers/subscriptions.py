from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import User, Subscription, SubscriptionType, SubscriptionStatus
from schemas import (
    SubscriptionCreate, 
    SubscriptionUpdate, 
    SubscriptionOut, 
    SubscriptionUpgradeRequest
)
from auth import get_current_user
from utils.balance_utils import (
    calculate_subscription_daily_rate,
    calculate_upgrade_cost,
    get_or_create_user_balance,
    withdraw_balance,
    rubles_to_kopecks,
    reserve_full_subscription_price
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/my", response_model=SubscriptionOut)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить текущую подписку пользователя"""
    
    # Определяем тип подписки на основе роли пользователя
    subscription_type = None
    if current_user.role.value in ['salon']:
        subscription_type = SubscriptionType.SALON
    elif current_user.role.value in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Только салоны и мастера могут иметь подписки"
        )
    
    # Ищем активную подписку
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == current_user.id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE
        )
    ).first()
    
    if not subscription:
        # Создаем базовую подписку если её нет
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=30)
        price = 0.0
        daily_rate = 0.0
        
        subscription = Subscription(
            user_id=current_user.id,
            subscription_type=subscription_type,
            status=SubscriptionStatus.ACTIVE,
            salon_branches=1 if subscription_type == SubscriptionType.SALON else 0,
            salon_employees=0 if subscription_type == SubscriptionType.SALON else 0,
            master_bookings=0 if subscription_type == SubscriptionType.MASTER else 0,
            start_date=start_date,
            end_date=end_date,
            price=price,
            daily_rate=daily_rate,
            is_active=True,
            auto_renewal=True,
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
    
    # Преобразуем объект Subscription в формат SubscriptionOut
    return {
        "id": subscription.id,
        "user_id": subscription.user_id,
        "subscription_type": subscription.subscription_type.value,
        "status": subscription.status.value,
        "salon_branches": subscription.salon_branches,
        "salon_employees": subscription.salon_employees,
        "master_bookings": subscription.master_bookings,
        "end_date": subscription.end_date,
        "price": subscription.price,
        "auto_renewal": subscription.auto_renewal,
        "payment_method": "card",
    }


@router.post("/upgrade", response_model=SubscriptionOut)
async def upgrade_subscription(
    upgrade_request: SubscriptionUpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновить подписку пользователя"""
    
    # Определяем тип подписки
    subscription_type = None
    if current_user.role.value in ['salon']:
        subscription_type = SubscriptionType.SALON
    elif current_user.role.value in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Только салоны и мастера могут иметь подписки"
        )
    
    # Проверяем соответствие типа подписки
    if upgrade_request.subscription_type != subscription_type.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Тип подписки не соответствует роли пользователя"
        )
    
    # Ищем текущую активную подписку
    current_subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == current_user.id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE
        )
    ).first()
    
    # Рассчитываем новую стоимость
    from routers.admin import calculate_price
    
    price_data = {
        "clientType": subscription_type.value,
        "paymentPeriod": upgrade_request.payment_period
    }
    
    if subscription_type == SubscriptionType.SALON:
        price_data.update({
            "branchCount": str(upgrade_request.salon_branches or 1),
            "employeeCount": upgrade_request.salon_employees or 0
        })
    else:
        price_data.update({
            "monthlyBookings": upgrade_request.master_bookings or 0
        })
    
    calculated_price = calculate_price(price_data)
    
    # Определяем период действия
    if upgrade_request.payment_period == 'year':
        end_date = datetime.utcnow() + timedelta(days=365)
    else:
        end_date = datetime.utcnow() + timedelta(days=30)
    
    start_date = datetime.utcnow()
    total_price = calculated_price['total_price']
    
    # Рассчитываем дневную ставку
    total_days = (end_date - start_date).days
    daily_rate = total_price / total_days if total_days > 0 else 0
    
    # Если есть текущая подписка, рассчитываем стоимость обновления
    additional_payment = 0
    if current_subscription:
        upgrade_calculation = calculate_upgrade_cost(current_subscription, daily_rate)
        additional_payment = upgrade_calculation['additional_payment']
        
        # Деактивируем старую подписку
        current_subscription.status = SubscriptionStatus.EXPIRED
        current_subscription.is_active = False
        db.commit()
    
    # Проверяем достаточность баланса для доплаты
    if additional_payment > 0:
        user_balance = get_or_create_user_balance(db, current_user.id)
        if user_balance.balance < rubles_to_kopecks(additional_payment):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Недостаточно средств на балансе. Требуется доплата: {additional_payment} руб."
            )
        
        # Списываем доплату
        withdraw_result = withdraw_balance(
            db=db,
            user_id=current_user.id,
            amount_rubles=additional_payment,
            description=f"Доплата за обновление тарифа"
        )
        
        if not withdraw_result["success"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ошибка списания средств"
            )
    
    # Создаем новую подписку
    new_subscription = Subscription(
        user_id=current_user.id,
        subscription_type=subscription_type,
        status=SubscriptionStatus.ACTIVE,  # Активируем сразу после оплаты
        salon_branches=upgrade_request.salon_branches or 1,
        salon_employees=upgrade_request.salon_employees or 0,
        master_bookings=upgrade_request.master_bookings or 0,
        start_date=start_date,
        end_date=end_date,
        price=total_price,
        daily_rate=daily_rate,
        payment_period=upgrade_request.payment_period,  # Сохраняем период для автопродления
        is_active=True,
        auto_renewal=True,
    )
    
    db.add(new_subscription)
    db.commit()
    db.refresh(new_subscription)
    
    # Резервируем полную стоимость подписки
    reserve_result = reserve_full_subscription_price(db, new_subscription)
    if not reserve_result["success"]:
        # Если не удалось зарезервировать, отменяем подписку
        db.delete(new_subscription)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=reserve_result["message"]
        )
    
    # Преобразуем объект Subscription в формат SubscriptionOut
    return {
        "id": new_subscription.id,
        "user_id": new_subscription.user_id,
        "subscription_type": new_subscription.subscription_type.value,
        "status": new_subscription.status.value,
        "salon_branches": new_subscription.salon_branches,
        "salon_employees": new_subscription.salon_employees,
        "master_bookings": new_subscription.master_bookings,
        "end_date": new_subscription.end_date,
        "price": new_subscription.price,
        "auto_renewal": new_subscription.auto_renewal,
        "payment_method": "card",
    }


@router.put("/{subscription_id}/activate")
async def activate_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Активировать подписку после оплаты"""
    
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.id == subscription_id,
            Subscription.user_id == current_user.id
        )
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подписка не найдена"
        )
    
    subscription.status = SubscriptionStatus.ACTIVE
    db.commit()
    
    return {"message": "Подписка активирована"}


@router.get("/history", response_model=List[SubscriptionOut])
async def get_subscription_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить историю подписок пользователя"""
    
    subscriptions = db.query(Subscription).filter(
        Subscription.user_id == current_user.id
    ).order_by(Subscription.id.desc()).all()
    
    # Преобразуем объекты Subscription в формат SubscriptionOut
    return [
        {
            "id": sub.id,
            "user_id": sub.user_id,
            "subscription_type": sub.subscription_type.value,
            "status": sub.status.value,
            "salon_branches": sub.salon_branches,
            "salon_employees": sub.salon_employees,
            "master_bookings": sub.master_bookings,
            "end_date": sub.end_date,
            "price": sub.price,
            "auto_renewal": sub.auto_renewal,
            "payment_method": "card",
        }
        for sub in subscriptions
    ]


@router.put("/{subscription_id}", response_model=SubscriptionOut)
async def update_subscription(
    subscription_id: int,
    subscription_update: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновить подписку"""
    
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.id == subscription_id,
            Subscription.user_id == current_user.id
        )
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подписка не найдена"
        )
    
    # Обновляем только переданные поля
    update_data = subscription_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subscription, field, value)
    
    db.commit()
    db.refresh(subscription)
    
    # Преобразуем объект Subscription в формат SubscriptionOut
    return {
        "id": subscription.id,
        "user_id": subscription.user_id,
        "subscription_type": subscription.subscription_type.value,
        "status": subscription.status.value,
        "salon_branches": subscription.salon_branches,
        "salon_employees": subscription.salon_employees,
        "master_bookings": subscription.master_bookings,
        "end_date": subscription.end_date,
        "price": subscription.price,
        "auto_renewal": subscription.auto_renewal,
        "payment_method": "card",
    }


@router.delete("/{subscription_id}")
async def cancel_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Отменить подписку"""
    
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.id == subscription_id,
            Subscription.user_id == current_user.id
        )
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подписка не найдена"
        )
    
    subscription.status = SubscriptionStatus.CANCELLED
    subscription.auto_renewal = False
    db.commit()
    
    return {"message": "Подписка отменена"} 
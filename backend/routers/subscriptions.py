from datetime import datetime, timedelta, time, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
import math
import logging

from database import get_db
from models import (
    User,
    Subscription,
    SubscriptionType,
    SubscriptionStatus,
    SubscriptionFreeze,
    SubscriptionPlan,
    SubscriptionReservation,
    SubscriptionPriceSnapshot,
    DailySubscriptionCharge,
    DailyChargeStatus,
)
from schemas import (
    SubscriptionCreate, 
    SubscriptionUpdate, 
    SubscriptionOut, 
    SubscriptionUpgradeRequest,
    SubscriptionFreezeCreate,
    SubscriptionFreezeOut,
    SubscriptionFreezeInfo,
    SubscriptionCalculationRequest,
    SubscriptionCalculationResponse
)
from auth import get_current_user
from constants import duration_months_to_days
from utils.subscription_features import get_effective_subscription
from utils.balance_utils import (
    calculate_subscription_daily_rate,
    calculate_upgrade_cost,
    get_or_create_user_balance,
    withdraw_balance,
    reserve_full_subscription_price
)

router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    responses={401: {"description": "Требуется авторизация"}},
)
logger = logging.getLogger(__name__)


@router.get(
    "/my",
    response_model=SubscriptionOut,
    summary="Текущая подписка пользователя",
    responses={
        400: {"description": "Только салоны и мастера могут иметь подписки"},
        404: {"description": "Подписка не найдена"},
    },
)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить текущую подписку пользователя (мастер/салон)."""
    
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
    
    # Ищем эффективную подписку (строго по датам, консистентно с features)
    now_utc = datetime.utcnow()
    subscription = get_effective_subscription(db, current_user.id, subscription_type, now_utc=now_utc)
    # Если селектор поправил неконсистентные статусы/флаги — фиксируем
    try:
        if (db.info.get("effective_subscription") or {}).get("fixes"):
            db.commit()
    except Exception:
        # best-effort: не ломаем основной ответ
        db.rollback()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no_subscription",
        )

    # DEV-only diagnostics for /my
    from settings import get_settings
    if get_settings().SUBSCRIPTION_FEATURES_DEBUG.strip() == "1":
        sel = db.info.get("effective_subscription") or {}
        logger.info(
            "subscription/my_entry user_id=%s now_utc=%s subscription_type=%s returned_sub=%s selector_reason=%s applied_fallback=%s fixes=%s",
            current_user.id,
            now_utc,
            subscription_type.value,
            {
                "id": getattr(subscription, "id", None),
                "status": getattr(getattr(subscription, "status", None), "value", getattr(subscription, "status", None)),
                "is_active": getattr(subscription, "is_active", None),
                "start_date": getattr(subscription, "start_date", None),
                "end_date": getattr(subscription, "end_date", None),
                "plan_id": getattr(subscription, "plan_id", None),
            },
            sel.get("chosen_reason"),
            sel.get("applied_fallback"),
            sel.get("fixes") or [],
        )
    
    # Получаем информацию о плане, если он есть
    plan_name = None
    plan_display_name = None
    plan_features = {}
    plan_limits = {}
    if subscription.plan_id:
        from models import SubscriptionPlan
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
        if plan:
            plan_name = plan.name
            plan_display_name = plan.display_name
            plan_features = plan.features or {}
            plan_limits = plan.limits or {}
    
    # UI-метрики (Variant A): показываем только резерв/списания, без "кошелька"
    reserved_amount = 0.0
    if subscription.plan_id:
        try:
            from models import SubscriptionReservation
            res = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == subscription.id).first()
            reserved_amount = float(res.reserved_amount) if res else 0.0
        except Exception:
            reserved_amount = 0.0

    daily_rate = float(getattr(subscription, "daily_rate", 0.0) or 0.0)
    price = float(getattr(subscription, "price", 0.0) or 0.0)
    spent_amount = max(0.0, price - float(reserved_amount or 0.0))

    # days_remaining: min(balance_days, calendar_days) — реальная доступность ограничена и балансом, и датой
    user_balance = get_or_create_user_balance(db, current_user.id)
    balance_rub = float(user_balance.balance or 0.0)

    calendar_days = None
    if subscription.end_date:
        try:
            calendar_days = max(0, int(((subscription.end_date - datetime.utcnow()).total_seconds() + 86399) // 86400))
        except Exception:
            calendar_days = 0

    if daily_rate > 0:
        charge_per_day = max(0, int(round(daily_rate)))
        balance_days = int(balance_rub // charge_per_day) if charge_per_day > 0 else 0
        if calendar_days is not None:
            days_remaining = max(0, min(balance_days, calendar_days))
        else:
            days_remaining = max(0, balance_days)
    else:
        balance_days = None
        days_remaining = calendar_days if calendar_days is not None else 0

    # DIAG: временный лог для проверки days_remaining — удалить после диагностики
    if get_settings().SUBSCRIPTION_DAYS_DEBUG.strip() == "1":
        logger.info(
            "subscription/my days_remaining user_id=%s balance_rub=%.2f daily_rate=%.2f "
            "balance_days=%s calendar_days=%s days_remaining=%s plan_name=%s",
            current_user.id,
            balance_rub,
            daily_rate,
            balance_days,
            calendar_days,
            days_remaining,
            plan_name,
        )

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
        "daily_rate": daily_rate,
        "reserved_amount": reserved_amount,
        "spent_amount": spent_amount,
        "days_remaining": days_remaining,
        "auto_renewal": subscription.auto_renewal,
        "payment_method": "card",
        "plan_id": subscription.plan_id,
        "plan_name": plan_name,
        "plan_display_name": plan_display_name,
        "features": plan_features,
        "limits": plan_limits,
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
    
    # Ищем эффективную подписку (строго по датам, консистентно с /my и /features)
    current_subscription = get_effective_subscription(db, current_user.id, subscription_type, now_utc=datetime.utcnow())
    try:
        if (db.info.get("effective_subscription") or {}).get("fixes"):
            db.commit()
    except Exception:
        db.rollback()
    
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
    # 1/12 мес. → 30/360 дней
    months = 12 if upgrade_request.payment_period == 'year' else 1
    duration_days = duration_months_to_days(months)
    end_date = datetime.utcnow() + timedelta(days=duration_days)
    
    start_date = datetime.utcnow()
    total_price = calculated_price['total_price']
    
    # Рассчитываем дневную ставку (целые рубли)
    total_days = (end_date - start_date).days
    daily_rate = int(math.ceil(total_price / total_days)) if total_days > 0 else 0
    
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
        if user_balance.balance < additional_payment:
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
    
    # Если указан plan_id, получаем план и используем его цены
    plan_id = upgrade_request.plan_id
    if plan_id:
        from models import SubscriptionPlan
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="План подписки не найден"
            )
        if plan.subscription_type != subscription_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Тип плана не соответствует типу подписки"
            )
        # Используем цену из плана
        if upgrade_request.payment_period == 'year':
            monthly_price = plan.price_12months
            total_price = monthly_price * 12
        else:
            monthly_price = plan.price_1month
            total_price = monthly_price
        _days = duration_months_to_days(12 if upgrade_request.payment_period == 'year' else 1)
        daily_rate = int(math.ceil(total_price / _days)) if _days > 0 else 0
    
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
        plan_id=plan_id,
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
    
    # Получаем информацию о плане
    plan_name = None
    if new_subscription.plan_id:
        from models import SubscriptionPlan
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == new_subscription.plan_id).first()
        if plan:
            plan_name = plan.name
    
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
        "plan_id": new_subscription.plan_id,
        "plan_name": plan_name,
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
    
    # Получаем информацию о планах для всех подписок
    from models import SubscriptionPlan
    plan_ids = [sub.plan_id for sub in subscriptions if sub.plan_id]
    plans = {}
    if plan_ids:
        plans_query = db.query(SubscriptionPlan).filter(SubscriptionPlan.id.in_(plan_ids)).all()
        plans = {plan.id: plan.name for plan in plans_query}
    
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
            "plan_id": sub.plan_id,
            "plan_name": plans.get(sub.plan_id) if sub.plan_id else None,
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
    
    # Получаем информацию о плане
    plan_name = None
    if subscription.plan_id:
        from models import SubscriptionPlan
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
        if plan:
            plan_name = plan.name
    
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
        "plan_id": subscription.plan_id,
        "plan_name": plan_name,
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


@router.get("/freeze", response_model=SubscriptionFreezeInfo)
async def get_subscription_freeze_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить информацию о доступных днях заморозки и истории"""
    
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
    
    # Получаем активную подписку
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == current_user.id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.is_active == True,
            Subscription.end_date > datetime.utcnow()
        )
    ).order_by(Subscription.id.desc()).first()
    
    if not subscription:
        # Возвращаем пустую информацию о заморозке, если подписки нет
        return SubscriptionFreezeInfo(
            available_freeze_days=0,
            used_freeze_days=0,
            total_freeze_days=0,
            active_freezes=[],
            freeze_history=[],
            can_freeze=False
        )
    
    # Получаем план подписки
    plan = None
    if subscription.plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
    
    # Определяем лимит заморозки на основе плана и периода оплаты
    total_freeze_days = 0
    if plan:
        # Определяем период оплаты подписки
        payment_period = subscription.payment_period or 'month'
        if payment_period == 'year':
            # Проверяем, сколько месяцев оплачено
            days_paid = (subscription.end_date - subscription.start_date).days
            if days_paid >= 365:
                total_freeze_days = plan.freeze_days_12months
            elif days_paid >= 180:
                total_freeze_days = plan.freeze_days_6months
            else:
                total_freeze_days = plan.freeze_days_3months
        else:
            # Для месячной подписки используем freeze_days_1month
            total_freeze_days = plan.freeze_days_1month
    
    # Получаем все заморозки для этой подписки (не отмененные)
    all_freezes = db.query(SubscriptionFreeze).filter(
        and_(
            SubscriptionFreeze.subscription_id == subscription.id,
            SubscriptionFreeze.is_cancelled == False
        )
    ).all()
    
    # Подсчитываем использованные дни
    used_freeze_days = sum(freeze.freeze_days for freeze in all_freezes)
    
    # Получаем активные заморозки (текущая дата попадает в период)
    now = datetime.utcnow()
    active_freezes = [
        freeze for freeze in all_freezes
        if freeze.start_date <= now <= freeze.end_date
    ]
    
    # Доступные дни заморозки
    available_freeze_days = max(0, total_freeze_days - used_freeze_days)
    
    # Можно ли создать новую заморозку (есть доступные дни)
    can_freeze = available_freeze_days > 0
    
    return SubscriptionFreezeInfo(
        available_freeze_days=available_freeze_days,
        used_freeze_days=used_freeze_days,
        total_freeze_days=total_freeze_days,
        active_freezes=[SubscriptionFreezeOut.from_orm(f) for f in active_freezes],
        freeze_history=[SubscriptionFreezeOut.from_orm(f) for f in all_freezes],
        can_freeze=can_freeze
    )


@router.post("/freeze", response_model=SubscriptionFreezeOut)
async def create_subscription_freeze(
    freeze_data: SubscriptionFreezeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Создать заморозку подписки"""
    
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
    
    # Получаем подписку
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.id == freeze_data.subscription_id,
            Subscription.user_id == current_user.id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.is_active == True
        )
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Активная подписка не найдена"
        )
    
    # Проверяем, что даты в будущем
    now = datetime.utcnow()
    if freeze_data.start_date < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя создать заморозку на прошедшие даты"
        )
    
    # Проверяем, что start_date <= end_date
    if freeze_data.start_date > freeze_data.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дата начала должна быть раньше или равна дате окончания"
        )
    
    # Нормализуем даты (начало в 00:00, конец в 23:59)
    start_date = datetime.combine(freeze_data.start_date.date(), time.min)
    end_date = datetime.combine(freeze_data.end_date.date(), time.max.replace(second=59, microsecond=999999))
    
    # Вычисляем количество дней заморозки
    freeze_days = (end_date.date() - start_date.date()).days + 1
    
    # Получаем план подписки
    plan = None
    if subscription.plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
    
    # Проверяем лимит заморозки
    total_freeze_days = 0
    if plan:
        payment_period = subscription.payment_period or 'month'
        if payment_period == 'year':
            days_paid = (subscription.end_date - subscription.start_date).days
            if days_paid >= 365:
                total_freeze_days = plan.freeze_days_12months
            elif days_paid >= 180:
                total_freeze_days = plan.freeze_days_6months
            else:
                total_freeze_days = plan.freeze_days_3months
        else:
            # Для месячной подписки используем freeze_days_1month
            total_freeze_days = plan.freeze_days_1month
    
    if total_freeze_days == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ваш тарифный план не поддерживает заморозку подписки"
        )
    
    # Получаем все неотмененные заморозки для этой подписки
    existing_freezes = db.query(SubscriptionFreeze).filter(
        and_(
            SubscriptionFreeze.subscription_id == subscription.id,
            SubscriptionFreeze.is_cancelled == False
        )
    ).all()
    
    # Подсчитываем использованные дни
    used_freeze_days = sum(f.freeze_days for f in existing_freezes)
    available_freeze_days = total_freeze_days - used_freeze_days
    
    if freeze_days > available_freeze_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недостаточно доступных дней заморозки. Доступно: {available_freeze_days}, запрошено: {freeze_days}"
        )
    
    # Проверяем пересечение с существующими заморозками
    for existing_freeze in existing_freezes:
        # Проверяем, пересекаются ли периоды
        if not (end_date < existing_freeze.start_date or start_date > existing_freeze.end_date):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Новая заморозка не должна пересекаться с уже существующей"
            )
    
    # Создаем заморозку
    new_freeze = SubscriptionFreeze(
        subscription_id=subscription.id,
        start_date=start_date,
        end_date=end_date,
        freeze_days=freeze_days,
        is_cancelled=False
    )
    
    db.add(new_freeze)
    db.commit()
    db.refresh(new_freeze)
    
    return SubscriptionFreezeOut.from_orm(new_freeze)


@router.delete("/freeze/{freeze_id}")
async def cancel_subscription_freeze(
    freeze_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Отменить заморозку подписки (только до её начала)"""
    
    # Получаем заморозку
    freeze = db.query(SubscriptionFreeze).filter(
        SubscriptionFreeze.id == freeze_id
    ).first()
    
    if not freeze:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заморозка не найдена"
        )
    
    # Получаем подписку и проверяем права
    subscription = db.query(Subscription).filter(
        Subscription.id == freeze.subscription_id
    ).first()
    
    if not subscription or subscription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этой заморозке"
        )
    
    # Проверяем, что заморозка еще не началась
    now = datetime.utcnow()
    if now >= freeze.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя отменить заморозку после её начала"
        )
    
    # Отменяем заморозку
    freeze.is_cancelled = True
    freeze.cancelled_at = now
    
    db.commit()
    
    return {"message": "Заморозка отменена", "freeze_id": freeze_id}


@router.get("/reserved-balance")
async def get_reserved_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить сумму зарезервированных денег по текущей активной подписке"""
    
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
    
    # Ищем активную подписку
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == current_user.id,
            Subscription.subscription_type == subscription_type,
            Subscription.status == SubscriptionStatus.ACTIVE
        )
    ).first()
    
    if not subscription:
        return {
            "reserved_balance": 0.0,
            "reserved_kopecks": 0.0,
            "subscription_id": None
        }
    
    # Получаем резерв
    reservation = db.query(SubscriptionReservation).filter(
        SubscriptionReservation.subscription_id == subscription.id
    ).first()
    
    reserved_amount = reservation.reserved_amount if reservation else 0.0
    
    return {
        "reserved_balance": reserved_amount,
        "reserved_kopecks": reserved_amount,  # Оставляем для обратной совместимости
        "subscription_id": subscription.id
    }


@router.post("/calculate", response_model=SubscriptionCalculationResponse)
async def calculate_subscription_cost(
    calculation_request: SubscriptionCalculationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Рассчитать стоимость подписки с учетом резерва и текущей подписки"""
    
    # Очищаем истекшие snapshots перед созданием нового
    cleanup_expired_snapshots(db)
    
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
    
    # Получаем план подписки
    plan = db.query(SubscriptionPlan).filter(
        and_(
            SubscriptionPlan.id == calculation_request.plan_id,
            SubscriptionPlan.subscription_type == subscription_type,
            SubscriptionPlan.is_active == True
        )
    ).first()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="План подписки не найден"
        )
    
    # Проверяем продолжительность (1/3/6/12 мес. → 30/90/180/360 дней)
    if calculation_request.duration_months not in (1, 3, 6, 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Продолжительность должна быть 1, 3, 6 или 12 месяцев"
        )
    
    # Получаем цену за месяц для выбранного периода
    if calculation_request.duration_months == 1:
        monthly_price_raw = plan.price_1month
    elif calculation_request.duration_months == 3:
        monthly_price_raw = plan.price_3months
    elif calculation_request.duration_months == 6:
        monthly_price_raw = plan.price_6months
    else:  # 12 месяцев
        monthly_price_raw = plan.price_12months
    
    # Округляем месячную цену вверх до целого значения
    monthly_price = math.ceil(monthly_price_raw)
    
    # Рассчитываем общую стоимость пакета
    total_price = monthly_price * calculation_request.duration_months
    
    # Месячная стоимость для отображения "от X руб./мес" (минимальная из всех периодов)
    price_per_month_display = min(plan.price_1month, plan.price_3months, plan.price_6months, plan.price_12months)
    price_per_month_display = math.ceil(price_per_month_display)  # Округляем вверх
    
    # Реальная месячная цена для выбранного периода (для отображения в расчете)
    actual_monthly_price = monthly_price
    
    duration_days_val = duration_months_to_days(calculation_request.duration_months)
    daily_price = (float(total_price) / duration_days_val) if duration_days_val else 0.0
    daily_price = math.ceil(daily_price)  # Округляем вверх
    
    # Рассчитываем экономию (сравниваем с ценой за 1 месяц)
    savings_percent = None
    if calculation_request.duration_months > 1:
        price_1month_rounded = math.ceil(plan.price_1month)
        if monthly_price < price_1month_rounded:
            savings_percent = ((price_1month_rounded - monthly_price) / price_1month_rounded) * 100
    
    now = datetime.utcnow()

    # Получаем текущую "эффективную" подписку (единый контракт + нормализация)
    from utils.subscription_features import get_effective_subscription
    current_subscription = get_effective_subscription(db, current_user.id, subscription_type, now_utc=now)
    try:
        if (db.info.get("effective_subscription") or {}).get("fixes"):
            db.commit()
    except Exception:
        db.rollback()
    
    reserved_balance = 0.0
    current_plan_display_order = None
    current_plan_price = None
    current_plan_daily_rate = None
    current_plan_reserved_remaining = None
    current_plan_accrued = None
    current_plan_credit = 0.0
    credit_source = "none"
    breakdown_text = None
    
    if current_subscription:
        # Получаем резерв
        reservation = db.query(SubscriptionReservation).filter(
            SubscriptionReservation.subscription_id == current_subscription.id
        ).first()
        reservation_subscription_id = reservation.subscription_id if reservation else None
        reserved_balance = reservation.reserved_amount if reservation else 0.0
        current_plan_reserved_remaining = reserved_balance
        current_plan_price = current_subscription.price
        current_plan_daily_rate = current_subscription.daily_rate
        
        # Получаем display_order текущего плана
        if current_subscription.plan_id:
            current_plan = db.query(SubscriptionPlan).filter(
                SubscriptionPlan.id == current_subscription.plan_id
            ).first()
            if current_plan:
                current_plan_display_order = current_plan.display_order
    
    # --- Contract: downgrade detect by выбранному периоду, credit только из old_reserved_amount ---
    requested_upgrade_type = calculation_request.upgrade_type or "immediate"
    effective_upgrade_type = requested_upgrade_type
    is_downgrade = False
    forced_upgrade_type = None

    def _price_for_period(p: SubscriptionPlan, months: int) -> float:
        if months == 1:
            return float(getattr(p, "price_1month", 0.0) or 0.0)
        if months == 3:
            return float(getattr(p, "price_3months", 0.0) or 0.0)
        if months == 6:
            return float(getattr(p, "price_6months", 0.0) or 0.0)
        return float(getattr(p, "price_12months", 0.0) or 0.0)

    current_price_period = None
    new_price_period = float(monthly_price_raw or 0.0)
    is_upgrade = False
    if current_subscription and current_subscription.plan_id:
        current_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == current_subscription.plan_id).first()
        if current_plan:
            current_price_period = _price_for_period(current_plan, calculation_request.duration_months)
            new_price_period = _price_for_period(plan, calculation_request.duration_months)
            if new_price_period > 0 and current_price_period > 0:
                is_downgrade = new_price_period < current_price_period
                is_upgrade = new_price_period > current_price_period

    # downgrade => only after_expiry
    if is_downgrade and requested_upgrade_type == "immediate":
        effective_upgrade_type = "after_expiry"
        forced_upgrade_type = "after_expiry"

    # MVP: кредит из резерва отключён. Остаток = UserBalance.balance, резерв не используется.
    credit_amount = 0.0
    final_price = max(0.0, float(total_price))
    requires_immediate_payment = final_price > 0

    current_plan_credit = 0.0
    credit_source = "none"
    current_plan_accrued = None
    breakdown_text = "Отложенное применение: кредит не применяется" if effective_upgrade_type == "after_expiry" else "Кредит не применяется (MVP: депозит = баланс)"
    
    # Рассчитываем даты начала и окончания (30/90/180/360 дней)
    start_date = None
    end_date = None
    if effective_upgrade_type == "after_expiry" and current_subscription:
        start_date = current_subscription.end_date
        end_date = start_date + timedelta(days=duration_days_val)
    elif effective_upgrade_type == "immediate":
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=duration_days_val)
    else:
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=duration_days_val)
    
    # Создаем snapshot цен (TTL 30 минут, чтобы совпадало с жизнью счета Robokassa)
    expires_at = datetime.utcnow() + timedelta(minutes=30)
    snapshot = SubscriptionPriceSnapshot(
        user_id=current_user.id,
        plan_id=plan.id,
        duration_months=calculation_request.duration_months,
        price_1month=math.ceil(plan.price_1month),
        price_3months=math.ceil(plan.price_3months),
        price_6months=math.ceil(plan.price_6months),
        price_12months=math.ceil(plan.price_12months),
        total_price=total_price,
        monthly_price=actual_monthly_price,  # Реальная месячная цена для выбранного периода (уже округлена)
        daily_price=daily_price,
        reserved_balance=0.0,
        credit_amount=0.0,
        final_price=final_price,
        upgrade_type=effective_upgrade_type,
        is_downgrade=is_downgrade,
        forced_upgrade_type=forced_upgrade_type,
        expires_at=expires_at
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    
    # Диагностические логи (включаются переменной окружения)
    from settings import get_settings
    if get_settings().SUBSCRIPTION_CALC_DEBUG.strip() == "1":
        logger.info(
            "subscription/calc_contract user_id=%s current_sub_id=%s reservation_sub_id=%s current_plan_id=%s new_plan_id=%s months=%s "
            "current_price_period=%s new_price_period=%s old_reserved_amount=%s credit_amount=%s "
            "total_price=%s final_price=%s requested_upgrade_type=%s effective_upgrade_type=%s "
            "is_downgrade=%s forced_upgrade_type=%s",
            current_user.id,
            getattr(current_subscription, "id", None),
            reservation_subscription_id if current_subscription else None,
            getattr(current_subscription, "plan_id", None),
            plan.id,
            calculation_request.duration_months,
            current_price_period,
            new_price_period,
            float(reserved_balance or 0.0),
            float(credit_amount or 0.0),
            float(total_price),
            float(final_price),
            requested_upgrade_type,
            effective_upgrade_type,
            is_downgrade,
            forced_upgrade_type,
        )

    return SubscriptionCalculationResponse(
        calculation_id=snapshot.id,
        plan_id=plan.id,
        plan_name=plan.name,
        duration_months=calculation_request.duration_months,
        total_price=total_price,
        monthly_price=actual_monthly_price,  # Реальная месячная цена для выбранного периода
        daily_price=daily_price,
        price_per_month_display=price_per_month_display,
        reserved_balance=reserved_balance,
        final_price=final_price,
        savings_percent=savings_percent,
        start_date=start_date,
        end_date=end_date,
        upgrade_type=effective_upgrade_type,
        current_plan_display_order=current_plan_display_order,
        new_plan_display_order=plan.display_order,
        requires_immediate_payment=requires_immediate_payment,

        current_plan_credit=current_plan_credit,
        current_plan_accrued=current_plan_accrued,
        current_plan_reserved_remaining=current_plan_reserved_remaining,
        current_plan_price=current_plan_price,
        current_plan_daily_rate=current_plan_daily_rate,
        new_plan_cost=total_price,
        payable=final_price,
        credit_source=credit_source,
        breakdown_text=breakdown_text,
        is_downgrade=is_downgrade,
        forced_upgrade_type=forced_upgrade_type,
    )


@router.delete("/calculate/{calculation_id}")
async def delete_calculation_snapshot(
    calculation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить snapshot расчета при закрытии модального окна"""
    
    snapshot = db.query(SubscriptionPriceSnapshot).filter(
        and_(
            SubscriptionPriceSnapshot.id == calculation_id,
            SubscriptionPriceSnapshot.user_id == current_user.id
        )
    ).first()
    
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot не найден"
        )
    
    db.delete(snapshot)
    db.commit()
    
    return {"success": True, "message": "Snapshot удален"}


@router.post("/apply-upgrade-free")
async def apply_upgrade_free(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Применить immediate upgrade без оплаты (final_price<=0) по snapshot_id (TTL как у snapshot).

    ВАЖНО: применение должно быть явным действием пользователя.
    """
    calculation_id = payload.get("calculation_id")
    if not calculation_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="calculation_id is required")

    now = datetime.utcnow()

    # тип подписки по роли
    if current_user.role.value in ["salon"]:
        subscription_type = SubscriptionType.SALON
    elif current_user.role.value in ["master", "indie"]:
        subscription_type = SubscriptionType.MASTER
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверная роль для подписки")

    try:
        # В FastAPI/SQLAlchemy 2.x сессия может быть уже в транзакции (autobegin),
        # поэтому используем nested транзакцию (SAVEPOINT) для атомарности.
        eps = 0.0001
        with db.begin_nested():
            snapshot = (
                db.query(SubscriptionPriceSnapshot)
                .filter(
                    SubscriptionPriceSnapshot.id == int(calculation_id),
                    SubscriptionPriceSnapshot.user_id == current_user.id,
                )
                .with_for_update()
                .first()
            )
            if not snapshot:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot не найден")
            if snapshot.expires_at and snapshot.expires_at <= now:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Snapshot истек — пересчитайте стоимость")
            if float(getattr(snapshot, "final_price", 0.0) or 0.0) > 0.0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot требует оплату (final_price>0)")
            if (snapshot.upgrade_type or "") != "immediate":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Snapshot не для immediate apply")
            # Нельзя применять downgrade через free-apply (даже если snapshot подменили)
            if bool(getattr(snapshot, "is_downgrade", False)) or (getattr(snapshot, "forced_upgrade_type", None) == "after_expiry"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Downgrade запрещен для немедленного применения")

            if getattr(snapshot, "applied_subscription_id", None):
                return {
                    "success": True,
                    "already_applied": True,
                    "subscription_id": snapshot.applied_subscription_id,
                }

            from utils.subscription_features import get_effective_subscription
            current_subscription = get_effective_subscription(db, current_user.id, subscription_type, now_utc=now)
            try:
                if (db.info.get("effective_subscription") or {}).get("fixes"):
                    db.flush()
            except Exception:
                pass

            # создаем новую подписку немедленно (30/90/180/360 дней)
            total_price_full = float(snapshot.total_price)
            total_days = max(1, duration_months_to_days(int(snapshot.duration_months)))
            daily_rate = int(math.ceil(total_price_full / total_days)) if total_days else 0

            new_subscription = Subscription(
                user_id=current_user.id,
                subscription_type=subscription_type,
                status=SubscriptionStatus.ACTIVE,
                start_date=now,
                end_date=now + timedelta(days=total_days),
                price=total_price_full,
                daily_rate=daily_rate,
                payment_period=None,
                is_active=True,
                auto_renewal=False,
                plan_id=snapshot.plan_id,
            )
            db.add(new_subscription)
            db.flush()

            # MVP: резерв не используем. Остаток = UserBalance.balance.
            new_res = SubscriptionReservation(
                user_id=current_user.id,
                subscription_id=new_subscription.id,
                reserved_amount=0.0,
            )
            db.add(new_res)
            db.flush()

            if current_subscription:
                current_subscription.status = SubscriptionStatus.EXPIRED
                current_subscription.is_active = False

            snapshot.applied_subscription_id = new_subscription.id
            snapshot.applied_at = now

            from settings import get_settings
            if get_settings().SUBSCRIPTION_PAYMENT_DEBUG.strip() == "1":
                logger.info(
                    "subscription/apply_free snapshot_id=%s user_id=%s current_sub_id=%s total_price=%s new_sub_id=%s",
                    snapshot.id,
                    current_user.id,
                    getattr(current_subscription, "id", None),
                    float(total_price_full),
                    new_subscription.id,
                )

            result = {"success": True, "already_applied": False, "subscription_id": new_subscription.id}

        # get_db() не делает commit автоматически — фиксируем изменения здесь.
        db.commit()
        return result

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


def cleanup_expired_snapshots(db: Session):
    """Очистить истекшие snapshots (вызывается периодически)"""
    now = datetime.utcnow()
    expired = db.query(SubscriptionPriceSnapshot).filter(
        SubscriptionPriceSnapshot.expires_at < now
    ).all()
    
    for snapshot in expired:
        db.delete(snapshot)
    
    db.commit()
    return len(expired) 
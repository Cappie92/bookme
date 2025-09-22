from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import User, UserBalance, BalanceTransaction, Subscription, SubscriptionType, SubscriptionStatus
from schemas import (
    BalanceOut, 
    TransactionOut, 
    DepositRequest,
    SubscriptionStatusOut
)
from auth import get_current_user
from utils.balance_utils import (
    get_or_create_user_balance,
    deposit_balance,
    withdraw_balance,
    get_subscription_status,
    kopecks_to_rubles,
    rubles_to_kopecks,
    get_user_available_balance,
    get_user_reserved_total,
    sync_reserve_for_user
)

router = APIRouter(prefix="/balance", tags=["balance"])


@router.get("/", response_model=BalanceOut)
async def get_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить текущий баланс пользователя"""
    
    user_balance = get_or_create_user_balance(db, current_user.id)
    available = get_user_available_balance(db, current_user.id)
    reserved_total = get_user_reserved_total(db, current_user.id)
    
    return BalanceOut(
        balance=kopecks_to_rubles(user_balance.balance),
        currency=user_balance.currency,
        balance_kopecks=user_balance.balance,
        available_balance=kopecks_to_rubles(available),
        reserved_total=kopecks_to_rubles(reserved_total)
    )


@router.post("/deposit")
async def deposit_balance_endpoint(
    deposit_request: DepositRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Пополнить баланс"""
    
    result = deposit_balance(
        db=db,
        user_id=current_user.id,
        amount_rubles=deposit_request.amount,
        description=f"Пополнение баланса через {deposit_request.payment_method}"
    )
    
    if result["success"]:
        # После пополнения синхронизируем резерв под активные подписки
        sync_reserve_for_user(db, current_user.id, max_days=None)
        return {
            "message": "Баланс успешно пополнен",
            "transaction_id": result["transaction_id"],
            "amount": result["amount_rubles"],
            "new_balance": result["balance_after"]
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ошибка пополнения баланса"
        )


@router.get("/transactions", response_model=List[TransactionOut])
async def get_transaction_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0
):
    """Получить историю транзакций"""
    
    transactions = db.query(BalanceTransaction).filter(
        BalanceTransaction.user_id == current_user.id
    ).order_by(BalanceTransaction.created_at.desc()).offset(offset).limit(limit).all()
    
    return [
        TransactionOut(
            id=t.id,
            amount=kopecks_to_rubles(t.amount),
            amount_kopecks=t.amount,
            transaction_type=t.transaction_type.value,
            description=t.description,
            subscription_id=t.subscription_id,
            balance_before=kopecks_to_rubles(t.balance_before),
            balance_after=kopecks_to_rubles(t.balance_after),
            created_at=t.created_at
        )
        for t in transactions
    ]


@router.get("/subscription-status", response_model=SubscriptionStatusOut)
async def get_subscription_status_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить статус подписки с обратным отсчетом"""
    
    # Определяем тип подписки на основе роли пользователя
    subscription_type = None
    if current_user.role.value in ['salon']:
        subscription_type = SubscriptionType.SALON.value
    elif current_user.role.value in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER.value
    else:
        # Для пользователей без подписки возвращаем базовую информацию
        return SubscriptionStatusOut(
            subscription_id=None,
            status="no_subscription",
            is_active=False,
            start_date=None,
            end_date=None,
            days_remaining=0,
            daily_rate=0,
            total_price=0,
            balance=0,
            can_continue=False,
            next_charge_date=None,
            max_branches=0,
            max_employees=0
        )
    
    status_info = get_subscription_status(db, current_user.id, subscription_type)
    
    if not status_info["has_subscription"]:
        # Возвращаем информацию о том, что подписка не найдена
        return SubscriptionStatusOut(
            subscription_id=None,
            status="no_subscription",
            is_active=False,
            start_date=None,
            end_date=None,
            days_remaining=0,
            daily_rate=0,
            total_price=0,
            balance=status_info.get("balance", 0),
            can_continue=False,
            next_charge_date=None,
            max_branches=0,
            max_employees=0
        )
    
    return SubscriptionStatusOut(
        subscription_id=status_info["subscription_id"],
        status=status_info["status"],
        is_active=status_info["is_active"],
        start_date=status_info["start_date"],
        end_date=status_info["end_date"],
        days_remaining=status_info["days_remaining"],
        daily_rate=status_info["daily_rate"],
        total_price=status_info["total_price"],
        balance=status_info["balance"],
        can_continue=status_info["can_continue"],
        next_charge_date=status_info["next_charge_date"],
        max_branches=status_info["max_branches"],
        max_employees=status_info["max_employees"]
    )


@router.post("/test-daily-charge")
async def test_daily_charge(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Тестовый эндпоинт для ежедневного списания (только для разработки)"""
    
    from utils.balance_utils import process_daily_charge
    
    # Проверяем, что подписка принадлежит пользователю
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
    
    result = process_daily_charge(db, subscription_id)
    
    return result


@router.get("/low-balance-warning")
async def get_low_balance_warning(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить предупреждение о низком балансе"""
    
    # Определяем тип подписки
    subscription_type = None
    if current_user.role.value in ['salon']:
        subscription_type = SubscriptionType.SALON.value
    elif current_user.role.value in ['master', 'indie']:
        subscription_type = SubscriptionType.MASTER.value
    else:
        return {"has_warning": False}
    
    # Получаем статус подписки
    status_info = get_subscription_status(db, current_user.id, subscription_type)
    
    if not status_info["has_subscription"]:
        return {"has_warning": False}
    
    # Проверяем, может ли подписка продолжаться
    if not status_info["can_continue"]:
        return {
            "has_warning": True,
            "warning_type": "critical",
            "message": "Недостаточно средств на балансе. Подписка приостановлена.",
            "days_remaining": status_info["days_remaining"],
            "balance": status_info["balance"],
            "daily_rate": status_info["daily_rate"],
            "required_amount": status_info["daily_rate"]
        }
    
    # Проверяем, достаточно ли средств на неделю вперед
    weekly_cost = status_info["daily_rate"] * 7
    if status_info["balance"] < weekly_cost:
        return {
            "has_warning": True,
            "warning_type": "warning",
            "message": "Низкий баланс. Рекомендуется пополнить счет.",
            "days_remaining": status_info["days_remaining"],
            "balance": status_info["balance"],
            "daily_rate": status_info["daily_rate"],
            "weekly_cost": weekly_cost,
            "recommended_amount": weekly_cost - status_info["balance"]
        }
    
    return {"has_warning": False} 
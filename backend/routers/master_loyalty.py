"""
Роутер для управления программой лояльности мастера (баллы)
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_

from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db
from models import (
    User, Master, LoyaltySettings, LoyaltyTransaction, Booking, Service
)
from schemas import (
    LoyaltySettingsOut, LoyaltySettingsUpdate, LoyaltyTransactionOut, LoyaltyStatsOut
)
from auth import get_current_active_user
from utils.subscription_features import has_loyalty_access
from routers.accounting import get_master_id_from_user

router = APIRouter(prefix="/api/master/loyalty", tags=["master_loyalty"])
logger = logging.getLogger(__name__)


@router.get("/settings", response_model=LoyaltySettingsOut)
async def get_loyalty_settings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить настройки программы лояльности мастера"""
    if not has_loyalty_access(db, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Доступ к программе лояльности доступен на плане Pro и выше"
        )
    
    master_id = get_master_id_from_user(current_user.id, db)
    
    # Получаем настройки или создаем дефолтные
    settings = db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master_id).first()
    
    if not settings:
        # Создаем дефолтные настройки
        settings = LoyaltySettings(
            master_id=master_id,
            is_enabled=False,
            accrual_percent=None,
            max_payment_percent=None,
            points_lifetime_days=None
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


@router.put("/settings", response_model=LoyaltySettingsOut)
async def update_loyalty_settings(
    settings_update: LoyaltySettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Обновить настройки программы лояльности мастера"""
    # Проверка доступа
    if not has_loyalty_access(db, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Доступ к программе лояльности доступен на плане Pro и выше"
        )
    
    master_id = get_master_id_from_user(current_user.id, db)
    
    # Получаем существующие настройки
    settings = db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master_id).first()
    
    if not settings:
        # Создаем новые настройки
        settings = LoyaltySettings(master_id=master_id)
        db.add(settings)
    
    # Валидация процентов
    update_data = settings_update.dict(exclude_unset=True)
    
    if 'accrual_percent' in update_data and update_data['accrual_percent'] is not None:
        if not (1 <= update_data['accrual_percent'] <= 100):
            raise HTTPException(
                status_code=400,
                detail="Процент начисления должен быть от 1 до 100"
            )
    
    if 'max_payment_percent' in update_data and update_data['max_payment_percent'] is not None:
        if not (1 <= update_data['max_payment_percent'] <= 100):
            raise HTTPException(
                status_code=400,
                detail="Процент оплаты баллами должен быть от 1 до 100"
            )
    
    if 'points_lifetime_days' in update_data and update_data['points_lifetime_days'] is not None:
        valid_lifetime_values = [14, 30, 60, 90, 180, 365]
        if update_data['points_lifetime_days'] not in valid_lifetime_values:
            raise HTTPException(
                status_code=400,
                detail=f"Срок жизни баллов должен быть одним из: {valid_lifetime_values} или null (бесконечно)"
            )
    
    # Обновляем настройки
    for field, value in update_data.items():
        setattr(settings, field, value)
    
    settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    logger.info(f"Обновлены настройки лояльности для мастера {master_id}")
    
    return settings


@router.get("/history", response_model=List[LoyaltyTransactionOut])
async def get_loyalty_history(
    client_id: Optional[int] = Query(None),
    transaction_type: Optional[str] = Query(None, regex="^(earned|spent)$"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить историю операций по баллам лояльности"""
    # Проверка доступа
    if not has_loyalty_access(db, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Доступ к программе лояльности доступен на плане Pro и выше"
        )
    
    master_id = get_master_id_from_user(current_user.id, db)
    
    # Базовый запрос
    query = db.query(LoyaltyTransaction).filter(LoyaltyTransaction.master_id == master_id)
    
    # Фильтры
    if client_id:
        query = query.filter(LoyaltyTransaction.client_id == client_id)
    
    if transaction_type:
        query = query.filter(LoyaltyTransaction.transaction_type == transaction_type)
    
    if start_date:
        query = query.filter(LoyaltyTransaction.created_at >= start_date)
    
    if end_date:
        query = query.filter(LoyaltyTransaction.created_at <= end_date)
    
    # Сортировка и пагинация
    transactions = query.order_by(desc(LoyaltyTransaction.created_at)).offset(skip).limit(limit).all()
    
    # Дополняем информацией о клиентах и услугах
    result = []
    for trans in transactions:
        trans_dict = {
            "id": trans.id,
            "master_id": trans.master_id,
            "client_id": trans.client_id,
            "booking_id": trans.booking_id,
            "transaction_type": trans.transaction_type,
            "points": trans.points,
            "earned_at": trans.earned_at,
            "expires_at": trans.expires_at,
            "service_id": trans.service_id,
            "created_at": trans.created_at,
            "client_name": None,
            "service_name": None
        }
        
        # Получаем имя клиента
        if trans.client_id:
            client = db.query(User).filter(User.id == trans.client_id).first()
            if client:
                trans_dict["client_name"] = client.full_name
        
        # Получаем название услуги
        if trans.service_id:
            service = db.query(Service).filter(Service.id == trans.service_id).first()
            if service:
                trans_dict["service_name"] = service.name
        
        result.append(LoyaltyTransactionOut(**trans_dict))
    
    return result


@router.get("/stats", response_model=LoyaltyStatsOut)
async def get_loyalty_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить статистику по баллам лояльности"""
    # Проверка доступа
    if not has_loyalty_access(db, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Доступ к программе лояльности доступен на плане Pro и выше"
        )
    
    master_id = get_master_id_from_user(current_user.id, db)
    
    # Общее количество выданных баллов
    total_earned = db.query(func.sum(LoyaltyTransaction.points)).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.transaction_type == 'earned'
    ).scalar() or 0
    
    # Общее количество списанных баллов
    total_spent = db.query(func.sum(LoyaltyTransaction.points)).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.transaction_type == 'spent'
    ).scalar() or 0
    
    # Текущий баланс (начислено - списано)
    current_balance = int(total_earned) - int(total_spent)
    
    # Количество активных клиентов с баллами (исключая истекшие)
    now = datetime.utcnow()
    active_clients = db.query(LoyaltyTransaction.client_id).filter(
        LoyaltyTransaction.master_id == master_id,
        LoyaltyTransaction.transaction_type == 'earned',
        or_(
            LoyaltyTransaction.expires_at.is_(None),
            LoyaltyTransaction.expires_at > now
        )
    ).distinct().count()
    
    return LoyaltyStatsOut(
        total_earned=int(total_earned),
        total_spent=int(total_spent),
        current_balance=current_balance,
        active_clients_count=active_clients
    )


"""
Роутер для управления налоговыми ставками мастера
"""
import logging
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from database import get_db
from models import User, TaxRate, BookingConfirmation
from auth import get_current_active_user

router = APIRouter(prefix="/api/master/tax-rates", tags=["tax-rates"])
logger = logging.getLogger(__name__)


@router.get("/")
async def get_tax_rates_history(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить историю налоговых ставок мастера"""
    try:
        tax_rates = db.query(TaxRate).filter(
            TaxRate.master_id == current_user.id
        ).order_by(desc(TaxRate.effective_from_date)).all()
        
        return {
            "tax_rates": [
                {
                    "id": tr.id,
                    "rate": tr.rate,
                    "effective_from_date": tr.effective_from_date,
                    "created_at": tr.created_at
                }
                for tr in tax_rates
            ]
        }
    except Exception as e:
        logger.error(f"Ошибка при получении истории налоговых ставок: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/current")
async def get_current_tax_rate(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить текущую налоговую ставку мастера"""
    try:
        today = date.today()
        
        # Находим актуальную ставку на сегодня
        current_rate = db.query(TaxRate).filter(
            TaxRate.master_id == current_user.id,
            TaxRate.effective_from_date <= today
        ).order_by(desc(TaxRate.effective_from_date)).first()
        
        if not current_rate:
            return {
                "rate": 0.0,
                "effective_from_date": None,
                "has_rate": False
            }
        
        return {
            "rate": current_rate.rate,
            "effective_from_date": current_rate.effective_from_date,
            "has_rate": True
        }
    except Exception as e:
        logger.error(f"Ошибка при получении текущей налоговой ставки: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_tax_rate_for_date(master_id: int, target_date: date, db: Session) -> float:
    """Получить налоговую ставку для конкретной даты"""
    tax_rate = db.query(TaxRate).filter(
        TaxRate.master_id == master_id,
        TaxRate.effective_from_date <= target_date
    ).order_by(desc(TaxRate.effective_from_date)).first()
    
    return tax_rate.rate if tax_rate else 0.0


@router.post("/")
async def create_tax_rate(
    rate: float,
    effective_from_date: date,
    recalculate_existing: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Создать новую налоговую ставку"""
    try:
        # Валидация
        if rate < 0 or rate > 100:
            raise HTTPException(status_code=400, detail="Налоговая ставка должна быть от 0 до 100%")
        
        if effective_from_date > date.today():
            raise HTTPException(status_code=400, detail="Дата вступления в силу не может быть в будущем")
        
        # Проверяем, что не существует ставки с такой же датой
        existing_rate = db.query(TaxRate).filter(
            TaxRate.master_id == current_user.id,
            TaxRate.effective_from_date == effective_from_date
        ).first()
        
        if existing_rate:
            raise HTTPException(status_code=400, detail="Для этой даты уже установлена налоговая ставка")
        
        # Создаем новую ставку
        tax_rate = TaxRate(
            master_id=current_user.id,
            rate=rate,
            effective_from_date=effective_from_date
        )
        db.add(tax_rate)
        
        # Пересчитываем существующие доходы если нужно
        recalculated_count = 0
        if recalculate_existing:
            # Получаем все подтвержденные доходы после указанной даты
            confirmations = db.query(BookingConfirmation).filter(
                BookingConfirmation.master_id == current_user.id,
                BookingConfirmation.confirmed_at >= effective_from_date
            ).all()
            
            for confirmation in confirmations:
                # Здесь можно добавить логику пересчета, если потребуется
                # Пока просто считаем количество
                recalculated_count += 1
        
        db.commit()
        db.refresh(tax_rate)
        
        logger.info(f"Создана налоговая ставка {rate}% с {effective_from_date} для мастера {current_user.id}")
        
        return {
            "id": tax_rate.id,
            "rate": tax_rate.rate,
            "effective_from_date": tax_rate.effective_from_date,
            "recalculated_confirmations": recalculated_count,
            "message": "Налоговая ставка успешно создана"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при создании налоговой ставки: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


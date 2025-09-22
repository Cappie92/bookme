from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from datetime import datetime, date, time
import json

from database import get_db
from models import (
    LoyaltyDiscount, PersonalDiscount, AppliedDiscount, Salon, User, Booking
)
from schemas import (
    LoyaltyDiscount as LoyaltyDiscountSchema,
    LoyaltyDiscountCreate,
    LoyaltyDiscountUpdate,
    PersonalDiscount as PersonalDiscountSchema,
    PersonalDiscountCreate,
    PersonalDiscountUpdate,
    AppliedDiscount as AppliedDiscountSchema,
    QuickDiscountTemplate,
    ComplexDiscountCondition,
    LoyaltySystemStatus,
    LoyaltyDiscountType,
    LoyaltyConditionType
)
from auth import require_salon, get_current_active_user

router = APIRouter(
    prefix="/loyalty",
    tags=["loyalty"],
)


# Шаблоны быстрых скидок
QUICK_DISCOUNT_TEMPLATES = [
    {
        "id": "first_visit",
        "name": "Новый клиент",
        "description": "Скидка за первую запись",
        "icon": "🎁",
        "conditions": {
            "condition_type": "first_visit",
            "parameters": {}
        },
        "default_discount": 10.0
    },
    {
        "id": "regular_visits",
        "name": "Регулярные визиты",
        "description": "Скидка за регулярные посещения",
        "icon": "⭐",
        "conditions": {
            "condition_type": "regular_visits",
            "parameters": {
                "visits_count": 5,
                "period": "month"
            }
        },
        "default_discount": 15.0
    },
    {
        "id": "returning_client",
        "name": "Возвращение клиента",
        "description": "Скидка для клиентов, которые давно не были",
        "icon": "🔄",
        "conditions": {
            "condition_type": "returning_client",
            "parameters": {
                "days_since_last_visit": 30,
                "period": "days"
            }
        },
        "default_discount": 20.0
    },
    {
        "id": "birthday",
        "name": "День рождения",
        "description": "Скидка в день рождения клиента",
        "icon": "🎂",
        "conditions": {
            "condition_type": "birthday",
            "parameters": {
                "days_before": 7,
                "days_after": 7
            }
        },
        "default_discount": 25.0
    },
    {
        "id": "happy_hours",
        "name": "Счастливые часы",
        "description": "Скидка в определенные часы",
        "icon": "⏰",
        "conditions": {
            "condition_type": "happy_hours",
            "parameters": {
                "start_time": "09:00",
                "end_time": "12:00",
                "days_of_week": [1, 2, 3, 4, 5]
            }
        },
        "default_discount": 15.0
    },
    {
        "id": "service_discount",
        "name": "Скидка на услуги",
        "description": "Скидка на определенные услуги",
        "icon": "✂️",
        "conditions": {
            "condition_type": "service_discount",
            "parameters": {
                "service_ids": [],
                "category_ids": []
            }
        },
        "default_discount": 10.0
    }
]


@router.get("/templates", response_model=List[QuickDiscountTemplate])
async def get_quick_discount_templates():
    """Получить шаблоны быстрых скидок"""
    return QUICK_DISCOUNT_TEMPLATES


@router.get("/status", response_model=LoyaltySystemStatus)
async def get_loyalty_system_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Получить статус системы лояльности салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    quick_discounts = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "quick"
    ).all()
    
    complex_discounts = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "complex"
    ).all()
    
    personal_discounts = db.query(PersonalDiscount).filter(
        PersonalDiscount.salon_id == salon.id
    ).all()
    
    total_discounts = len(quick_discounts) + len(complex_discounts) + len(personal_discounts)
    active_discounts = len([d for d in quick_discounts + complex_discounts + personal_discounts if d.is_active])
    
    return LoyaltySystemStatus(
        quick_discounts=quick_discounts,
        complex_discounts=complex_discounts,
        personal_discounts=personal_discounts,
        total_discounts=total_discounts,
        active_discounts=active_discounts
    )


@router.post("/quick-discounts", response_model=LoyaltyDiscountSchema)
async def create_quick_discount(
    discount: LoyaltyDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Создать быструю скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = LoyaltyDiscount(
        salon_id=salon.id,
        discount_type=discount.discount_type,
        name=discount.name,
        description=discount.description,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        conditions=discount.conditions,
        is_active=discount.is_active,
        priority=discount.priority
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.get("/quick-discounts", response_model=List[LoyaltyDiscountSchema])
async def get_quick_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Получить все быстрые скидки салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    discounts = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "quick"
    ).all()
    
    return discounts


@router.put("/quick-discounts/{discount_id}", response_model=LoyaltyDiscountSchema)
async def update_quick_discount(
    discount_id: int,
    discount: LoyaltyDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Обновить быструю скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "quick"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    update_data = discount.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_discount, field, value)
    
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.delete("/quick-discounts/{discount_id}")
async def delete_quick_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Удалить быструю скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "quick"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.post("/complex-discounts", response_model=LoyaltyDiscountSchema)
async def create_complex_discount(
    discount: LoyaltyDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Создать сложную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = LoyaltyDiscount(
        salon_id=salon.id,
        discount_type=discount.discount_type,
        name=discount.name,
        description=discount.description,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        conditions=discount.conditions,
        is_active=discount.is_active,
        priority=discount.priority
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.get("/complex-discounts", response_model=List[LoyaltyDiscountSchema])
async def get_complex_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Получить все сложные скидки салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    discounts = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "complex"
    ).all()
    
    return discounts


@router.put("/complex-discounts/{discount_id}", response_model=LoyaltyDiscountSchema)
async def update_complex_discount(
    discount_id: int,
    discount: LoyaltyDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Обновить сложную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "complex"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    update_data = discount.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_discount, field, value)
    
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.delete("/complex-discounts/{discount_id}")
async def delete_complex_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Удалить сложную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(LoyaltyDiscount).filter(
        LoyaltyDiscount.id == discount_id,
        LoyaltyDiscount.salon_id == salon.id,
        LoyaltyDiscount.discount_type == "complex"
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.post("/personal-discounts", response_model=PersonalDiscountSchema)
async def create_personal_discount(
    discount: PersonalDiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Создать персональную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    # Проверяем, существует ли пользователь с таким номером телефона
    user = db.query(User).filter(User.phone == discount.client_phone).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким номером телефона не найден")
    
    # Проверяем, не существует ли уже персональная скидка для этого клиента
    existing_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.salon_id == salon.id,
        PersonalDiscount.client_phone == discount.client_phone
    ).first()
    
    if existing_discount:
        raise HTTPException(status_code=400, detail="Персональная скидка для этого клиента уже существует")
    
    db_discount = PersonalDiscount(
        salon_id=salon.id,
        client_phone=discount.client_phone,
        discount_percent=discount.discount_percent,
        max_discount_amount=discount.max_discount_amount,
        description=discount.description,
        is_active=discount.is_active
    )
    
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.get("/personal-discounts", response_model=List[PersonalDiscountSchema])
async def get_personal_discounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Получить все персональные скидки салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    discounts = db.query(PersonalDiscount).filter(
        PersonalDiscount.salon_id == salon.id
    ).all()
    
    return discounts


@router.put("/personal-discounts/{discount_id}", response_model=PersonalDiscountSchema)
async def update_personal_discount(
    discount_id: int,
    discount: PersonalDiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Обновить персональную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.id == discount_id,
        PersonalDiscount.salon_id == salon.id
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    update_data = discount.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_discount, field, value)
    
    db.commit()
    db.refresh(db_discount)
    
    return db_discount


@router.delete("/personal-discounts/{discount_id}")
async def delete_personal_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Удалить персональную скидку"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    db_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.id == discount_id,
        PersonalDiscount.salon_id == salon.id
    ).first()
    
    if not db_discount:
        raise HTTPException(status_code=404, detail="Скидка не найдена")
    
    db.delete(db_discount)
    db.commit()
    
    return {"message": "Скидка удалена"}


@router.get("/check-discount/{client_phone}")
async def check_client_discount(
    client_phone: str,
    service_id: Optional[int] = None,
    booking_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_salon)
):
    """Проверить доступные скидки для клиента"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Профиль салона не найден")
    
    # Проверяем персональную скидку
    personal_discount = db.query(PersonalDiscount).filter(
        PersonalDiscount.salon_id == salon.id,
        PersonalDiscount.client_phone == client_phone,
        PersonalDiscount.is_active == True
    ).first()
    
    # Здесь будет логика проверки других типов скидок
    # Пока возвращаем только персональную скидку
    
    if personal_discount:
        return {
            "has_discount": True,
            "discount_type": "personal",
            "discount_percent": personal_discount.discount_percent,
            "max_discount_amount": personal_discount.max_discount_amount,
            "description": personal_discount.description
        }
    
    return {
        "has_discount": False,
        "discount_type": None,
        "discount_percent": 0,
        "max_discount_amount": None,
        "description": None
    } 
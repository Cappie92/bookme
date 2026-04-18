from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, contains_eager
from sqlalchemy import func, or_
from database import get_db
from models import Salon, IndieMaster, Master, MasterPageModule, Booking, BookingStatus, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, User, MasterService, MasterServiceCategory
from typing import Optional
from datetime import datetime
from schemas import ServicePublicOut, ServicesPublicResponse, DomainSubdomainInfoOut

router = APIRouter(
    prefix="/api/domain",
    tags=["domain"],
    responses={404: {"description": "Поддомен не найден"}},
)


@router.get(
    "/{subdomain}/info",
    response_model=DomainSubdomainInfoOut,
    summary="Информация о владельце поддомена",
)
async def get_subdomain_info(subdomain: str, db: Session = Depends(get_db)):
    """Получить информацию о владельце поддомена (салон, indie мастер или мастер). Публичный эндпоинт."""
    # Проверяем, существует ли салон с таким доменом
    salon = db.query(Salon).filter(Salon.domain == subdomain).first()
    if salon:
        print(f"Возвращаем данные салона: background_color={salon.background_color}, yandex_maps_widget={salon.yandex_maps_widget}")
        return {
            "owner_type": "salon",
            "owner_id": salon.id,
            "name": salon.name,
            "description": salon.description,
            "phone": salon.phone,
            "email": salon.email,
            "address": salon.address,
            "website": salon.website,
            "instagram": salon.instagram,
            "logo": salon.logo,
            "background_color": salon.background_color,
            "yandex_maps_widget": salon.yandex_maps_widget,
            "working_hours": salon.working_hours,
            "city": salon.city,
            "timezone": salon.timezone,
            "is_active": salon.is_active
        }
    
    # Проверяем, существует ли независимый мастер с таким доменом
    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
    if indie_master:
        user = indie_master.user
        return {
            "owner_type": "indie_master",
            "owner_id": indie_master.id,
            "name": user.full_name,
            "description": indie_master.bio or "",
            "phone": user.phone,
            "email": user.email or "",
            "website": getattr(indie_master, "website", None),
            "logo": getattr(indie_master, "logo", None),
            "address": indie_master.address,
            "city": indie_master.city,
            "timezone": indie_master.timezone,
            "experience_years": indie_master.experience_years,
            "is_active": user.is_active
        }
    
    # Проверяем, существует ли мастер с таким доменом
    master = db.query(Master).filter(Master.domain == subdomain).first()
    if master:
        # Получаем информацию о пользователе
        user = master.user
        
        # Получаем активные модули страницы мастера
        modules = db.query(MasterPageModule).filter(
            MasterPageModule.master_id == master.id,
            MasterPageModule.is_active == True
        ).order_by(MasterPageModule.position, MasterPageModule.id).all()
        
        modules_data = [
            {
                "id": module.id,
                "module_type": module.module_type,
                "position": module.position,
                "config": module.config or {}
            }
            for module in modules
        ]
        
        return {
            "owner_type": "master",
            "owner_id": master.id,
            "name": user.full_name,
            "description": master.bio,
            "phone": user.phone,
            "email": user.email,
            "website": master.website,
            "logo": master.logo,
            "background_color": master.background_color,
            "address": master.address,
            "city": master.city,
            "timezone": master.timezone,
            "experience_years": master.experience_years,
            "site_description": master.site_description,
            "is_active": user.is_active,
            "modules": modules_data
        }
    
    # Если поддомен не найден
    raise HTTPException(status_code=404, detail="Поддомен не найден")


@router.get("/{subdomain}/services")
async def get_subdomain_services(subdomain: str, db: Session = Depends(get_db)):
    """
    Получить услуги владельца поддомена
    """
    # Проверяем, существует ли салон с таким доменом
    salon = db.query(Salon).filter(Salon.domain == subdomain).first()
    if salon:
        services = []
        for service in salon.services:
            services.append({
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "duration": service.duration,
                "price": service.price,
                "category_name": service.category.name if service.category else None
            })
        return {"services": services}
    
    # Проверяем, существует ли независимый мастер с таким доменом
    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
    if indie_master:
        services = []
        for service in indie_master.services:
            services.append({
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "duration": service.duration,
                "price": service.price
            })
        return {"services": services}
    
    # Проверяем, существует ли мастер с таким доменом
    master = db.query(Master).filter(Master.domain == subdomain).first()
    if master:
        services = []
        # Используем master_services (собственные услуги мастера), а не services (услуги салона)
        for master_service in master.master_services:
            services.append({
                "id": master_service.id,
                "name": master_service.name,
                "description": master_service.description,
                "duration": master_service.duration,
                "price": master_service.price,
                "category_name": master_service.category.name if master_service.category else None
            })
        return {"services": services}
    
    # Если поддомен не найден
    raise HTTPException(status_code=404, detail="Поддомен не найден")


# Важно: этот endpoint должен быть выше /{subdomain}/... чтобы FastAPI правильно обрабатывал статический маршрут
@router.get("/services", response_model=ServicesPublicResponse)
async def get_master_services_by_id(
    master_id: int = Query(..., gt=0, description="ID мастера"),
    db: Session = Depends(get_db)
):
    """
    Получить услуги мастера по master_id (публичный endpoint для бронирования без поддомена)
    """
    # Ищем мастера по ID
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    
    # Загружаем услуги с категориями одним запросом (избегаем N+1)
    # Используем outerjoin + contains_eager для загрузки категорий из JOIN
    # Это эффективнее, чем selectinload (один запрос вместо двух)
    master_services = db.query(MasterService).filter(
        MasterService.master_id == master_id
    ).outerjoin(
        MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
    ).options(
        contains_eager(MasterService.category)  # Используем данные из JOIN, не делаем отдельный запрос
    ).order_by(
        MasterServiceCategory.name.nullslast(),  # NULL категории последними
        MasterService.name,
        MasterService.id
    ).all()
    
    # Преобразуем в публичный формат
    services = []
    for master_service in master_services:
        services.append(ServicePublicOut(
            id=master_service.id,
            name=master_service.name,
            description=master_service.description,
            duration=master_service.duration,
            price=master_service.price,
            category_name=master_service.category.name if master_service.category else None
        ))
    
    return ServicesPublicResponse(services=services)


@router.get("/{subdomain}/masters")
async def get_subdomain_masters(subdomain: str, db: Session = Depends(get_db)):
    """
    Получить мастеров салона (только для салонов)
    """
    # Проверяем, существует ли салон с таким доменом
    salon = db.query(Salon).filter(Salon.domain == subdomain).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")
    
    masters = []
    for master in salon.masters:
        user = master.user
        masters.append({
            "id": master.id,
            "name": user.full_name,
            "bio": master.bio,
            "experience_years": master.experience_years,
            "city": master.city,
            "timezone": master.timezone
        })
    
    return {"masters": masters}


@router.get("/check/{subdomain}")
async def check_subdomain_availability(subdomain: str, db: Session = Depends(get_db)):
    """
    Проверить доступность поддомена
    """
    # Проверяем, существует ли салон с таким доменом
    salon = db.query(Salon).filter(Salon.domain == subdomain).first()
    if salon:
        return {"available": False, "owner_type": "salon"}
    
    # Проверяем, существует ли независимый мастер с таким доменом
    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
    if indie_master:
        return {"available": False, "owner_type": "master"}
    
    # Проверяем, существует ли мастер с таким доменом
    master = db.query(Master).filter(Master.domain == subdomain).first()
    if master:
        return {"available": False, "owner_type": "master"}
    
    # Поддомен доступен
    return {"available": True}


@router.get("/{subdomain}/bookings-limit")
async def get_subdomain_bookings_limit(subdomain: str, db: Session = Depends(get_db)):
    """
    Получить информацию о лимите активных записей для мастера по поддомену.
    Публичный эндпоинт для проверки лимита на странице записи.
    """
    # Находим мастера по поддомену
    master = db.query(Master).filter(Master.domain == subdomain).first()
    if not master:
        # Проверяем indie_master
        indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
        if not indie_master:
            raise HTTPException(status_code=404, detail="Мастер не найден")
        master_id = indie_master.id
        user_id = indie_master.user_id
        is_indie = True
    else:
        master_id = master.id
        user_id = master.user_id
        is_indie = False
    
    # Активные будущие записи: start_time > now (UTC), без отменённых и completed — как у мастерского /bookings/limit
    from utils.master_future_bookings_query import active_future_core

    now_u = datetime.utcnow()
    core = active_future_core(now_u)
    if is_indie:
        active_bookings_count = (
            db.query(func.count(Booking.id))
            .filter(Booking.indie_master_id == master_id, core)
            .scalar() or 0
        )
    else:
        active_bookings_count = (
            db.query(func.count(Booking.id))
            .filter(Booking.master_id == master_id, core)
            .scalar() or 0
        )
    
    # Получаем план подписки
    subscription = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.subscription_type == SubscriptionType.MASTER,
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.end_date > datetime.utcnow()
    ).first()
    
    max_future_bookings = None
    plan_name = None
    is_limit_exceeded = False
    
    if subscription and subscription.plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
        if plan:
            plan_name = plan.name
            limits = plan.limits or {}
            max_future_bookings = limits.get("max_future_bookings")
            
            # Проверяем, превышен ли лимит (только если лимит установлен)
            if max_future_bookings is not None and max_future_bookings > 0:
                is_limit_exceeded = active_bookings_count >= max_future_bookings
    
    # Проверяем is_always_free
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_always_free:
        max_future_bookings = None
        is_limit_exceeded = False
    
    return {
        "current_active_bookings": active_bookings_count,
        "max_future_bookings": max_future_bookings,
        "plan_name": plan_name,
        "is_limit_exceeded": is_limit_exceeded,
        "has_limit": max_future_bookings is not None and max_future_bookings > 0
    } 
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Salon, IndieMaster, Master
from typing import Optional

router = APIRouter(prefix="/api/domain", tags=["domain"])


@router.get("/{subdomain}/info")
async def get_subdomain_info(subdomain: str, db: Session = Depends(get_db)):
    """
    Получить информацию о владельце поддомена
    """
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
        # Получаем информацию о пользователе
        user = indie_master.user
        return {
            "owner_type": "indie_master",
            "owner_id": indie_master.id,
            "name": user.full_name,
            "description": indie_master.bio,
            "phone": user.phone,
            "email": user.email,
            "website": indie_master.website,
            "logo": indie_master.logo,
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
            "is_active": user.is_active
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
        for service in master.services:
            services.append({
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "duration": service.duration,
                "price": service.price
            })
        return {"services": services}
    
    # Если поддомен не найден
    raise HTTPException(status_code=404, detail="Поддомен не найден")


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
import os
import uuid
import logging
from datetime import datetime, time, timedelta, date
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, File, Form, UploadFile, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from auth import get_current_active_user, require_master
import models
from database import get_db
from utils.booking_status import get_effective_booking_status, apply_effective_status_to_bookings

logger = logging.getLogger(__name__)
from models import Booking, Master, MasterSchedule, MasterScheduleSettings, User, BookingStatus, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterInvitation, SalonMasterInvitationStatus, ClientRestriction, Salon, SalonBranch, Income, Subscription, SubscriptionType, SubscriptionStatus, SubscriptionFreeze, ClientRestrictionRule, MasterPaymentSettings, IndieMaster
# Явный алиас для модели ограничений, чтобы не путать с pydantic-схемой
from models import ClientRestriction as ClientRestrictionModel
from schemas import Booking as BookingSchema
from schemas import Salon as SalonSchema
from schemas import Schedule as ScheduleSchema
from schemas import ScheduleCreate, User as UserSchema
from schemas import MasterScheduleSlot, MasterScheduleUpdate, MasterScheduleResponse
from utils.schedule_conflicts import get_schedule_with_conflicts, create_schedule_from_settings
from schemas import Service as ServiceSchema, ServiceCreate, ServiceUpdate, ServiceOut
from schemas import ServiceCategoryCreate, ServiceCategoryOut
from schemas import MasterServiceCategoryCreate, MasterServiceCategoryOut, MasterServiceCreate, MasterServiceUpdate, MasterServiceOut, MasterProfileUpdate, InvitationResponse, InvitationOut, ClientRestrictionCreate, ClientRestrictionUpdate, ClientRestriction, ClientRestrictionOut, ClientRestrictionList, ClientRestrictionRuleCreate, ClientRestrictionRuleUpdate, ClientRestrictionRuleOut, MasterPaymentSettingsUpdate, MasterPaymentSettingsOut, BookingCheckResponse

router = APIRouter(
    prefix="/master",
    tags=["master"],
)


@router.get("/salons", response_model=List[SalonSchema])
def get_salons(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка салонов, в которых работает мастер.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    return master.salons


@router.get("/bookings", response_model=List[BookingSchema])
def get_bookings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка всех бронирований мастера (включая прошедшие для отображения в расписании).
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.status != BookingStatus.CANCELLED,
        )
        .order_by(Booking.start_time.desc())
        .all()
    )
    
    # Применяем актуальные статусы с учетом времени
    apply_effective_status_to_bookings(bookings, db)
    
    return bookings

@router.get("/bookings/detailed")
def get_detailed_bookings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка всех бронирований мастера с полной информацией об услугах.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.status != BookingStatus.CANCELLED,
        )
        .order_by(Booking.start_time.desc())
        .all()
    )
    
    # Применяем актуальные статусы с учетом времени
    apply_effective_status_to_bookings(bookings, db)
    
    # Формируем ответ с полной информацией
    detailed_bookings = []
    for booking in bookings:
        # Получаем услугу
        service = db.query(Service).filter(Service.id == booking.service_id).first()
        
        # Получаем клиента
        client = db.query(User).filter(User.id == booking.client_id).first()
        client_name = client.full_name if client and client.full_name else "Клиент"
        
        detailed_bookings.append({
            "id": booking.id,
            "client_id": booking.client_id,
            "client_name": client_name,
            "service_id": booking.service_id,
            "service_name": service.name if service else "Услуга",
            "service_duration": service.duration if service else 60,
            "service_price": service.price if service else 0,
            "master_id": booking.master_id,
            "indie_master_id": booking.indie_master_id,
            "salon_id": booking.salon_id,
            "branch_id": booking.branch_id,
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat(),
            "status": booking.status,
            "notes": booking.notes,
            "payment_method": booking.payment_method,
            "payment_amount": booking.payment_amount,
            "created_at": booking.created_at.isoformat() if booking.created_at else None,
            "updated_at": booking.updated_at.isoformat() if booking.updated_at else None
        })
    
    return detailed_bookings


@router.get("/bookings/future")
def get_future_bookings_paginated(
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(15, ge=1, le=100, description="Количество записей на странице"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка будущих бронирований мастера с пагинацией.
    Возвращает активные записи (start_time >= сегодня 00:00, status != CANCELLED).
    Фильтры соответствуют логике подсчета активных записей в /bookings/limit.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем текущую дату с 00:00 (используем UTC для консистентности с базой данных)
    # Важно: используем datetime.utcnow() для консистентности с данными в БД
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Базовый запрос для активных записей (соответствует логике /bookings/limit)
    from sqlalchemy import or_
    base_query = (
        db.query(Booking)
        .filter(
            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
            Booking.start_time >= today_start,  # С сегодня 00:00 UTC
            Booking.status != BookingStatus.CANCELLED  # Исключаем только отмененные
        )
    )
    
    # Получаем общее количество ДО применения joinedload (для точности подсчета)
    total = base_query.count()
    
    # Теперь добавляем joinedload для загрузки связанных данных
    query = (
        base_query
        .options(
            joinedload(Booking.service),
            joinedload(Booking.client),
            joinedload(Booking.salon),
            joinedload(Booking.branch)
        )
        .order_by(Booking.start_time.asc())
    )

    # Применяем пагинацию
    offset = (page - 1) * limit
    bookings = query.offset(offset).limit(limit).all()

    # Применяем актуальные статусы с учетом времени
    apply_effective_status_to_bookings(bookings, db)

    # Формируем ответ в том же формате, что и next_bookings_list
    result = []
    for booking in bookings:
        service_name = booking.service.name if booking.service else "Неизвестная услуга"
        service_duration = booking.service.duration if booking.service else 60
        
        # Форматируем продолжительность: 30 минут, 1 час, 1,5 часа
        duration_text = ""
        if service_duration < 60:
            duration_text = f"{service_duration} минут"
        elif service_duration == 60:
            duration_text = "1 час"
        else:
            hours = service_duration // 60
            minutes = service_duration % 60
            if minutes == 0:
                duration_text = f"{hours} час" if hours == 1 else f"{hours} часа"
            elif minutes == 30:
                if hours > 0:
                    duration_text = f"{hours},{minutes // 30 * 5} часа"
                else:
                    duration_text = "1,5 часа"
            else:
                duration_text = f"{hours} ч {minutes} мин"
        
        # Форматируем дату в DD-MM-YY
        booking_date = booking.start_time.date()
        date_formatted = booking_date.strftime("%d-%m-%y")
        
        result.append({
            "date": date_formatted,  # DD-MM-YY формат
            "time": booking.start_time.time().strftime("%H:%M"),  # Без секунд
            "service_name": service_name,
            "service_duration": duration_text,
            "client_name": booking.client.full_name if booking.client else "Неизвестный клиент"
        })

    return {
        "bookings": result,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if total > 0 else 0
    }


@router.get("/past-appointments")
def get_past_appointments(
    start_date: Optional[str] = Query(None, description="Начальная дата в формате YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Конечная дата в формате YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="Фильтр по статусу: completed, cancelled, confirmed"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(20, ge=1, le=100, description="Количество записей на странице"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить прошедшие записи мастера из базы данных.
    Возвращает только РЕАЛЬНЫЕ данные из таблицы bookings.
    """
    # Находим мастера
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Строим запрос к базе данных
    query = db.query(Booking).filter(
        Booking.master_id == master.id,
        Booking.start_time < datetime.utcnow()  # Только прошедшие записи
    )

    # Применяем фильтры
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Booking.start_time >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат start_date")
    
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(Booking.start_time <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат end_date")

    if status:
        valid_statuses = ['created', 'awaiting_confirmation', 'completed', 'cancelled', 'cancelled_by_client_early', 'cancelled_by_client_late']
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Неверный статус. Доступные: {', '.join(valid_statuses)}")
        query = query.filter(Booking.status == status)

    # Получаем общее количество
    total = query.count()

    # Получаем записи с пагинацией
    bookings = query.order_by(desc(Booking.start_time)).offset((page - 1) * limit).limit(limit).all()
    
    # Применяем актуальные статусы с учетом времени
    apply_effective_status_to_bookings(bookings, db)
    
    # Формируем ответ
    appointments = []
    for booking in bookings:
        # Получаем услугу
        service = db.query(Service).filter(Service.id == booking.service_id).first()
        
        # Получаем клиента
        client = db.query(User).filter(User.id == booking.client_id).first()
        client_name = client.full_name if client and client.full_name else "Клиент"
        
        # Определяем цвет статуса
        status_color_map = {
            'created': 'blue',
            'awaiting_confirmation': 'orange',
            'completed': 'green',
            'cancelled': 'red',
            'cancelled_by_client_early': 'purple',
            'cancelled_by_client_late': 'pink',
            'confirmed': 'orange',  # для обратной совместимости
            'pending': 'orange'      # для обратной совместимости
        }
        status_color = status_color_map.get(booking.status, 'gray')

        appointments.append({
            "id": booking.id,
            "date": booking.start_time.strftime("%Y-%m-%d"),
            "time": booking.start_time.strftime("%H:%M"),
            "client_name": client_name,
            "service_name": service.name if service else "Услуга",
            "service_duration": service.duration if service else 60,
            "service_price": service.price if service else 0,
            "status": booking.status,
            "status_color": status_color,
            "payment_amount": booking.payment_amount if booking.payment_amount else 0,
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat()
        })

    return {
        "appointments": appointments,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 1
    }


@router.get("/bookings/conflicts", response_model=List[dict])
def get_booking_conflicts(
    start_date: str = Query(..., description="Начальная дата в формате YYYY-MM-DD"),
    end_date: str = Query(..., description="Конечная дата в формате YYYY-MM-DD"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение записей мастера в указанном диапазоне дат для проверки конфликтов при создании расписания.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты. Используйте YYYY-MM-DD")

    # Получаем записи в указанном диапазоне дат
    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.start_time >= datetime.combine(start_dt, datetime.min.time()),
            Booking.start_time <= datetime.combine(end_dt, datetime.max.time()),
            Booking.status != BookingStatus.CANCELLED,
        )
        .all()
    )

    # Формируем список конфликтов
    conflicts = []
    for booking in bookings:
        conflicts.append({
            "id": booking.id,
            "client_name": booking.client.full_name if booking.client else "Неизвестный клиент",
            "service_name": booking.service.name if booking.service else "Неизвестная услуга",
            "date": booking.start_time.date().isoformat(),
            "start_time": booking.start_time.time().strftime("%H:%M"),
            "end_time": booking.end_time.time().strftime("%H:%M"),
            "status": booking.status.value,
            "notes": booking.notes
        })

    return conflicts


@router.post("/schedule", response_model=ScheduleSchema)
def create_schedule(
    schedule_in: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Установка расписания доступности мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Проверка на пересечение с существующими бронированиями
    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.start_time >= schedule_in.start_time,
            Booking.end_time <= schedule_in.end_time,
            Booking.status != BookingStatus.CANCELLED,
        )
        .first()
    )

    if existing_booking:
        raise HTTPException(
            status_code=400,
            detail="Cannot set schedule: there are existing bookings in this time slot",
        )

    schedule = MasterSchedule(**schedule_in.dict(), master_id=master.id)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/schedule", response_model=List[ScheduleSchema])
def get_schedule(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение расписания мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    return master.schedule


@router.get("/profile", response_model=UserSchema)
def get_master_profile(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение профиля мастера.
    """
    return current_user


@router.get("/settings")
def get_master_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение настроек профиля мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "phone": current_user.phone,
            "full_name": current_user.full_name,
            "birth_date": current_user.birth_date,
        },
        "master": {
            "id": master.id,
            "bio": master.bio,
            "experience_years": master.experience_years,
            "can_work_independently": master.can_work_independently,
            "can_work_in_salon": master.can_work_in_salon,
            "auto_confirm_bookings": master.auto_confirm_bookings,
            "website": master.website,
            "domain": master.domain,
            "logo": master.logo,
            "photo": master.photo,
            "use_photo_as_logo": master.use_photo_as_logo,
            "address": master.address,
            "background_color": master.background_color,
            "city": master.city,
            "timezone": master.timezone,
            "site_description": master.site_description,
        }
    }


@router.get("/subscription/features")
def get_master_subscription_features(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получить информацию о доступных функциях подписки мастера.
    """
    from utils.subscription_features import get_master_features
    from models import SubscriptionType
    
    features = get_master_features(db, current_user.id)
    
    # Получаем текущее количество модулей
    from utils.subscription_features import get_current_page_modules_count
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    current_modules_count = 0
    if master:
        current_modules_count = get_current_page_modules_count(db, master.id)
    
    return {
        **features,
        "current_page_modules": current_modules_count,
        "can_add_more_modules": current_modules_count < features.get("max_page_modules", 0)
    }


@router.get("/service-functions")
def get_master_service_functions(
    function_type: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получить список service_functions для мастера (публичный эндпоинт).
    Возвращает только функции типа SUBSCRIPTION, доступные для мастера.
    """
    from models import ServiceFunction
    from sqlalchemy import or_
    
    query = db.query(ServiceFunction)
    
    # По умолчанию возвращаем только активные функции типа SUBSCRIPTION
    query = query.filter(ServiceFunction.function_type == "SUBSCRIPTION")
    
    if is_active is not None:
        query = query.filter(ServiceFunction.is_active == is_active)
    
    if function_type:
        db_function_type = function_type.upper()
        query = query.filter(ServiceFunction.function_type == db_function_type)
    
    functions = query.order_by(ServiceFunction.display_order, ServiceFunction.id).all()
    
    return [
        {
            "id": func.id,
            "name": func.name,
            "display_name": func.display_name,
            "description": func.description,
            "function_type": func.function_type,
            "is_active": func.is_active,
            "display_order": func.display_order,
            "created_at": func.created_at,
            "updated_at": func.updated_at
        }
        for func in functions
    ]


@router.get("/bookings/limit")
def get_master_bookings_limit(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получить информацию о лимите активных записей мастера.
    Возвращает текущее количество активных записей и лимит из плана подписки.
    """
    from sqlalchemy import func, or_
    from models import Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Получаем текущую дату с 00:00 UTC (для консистентности с данными в БД)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Подсчитываем все активные записи (start_time >= сегодня 00:00 UTC)
    # Учитываем записи как для мастера, так и для indie_master
    active_bookings_count = (
        db.query(func.count(Booking.id))
        .filter(
            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
            Booking.start_time >= today_start,
            Booking.status != BookingStatus.CANCELLED  # Исключаем отмененные
        )
        .scalar() or 0
    )
    
    # Получаем план подписки
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
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
            
            # Если план Free и лимит не установлен, используем значение по умолчанию 30
            # (не обновляем базу данных здесь, это должно делаться через скрипт)
            if plan_name == "Free" and (max_future_bookings is None or max_future_bookings == 0):
                max_future_bookings = 30
                logger.warning(f"План Free не имеет установленного лимита, используем значение по умолчанию: 30")
            
            # Проверяем, превышен ли лимит (только если лимит установлен)
            if max_future_bookings is not None and max_future_bookings > 0:
                is_limit_exceeded = active_bookings_count >= max_future_bookings
    
    # Если пользователь is_always_free, лимит не применяется
    if current_user.is_always_free:
        max_future_bookings = None
        is_limit_exceeded = False
    
    has_limit = max_future_bookings is not None and max_future_bookings > 0
    
    # Логирование для отладки
    logger.info(f"Bookings limit check - Master: {master.id}, Plan: {plan_name}, "
                f"Active bookings: {active_bookings_count}, Limit: {max_future_bookings}, "
                f"Has limit: {has_limit}, Exceeded: {is_limit_exceeded}")
    
    return {
        "current_active_bookings": active_bookings_count,
        "max_future_bookings": max_future_bookings,
        "plan_name": plan_name,
        "is_limit_exceeded": is_limit_exceeded,
        "has_limit": has_limit
    }


@router.put("/profile", response_model=UserSchema)
async def update_master_profile(
    full_name: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    birth_date: Optional[str] = Form(None),
    can_work_independently: Optional[bool] = Form(None),
    can_work_in_salon: Optional[bool] = Form(None),
    website: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    experience_years: Optional[int] = Form(None),
    city: Optional[str] = Form(None),
    timezone: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    background_color: Optional[str] = Form(None),
    site_description: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    logo: Optional[UploadFile] = File(None),
    use_photo_as_logo: Optional[bool] = Form(None),
    auto_confirm_bookings: Optional[bool] = Form(None),  # Автоматическое подтверждение записей
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = Form(None),
    missed_sessions_blacklist_threshold: Optional[int] = Form(None),
    cancellation_grace_period_hours: Optional[int] = Form(None),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Обновление профиля мастера с поддержкой загрузки файлов.
    """
    # Получаем профиль мастера
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    # Валидация обязательных полей
    if (city and not city) or (timezone and not timezone):
        raise HTTPException(status_code=422, detail="Город и таймзона обязательны для заполнения")
    if (not city and not master.city) or (not timezone and not master.timezone):
        raise HTTPException(status_code=422, detail="Город и таймзона обязательны для заполнения")
    
    # Обновляем поля пользователя
    if full_name is not None:
        current_user.full_name = full_name
    if phone is not None:
        current_user.phone = phone
    if email is not None:
        current_user.email = email
    if birth_date is not None:
        current_user.birth_date = birth_date
    
    # Обновляем поля мастера
    if can_work_independently is not None:
        master.can_work_independently = can_work_independently
    
    # Автоматическая генерация domain при включении самостоятельной работы
    # Проверяем, включена ли самостоятельная работа (новое значение или уже было True)
    is_independent = (can_work_independently is not None and can_work_independently) or \
                     (can_work_independently is None and master.can_work_independently)
    
    if is_independent:
        # Если domain не указан или пустой, генерируем автоматически
        if not master.domain or master.domain == '':
            from utils.base62 import generate_unique_domain
            master.domain = generate_unique_domain(master.id, db)
        # Если domain указан явно в запросе, проверяем доступ к функции изменения домена
        elif domain is not None and domain != master.domain:
            from utils.subscription_features import can_customize_domain
            from fastapi import status
            
            # Проверяем доступ к функции изменения домена
            if not can_customize_domain(db, current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Изменение URL домена доступно только на планах Basic и выше. Обновите подписку для доступа к этой функции."
                )
            
            from utils.base62 import is_domain_unique
            if is_domain_unique(domain, db, exclude_master_id=master.id):
                master.domain = domain
            else:
                raise HTTPException(status_code=400, detail="Домен уже занят другим мастером")
    
    # Дополнительная проверка будет выполнена перед db.commit()
    
    if can_work_in_salon is not None:
        master.can_work_in_salon = can_work_in_salon
    if website is not None:
        master.website = website
    # domain обрабатывается выше при can_work_independently
    if bio is not None:
        master.bio = bio
    if experience_years is not None:
        master.experience_years = experience_years
    if city is not None:
        master.city = city
    if timezone is not None:
        master.timezone = timezone
    if address is not None:
        master.address = address
    if background_color is not None:
        master.background_color = background_color
    
    if site_description is not None:
        master.site_description = site_description
    
    if auto_confirm_bookings is not None:
        master.auto_confirm_bookings = auto_confirm_bookings
    
    # Обработка флага use_photo_as_logo
    if use_photo_as_logo is not None:
        master.use_photo_as_logo = use_photo_as_logo
        
        # Если установлен флаг и есть фото, копируем фото как логотип
        if use_photo_as_logo and master.photo and os.path.exists(master.photo):
            # Создаем папку для логотипов, если её нет
            logo_upload_dir = "uploads/logos"
            os.makedirs(logo_upload_dir, exist_ok=True)
            
            # Получаем расширение файла из фото
            file_extension = os.path.splitext(master.photo)[1]
            logo_filename = f"{uuid.uuid4()}{file_extension}"
            logo_file_path = os.path.join(logo_upload_dir, logo_filename)
            
            # Копируем файл
            with open(master.photo, "rb") as source:
                with open(logo_file_path, "wb") as dest:
                    dest.write(source.read())
            
            # Удаляем старый логотип, если он есть
            if master.logo and os.path.exists(master.logo):
                try:
                    os.remove(master.logo)
                except:
                    pass
            
            # Сохраняем путь к новому логотипу
            master.logo = logo_file_path
        elif not use_photo_as_logo:
            # Если флаг снят, удаляем логотип, если он был скопирован из фото
            if master.logo and os.path.exists(master.logo):
                try:
                    os.remove(master.logo)
                    master.logo = None
                except:
                    pass
    
    # Обработка загрузки фото мастера
    if photo:
        # Проверяем размер файла (1.5 МБ)
        if photo.size > 1572864:
            raise HTTPException(status_code=400, detail="Размер файла не должен превышать 1.5 МБ")
        
        # Проверяем тип файла
        if not photo.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Файл должен быть изображением")
        
        # Создаем папку для загрузок, если её нет
        upload_dir = "uploads/photos"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Генерируем уникальное имя файла
        file_extension = os.path.splitext(photo.filename)[1]
        filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            content = await photo.read()
            buffer.write(content)
        
        # Удаляем старое фото, если оно есть
        if master.photo and os.path.exists(master.photo):
            try:
                os.remove(master.photo)
            except:
                pass
        
        # Сохраняем путь к новому фото
        master.photo = file_path
        
        # Если установлен флажок "Использовать на моем сайте", копируем фото как логотип
        if master.use_photo_as_logo:
            # Создаем папку для логотипов, если её нет
            logo_upload_dir = "uploads/logos"
            os.makedirs(logo_upload_dir, exist_ok=True)
            
            # Генерируем уникальное имя файла для логотипа
            logo_filename = f"{uuid.uuid4()}{file_extension}"
            logo_file_path = os.path.join(logo_upload_dir, logo_filename)
            
            # Копируем файл
            with open(file_path, "rb") as source:
                with open(logo_file_path, "wb") as dest:
                    dest.write(source.read())
            
            # Удаляем старый логотип, если он есть
            if master.logo and os.path.exists(master.logo):
                try:
                    os.remove(master.logo)
                except:
                    pass
            
            # Сохраняем путь к новому логотипу
            master.logo = logo_file_path
    
    # Обработка загрузки логотипа (только если не используется фото как логотип)
    if logo and not master.use_photo_as_logo:
        # Проверяем размер файла (1.5 МБ)
        if logo.size > 1572864:
            raise HTTPException(status_code=400, detail="Размер файла не должен превышать 1.5 МБ")
        
        # Проверяем тип файла
        if not logo.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Файл должен быть изображением")
        
        # Создаем папку для загрузок, если её нет
        upload_dir = "uploads/logos"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Генерируем уникальное имя файла
        file_extension = os.path.splitext(logo.filename)[1]
        filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            content = await logo.read()
            buffer.write(content)
        
        # Удаляем старый логотип, если он есть
        if master.logo and os.path.exists(master.logo):
            try:
                os.remove(master.logo)
            except:
                pass
        
        # Сохраняем путь к новому логотипу
        master.logo = file_path
    
    # Обновляем настройки автоматизации ограничений
    if missed_sessions_advance_payment_threshold is not None:
        master.missed_sessions_advance_payment_threshold = missed_sessions_advance_payment_threshold
    if missed_sessions_blacklist_threshold is not None:
        master.missed_sessions_blacklist_threshold = missed_sessions_blacklist_threshold
    if cancellation_grace_period_hours is not None:
        master.cancellation_grace_period_hours = cancellation_grace_period_hours
    
    # Дополнительная проверка: если мастер уже имеет can_work_independently=True, 
    # но domain пустой (например, после миграции или при обновлении других полей),
    # генерируем domain автоматически
    # Это должно быть после всех обновлений полей, но перед сохранением
    if master.can_work_independently and (not master.domain or master.domain == ''):
        from utils.base62 import generate_unique_domain
        logger.info(f"Генерируем domain для мастера {master.id}, can_work_independently={master.can_work_independently}, domain={master.domain}")
        master.domain = generate_unique_domain(master.id, db)
        logger.info(f"Сгенерирован domain: {master.domain}")
    
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    db.refresh(master)  # Обновляем master, чтобы получить сгенерированный domain
    return current_user


@router.get("/schedule/weekly", response_model=MasterScheduleResponse)
def get_master_weekly_schedule(
    week_offset: int = Query(0, description="Смещение недели (0 = текущая, 1 = следующая, -1 = предыдущая)"),
    weeks_ahead: int = Query(3, description="Количество недель вперед для загрузки"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение недельного расписания мастера в формате слотов.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем даты недели с учетом offset
    today = datetime.utcnow().date()
    current_day = today.weekday()  # 0 = понедельник, 6 = воскресенье
    
    # Находим понедельник текущей недели
    monday = today - timedelta(days=current_day)
    
    logger.debug(f"Исходный понедельник: {monday}")
    logger.debug(f"week_offset: {week_offset}")
    logger.debug(f"weeks_ahead: {weeks_ahead}")
    
    # Добавляем offset недель
    monday = monday + timedelta(days=week_offset * 7)
    
    logger.debug(f"Понедельник после offset: {monday}")
    
    # Получаем существующее расписание для текущей недели и следующих недель
    week_start = monday
    week_end = monday + timedelta(days=(weeks_ahead * 7) - 1)
    logger.debug(f"week_offset={week_offset}, weeks_ahead={weeks_ahead}, получаем расписание с {week_start} по {week_end}")
    
    # Получаем расписание с информацией о конфликтах
    schedule_slots = get_schedule_with_conflicts(db, master.id, week_start, week_end)
    
    logger.debug(f"Найдено слотов с конфликтами: {len(schedule_slots)}")
    
    # Создаем словарь для быстрого поиска
    schedule_dict = {}
    for slot in schedule_slots:
        day_key = f"{slot['schedule_date']}_{slot['hour']}_{slot['minute']}"
        schedule_dict[day_key] = slot

    # Получаем информацию о замороженных днях
    frozen_dates = set()
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.subscription_type == SubscriptionType.MASTER,
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.is_active == True
    ).first()
    
    if subscription:
        # Получаем активные заморозки
        now = datetime.utcnow()
        active_freezes = db.query(SubscriptionFreeze).filter(
            SubscriptionFreeze.subscription_id == subscription.id,
            SubscriptionFreeze.is_cancelled == False,
            SubscriptionFreeze.end_date >= now  # Только будущие или текущие заморозки
        ).all()
        
        # Создаем множество замороженных дат
        for freeze in active_freezes:
            current_freeze_date = freeze.start_date.date()
            end_freeze_date = freeze.end_date.date()
            while current_freeze_date <= end_freeze_date:
                frozen_dates.add(current_freeze_date)
                current_freeze_date += timedelta(days=1)
    
    # Генерируем все слоты для текущей недели и следующих недель
    slots = []
    for week in range(weeks_ahead):
        for i in range(7):  # 7 дней недели
            current_date = monday + timedelta(days=(week * 7) + i)
            is_frozen = current_date in frozen_dates
            for hour in range(24):  # 0:00 - 23:00
                for minute in [0, 30]:  # Слоты по 30 минут для компактности
                    day_key = f"{current_date}_{hour}_{minute}"
                    slot_data = schedule_dict.get(day_key, {
                        'is_working': False,
                        'work_type': None,
                        'has_conflict': False,
                        'conflict_type': None
                    })
                    
                    slots.append(MasterScheduleSlot(
                        schedule_date=current_date,
                        hour=hour,
                        minute=minute,
                        is_working=slot_data['is_working'],
                        work_type=slot_data.get('work_type'),
                        has_conflict=slot_data.get('has_conflict', False),
                        conflict_type=slot_data.get('conflict_type'),
                        is_frozen=is_frozen
                    ))

    return MasterScheduleResponse(slots=slots)


@router.get("/schedule/monthly", response_model=MasterScheduleResponse)
def get_master_monthly_schedule(
    year: int = Query(..., description="Год"),
    month: int = Query(..., description="Месяц (1-12)"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение месячного расписания мастера в формате слотов.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем даты месяца
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)
    
    logger.debug(f"Месячное расписание с {month_start} по {month_end}")
    
    # Получаем расписание с информацией о конфликтах
    schedule_slots = get_schedule_with_conflicts(db, master.id, month_start, month_end)
    
    logger.debug(f"Найдено слотов с конфликтами: {len(schedule_slots)}")
    
    # Создаем словарь для быстрого поиска
    schedule_dict = {}
    for slot in schedule_slots:
        day_key = f"{slot['schedule_date']}_{slot['hour']}_{slot['minute']}"
        schedule_dict[day_key] = slot

    # Получаем информацию о замороженных днях
    frozen_dates = set()
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.subscription_type == SubscriptionType.MASTER,
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.is_active == True
    ).first()
    
    if subscription:
        # Получаем активные заморозки
        now = datetime.utcnow()
        active_freezes = db.query(SubscriptionFreeze).filter(
            SubscriptionFreeze.subscription_id == subscription.id,
            SubscriptionFreeze.is_cancelled == False,
            SubscriptionFreeze.end_date >= now  # Только будущие или текущие заморозки
        ).all()
        
        # Создаем множество замороженных дат
        for freeze in active_freezes:
            current_freeze_date = freeze.start_date.date()
            end_freeze_date = freeze.end_date.date()
            while current_freeze_date <= end_freeze_date:
                frozen_dates.add(current_freeze_date)
                current_freeze_date += timedelta(days=1)
    
    # Генерируем все слоты для месяца
    slots = []
    current_date = month_start
    while current_date <= month_end:
        is_frozen = current_date in frozen_dates
        for hour in range(24):
            for minute in [0, 30]:  # Слоты по 30 минут для компактности
                day_key = f"{current_date}_{hour}_{minute}"
                slot_data = schedule_dict.get(day_key, {
                    'is_working': False,
                    'work_type': None,
                    'has_conflict': False,
                    'conflict_type': None
                })
                
                slots.append(MasterScheduleSlot(
                    schedule_date=current_date,
                    hour=hour,
                    minute=minute,
                    is_working=slot_data['is_working'],
                    work_type=slot_data.get('work_type'),
                    has_conflict=slot_data.get('has_conflict', False),
                    conflict_type=slot_data.get('conflict_type'),
                    is_frozen=is_frozen
                ))
        
        current_date += timedelta(days=1)

    return MasterScheduleResponse(slots=slots)


@router.get("/schedule/rules")
def get_schedule_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение правил расписания мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем настройки расписания
    settings = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master.id
    ).first()

    if not settings:
        return {
            "message": "Настройки расписания не найдены",
            "has_settings": False
        }

    return {
        "has_settings": True,
        "fixed_schedule": settings.fixed_schedule,
        "created_at": settings.created_at,
        "updated_at": settings.updated_at
    }


@router.post("/schedule/rules", response_model=dict)
def create_schedule_rules(
    rules_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Создание расписания по правилам (дни недели, числа месяца, сменный график).
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    schedule_type = rules_data.get('type')
    valid_until = rules_data.get('validUntil')
    
    if not schedule_type or not valid_until:
        raise HTTPException(status_code=400, detail="Не указан тип расписания или дата окончания")

    # Парсим дату окончания
    try:
        valid_until_date = datetime.strptime(valid_until, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты окончания")

    # Генерируем слоты расписания на основе правил
    slots_to_create = []
    
    logger.info(f"Создание расписания типа: {schedule_type}")
    logger.debug(f"Дата окончания: {valid_until_date}")
    
    if schedule_type == 'weekdays':
        weekdays = rules_data.get('weekdays', {})
        if not weekdays:
            raise HTTPException(status_code=400, detail="Не выбраны рабочие дни")
        
        logger.debug(f"Выбранные дни недели: {weekdays}")
        
        # Генерируем слоты для каждого дня недели до даты окончания
        current_date = datetime.now().date()
        logger.debug(f"Начинаем с даты: {current_date}")
        
        while current_date <= valid_until_date:
            weekday = current_date.weekday()  # 0 = понедельник, 6 = воскресенье
            # Преобразуем в формат 1-7 (пн-вс)
            weekday_key = weekday + 1  # Понедельник = 1, воскресенье = 7
            
            logger.debug(f"Дата {current_date}, день недели {weekday}, ключ {weekday_key}")
            
            if str(weekday_key) in weekdays:
                day_config = weekdays[str(weekday_key)]
                start_time = day_config.get('start', '09:00')
                end_time = day_config.get('end', '18:00')
                
                logger.debug(f"Создаем слоты для {current_date} с {start_time} до {end_time}")
                
                # Создаем слоты по 30 минут
                start_hour, start_minute = map(int, start_time.split(':'))
                end_hour, end_minute = map(int, end_time.split(':'))
                
                current_hour = start_hour
                current_minute = start_minute
                
                # Округляем начальную минуту до ближайшего кратного 30
                if current_minute > 0 and current_minute < 30:
                    current_minute = 30
                elif current_minute > 30:
                    current_hour += 1
                    current_minute = 0
                
                while (current_hour < end_hour or (current_hour == end_hour and current_minute < end_minute)):
                    slots_to_create.append({
                        'date': current_date,
                        'hour': current_hour,
                        'minute': current_minute,
                        'is_working': True
                    })
                    
                    current_minute += 30
                    if current_minute >= 60:
                        current_hour += 1
                        current_minute = 0
                        
            current_date += timedelta(days=1)
    
    elif schedule_type == 'monthdays':
        monthdays = rules_data.get('monthdays', {})
        if not monthdays:
            raise HTTPException(status_code=400, detail="Не выбраны числа месяца")
        
        # Генерируем слоты для каждого числа месяца до даты окончания
        current_date = datetime.now().date()
        while current_date <= valid_until_date:
            day_of_month = current_date.day
            
            if str(day_of_month) in monthdays:
                day_config = monthdays[str(day_of_month)]
                start_time = day_config.get('start', '09:00')
                end_time = day_config.get('end', '18:00')
                
                # Создаем слоты по 30 минут
                start_hour, start_minute = map(int, start_time.split(':'))
                end_hour, end_minute = map(int, end_time.split(':'))
                
                current_hour = start_hour
                current_minute = start_minute
                
                # Округляем начальную минуту до ближайшего кратного 30
                if current_minute > 0 and current_minute < 30:
                    current_minute = 30
                elif current_minute > 30:
                    current_hour += 1
                    current_minute = 0
                
                while (current_hour < end_hour or (current_hour == end_hour and current_minute < end_minute)):
                    slots_to_create.append({
                        'date': current_date,
                        'hour': current_hour,
                        'minute': current_minute,
                        'is_working': True
                    })
                    
                    current_minute += 30
                    if current_minute >= 60:
                        current_hour += 1
                        current_minute = 0
                        
            current_date += timedelta(days=1)
    
    elif schedule_type == 'shift':
        shift_config = rules_data.get('shiftConfig', {})
        work_days = shift_config.get('workDays', 2)
        rest_days = shift_config.get('restDays', 1)
        start_date_str = shift_config.get('startDate')
        
        if not start_date_str:
            raise HTTPException(status_code=400, detail="Не указана дата начала сменного графика")
        
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты начала")
        
        # Генерируем слоты для сменного графика
        current_date = start_date
        cycle_length = work_days + rest_days
        day_in_cycle = 0
        
        while current_date <= valid_until_date:
            if day_in_cycle < work_days:  # Рабочий день
                # Создаем слоты с 09:00 до 18:00
                for hour in range(9, 18):
                    for minute in [0, 30]:
                        slots_to_create.append({
                            'date': current_date,
                            'hour': hour,
                            'minute': minute,
                            'is_working': True
                        })
            
            day_in_cycle += 1
            if day_in_cycle >= cycle_length:
                day_in_cycle = 0
                
            current_date += timedelta(days=1)
    
    logger.info(f"Всего слотов для создания: {len(slots_to_create)}")
    
    # Проверяем конфликты с существующими записями
    conflicts = []
    if slots_to_create:
        min_date = min(slot['date'] for slot in slots_to_create)
        max_date = max(slot['date'] for slot in slots_to_create)
        
        # Получаем записи в диапазоне дат
        bookings = (
            db.query(Booking)
            .filter(
                Booking.master_id == master.id,
                Booking.start_time >= datetime.combine(min_date, datetime.min.time()),
                Booking.start_time <= datetime.combine(max_date, datetime.max.time()),
                Booking.status != BookingStatus.CANCELLED,
            )
            .all()
        )
        
        # Проверяем каждый слот на конфликт с записями
        for slot_data in slots_to_create:
            slot_start = datetime.combine(slot_data['date'], time(hour=slot_data['hour'], minute=slot_data['minute']))
            slot_end = slot_start + timedelta(minutes=30)
            
            for booking in bookings:
                if (slot_start < booking.end_time and slot_end > booking.start_time):
                    conflicts.append({
                        "booking_id": booking.id,
                        "client_name": booking.client.full_name if booking.client else "Неизвестный клиент",
                        "service_name": booking.service.name if booking.service else "Неизвестная услуга",
                        "date": slot_data['date'].isoformat(),
                        "start_time": f"{slot_data['hour']:02d}:{slot_data['minute']:02d}",
                        "end_time": f"{slot_data['hour']:02d}:{slot_data['minute'] + 30:02d}",
                        "booking_start": booking.start_time.time().strftime("%H:%M"),
                        "booking_end": booking.end_time.time().strftime("%H:%M"),
                        "status": booking.status.value,
                        "notes": booking.notes
                    })
                    break  # Один слот может конфликтовать только с одной записью
    
    # Удаляем только слоты БЕЗ записей
    if slots_to_create:
        min_date = min(slot['date'] for slot in slots_to_create)
        max_date = max(slot['date'] for slot in slots_to_create)
        
        # Получаем ID записей для исключения из удаления
        booking_ids = [conflict['booking_id'] for conflict in conflicts]
        
        # Удаляем слоты, которые не конфликтуют с записями
        existing_slots = db.query(MasterSchedule).filter(
            MasterSchedule.master_id == master.id,
            MasterSchedule.date >= min_date,
            MasterSchedule.date <= max_date
        ).all()
        
        for slot in existing_slots:
            # Проверяем, есть ли запись в этом слоте
            slot_start = datetime.combine(slot.date, slot.start_time)
            slot_end = datetime.combine(slot.date, slot.end_time)
            
            has_booking = False
            for booking in bookings:
                if (slot_start < booking.end_time and slot_end > booking.start_time):
                    has_booking = True
                    break
            
            # Удаляем слот только если в нем нет записи
            if not has_booking:
                db.delete(slot)
        
        # Создаем новые слоты
        for slot_data in slots_to_create:
            start_time = time(hour=slot_data['hour'], minute=slot_data['minute'])
            end_minute = slot_data['minute'] + 30
            end_hour = slot_data['hour']
            if end_minute >= 60:
                end_hour += 1
                end_minute -= 60
            if end_hour == 24:
                end_hour = 23
                end_minute = 59
            end_time = time(hour=end_hour, minute=end_minute)
            
            schedule = MasterSchedule(
                master_id=master.id,
                date=slot_data['date'],
                start_time=start_time,
                end_time=end_time,
                is_available=slot_data['is_working']
            )
            db.add(schedule)
        
        db.commit()
    
    return {
        "message": "Расписание успешно создано", 
        "slots_created": len(slots_to_create),
        "conflicts": conflicts
    }


@router.put("/schedule/weekly", response_model=MasterScheduleResponse)
def update_master_weekly_schedule(
    schedule_update: MasterScheduleUpdate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Обновление недельного расписания мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем даты текущей недели
    today = datetime.utcnow().date()
    current_day = today.weekday()  # 0 = понедельник, 6 = воскресенье
    monday = today - timedelta(days=current_day)
    week_start = monday
    week_end = monday + timedelta(days=6)

    # Удаляем существующее расписание для текущей недели
    db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master.id,
        MasterSchedule.date >= week_start,
        MasterSchedule.date <= week_end
    ).delete()

    # Создаем новое расписание из слотов
    for slot in schedule_update.slots:
        # Создаем time для start_time и end_time (end_time = start_time + 30 минут)
        start_time = time(hour=slot.hour, minute=slot.minute, second=0, microsecond=0)
        
        # Вычисляем end_time (start_time + 30 минут)
        end_minute = slot.minute + 30
        end_hour = slot.hour
        if end_minute >= 60:
            end_hour += 1
            end_minute -= 60
        # Исправление: если end_hour == 24, выставляем 23:59
        if end_hour == 24:
            end_hour = 23
            end_minute = 59
        end_time = time(hour=end_hour, minute=end_minute, second=0, microsecond=0)

        schedule = MasterSchedule(
            master_id=master.id,
            date=slot.schedule_date,
            start_time=start_time,
            end_time=end_time,
            is_available=slot.is_working
        )
        db.add(schedule)

    db.commit()

    # Возвращаем обновленное расписание
    return get_master_weekly_schedule(db, current_user)

# Категории услуг мастера
@router.get("/categories", response_model=List[MasterServiceCategoryOut])
def get_master_categories(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    """
    Получение категорий услуг мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    # Получаем категории с количеством услуг
    categories = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.master_id == master.id
    ).all()
    
    # Добавляем количество услуг для каждой категории
    result = []
    for category in categories:
        service_count = db.query(MasterService).filter(
            MasterService.category_id == category.id
        ).count()
        
        result.append({
            "id": category.id,
            "name": category.name,
            "master_id": category.master_id,
            "created_at": category.created_at,
            "service_count": service_count
        })
    
    return result

@router.post("/categories", response_model=MasterServiceCategoryOut)
def create_master_category(
    category_in: MasterServiceCategoryCreate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    """
    Создание новой категории услуг мастера.
    """
    logger.info(f"Creating category for user: {current_user.email}, role: {current_user.role}")
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        logger.warning(f"Профиль мастера не найден for user {current_user.id}")
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    logger.debug(f"Found master: {master.id}")
    
    # Проверяем уникальность названия категории для этого мастера
    existing_category = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.master_id == master.id,
        MasterServiceCategory.name == category_in.name
    ).first()
    
    if existing_category:
        raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
    
    # Создаем категорию для мастера
    category = MasterServiceCategory(
        name=category_in.name, 
        master_id=master.id
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    logger.info(f"Created category: {category.id}")
    return category

@router.put("/categories/{category_id}", response_model=MasterServiceCategoryOut)
def update_master_category(
    category_id: int,
    category_in: MasterServiceCategoryCreate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    """
    Обновление категории услуг мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    category = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.id == category_id, 
        MasterServiceCategory.master_id == master.id
    ).first()
    if not category:
        raise HTTPException(status_code=400, detail="Неверная категория для этого мастера")
    
    # Проверяем уникальность названия категории для этого мастера (исключая текущую категорию)
    existing_category = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.master_id == master.id,
        MasterServiceCategory.name == category_in.name,
        MasterServiceCategory.id != category_id
    ).first()
    
    if existing_category:
        raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
    
    category.name = category_in.name
    db.commit()
    db.refresh(category)
    return category

@router.delete("/categories/{category_id}")
def delete_master_category(
    category_id: int,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    """
    Удаление категории услуг мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    category = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.id == category_id, 
        MasterServiceCategory.master_id == master.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    
    # Удаляем все услуги в этой категории
    services = db.query(MasterService).filter(MasterService.category_id == category_id).all()
    for service in services:
        db.delete(service)
    
    # Удаляем саму категорию
    db.delete(category)
    db.commit()
    
    return {"message": "Категория и все связанные услуги успешно удалены"}

# Управление услугами мастера
@router.get("/services", response_model=List[MasterServiceOut])
def get_master_services(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение услуг мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    # Получаем услуги из таблицы master_services_list
    services = db.query(MasterService).filter(MasterService.master_id == master.id).all()
    
    # Преобразуем в нужный формат
    result = []
    for service in services:
        category_name = None
        if service.category_id:
            category = db.query(MasterServiceCategory).filter(
                MasterServiceCategory.id == service.category_id
            ).first()
            if category:
                category_name = category.name
        
        result.append({
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "category_id": service.category_id,
            "category_name": category_name,
            "price": service.price,
            "duration": service.duration,
            "master_id": master.id,
            "created_at": service.created_at
        })
    
    return result

@router.post("/services", response_model=MasterServiceOut)
def create_master_service(
    service_in: MasterServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание новой услуги мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    # Проверяем, что категория принадлежит мастеру
    category = db.query(MasterServiceCategory).filter(
        MasterServiceCategory.id == service_in.category_id, 
        MasterServiceCategory.master_id == master.id
    ).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category for this master")
    
    # Проверяем уникальность названия услуги для этого мастера
    existing_service = db.query(MasterService).filter(
        MasterService.master_id == master.id,
        MasterService.name == service_in.name
    ).first()
    
    if existing_service:
        raise HTTPException(status_code=400, detail="Услуга с таким названием уже существует")
    
    service = MasterService(
        name=service_in.name,
        description=service_in.description,
        duration=service_in.duration,
        price=service_in.price,
        master_id=master.id,
        category_id=service_in.category_id
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    
    # Возвращаем в формате MasterServiceOut
    return {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "category_id": service.category_id,
        "category_name": category.name,
        "price": service.price,
        "duration": service.duration,
        "master_id": service.master_id,
        "created_at": service.created_at
    }

@router.put("/services/{service_id}", response_model=MasterServiceOut)
def update_master_service(
    service_id: int,
    service_in: MasterServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление услуги мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    service = db.query(MasterService).filter(
        MasterService.id == service_id,
        MasterService.master_id == master.id
    ).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    
    # Обновляем поля
    if service_in.name is not None:
        # Проверяем уникальность названия услуги для этого мастера (исключая текущую услугу)
        existing_service = db.query(MasterService).filter(
            MasterService.master_id == master.id,
            MasterService.name == service_in.name,
            MasterService.id != service_id
        ).first()
        
        if existing_service:
            raise HTTPException(status_code=400, detail="Услуга с таким названием уже существует")
        
        service.name = service_in.name
    if service_in.description is not None:
        service.description = service_in.description
    if service_in.duration is not None:
        service.duration = service_in.duration
    if service_in.price is not None:
        service.price = service_in.price
    if service_in.category_id is not None:
        # Проверяем, что новая категория принадлежит мастеру
        category = db.query(MasterServiceCategory).filter(
            MasterServiceCategory.id == service_in.category_id,
            MasterServiceCategory.master_id == master.id
        ).first()
        if not category:
            raise HTTPException(status_code=400, detail="Неверная категория для этого мастера")
        service.category_id = service_in.category_id
    
    db.commit()
    db.refresh(service)
    
    # Получаем информацию о категории для ответа
    category = db.query(MasterServiceCategory).filter(MasterServiceCategory.id == service.category_id).first()
    
    return {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "category_id": service.category_id,
        "category_name": category.name if category else "",
        "price": service.price,
        "duration": service.duration,
        "master_id": service.master_id,
        "created_at": service.created_at
    }

@router.delete("/services/{service_id}")
def delete_master_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Удаление услуги мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    service = db.query(MasterService).filter(
        MasterService.id == service_id,
        MasterService.master_id == master.id
    ).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    
    db.delete(service)
    db.commit()
    
    return {"message": "Услуга успешно удалена"}

@router.post("/test-category", response_model=MasterServiceCategoryOut)
def test_create_category(
    category_in: MasterServiceCategoryCreate,
    db: Session = Depends(get_db)
):
    """
    Тестовый эндпоинт для создания категории без аутентификации.
    """
    # Используем первого мастера для теста
    master = db.query(Master).first()
    if not master:
        raise HTTPException(status_code=404, detail="No master found")
    
    # Создаем категорию для мастера
    category = MasterServiceCategory(
        name=category_in.name, 
        master_id=master.id
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.post("/invitations/{invitation_id}/respond")
def respond_to_invitation(
    invitation_id: int,
    response_data: InvitationResponse,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Принять или отклонить приглашение в салон.
    """
    # Получаем профиль мастера
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем приглашение
    invitation = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.id == invitation_id,
        SalonMasterInvitation.master_id == master.id,
        SalonMasterInvitation.status == SalonMasterInvitationStatus.PENDING
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Приглашение не найдено или уже обработано")

    if response_data.response == "accept":
        # Добавляем мастера в салон
        salon = invitation.salon
        salon.masters.append(master)
        invitation.status = SalonMasterInvitationStatus.ACCEPTED
        db.commit()
        return {"message": "Приглашение принято"}
    
    elif response_data.response == "decline":
        # Отклоняем приглашение
        invitation.status = SalonMasterInvitationStatus.DECLINED
        db.commit()
        return {"message": "Приглашение отклонено"}
    
    else:
        raise HTTPException(status_code=400, detail="Неверный ответ. Используйте 'accept' или 'decline'")

@router.get("/invitations", response_model=List[InvitationOut])
def get_master_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить список приглашений мастера в салоны.
    """
    # Получаем профиль мастера
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем только pending приглашения мастера с данными салона
    invitations = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.master_id == master.id,
        SalonMasterInvitation.status == SalonMasterInvitationStatus.PENDING
    ).all()
    
    # Формируем ответ с нужными полями
    result = []
    for invitation in invitations:
        result.append({
            "id": invitation.id,
            "salon_id": invitation.salon_id,
            "salon_name": invitation.salon.name,
            "salon_phone": invitation.salon.phone,
            "status": invitation.status.value,
            "created_at": invitation.created_at,
            "updated_at": invitation.updated_at
        })
    
    return result

def get_working_days_from_schedule(schedule_settings, target_date):
    """
    Определяет, является ли дата рабочим днем на основе настроек расписания.
    """
    if not schedule_settings or not schedule_settings.fixed_schedule:
        return False
    
    fixed_schedule = schedule_settings.fixed_schedule
    
    if fixed_schedule.get('type') == 'weekdays':
        # Для дней недели проверяем, входит ли день недели в список рабочих дней
        weekday = target_date.weekday()
        # Преобразуем в формат 0-6 (пн-вс) в 1-7 (пн-вс)
        weekday_adjusted = weekday if weekday != 6 else 0  # Воскресенье = 0
        return weekday_adjusted in fixed_schedule.get('weekdays', [])
    
    elif fixed_schedule.get('type') == 'shift_schedule':
        # Для сменного графика вычисляем рабочие дни
        start_date_str = fixed_schedule.get('startDate')
        if not start_date_str:
            return False
        
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        except:
            return False
        
        work_days = fixed_schedule.get('workDays', 2)
        rest_days = fixed_schedule.get('restDays', 2)
        cycle_length = work_days + rest_days
        
        # Вычисляем количество дней от начала графика
        days_from_start = (target_date - start_date).days
        
        if days_from_start < 0:
            return False
        
        # Определяем позицию в цикле
        position_in_cycle = days_from_start % cycle_length
        
        # Если позиция меньше количества рабочих дней, то это рабочий день
        return position_in_cycle < work_days
    
    return False


@router.get("/salon-work", response_model=dict)
def get_salon_work_data(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение данных о работе мастера в салонах.
    Включает расписание, услуги и бронирования.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Получаем салоны где работает мастер
    working_salons = master.salons
    
    # Получаем приглашения
    invitations = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.master_id == master.id
    ).all()

    # Получаем бронирования мастера в салонах
    salon_bookings = db.query(Booking).filter(
        Booking.master_id == master.id,
        Booking.salon_id.isnot(None)
    ).order_by(Booking.start_time.desc()).all()

    # Формируем данные о салонах с расписанием и услугами
    salons_data = []
    for salon in working_salons:
        # Получаем услуги салона, которые может оказывать мастер
        salon_services = db.query(Service).filter(
            Service.salon_id == salon.id
        ).all()
        
        # Получаем бронирования в этом салоне
        salon_bookings_list = [b for b in salon_bookings if b.salon_id == salon.id]
        
        # Получаем настройки расписания мастера для этого салона
        schedule_settings = db.query(MasterScheduleSettings).filter(
            MasterScheduleSettings.master_id == master.id,
            MasterScheduleSettings.salon_id == salon.id
        ).first()
        
        # Получаем расписание мастера в этом салоне (если есть)
        master_schedule = db.query(MasterSchedule).filter(
            MasterSchedule.master_id == master.id
        ).all()
        
        # Генерируем расписание на основе настроек
        generated_schedule = []
        if schedule_settings and schedule_settings.fixed_schedule:
            fixed_schedule = schedule_settings.fixed_schedule
            
            # Генерируем расписание на ближайшие 30 дней
            today = date.today()
            
            for i in range(30):
                current_date = today + timedelta(days=i)
                is_working_day = get_working_days_from_schedule(schedule_settings, current_date)
                
                if is_working_day:
                    # Определяем время работы
                    if fixed_schedule.get('type') == 'weekdays':
                        # Для дней недели используем время из weekdayTimes
                        weekday = current_date.weekday()
                        weekday_adjusted = weekday if weekday != 6 else 0
                        weekday_times = fixed_schedule.get('weekdayTimes', {}).get(str(weekday_adjusted), {})
                        start_time = weekday_times.get('start', '09:00')
                        end_time = weekday_times.get('end', '18:00')
                    else:
                        # Для сменного графика используем общее время
                        start_time = fixed_schedule.get('workStartTime', '09:00')
                        end_time = fixed_schedule.get('workEndTime', '18:00')
                    
                    generated_schedule.append({
                        "date": current_date,
                        "start_time": start_time,
                        "end_time": end_time,
                        "is_available": True,
                        "is_generated": True
                    })
        
        salons_data.append({
            "salon_id": salon.id,
            "salon_name": salon.name,
            "salon_phone": salon.phone,
            "address": salon.address,
            "email": salon.email,
            "working_hours": salon.working_hours,
            "logo": salon.logo,
            "services": [
                {
                    "service_id": service.id,
                    "service_name": service.name,
                    "service_price": service.price,
                    "service_duration": service.duration,
                    "master_earnings": service.price * 0.7,  # По умолчанию 70% от цены
                    "is_active": True
                }
                for service in salon_services
            ],
            "bookings": [
                {
                    "booking_id": booking.id,
                    "client_name": booking.client.full_name if booking.client else "Неизвестно",
                    "service_name": booking.service.name if booking.service else "Неизвестно",
                    "service_price": booking.service.price if booking.service else 0,
                    "service_duration": booking.service.duration if booking.service else 0,
                    "master_earnings": (booking.service.price * 0.7) if booking.service else 0,
                    "start_time": booking.start_time,
                    "end_time": booking.end_time,
                    "status": booking.status.value,
                    "notes": booking.notes
                }
                for booking in salon_bookings_list
            ],
            "schedule": generated_schedule + [
                {
                    "date": schedule.date,
                    "start_time": schedule.start_time,
                    "end_time": schedule.end_time,
                    "is_available": schedule.is_available,
                    "is_generated": False
                }
                for schedule in master_schedule
            ]
        })

    return {
        "working_salons": salons_data,
        "pending_invitations": [
            {
                "id": inv.id,
                "salon_name": inv.salon.name,
                "salon_phone": inv.salon.phone,
                "status": inv.status.value,
                "created_at": inv.created_at
            }
            for inv in invitations if inv.status == SalonMasterInvitationStatus.PENDING
        ]
    }


@router.get("/salon-work/schedule")
def get_salon_work_schedule(
    salon_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить расписание работы мастера в конкретном салоне.
    Возвращает только слоты, назначенные салоном для работы мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Проверяем, что мастер работает в этом салоне
    salon = db.query(Salon).filter(Salon.id == salon_id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")
    
    # Проверяем связь мастер-салон
    if master not in salon.masters:
        raise HTTPException(status_code=403, detail="Мастер не работает в этом салоне")

    # Получаем расписание мастера в этом салоне
    master_schedule = db.query(MasterSchedule).filter(
        MasterSchedule.master_id == master.id,
        MasterSchedule.salon_id == salon_id,
        MasterSchedule.date >= start_date,
        MasterSchedule.date <= end_date
    ).all()

    # Формируем расписание в формате слотов
    schedule = {}
    for schedule_item in master_schedule:
        if schedule_item.is_available:
            # Генерируем слоты для всего диапазона времени
            date_str = schedule_item.date.strftime('%Y-%m-%d')
            start_hour = schedule_item.start_time.hour
            start_minute = schedule_item.start_time.minute
            end_hour = schedule_item.end_time.hour
            end_minute = schedule_item.end_time.minute
            
            # Генерируем слоты с интервалом 30 минут
            current_hour = start_hour
            current_minute = start_minute
            
            # Округляем начальную минуту до ближайшего кратного 30
            if current_minute > 0 and current_minute < 30:
                current_minute = 30
            elif current_minute > 30:
                current_hour += 1
                current_minute = 0
            
            while current_hour < end_hour or (current_hour == end_hour and current_minute < end_minute):
                slot_key = f"{date_str}_{current_hour:02d}_{current_minute:02d}"
                schedule[slot_key] = True
                
                # Переходим к следующему слоту
                current_minute += 30
                if current_minute >= 60:
                    current_minute = 0
                    current_hour += 1

    return {
        "schedule": schedule,
        "salon_id": salon_id,
        "start_date": start_date,
        "end_date": end_date
    }


@router.put("/salon-work/schedule")
def update_salon_work_schedule(
    salon_id: int,
    updates: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Обновить расписание работы мастера в салоне.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    # Проверяем, что мастер работает в этом салоне
    salon = db.query(Salon).filter(Salon.id == salon_id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")
    
    if master not in salon.masters:
        raise HTTPException(status_code=403, detail="Мастер не работает в этом салоне")

    # Обрабатываем обновления
    for slot_key, is_working in updates.items():
        # Парсим slot_key: "YYYY-MM-DD_HH_MM"
        try:
            date_str, hour_str, minute_str = slot_key.split('_')
            slot_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            slot_hour = int(hour_str)
            slot_minute = int(minute_str)
            slot_time = time(slot_hour, slot_minute)
        except ValueError:
            continue

        # Ищем существующую запись расписания
        existing_schedule = db.query(MasterSchedule).filter(
            MasterSchedule.master_id == master.id,
            MasterSchedule.salon_id == salon_id,
            MasterSchedule.date == slot_date,
            MasterSchedule.start_time <= slot_time,
            MasterSchedule.end_time > slot_time
        ).first()

        if is_working:
            if not existing_schedule:
                # Создаем новую запись
                new_schedule = MasterSchedule(
                    master_id=master.id,
                    salon_id=salon_id,
                    date=slot_date,
                    start_time=slot_time,
                    end_time=time(slot_hour, slot_minute + 30 if slot_minute == 0 else slot_hour + 1, 0),
                    is_available=True
                )
                db.add(new_schedule)
        else:
            if existing_schedule:
                # Удаляем запись
                db.delete(existing_schedule)

    db.commit()
    return {"message": "Расписание обновлено"}


# API для ограничений клиентов (только для мастеров-индивидуалов)
@router.get("/restrictions", response_model=ClientRestrictionList)
def get_master_restrictions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение всех ограничений мастера-индивидуала"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что мастер работает индивидуально
    if not master.can_work_independently:
        raise HTTPException(status_code=403, detail="Only independent masters can manage restrictions")
    
    # Используем модель БД, а не pydantic-схему
    restrictions = db.query(ClientRestrictionModel).filter(
        ClientRestrictionModel.indie_master_id == master.id,
        ClientRestrictionModel.is_active == True
    ).all()
    
    blacklist = [r for r in restrictions if r.restriction_type == 'blacklist']
    advance_payment_only = [r for r in restrictions if r.restriction_type == 'advance_payment_only']
    
    return ClientRestrictionList(
        blacklist=blacklist,
        advance_payment_only=advance_payment_only,
        total_restrictions=len(restrictions)
    )


@router.post("/restrictions", response_model=ClientRestriction)
def create_master_restriction(
    restriction: ClientRestrictionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание ограничения для клиента"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что мастер работает индивидуально
    if not master.can_work_independently:
        raise HTTPException(status_code=403, detail="Only independent masters can manage restrictions")
    
    # Проверяем, не существует ли уже такое ограничение
    existing = db.query(ClientRestrictionModel).filter(
        ClientRestrictionModel.indie_master_id == master.id,
        ClientRestrictionModel.client_phone == restriction.client_phone,
        ClientRestrictionModel.restriction_type == restriction.restriction_type,
        ClientRestrictionModel.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Restriction already exists for this client")
    
    new_restriction = ClientRestrictionModel(
        indie_master_id=master.id,
        client_phone=restriction.client_phone,
        restriction_type=restriction.restriction_type,
        reason=restriction.reason
    )
    
    db.add(new_restriction)
    db.commit()
    db.refresh(new_restriction)
    
    return new_restriction


@router.put("/restrictions/{restriction_id}", response_model=ClientRestriction)
def update_master_restriction(
    restriction_id: int,
    restriction_update: ClientRestrictionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновление ограничения"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что мастер работает индивидуально
    if not master.can_work_independently:
        raise HTTPException(status_code=403, detail="Only independent masters can manage restrictions")
    
    restriction = db.query(ClientRestriction).filter(
        ClientRestriction.id == restriction_id,
        ClientRestriction.indie_master_id == master.id
    ).first()
    
    if not restriction:
        raise HTTPException(status_code=404, detail="Restriction not found")
    
    # Обновляем поля
    for field, value in restriction_update.dict(exclude_unset=True).items():
        setattr(restriction, field, value)
    
    restriction.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(restriction)
    
    return restriction


@router.delete("/restrictions/{restriction_id}")
def delete_master_restriction(
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Удаление ограничения (деактивация)"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что мастер работает индивидуально
    if not master.can_work_independently:
        raise HTTPException(status_code=403, detail="Only independent masters can manage restrictions")
    
    restriction = db.query(ClientRestriction).filter(
        ClientRestriction.id == restriction_id,
        ClientRestriction.indie_master_id == master.id
    ).first()
    
    if not restriction:
        raise HTTPException(status_code=404, detail="Restriction not found")
    
    # Деактивируем ограничение
    restriction.is_active = False
    restriction.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Restriction deactivated successfully"}


@router.post("/restrictions/check")
def check_master_client_restriction(
    client_phone: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Проверка ограничений для клиента"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что мастер работает индивидуально
    if not master.can_work_independently:
        raise HTTPException(status_code=403, detail="Only independent masters can manage restrictions")
    
    restrictions = db.query(ClientRestriction).filter(
        ClientRestriction.indie_master_id == master.id,
        ClientRestriction.client_phone == client_phone,
        ClientRestriction.is_active == True
    ).all()
    
    result = {
        "is_blacklisted": False,
        "advance_payment_only": False,
        "restrictions": []
    }
    
    for restriction in restrictions:
        if restriction.restriction_type == 'blacklist':
            result["is_blacklisted"] = True
        elif restriction.restriction_type == 'advance_payment_only':
            result["advance_payment_only"] = True
        
        result["restrictions"].append({
            "type": restriction.restriction_type,
            "reason": restriction.reason
        })
    
    return result


# ========== ЭНДПОИНТЫ ДЛЯ АВТОМАТИЧЕСКИХ ПРАВИЛ ОГРАНИЧЕНИЙ ==========

@router.get("/restriction-rules", response_model=List[ClientRestrictionRuleOut])
def get_master_restriction_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение всех правил автоматических ограничений мастера"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    rules = db.query(ClientRestrictionRule).filter(
        ClientRestrictionRule.master_id == master.id
    ).order_by(ClientRestrictionRule.created_at.desc()).all()
    
    return rules


@router.post("/restriction-rules", response_model=ClientRestrictionRuleOut)
def create_master_restriction_rule(
    rule: ClientRestrictionRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание нового правила автоматического ограничения"""
    from utils.client_restrictions import validate_restriction_rule, get_cancellation_reasons
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Валидация данных
    if rule.period_days and rule.period_days not in [30, 60, 90, 180, 365]:
        raise HTTPException(
            status_code=400, 
            detail="Период проверки должен быть одним из: 30, 60, 90, 180, 365 дней или null (все время)"
        )
    
    if rule.cancellation_reason not in get_cancellation_reasons():
        raise HTTPException(
            status_code=400,
            detail=f"Неверная причина отмены. Доступные: {', '.join(get_cancellation_reasons().keys())}"
        )
    
    # Валидация правила на противоречия
    rule_data = rule.dict()
    is_valid, error_message = validate_restriction_rule(db, master.id, rule_data)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message)
    
    # Создаем правило
    new_rule = ClientRestrictionRule(
        master_id=master.id,
        cancellation_reason=rule.cancellation_reason,
        cancel_count=rule.cancel_count,
        period_days=rule.period_days,
        restriction_type=rule.restriction_type
    )
    
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    
    return new_rule


@router.put("/restriction-rules/{rule_id}", response_model=ClientRestrictionRuleOut)
def update_master_restriction_rule(
    rule_id: int,
    rule_update: ClientRestrictionRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновление правила автоматического ограничения"""
    from utils.client_restrictions import validate_restriction_rule, get_cancellation_reasons
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    rule = db.query(ClientRestrictionRule).filter(
        ClientRestrictionRule.id == rule_id,
        ClientRestrictionRule.master_id == master.id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Restriction rule not found")
    
    # Обновляем поля
    update_data = rule_update.dict(exclude_unset=True)
    
    # Валидация периода
    if 'period_days' in update_data and update_data['period_days'] is not None:
        if update_data['period_days'] not in [30, 60, 90, 180, 365]:
            raise HTTPException(
                status_code=400,
                detail="Период проверки должен быть одним из: 30, 60, 90, 180, 365 дней или null (все время)"
            )
    
    # Валидация причины отмены
    if 'cancellation_reason' in update_data:
        if update_data['cancellation_reason'] not in get_cancellation_reasons():
            raise HTTPException(
                status_code=400,
                detail=f"Неверная причина отмены. Доступные: {', '.join(get_cancellation_reasons().keys())}"
            )
    
    # Формируем данные для валидации (используем существующие значения для полей, которые не обновляются)
    rule_data = {
        'cancellation_reason': update_data.get('cancellation_reason', rule.cancellation_reason),
        'cancel_count': update_data.get('cancel_count', rule.cancel_count),
        'restriction_type': update_data.get('restriction_type', rule.restriction_type)
    }
    
    # Валидация правила на противоречия
    is_valid, error_message = validate_restriction_rule(db, master.id, rule_data, exclude_rule_id=rule_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message)
    
    # Применяем обновления
    for field, value in update_data.items():
        setattr(rule, field, value)
    
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    
    return rule


@router.delete("/restriction-rules/{rule_id}")
def delete_master_restriction_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Удаление правила автоматического ограничения"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    rule = db.query(ClientRestrictionRule).filter(
        ClientRestrictionRule.id == rule_id,
        ClientRestrictionRule.master_id == master.id
    ).first()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Restriction rule not found")
    
    db.delete(rule)
    db.commit()
    
    return {"message": "Restriction rule deleted successfully"}


# ========== ЭНДПОИНТЫ ДЛЯ НАСТРОЕК ОПЛАТЫ ==========

@router.get("/payment-settings", response_model=MasterPaymentSettingsOut)
def get_master_payment_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение настроек оплаты мастера"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    settings = db.query(MasterPaymentSettings).filter(
        MasterPaymentSettings.master_id == master.id
    ).first()
    
    # Если настроек нет, создаем со значениями по умолчанию
    if not settings:
        settings = MasterPaymentSettings(
            master_id=master.id,
            accepts_online_payment=False
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


@router.put("/payment-settings", response_model=MasterPaymentSettingsOut)
def update_master_payment_settings(
    settings_update: MasterPaymentSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновление настроек оплаты мастера"""
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    settings = db.query(MasterPaymentSettings).filter(
        MasterPaymentSettings.master_id == master.id
    ).first()
    
    # Если настроек нет, создаем
    if not settings:
        settings = MasterPaymentSettings(
            master_id=master.id,
            accepts_online_payment=settings_update.accepts_online_payment or False
        )
        db.add(settings)
    else:
        # Обновляем существующие настройки
        if settings_update.accepts_online_payment is not None:
            settings.accepts_online_payment = settings_update.accepts_online_payment
        settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    return settings


# ========== ЭНДПОИНТ ДЛЯ ПРОВЕРКИ ВОЗМОЖНОСТИ БРОНИРОВАНИЯ ==========

@router.post("/check-booking-eligibility", response_model=BookingCheckResponse)
def check_booking_eligibility(
    client_phone: str = Body(..., embed=True),
    client_id: Optional[int] = Body(None, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Проверка возможности бронирования для клиента"""
    from utils.client_restrictions import check_client_restrictions
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    result = check_client_restrictions(db, master.id, client_id, client_phone)
    
    return BookingCheckResponse(
        is_blocked=result['is_blocked'],
        requires_advance_payment=result['requires_advance_payment'],
        reason=result.get('reason'),
        applied_rule_id=result.get('applied_rule_id')
    )


# Новые эндпоинты для мастерского дашборда
@router.get("/dashboard/stats")
def get_master_dashboard_stats(
    period: str = Query("week", description="Period: day, week, month, quarter, year"),
    offset: int = Query(0, description="Time offset for navigation"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение статистики для мастерского дашборда.
    """
    import sys
    import traceback
    print("=" * 50, file=sys.stderr)
    print("DEBUG: ====== НАЧАЛО get_master_dashboard_stats =====", file=sys.stderr)
    print(f"DEBUG: period={period}, offset={offset}, user_id={current_user.id}", file=sys.stderr)
    sys.stderr.flush()
    try:
        logger.info("🔍 ШАГ 0: Начало функции get_master_dashboard_stats")
        logger.info(f"🔍 ШАГ 0: Параметры - period={period}, offset={offset}, user_id={current_user.id}")
        print("DEBUG: Начало функции get_master_dashboard_stats", file=sys.stderr)
        sys.stderr.flush()
        logger.info("🔍 ШАГ 0.1: Импорты выполняются")
        from sqlalchemy import func, or_
        from models import Income, Service, SalonBranch, BookingStatus, Subscription, IndieMaster, Salon
        
        logger.info(f"🔍 ШАГ 0.2: Ищем мастера для user_id={current_user.id}")
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            logger.error(f"❌ ШАГ 0.2: Мастер не найден для user_id={current_user.id}")
            raise HTTPException(status_code=404, detail="Master profile not found")
        logger.info(f"✅ ШАГ 0.2: Мастер найден, id={master.id}")
        
        # Проверяем, является ли мастер индивидуалом
        logger.info("🔍 ШАГ 0.3: Проверяем, является ли мастер индивидуалом")
        is_indie_master = master.can_work_independently
        logger.info(f"✅ ШАГ 0.3: is_indie_master={is_indie_master}")
        
        # Получаем информацию о подписке (если мастер индивидуал)
        subscription_info = None
        if is_indie_master:
            # Получаем реальную информацию о подписке
            from models import SubscriptionType
            subscription = db.query(Subscription).filter(
                Subscription.user_id == current_user.id,
                Subscription.subscription_type == SubscriptionType.MASTER,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.is_active == True,
                Subscription.end_date > datetime.utcnow()
            ).first()
            
            if subscription:
                # Проверяем, является ли план Free
                from models import SubscriptionPlan
                plan = None
                is_free_plan = False
                plan_display_name = None
                if subscription.plan_id:
                    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
                    if plan:
                        plan_display_name = plan.display_name
                        if plan.name == "Free":
                            is_free_plan = True
                
                if is_free_plan:
                    # Для Free плана не показываем дни и дату окончания
                    subscription_info = {
                        "is_active": True,
                        "expires_at": None,
                        "days_remaining": None,
                        "is_unlimited": True,
                        "plan_display_name": plan_display_name
                    }
                else:
                    days_remaining = max(0, (subscription.end_date - datetime.utcnow()).days)
                    subscription_info = {
                        "is_active": True,  # Всегда True, так как подписка прошла проверку выше
                        "expires_at": subscription.end_date.strftime("%d-%m-%Y"),
                        "days_remaining": days_remaining,
                        "is_unlimited": False,
                        "plan_display_name": plan_display_name
                    }
            else:
                subscription_info = {
                    "is_active": False,
                    "expires_at": None,
                    "days_remaining": 0,
                    "is_unlimited": False,
                    "plan_display_name": None
                }
        
        # Ближайший рабочий день и время первой записи
        from datetime import timedelta, date
        today = date.today()
        
        # Функция для расчета периодов
        def get_period_dates(period_type: str, offset: int = 0):
            today = datetime.now().date()
            
            if period_type == "day":
                # День: сегодня + 2 дня до и 2 дня после
                base_date = today + timedelta(days=offset)
                periods = []
                for i in range(-2, 3):  # -2, -1, 0, 1, 2
                    period_date = base_date + timedelta(days=i)
                    periods.append({
                        'start': period_date,
                        'end': period_date,
                        'label': period_date.strftime("%d-%m"),
                        'is_current': i == 0,
                        'is_past': i < 0,
                        'is_future': i > 0
                    })
                return periods
            
            elif period_type == "week":
                # Неделя: 5 недель (-2, -1, 0, +1, +2)
                current_week_monday = today - timedelta(days=today.weekday()) + timedelta(days=offset * 7)
                periods = []
                for i in range(-2, 3):
                    week_monday = current_week_monday + timedelta(days=i * 7)
                    week_sunday = week_monday + timedelta(days=6)
                    periods.append({
                        'start': week_monday,
                        'end': week_sunday,
                        'label': week_monday.strftime("%d-%m"),
                        'is_current': i == 0,
                        'is_past': i < 0,
                        'is_future': i > 0
                    })
                return periods
            
            elif period_type == "month":
                # Месяц: 5 месяцев (-2, -1, 0, +1, +2)
                current_month = today.replace(day=1) + timedelta(days=offset * 32)  # Примерное смещение
                # Корректируем на первый день месяца
                current_month = current_month.replace(day=1)
                periods = []
                for i in range(-2, 3):
                    # Вычисляем месяц с учетом смещения
                    if i == 0:
                        month_start = current_month
                    else:
                        # Добавляем месяцы
                        month_start = current_month
                        for _ in range(abs(i)):
                            if i > 0:
                                # Следующий месяц
                                if month_start.month == 12:
                                    month_start = month_start.replace(year=month_start.year + 1, month=1)
                                else:
                                    month_start = month_start.replace(month=month_start.month + 1)
                            else:
                                # Предыдущий месяц
                                if month_start.month == 1:
                                    month_start = month_start.replace(year=month_start.year - 1, month=12)
                                else:
                                    month_start = month_start.replace(month=month_start.month - 1)
                    
                    # Последний день месяца
                    if month_start.month == 12:
                        next_month = month_start.replace(year=month_start.year + 1, month=1)
                    else:
                        next_month = month_start.replace(month=month_start.month + 1)
                    month_end = next_month - timedelta(days=1)
                    
                    periods.append({
                        'start': month_start,
                        'end': month_end,
                        'label': month_start.strftime("%m-%Y"),
                        'is_current': i == 0,
                        'is_past': i < 0,
                        'is_future': i > 0
                    })
                return periods
            
            elif period_type == "quarter":
                # Квартал: 5 кварталов (-2, -1, 0, +1, +2)
                current_year = today.year
                current_quarter = (today.month - 1) // 3 + 1 + offset
                # Корректируем год и квартал
                while current_quarter > 4:
                    current_quarter -= 4
                    current_year += 1
                while current_quarter < 1:
                    current_quarter += 4
                    current_year -= 1
                
                periods = []
                for i in range(-2, 3):
                    quarter = current_quarter + i
                    year = current_year
                    # Корректируем квартал и год
                    while quarter > 4:
                        quarter -= 4
                        year += 1
                    while quarter < 1:
                        quarter += 4
                        year -= 1
                    
                    # Первый месяц квартала
                    quarter_start_month = (quarter - 1) * 3 + 1
                    quarter_start = date(year, quarter_start_month, 1)
                    
                    # Последний месяц квартала
                    quarter_end_month = quarter * 3
                    quarter_end = date(year, quarter_end_month, 1)
                    # Последний день месяца
                    if quarter_end_month == 12:
                        next_month = date(year + 1, 1, 1)
                    else:
                        next_month = date(year, quarter_end_month + 1, 1)
                    quarter_end = next_month - timedelta(days=1)
                    
                    periods.append({
                        'start': quarter_start,
                        'end': quarter_end,
                        'label': f"Q{quarter} {year}",
                        'is_current': i == 0,
                        'is_past': i < 0,
                        'is_future': i > 0
                    })
                return periods
            
            elif period_type == "year":
                # Год: 5 лет (-2, -1, 0, +1, +2)
                current_year = today.year + offset
                periods = []
                for i in range(-2, 3):
                    year = current_year + i
                    year_start = date(year, 1, 1)
                    year_end = date(year, 12, 31)
                    
                    periods.append({
                        'start': year_start,
                        'end': year_end,
                        'label': str(year),
                        'is_current': i == 0,
                        'is_past': i < 0,
                        'is_future': i > 0
                    })
                return periods
            
            return []
        
        # Получаем периоды для выбранного типа
        periods = get_period_dates(period, offset)
        
        # Находим текущий период для расчета динамики
        current_period = next((p for p in periods if p['is_current']), None)
        previous_period = None
        
        if current_period:
            # Находим предыдущий период
            current_index = periods.index(current_period)
            if current_index > 0:
                previous_period = periods[current_index - 1]
        
        logger.debug(f"Период: {period}, offset: {offset}")
        logger.debug(f"Текущий период: {current_period}")
        logger.debug(f"Предыдущий период: {previous_period}")
        
        # Статистика за текущий период
        current_bookings = 0
        current_income = 0
        if current_period:
            # Конвертируем date в datetime для сравнения
            period_start_dt = datetime.combine(current_period['start'], datetime.min.time())
            period_end_dt = datetime.combine(current_period['end'], datetime.max.time())
            
            current_bookings = (
                db.query(func.count(Booking.id))
                .filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= period_start_dt,
                    Booking.start_time <= period_end_dt
                )
                .scalar() or 0
            )
            
            current_income = (
                db.query(func.sum(Booking.payment_amount))
                .filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= period_start_dt,
                    Booking.start_time <= period_end_dt
                )
                .scalar() or 0
            )
        
        # Статистика за предыдущий период
        previous_bookings = 0
        previous_income = 0
        if previous_period:
            # Конвертируем date в datetime для сравнения
            prev_period_start_dt = datetime.combine(previous_period['start'], datetime.min.time())
            prev_period_end_dt = datetime.combine(previous_period['end'], datetime.max.time())
            
            previous_bookings = (
                db.query(func.count(Booking.id))
                .filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= prev_period_start_dt,
                    Booking.start_time <= prev_period_end_dt
                )
                .scalar() or 0
            )
            
            previous_income = (
                db.query(func.sum(Booking.payment_amount))
                .filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= prev_period_start_dt,
                    Booking.start_time <= prev_period_end_dt
                )
                .scalar() or 0
            )
        
        # Расчет динамики
        income_dynamics = 0
        if previous_income and previous_income > 0:
            income_dynamics = ((current_income - previous_income) / previous_income) * 100
        
        bookings_dynamics = 0
        if previous_bookings and previous_bookings > 0:
            bookings_dynamics = ((current_bookings - previous_bookings) / previous_bookings) * 100
        
        logger.info(f"💰 Доходы: текущий период {current_income} ₽, предыдущий период {previous_income} ₽, динамика {income_dynamics:.1f}%")
        logger.info(f"📅 Записи: текущий период {current_bookings}, предыдущий период {previous_bookings}")
        logger.info("🔍 Шаг 1: Расчет доходов и записей завершен")
        
        # Будущие записи (все после текущего периода)
        future_bookings = 0
        if current_period and 'end' in current_period:
            try:
                period_end_dt = datetime.combine(current_period['end'], datetime.max.time())
                future_bookings = (
                    db.query(func.count(Booking.id))
                    .filter(
                        or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                        Booking.start_time > period_end_dt
                    )
                    .scalar() or 0
                )
            except Exception as e:
                logger.error(f"Ошибка при расчете будущих записей: {e}")
                future_bookings = 0
        
        logger.info("🔍 Шаг 2: Начинаем получение ближайших записей")
        # Получаем ближайшие записи (до 3 штук, отсортированные по времени записи)
        next_bookings = (
            db.query(Booking)
            .options(
                joinedload(Booking.service),
                joinedload(Booking.client),
                joinedload(Booking.salon),
                joinedload(Booking.branch)
            )
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.start_time > datetime.utcnow(),
                Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
            )
            .order_by(Booking.start_time.asc())
            .limit(3)
            .all()
        )
        
        # Формируем массив из 3 ближайших записей для фронтенда
        next_bookings_list = []
        for booking in next_bookings:
            service_name = booking.service.name if booking.service else "Неизвестная услуга"
            service_duration = booking.service.duration if booking.service else 60
            
            # Форматируем продолжительность: 30 минут, 1 час, 1,5 часа
            duration_text = ""
            if service_duration < 60:
                duration_text = f"{service_duration} минут"
            elif service_duration == 60:
                duration_text = "1 час"
            else:
                hours = service_duration // 60
                minutes = service_duration % 60
                if minutes == 0:
                    duration_text = f"{hours} час" if hours == 1 else f"{hours} часа"
                elif minutes == 30:
                    # Для 90 минут = 1,5 часа, для 150 минут = 2,5 часа и т.д.
                    if hours > 0:
                        duration_text = f"{hours},{minutes // 30 * 5} часа"
                    else:
                        duration_text = "1,5 часа"
                else:
                    duration_text = f"{hours} ч {minutes} мин"
            
            # Форматируем дату в DD-MM-YY
            booking_date = booking.start_time.date()
            date_formatted = booking_date.strftime("%d-%m-%y")
            
            next_bookings_list.append({
                "date": date_formatted,  # DD-MM-YY формат
                "time": booking.start_time.time().strftime("%H:%M"),  # Без секунд
                "service_name": service_name,
                "service_duration": duration_text,
                "client_name": booking.client.full_name if booking.client else "Неизвестный клиент"
            })
        
        # Для обратной совместимости оставляем next_working_info (только первая запись)
        next_working_info = None
        if next_bookings:
            next_booking = next_bookings[0]
            # Определяем место работы
            work_location = "Собственная запись"
            if next_booking.salon_id:
                salon = db.query(Salon).filter(Salon.id == next_booking.salon_id).first()
                if salon:
                    work_location = salon.name
                if next_booking.branch_id:
                    branch = db.query(SalonBranch).filter(SalonBranch.id == next_booking.branch_id).first()
                    if branch:
                        work_location += f" - {branch.name}"
            
            # Безопасная сериализация даты и времени
            booking_date = next_booking.start_time.date() if hasattr(next_booking.start_time, 'date') else None
            booking_time = next_booking.start_time.time() if hasattr(next_booking.start_time, 'time') else None
            
            next_working_info = {
                "next_booking_date": booking_date.isoformat() if booking_date else None,
                "next_booking_time": booking_time.isoformat() if booking_time else None,
                "work_location": work_location,
                "client_name": next_booking.client.full_name if next_booking.client else "Неизвестный клиент",
                "service_name": next_booking.service.name if next_booking.service else "Неизвестная услуга"
            }
        
        logger.info("🔍 Шаг 3: Начинаем расчет данных для периодов")
        # Расчет данных для периодов (для гистограмм)
        periods_data = []
        for period_data in periods:
            # Конвертируем date в datetime для сравнения
            period_start_dt = datetime.combine(period_data['start'], datetime.min.time())
            period_end_dt = datetime.combine(period_data['end'], datetime.max.time())
            
            # Количество записей
            period_bookings = (
                db.query(func.count(Booking.id))
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= period_start_dt,
                    Booking.start_time <= period_end_dt
            )
            .scalar() or 0
        )
        
            # Доход
            period_income = (
            db.query(func.sum(Booking.payment_amount))
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                    Booking.start_time >= period_start_dt,
                    Booking.start_time <= period_end_dt
            )
            .scalar() or 0
        )
        
            periods_data.append({
                "period_label": period_data['label'],
                "period_start": period_data['start'].isoformat(),
                "period_end": period_data['end'].isoformat(),
                "bookings": period_bookings,
                "income": float(period_income),
                "is_current": period_data['is_current'],
                "is_past": period_data['is_past'],
                "is_future": period_data['is_future']
            })
        
        # Подготовим границы для агрегатов по услугам в зависимости от периода
        # Дашборд (без периода) или period='week' с offset=0: текущая неделя + 2 прошлые
        # День: последние 7 дней
        # Неделя: текущая неделя + 2 прошлые
        # Месяц: текущий месяц + 2 прошлых
        # Квартал: только текущий квартал (с начала квартала)
        # Год: только текущий год (с начала года)
        
        today = datetime.now().date()
        agg_start = None
        agg_end = None
        
        if period == "day":
            # Последние 7 дней
            agg_start = today - timedelta(days=6)
            agg_end = today
        elif period == "week":
            # Текущая неделя + 2 прошлые (всего 3 недели)
            current_week_monday = today - timedelta(days=today.weekday())
            agg_start = current_week_monday - timedelta(days=14)  # 2 недели назад
            agg_end = current_week_monday + timedelta(days=6)  # Конец текущей недели
        elif period == "month":
            # Текущий месяц + 2 прошлых
            current_month_start = today.replace(day=1)
            # Вычисляем начало 2 месяца назад
            if current_month_start.month >= 3:
                agg_start = current_month_start.replace(month=current_month_start.month - 2)
            elif current_month_start.month == 2:
                agg_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
            else:  # month == 1
                agg_start = current_month_start.replace(year=current_month_start.year - 1, month=11)
            # Конец текущего месяца
            if current_month_start.month == 12:
                next_month = current_month_start.replace(year=current_month_start.year + 1, month=1)
            else:
                next_month = current_month_start.replace(month=current_month_start.month + 1)
            agg_end = next_month - timedelta(days=1)
        elif period == "quarter":
            # Только текущий квартал
            current_quarter = (today.month - 1) // 3 + 1
            quarter_start_month = (current_quarter - 1) * 3 + 1
            agg_start = today.replace(month=quarter_start_month, day=1)
            # Конец квартала
            quarter_end_month = current_quarter * 3
            if quarter_end_month == 12:
                next_month = date(today.year + 1, 1, 1)
            else:
                next_month = date(today.year, quarter_end_month + 1, 1)
            agg_end = next_month - timedelta(days=1)
        elif period == "year":
            # Только текущий год
            agg_start = today.replace(month=1, day=1)
            agg_end = today.replace(month=12, day=31)
        else:
            # По умолчанию (для дашборда): текущая неделя + 2 прошлые
            current_week_monday = today - timedelta(days=today.weekday())
            agg_start = current_week_monday - timedelta(days=14)
            agg_end = current_week_monday + timedelta(days=6)

        logger.info("🔍 Шаг 4: Начинаем расчет топ услуг")
        # Определим профиль независимого мастера (если есть)
        indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
        
        # Для отладки - проверим, есть ли записи у мастера
        total_bookings = db.query(func.count(Booking.id)).filter(
            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
            Booking.salon_id == None
        ).scalar()
        logger.info(f"🔍 Всего записей мастера (без салона): {total_bookings}")
        
        if indie_master:
            indie_services = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
            logger.info(f"🔍 Услуг у IndieMaster: {indie_services}")
        else:
            logger.info("🔍 IndieMaster профиль не найден")

        # Топ-3 услуг по количеству записей (за текущий период)
        q_bookings = db.query(
            Booking.service_id,
            func.count(Booking.id).label("booking_count")
        )
        # Привязка к мастеру и исключение салонных записей
        if indie_master is not None:
            q_bookings = q_bookings.filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
                Booking.salon_id == None,
                Booking.status.in_([BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value])
            )
        else:
            q_bookings = q_bookings.filter(
                Booking.master_id == master.id,
                Booking.salon_id == None,
                Booking.status.in_([BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value])
            )
        # Фильтр по периоду (конвертируем date в datetime)
        if agg_start and agg_end:
            agg_start_dt = datetime.combine(agg_start, datetime.min.time()) if isinstance(agg_start, date) else agg_start
            agg_end_dt = datetime.combine(agg_end, datetime.max.time()) if isinstance(agg_end, date) else agg_end
            q_bookings = q_bookings.filter(Booking.start_time >= agg_start_dt, Booking.start_time <= agg_end_dt)
        # Если есть профиль независимого мастера, учитываем только его услуги
        # Но если у IndieMaster нет услуг, показываем все услуги мастера
        if indie_master is not None:
            indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
            if indie_services_count > 0:
                q_bookings = q_bookings.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
                logger.info("🔍 Фильтруем по IndieMaster услугам")
            else:
                logger.info("🔍 IndieMaster услуг нет, показываем все услуги мастера")
        top_services_by_bookings = q_bookings.group_by(Booking.service_id).order_by(func.count(Booking.id).desc()).limit(3).all()
        
        # Получаем названия услуг из Service (безопасно, исключаем потенциальные ошибки модели MasterService)
        service_names = {}
        for service_id, _ in top_services_by_bookings:
            service = db.query(Service).filter(Service.id == service_id).first()
            if service:
                service_names[service_id] = service.name
        
        top_services_by_bookings_with_names = [
            {
                "service_id": service_id,
                "service_name": service_names.get(service_id, "Неизвестная услуга"),
                "booking_count": count
            }
            for service_id, count in top_services_by_bookings
        ]
        
        # Топ-3 услуг по заработку за текущий период
        # Для индивидуальных мастеров используем Income.master_earnings, иначе суммируем Booking.payment_amount
        if is_indie_master:
            earnings_query = db.query(
                Booking.service_id,
                func.sum(Income.master_earnings).label("total_earnings")
            ).join(Income, Income.booking_id == Booking.id).filter(
                Income.indie_master_id == master.id,
                Booking.salon_id == None
            )
            if agg_start and agg_end:
                agg_start_dt = datetime.combine(agg_start, datetime.min.time()) if isinstance(agg_start, date) else agg_start
                agg_end_dt = datetime.combine(agg_end, datetime.max.time()) if isinstance(agg_end, date) else agg_end
                earnings_query = earnings_query.filter(Booking.start_time >= agg_start_dt, Booking.start_time <= agg_end_dt)
            if indie_master is not None:
                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
                if indie_services_count > 0:
                    earnings_query = earnings_query.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
            earnings_query = earnings_query.group_by(Booking.service_id).order_by(func.sum(Income.master_earnings).desc()).limit(3)
        else:
            if indie_master is not None:
                earnings_query = db.query(
                    Booking.service_id,
                    func.sum(Booking.payment_amount).label("total_earnings")
                ).filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
                    Booking.salon_id == None
                )
            else:
                earnings_query = db.query(
                    Booking.service_id,
                    func.sum(Booking.payment_amount).label("total_earnings")
                ).filter(
                    Booking.master_id == master.id,
                    Booking.salon_id == None
                )
            if agg_start and agg_end:
                agg_start_dt = datetime.combine(agg_start, datetime.min.time()) if isinstance(agg_start, date) else agg_start
                agg_end_dt = datetime.combine(agg_end, datetime.max.time()) if isinstance(agg_end, date) else agg_end
                earnings_query = earnings_query.filter(Booking.start_time >= agg_start_dt, Booking.start_time <= agg_end_dt)
            if indie_master is not None:
                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
                if indie_services_count > 0:
                    earnings_query = earnings_query.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
            earnings_query = earnings_query.group_by(Booking.service_id).order_by(func.sum(Booking.payment_amount).desc()).limit(3)

        top_services_by_earnings = earnings_query.all()
        # Fallback: если данных о доходах в Income нет (dev/seed), считаем по сумме оплат из Booking
        if not top_services_by_earnings:
            if indie_master is not None:
                q_fallback = db.query(
                    Booking.service_id,
                    func.sum(Booking.payment_amount).label("total_earnings")
                ).filter(
                    or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
                    Booking.salon_id == None
                )
            else:
                q_fallback = db.query(
                    Booking.service_id,
                    func.sum(Booking.payment_amount).label("total_earnings")
                ).filter(
                    Booking.master_id == master.id,
                    Booking.salon_id == None
                )
            if agg_start and agg_end:
                agg_start_dt = datetime.combine(agg_start, datetime.min.time()) if isinstance(agg_start, date) else agg_start
                agg_end_dt = datetime.combine(agg_end, datetime.max.time()) if isinstance(agg_end, date) else agg_end
                q_fallback = q_fallback.filter(Booking.start_time >= agg_start_dt, Booking.start_time <= agg_end_dt)
            if indie_master is not None:
                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
                if indie_services_count > 0:
                    q_fallback = q_fallback.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
            top_services_by_earnings = q_fallback.group_by(Booking.service_id).order_by(func.sum(Booking.payment_amount).desc()).limit(3).all()

        # Получаем названия услуг для заработка из Service
        service_earnings_names = {}
        for service_id, _ in top_services_by_earnings:
            service = db.query(Service).filter(Service.id == service_id).first()
            if service:
                service_earnings_names[service_id] = service.name
        
        top_services_by_earnings_with_names = [
            {
                "service_id": service_id,
                "service_name": service_earnings_names.get(service_id, "Неизвестная услуга"),
                "total_earnings": float(earnings or 0)
            }
            for service_id, earnings in top_services_by_earnings
        ]

        logger.info("🔍 Шаг 5: Начинаем формирование меток периода")
        # Метки периода для отображения на фронте
        # Формируем правильную метку в зависимости от периода
        top_period_label = None
        top_period_range = None
        
        # Проверяем, что agg_start и agg_end установлены
        if agg_start is None or agg_end is None:
            logger.warning(f"agg_start или agg_end равны None для периода {period}, используем значения по умолчанию")
            agg_start = today - timedelta(days=14)
            agg_end = today
        
        if period == "day":
            top_period_label = "Последние 7 дней"
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        elif period == "week":
            top_period_label = "Текущая + 2 прошлые недели"
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        elif period == "month":
            top_period_label = "Текущий + 2 прошлых месяца"
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        elif period == "quarter":
            top_period_label = f"Q{(today.month - 1) // 3 + 1} {today.year}"
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        elif period == "year":
            top_period_label = str(today.year)
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        else:
            # Для дашборда (по умолчанию)
            top_period_label = "Текущая + 2 прошлые недели"
            top_period_range = f"{agg_start.strftime('%d.%m.%Y')} — {agg_end.strftime('%d.%m.%Y')}"
        
        logger.info("🔍 Шаг 6: Начинаем формирование ответа")
        try:
            # Формируем ответ с проверкой каждого поля
            response_data = {
                "is_indie_master": bool(is_indie_master),
                "subscription_info": subscription_info,
                "next_working_info": next_working_info,
                "next_bookings_list": next_bookings_list,
                "current_week_income": float(current_income or 0),
                "previous_week_income": float(previous_income or 0),
                "income_dynamics": round(float(income_dynamics), 2),
                "current_week_bookings": int(current_bookings or 0),
                "previous_week_bookings": int(previous_bookings or 0),
                "future_week_bookings": int(future_bookings or 0),
                "weeks_data": periods_data,
                "period": str(period),
                "offset": int(offset),
                "top_services_by_bookings": top_services_by_bookings_with_names,
                "top_services_by_earnings": top_services_by_earnings_with_names,
                "top_period_label": str(top_period_label) if top_period_label else "",
                "top_period_range": str(top_period_range) if top_period_range else ""
            }
            logger.info("🔍 Шаг 7: Ответ сформирован, возвращаем данные")
            return response_data
        except Exception as e:
            logger.error(f"Ошибка при формировании ответа: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
        
    except Exception as e:
        import traceback
        import sys
        error_detail = str(e)
        error_traceback = traceback.format_exc()
        # Логируем в logger
        logger.error(f"Ошибка при получении статистики: {error_detail}")
        logger.error(f"Traceback: {error_traceback}")
        # Также выводим в stderr для гарантированного логирования
        print(f"ERROR: Ошибка при получении статистики: {error_detail}", file=sys.stderr)
        print(f"ERROR Traceback: {error_traceback}", file=sys.stderr)
        sys.stderr.flush()
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении статистики: {error_detail}"
        )


@router.get("/stats/extended")
def get_master_extended_stats(
    period: str = Query("month", description="Period: week, month, quarter, year"),
    compare_period: bool = Query(True, description="Compare with previous period"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получить расширенную статистику мастера (только для плана Premium).
    Включает: детальную аналитику, сравнение периодов, тренды, прогнозы.
    """
    from utils.subscription_features import has_extended_stats
    from fastapi import status
    
    # Проверяем доступ к расширенной статистике
    if not has_extended_stats(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Расширенная статистика доступна только на плане Premium. Обновите подписку для доступа к этой функции."
        )
    
    try:
        from sqlalchemy import func, or_, and_
        from models import Income, Service, BookingStatus, IndieMaster
        from datetime import timedelta, date
        
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=404, detail="Master profile not found")
        
        # Проверяем, является ли мастер индивидуалом
        is_indie_master = master.can_work_independently
        indie_master = None
        if is_indie_master:
            indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
        
        today = date.today()
        
        # Определяем текущий и предыдущий периоды
        def get_period_range(period_type: str, offset: int = 0):
            """Получить диапазон дат для периода"""
            if period_type == "week":
                week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
                week_end = week_start + timedelta(days=6)
                return week_start, week_end
            elif period_type == "month":
                month_start = (today.replace(day=1) + timedelta(days=32 * offset)).replace(day=1)
                if month_start.month == 12:
                    month_end = month_start.replace(year=month_start.year + 1, month=1) - timedelta(days=1)
                else:
                    month_end = month_start.replace(month=month_start.month + 1) - timedelta(days=1)
                return month_start, month_end
            elif period_type == "quarter":
                quarter = (today.month - 1) // 3
                year = today.year + offset
                quarter_start = date(year, quarter * 3 + 1, 1)
                if quarter == 3:
                    quarter_end = date(year + 1, 1, 1) - timedelta(days=1)
                else:
                    quarter_end = date(year, (quarter + 1) * 3 + 1, 1) - timedelta(days=1)
                return quarter_start, quarter_end
            elif period_type == "year":
                year_start = date(today.year + offset, 1, 1)
                year_end = date(today.year + offset + 1, 1, 1) - timedelta(days=1)
                return year_start, year_end
            else:
                return today, today
        
        # Текущий период
        current_start, current_end = get_period_range(period, 0)
        current_start_dt = datetime.combine(current_start, datetime.min.time())
        current_end_dt = datetime.combine(current_end, datetime.max.time())
        
        # Предыдущий период для сравнения
        prev_start, prev_end = get_period_range(period, -1)
        prev_start_dt = datetime.combine(prev_start, datetime.min.time())
        prev_end_dt = datetime.combine(prev_end, datetime.max.time())
        
        # Фильтр для записей
        if indie_master:
            booking_filter = or_(
                Booking.master_id == master.id,
                Booking.indie_master_id == indie_master.id
            )
        else:
            booking_filter = Booking.master_id == master.id
        
        # Статистика текущего периода
        current_bookings = db.query(Booking).filter(
            and_(
                booking_filter,
                Booking.start_time >= current_start_dt,
                Booking.start_time <= current_end_dt
            )
        ).all()
        
        current_completed = [b for b in current_bookings if b.status == BookingStatus.COMPLETED]
        current_revenue = sum(b.payment_amount or 0 for b in current_completed)
        current_count = len(current_completed)
        
        # Статистика предыдущего периода (для сравнения)
        prev_bookings = []
        prev_revenue = 0
        prev_count = 0
        if compare_period:
            prev_bookings = db.query(Booking).filter(
                and_(
                    booking_filter,
                    Booking.start_time >= prev_start_dt,
                    Booking.start_time <= prev_end_dt
                )
            ).all()
            prev_completed = [b for b in prev_bookings if b.status == BookingStatus.COMPLETED]
            prev_revenue = sum(b.payment_amount or 0 for b in prev_completed)
            prev_count = len(prev_completed)
        
        # Расчет изменений
        revenue_change = ((current_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0
        count_change = ((current_count - prev_count) / prev_count * 100) if prev_count > 0 else 0
        
        # Тренды (последние 6 периодов)
        trends = []
        for i in range(5, -1, -1):  # От -5 до 0
            trend_start, trend_end = get_period_range(period, -i)
            trend_start_dt = datetime.combine(trend_start, datetime.min.time())
            trend_end_dt = datetime.combine(trend_end, datetime.max.time())
            
            trend_bookings = db.query(Booking).filter(
                and_(
                    booking_filter,
                    Booking.start_time >= trend_start_dt,
                    Booking.start_time <= trend_end_dt,
                    Booking.status == BookingStatus.COMPLETED
                )
            ).all()
            
            trend_revenue = sum(b.payment_amount or 0 for b in trend_bookings)
            trend_count = len(trend_bookings)
            
            trends.append({
                "period": i,
                "start_date": trend_start.isoformat(),
                "end_date": trend_end.isoformat(),
                "revenue": float(trend_revenue),
                "bookings_count": trend_count
            })
        
        # Прогноз на следующий период (простое среднее)
        if len(trends) >= 2:
            avg_revenue = sum(t["revenue"] for t in trends) / len(trends)
            avg_count = sum(t["bookings_count"] for t in trends) / len(trends)
        else:
            avg_revenue = current_revenue
            avg_count = current_count
        
        forecast = {
            "predicted_revenue": float(avg_revenue),
            "predicted_bookings": int(avg_count),
            "confidence": "medium"  # Можно улучшить с помощью ML
        }
        
        # Детальная аналитика по дням/неделям текущего периода
        daily_stats = []
        if period == "week":
            for i in range(7):
                day = current_start + timedelta(days=i)
                day_start = datetime.combine(day, datetime.min.time())
                day_end = datetime.combine(day, datetime.max.time())
                
                day_bookings = db.query(Booking).filter(
                    and_(
                        booking_filter,
                        Booking.start_time >= day_start,
                        Booking.start_time <= day_end,
                        Booking.status == BookingStatus.COMPLETED
                    )
                ).all()
                
                daily_stats.append({
                    "date": day.isoformat(),
                    "revenue": float(sum(b.payment_amount or 0 for b in day_bookings)),
                    "bookings_count": len(day_bookings)
                })
        elif period == "month":
            # По неделям месяца
            week_start = current_start
            week_num = 0
            while week_start <= current_end:
                week_end = min(week_start + timedelta(days=6), current_end)
                week_start_dt = datetime.combine(week_start, datetime.min.time())
                week_end_dt = datetime.combine(week_end, datetime.max.time())
                
                week_bookings = db.query(Booking).filter(
                    and_(
                        booking_filter,
                        Booking.start_time >= week_start_dt,
                        Booking.start_time <= week_end_dt,
                        Booking.status == BookingStatus.COMPLETED
                    )
                ).all()
                
                daily_stats.append({
                    "week": week_num + 1,
                    "start_date": week_start.isoformat(),
                    "end_date": week_end.isoformat(),
                    "revenue": float(sum(b.payment_amount or 0 for b in week_bookings)),
                    "bookings_count": len(week_bookings)
                })
                
                week_start = week_end + timedelta(days=1)
                week_num += 1
        
        return {
            "period": period,
            "current_period": {
                "start_date": current_start.isoformat(),
                "end_date": current_end.isoformat(),
                "revenue": float(current_revenue),
                "bookings_count": current_count
            },
            "previous_period": {
                "start_date": prev_start.isoformat() if compare_period else None,
                "end_date": prev_end.isoformat() if compare_period else None,
                "revenue": float(prev_revenue) if compare_period else None,
                "bookings_count": prev_count if compare_period else None
            },
            "comparison": {
                "revenue_change_percent": round(revenue_change, 2),
                "bookings_change_percent": round(count_change, 2),
                "revenue_change_amount": float(current_revenue - prev_revenue) if compare_period else 0,
                "bookings_change_amount": current_count - prev_count if compare_period else 0
            },
            "trends": trends,
            "forecast": forecast,
            "detailed_stats": daily_stats
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении расширенной статистики: {str(e)}"
        )


@router.delete("/schedule/future")
def delete_future_schedule(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Удаляет все будущие слоты расписания мастера (кроме сегодняшнего дня).
    """
    try:
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=404, detail="Профиль мастера не найден")
        
        # Получаем завтрашнюю дату
        tomorrow = date.today() + timedelta(days=1)
        
        # Удаляем все записи расписания начиная с завтра
        deleted_count = db.query(MasterSchedule).filter(
            MasterSchedule.master_id == master.id,
            MasterSchedule.date >= tomorrow
        ).delete()
        
        # Удаляем настройки расписания
        settings_deleted = db.query(MasterScheduleSettings).filter(
            MasterScheduleSettings.master_id == master.id
        ).delete()
        
        db.commit()
        
        return {
            "message": "Будущее расписание успешно удалено",
            "deleted_slots": deleted_count,
            "deleted_settings": settings_deleted
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при удалении расписания: {str(e)}"
        )


@router.post("/schedule/bulk-create")
def bulk_create_schedule(
    start_date: str = Query(..., description="Начальная дата в формате YYYY-MM-DD"),
    end_date: str = Query(..., description="Конечная дата в формате YYYY-MM-DD"),
    salon_id: int = Query(None, description="ID салона (для работы в салоне)"),
    branch_id: int = Query(None, description="ID филиала"),
    place_id: int = Query(None, description="ID места"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Массовое создание расписания на основе настроек мастера.
    """
    try:
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=404, detail="Профиль мастера не найден")
        
        # Парсим даты
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        if start_date_obj > end_date_obj:
            raise HTTPException(status_code=400, detail="Начальная дата не может быть больше конечной")
        
        # Создаем расписание
        result = create_schedule_from_settings(
            db=db,
            master_id=master.id,
            start_date=start_date_obj,
            end_date=end_date_obj,
            salon_id=salon_id,
            branch_id=branch_id,
            place_id=place_id
        )
        
        if result['success']:
            return {
                "message": result['message'],
                "created_records": result['created_records'],
                "start_date": start_date,
                "end_date": end_date
            }
        else:
            raise HTTPException(status_code=400, detail=result['message'])
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при создании расписания: {str(e)}"
        )


@router.delete("/schedule/bulk-delete")
def bulk_delete_schedule(
    start_date: str = Query(..., description="Начальная дата в формате YYYY-MM-DD"),
    end_date: str = Query(..., description="Конечная дата в формате YYYY-MM-DD"),
    work_type: str = Query(None, description="Тип работы: 'personal' или 'salon'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Массовое удаление расписания в указанном диапазоне дат.
    """
    try:
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=404, detail="Профиль мастера не найден")
        
        # Парсим даты
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        if start_date_obj > end_date_obj:
            raise HTTPException(status_code=400, detail="Начальная дата не может быть больше конечной")
        
        # Строим запрос для удаления
        query = db.query(MasterSchedule).filter(
            MasterSchedule.master_id == master.id,
            MasterSchedule.date >= start_date_obj,
            MasterSchedule.date <= end_date_obj
        )
        
        # Фильтруем по типу работы
        if work_type == 'personal':
            query = query.filter(MasterSchedule.salon_id.is_(None))
        elif work_type == 'salon':
            query = query.filter(MasterSchedule.salon_id.isnot(None))
        
        # Получаем записи для удаления
        records_to_delete = query.all()
        deleted_count = len(records_to_delete)
        
        # Удаляем записи
        for record in records_to_delete:
            db.delete(record)
        
        db.commit()
        
        return {
            "message": f"Удалено записей расписания: {deleted_count}",
            "deleted_records": deleted_count,
            "start_date": start_date,
            "end_date": end_date,
            "work_type": work_type
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при удалении расписания: {str(e)}"
        )




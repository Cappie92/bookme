from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Any, Optional
from datetime import datetime, date, time, timedelta, timezone
import json
import os
import uuid

from database import get_db
from models import (
    Salon, Service, ServiceCategory, Master, User, Booking, SalonMasterInvitation, SalonMasterInvitationStatus, MasterScheduleSettings, SalonMasterServiceSettings, SalonBranch, SalonPlace, MasterSchedule, BranchManagerInvitation as BranchManagerInvitationModel, ClientRestriction, ExpenseType, Expense, ExpenseTemplate
)
from schemas import (
    Service as ServiceSchema,
    ServiceCreate,
    ServiceUpdate,
    Master as MasterSchema,
    SalonStats,
    ServiceCategoryCreate,
    ServiceCategoryOut,
    ServiceOut,
    SalonCreateSimple,
    SalonOut,
    ServiceCreateSalon,
    SalonUpdate,
    User as UserSchema,
    SalonMasterInvitationStatus as InvitationStatus,
    SalonBranchCreate,
    SalonBranchUpdate,
    SalonBranchOut,
    SalonPlaceCreate,
    SalonPlaceUpdate,
    SalonPlaceOut,
    PlaceScheduleResponse,
    PlaceScheduleSlot,
    SalonLayout,
    PlaceOccupancyStats,
    BranchManagerAssignment,
    BranchManagerInfo,
    BranchManagerInvitationCreate,
    BranchManagerInvitationUpdate,
    BranchManagerInvitation,
    ClientRestrictionCreate,
    ClientRestrictionUpdate,
    ClientRestriction,
    ClientRestrictionOut,
    ClientRestrictionList,
    ExpenseTypeCreate,
    ExpenseTypeUpdate,
    ExpenseType,
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseOut,
    ExpenseTemplateCreate,
    ExpenseTemplateUpdate,
    ExpenseTemplate,
    ExpenseStats,
    ExpenseList
)
from auth import require_salon, get_current_active_user

router = APIRouter(
    prefix="/salon",
    tags=["salon"],
)


# Создание профиля салона
@router.post("/profile", response_model=SalonOut, dependencies=[Depends(require_salon)])
def create_salon_profile(
    salon_in: SalonCreateSimple,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Проверяем, что у пользователя еще нет профиля салона
    existing_salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if existing_salon:
        raise HTTPException(status_code=400, detail="Salon profile already exists")
    
    # Создаем профиль салона, используя данные пользователя
    salon = Salon(
        user_id=current_user.id,
        name=current_user.full_name,  # Используем полное имя пользователя
        address=salon_in.address,
        description=salon_in.description,
        domain=salon_in.domain,
        phone=salon_in.phone or current_user.phone,  # Используем телефон из формы или пользователя
        email=salon_in.email or current_user.email,  # Используем email из формы или пользователя
        website=salon_in.website,
        instagram=salon_in.instagram,
        working_hours=salon_in.working_hours,
        city=salon_in.city,
        timezone=salon_in.timezone,
        is_active=True
    )
    db.add(salon)
    db.commit()
    db.refresh(salon)
    return salon


# Получение профиля салона
@router.get("/profile", response_model=SalonOut, dependencies=[Depends(require_salon)])
def get_salon_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    return salon


# Категории услуг
@router.get("/categories", response_model=List[ServiceCategoryOut], dependencies=[Depends(require_salon)])
def get_categories(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    return salon.categories

@router.post("/categories", response_model=ServiceCategoryOut, dependencies=[Depends(require_salon)])
def create_category(
    category_in: ServiceCategoryCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, что категория с таким названием уже не существует в этом салоне
    existing_category = db.query(ServiceCategory).filter(
        ServiceCategory.salon_id == salon.id,
        ServiceCategory.name == category_in.name
    ).first()
    
    if existing_category:
        raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
    
    category = ServiceCategory(name=category_in.name, salon_id=salon.id)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.put("/categories/{category_id}", response_model=ServiceCategoryOut, dependencies=[Depends(require_salon)])
def update_category(
    category_id: int,
    category_in: ServiceCategoryCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    category = db.query(ServiceCategory).filter(
        ServiceCategory.id == category_id, 
        ServiceCategory.salon_id == salon.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Проверяем, что категория с таким названием уже не существует в этом салоне (исключая текущую категорию)
    existing_category = db.query(ServiceCategory).filter(
        ServiceCategory.salon_id == salon.id,
        ServiceCategory.name == category_in.name,
        ServiceCategory.id != category_id
    ).first()
    
    if existing_category:
        raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
    
    category.name = category_in.name
    db.commit()
    db.refresh(category)
    return category

@router.delete("/categories/{category_id}", dependencies=[Depends(require_salon)])
def delete_category(
    category_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    category = db.query(ServiceCategory).filter(
        ServiceCategory.id == category_id, 
        ServiceCategory.salon_id == salon.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Удаляем все услуги в этой категории
    services = db.query(Service).filter(Service.category_id == category_id).all()
    for service in services:
        db.delete(service)
    
    # Удаляем саму категорию
    db.delete(category)
    db.commit()
    
    return {"message": "Category and all related services deleted successfully"}

# Публичный endpoint для получения услуг салона (для клиентов)
@router.get("/services/public")
def get_salon_services_public(
    salon_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение списка услуг салона для клиентов.
    """
    salon = db.query(Salon).filter(Salon.id == salon_id, Salon.is_active == True).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")
    
    # Получаем услуги с информацией о категориях
    services = db.query(Service, ServiceCategory).join(
        ServiceCategory, Service.category_id == ServiceCategory.id
    ).filter(Service.salon_id == salon.id).all()
    
    # Преобразуем в нужный формат
    result = []
    for service, category in services:
        result.append({
            "id": service.id,
            "name": service.name,
            "category_id": service.category_id,
            "category_name": category.name,
            "price": service.price,
            "duration": service.duration,
            "salon_id": service.salon_id,
            "created_at": service.created_at
        })
    
    return result


# Управление услугами
@router.get("/services", response_model=List[ServiceOut], dependencies=[Depends(require_salon)])
def get_services(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Получаем услуги с информацией о категориях
    services = db.query(Service, ServiceCategory).join(
        ServiceCategory, Service.category_id == ServiceCategory.id
    ).filter(Service.salon_id == salon.id).all()
    
    # Преобразуем в нужный формат
    result = []
    for service, category in services:
        result.append({
            "id": service.id,
            "name": service.name,
            "category_id": service.category_id,
            "category_name": category.name,
            "price": service.price,
            "duration": service.duration,
            "salon_id": service.salon_id,
            "created_at": service.created_at
        })
    
    return result

@router.post("/services", response_model=ServiceOut, dependencies=[Depends(require_salon)])
def create_service(
    service_in: ServiceCreateSalon,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    # Проверяем, что категория принадлежит этому салону
    category = db.query(ServiceCategory).filter(ServiceCategory.id == service_in.category_id, ServiceCategory.salon_id == salon.id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category for this salon")
    service = Service(
        name=service_in.name,
        category_id=service_in.category_id,
        price=service_in.price,
        duration=service_in.duration,
        salon_id=salon.id
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    
    # Получаем обновленную информацию о категории
    category = db.query(ServiceCategory).filter(ServiceCategory.id == service.category_id).first()
    
    # Возвращаем с названием категории
    return {
        "id": service.id,
        "name": service.name,
        "category_id": service.category_id,
        "category_name": category.name if category else "Без категории",
        "price": service.price,
        "duration": service.duration,
        "salon_id": service.salon_id,
        "created_at": service.created_at
    }


@router.put("/services/{service_id}", response_model=ServiceSchema, dependencies=[Depends(require_salon)])
def update_service(
    service_id: int,
    service_in: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление услуги.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.salon_id == salon.id)
        .first()
    )

    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    for field, value in service_in.dict(exclude_unset=True).items():
        setattr(service, field, value)

    db.commit()
    db.refresh(service)
    return service


@router.delete("/services/{service_id}", response_model=ServiceSchema, dependencies=[Depends(require_salon)])
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Удаление услуги.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.salon_id == salon.id)
        .first()
    )

    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    db.delete(service)
    db.commit()
    return service


# Управление мастерами
@router.get("/masters", dependencies=[Depends(require_salon)])
def get_salon_masters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    print(f"==> /salon/masters called by user_id={current_user.id}")
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        print("==> Salon profile not found")
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Получаем всех мастеров, которые работают в салоне
    # Включаем как мастеров из salon.masters, так и мастеров с принятыми приглашениями
    working_masters = set()
    masters_data = []
    
    print(f"==> Getting masters for salon_id={salon.id}")
    print(f"==> Masters in salon.masters: {[m.id for m in salon.masters]}")
    
    # Добавляем мастеров из salon.masters
    for master in salon.masters:
        working_masters.add(master.id)
        masters_data.append({
            "id": master.id,
            "name": master.user.full_name,
            "phone": master.user.phone,
            "status": "active",
            "branch_id": master.branch_id
        })

    # Получаем все приглашения
    invitations = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.salon_id == salon.id
    ).all()
    print(f"==> Found {len(invitations)} invitations for salon_id={salon.id}")
    
    invited = []
    for inv in invitations:
        print(f"==> Invitation: id={inv.id}, status={inv.status}, master_id={inv.master_id}")
        if inv.master and inv.master.user:
            if inv.status == SalonMasterInvitationStatus.ACCEPTED:
                # Если приглашение принято, но мастер не в salon.masters, добавляем его
                if inv.master.id not in working_masters:
                    working_masters.add(inv.master.id)
                    masters_data.append({
                        "id": inv.master.id,
                        "name": inv.master.user.full_name,
                        "phone": inv.master.user.phone,
                        "status": "active",
                        "branch_id": inv.master.branch_id
                    })
                    print(f"==> Added master {inv.master.id} from ACCEPTED invitation")
            elif inv.status in [SalonMasterInvitationStatus.PENDING, SalonMasterInvitationStatus.DECLINED]:
                # Приглашения в ожидании или отклоненные
                invited.append({
                    "id": inv.master.id,
                    "name": inv.master.user.full_name,
                    "phone": inv.master.user.phone,
                    "invite_status": inv.status.value if hasattr(inv.status, 'value') else str(inv.status),
                    "invitation_id": inv.id
                })
    
    print(f"==> Final working masters: {[m['id'] for m in masters_data]}")
    print(f"==> Returning {len(masters_data)} working masters and {len(invited)} invited masters")
    return {
        "masters": masters_data,
        "invited": invited
    }

@router.post("/masters/{master_id}/services/{service_id}", dependencies=[Depends(require_salon)])
def assign_service_to_master(
    master_id: int,
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Назначить услугу мастеру.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Проверяем, что мастер работает в этом салоне
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master or master not in salon.masters:
        raise HTTPException(status_code=404, detail="Мастер не найден в этом салоне")

    # Проверяем, что услуга принадлежит этому салону
    service = db.query(Service).filter(Service.id == service_id, Service.salon_id == salon.id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена в этом салоне")

    # Добавляем услугу мастеру
    if service not in master.services:
        master.services.append(service)
        db.commit()

    return {"message": "Услуга назначена мастеру"}


# Публичный endpoint для получения мастеров салона (для клиентов)
@router.get("/masters/list")
def get_salon_masters_public(
    salon_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение списка мастеров салона для клиентов.
    """
    salon = db.query(Salon).filter(Salon.id == salon_id, Salon.is_active == True).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")

    # Получаем всех мастеров, которые работают в салоне
    working_masters = set()
    masters_data = []
    
    # Добавляем мастеров из salon.masters
    for master in salon.masters:
        working_masters.add(master.id)
        masters_data.append({
            "id": master.id,
            "user": {
                "id": master.user.id,
                "full_name": master.user.full_name,
                "phone": master.user.phone
            },
            "bio": master.bio,
            "experience_years": master.experience_years
        })

    # Получаем принятые приглашения
    invitations = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.salon_id == salon.id,
        SalonMasterInvitation.status == SalonMasterInvitationStatus.ACCEPTED
    ).all()
    
    for inv in invitations:
        if inv.master and inv.master.user and inv.master.id not in working_masters:
            working_masters.add(inv.master.id)
            masters_data.append({
                "id": inv.master.id,
                "user": {
                    "id": inv.master.user.id,
                    "full_name": inv.master.user.full_name,
                    "phone": inv.master.user.phone
                },
                "bio": inv.master.bio,
                "experience_years": inv.master.experience_years
            })
    
    return masters_data


# Статистика
@router.get("/stats", response_model=SalonStats, dependencies=[Depends(require_salon)])
def get_salon_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение статистики салона.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Получаем все бронирования салона
    bookings = db.query(Booking).filter(Booking.salon_id == salon.id).all()

    # Считаем статистику
    total_bookings = len(bookings)
    completed_bookings = len(
        [b for b in bookings if b.status == BookingStatus.COMPLETED]
    )
    cancelled_bookings = len(
        [b for b in bookings if b.status == BookingStatus.CANCELLED]
    )
    revenue = sum(
        b.service.price for b in bookings if b.status == BookingStatus.COMPLETED
    )

    # Статистика по мастерам
    masters_stats = []
    for master in salon.masters:
        master_bookings = [b for b in bookings if b.master_id == master.id]
        master_completed = len(
            [b for b in master_bookings if b.status == BookingStatus.COMPLETED]
        )
        master_revenue = sum(
            b.service.price
            for b in master_bookings
            if b.status == BookingStatus.COMPLETED
        )

        masters_stats.append(
            {
                "master_id": master.id,
                "master_name": master.user.email,
                "total_bookings": len(master_bookings),
                "completed_bookings": master_completed,
                "cancelled_bookings": len(
                    [b for b in master_bookings if b.status == BookingStatus.CANCELLED]
                ),
                "revenue": master_revenue,
                "average_rating": None,  # TODO: Добавить систему рейтингов
            }
        )

    return {
        "salon_id": salon.id,
        "salon_name": salon.name,
        "total_bookings": total_bookings,
        "completed_bookings": completed_bookings,
        "cancelled_bookings": cancelled_bookings,
        "revenue": revenue,
        "average_rating": None,  # TODO: Добавить систему рейтингов
        "masters_stats": masters_stats,
    }

# Обновление профиля салона
@router.put("/profile", response_model=SalonOut, dependencies=[Depends(require_salon)])
async def update_salon_profile(
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    website: Optional[str] = Form(None),
    instagram: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    timezone: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    background_color: Optional[str] = Form(None),
    yandex_maps_widget: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = Form(None),
    missed_sessions_blacklist_threshold: Optional[int] = Form(None),
    cancellation_grace_period_hours: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    print(f"Получены параметры: background_color={background_color}, yandex_maps_widget={yandex_maps_widget}")
    
    # Валидация обязательных полей
    if (city and not city) or (timezone and not timezone):
        raise HTTPException(status_code=422, detail="Город и таймзона обязательны для заполнения")
    
    # Если city/timezone не переданы, но уже есть в салоне — не трогаем
    if (not city and not salon.city) or (not timezone and not salon.timezone):
        raise HTTPException(status_code=422, detail="Город и таймзона обязательны для заполнения")
    
    # Обновляем поля
    if name is not None:
        salon.name = name
    if description is not None:
        salon.description = description
    if domain is not None:
        salon.domain = domain
    if phone is not None:
        salon.phone = phone
    if email is not None:
        salon.email = email
    if website is not None:
        salon.website = website
    if instagram is not None:
        salon.instagram = instagram
    if city is not None:
        salon.city = city
    if timezone is not None:
        salon.timezone = timezone
    if is_active is not None:
        salon.is_active = is_active
    if background_color is not None:
        print(f"Обновляем background_color: {background_color}")
        salon.background_color = background_color
    if yandex_maps_widget is not None:
        print(f"Обновляем yandex_maps_widget: {yandex_maps_widget}")
        salon.yandex_maps_widget = yandex_maps_widget
    
    # Обновляем настройки автоматизации ограничений
    if missed_sessions_advance_payment_threshold is not None:
        salon.missed_sessions_advance_payment_threshold = missed_sessions_advance_payment_threshold
    if missed_sessions_blacklist_threshold is not None:
        salon.missed_sessions_blacklist_threshold = missed_sessions_blacklist_threshold
    if cancellation_grace_period_hours is not None:
        salon.cancellation_grace_period_hours = cancellation_grace_period_hours
    
    # Обработка загрузки логотипа
    if logo:
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
        if salon.logo and os.path.exists(salon.logo):
            try:
                os.remove(salon.logo)
            except:
                pass
        
        # Сохраняем путь к новому логотипу
        salon.logo = file_path
    
    db.commit()
    db.refresh(salon)
    return salon

@router.post("/masters/invite", dependencies=[Depends(require_salon)])
def invite_master(
    phone: str = Body(..., embed=True),
    branch_id: Optional[int] = Body(None, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Пригласить мастера по номеру телефона в салон.
    """
    # Получаем профиль салона
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Ищем пользователя с таким телефоном и ролью мастер
    user = db.query(User).filter(User.phone == phone, User.role == 'master').first()
    if not user or not user.master_profile:
        raise HTTPException(status_code=404, detail="Мастера с таким номером нет")
    master = user.master_profile

    # Проверяем, что мастер готов работать в салоне
    if not master.can_work_in_salon:
        raise HTTPException(status_code=400, detail="Мастер не принимает приглашения в салоны")

    # Проверяем, не работает ли уже мастер в этом салоне
    if master in salon.masters:
        raise HTTPException(status_code=400, detail="Мастер уже работает в этом салоне")

    # Проверяем, есть ли уже приглашение
    invitation = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.salon_id == salon.id,
        SalonMasterInvitation.master_id == master.id
    ).first()
    
    print(f"==> Checking invitation for master_id={master.id}, salon_id={salon.id}")
    print(f"==> Found invitation: {invitation}")
    if invitation:
        print(f"==> Invitation status: {invitation.status}")
        if invitation.status == SalonMasterInvitationStatus.PENDING:
            raise HTTPException(status_code=400, detail="Приглашение уже отправлено")
        elif invitation.status == SalonMasterInvitationStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Мастер уже работает в этом салоне")
        elif invitation.status == SalonMasterInvitationStatus.DECLINED:
            # Повторная отправка — обновляем статус и дату
            invitation.status = SalonMasterInvitationStatus.PENDING
            invitation.updated_at = datetime.now(timezone.utc)
            db.commit()
            return {"message": "Приглашение отправлено повторно"}
    else:
        # Создаём новое приглашение
        invitation = SalonMasterInvitation(
            salon_id=salon.id,
            master_id=master.id,
            status=SalonMasterInvitationStatus.PENDING
        )
        db.add(invitation)
        
        # Если указан branch_id, устанавливаем его для мастера
        if branch_id is not None:
            # Проверяем, что филиал существует и принадлежит этому салону
            branch = db.query(SalonBranch).filter(
                SalonBranch.id == branch_id,
                SalonBranch.salon_id == salon.id
            ).first()
            if branch:
                master.branch_id = branch_id
            else:
                raise HTTPException(status_code=404, detail="Филиал не найден")
        
        db.commit()
        return {"message": "Приглашение отправлено"}

@router.delete("/masters/{master_id}", dependencies=[Depends(require_salon)])
def remove_master(
    master_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Удалить мастера из салона.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Проверяем, что мастер существует
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    # Проверяем, есть ли связь мастера с салоном (через salon.masters или приглашение)
    is_in_salon_masters = master in salon.masters
    invitation = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.salon_id == salon.id,
        SalonMasterInvitation.master_id == master.id
    ).first()
    
    print(f"==> Removing master_id={master.id} from salon_id={salon.id}")
    print(f"==> Master in salon.masters: {is_in_salon_masters}")
    print(f"==> Found invitation: {invitation}")
    
    if not is_in_salon_masters and not invitation:
        raise HTTPException(status_code=404, detail="Мастер не найден в этом салоне")

    # Удаляем мастера из salon.masters если он там есть
    if is_in_salon_masters:
        salon.masters.remove(master)
        print(f"==> Removed master from salon.masters")
    
    # Удаляем приглашение если оно есть
    if invitation:
        print(f"==> Deleting invitation with status: {invitation.status}")
        db.delete(invitation)
    
    db.commit()
    print(f"==> Master removal completed successfully")

    return {"message": "Мастер удален из салона"}

@router.get("/masters/{master_id}/settings", dependencies=[Depends(require_salon)])
def get_master_settings(
    master_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить настройки мастера (услуги и выплаты).
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Проверяем, что мастер работает в этом салоне
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master or master not in salon.masters:
        raise HTTPException(status_code=404, detail="Мастер не найден в этом салоне")

    # Получаем услуги салона
    salon_services = db.query(Service).filter(Service.salon_id == salon.id).all()
    
    # Получаем услуги мастера с выплатами (если есть)
    master_services = []
    for service in salon_services:
        # Ищем настройки для этой услуги
        service_setting = db.query(SalonMasterServiceSettings).filter(
            SalonMasterServiceSettings.master_id == master_id,
            SalonMasterServiceSettings.salon_id == salon.id,
            SalonMasterServiceSettings.service_id == service.id
        ).first()
        
        if service_setting:
            # Используем сохраненные настройки
            master_services.append({
                "service_id": service.id,
                "service_name": service.name,
                "service_price": service.price,
                "master_payment_type": service_setting.master_payment_type,
                "master_payment_value": service_setting.master_payment_value,
                "is_active": service_setting.is_active
            })
        else:
            # Используем значения по умолчанию
            master_services.append({
                "service_id": service.id,
                "service_name": service.name,
                "service_price": service.price,
                "master_payment_type": "rub",
                "master_payment_value": service.price * 0.7,
                "is_active": True
            })

    # Получаем настройки расписания мастера
    schedule_settings = db.query(MasterScheduleSettings).filter(
        MasterScheduleSettings.master_id == master_id,
        MasterScheduleSettings.salon_id == salon.id
    ).first()

    schedule_data = None
    if schedule_settings:
        schedule_data = {
            "type": schedule_settings.schedule_type,
            "fixed": schedule_settings.fixed_schedule,
            "individual": schedule_settings.individual_schedule
        }

    return {
        "master_id": master.id,
        "master_name": master.user.full_name,
        "services": master_services,
        "schedule": schedule_data,
        "branch_id": master.branch_id
    }

@router.patch("/masters/{master_id}/settings", dependencies=[Depends(require_salon)])
def update_master_settings(
    master_id: int,
    settings: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Обновить настройки мастера (услуги и выплаты).
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    # Проверяем, что мастер работает в этом салоне
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master or master not in salon.masters:
        raise HTTPException(status_code=404, detail="Мастер не найден в этом салоне")

    print(f"==> Updating settings for master_id={master_id}")
    print(f"==> Settings data: {settings}")

    # Обрабатываем настройки услуг
    if 'services' in settings:
        services_data = settings['services']
        print(f"==> Processing {len(services_data)} services")
        
        # Сохраняем настройки услуг в базу данных
        for service_setting in services_data:
            service_id = service_setting['service_id']
            is_active = service_setting['is_active']
            payment_type = service_setting.get('master_payment_type', 'rub')
            payment_value = service_setting.get('master_payment_value', 0)
            
            # Проверяем, что услуга принадлежит салону
            service = db.query(Service).filter(
                Service.id == service_id,
                Service.salon_id == salon.id
            ).first()
            
            if not service:
                print(f"==> Service {service_id} not found in salon {salon.id}")
                continue
            
            # Ищем существующие настройки
            existing_setting = db.query(SalonMasterServiceSettings).filter(
                SalonMasterServiceSettings.master_id == master_id,
                SalonMasterServiceSettings.salon_id == salon.id,
                SalonMasterServiceSettings.service_id == service_id
            ).first()
            
            if existing_setting:
                # Обновляем существующие настройки
                existing_setting.is_active = is_active
                existing_setting.master_payment_type = payment_type
                existing_setting.master_payment_value = payment_value
                existing_setting.updated_at = datetime.now(timezone.utc)
            else:
                # Создаем новые настройки
                new_setting = SalonMasterServiceSettings(
                    master_id=master_id,
                    salon_id=salon.id,
                    service_id=service_id,
                    is_active=is_active,
                    master_payment_type=payment_type,
                    master_payment_value=payment_value
                )
                db.add(new_setting)
            
            print(f"==> Service {service_id}: active={is_active}, "
                  f"payment_type={payment_type}, payment_value={payment_value}")
        
        db.commit()
        print(f"==> Service settings saved to database")

    # Обрабатываем настройки расписания
    if 'schedule' in settings:
        schedule_data = settings['schedule']
        print(f"==> Schedule type: {schedule_data.get('type')}")
        
        # Сохраняем настройки расписания в базу данных
        existing_settings = db.query(MasterScheduleSettings).filter(
            MasterScheduleSettings.master_id == master_id,
            MasterScheduleSettings.salon_id == salon.id
        ).first()
        
        if existing_settings:
            # Обновляем существующие настройки
            existing_settings.schedule_type = schedule_data.get('type', 'fixed')
            existing_settings.fixed_schedule = schedule_data.get('fixed')
            existing_settings.individual_schedule = schedule_data.get('individual')
            existing_settings.updated_at = datetime.now(timezone.utc)
        else:
            # Создаем новые настройки
            new_settings = MasterScheduleSettings(
                master_id=master_id,
                salon_id=salon.id,
                schedule_type=schedule_data.get('type', 'fixed'),
                fixed_schedule=schedule_data.get('fixed'),
                individual_schedule=schedule_data.get('individual')
            )
            db.add(new_settings)
        
        db.commit()
        print(f"==> Schedule settings saved to database")

    # Обрабатываем изменение филиала мастера
    if 'branch_id' in settings:
        branch_id = settings['branch_id']
        print(f"==> Updating master branch_id to: {branch_id}")
        
        if branch_id is not None:
            # Проверяем, что филиал существует и принадлежит этому салону
            branch = db.query(SalonBranch).filter(
                SalonBranch.id == branch_id,
                SalonBranch.salon_id == salon.id
            ).first()
            if not branch:
                raise HTTPException(status_code=404, detail="Филиал не найден")
        
        # Обновляем branch_id мастера
        master.branch_id = branch_id
        db.commit()
        print(f"==> Master branch_id updated to: {branch_id}")

    return {"message": "Настройки мастера обновлены"}

@router.delete("/invitations/{invitation_id}", dependencies=[Depends(require_salon)])
def delete_salon_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    invitation = db.query(SalonMasterInvitation).filter(
        SalonMasterInvitation.id == invitation_id,
        SalonMasterInvitation.salon_id == salon.id
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    db.delete(invitation)
    db.commit()
    return {"message": "Приглашение удалено"}




# API для управления филиалами
@router.get("/branches", response_model=List[SalonBranchOut], dependencies=[Depends(require_salon)])
def get_salon_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список филиалов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    branches = db.query(SalonBranch).filter(SalonBranch.salon_id == salon.id).all()
    
    # Добавляем количество мест и информацию об управляющем для каждого филиала
    result = []
    for branch in branches:
        places_count = db.query(SalonPlace).filter(SalonPlace.branch_id == branch.id).count()
        branch_data = SalonBranchOut.from_orm(branch)
        branch_data.places_count = places_count
        
        # Добавляем информацию об управляющем
        if branch.manager_id:
            manager = db.query(User).filter(User.id == branch.manager_id).first()
            if manager:
                branch_data.manager_name = manager.full_name
        
        result.append(branch_data)
    
    return result


@router.get("/branches/public")
def get_salon_branches_public(
    salon_id: int,
    db: Session = Depends(get_db)
):
    """Получить список филиалов салона (публичный endpoint)"""
    salon = db.query(Salon).filter(Salon.id == salon_id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    
    branches = db.query(SalonBranch).filter(
        SalonBranch.salon_id == salon_id,
        SalonBranch.is_active == True
    ).all()
    
    return {"branches": [SalonBranchOut.from_orm(branch) for branch in branches]}


@router.post("/branches", response_model=SalonBranchOut, dependencies=[Depends(require_salon)])
def create_salon_branch(
    branch_in: SalonBranchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создать новый филиал салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    branch = SalonBranch(
        salon_id=salon.id,
        name=branch_in.name,
        address=branch_in.address,
        description=branch_in.description,
        phone=branch_in.phone,
        email=branch_in.email,
        working_hours=branch_in.working_hours,
        manager_id=branch_in.manager_id,
        is_active=branch_in.is_active
    )
    
    db.add(branch)
    db.commit()
    db.refresh(branch)
    
    return SalonBranchOut.from_orm(branch)


@router.put("/branches/{branch_id}", response_model=SalonBranchOut, dependencies=[Depends(require_salon)])
def update_salon_branch(
    branch_id: int,
    branch_in: SalonBranchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновить филиал салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    
    # Обновляем только переданные поля
    update_data = branch_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(branch, field, value)
    
    db.commit()
    db.refresh(branch)
    
    return SalonBranchOut.from_orm(branch)


@router.delete("/branches/{branch_id}", dependencies=[Depends(require_salon)])
def delete_salon_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Удалить филиал салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    
    # Проверяем, есть ли места в этом филиале
    places_count = db.query(SalonPlace).filter(SalonPlace.branch_id == branch.id).count()
    if places_count > 0:
        raise HTTPException(status_code=400, detail="Нельзя удалить филиал с местами. Сначала удалите все места.")
    
    db.delete(branch)
    db.commit()
    
    return {"message": "Филиал удален"}


@router.get("/branches/{branch_id}/working-hours", dependencies=[Depends(require_salon)])
def get_branch_working_hours(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получить график работы филиала.
    """
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")

    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")

    # Парсим рабочие часы из JSON
    working_hours = {}
    if branch.working_hours:
        try:
            working_hours = json.loads(branch.working_hours)
        except:
            working_hours = {}

    # Находим самое раннее время открытия и самое позднее время закрытия
    earliest_open = "23:59"
    latest_close = "00:00"
    
    for day_data in working_hours.values():
        if day_data.get('enabled'):
            if day_data.get('open', '23:59') < earliest_open:
                earliest_open = day_data.get('open', '23:59')
            if day_data.get('close', '00:00') > latest_close:
                latest_close = day_data.get('close', '00:00')

    return {
        "working_hours": working_hours,
        "earliest_open": earliest_open,
        "latest_close": latest_close,
        "branch_name": branch.name,
        "branch_address": branch.address
    }


# API для управления местами
@router.get("/places", response_model=List[SalonPlaceOut], dependencies=[Depends(require_salon)])
def get_salon_places(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список мест салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(SalonPlace).filter(SalonPlace.salon_id == salon.id)
    
    if branch_id is not None:
        query = query.filter(SalonPlace.branch_id == branch_id)
    
    places = query.all()
    
    # Добавляем название филиала для каждого места
    result = []
    for place in places:
        place_data = SalonPlaceOut.from_orm(place)
        if place.branch_id:
            branch = db.query(SalonBranch).filter(SalonBranch.id == place.branch_id).first()
            place_data.branch_name = branch.name if branch else None
        result.append(place_data)
    
    return result


@router.post("/places", response_model=SalonPlaceOut, dependencies=[Depends(require_salon)])
def create_salon_place(
    place_in: SalonPlaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создать новое место в салоне"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, что филиал существует и принадлежит салону
    if place_in.branch_id:
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == place_in.branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Филиал не найден")
    
    place = SalonPlace(
        salon_id=salon.id,
        branch_id=place_in.branch_id,
        name=place_in.name,
        description=place_in.description,
        capacity=place_in.capacity,
        is_active=place_in.is_active,
        position_x=place_in.position_x,
        position_y=place_in.position_y,
        width=place_in.width,
        height=place_in.height
    )
    
    db.add(place)
    db.commit()
    db.refresh(place)
    
    # Добавляем название филиала
    place_data = SalonPlaceOut.from_orm(place)
    if place.branch_id:
        branch = db.query(SalonBranch).filter(SalonBranch.id == place.branch_id).first()
        place_data.branch_name = branch.name if branch else None
    
    return place_data


@router.put("/places/{place_id}", response_model=SalonPlaceOut, dependencies=[Depends(require_salon)])
def update_salon_place(
    place_id: int,
    place_in: SalonPlaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновить место в салоне"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    place = db.query(SalonPlace).filter(
        SalonPlace.id == place_id,
        SalonPlace.salon_id == salon.id
    ).first()
    
    if not place:
        raise HTTPException(status_code=404, detail="Место не найдено")
    
    # Проверяем, что новый филиал существует и принадлежит салону
    if place_in.branch_id is not None:
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == place_in.branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Филиал не найден")
    
    # Обновляем только переданные поля
    update_data = place_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(place, field, value)
    
    db.commit()
    db.refresh(place)
    
    # Добавляем название филиала
    place_data = SalonPlaceOut.from_orm(place)
    if place.branch_id:
        branch = db.query(SalonBranch).filter(SalonBranch.id == place.branch_id).first()
        place_data.branch_name = branch.name if branch else None
    
    return place_data


@router.delete("/places/{place_id}", dependencies=[Depends(require_salon)])
def delete_salon_place(
    place_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Удалить место в салоне"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    place = db.query(SalonPlace).filter(
        SalonPlace.id == place_id,
        SalonPlace.salon_id == salon.id
    ).first()
    
    if not place:
        raise HTTPException(status_code=404, detail="Место не найдено")
    
    # Проверяем, есть ли расписание на это место
    schedules_count = db.query(MasterSchedule).filter(MasterSchedule.place_id == place.id).count()
    if schedules_count > 0:
        raise HTTPException(status_code=400, detail="Нельзя удалить место с расписанием. Сначала удалите все записи в расписании.")
    
    db.delete(place)
    db.commit()
    
    return {"message": "Место удалено"}


# API для расписания мест
@router.get("/places/schedule/{schedule_date}", response_model=PlaceScheduleResponse, dependencies=[Depends(require_salon)])
def get_places_schedule(
    schedule_date: date,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить расписание мест на конкретную дату"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Получаем рабочие часы салона
    working_hours = {}
    if salon.working_hours:
        try:
            working_hours = json.loads(salon.working_hours)
        except:
            working_hours = {}
    
    # Определяем день недели (0-6, где 0 - понедельник)
    day_of_week = schedule_date.weekday()
    day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    day_key = day_names[day_of_week]
    
    # Получаем рабочие часы для этого дня
    day_hours = working_hours.get(day_key, {'enabled': False, 'open': '09:00', 'close': '18:00'})
    
    # Получаем места
    places_query = db.query(SalonPlace).filter(SalonPlace.salon_id == salon.id)
    if branch_id:
        places_query = places_query.filter(SalonPlace.branch_id == branch_id)
    places = places_query.all()
    
    slots = []
    
    if day_hours.get('enabled', False):
        # Парсим время работы
        open_time = datetime.strptime(day_hours['open'], '%H:%M').time()
        close_time = datetime.strptime(day_hours['close'], '%H:%M').time()
        
        # Создаем слоты по 10 минут
        current_time = open_time
        while current_time < close_time:
            for place in places:
                # Проверяем, занято ли место в это время
                occupied_schedule = db.query(MasterSchedule).filter(
                    MasterSchedule.place_id == place.id,
                    MasterSchedule.date == schedule_date,
                    MasterSchedule.start_time <= current_time,
                    MasterSchedule.end_time > current_time,
                    MasterSchedule.is_available == True
                ).first()
                
                is_occupied = occupied_schedule is not None
                master_name = None
                master_id = None
                
                if occupied_schedule:
                    master = db.query(Master).filter(Master.id == occupied_schedule.master_id).first()
                    if master:
                        master_name = master.user.full_name
                        master_id = master.id
                
                slot = PlaceScheduleSlot(
                    place_id=place.id,
                    place_name=place.name,
                    date=schedule_date,
                    hour=current_time.hour,
                    minute=current_time.minute,
                    is_occupied=is_occupied,
                    master_name=master_name,
                    master_id=master_id
                )
                slots.append(slot)
            
            # Переходим к следующему 10-минутному интервалу
            current_minutes = current_time.hour * 60 + current_time.minute + 10
            current_time = time(hour=current_minutes // 60, minute=current_minutes % 60)
    
    return PlaceScheduleResponse(
        date=schedule_date,
        slots=slots,
        working_hours=day_hours
    )


# API для схемы салона
@router.get("/layout", response_model=SalonLayout, dependencies=[Depends(require_salon)])
def get_salon_layout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить схему салона с местами и филиалами"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    branches = db.query(SalonBranch).filter(SalonBranch.salon_id == salon.id).all()
    places = db.query(SalonPlace).filter(SalonPlace.salon_id == salon.id).all()
    
    # Добавляем название филиала для каждого места
    places_out = []
    for place in places:
        place_data = SalonPlaceOut.from_orm(place)
        if place.branch_id:
            branch = db.query(SalonBranch).filter(SalonBranch.id == place.branch_id).first()
            place_data.branch_name = branch.name if branch else None
        places_out.append(place_data)
    
    branches_out = [SalonBranchOut.from_orm(branch) for branch in branches]
    
    return SalonLayout(
        places=places_out,
        branches=branches_out,
        layout_data=None  # Можно добавить дополнительные данные для схемы
    )


# API для статистики загруженности мест
@router.get("/places/occupancy", response_model=List[PlaceOccupancyStats], dependencies=[Depends(require_salon)])
def get_places_occupancy_stats(
    start_date: date,
    end_date: date,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить статистику загруженности мест за период"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    places_query = db.query(SalonPlace).filter(SalonPlace.salon_id == salon.id)
    if branch_id:
        places_query = places_query.filter(SalonPlace.branch_id == branch_id)
    places = places_query.all()
    
    stats = []
    
    for place in places:
        # Получаем расписание для этого места за период
        schedules = db.query(MasterSchedule).filter(
            MasterSchedule.place_id == place.id,
            MasterSchedule.date >= start_date,
            MasterSchedule.date <= end_date,
            MasterSchedule.is_available == True
        ).all()
        
        total_hours = 0
        occupied_hours = 0
        masters_set = set()
        
        # Получаем рабочие часы салона
        working_hours = {}
        if salon.working_hours:
            try:
                working_hours = json.loads(salon.working_hours)
            except:
                working_hours = {}
        
        # Для каждого дня в периоде
        current_date = start_date
        while current_date <= end_date:
            day_of_week = current_date.weekday()
            day_names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            day_key = day_names[day_of_week]
            
            day_hours = working_hours.get(day_key, {'enabled': False, 'open': '09:00', 'close': '18:00'})
            
            if day_hours.get('enabled', False):
                open_time = datetime.strptime(day_hours['open'], '%H:%M').time()
                close_time = datetime.strptime(day_hours['close'], '%H:%M').time()
                
                # Вычисляем количество рабочих часов в день
                day_total_hours = (close_time.hour * 60 + close_time.minute - open_time.hour * 60 - open_time.minute) / 60
                total_hours += day_total_hours
                
                # Проверяем расписание на этот день
                day_schedules = [s for s in schedules if s.date == current_date]
                for schedule in day_schedules:
                    # Вычисляем количество часов работы мастера
                    start_minutes = schedule.start_time.hour * 60 + schedule.start_time.minute
                    end_minutes = schedule.end_time.hour * 60 + schedule.end_time.minute
                    work_hours = (end_minutes - start_minutes) / 60
                    occupied_hours += work_hours
                    masters_set.add(schedule.master_id)
            
            current_date = current_date.replace(day=current_date.day + 1)
        
        occupancy_rate = (occupied_hours / total_hours * 100) if total_hours > 0 else 0
        
        stat = PlaceOccupancyStats(
            place_id=place.id,
            place_name=place.name,
            total_hours=round(total_hours, 2),
            occupied_hours=round(occupied_hours, 2),
            occupancy_rate=round(occupancy_rate, 2),
            masters_count=len(masters_set)
        )
        stats.append(stat)
    
    return stats


# API для управления приглашениями управляющих
@router.post("/branches/{branch_id}/invite-manager", dependencies=[Depends(require_salon)])
def invite_branch_manager(
    branch_id: int,
    invitation: BranchManagerInvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Пригласить пользователя на должность управляющего филиала"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, что филиал принадлежит салону
    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Проверяем, что пользователь существует
    user = db.query(User).filter(User.id == invitation.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Проверяем, что пользователь не является владельцем салона
    if user.id == salon.user_id:
        raise HTTPException(status_code=400, detail="Salon owner cannot be branch manager")
    
    # Проверяем, что приглашение еще не существует
    existing_invitation = db.query(BranchManagerInvitationModel).filter(
        BranchManagerInvitationModel.branch_id == branch_id,
        BranchManagerInvitationModel.user_id == invitation.user_id,
        BranchManagerInvitationModel.status == SalonMasterInvitationStatus.PENDING
    ).first()
    
    if existing_invitation:
        # Обновляем существующее приглашение
        existing_invitation.status = SalonMasterInvitationStatus.PENDING
        existing_invitation.message = invitation.message
        existing_invitation.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Приглашение обновлено"}
    
    # Создаем новое приглашение
    new_invitation = BranchManagerInvitationModel(
        salon_id=branch.salon_id,
        branch_id=branch_id,
        user_id=invitation.user_id,
        status=SalonMasterInvitationStatus.PENDING,
        message=invitation.message
    )
    
    db.add(new_invitation)
    db.commit()
    db.refresh(new_invitation)
    
    return {"message": f"Invitation sent to {user.full_name or user.phone}"}


@router.get("/branches/{branch_id}/invitations", response_model=List[BranchManagerInvitation])
def get_branch_manager_invitations(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список приглашений на должность управляющего филиала"""
    # Проверяем, что пользователь имеет доступ к филиалу
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    branch = None
    
    if salon:
        # Пользователь - владелец салона
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
    else:
        # Проверяем, является ли пользователь управляющим этого филиала
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.manager_id == current_user.id
        ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found or access denied")
    
    invitations = db.query(BranchManagerInvitationModel).filter(
        BranchManagerInvitationModel.branch_id == branch_id
    ).all()
    
    result = []
    for invitation in invitations:
        invitation_data = BranchManagerInvitation.from_orm(invitation)
        result.append(invitation_data)
    
    return result


@router.put("/branches/{branch_id}/invitations/{invitation_id}", response_model=dict)
def respond_to_manager_invitation(
    branch_id: int,
    invitation_id: int,
    response: BranchManagerInvitationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Ответить на приглашение стать управляющим филиала"""
    # Проверяем, что приглашение существует и адресовано текущему пользователю
    invitation = db.query(BranchManagerInvitationModel).filter(
        BranchManagerInvitationModel.id == invitation_id,
        BranchManagerInvitationModel.user_id == current_user.id,
        BranchManagerInvitationModel.branch_id == branch_id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.status != SalonMasterInvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Invitation already processed")
    
    # Обновляем статус приглашения
    invitation.status = response.status
    invitation.message = response.message
    invitation.updated_at = datetime.now(timezone.utc)
    
    if response.status == SalonMasterInvitationStatus.ACCEPTED:
        # Назначаем пользователя управляющим филиала
        branch = db.query(SalonBranch).filter(SalonBranch.id == branch_id).first()
        if branch:
            branch.manager_id = current_user.id
            branch.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {"message": f"Invitation {response.status}"}


# API для управления филиалами
@router.post("/branches/{branch_id}/assign-manager", dependencies=[Depends(require_salon)])
def assign_branch_manager(
    branch_id: int,
    assignment: BranchManagerAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Назначить управляющего для филиала"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, что филиал принадлежит салону
    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Проверяем, что пользователь существует и может быть управляющим
    manager = db.query(User).filter(User.id == assignment.manager_id).first()
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")
    
    # Проверяем, что пользователь не является владельцем салона
    if manager.id == salon.user_id:
        raise HTTPException(status_code=400, detail="Salon owner cannot be branch manager")
    
    # Назначаем управляющего
    branch.manager_id = assignment.manager_id
    db.commit()
    
    return {"message": f"Manager assigned to branch {branch.name}"}


@router.delete("/branches/{branch_id}/remove-manager", dependencies=[Depends(require_salon)])
def remove_branch_manager(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Убрать управляющего с филиала"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, что филиал принадлежит салону
    branch = db.query(SalonBranch).filter(
        SalonBranch.id == branch_id,
        SalonBranch.salon_id == salon.id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Убираем управляющего
    branch.manager_id = None
    db.commit()
    
    return {"message": f"Manager removed from branch {branch.name}"}


@router.get("/branches/{branch_id}/manager", response_model=Optional[BranchManagerInfo])
def get_branch_manager(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить информацию об управляющем филиала"""
    # Проверяем, что пользователь имеет доступ к филиалу
    # (либо владелец салона, либо управляющий филиала)
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    branch = None
    
    if salon:
        # Пользователь - владелец салона
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
    else:
        # Проверяем, является ли пользователь управляющим этого филиала
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.manager_id == current_user.id
        ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found or access denied")
    
    if not branch.manager_id:
        return None
    
    manager = db.query(User).filter(User.id == branch.manager_id).first()
    if not manager:
        return None
    
    return BranchManagerInfo(
        id=manager.id,
        full_name=manager.full_name,
        phone=manager.phone,
        email=manager.email,
        role=manager.role
    )


@router.get("/my-managed-branches", response_model=List[SalonBranchOut])
def get_my_managed_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получить список филиалов, которыми управляет текущий пользователь"""
    branches = db.query(SalonBranch).filter(
        SalonBranch.manager_id == current_user.id,
        SalonBranch.is_active == True
    ).all()
    
    result = []
    for branch in branches:
        # Получаем информацию о салоне
        salon = db.query(Salon).filter(Salon.id == branch.salon_id).first()
        if salon:
            places_count = db.query(SalonPlace).filter(SalonPlace.branch_id == branch.id).count()
            branch_data = SalonBranchOut.from_orm(branch)
            branch_data.places_count = places_count
            branch_data.manager_name = current_user.full_name
            result.append(branch_data)
    
    return result


# API для ограничений клиентов
@router.get("/restrictions", response_model=ClientRestrictionList, dependencies=[Depends(require_salon)])
def get_salon_restrictions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение всех ограничений салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    restrictions = db.query(ClientRestriction).filter(
        ClientRestriction.salon_id == salon.id,
        ClientRestriction.is_active == True
    ).all()
    
    blacklist = [r for r in restrictions if r.restriction_type == 'blacklist']
    advance_payment_only = [r for r in restrictions if r.restriction_type == 'advance_payment_only']
    
    return ClientRestrictionList(
        blacklist=blacklist,
        advance_payment_only=advance_payment_only,
        total_restrictions=len(restrictions)
    )


@router.post("/restrictions", response_model=ClientRestriction, dependencies=[Depends(require_salon)])
def create_salon_restriction(
    restriction: ClientRestrictionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание ограничения для клиента"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Проверяем, не существует ли уже такое ограничение
    existing = db.query(ClientRestriction).filter(
        ClientRestriction.salon_id == salon.id,
        ClientRestriction.client_phone == restriction.client_phone,
        ClientRestriction.restriction_type == restriction.restriction_type,
        ClientRestriction.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Restriction already exists for this client")
    
    new_restriction = ClientRestriction(
        salon_id=salon.id,
        client_phone=restriction.client_phone,
        restriction_type=restriction.restriction_type,
        reason=restriction.reason
    )
    
    db.add(new_restriction)
    db.commit()
    db.refresh(new_restriction)
    
    return new_restriction


@router.put("/restrictions/{restriction_id}", response_model=ClientRestriction, dependencies=[Depends(require_salon)])
def update_salon_restriction(
    restriction_id: int,
    restriction_update: ClientRestrictionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Обновление ограничения"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    restriction = db.query(ClientRestriction).filter(
        ClientRestriction.id == restriction_id,
        ClientRestriction.salon_id == salon.id
    ).first()
    
    if not restriction:
        raise HTTPException(status_code=404, detail="Restriction not found")
    
    # Обновляем поля
    for field, value in restriction_update.dict(exclude_unset=True).items():
        setattr(restriction, field, value)
    
    restriction.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(restriction)
    
    return restriction


@router.delete("/restrictions/{restriction_id}", dependencies=[Depends(require_salon)])
def delete_salon_restriction(
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Удаление ограничения (деактивация)"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    restriction = db.query(ClientRestriction).filter(
        ClientRestriction.id == restriction_id,
        ClientRestriction.salon_id == salon.id
    ).first()
    
    if not restriction:
        raise HTTPException(status_code=404, detail="Restriction not found")
    
    # Деактивируем ограничение
    restriction.is_active = False
    restriction.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Restriction deactivated successfully"}


@router.post("/restrictions/check", dependencies=[Depends(require_salon)])
def check_client_restriction(
    client_phone: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Проверка ограничений для клиента"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    restrictions = db.query(ClientRestriction).filter(
        ClientRestriction.salon_id == salon.id,
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

# Новые эндпоинты для салонного дашборда
@router.get("/dashboard/stats")
def get_salon_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение статистики для салонного дашборда.
    """
    try:
        salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
        if not salon:
            raise HTTPException(status_code=404, detail="Salon profile not found")
        
        # Получаем информацию о подписке
        subscription_info = {
            "is_active": True,  # Заглушка, нужно реализовать логику
            "expires_at": "2025-12-31",
            "days_remaining": 30
        }
        
        # Уровень загрузки каждого филиала на ближайшие 3 дня
        from datetime import timedelta, date
        today = date.today()
        next_3_days = [today + timedelta(days=i) for i in range(3)]
        
        branches_loading = []
        for branch in salon.branches:
            daily_bookings = []
            for day in next_3_days:
                # Получаем количество записей на конкретный день
                bookings_count = (
                    db.query(func.count(Booking.id))
                    .filter(
                        Booking.branch_id == branch.id,
                        func.date(Booking.start_time) == day,
                        Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED])
                    )
                    .scalar() or 0
                )
                
                # Получаем общее количество доступных слотов (примерная оценка)
                # Предполагаем, что рабочий день 8 часов, слоты по 10 минут
                total_slots = 48  # 8 часов * 6 слотов в час
                
                loading_percentage = min((bookings_count / total_slots) * 100, 100) if total_slots > 0 else 0
                
                daily_bookings.append({
                    "date": day.isoformat(),
                    "bookings_count": bookings_count,
                    "loading_percentage": round(loading_percentage, 1)
                })
            
            branches_loading.append({
                "branch_id": branch.id,
                "branch_name": branch.name,
                "daily_loading": daily_bookings
            })
        
        # Динамика в бронях за последний месяц
        month_ago = datetime.now(timezone.utc) - timedelta(days=30)
        two_months_ago = datetime.now(timezone.utc) - timedelta(days=60)
        
        current_month_bookings = (
            db.query(func.count(Booking.id))
            .filter(
                Booking.salon_id == salon.id,
                Booking.start_time >= month_ago
            )
            .scalar() or 0
        )
        
        previous_month_bookings = (
            db.query(func.count(Booking.id))
            .filter(
                Booking.salon_id == salon.id,
                Booking.start_time >= two_months_ago,
                Booking.start_time < month_ago
            )
            .scalar() or 0
        )
        
        bookings_dynamics = 0
        if previous_month_bookings > 0:
            bookings_dynamics = ((current_month_bookings - previous_month_bookings) / previous_month_bookings) * 100
        
        # Динамика в деньгах за последний месяц
        current_month_income = (
            db.query(func.sum(Income.total_amount))
            .filter(
                Income.salon_id == salon.id,
                Income.income_date >= month_ago.date()
            )
            .scalar() or 0
        )
        
        previous_month_income = (
            db.query(func.sum(Income.total_amount))
            .filter(
                Income.salon_id == salon.id,
                Income.income_date >= two_months_ago.date(),
                Income.income_date < month_ago.date()
            )
            .scalar() or 0
        )
        
        income_dynamics = 0
        if previous_month_income > 0:
            income_dynamics = ((current_month_income - previous_month_income) / previous_month_income) * 100
        
        # Количество мастеров и их динамика
        masters_count = len(salon.masters)
        
        # Получаем статистику мастеров за последние 6 месяцев
        six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
        
        masters_stats = []
        for master in salon.masters:
            # Количество записей за последние 6 месяцев
            bookings_count = (
                db.query(func.count(Booking.id))
                .filter(
                    Booking.master_id == master.id,
                    Booking.start_time >= six_months_ago,
                    Booking.status.in_([BookingStatus.COMPLETED, BookingStatus.CANCELLED])
                )
                .scalar() or 0
            )
            
            # Общий заработок мастера
            total_earnings = (
                db.query(func.sum(Income.master_earnings))
                .filter(
                    Income.salon_id == salon.id,
                    Income.master_id == master.id,
                    Income.income_date >= six_months_ago.date()
                )
                .scalar() or 0
            )
            
            masters_stats.append({
                "master_id": master.id,
                "master_name": master.user.full_name if master.user else "Неизвестный мастер",
                "bookings_count": bookings_count,
                "total_earnings": float(total_earnings)
            })
        
        # Сортируем мастеров по количеству записей
        masters_stats.sort(key=lambda x: x["bookings_count"], reverse=True)
        
        # Лидеры и аутсайдеры
        top_masters = masters_stats[:3] if len(masters_stats) >= 3 else masters_stats
        bottom_masters = masters_stats[-3:] if len(masters_stats) >= 3 else masters_stats
        
        # Сальдо в динамике за последние 6 месяцев
        monthly_balance = []
        for i in range(6):
            month_start = (datetime.now(timezone.utc) - timedelta(days=30*i)).replace(day=1)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            
            # Доходы за месяц
            month_income = (
                db.query(func.sum(Income.total_amount))
                .filter(
                    Income.salon_id == salon.id,
                    Income.income_date >= month_start.date(),
                    Income.income_date <= month_end.date()
                )
                .scalar() or 0
            )
            
            # Расходы за месяц
            month_expenses = (
                db.query(func.sum(Expense.amount_with_vat))
                .filter(
                    Expense.salon_id == salon.id,
                    Expense.expense_date >= month_start.date(),
                    Expense.expense_date <= month_end.date()
                )
                .scalar() or 0
            )
            
            monthly_balance.append({
                "month": month_start.strftime("%Y-%m"),
                "income": float(month_income),
                "expenses": float(month_expenses),
                "balance": float(month_income - month_expenses)
            })
        
        return {
            "subscription_info": subscription_info,
            "branches_loading": branches_loading,
            "current_month_bookings": current_month_bookings,
            "previous_month_bookings": previous_month_bookings,
            "bookings_dynamics": round(bookings_dynamics, 2),
            "current_month_income": float(current_month_income),
            "previous_month_income": float(previous_month_income),
            "income_dynamics": round(income_dynamics, 2),
            "masters_count": masters_count,
            "top_masters": top_masters,
            "bottom_masters": bottom_masters,
            "monthly_balance": monthly_balance
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении статистики: {str(e)}"
        )

# Endpoint для получения manager invitations для клиентов
@router.get("/my-manager-invitations", response_model=List[BranchManagerInvitation])
def get_my_manager_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Получение приглашений стать управляющим филиала для текущего пользователя.
    """
    try:
        # Проверяем, есть ли приглашения для пользователя
        invitations = (
            db.query(BranchManagerInvitationModel)
            .options(
                joinedload(BranchManagerInvitationModel.branch).joinedload(SalonBranch.salon)
            )
            .filter(
                BranchManagerInvitationModel.user_id == current_user.id,
                BranchManagerInvitationModel.status == SalonMasterInvitationStatus.ACCEPTED
            )
            .all()
        )
        
        result = []
        for invitation in invitations:
            try:
                invitation_data = {
                    "id": invitation.id,
                    "branch_id": invitation.branch_id,
                    "branch_name": invitation.branch.name if invitation.branch else "Неизвестный филиал",
                    "salon_name": invitation.branch.salon.name if invitation.branch and invitation.branch.salon else "Неизвестный салон",
                    "status": invitation.status,
                    "created_at": invitation.created_at,
                    "updated_at": invitation.updated_at
                }
                result.append(invitation_data)
            except Exception as e:
                print(f"Ошибка при обработке приглашения {invitation.id}: {e}")
                # Продолжаем обработку других приглашений
                continue
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении приглашений: {str(e)}"
        )

# Публичный endpoint для получения профиля салона (для клиентов)
@router.get("/profile/public")
def get_salon_profile_public(
    salon_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение публичного профиля салона для клиентов.
    """
    salon = db.query(Salon).filter(Salon.id == salon_id, Salon.is_active == True).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Салон не найден")
    
    return {
        "id": salon.id,
        "name": salon.name,
        "description": salon.description,
        "city": salon.city,
        "timezone": salon.timezone,
        "is_active": salon.is_active
    }


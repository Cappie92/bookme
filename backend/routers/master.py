import os
import uuid
from datetime import datetime, time, timedelta, date
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, File, Form, UploadFile, Query
from sqlalchemy.orm import Session

from auth import get_current_active_user, require_master
from database import get_db
from models import Booking, Master, MasterSchedule, MasterScheduleSettings, User, BookingStatus, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterInvitation, SalonMasterInvitationStatus, ClientRestriction, Salon, SalonBranch, Income
from schemas import Booking as BookingSchema
from schemas import Salon as SalonSchema
from schemas import Schedule as ScheduleSchema
from schemas import ScheduleCreate, User as UserSchema
from schemas import MasterScheduleSlot, MasterScheduleUpdate, MasterScheduleResponse
from utils.schedule_conflicts import get_schedule_with_conflicts, create_schedule_from_settings
from schemas import Service as ServiceSchema, ServiceCreate, ServiceUpdate, ServiceOut
from schemas import ServiceCategoryCreate, ServiceCategoryOut
from schemas import MasterServiceCategoryCreate, MasterServiceCategoryOut, MasterServiceCreate, MasterServiceUpdate, MasterServiceOut, MasterProfileUpdate, InvitationResponse, InvitationOut, ClientRestrictionCreate, ClientRestrictionUpdate, ClientRestriction, ClientRestrictionOut, ClientRestrictionList

router = APIRouter(
    prefix="/master",
    tags=["master"],
    dependencies=[Depends(require_master)],
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
    Получение списка предстоящих бронирований мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")

    bookings = (
        db.query(Booking)
        .filter(
            Booking.master_id == master.id,
            Booking.start_time > datetime.utcnow(),
            Booking.status != BookingStatus.CANCELLED,
        )
        .all()
    )
    return bookings


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
            "website": master.website,
            "domain": master.domain,
            "logo": master.logo,
            "photo": master.photo,
            "use_photo_as_logo": master.use_photo_as_logo,
            "address": master.address,
            "background_color": master.background_color,
            "city": master.city,
            "timezone": master.timezone,
        }
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
    photo: Optional[UploadFile] = File(None),
    logo: Optional[UploadFile] = File(None),
    use_photo_as_logo: Optional[bool] = Form(None),
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
    if can_work_in_salon is not None:
        master.can_work_in_salon = can_work_in_salon
    if website is not None:
        master.website = website
    if domain is not None:
        master.domain = domain
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
    
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
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
    
    print(f"DEBUG: Исходный понедельник: {monday}")
    print(f"DEBUG: week_offset: {week_offset}")
    print(f"DEBUG: weeks_ahead: {weeks_ahead}")
    
    # Добавляем offset недель
    monday = monday + timedelta(days=week_offset * 7)
    
    print(f"DEBUG: Понедельник после offset: {monday}")
    
    # Получаем существующее расписание для текущей недели и следующих недель
    week_start = monday
    week_end = monday + timedelta(days=(weeks_ahead * 7) - 1)
    print(f"DEBUG: week_offset={week_offset}, weeks_ahead={weeks_ahead}, получаем расписание с {week_start} по {week_end}")
    
    # Получаем расписание с информацией о конфликтах
    schedule_slots = get_schedule_with_conflicts(db, master.id, week_start, week_end)
    
    print(f"DEBUG: Найдено слотов с конфликтами: {len(schedule_slots)}")
    
    # Создаем словарь для быстрого поиска
    schedule_dict = {}
    for slot in schedule_slots:
        day_key = f"{slot['schedule_date']}_{slot['hour']}_{slot['minute']}"
        schedule_dict[day_key] = slot

    # Генерируем все слоты для текущей недели и следующих недель
    slots = []
    for week in range(weeks_ahead):
        for i in range(7):  # 7 дней недели
            current_date = monday + timedelta(days=(week * 7) + i)
            for hour in range(24):  # 0:00 - 23:00
                for minute in [0, 30]:
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
                        conflict_type=slot_data.get('conflict_type')
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
    
    print(f"DEBUG: Месячное расписание с {month_start} по {month_end}")
    
    # Получаем расписание с информацией о конфликтах
    schedule_slots = get_schedule_with_conflicts(db, master.id, month_start, month_end)
    
    print(f"DEBUG: Найдено слотов с конфликтами: {len(schedule_slots)}")
    
    # Создаем словарь для быстрого поиска
    schedule_dict = {}
    for slot in schedule_slots:
        day_key = f"{slot['schedule_date']}_{slot['hour']}_{slot['minute']}"
        schedule_dict[day_key] = slot

    # Генерируем все слоты для месяца
    slots = []
    current_date = month_start
    while current_date <= month_end:
        for hour in range(24):
            for minute in [0, 30]:
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
                    conflict_type=slot_data.get('conflict_type')
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
    
    print(f"DEBUG: Создание расписания типа: {schedule_type}")
    print(f"DEBUG: Дата окончания: {valid_until_date}")
    
    if schedule_type == 'weekdays':
        weekdays = rules_data.get('weekdays', {})
        if not weekdays:
            raise HTTPException(status_code=400, detail="Не выбраны рабочие дни")
        
        print(f"DEBUG: Выбранные дни недели: {weekdays}")
        
        # Генерируем слоты для каждого дня недели до даты окончания
        current_date = datetime.now().date()
        print(f"DEBUG: Начинаем с даты: {current_date}")
        
        while current_date <= valid_until_date:
            weekday = current_date.weekday()  # 0 = понедельник, 6 = воскресенье
            # Преобразуем в формат 1-7 (пн-вс)
            weekday_key = weekday + 1  # Понедельник = 1, воскресенье = 7
            
            print(f"DEBUG: Дата {current_date}, день недели {weekday}, ключ {weekday_key}")
            
            if str(weekday_key) in weekdays:
                day_config = weekdays[str(weekday_key)]
                start_time = day_config.get('start', '09:00')
                end_time = day_config.get('end', '18:00')
                
                print(f"DEBUG: Создаем слоты для {current_date} с {start_time} до {end_time}")
                
                # Создаем слоты по 30 минут
                start_hour, start_minute = map(int, start_time.split(':'))
                end_hour, end_minute = map(int, end_time.split(':'))
                
                current_hour = start_hour
                current_minute = start_minute
                
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
    
    print(f"DEBUG: Всего слотов для создания: {len(slots_to_create)}")
    
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
    print(f"Creating category for user: {current_user.email}, role: {current_user.role}")
    
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        print(f"Профиль мастера не найден for user {current_user.id}")
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    
    print(f"Found master: {master.id}")
    
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
    print(f"Created category: {category.id}")
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
    
    # Получаем услуги с информацией о категориях
    services = db.query(MasterService, MasterServiceCategory).join(
        MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id
    ).filter(MasterService.master_id == master.id).all()
    
    # Преобразуем в нужный формат
    result = []
    for service, category in services:
        result.append({
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "category_id": service.category_id,
            "category_name": category.name,
            "price": service.price,
            "duration": service.duration,
            "master_id": service.master_id,
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
            
            while current_hour < end_hour or (current_hour == end_hour and current_minute < end_minute):
                slot_key = f"{date_str}_{current_hour:02d}_{current_minute:02d}"
                schedule[slot_key] = True
                
                # Переходим к следующему слоту
                if current_minute == 0:
                    current_minute = 30
                else:
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
    
    restrictions = db.query(ClientRestriction).filter(
        ClientRestriction.indie_master_id == master.id,
        ClientRestriction.is_active == True
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
    existing = db.query(ClientRestriction).filter(
        ClientRestriction.indie_master_id == master.id,
        ClientRestriction.client_phone == restriction.client_phone,
        ClientRestriction.restriction_type == restriction.restriction_type,
        ClientRestriction.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Restriction already exists for this client")
    
    new_restriction = ClientRestriction(
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

# Новые эндпоинты для мастерского дашборда
@router.get("/dashboard/stats")
def get_master_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение статистики для мастерского дашборда.
    """
    try:
        from sqlalchemy import func, or_
        from models import Income, Service, SalonBranch, BookingStatus, Subscription
        
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=404, detail="Master profile not found")
        
        # Проверяем, является ли мастер индивидуалом
        is_indie_master = master.can_work_independently
        
        # Получаем информацию о подписке (если мастер индивидуал)
        subscription_info = None
        if is_indie_master:
            # Получаем реальную информацию о подписке
            from models import SubscriptionType
            subscription = db.query(Subscription).filter(
                Subscription.user_id == current_user.id,
                Subscription.subscription_type == SubscriptionType.MASTER,
                Subscription.is_active == True
            ).first()
            
            if subscription:
                days_remaining = max(0, (subscription.end_date - datetime.utcnow()).days)
                subscription_info = {
                    "is_active": subscription.is_active,
                    "expires_at": subscription.end_date.strftime("%d-%m-%Y"),
                    "days_remaining": days_remaining
                }
            else:
                subscription_info = {
                    "is_active": False,
                    "expires_at": None,
                    "days_remaining": 0
                }
        
        # Ближайший рабочий день и время первой записи
        from datetime import timedelta, date
        today = date.today()
        
        # Получаем ближайшие записи
        next_bookings = (
            db.query(Booking)
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.start_time > datetime.utcnow(),
                Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED])
            )
            .order_by(Booking.start_time.asc())
            .limit(3)
            .all()
        )
        
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
            
            next_working_info = {
                "next_booking_date": next_booking.start_time.date().isoformat(),
                "next_booking_time": next_booking.start_time.time().isoformat(),
                "work_location": work_location,
                "client_name": next_booking.client.full_name if next_booking.client else "Неизвестный клиент",
                "service_name": next_booking.service.name if next_booking.service else "Неизвестная услуга"
            }
        
        # Заработок за последнюю неделю
        week_ago = datetime.utcnow() - timedelta(days=7)
        two_weeks_ago = datetime.utcnow() - timedelta(days=14)
        
        # Заработок за последнюю неделю (только для индивидуальных мастеров)
        current_week_income = 0
        previous_week_income = 0
        income_dynamics = 0
        
        if is_indie_master:
            # Получаем доходы за последние две недели только для индивидуальных мастеров
            current_week_income = (
                db.query(func.sum(Income.master_earnings))
                .filter(
                    Income.indie_master_id == master.id,
                    Income.income_date >= week_ago.date()
                )
                .scalar() or 0
            )
            
            previous_week_income = (
                db.query(func.sum(Income.master_earnings))
                .filter(
                    Income.indie_master_id == master.id,
                    Income.income_date >= two_weeks_ago.date(),
                    Income.income_date < week_ago.date()
                )
                .scalar() or 0
            )
            
            # Динамика неделя к неделе
            if previous_week_income > 0:
                income_dynamics = ((current_week_income - previous_week_income) / previous_week_income) * 100
        
        # Динамика записей
        current_week_bookings = (
            db.query(func.count(Booking.id))
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.start_time >= week_ago,
                Booking.status.in_([BookingStatus.COMPLETED, BookingStatus.CANCELLED])
            )
            .scalar() or 0
        )
        
        previous_week_bookings = (
            db.query(func.count(Booking.id))
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.start_time >= two_weeks_ago,
                Booking.start_time < week_ago,
                Booking.status.in_([BookingStatus.COMPLETED, BookingStatus.CANCELLED])
            )
            .scalar() or 0
        )
        
        future_week_bookings = (
            db.query(func.count(Booking.id))
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.start_time > datetime.utcnow(),
                Booking.start_time <= datetime.utcnow() + timedelta(days=7),
                Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED])
            )
            .scalar() or 0
        )
        
        # Топ-3 услуг по количеству записей
        top_services_by_bookings = (
            db.query(
                Booking.service_id,
                func.count(Booking.id).label("booking_count")
            )
            .filter(
                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
                Booking.status.in_([BookingStatus.COMPLETED, BookingStatus.CANCELLED])
            )
            .group_by(Booking.service_id)
            .order_by(func.count(Booking.id).desc())
            .limit(3)
            .all()
        )
        
        # Получаем названия услуг
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
        
        # Топ-3 услуг по заработку (только для индивидуальных мастеров)
        top_services_by_earnings_with_names = []
        if is_indie_master:
            # Получаем топ услуг по заработку через связь с Booking
            top_services_by_earnings = (
                db.query(
                    Booking.service_id,
                    func.sum(Income.master_earnings).label("total_earnings")
                )
                .join(Income, Income.booking_id == Booking.id)
                .filter(
                    Income.indie_master_id == master.id
                )
                .group_by(Booking.service_id)
                .order_by(func.sum(Income.master_earnings).desc())
                .limit(3)
                .all()
            )
            
            # Получаем названия услуг для заработка
            service_earnings_names = {}
            for service_id, _ in top_services_by_earnings:
                service = db.query(Service).filter(Service.id == service_id).first()
                if service:
                    service_earnings_names[service_id] = service.name
            
            top_services_by_earnings_with_names = [
                {
                    "service_id": service_id,
                    "service_name": service_earnings_names.get(service_id, "Неизвестная услуга"),
                    "total_earnings": float(earnings)
                }
                for service_id, earnings in top_services_by_earnings
            ]
        
        return {
            "is_indie_master": is_indie_master,
            "subscription_info": subscription_info,
            "next_working_info": next_working_info,
            "current_week_income": float(current_week_income),
            "previous_week_income": float(previous_week_income),
            "income_dynamics": round(income_dynamics, 2),
            "current_week_bookings": current_week_bookings,
            "previous_week_bookings": previous_week_bookings,
            "future_week_bookings": future_week_bookings,
            "top_services_by_bookings": top_services_by_bookings_with_names,
            "top_services_by_earnings": top_services_by_earnings_with_names
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при получении статистики: {str(e)}"
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


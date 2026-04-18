from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from models import (
    Booking,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    OwnerType,
    User,
    Master,
    AppliedDiscount,
    Service,
    Salon,
    SalonBranch,
)
from schemas import (
    Booking as BookingSchema,
    BookingEditRequest as BookingEditRequestSchema,
    BookingEditRequestCreate,
    BookingEditRequestUpdate,
    BookingCreate,
    BookingUpdate,
    AvailableSlotOut,
)
from services.scheduling import check_booking_conflicts, get_available_slots, get_available_slots_any_master_logic, get_best_master_for_slot
from services.verification_service import VerificationService
from services.plusofon_service import plusofon_service
from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info

router = APIRouter(
    prefix="/bookings",
    tags=["bookings"],
    responses={401: {"description": "Требуется авторизация"}},
)


@router.get("/", response_model=List[BookingSchema])
async def list_bookings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    status: BookingStatus = None,
    start_date: datetime = None,
    end_date: datetime = None,
):
    """
    Получить список бронирований с возможностью фильтрации
    """
    query = db.query(Booking)

    if status:
        query = query.filter(Booking.status == status)
    if start_date:
        query = query.filter(Booking.start_time >= start_date)
    if end_date:
        query = query.filter(Booking.end_time <= end_date)

    # Фильтруем по роли пользователя
    if current_user.role == "client":
        query = query.filter(Booking.client_id == current_user.id)
    elif current_user.role == "master":
        query = query.filter(Booking.master_id == current_user.id)
    elif current_user.role == "salon":
        query = query.filter(Booking.salon_id == current_user.id)

    return query.all()


@router.post("/", response_model=BookingSchema)
async def create_booking(
    booking: BookingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Создать новое бронирование (требует авторизации)
    """
    # Проверяем обязательные поля
    if not booking.client_name or not booking.client_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Имя клиента обязательно"
        )
    
    if not booking.service_name or not booking.service_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Название услуги обязательно"
        )
    
    if not booking.service_duration or booking.service_duration <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Продолжительность услуги должна быть больше 0"
        )
    
    if not booking.service_price or booking.service_price <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Стоимость услуги должна быть больше 0"
        )
    
    # Проверяем, что время окончания больше времени начала
    if booking.end_time <= booking.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Время окончания должно быть больше времени начала"
        )
    
    # Проверяем, что время начала кратно 10 минутам
    start_minute = booking.start_time.minute
    if start_minute % 10 != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Время записи должно быть кратно 10 минутам (например, 14:20, 14:30, 14:40)"
        )
    
    # Проверяем, что длительность услуги кратна 10 минутам
    if booking.service_duration % 10 != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Длительность услуги должна быть кратна 10 минутам"
        )
    
    # Проверяем, что продолжительность соответствует времени
    duration_minutes = (booking.end_time - booking.start_time).total_seconds() / 60
    if abs(duration_minutes - booking.service_duration) > 1:  # Допускаем погрешность в 1 минуту
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Продолжительность услуги не соответствует времени записи"
        )
    
    # Определяем тип владельца и проверяем рабочее время
    owner_type = None
    owner_id = None
    is_salon_work = False
    
    if booking.master_id:
        owner_type = OwnerType.MASTER
        owner_id = booking.master_id
        # Проверяем, работает ли мастер в указанное время
        from services.scheduling import check_master_working_hours
        is_salon_work = booking.salon_id is not None
        salon_id = booking.salon_id if is_salon_work else None
        if not check_master_working_hours(db, booking.master_id, booking.start_time, booking.end_time, 
                                        is_salon_work=is_salon_work, salon_id=salon_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Мастер не работает в указанное время"
            )
    elif booking.indie_master_id:
        owner_type = OwnerType.INDIE_MASTER
        owner_id = booking.indie_master_id
        # Проверяем, работает ли индивидуальный мастер в указанное время
        from services.scheduling import check_master_working_hours
        if not check_master_working_hours(db, booking.indie_master_id, booking.start_time, booking.end_time):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Мастер не работает в указанное время"
            )
    elif booking.salon_id:
        owner_type = OwnerType.SALON
        owner_id = booking.salon_id
        # Для салона проверяем, есть ли мастер, который работает в это время
        if booking.master_id:
            is_salon_work = True
            from services.scheduling import check_master_working_hours
            if not check_master_working_hours(db, booking.master_id, booking.start_time, booking.end_time, 
                                            is_salon_work=True, salon_id=booking.salon_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Мастер не работает в салоне в указанное время"
                )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Не указан мастер, индивидуальный мастер или салон"
        )
    
    # Проверяем конфликты
    if check_booking_conflicts(
        db,
        booking.start_time,
        booking.end_time,
        owner_type,
        owner_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Выбранное время уже занято"
        )

    # Обработка баллов лояльности (только для авторизованных клиентов)
    loyalty_points_used = 0
    if booking.use_loyalty_points and booking.master_id and current_user:
        # Резервирование баллов происходит только для мастеров
        from utils.loyalty import (
            get_loyalty_settings, get_available_points,
            calculate_points_to_spend
        )
        # Service уже импортирован в начале модуля
        
        # Получаем настройки лояльности мастера
        loyalty_settings = get_loyalty_settings(db, booking.master_id)
        
        if loyalty_settings and loyalty_settings.is_enabled:
            # Получаем доступные баллы
            available_points = get_available_points(db, booking.master_id, current_user.id)
            
            if available_points > 0:
                # Получаем стоимость услуги
                service = db.query(Service).filter(Service.id == booking.service_id).first()
                service_price = service.price if service else 0
                
                if service_price > 0:
                    # Вычисляем максимальную сумму списания
                    max_spendable = calculate_points_to_spend(
                        available_points,
                        service_price,
                        loyalty_settings.max_payment_percent
                    )
                    
                    # Резервируем баллы (записываем в booking.loyalty_points_used)
                    loyalty_points_used = int(max_spendable)
    
    # ===== Скидки мастера (runtime) =====
    service = db.query(Service).filter(Service.id == booking.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    base_price = service.price or 0

    discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
        master_id=booking.master_id if booking.master_id else None,
        client_id=current_user.id if current_user else None,
        client_phone=current_user.phone if current_user else None,
        booking_start=booking.start_time,
        service_id=booking.service_id,
        db=db,
    )

    # Создаем запись (salon_id/branch_id только через normalize_booking_fields)
    from utils.booking_factory import normalize_booking_fields, BookingOwnerError

    booking_data = booking.dict()
    booking_data.pop('client_name', None)
    booking_data.pop('service_name', None)
    booking_data.pop('service_duration', None)
    booking_data.pop('service_price', None)
    booking_data.pop('use_loyalty_points', None)
    booking_data.pop('salon_id', None)
    booking_data.pop('branch_id', None)
    booking_data['loyalty_points_used'] = loyalty_points_used
    booking_data['payment_amount'] = (
        discounted_payment_amount if discounted_payment_amount is not None else base_price
    )
    booking_data['client_id'] = current_user.id

    # Определяем начальный статус записи
    initial_status = BookingStatus.CREATED
    if booking.master_id:
        master = db.query(Master).filter(Master.id == booking.master_id).first()
        if master and master.auto_confirm_bookings:
            initial_status = BookingStatus.COMPLETED
    elif booking.indie_master_id:
        from models import IndieMaster
        indie_master = db.query(IndieMaster).filter(IndieMaster.id == booking.indie_master_id).first()

    booking_data['status'] = initial_status.value
    if booking.indie_master_id:
        owner_type_str = "indie"
        owner_id_val = booking.indie_master_id
    elif booking.master_id:
        owner_type_str = "master" if (service.salon_id is None) else "salon"
        owner_id_val = booking.master_id
    else:
        owner_type_str = None
        owner_id_val = None
    if not owner_id_val:
        raise HTTPException(status_code=400, detail="master_id or indie_master_id required")
    try:
        booking_data = normalize_booking_fields(
            booking_data, service, owner_type_str, owner_id_val, db=db
        )
    except BookingOwnerError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    db_booking = Booking(**booking_data)
    db.add(db_booking)
    db.flush()

    if applied_discount_data:
        applied_discount = AppliedDiscount(
            booking_id=db_booking.id,
            discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] != "personal" else None,
            personal_discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] == "personal" else None,
            discount_percent=applied_discount_data["discount_percent"],
            discount_amount=applied_discount_data["discount_amount"],
        )
        db.add(applied_discount)

    db.commit()
    db.refresh(db_booking)
    if applied_discount_data:
        db_booking.applied_discount = build_applied_discount_info(applied_discount)
    return db_booking


@router.post("/public")
async def create_booking_public(
    booking: BookingCreate,
    client_phone: str,
    db: Session = Depends(get_db),
):
    """
    Создать новое бронирование (публичный endpoint)
    """
    from utils.master_canon import LEGACY_INDIE_MODE
    from models import IndieMaster

    # master-only: indie_master_id запрещён (400). legacy: резолв indie→master.
    effective_master_id = booking.master_id
    effective_indie_id = booking.indie_master_id
    if booking.indie_master_id:
        if not LEGACY_INDIE_MODE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use master_id. Indie-masters merged into masters."
            )
        im = db.query(IndieMaster).filter(IndieMaster.id == booking.indie_master_id).first()
        if not im or im.master_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use master_id. Indie-masters merged into masters."
            )
        effective_master_id = im.master_id
        effective_indie_id = None

    # Guard: мастер без timezone не может принимать записи
    if effective_master_id:
        master = db.query(Master).filter(Master.id == effective_master_id).first()
        if master and (not getattr(master, "timezone", None) or not str(master.timezone).strip()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Мастер не настроил часовой пояс. Запись невозможна.",
            )

    # Проверяем конфликты
    owner_type = None
    owner_id = None

    if effective_master_id:
        owner_type = OwnerType.MASTER
        owner_id = effective_master_id
        from services.scheduling import check_master_working_hours
        is_salon_work = booking.salon_id is not None
        salon_id = booking.salon_id if is_salon_work else None
        if not check_master_working_hours(db, effective_master_id, booking.start_time, booking.end_time,
                                        is_salon_work=is_salon_work, salon_id=salon_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Мастер не работает в указанное время"
            )
    elif effective_indie_id:
        owner_type = OwnerType.INDIE_MASTER
        owner_id = effective_indie_id
        from services.scheduling import check_master_working_hours
        if not check_master_working_hours(db, effective_indie_id, booking.start_time, booking.end_time):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Мастер не работает в указанное время"
            )
    elif booking.salon_id:
        owner_type = OwnerType.SALON
        owner_id = booking.salon_id
        # Для салона проверяем, есть ли мастер, который работает в это время
        if booking.master_id:
            from services.scheduling import check_master_working_hours
            if not check_master_working_hours(db, booking.master_id, booking.start_time, booking.end_time, 
                                            is_salon_work=True, salon_id=booking.salon_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Мастер не работает в салоне в указанное время"
                )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Не указан мастер, индивидуальный мастер или салон"
        )
    
    if check_booking_conflicts(
        db,
        booking.start_time,
        booking.end_time,
        owner_type,
        owner_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Выбранное время уже занято"
        )

    # Ищем или создаем клиента по номеру телефона
    client = db.query(User).filter(User.phone == client_phone).first()
    is_new_client = False
    needs_password_setup = False
    needs_password_verification = False
    needs_phone_verification = False
    
    if not client:
        # Создаем нового клиента
        client = User(
            phone=client_phone,
            email=f"{client_phone}@temp.com",  # Временный email для токена
            role="client",
            is_active=True,
            is_verified=True,
            is_phone_verified=False,  # Телефон не верифицирован
            full_name=f"Клиент {client_phone}",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        is_new_client = True
        needs_password_setup = True
        needs_phone_verification = True
    elif client.role != "client":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Запись не удалась, войдите под аккаунтом клиента"
        )
    else:
        # Существующий клиент - добавляем email если его нет
        if not client.email:
            client.email = f"{client_phone}@temp.com"
            db.commit()
            db.refresh(client)
        
        # Проверяем, нужна ли установка пароля
        if not client.hashed_password:
            needs_password_setup = True
        else:
            # Существующий пользователь с паролем - нужно проверить пароль
            needs_password_verification = True
        
        # Проверяем, нужна ли верификация телефона
        if not client.is_phone_verified:
            needs_phone_verification = True

    # Определяем начальный статус записи
    initial_status = BookingStatus.CREATED
    
    # Проверяем, нужно ли автоматически подтвердить запись
    if effective_master_id:
        master = db.query(Master).filter(Master.id == effective_master_id).first()
        if master and master.auto_confirm_bookings:
            from services.scheduling import check_master_working_hours
            is_salon_work = booking.salon_id is not None
            salon_id = booking.salon_id if is_salon_work else None
            if check_master_working_hours(db, effective_master_id, booking.start_time, booking.end_time,
                                        is_salon_work=is_salon_work, salon_id=salon_id):
                initial_status = BookingStatus.COMPLETED
    
    # Цена и скидки (runtime)
    service = db.query(Service).filter(Service.id == booking.service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    base_price = service.price or 0

    discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
        master_id=effective_master_id,
        client_id=client.id,
        client_phone=client.phone,
        booking_start=booking.start_time,
        service_id=booking.service_id,
        db=db,
    )

    # Создаем бронирование (salon_id/branch_id только через normalize_booking_fields)
    from utils.booking_factory import normalize_booking_fields, BookingOwnerError

    booking_dict = booking.dict()
    booking_dict.pop('client_name', None)
    booking_dict.pop('service_name', None)
    booking_dict.pop('service_duration', None)
    booking_dict.pop('service_price', None)
    booking_dict.pop('use_loyalty_points', None)
    booking_dict.pop('salon_id', None)
    booking_dict.pop('branch_id', None)
    booking_dict['loyalty_points_used'] = 0
    booking_dict['status'] = initial_status.value
    booking_dict['payment_amount'] = (
        discounted_payment_amount if discounted_payment_amount is not None else base_price
    )
    booking_dict['client_id'] = client.id

    if effective_indie_id:
        owner_type_str = "indie"
        owner_id_val = effective_indie_id
    elif effective_master_id:
        owner_type_str = "master" if (service.salon_id is None) else "salon"
        owner_id_val = effective_master_id
    else:
        owner_type_str = "salon"
        owner_id_val = booking.salon_id
    try:
        booking_dict = normalize_booking_fields(
            booking_dict, service, owner_type_str, owner_id_val, db=db
        )
    except BookingOwnerError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    db_booking = Booking(**booking_dict)
    db.add(db_booking)
    db.flush()

    if applied_discount_data:
        applied_discount = AppliedDiscount(
            booking_id=db_booking.id,
            discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] != "personal" else None,
            personal_discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] == "personal" else None,
            discount_percent=applied_discount_data["discount_percent"],
            discount_amount=applied_discount_data["discount_amount"],
        )
        db.add(applied_discount)

    db.commit()
    db.refresh(db_booking)
    
    # Если нужна верификация телефона, отправляем звонок
    if needs_phone_verification:
        try:
            verification_code = VerificationService.generate_verification_code()
            client.phone_verification_code = verification_code
            client.phone_verification_expires = datetime.utcnow() + timedelta(minutes=5)
            db.commit()
            
            call_result = await plusofon_service.initiate_call(client_phone, verification_code)
            if not call_result["success"]:
                print(f"Ошибка отправки звонка верификации: {call_result['message']}")
        except Exception as e:
            print(f"Ошибка отправки звонка верификации: {e}")
    
    # Создаем токен для клиента
    from auth import create_access_token
    access_token = create_access_token(data={"sub": client.email})
    
    return {
        "booking": db_booking,
        "access_token": access_token,
        "is_new_client": is_new_client,
        "needs_password_setup": needs_password_setup,
        "needs_password_verification": needs_password_verification,
        "needs_phone_verification": needs_phone_verification,
        "client": {
            "id": client.id,
            "phone": client.phone,
            "full_name": client.full_name,
            "role": client.role,
            "is_phone_verified": client.is_phone_verified
        }
    }


@router.put("/{booking_id}", response_model=BookingSchema)
async def update_booking(
    booking_id: int,
    booking: BookingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Обновить существующее бронирование
    """
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
        )
    
    # Проверка доступа по роли
    if current_user.role == "client":
        if db_booking.client_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
    elif current_user.role == "master":
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль мастера не найден")
        if db_booking.master_id != master.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
    elif current_user.role == "salon":
        # Проверяем, является ли пользователь владельцем салона
        salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
        if salon:
            if db_booking.salon_id != salon.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
        else:
            # Проверяем, является ли пользователь менеджером филиала
            branch = db.query(SalonBranch).filter(
                SalonBranch.manager_id == current_user.id,
                SalonBranch.salon_id == db_booking.salon_id
            ).first()
            if not branch or (db_booking.branch_id and db_booking.branch_id != branch.id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")

    # Проверяем конфликты
    if booking.start_time and booking.end_time:
        if check_booking_conflicts(
            db,
            booking.start_time,
            booking.end_time,
            OwnerType.MASTER if booking.master_id else OwnerType.SALON,
            booking.master_id or booking.salon_id,
            booking_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Выбранное время уже занято",
            )

    for key, value in booking.dict(exclude_unset=True).items():
        setattr(db_booking, key, value)

    db.commit()
    db.refresh(db_booking)
    
    # Загружаем AppliedDiscount с связанными правилами
    applied_discount = (
        db.query(AppliedDiscount)
        .options(
            joinedload(AppliedDiscount.loyalty_discount),
            joinedload(AppliedDiscount.personal_discount),
        )
        .filter(AppliedDiscount.booking_id == booking_id)
        .first()
    )
    
    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
    return db_booking


@router.delete("/{booking_id}")
async def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Удалить бронирование
    """
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
        )

    db.delete(db_booking)
    db.commit()
    return {"message": "Бронирование успешно удалено"}


@router.post("/{booking_id}/edit-requests", response_model=BookingEditRequestSchema)
async def create_edit_request(
    booking_id: int,
    edit_request: BookingEditRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Создать запрос на изменение бронирования
    """
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
        )

    # Проверяем конфликты для нового времени
    if check_booking_conflicts(
        db,
        edit_request.proposed_start,
        edit_request.proposed_end,
        OwnerType.MASTER if db_booking.master_id else OwnerType.SALON,
        db_booking.master_id or db_booking.salon_id,
        booking_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Выбранное время уже занято"
        )

    db_edit_request = BookingEditRequest(
        booking_id=booking_id,
        proposed_start=edit_request.proposed_start,
        proposed_end=edit_request.proposed_end,
    )
    db.add(db_edit_request)
    db.commit()
    db.refresh(db_edit_request)
    return db_edit_request


@router.put("/edit-requests/{request_id}", response_model=BookingEditRequestSchema)
async def update_edit_request(
    request_id: int,
    update: BookingEditRequestUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Обновить статус запроса на изменение бронирования
    """
    db_request = (
        db.query(BookingEditRequest).filter(BookingEditRequest.id == request_id).first()
    )
    if not db_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Запрос на изменение не найден",
        )

    if update.status == EditRequestStatus.ACCEPTED:
        # Обновляем время бронирования
        db_booking = db_request.booking
        db_booking.start_time = db_request.proposed_start
        db_booking.end_time = db_request.proposed_end

    db_request.status = update.status
    db.commit()
    db.refresh(db_request)
    return db_request


@router.get(
    "/available-slots",
    response_model=List[AvailableSlotOut],
    summary="Доступные слоты для бронирования",
    responses={401: {"description": "Требуется авторизация"}, 422: {"description": "Ошибка валидации параметров"}},
)
async def get_available_slots_endpoint(
    owner_type: OwnerType,
    owner_id: int,
    date: datetime,
    service_duration: int,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Получить доступные слоты для бронирования (требует авторизации)."""
    return get_available_slots(db, owner_type, owner_id, date, service_duration, branch_id)


@router.get("/test-repeat", response_model=dict)
async def test_repeat_endpoint():
    """
    Простой тестовый endpoint для диагностики
    """
    return {"message": "Тестовый endpoint работает!", "status": "success"}

@router.get(
    "/available-slots-repeat",
    response_model=List[AvailableSlotOut],
    summary="Доступные слоты (публичный, по дате year/month/day)",
    responses={422: {"description": "Неверная дата"}},
)
async def get_available_slots_public(
    owner_type: OwnerType,
    owner_id: int,
    year: int,
    month: int,
    day: int,
    service_duration: int,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Получить доступные слоты для бронирования (публичный endpoint, без токена)."""
    try:
        # Создаем datetime из отдельных параметров
        parsed_date = datetime(year, month, day)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверная дата: {str(e)}"
        )
    
    print(f"\n{'='*60}")
    print(f"=== ПУБЛИЧНЫЙ ЗАПРОС СЛОТОВ ===")
    print(f"owner_type: {owner_type}")
    print(f"owner_id: {owner_id}")
    print(f"year: {year}, month: {month}, day: {day}")
    print(f"parsed_date: {parsed_date}")
    print(f"service_duration: {service_duration}")
    print(f"branch_id: {branch_id}")
    print(f"parsed_date.date(): {parsed_date.date()}")
    print(f"parsed_date.weekday(): {parsed_date.weekday()}")
    print(f"parsed_date.isoformat(): {parsed_date.isoformat()}")
    print(f"{'='*60}")
    
    result = get_available_slots(db, owner_type, owner_id, parsed_date, service_duration, branch_id)
    
    print(f"Результат: {len(result)} слотов")
    if result:
        print(f"Первый слот: {result[0]}")
        print(f"Последний слот: {result[-1]}")
    print(f"{'='*60}\n")
    
    return result


@router.get(
    "/available-slots-any-master",
    response_model=List[AvailableSlotOut],
    summary="Доступные слоты (любой мастер в салоне)",
    responses={422: {"description": "Неверная дата"}},
)
async def get_available_slots_any_master(
    salon_id: int,
    service_id: int,
    year: int,
    month: int,
    day: int,
    service_duration: int,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Получить доступные слоты для услуги «Любой мастер» в салоне."""
    try:
        # Создаем datetime из отдельных параметров
        parsed_date = datetime(year, month, day)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверная дата: {str(e)}"
        )
    
    print(f"\n{'='*60}")
    print(f"=== ЗАПРОС СЛОТОВ 'ЛЮБОЙ МАСТЕР' ===")
    print(f"salon_id: {salon_id}")
    print(f"service_id: {service_id}")
    print(f"year: {year}, month: {month}, day: {day}")
    print(f"parsed_date: {parsed_date}")
    print(f"service_duration: {service_duration}")
    print(f"branch_id: {branch_id}")
    print(f"{'='*60}")
    
    result = get_available_slots_any_master_logic(
        db, salon_id, service_id, parsed_date, service_duration, branch_id
    )
    
    print(f"Результат: {len(result)} слотов")
    if result:
        print(f"Первый слот: {result[0]}")
        print(f"Последний слот: {result[-1]}")
    print(f"{'='*60}\n")
    
    return result


@router.get("/{booking_id}", response_model=BookingSchema)
async def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Получить информацию о конкретном бронировании
    """
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
        )
    
    # Проверка доступа по роли
    if current_user.role == "client":
        if db_booking.client_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
    elif current_user.role == "master":
        master = db.query(Master).filter(Master.user_id == current_user.id).first()
        if not master:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль мастера не найден")
        if db_booking.master_id != master.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
    elif current_user.role == "salon":
        # Проверяем, является ли пользователь владельцем салона
        salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
        if salon:
            if db_booking.salon_id != salon.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
        else:
            # Проверяем, является ли пользователь менеджером филиала
            branch = db.query(SalonBranch).filter(
                SalonBranch.manager_id == current_user.id,
                SalonBranch.salon_id == db_booking.salon_id
            ).first()
            if not branch or (db_booking.branch_id and db_booking.branch_id != branch.id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
    
    # Загружаем AppliedDiscount с связанными правилами
    applied_discount = (
        db.query(AppliedDiscount)
        .options(
            joinedload(AppliedDiscount.loyalty_discount),
            joinedload(AppliedDiscount.personal_discount),
        )
        .filter(AppliedDiscount.booking_id == booking_id)
        .first()
    )
    
    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
    return db_booking


@router.post("/verify-phone-cjm", summary="Верификация телефона в CJM записи на услугу")
async def verify_phone_cjm(
    phone: str,
    code: str,
    db: Session = Depends(get_db)
):
    """
    Верификация телефона по коду в процессе записи на услугу.
    """
    try:
        # Ищем пользователя по телефону
        user = db.query(User).filter(User.phone == phone).first()
        if not user:
            return {
                "success": False,
                "message": "Пользователь с таким номером телефона не найден"
            }
        
        # Проверяем код верификации
        if (user.phone_verification_code == code and 
            user.phone_verification_expires and 
            user.phone_verification_expires > datetime.utcnow()):
            
            # Отмечаем телефон как верифицированный
            user.is_phone_verified = True
            user.phone_verification_code = None
            user.phone_verification_expires = None
            db.commit()
            
            return {
                "success": True,
                "message": "Телефон успешно верифицирован",
                "user_id": user.id
            }
        else:
            return {
                "success": False,
                "message": "Неверный код или код истек"
            }
            
    except Exception as e:
        print(f"Ошибка верификации телефона в CJM: {e}")
        return {
            "success": False,
            "message": "Внутренняя ошибка сервера"
        }


@router.post("/create-with-any-master", response_model=dict)
async def create_booking_with_any_master(
    salon_id: int,
    service_id: int,
    start_time: datetime,
    end_time: datetime,
    branch_id: Optional[int] = None,
    notes: Optional[str] = None,
    client_phone: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Создать запись с автоматическим выбором лучшего мастера
    """
    try:
        print(f"\n{'='*60}")
        print(f"=== СОЗДАНИЕ ЗАПИСИ С 'ЛЮБЫМ МАСТЕРОМ' ===")
        print(f"salon_id: {salon_id}")
        print(f"service_id: {service_id}")
        print(f"start_time: {start_time}")
        print(f"end_time: {end_time}")
        print(f"branch_id: {branch_id}")
        print(f"notes: {notes}")
        print(f"client_phone: {client_phone}")
        print(f"{'='*60}")
        
        # Получаем лучшего мастера для данного времени
        best_master = get_best_master_for_slot(
            db, salon_id, service_id, start_time, end_time, branch_id
        )
        
        if not best_master:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нет доступных мастеров для выбранного времени"
            )
        
        print(f"Выбран лучший мастер: {best_master['id']} ({best_master['name']})")
        
        # Создаем данные для записи
        booking_data = {
            "service_id": service_id,
            "master_id": best_master['id'],
            "salon_id": salon_id,
            "branch_id": branch_id,
            "start_time": start_time,
            "end_time": end_time,
            "notes": notes
        }
        
        # Проверяем конфликты
        if check_booking_conflicts(
            db, start_time, end_time, OwnerType.MASTER, best_master['id']
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Выбранное время уже занято"
            )
        
        # Создаем запись (salon_id/branch_id через normalize_booking_fields)
        from models import Booking, BookingStatus, Service
        from datetime import datetime
        from utils.booking_factory import normalize_booking_fields, BookingOwnerError

        service = db.query(Service).filter(Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        base_data = {
            "service_id": service_id,
            "master_id": best_master["id"],
            "start_time": start_time,
            "end_time": end_time,
            "notes": notes,
            "status": BookingStatus.CREATED.value,
            "payment_amount": service.price or 0,
        }
        try:
            booking_data = normalize_booking_fields(
                base_data, service, "salon", best_master["id"], db=db
            )
        except BookingOwnerError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        new_booking = Booking(**booking_data, created_at=datetime.utcnow())
        
        # Если указан телефон клиента, создаем или находим пользователя
        if client_phone:
            from models import User
            user = db.query(User).filter(User.phone == client_phone).first()
            if user:
                new_booking.client_id = user.id
            else:
                # Создаем нового пользователя
                user = User(
                    phone=client_phone,
                    role="client",
                    is_active=True,
                    created_at=datetime.utcnow()
                )
                db.add(user)
                db.flush()  # Получаем ID пользователя
                new_booking.client_id = user.id
        
        db.add(new_booking)
        db.commit()
        db.refresh(new_booking)
        
        print(f"Запись успешно создана: ID {new_booking.id}")
        print(f"{'='*60}\n")
        
        return {
            "success": True,
            "booking_id": new_booking.id,
            "master_id": best_master['id'],
            "master_name": best_master['name'],
            "message": f"Запись создана с мастером {best_master['name']}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка создания записи: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании записи: {str(e)}"
        )

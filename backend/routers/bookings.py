from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import (
    Booking,
    BookingEditRequest,
    BookingStatus,
    EditRequestStatus,
    OwnerType,
    User,
)
from schemas import (
    Booking as BookingSchema,
    BookingEditRequest as BookingEditRequestSchema,
    BookingEditRequestCreate,
    BookingEditRequestUpdate,
    BookingCreate,
    BookingUpdate
)
from services.scheduling import check_booking_conflicts, get_available_slots, get_available_slots_any_master_logic, get_best_master_for_slot
from services.verification_service import VerificationService
from services.plusofon_service import plusofon_service

router = APIRouter(prefix="/bookings", tags=["bookings"])


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

    # Создаем запись, исключая дополнительные поля из схемы
    booking_data = booking.dict()
    booking_data.pop('client_name', None)
    booking_data.pop('service_name', None)
    booking_data.pop('service_duration', None)
    booking_data.pop('service_price', None)
    
    db_booking = Booking(**booking_data, client_id=current_user.id)
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
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
    # Проверяем конфликты
    owner_type = None
    owner_id = None
    
    if booking.master_id:
        owner_type = OwnerType.MASTER
        owner_id = booking.master_id
    elif booking.indie_master_id:
        owner_type = OwnerType.INDIE_MASTER
        owner_id = booking.indie_master_id
    elif booking.salon_id:
        owner_type = OwnerType.SALON
        owner_id = booking.salon_id
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

    # Создаем бронирование
    db_booking = Booking(**booking.dict(), client_id=client.id)
    db.add(db_booking)
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


@router.get("/available-slots", response_model=List[dict])
async def get_available_slots_endpoint(
    owner_type: OwnerType,
    owner_id: int,
    date: datetime,
    service_duration: int,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Получить доступные слоты для бронирования (требует авторизации)
    """
    return get_available_slots(db, owner_type, owner_id, date, service_duration, branch_id)


@router.get("/test-repeat", response_model=dict)
async def test_repeat_endpoint():
    """
    Простой тестовый endpoint для диагностики
    """
    return {"message": "Тестовый endpoint работает!", "status": "success"}

@router.get("/available-slots-repeat", response_model=List[dict])
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
    """
    Получить доступные слоты для бронирования (публичный endpoint)
    """
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


@router.get("/available-slots-any-master", response_model=List[dict])
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
    """
    Получить доступные слоты для "Любого мастера" в салоне
    """
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
        
        # Создаем запись
        from models import Booking, BookingStatus
        from datetime import datetime
        
        new_booking = Booking(
            service_id=service_id,
            master_id=best_master['id'],
            salon_id=salon_id,
            branch_id=branch_id,
            start_time=start_time,
            end_time=end_time,
            notes=notes,
            status=BookingStatus.CREATED,
            created_at=datetime.utcnow()
        )
        
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

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, get_current_user_optional
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
    ConfirmSignupPhoneVerificationRequest,
    PhoneVerificationResponse,
)
from services.scheduling import check_booking_conflicts, get_available_slots, get_available_slots_any_master_logic, get_best_master_for_slot
from services.pending_ticket_service import (
    claim_pending_ticket,
    delete_pending_ticket,
    get_pending_ticket,
    save_pending_ticket,
    store_pending_ticket,
)
from services.verification_service import PhoneChallengeError, VerificationService
from services.zvonok_service import zvonok_service
from settings import get_settings
from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info
from utils.phone import normalize_to_canonical

router = APIRouter(
    prefix="/bookings",
    tags=["bookings"],
    responses={401: {"description": "Требуется авторизация"}},
)

PUBLIC_BOOKING_TICKET_TTL_SECONDS = 15 * 60
PUBLIC_BOOKING_TICKET_PURPOSE = "public_booking_registration"
PUBLIC_BOOKING_STORAGE_ERROR = "Public booking ticket storage unavailable"
public_booking_verification_bearer = HTTPBearer()


def _store_public_booking_ticket(payload: dict) -> str:
    return store_pending_ticket(
        purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
        payload={"pending_booking": payload},
        ttl_seconds=PUBLIC_BOOKING_TICKET_TTL_SECONDS,
        unavailable_detail=PUBLIC_BOOKING_STORAGE_ERROR,
    )


def _get_public_booking_ticket(ticket: str) -> Optional[dict]:
    return get_pending_ticket(
        ticket,
        purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
        unavailable_detail=PUBLIC_BOOKING_STORAGE_ERROR,
    )


def _save_public_booking_ticket(ticket: str, data: dict) -> None:
    save_pending_ticket(
        ticket,
        data,
        purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
        unavailable_detail=PUBLIC_BOOKING_STORAGE_ERROR,
    )


def _delete_public_booking_ticket(ticket: str) -> None:
    delete_pending_ticket(
        ticket,
        purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
        unavailable_detail=PUBLIC_BOOKING_STORAGE_ERROR,
    )


def _claim_public_booking_ticket(ticket: str) -> Optional[dict]:
    return claim_pending_ticket(
        ticket,
        purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
        unavailable_detail=PUBLIC_BOOKING_STORAGE_ERROR,
    )


def _public_booking_pending_response(ticket: str, phone: str) -> dict:
    return {
        "status": "phone_verification_required",
        "verification_kind": "public_booking",
        "verification_token": ticket,
        "phone": phone,
        "expires_in": PUBLIC_BOOKING_TICKET_TTL_SECONDS,
    }


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
    """Validate a public booking and persist only opaque, expiring server-side state."""
    phone = _validate_public_booking_phone(client_phone, db)
    _validate_specific_public_booking(booking, db, conflict_status=400)
    ticket = _store_public_booking_ticket({
        "flow": "specific",
        "phone": phone,
        "booking": booking.model_dump(mode="json"),
    })
    return _public_booking_pending_response(ticket, phone)


def _validate_public_booking_phone(client_phone: str, db: Session) -> str:
    phone = normalize_to_canonical(client_phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")
    user = db.query(User).filter(User.phone == phone).first()
    if user and (
        str(getattr(user.role, "value", user.role)) != "client"
        or not user.is_active
        or user.deleted_at is not None
    ):
        raise HTTPException(
            status_code=400,
            detail="Запись не удалась, войдите под аккаунтом клиента",
        )
    return phone


def _validate_specific_public_booking(
    booking: BookingCreate, db: Session, *, conflict_status: int
) -> tuple[Optional[int], Optional[int]]:
    from models import IndieMaster
    from services.scheduling import check_master_working_hours
    from utils.master_canon import LEGACY_INDIE_MODE

    effective_master_id = booking.master_id
    effective_indie_id = booking.indie_master_id
    if effective_indie_id:
        if not LEGACY_INDIE_MODE:
            raise HTTPException(400, "Use master_id. Indie-masters merged into masters.")
        indie = db.query(IndieMaster).filter(IndieMaster.id == effective_indie_id).first()
        if not indie or indie.master_id is None:
            raise HTTPException(400, "Use master_id. Indie-masters merged into masters.")
        effective_master_id, effective_indie_id = indie.master_id, None

    service = db.query(Service).filter(Service.id == booking.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    if booking.end_time <= booking.start_time:
        raise HTTPException(400, "Время окончания должно быть больше времени начала")
    duration_minutes = (booking.end_time - booking.start_time).total_seconds() / 60
    if service.duration and abs(duration_minutes - service.duration) > 1:
        raise HTTPException(400, "Продолжительность услуги не соответствует времени записи")

    if effective_master_id:
        master_query = db.query(Master).filter(Master.id == effective_master_id)
        if conflict_status == status.HTTP_409_CONFLICT:
            master_query = master_query.with_for_update()
        master = master_query.first()
        if not master:
            raise HTTPException(status_code=404, detail="Master not found")
        if not getattr(master, "timezone", None) or not str(master.timezone).strip():
            raise HTTPException(400, "Мастер не настроил часовой пояс. Запись невозможна.")
        if not check_master_working_hours(
            db,
            effective_master_id,
            booking.start_time,
            booking.end_time,
            is_salon_work=booking.salon_id is not None,
            salon_id=booking.salon_id,
        ):
            raise HTTPException(400, "Мастер не работает в указанное время")
        owner_type, owner_id = OwnerType.MASTER, effective_master_id
    elif effective_indie_id:
        if not check_master_working_hours(
            db, effective_indie_id, booking.start_time, booking.end_time
        ):
            raise HTTPException(400, "Мастер не работает в указанное время")
        owner_type, owner_id = OwnerType.INDIE_MASTER, effective_indie_id
    elif booking.salon_id:
        owner_type, owner_id = OwnerType.SALON, booking.salon_id
    else:
        raise HTTPException(400, "Не указан мастер, индивидуальный мастер или салон")

    if check_booking_conflicts(
        db, booking.start_time, booking.end_time, owner_type, owner_id
    ):
        raise HTTPException(conflict_status, "Выбранное время уже занято")
    return effective_master_id, effective_indie_id


def _resolve_or_create_verified_public_client(
    phone: str, client_name: Optional[str], db: Session
) -> tuple[User, bool]:
    client = db.query(User).filter(User.phone == phone).with_for_update().first()
    if client:
        if (
            str(getattr(client.role, "value", client.role)) != "client"
            or not client.is_active
            or client.deleted_at is not None
        ):
            raise HTTPException(409, "Номер уже принадлежит другому типу аккаунта")
        client.is_phone_verified = True
        return client, False
    client = User(
        phone=phone,
        email=f"{phone}@temp.com",
        role="client",
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
        full_name=(client_name or "").strip() or f"Клиент {phone}",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(client)
    db.flush()
    return client, True


def _create_specific_public_booking_after_proof(
    pending: dict, db: Session
) -> tuple[Booking, User, bool, Optional[dict]]:
    from utils.booking_factory import BookingOwnerError, normalize_booking_fields

    booking = BookingCreate(**pending["booking"])
    effective_master_id, effective_indie_id = _validate_specific_public_booking(
        booking, db, conflict_status=409
    )
    client, is_new_client = _resolve_or_create_verified_public_client(
        pending["phone"], booking.client_name, db
    )
    service = db.query(Service).filter(Service.id == booking.service_id).first()
    initial_status = BookingStatus.CREATED
    master = (
        db.query(Master).filter(Master.id == effective_master_id).first()
        if effective_master_id
        else None
    )
    if master and master.auto_confirm_bookings:
        initial_status = BookingStatus.COMPLETED

    discounted_amount, discount_data = evaluate_and_prepare_applied_discount(
        master_id=effective_master_id,
        client_id=client.id,
        client_phone=client.phone,
        booking_start=booking.start_time,
        service_id=booking.service_id,
        db=db,
    )
    data = booking.model_dump()
    for key in (
        "client_name", "service_name", "service_duration", "service_price",
        "use_loyalty_points", "salon_id", "branch_id",
    ):
        data.pop(key, None)
    data.update({
        "client_id": client.id,
        "loyalty_points_used": 0,
        "status": initial_status.value,
        "payment_amount": discounted_amount if discounted_amount is not None else (service.price or 0),
    })
    if effective_indie_id:
        owner_type, owner_id = "indie", effective_indie_id
    else:
        owner_type = "master" if service.salon_id is None else "salon"
        owner_id = effective_master_id or booking.salon_id
    try:
        data = normalize_booking_fields(data, service, owner_type, owner_id, db=db)
    except BookingOwnerError as exc:
        raise HTTPException(400, str(exc)) from exc
    created = Booking(**data)
    db.add(created)
    db.flush()
    applied = None
    if discount_data:
        applied = AppliedDiscount(
            booking_id=created.id,
            discount_id=discount_data["rule_id"] if discount_data["rule_type"] != "personal" else None,
            personal_discount_id=discount_data["rule_id"] if discount_data["rule_type"] == "personal" else None,
            discount_percent=discount_data["discount_percent"],
            discount_amount=discount_data["discount_amount"],
        )
        db.add(applied)
    return created, client, is_new_client, applied


@router.post("/public/verification/request", response_model=PhoneVerificationResponse)
async def request_public_booking_phone_verification(
    creds: HTTPAuthorizationCredentials = Depends(public_booking_verification_bearer),
):
    ticket = creds.credentials
    state = _get_public_booking_ticket(ticket)
    if not state:
        raise HTTPException(401, "Invalid or expired public booking ticket")
    phone = str(state.get("pending_booking", {}).get("phone") or "")
    call_result = zvonok_service.send_verification_call(phone)
    if not call_result.get("success"):
        return PhoneVerificationResponse(
            message=call_result.get("error") or "Ошибка инициации звонка",
            success=False,
        )
    try:
        challenge = VerificationService.create_phone_challenge_state(
            purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
            target_phone=phone,
            call_result=call_result,
        )
    except PhoneChallengeError as exc:
        raise HTTPException(502, exc.detail) from exc
    state.update(challenge)
    _save_public_booking_ticket(ticket, state)
    return PhoneVerificationResponse(
        message="Звонок инициирован. Введите последние 4 цифры входящего номера.",
        success=True,
        call_id=challenge["phone_verification_call_id"],
        verification_number=(
            str(call_result.get("pincode") or call_result.get("verification_number") or "")
            if get_settings().zvonok_stub
            else None
        ),
    )


@router.post("/public/verification/confirm")
async def confirm_public_booking_phone_verification(
    request: ConfirmSignupPhoneVerificationRequest,
    creds: HTTPAuthorizationCredentials = Depends(public_booking_verification_bearer),
    db: Session = Depends(get_db),
):
    ticket = creds.credentials
    state = _get_public_booking_ticket(ticket)
    if not state:
        raise HTTPException(401, "Invalid or expired public booking ticket")
    pending = state.get("pending_booking") or {}
    phone = str(pending.get("phone") or "")
    try:
        VerificationService.consume_phone_challenge_state(
            state,
            purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
            target_phone=phone,
            call_id=request.call_id,
            phone_digits=request.phone_digits,
        )
    except PhoneChallengeError as exc:
        _save_public_booking_ticket(ticket, state)
        raise HTTPException(400, exc.detail) from exc

    claimed = _claim_public_booking_ticket(ticket)
    if not claimed:
        raise HTTPException(409, "Верификация уже завершена")
    claimed_pending = claimed.get("pending_booking") or {}
    try:
        VerificationService.consume_phone_challenge_state(
            claimed,
            purpose=PUBLIC_BOOKING_TICKET_PURPOSE,
            target_phone=str(claimed_pending.get("phone") or ""),
            call_id=request.call_id,
            phone_digits=request.phone_digits,
        )
        if claimed_pending.get("flow") == "specific":
            booking, client, is_new_client, applied = _create_specific_public_booking_after_proof(
                claimed_pending, db
            )
            master_name = None
        elif claimed_pending.get("flow") == "any_master":
            booking, client, is_new_client, master_name = _create_any_master_public_booking_after_proof(
                claimed_pending, db
            )
            applied = None
        else:
            raise HTTPException(400, "Unknown public booking flow")
        db.commit()
        db.refresh(booking)
        if applied:
            booking.applied_discount = build_applied_discount_info(applied)
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Phone or booking conflict") from exc
    except Exception:
        db.rollback()
        raise

    from auth import create_user_access_token

    result = {
        "success": True,
        "booking": booking,
        "booking_id": booking.id,
        "access_token": create_user_access_token(client),
        "is_new_client": is_new_client,
        "needs_password_setup": not bool(client.hashed_password),
        "needs_password_verification": bool(client.hashed_password),
        "needs_phone_verification": False,
        "client": {
            "id": client.id,
            "phone": client.phone,
            "full_name": client.full_name,
            "role": getattr(client.role, "value", client.role),
            "is_phone_verified": client.is_phone_verified,
        },
    }
    if master_name:
        result.update({
            "master_id": booking.master_id,
            "master_name": master_name,
            "message": f"Запись создана с мастером {master_name}",
        })
    return result


@router.post("/public/verification/cancel", status_code=204)
async def cancel_public_booking_phone_verification(
    creds: HTTPAuthorizationCredentials = Depends(public_booking_verification_bearer),
):
    if _get_public_booking_ticket(creds.credentials):
        _delete_public_booking_ticket(creds.credentials)
    return None


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
):
    """Deprecated unsafe phone-only lookup; public booking uses a bound ticket."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Используйте purpose-bound public booking verification",
    )


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
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Validate any-master selection and persist no permanent rows before proof."""
    if current_user and (
        str(getattr(current_user.role, "value", current_user.role)) != "client"
        or not current_user.is_active
        or current_user.deleted_at is not None
        or not current_user.is_phone_verified
    ):
        raise HTTPException(403, "Требуется подтверждённый аккаунт клиента")
    if not current_user and not client_phone:
        raise HTTPException(400, "Номер телефона обязателен")
    if end_time <= start_time:
        raise HTTPException(400, "Время окончания должно быть больше времени начала")
    phone = (
        current_user.phone
        if current_user
        else _validate_public_booking_phone(client_phone, db)
    )
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(404, "Service not found")
    if service.salon_id != salon_id:
        raise HTTPException(400, "Service does not belong to the selected salon")
    duration_minutes = (end_time - start_time).total_seconds() / 60
    if service.duration and abs(duration_minutes - service.duration) > 1:
        raise HTTPException(400, "Продолжительность услуги не соответствует времени записи")
    best_master = get_best_master_for_slot(
        db, salon_id, service_id, start_time, end_time, branch_id
    )
    if not best_master:
        raise HTTPException(400, "Нет доступных мастеров для выбранного времени")
    if check_booking_conflicts(
        db, start_time, end_time, OwnerType.MASTER, best_master["id"]
    ):
        raise HTTPException(400, "Выбранное время уже занято")
    pending = {
        "flow": "any_master",
        "phone": phone,
        "salon_id": salon_id,
        "service_id": service_id,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "branch_id": branch_id,
        "notes": notes,
    }
    if current_user:
        try:
            booking, _, _, master_name = _create_any_master_public_booking_after_proof(
                pending, db
            )
            db.commit()
            db.refresh(booking)
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise
        return {
            "success": True,
            "booking_id": booking.id,
            "master_id": booking.master_id,
            "master_name": master_name,
            "message": f"Запись создана с мастером {master_name}",
        }
    ticket = _store_public_booking_ticket(pending)
    return _public_booking_pending_response(ticket, phone)


def _create_any_master_public_booking_after_proof(
    pending: dict, db: Session
) -> tuple[Booking, User, bool, str]:
    from utils.booking_factory import BookingOwnerError, normalize_booking_fields

    start_time = datetime.fromisoformat(pending["start_time"])
    end_time = datetime.fromisoformat(pending["end_time"])
    service = db.query(Service).filter(Service.id == pending["service_id"]).first()
    if not service:
        raise HTTPException(404, "Service not found")
    if service.salon_id != pending["salon_id"]:
        raise HTTPException(409, "Service no longer belongs to the selected salon")
    best_master = get_best_master_for_slot(
        db,
        pending["salon_id"],
        pending["service_id"],
        start_time,
        end_time,
        pending.get("branch_id"),
    )
    if not best_master or check_booking_conflicts(
        db, start_time, end_time, OwnerType.MASTER,
        best_master["id"] if best_master else 0,
    ):
        raise HTTPException(409, "Выбранное время уже занято")
    locked_master = (
        db.query(Master)
        .filter(Master.id == best_master["id"])
        .with_for_update()
        .first()
    )
    if not locked_master or check_booking_conflicts(
        db, start_time, end_time, OwnerType.MASTER, best_master["id"]
    ):
        raise HTTPException(409, "Выбранное время уже занято")
    client, is_new_client = _resolve_or_create_verified_public_client(
        pending["phone"], None, db
    )
    data = {
        "service_id": service.id,
        "master_id": best_master["id"],
        "start_time": start_time,
        "end_time": end_time,
        "notes": pending.get("notes"),
        "status": BookingStatus.CREATED.value,
        "payment_amount": service.price or 0,
        "client_id": client.id,
    }
    try:
        data = normalize_booking_fields(
            data, service, "salon", best_master["id"], db=db
        )
    except BookingOwnerError as exc:
        raise HTTPException(400, str(exc)) from exc
    created = Booking(**data, created_at=datetime.utcnow())
    db.add(created)
    db.flush()
    return created, client, is_new_client, best_master["name"]

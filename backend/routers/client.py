from datetime import datetime, timezone
from typing import Any, List, Optional
import pytz

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_

from auth import get_current_active_user, require_client
from database import get_db
from models import (
    User, Salon, Master, IndieMaster, Service, SalonBranch, Booking, 
    BookingStatus, ClientNote, ClientMasterNote, ClientSalonNote, UserRole
)
from schemas import (
    BookingFutureShort, BookingShort, Booking as BookingSchema, BookingPastShort,
    BookingCreate, BookingUpdate, ClientMasterNoteCreate, ClientMasterNoteUpdate, ClientMasterNoteOut,
    ClientSalonNoteCreate, ClientSalonNoteUpdate, ClientSalonNoteOut,
    ClientNoteCreate, ClientNoteUpdate, ClientNoteResponse
)
from services.scheduling import get_available_slots

router = APIRouter(
    prefix="/client/bookings",
    tags=["client_bookings"],
    dependencies=[Depends(require_client)],
)

profile_router = APIRouter(
    prefix="/client",
    tags=["client"],
    dependencies=[Depends(require_client)],
)


def get_master_timezone(booking: Booking) -> str:
    """
    Получает часовой пояс мастера или салона для записи
    """
    if booking.indie_master:
        return getattr(booking.indie_master, 'timezone', 'Europe/Moscow')
    elif booking.master:
        return getattr(booking.master, 'timezone', 'Europe/Moscow')
    elif booking.salon:
        return getattr(booking.salon, 'timezone', 'Europe/Moscow')
    else:
        return 'Europe/Moscow'


def get_current_time_in_timezone(timezone_str: str) -> datetime:
    """
    Получает текущее время в указанном часовом поясе
    """
    tz = pytz.timezone(timezone_str)
    return datetime.now(tz)


@router.get("/", response_model=List[BookingFutureShort])
def get_future_bookings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user), client_id: int = None
) -> Any:
    """
    Получение списка будущих бронирований клиента.
    Можно явно передать client_id (например, для админских целей), иначе используется текущий пользователь.
    """
    _client_id = client_id if client_id is not None else current_user.id
    print(f"🔍 ОТЛАДКА get_future_bookings: client_id={_client_id}, current_user.id={current_user.id}")
    
    bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.salon),
            joinedload(Booking.master).joinedload(Master.user),
            joinedload(Booking.indie_master).joinedload(IndieMaster.user),
            joinedload(Booking.service),
            joinedload(Booking.branch)
        )
        .filter(
            Booking.client_id == _client_id,
            Booking.status != BookingStatus.CANCELLED,
        )
        .order_by(Booking.start_time.asc())
        .limit(5)
        .all()
    )
    
    print(f"🔍 ОТЛАДКА: Найдено {len(bookings)} записей в базе")
    
    result = []
    for b in bookings:
        print(f"🔍 ОТЛАДКА: Обрабатываем запись {b.id}: start_time={b.start_time}, status={b.status}")
        
        # Получаем часовой пояс для этой записи
        master_timezone = get_master_timezone(b)
        current_time_in_master_tz = get_current_time_in_timezone(master_timezone)
        
        print(f"🔍 ОТЛАДКА: Мастер timezone={master_timezone}, текущее время в timezone={current_time_in_master_tz}")
        
        # Приводим start_time к часовому поясу мастера для корректного сравнения
        if b.start_time and b.start_time.tzinfo is None:
            # Если start_time не имеет часового пояса, считаем что это UTC
            start_time_in_master_tz = pytz.UTC.localize(b.start_time).astimezone(pytz.timezone(master_timezone))
        else:
            start_time_in_master_tz = b.start_time.astimezone(pytz.timezone(master_timezone))
        
        print(f"🔍 ОТЛАДКА: start_time в timezone мастера={start_time_in_master_tz}")
        
        # Проверяем, является ли запись будущей в часовом поясе мастера
        if start_time_in_master_tz <= current_time_in_master_tz:
            print(f"🔍 ОТЛАДКА: Запись {b.id} ПРОПУЩЕНА (уже прошла)")
            continue  # Пропускаем записи, которые уже прошли в часовом поясе мастера
        
        print(f"🔍 ОТЛАДКА: Запись {b.id} ДОБАВЛЕНА (будущая)")
        
        salon_name = b.salon.name if b.salon else "-"
        master_name = "-"
        if b.master and b.master.user:
            master_name = b.master.user.full_name
        elif b.indie_master and b.indie_master.user:
            master_name = b.indie_master.user.full_name
        service_name = b.service.name if b.service else "-"
        price = b.service.price if b.service else 0
        duration = b.service.duration if b.service else 0
        date = b.start_time
        # Информация о филиале
        branch_name = b.branch.name if b.branch else None
        branch_address = b.branch.address if b.branch else None
        
        result.append(BookingFutureShort(
            id=b.id,
            salon_name=salon_name,
            master_name=master_name,
            service_name=service_name,
            price=price,
            duration=duration,
            date=date,
            start_time=b.start_time,
            end_time=b.end_time,
            status=b.status.value,
            branch_name=branch_name,
            branch_address=branch_address,
            # Добавляем недостающие поля
            master_id=b.master_id,
            indie_master_id=b.indie_master_id,
            service_id=b.service_id,
            salon_id=b.salon_id,
            branch_id=b.branch_id
        ))
    
    print(f"🔍 ОТЛАДКА: Возвращаем {len(result)} будущих записей")
    return result


@router.get("/past", response_model=List[BookingPastShort])
def get_past_bookings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user), client_id: int = None
) -> Any:
    """
    Получение списка прошедших бронирований клиента.
    Можно явно передать client_id (например, для админских целей), иначе используется текущий пользователь.
    """
    _client_id = client_id if client_id is not None else current_user.id
    print(f"🔍 ОТЛАДКА get_past_bookings: client_id={_client_id}, current_user.id={current_user.id}")
    
    bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.salon),
            joinedload(Booking.master).joinedload(Master.user),
            joinedload(Booking.indie_master).joinedload(IndieMaster.user),
            joinedload(Booking.service),
            joinedload(Booking.branch)
        )
        .filter(
            Booking.client_id == _client_id,
            Booking.status != BookingStatus.CANCELLED,
        )
        .order_by(Booking.start_time.desc())
        .limit(5)
        .all()
    )
    
    print(f"🔍 ОТЛАДКА get_past_bookings: Найдено {len(bookings)} записей в базе")
    
    result = []
    for b in bookings:
        print(f"🔍 ОТЛАДКА get_past_bookings: Обрабатываем запись {b.id}: start_time={b.start_time}, status={b.status}")
        
        # Получаем часовой пояс для этой записи
        master_timezone = get_master_timezone(b)
        current_time_in_master_tz = get_current_time_in_timezone(master_timezone)
        
        print(f"🔍 ОТЛАДКА get_past_bookings: Мастер timezone={master_timezone}, текущее время в timezone={current_time_in_master_tz}")
        
        # Приводим start_time к часовому поясу мастера для корректного сравнения
        if b.start_time and b.start_time.tzinfo is None:
            # Если start_time не имеет часового пояса, считаем что это UTC
            start_time_in_master_tz = pytz.UTC.localize(b.start_time).astimezone(pytz.timezone(master_timezone))
        else:
            start_time_in_master_tz = b.start_time.astimezone(pytz.timezone(master_timezone))
        
        print(f"🔍 ОТЛАДКА get_past_bookings: start_time в timezone мастера={start_time_in_master_tz}")
        
        # Проверяем, является ли запись прошедшей в часовом поясе мастера
        if start_time_in_master_tz > current_time_in_master_tz:
            print(f"🔍 ОТЛАДКА get_past_bookings: Запись {b.id} ПРОПУЩЕНА (еще не прошла)")
            continue  # Пропускаем записи, которые еще не наступили в часовом поясе мастера
        
        print(f"🔍 ОТЛАДКА get_past_bookings: Запись {b.id} ДОБАВЛЕНА (прошедшая)")
        
        salon_name = b.salon.name if b.salon else "-"
        master_name = "-"
        if b.master and b.master.user:
            master_name = b.master.user.full_name
        elif b.indie_master and b.indie_master.user:
            master_name = b.indie_master.user.full_name
        service_name = b.service.name if b.service else "-"
        price = b.service.price if b.service else 0
        duration = b.service.duration if b.service else 0
        date = b.start_time
        # Информация о филиале
        branch_name = b.branch.name if b.branch else None
        branch_address = b.branch.address if b.branch else None
        
        result.append(BookingPastShort(
            id=b.id,
            salon_name=salon_name,
            master_name=master_name,
            service_name=service_name,
            price=price,
            duration=duration,
            date=date,
            start_time=b.start_time,
            end_time=b.end_time,
            status=b.status.value,
            branch_name=branch_name,
            branch_address=branch_address,
            # Добавляем недостающие поля
            master_id=b.master_id,
            indie_master_id=b.indie_master_id,
            service_id=b.service_id,
            salon_id=b.salon_id,
            branch_id=b.branch_id
        ))
    
    print(f"🔍 ОТЛАДКА get_past_bookings: Возвращаем {len(result)} прошедших записей")
    return result


@router.get("/{booking_id}/available-slots")
def get_available_slots_for_booking(
    booking_id: int,
    date: str,  # Формат: YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение доступных слотов для изменения времени записи.
    """
    try:
        # Получаем запись
        booking = (
            db.query(Booking)
            .filter(Booking.id == booking_id, Booking.client_id == current_user.id)
            .first()
        )
        
        if not booking:
            raise HTTPException(status_code=404, detail="Запись не найдена")
        
        if not booking.service:
            raise HTTPException(status_code=400, detail="У записи нет услуги")
        
        # Парсим дату
        try:
            target_date = datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты. Используйте YYYY-MM-DD")
        
        # Определяем тип владельца и его ID
        owner_type = None
        owner_id = None
        branch_id = None
        
        if booking.master:
            owner_type = OwnerType.MASTER
            owner_id = booking.master.id
            branch_id = booking.branch_id if booking.branch else None
        elif booking.indie_master:
            owner_type = OwnerType.INDIE_MASTER
            owner_id = booking.indie_master.id
        elif booking.salon:
            owner_type = OwnerType.SALON
            owner_id = booking.salon.id
            branch_id = booking.branch_id if booking.branch else None
        else:
            raise HTTPException(status_code=400, detail="Не удалось определить владельца услуги")
        
        # Получаем доступные слоты
        available_slots = get_available_slots(
            db=db,
            owner_type=owner_type,
            owner_id=owner_id,
            date=target_date,
            service_duration=booking.service.duration,
            branch_id=branch_id
        )
        
        # Фильтруем слоты, исключая текущее время записи
        filtered_slots = []
        for slot in available_slots:
            slot_start = slot['start_time']
            # Проверяем, что slot_start это datetime объект
            if isinstance(slot_start, datetime):
                # Исключаем слот, который совпадает с текущим временем записи
                if abs((slot_start - booking.start_time).total_seconds()) > 300:  # 5 минут разницы
                    filtered_slots.append({
                        'start_time': slot_start.isoformat(),
                        'end_time': slot['end_time'].isoformat(),
                        'formatted_time': slot_start.strftime('%H:%M')
                    })
            else:
                # Если slot_start уже строка, конвертируем её в datetime для сравнения
                try:
                    slot_start_dt = datetime.fromisoformat(slot_start.replace('Z', '+00:00'))
                    if abs((slot_start_dt - booking.start_time).total_seconds()) > 300:  # 5 минут разницы
                        filtered_slots.append({
                            'start_time': slot_start,
                            'end_time': slot['end_time'],
                            'formatted_time': slot_start_dt.strftime('%H:%M')
                        })
                except:
                    # Если не удается распарсить, пропускаем слот
                    continue
        
        return {
            'booking_id': booking_id,
            'service_name': booking.service.name,
            'service_duration': booking.service.duration,
            'current_start_time': booking.start_time.isoformat(),
            'available_slots': filtered_slots
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении доступных слотов: {str(e)}"
        )


@router.post("/", response_model=BookingSchema)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание нового бронирования.
    """
    # Проверка доступности времени
    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.start_time == booking_in.start_time,
            Booking.status != BookingStatus.CANCELLED,
            (
                (Booking.master_id == booking_in.master_id)
                | (Booking.indie_master_id == booking_in.indie_master_id)
                | (Booking.salon_id == booking_in.salon_id)
            ),
        )
        .first()
    )

    if existing_booking:
        raise HTTPException(status_code=400, detail="This time slot is already booked")

    booking = Booking(**booking_in.dict(), client_id=current_user.id)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.put("/{booking_id}", response_model=BookingSchema)
def update_booking(
    booking_id: int,
    booking_in: BookingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление существующего бронирования.
    """
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.client_id == current_user.id)
        .first()
    )

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot update cancelled booking")

    # Проверяем доступность нового времени
    if hasattr(booking_in, 'start_time') and booking_in.start_time:
        # Исключаем текущую запись из проверки
        existing_booking = (
            db.query(Booking)
            .filter(
                Booking.start_time == booking_in.start_time,
                Booking.status != BookingStatus.CANCELLED,
                Booking.id != booking_id,
                (
                    (Booking.master_id == booking.master_id)
                    | (Booking.indie_master_id == booking.indie_master_id)
                    | (Booking.salon_id == booking.salon_id)
                ),
            )
            .first()
        )

        if existing_booking:
            raise HTTPException(status_code=400, detail="This time slot is already booked")

    for field, value in booking_in.dict(exclude_unset=True).items():
        setattr(booking, field, value)

    db.commit()
    db.refresh(booking)
    return booking


@router.delete("/{booking_id}", response_model=BookingSchema)
def cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Отмена бронирования.
    """
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.client_id == current_user.id)
        .first()
    )

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    booking.status = BookingStatus.CANCELLED
    db.commit()
    db.refresh(booking)
    return booking


# @profile_router.get("/favorites")
# def get_favorites(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
#     """
#     Получение избранного клиента.
#     """
#     try:
#         fav = db.query(ClientFavorite).filter(ClientFavorite.client_id == current_user.id).first()
#         if not fav:
#             return []
#         return fav.favorites
#     except Exception as e:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Ошибка при получении избранного: {str(e)}"
#         )


# @profile_router.post("/favorites", response_model=FavoriteResponse)
# def add_favorite(
#     favorite_data: ClientFavoriteCreate,
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Добавление услуги в избранное.
#     """
#     try:
#         # Проверяем, существует ли уже избранное для этой услуги
#         existing_favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.client_id == current_user.id,
#                 ClientFavorite.service_id == favorite_data.service_id
#             )
#             .first()
#         )
#         
#         if existing_favorite:
#             raise HTTPException(status_code=400, detail="Service already in favorites")
#         
#         new_favorite = ClientFavorite(
#             client_id=current_user.id,
#             service_id=favorite_data.service_id
#         )
#         
#         db.add(new_favorite)
#         db.commit()
#         db.refresh(new_favorite)
#         
#         return FavoriteResponse(
#             id=new_favorite.id,
#             client_id=new_favorite.client_id,
#             service_id=new_favorite.service_id,
#             created_at=new_favorite.created_at
#         )
#         
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Ошибка при добавлении в избранное: {str(e)}"
#         )


# @profile_router.delete("/favorites/{favorite_id}", response_model=FavoriteResponse)
# def delete_favorite(
#     favorite_id: int,
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
#     -> Any:
#     """
#     Удаление услуги из избранного.
#     """
#     try:
#         favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.id == favorite_id,
#                 ClientFavorite.client_id == current_user.id
#             )
#             .first()
#         )
#         
#         if not favorite:
#             raise HTTPException(status_code=404, detail="Favorite not found")
#         
#         db.delete(favorite)
#         db.commit()
#         
#         return FavoriteResponse(
#             id=favorite.id,
#             client_id=favorite.client_id,
#             service_id=favorite.service_id,
#             created_at=favorite.created_at
#         )
#         
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Ошибка при удалении из избранного: {str(e)}"
#         )


# Эндпоинты для профиля клиента
@profile_router.get("/profile")
def get_client_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение профиля клиента
    """
    try:
        # Получаем данные клиента
        client = db.query(User).filter(User.id == current_user.id).first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Клиент не найден")
        
        return {
            "id": client.id,
            "name": client.full_name,
            "email": client.email,
            "phone": client.phone,
            "birth_date": client.birth_date,
            "created_at": client.created_at
        }
    except Exception as e:
        print(f"Ошибка при получении профиля клиента: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@profile_router.put("/profile")
def update_client_profile(
    profile_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Обновление профиля клиента
    """
    try:
        # Получаем клиента
        client = db.query(User).filter(User.id == current_user.id).first()
        
        if not client:
            raise HTTPException(status_code=404, detail="Клиент не найден")
        
        # Обновляем разрешенные поля
        if "email" in profile_data:
            # Проверяем, что email уникален
            existing_user = db.query(User).filter(
                User.email == profile_data["email"],
                User.id != current_user.id
            ).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="Email уже используется")
            client.email = profile_data["email"]
        
        if "phone" in profile_data:
            # Проверяем, что телефон уникален
            existing_user = db.query(User).filter(
                User.phone == profile_data["phone"],
                User.id != current_user.id
            ).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="Телефон уже используется")
            client.phone = profile_data["phone"]
        
        db.commit()
        
        return {"message": "Профиль успешно обновлен"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка при обновлении профиля клиента: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@profile_router.put("/change-password")
def change_client_password(
    password_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Смена пароля клиента
    """
    try:
        from auth import verify_password, get_password_hash
        
        current_password = password_data.get("current_password")
        new_password = password_data.get("new_password")
        
        if not current_password or not new_password:
            raise HTTPException(status_code=400, detail="Необходимо указать текущий и новый пароль")
        
        # Проверяем текущий пароль
        if not verify_password(current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        
        # Хешируем новый пароль
        hashed_new_password = get_password_hash(new_password)
        current_user.hashed_password = hashed_new_password
        
        db.commit()
        
        return {"message": "Пароль успешно изменен"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка при смене пароля клиента: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@profile_router.delete("/account")
def delete_client_account(
    password_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Удаление аккаунта клиента
    """
    try:
        from auth import verify_password
        
        password = password_data.get("password")
        
        if not password:
            raise HTTPException(status_code=400, detail="Необходимо указать пароль")
        
        # Проверяем пароль
        if not verify_password(password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Неверный пароль")
        
        # Удаляем все записи клиента
        db.query(Booking).filter(Booking.client_id == current_user.id).delete()
        
        # Удаляем пользователя
        db.delete(current_user)
        db.commit()
        
        return {"message": "Аккаунт успешно удален"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка при удалении аккаунта клиента: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


# API для заметок клиентов к мастерам
@profile_router.get("/master-notes", response_model=List[ClientMasterNoteOut])
def get_client_master_notes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Получение всех заметок клиента к мастерам.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    notes = (
        db.query(ClientMasterNote)
        .options(
            joinedload(ClientMasterNote.master).joinedload(Master.user),
            joinedload(ClientMasterNote.salon)
        )
        .filter(ClientMasterNote.client_id == current_user.id)
        .order_by(ClientMasterNote.updated_at.desc())
        .all()
    )
    
    result = []
    for note in notes:
        result.append(ClientMasterNoteOut(
            id=note.id,
            master_id=note.master_id,
            salon_id=note.salon_id,
            note=note.note,
            created_at=note.created_at,
            updated_at=note.updated_at,
            master_name=note.master.user.full_name if note.master and note.master.user else None,
            salon_name=note.salon.name if note.salon else None
        ))
    
    return result


@profile_router.get("/master-notes/{master_id}", response_model=ClientMasterNoteOut)
def get_client_master_note(
    master_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Получение заметки клиента к конкретному мастеру.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    note = (
        db.query(ClientMasterNote)
        .options(
            joinedload(ClientMasterNote.master).joinedload(Master.user),
            joinedload(ClientMasterNote.salon)
        )
        .filter(
            ClientMasterNote.client_id == current_user.id,
            ClientMasterNote.master_id == master_id
        )
        .first()
    )
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заметка не найдена"
        )
    
    return ClientMasterNoteOut(
        id=note.id,
        master_id=note.master_id,
        salon_id=note.salon_id,
        note=note.note,
        created_at=note.created_at,
        updated_at=note.updated_at,
        master_name=note.master.user.full_name if note.master and note.master.user else None,
        salon_name=note.salon.name if note.salon else None
    )


@profile_router.post("/master-notes", response_model=ClientMasterNoteOut)
def create_client_master_note(
    note_data: ClientMasterNoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Создание или обновление заметки клиента к мастеру.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        # Проверяем, существует ли уже заметка для этого мастера
        existing_note = (
            db.query(ClientMasterNote)
            .filter(
                ClientMasterNote.client_id == current_user.id,
                ClientMasterNote.master_id == note_data.master_id,
                ClientMasterNote.salon_id == note_data.salon_id
            )
            .first()
        )
        
        if existing_note:
            # Обновляем существующую заметку
            existing_note.note = note_data.note
            existing_note.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing_note)
            
            # Возвращаем обновленную заметку с дополнительной информацией
            note = (
                db.query(ClientMasterNote)
                .options(
                    joinedload(ClientMasterNote.master).joinedload(Master.user),
                    joinedload(ClientMasterNote.salon)
                )
                .filter(ClientMasterNote.id == existing_note.id)
                .first()
            )
            
            return ClientMasterNoteOut(
                id=note.id,
                master_id=note.master_id,
                salon_id=note.salon_id,
                note=note.note,
                created_at=note.created_at,
                updated_at=note.updated_at,
                master_name=note.master.user.full_name if note.master and note.master.user else None,
                salon_name=note.salon.name if note.salon else None
            )
        else:
            # Создаем новую заметку
            new_note = ClientMasterNote(
                client_id=current_user.id,
                master_id=note_data.master_id,
                salon_id=note_data.salon_id,
                note=note_data.note
            )
            
            db.add(new_note)
            db.commit()
            db.refresh(new_note)
            
            # Возвращаем новую заметку с дополнительной информацией
            note = (
                db.query(ClientMasterNote)
                .options(
                    joinedload(ClientMasterNote.master).joinedload(Master.user),
                    joinedload(ClientMasterNote.salon)
                )
                .filter(ClientMasterNote.id == new_note.id)
                .first()
            )
            
            return ClientMasterNoteOut(
                id=note.id,
                master_id=note.master_id,
                salon_id=note.salon_id,
                note=note.note,
                created_at=note.created_at,
                updated_at=note.updated_at,
                master_name=note.master.user.full_name if note.master and note.master.user else None,
                salon_name=note.salon.name if note.salon else None
            )
            
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании заметки: {str(e)}"
        )


@profile_router.delete("/master-notes/{master_id}")
def delete_client_master_note(
    master_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Удаление заметки клиента к мастеру.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        note = (
            db.query(ClientMasterNote)
            .filter(
                ClientMasterNote.client_id == current_user.id,
                ClientMasterNote.master_id == master_id
            )
            .first()
        )
        
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заметка не найдена"
            )
        
        db.delete(note)
        db.commit()
        
        return {"message": "Заметка успешно удалена"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении заметки: {str(e)}"
        )


# Эндпоинт для клиентского дашборда
@profile_router.get("/dashboard/stats")
def get_client_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение статистики для клиентского дашборда.
    """
    try:
        print(f"🔍 ОТЛАДКА get_client_dashboard_stats: client_id={current_user.id}")
        
        # Прошедшие записи - записи, которые уже прошли по времени, независимо от статуса
        past_bookings = (
            db.query(Booking)
            .filter(
                Booking.client_id == current_user.id,
                Booking.status != BookingStatus.CANCELLED
            )
            .all()
        )
        
        print(f"🔍 ОТЛАДКА: Найдено {len(past_bookings)} записей в базе для подсчета")
        
        # Подсчитываем прошедшие записи с учетом timezone мастера
        past_bookings_count = 0
        for booking in past_bookings:
            master_timezone = get_master_timezone(booking)
            current_time_in_master_tz = get_current_time_in_timezone(master_timezone)
            
            # Приводим start_time к часовому поясу мастера для корректного сравнения
            if booking.start_time and booking.start_time.tzinfo is None:
                # Если start_time не имеет часового пояса, считаем что это UTC
                start_time_in_master_tz = pytz.UTC.localize(booking.start_time).astimezone(pytz.timezone(master_timezone))
            else:
                start_time_in_master_tz = booking.start_time.astimezone(pytz.timezone(master_timezone))
            
            print(f"🔍 ОТЛАДКА: Запись {booking.id}: start_time={booking.start_time}, timezone={master_timezone}, start_time_in_tz={start_time_in_master_tz}, current_time={current_time_in_master_tz}")
            
            # Проверяем, является ли запись прошедшей в часовом поясе мастера
            if start_time_in_master_tz <= current_time_in_master_tz:
                past_bookings_count += 1
                print(f"🔍 ОТЛАДКА: Запись {booking.id} ДОБАВЛЕНА к прошедшим")
            else:
                print(f"🔍 ОТЛАДКА: Запись {booking.id} НЕ добавлена (еще не прошла)")
        
        # Будущие записи - записи, которые еще не прошли по времени
        future_bookings_count = len(past_bookings) - past_bookings_count
        
        print(f"🔍 ОТЛАДКА: Итого: прошедших={past_bookings_count}, будущих={future_bookings_count}")
        
        # Топ салонов по частоте записи
        top_salons = (
            db.query(
                Booking.salon_id,
                func.count(Booking.id).label('booking_count')
            )
            .filter(
                Booking.client_id == current_user.id,
                Booking.salon_id.isnot(None)
            )
            .group_by(Booking.salon_id)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
            .all()
        )
        
        # Получаем названия салонов
        salon_names = {}
        for salon_id, _ in top_salons:
            salon = db.query(Salon).filter(Salon.id == salon_id).first()
            if salon:
                salon_names[salon_id] = salon.name
        
        top_salons_with_names = [
            {
                "salon_id": salon_id,
                "salon_name": salon_names.get(salon_id, "Неизвестный салон"),
                "booking_count": count
            }
            for salon_id, count in top_salons
        ]
        
        # Топ мастеров (только из салонов)
        top_masters = (
            db.query(
                Booking.master_id,
                func.count(Booking.id).label('booking_count')
            )
            .filter(
                Booking.client_id == current_user.id,
                Booking.master_id.isnot(None)
            )
            .group_by(Booking.master_id)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
            .all()
        )
        
        # Получаем имена мастеров
        master_names = {}
        for master_id, _ in top_masters:
            if master_id:
                master = db.query(Master).filter(Master.id == master_id).first()
                if master and master.user:
                    master_names[master_id] = master.user.full_name
        
        top_masters_with_names = [
            {
                "master_id": master_id,
                "master_name": master_names.get(master_id, "Неизвестный мастер"),
                "booking_count": count
            }
            for master_id, count in top_masters
        ]
        
        # Топ индивидуальных мастеров
        top_indie_masters = (
            db.query(
                Booking.indie_master_id,
                func.count(Booking.id).label('booking_count')
            )
            .filter(
                Booking.client_id == current_user.id,
                Booking.indie_master_id.isnot(None)
            )
            .group_by(Booking.indie_master_id)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
            .all()
        )
        
        # Получаем имена индивидуальных мастеров
        indie_master_names = {}
        for indie_master_id, _ in top_indie_masters:
            if indie_master_id:
                indie_master = db.query(IndieMaster).filter(IndieMaster.id == indie_master_id).first()
                if indie_master and indie_master.user:
                    indie_master_names[indie_master_id] = indie_master.user.full_name
        
        top_indie_masters_with_names = [
            {
                "indie_master_id": indie_master_id,
                "indie_master_name": indie_master_names.get(indie_master_id, "Неизвестный мастер"),
                "booking_count": count
            }
            for indie_master_id, count in top_indie_masters
        ]
        
        return {
            "past_bookings": past_bookings_count,
            "future_bookings": future_bookings_count,
            "top_salons": top_salons_with_names,
            "top_masters": top_masters_with_names,
            "top_indie_masters": top_indie_masters_with_names
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении статистики: {str(e)}"
        )


# Эндпоинты для работы с избранным
# @router.post("/favorites", response_model=FavoriteResponse)
# def add_to_favorites(
#     favorite_data: ClientFavoriteCreate,
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Добавление элемента в избранное.
#     """
#     try:
#         # Проверяем, существует ли уже избранное для этого элемента
#         existing_favorite = None
#         
#         if favorite_data.salon_id:
#             existing_favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'salon',
#                     ClientFavorite.salon_id == favorite_data.salon_id
#                 )
#                 .first()
#             )
#         elif favorite_data.master_id:
#             existing_favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'master',
#                     ClientFavorite.master_id == favorite_data.master_id
#                 )
#                 .first()
#             )
#         elif favorite_data.indie_master_id:
#             existing_favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'indie_master',
#                     ClientFavorite.indie_master_id == favorite_data.indie_master_id
#                 )
#                 .first()
#             )
#         elif favorite_data.service_id:
#             existing_favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'service',
#                     ClientFavorite.service_id == favorite_data.service_id
#                 )
#                 .first()
#             )
#         
#         if existing_favorite:
#             raise HTTPException(status_code=400, detail="Item already in favorites")
#         
#         new_favorite = ClientFavorite(
#             client_id=current_user.id,
#             favorite_type=favorite_data.favorite_type,
#             salon_id=favorite_data.salon_id,
#             master_id=favorite_data.master_id,
#             indie_master_id=favorite_data.indie_master_id,
#             service_id=favorite_data.service_id
#         )
#         
#         db.add(new_favorite)
#         db.commit()
#         db.refresh(new_favorite)
#         
#         return {"message": "Item added to favorites successfully"}
#         
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Ошибка при добавлении в избранное: {str(e)}"
#         )


@router.get("/indie-master/{master_id}/profile")
def get_indie_master_profile(
    master_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение профиля индивидуального мастера для кнопки "Повторить"
    """
    try:
        # Получаем информацию об индивидуальном мастере
        indie_master = (
            db.query(IndieMaster)
            .options(joinedload(IndieMaster.user))
            .filter(IndieMaster.id == master_id)
            .first()
        )
        
        if not indie_master:
            raise HTTPException(status_code=404, detail="Мастер не найден")
        
        return {
            "id": indie_master.id,
            "name": indie_master.user.full_name if indie_master.user else "Неизвестный мастер",
            "domain": indie_master.domain,
            "city": indie_master.city,
            "timezone": indie_master.timezone
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении профиля мастера: {str(e)}"
        )


@router.get("/master/{master_id}/profile")
def get_master_profile(
    master_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение профиля мастера в салоне для кнопки "Повторить"
    """
    try:
        # Получаем информацию о мастере в салоне
        master = (
            db.query(Master)
            .options(joinedload(Master.user))
            .filter(Master.id == master_id)
            .first()
        )
        
        if not master:
            raise HTTPException(status_code=404, detail="Мастер не найден")
        
        return {
            "id": master.id,
            "name": master.user.full_name if master.user else "Неизвестный мастер",
            "bio": master.bio,
            "experience_years": master.experience_years
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении профиля мастера: {str(e)}"
        )


@router.get("/service/{service_id}/profile")
def get_service_profile(
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение профиля услуги для кнопки "Повторить"
    """
    try:
        # Получаем информацию об услуге
        service = (
            db.query(Service)
            .options(joinedload(Service.category))
            .filter(Service.id == service_id)
            .first()
        )
        
        if not service:
            raise HTTPException(status_code=404, detail="Услуга не найдена")
        
        return {
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "price": service.price,
            "duration": service.duration,
            "category_id": service.category_id,
            "category_name": service.category.name if service.category else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении профиля услуги: {str(e)}"
        )


# @router.delete("/favorites/{favorite_type}/{item_id}", response_model=FavoriteResponse)
# def remove_from_favorites(
#     favorite_type: str,
#     item_id: int,
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Удаление элемента из избранного.
#     """
#     try:
#         # Находим избранное по типу и ID элемента
#         favorite = None
#         
#         if favorite_type == 'salon':
#             favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'salon',
#                     ClientFavorite.salon_id == item_id
#                 )
#                 .first()
#             )
#         elif favorite_type == 'master':
#             favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'master',
#                     ClientFavorite.master_id == item_id
#                 )
#                 .first()
#             )
#         elif favorite_type == 'indie_master':
#             favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'indie_master',
#                     ClientFavorite.indie_master_id == item_id
#                 )
#                 .first()
#             )
#         elif favorite_type == 'service':
#             favorite = (
#                 db.query(ClientFavorite)
#                 .filter(
#                     ClientFavorite.client_id == current_user.id,
#                     ClientFavorite.favorite_type == 'service',
#                     ClientFavorite.service_id == item_id
#                 )
#                 .first()
#             )
#         
#         if not favorite:
#             raise HTTPException(status_code=404, detail="Favorite not found")
#         
#         db.delete(favorite)
#         db.commit()
#         
#         return FavoriteResponse(
#             success=True,
#             message="Удалено из избранного",
#             favorite=None
#         )
#         
#     except HTTPException:
#         raise
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(
#             status_code=500,
#             detail=f"Ошибка при удалении из избранного: {str(e)}"
#         )


# @router.get("/favorites/salons", response_model=List[ClientFavorite])
# def get_favorite_salons(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Получение списка избранных салонов.
#     """
#     favorites = (
#         db.query(ClientFavorite)
#         .options(joinedload(ClientFavorite.salon))
#         .filter(
#             ClientFavorite.client_id == current_user.id,
#             ClientFavorite.favorite_type == 'salon'
#         )
#         .all()
#     )
#     return favorites


# @router.get("/favorites/masters", response_model=List[ClientFavorite])
# def get_favorite_masters(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Получение списка избранных мастеров.
#     """
#     favorites = (
#         db.query(ClientFavorite)
#         .options(joinedload(ClientFavorite.master).joinedload(Master.user))
#         .filter(
#             ClientFavorite.client_id == current_user.id,
#             ClientFavorite.favorite_type == 'master'
#         )
#         .all()
#     )
#     return favorites


# @router.get("/favorites/indie-masters", response_model=List[ClientFavorite])
# def get_favorite_indie_masters(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Получение списка избранных индивидуальных мастеров.
#     """
#     favorites = (
#         db.query(ClientFavorite)
#         .options(joinedload(ClientFavorite.indie_master).joinedload(IndieMaster.user))
#         .filter(
#             ClientFavorite.client_id == current_user.id,
#             ClientFavorite.favorite_type == 'indie_master'
#         )
#         .all()
#     )
#     return favorites


# @router.get("/favorites/services", response_model=List[ClientFavorite])
# def get_favorite_services(
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Получение списка избранных услуг.
#     """
#     favorites = (
#         db.query(ClientFavorite)
#         .options(
#             joinedload(ClientFavorite.service),
#             joinedload(ClientFavorite.salon),
#             joinedload(ClientFavorite.indie_master)
#         )
#         .filter(
#             ClientFavorite.client_id == current_user.id,
#             ClientFavorite.favorite_type == 'service'
#         )
#         .all()
#     )
#     return favorites


# @router.get("/favorites/check/{favorite_type}/{item_id}")
# def check_favorite_status(
#     favorite_type: str,
#     item_id: int,
#     db: Session = Depends(get_db),
#     current_user: User = Depends(get_current_active_user)
# ) -> Any:
#     """
#     Проверка статуса избранного для элемента.
#     """
#     favorite = None
#     
#     if favorite_type == 'salon':
#         favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.client_id == current_user.id,
#                 ClientFavorite.favorite_type == 'salon',
#                 ClientFavorite.salon_id == item_id
#                 .first()
#             )
#         )
#     elif favorite_type == 'master':
#         favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.client_id == current_user.id,
#                 ClientFavorite.favorite_type == 'master',
#                 ClientFavorite.master_id == item_id
#                 .first()
#             )
#         )
#     elif favorite_type == 'indie_master':
#         favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.client_id == current_user.id,
#                 ClientFavorite.favorite_type == 'indie_master',
#                 ClientFavorite.indie_master_id == item_id
#                 .first()
#             )
#         )
#     elif favorite_type == 'service':
#         favorite = (
#             db.query(ClientFavorite)
#             .filter(
#                 ClientFavorite.client_id == current_user.id,
#                 ClientFavorite.favorite_type == 'service',
#                 ClientFavorite.service_id == item_id
#                 .first()
#             )
#         )
#     
#     return {"is_favorite": favorite is not None, "favorite_id": favorite.id if favorite else None}


@router.get("/notes/{note_type}/{target_id}", response_model=Optional[ClientNoteResponse])
def get_client_note(
    note_type: str,
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение заметки клиента по типу и ID цели.
    """
    try:
        # Получаем заметку клиента
        note = db.query(ClientNote).filter(
            ClientNote.client_phone == current_user.phone,
            ClientNote.note_type == note_type,
            ClientNote.target_id == target_id
        ).first()
        
        return note
    except Exception as e:
        print(f"Ошибка при получении заметки: {e}")
        return None

@router.post("/notes", response_model=ClientNoteResponse)
def create_or_update_client_note(
    note_data: ClientNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Создание или обновление заметки клиента.
    """
    try:
        # Проверяем, существует ли уже заметка
        existing_note = db.query(ClientNote).filter(
            ClientNote.client_phone == current_user.phone,
            ClientNote.note_type == note_data.note_type,
            ClientNote.target_id == note_data.target_id
        ).first()
        
        if existing_note:
            # Обновляем существующую заметку
            if note_data.salon_note is not None:
                existing_note.salon_note = note_data.salon_note
            if note_data.master_note is not None:
                existing_note.master_note = note_data.master_note
            existing_note.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing_note)
            return existing_note
        else:
            # Создаем новую заметку
            new_note = ClientNote(
                client_phone=current_user.phone,
                note_type=note_data.note_type,
                target_id=note_data.target_id,
                salon_note=note_data.salon_note,
                master_note=note_data.master_note
            )
            db.add(new_note)
            db.commit()
            db.refresh(new_note)
            return new_note
            
    except Exception as e:
        db.rollback()
        print(f"Ошибка при создании/обновлении заметки: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при сохранении заметки")

@router.delete("/notes/{note_type}/{target_id}")
def delete_client_note(
    note_type: str,
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Удаление заметки клиента.
    """
    try:
        note = db.query(ClientNote).filter(
            ClientNote.client_phone == current_user.phone,
            ClientNote.note_type == note_type,
            ClientNote.target_id == target_id
        ).first()
        
        if note:
            db.delete(note)
            db.commit()
            return {"message": "Заметка удалена"}
        else:
            raise HTTPException(status_code=404, detail="Заметка не найдена")
            
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Ошибка при удалении заметки: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при удалении заметки")


# Эндпоинты для заметок клиентов о салонах
@profile_router.get("/salon-notes", response_model=List[ClientSalonNoteOut])
def get_client_salon_notes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Получение списка заметок клиента о салонах.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        notes = (
            db.query(ClientSalonNote)
            .options(
                joinedload(ClientSalonNote.salon),
                joinedload(ClientSalonNote.branch)
            )
            .filter(ClientSalonNote.client_id == current_user.id)
            .order_by(ClientSalonNote.updated_at.desc())
            .all()
        )
        
        result = []
        for note in notes:
            result.append(ClientSalonNoteOut(
                id=note.id,
                salon_id=note.salon_id,
                branch_id=note.branch_id,
                note=note.note,
                created_at=note.created_at,
                updated_at=note.updated_at,
                salon_name=note.salon.name if note.salon else None,
                branch_name=note.branch.name if note.branch else None
            ))
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении заметок: {str(e)}"
        )


@profile_router.get("/salon-notes/{salon_id}", response_model=ClientSalonNoteOut)
def get_client_salon_note(
    salon_id: int,
    branch_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Получение заметки клиента о конкретном салоне.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        query = db.query(ClientSalonNote).filter(
            ClientSalonNote.client_id == current_user.id,
            ClientSalonNote.salon_id == salon_id
        )
        
        if branch_id:
            query = query.filter(ClientSalonNote.branch_id == branch_id)
        else:
            query = query.filter(ClientSalonNote.branch_id.is_(None))
        
        note = query.first()
        
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заметка не найдена"
            )
        
        return ClientSalonNoteOut(
            id=note.id,
            salon_id=note.salon_id,
            branch_id=note.branch_id,
            note=note.note,
            created_at=note.created_at,
            updated_at=note.updated_at,
            salon_name=note.salon.name if note.salon else None,
            branch_name=note.branch.name if note.branch else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении заметки: {str(e)}"
        )


@profile_router.post("/salon-notes", response_model=ClientSalonNoteOut)
def create_client_salon_note(
    note_data: ClientSalonNoteCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Создание или обновление заметки клиента о салоне.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        # Проверяем, существует ли уже заметка
        existing_note = (
            db.query(ClientSalonNote)
            .filter(
                ClientSalonNote.client_id == current_user.id,
                ClientSalonNote.salon_id == note_data.salon_id,
                ClientSalonNote.branch_id == note_data.branch_id
            )
            .first()
        )
        
        if existing_note:
            # Обновляем существующую заметку
            existing_note.note = note_data.note
            existing_note.updated_at = datetime.utcnow()
            db.commit()
            
            return ClientSalonNoteOut(
                id=existing_note.id,
                salon_id=existing_note.salon_id,
                branch_id=existing_note.branch_id,
                note=existing_note.note,
                created_at=existing_note.created_at,
                updated_at=existing_note.updated_at,
                salon_name=existing_note.salon.name if existing_note.salon else None,
                branch_name=existing_note.branch.name if existing_note.branch else None
            )
        else:
            # Создаем новую заметку
            new_note = ClientSalonNote(
                client_id=current_user.id,
                salon_id=note_data.salon_id,
                branch_id=note_data.branch_id,
                note=note_data.note
            )
            
            db.add(new_note)
            db.commit()
            db.refresh(new_note)
            
            return ClientSalonNoteOut(
                id=new_note.id,
                salon_id=new_note.salon_id,
                branch_id=new_note.branch_id,
                note=new_note.note,
                created_at=new_note.created_at,
                updated_at=new_note.updated_at,
                salon_name=new_note.salon.name if new_note.salon else None,
                branch_name=new_note.branch.name if new_note.branch else None
            )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании заметки: {str(e)}"
        )


@profile_router.delete("/salon-notes/{salon_id}")
def delete_client_salon_note(
    salon_id: int,
    branch_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Удаление заметки клиента о салоне.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        query = db.query(ClientSalonNote).filter(
            ClientSalonNote.client_id == current_user.id,
            ClientSalonNote.salon_id == salon_id
        )
        
        if branch_id:
            query = query.filter(ClientSalonNote.branch_id == branch_id)
        else:
            query = query.filter(ClientSalonNote.branch_id.is_(None))
        
        note = query.first()
        
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заметка не найдена"
            )
        
        db.delete(note)
        db.commit()
        
        return {"message": "Заметка успешно удалена"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении заметки: {str(e)}"
        )


# Объединенный endpoint для получения всех заметок клиента
@profile_router.get("/all-notes", response_model=List[dict])
def get_all_client_notes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Получение всех заметок клиента (и о мастерах, и о салонах) в едином списке.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        # Получаем заметки о мастерах
        master_notes = (
            db.query(ClientMasterNote)
            .filter(ClientMasterNote.client_id == current_user.id)
            .all()
        )
        
        # Получаем заметки о салонах
        salon_notes = (
            db.query(ClientSalonNote)
            .filter(ClientSalonNote.client_id == current_user.id)
            .all()
        )
        
        result = []
        
        # Добавляем заметки о мастерах (упрощенная версия)
        for note in master_notes:
            result.append({
                "id": f"master_{note.id}",  # Уникальный ID с префиксом
                "type": "master",
                "master_id": note.master_id,
                "salon_id": note.salon_id,
                "branch_id": None,
                "note": note.note,
                "created_at": note.created_at,
                "updated_at": note.updated_at,
                "master_name": f"Мастер {note.master_id}",
                "salon_name": f"Салон {note.salon_id}",
                "branch_name": None
            })
        
        # Добавляем заметки о салонах (упрощенная версия)
        for note in salon_notes:
            result.append({
                "id": f"salon_{note.id}",  # Уникальный ID с префиксом
                "type": "salon",
                "master_id": None,
                "salon_id": note.salon_id,
                "branch_id": note.branch_id,
                "note": note.note,
                "created_at": note.created_at,
                "updated_at": note.updated_at,
                "master_name": None,
                "salon_name": f"Салон {note.salon_id}",
                "branch_name": f"Филиал {note.branch_id}" if note.branch_id else None
            })
        
        # Сортируем по дате обновления (новые сверху)
        result.sort(key=lambda x: x["updated_at"], reverse=True)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении заметок: {str(e)}"
        )


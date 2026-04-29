from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional
import logging
import pytz

from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_

logger = logging.getLogger(__name__)

from auth import get_current_active_user, require_client
from database import get_db
from models import (
    User, Salon, Master, IndieMaster, Service, SalonBranch, Booking, 
    BookingStatus, ClientNote, ClientMasterNote, ClientSalonNote, UserRole, ClientFavorite,
    TemporaryBooking, MasterPaymentSettings, AppliedDiscount, GlobalSettings, OwnerType
)
from schemas import (
    BookingShort, Booking as BookingSchema,
    BookingFutureShortCanon, BookingPastShortCanon,
    BookingCreate, BookingUpdate, ClientMasterNoteCreate, ClientMasterNoteUpdate, ClientMasterNoteOut,
    ClientSalonNoteCreate, ClientSalonNoteUpdate, ClientSalonNoteOut,
    ClientNoteCreate, ClientNoteUpdate, ClientNoteResponse, ClientFavoriteCreate, ClientFavorite as ClientFavoriteSchema,
    TemporaryBookingCreate, TemporaryBookingOut
)
from services.scheduling import get_available_slots
from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info
from utils.master_canon import (
    LEGACY_INDIE_MODE,
    MASTER_CANON_DEBUG,
    resolve_master_for_booking,
)
from utils.calendar_ics import build_booking_ics, ensure_utc_aware
from utils.yandex_maps_url import (
    booking_calendar_location_string,
    yandex_maps_url_for_booking,
    yandex_link_html_for_email,
)
from services.email_service import get_email_service
from urllib.parse import quote

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


def get_master_timezone(booking: Booking) -> Optional[str]:
    """
    Часовой пояс мастера/салона для записи. Только из master.timezone.
    Без fallback: если timezone пустая — возвращает None.
    """
    try:
        if booking.indie_master:
            tz = getattr(booking.indie_master, "timezone", None)
        elif booking.master:
            tz = getattr(booking.master, "timezone", None)
        elif booking.salon:
            tz = getattr(booking.salon, "timezone", None)
        else:
            tz = None
        if tz is not None and str(tz).strip():
            return str(tz).strip()
        return None
    except Exception as e:
        logger.warning("booking %s: timezone resolve error %s", booking.id, e)
        return None


def _google_calendar_event_strings(booking: Booking) -> tuple[str, str]:
    """Текст details (с Яндекс.Картами) и location для ссылки Google Calendar — согласовано с .ics."""
    code = (getattr(booking, "public_reference", None) or "").strip() or str(booking.id)
    details = f"Статус: {booking.status or 'created'}\nКод записи: {code}"
    yu = yandex_maps_url_for_booking(booking)
    if yu:
        details = f"{details}\nЯндекс.Карты: {yu}"
    return details, booking_calendar_location_string(booking)


def get_current_time_in_timezone(timezone_str: str) -> datetime:
    """
    Получает текущее время в указанном часовом поясе
    """
    tz = pytz.timezone(timezone_str)
    return datetime.now(tz)


# Всегда canon schema (без indie_master_id). Резолв indie→master на read-path.
_FutureResponse = List[BookingFutureShortCanon]
_PastResponse = List[BookingPastShortCanon]


@router.get("/", response_model=_FutureResponse)
def get_future_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    client_id: int = None,
    full: bool = Query(
        False,
        description="Если true — полный список будущих записей (модалка «Все»). Иначе — краткий превью (до 5).",
    ),
) -> Any:
    """
    Получение списка будущих бронирований клиента.
    Можно явно передать client_id (например, для админских целей), иначе используется текущий пользователь.
    По умолчанию возвращается не более 5 записей для главной страницы; full=true — без лимита.
    """
    _client_id = client_id if client_id is not None else current_user.id
    print(f"🔍 ОТЛАДКА get_future_bookings: client_id={_client_id}, current_user.id={current_user.id}")
    
    # Получаем ВСЕ записи (без limit), чтобы правильно отфильтровать по времени
    all_bookings = (
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
        .all()
    )
    
    print(f"🔍 ОТЛАДКА: Найдено {len(all_bookings)} записей в базе (все)")
    
    if len(all_bookings) == 0:
        print("⚠️ ВНИМАНИЕ: Нет записей в базе для клиента!")
        return []
    
    result = []
    future_count = 0
    past_count = 0
    error_count = 0
    n_with_indie, n_resolved, n_failed = 0, 0, 0
    
    for b in all_bookings:
        print(f"🔍 ОТЛАДКА: Обрабатываем запись {b.id}: start_time={b.start_time}, status={b.status}")
        
        # Получаем часовой пояс — только из master.timezone, без fallback
        master_timezone = get_master_timezone(b)
        if not master_timezone or not master_timezone.strip():
            if MASTER_CANON_DEBUG:
                raise ValueError(
                    f"Booking {b.id}: master timezone empty (master_id={b.master_id}). "
                    "Мастер без timezone не должен иметь записей."
                )
            logger.warning("booking %s: skip (master timezone empty, master_id=%s)", b.id, b.master_id)
            continue
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
            past_count += 1
            if past_count <= 3:  # Логируем только первые 3
                print(f"🔍 ОТЛАДКА: Запись {b.id} ПРОПУЩЕНА (уже прошла): {start_time_in_master_tz} <= {current_time_in_master_tz}")
            continue  # Пропускаем записи, которые уже прошли в часовом поясе мастера
        
        future_count += 1
        if future_count <= 3:  # Логируем только первые 3
            print(f"🔍 ОТЛАДКА: Запись {b.id} ДОБАВЛЕНА (будущая): {start_time_in_master_tz} > {current_time_in_master_tz}")
        
        try:
            # Сущность «салонный мастер» удалена из продукта.
            # Все salon_*/branch_* поля в клиентском ответе принудительно None,
            # независимо от того, что лежит в БД (у legacy-bookings salon_id может
            # быть выставлен — но клиент его не должен видеть).
            salon_name = None
            service_name = b.service.name if b.service else "-"
            price = float(b.service.price) if b.service and b.service.price is not None else 0.0
            duration = int(b.service.duration) if b.service and b.service.duration is not None else 0
            date = b.start_time
            branch_name = None
            branch_address = None
            master_domain = None
            if b.master and b.master.domain:
                master_domain = b.master.domain
            elif b.indie_master and b.indie_master.domain:
                master_domain = b.indie_master.domain

            # Canon: резолв indie→master, orphan: log+skip (или 500 если DEBUG)
            if MASTER_CANON_DEBUG and b.indie_master_id:
                n_with_indie += 1
            try:
                _mid, master_name = resolve_master_for_booking(b)
            except ValueError as e:
                if MASTER_CANON_DEBUG:
                    logger.exception("booking %s: cannot resolve master (orphan)", b.id)
                    raise
                logger.warning("booking %s: skip (cannot resolve master): %s", b.id, e)
                continue
            if _mid is None:
                if MASTER_CANON_DEBUG:
                    logger.error("booking %s: master_id=None after resolve", b.id)
                    raise ValueError(f"Booking {b.id}: master_id cannot be None")
                logger.warning("booking %s: skip (master_id=None)", b.id)
                continue
            if MASTER_CANON_DEBUG and b.indie_master_id:
                n_resolved += 1
            result.append(BookingFutureShortCanon(
                id=b.id,
                public_reference=b.public_reference,
                salon_name=salon_name,
                master_name=master_name,
                service_name=service_name,
                price=price,
                duration=duration,
                date=date,
                start_time=b.start_time,
                end_time=b.end_time,
                status=b.status if b.status else "created",
                branch_name=branch_name,
                branch_address=branch_address,
                master_id=_mid,
                indie_master_id=b.indie_master_id,
                service_id=b.service_id,
                salon_id=None,
                branch_id=None,
                master_domain=master_domain,
                master_timezone=master_timezone,
            ))
        except Exception as e:
            error_count += 1
            print(f"❌ ОШИБКА при обработке записи {b.id}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    
    if not full:
        result = result[:5]
    if MASTER_CANON_DEBUG:
        logger.info(
            "get_future_bookings: with_indie=%s resolved=%s failed=%s",
            n_with_indie, n_resolved, n_failed
        )
    print(f"🔍 ОТЛАДКА ИТОГО: Всего записей={len(all_bookings)}, Будущих={future_count}, Прошедших={past_count}, Ошибок={error_count}")
    print(f"🔍 ОТЛАДКА: Возвращаем {len(result)} будущих записей (после фильтрации), full={full}")
    print(f"🔍 ОТЛАДКА: Первая запись в результате: {result[0].id if result else 'нет'}")
    return result


@router.get("/past", response_model=_PastResponse)
def get_past_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    client_id: int = None,
    full: bool = Query(
        False,
        description="Если true — полный список прошедших записей (модалка «Все»). Иначе — краткий превью (до 5).",
    ),
) -> Any:
    """
    Получение списка прошедших бронирований клиента.
    Можно явно передать client_id (например, для админских целей), иначе используется текущий пользователь.
    По умолчанию не более 5 записей; full=true — без лимита.
    """
    _client_id = client_id if client_id is not None else current_user.id
    print(f"🔍 ОТЛАДКА get_past_bookings: client_id={_client_id}, current_user.id={current_user.id}")
    
    # Получаем ВСЕ записи (без limit), чтобы правильно отфильтровать по времени
    all_bookings = (
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
        .all()
    )
    
    print(f"🔍 ОТЛАДКА get_past_bookings: Найдено {len(all_bookings)} записей в базе (все)")
    
    if len(all_bookings) == 0:
        print("⚠️ ВНИМАНИЕ: Нет записей в базе для клиента!")
        return []
    
    result = []
    future_count = 0
    past_count = 0
    error_count = 0
    n_with_indie, n_resolved, n_failed = 0, 0, 0
    
    for b in all_bookings:
        print(f"🔍 ОТЛАДКА get_past_bookings: Обрабатываем запись {b.id}: start_time={b.start_time}, status={b.status}")
        
        if not b.start_time or not b.end_time:
            logger.warning("booking %s: skip (start_time or end_time is None)", b.id)
            continue
        # Получаем часовой пояс — только из master.timezone, без fallback
        master_timezone = get_master_timezone(b)
        if not master_timezone or not master_timezone.strip():
            if MASTER_CANON_DEBUG:
                raise ValueError(
                    f"Booking {b.id}: master timezone empty (master_id={b.master_id}). "
                    "Мастер без timezone не должен иметь записей."
                )
            logger.warning("booking %s: skip (master timezone empty, master_id=%s)", b.id, b.master_id)
            continue
        current_time_in_master_tz = get_current_time_in_timezone(master_timezone)
        
        print(f"🔍 ОТЛАДКА get_past_bookings: Мастер timezone={master_timezone}, текущее время в timezone={current_time_in_master_tz}")
        
        try:
            if b.start_time.tzinfo is None:
                start_time_in_master_tz = pytz.UTC.localize(b.start_time).astimezone(pytz.timezone(master_timezone))
            else:
                start_time_in_master_tz = b.start_time.astimezone(pytz.timezone(master_timezone))
        except Exception as e:
            logger.warning("booking %s: skip (timezone conversion failed): %s", b.id, e)
            continue
        print(f"🔍 ОТЛАДКА get_past_bookings: start_time в timezone мастера={start_time_in_master_tz}")
        
        # Проверяем, является ли запись прошедшей в часовом поясе мастера
        if start_time_in_master_tz > current_time_in_master_tz:
            future_count += 1
            if future_count <= 3:  # Логируем только первые 3
                print(f"🔍 ОТЛАДКА get_past_bookings: Запись {b.id} ПРОПУЩЕНА (еще не прошла): {start_time_in_master_tz} > {current_time_in_master_tz}")
            continue  # Пропускаем записи, которые еще не наступили в часовом поясе мастера
        
        past_count += 1
        if past_count <= 3:  # Логируем только первые 3
            print(f"🔍 ОТЛАДКА get_past_bookings: Запись {b.id} ДОБАВЛЕНА (прошедшая): {start_time_in_master_tz} <= {current_time_in_master_tz}")
        
        try:
            # «Салонный мастер» удалён из продукта: salon_*/branch_* в клиентском
            # ответе всегда None. Legacy-bookings с salon_id в БД остаются, но клиент
            # их в этом виде больше не получает.
            salon_name = None
            service_name = b.service.name if b.service else "-"
            price = float(b.service.price) if b.service and b.service.price is not None else 0.0
            duration = int(b.service.duration) if b.service and b.service.duration is not None else 0
            date = b.start_time
            branch_name = None
            branch_address = None
            master_domain = None
            if b.master and b.master.domain:
                master_domain = b.master.domain
            elif b.indie_master and b.indie_master.domain:
                master_domain = b.indie_master.domain

            # Canon: резолв indie→master, orphan: log+skip (или 500 если DEBUG)
            if MASTER_CANON_DEBUG and b.indie_master_id:
                n_with_indie += 1
            try:
                _mid, master_name = resolve_master_for_booking(b)
            except ValueError as e:
                if MASTER_CANON_DEBUG:
                    logger.exception("past booking %s: cannot resolve master (orphan)", b.id)
                    raise
                logger.warning("past booking %s: skip (cannot resolve master): %s", b.id, e)
                continue
            if _mid is None:
                if MASTER_CANON_DEBUG:
                    logger.error("past booking %s: master_id=None after resolve", b.id)
                    raise ValueError(f"Booking {b.id}: master_id cannot be None")
                logger.warning("past booking %s: skip (master_id=None)", b.id)
                continue
            if MASTER_CANON_DEBUG and b.indie_master_id:
                n_resolved += 1
            result.append(BookingPastShortCanon(
                id=b.id,
                public_reference=b.public_reference,
                salon_name=salon_name,
                master_name=master_name,
                service_name=service_name,
                price=price,
                duration=duration,
                date=date,
                start_time=b.start_time,
                end_time=b.end_time,
                status=b.status if b.status else "completed",
                branch_name=branch_name,
                branch_address=branch_address,
                master_id=_mid,
                indie_master_id=b.indie_master_id,
                service_id=b.service_id,
                salon_id=None,
                branch_id=None,
                master_domain=master_domain,
                master_timezone=master_timezone,
            ))
        except Exception as e:
            error_count += 1
            print(f"❌ ОШИБКА при обработке прошедшей записи {b.id}: {str(e)}")
            import traceback
            traceback.print_exc()
            continue
    
    if not full:
        result = result[:5]
    if MASTER_CANON_DEBUG:
        logger.info(
            "get_past_bookings: with_indie=%s resolved=%s failed=%s",
            n_with_indie, n_resolved, n_failed
        )
    print(f"🔍 ОТЛАДКА get_past_bookings ИТОГО: Всего записей={len(all_bookings)}, Будущих={future_count}, Прошедших={past_count}, Ошибок={error_count}")
    print(f"🔍 ОТЛАДКА get_past_bookings: Возвращаем {len(result)} прошедших записей (после фильтрации), full={full}")
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


def _calendar_booking_query(db: Session):
    return (
        db.query(Booking)
        .options(
            joinedload(Booking.service),
            joinedload(Booking.master).joinedload(Master.user),
            joinedload(Booking.indie_master).joinedload(IndieMaster.user),
            joinedload(Booking.branch).joinedload(SalonBranch.salon),
        )
    )


def _get_booking_for_calendar(db: Session, booking_id: int, client_id: int):
    """Load booking with relations for calendar. Client-only access."""
    return (
        _calendar_booking_query(db)
        .filter(Booking.id == booking_id, Booking.client_id == client_id)
        .first()
    )


def _get_booking_for_calendar_by_public_ref(
    db: Session, public_reference: str, client_id: int
):
    from utils.booking_public_reference import normalize_public_booking_reference

    ref = normalize_public_booking_reference(public_reference)
    if not ref:
        return None
    return (
        _calendar_booking_query(db)
        .filter(
            func.upper(Booking.public_reference) == ref,
            Booking.client_id == client_id,
        )
        .first()
    )


def _calendar_attachment_basename(booking: Booking) -> str:
    pr = (getattr(booking, "public_reference", None) or "").strip()
    if pr:
        safe = pr.replace("/", "-")
        return f"booking-{safe}.ics"
    return f"booking-{booking.id}.ics"


def _check_booking_future_and_tz(booking, master_tz: str) -> None:
    """Raise 400 if booking is past or master has no timezone."""
    # Master without timezone: check directly
    if booking.master and (not getattr(booking.master, "timezone", None) or not str(booking.master.timezone).strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    if booking.indie_master and (not getattr(booking.indie_master, "timezone", None) or not str(booking.indie_master.timezone).strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    now_in_tz = get_current_time_in_timezone(master_tz)
    start_utc = ensure_utc_aware(booking.start_time)
    start_local = start_utc.astimezone(pytz.timezone(master_tz))
    if start_local <= now_in_tz:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Добавить в календарь можно только будущие записи.",
        )


@router.get("/ref/{public_reference}/calendar.ics")
def get_calendar_ics_by_public_ref(
    public_reference: str,
    alarm_minutes: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """ICS по публичному коду записи (владелец)."""
    booking = _get_booking_for_calendar_by_public_ref(db, public_reference, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    alarm_minutes = max(5, min(120, alarm_minutes))
    ics = build_booking_ics(booking, master_tz, alarm_minutes=alarm_minutes)
    fn = _calendar_attachment_basename(booking)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.get("/ref/{public_reference}/calendar/google-link")
def get_google_calendar_link_by_public_ref(
    public_reference: str,
    alarm_minutes: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Google Calendar по публичному коду."""
    booking = _get_booking_for_calendar_by_public_ref(db, public_reference, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    start_utc = ensure_utc_aware(booking.start_time)
    end_utc = ensure_utc_aware(booking.end_time)
    start_str = start_utc.strftime("%Y%m%dT%H%M%SZ")
    end_str = end_utc.strftime("%Y%m%dT%H%M%SZ")
    service_name = booking.service.name if booking.service else "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = booking.master.user.full_name or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = booking.indie_master.user.full_name or "-"
    event_title = f"{service_name} — {master_name}"
    details, location = _google_calendar_event_strings(booking)
    url = (
        "https://calendar.google.com/calendar/render"
        f"?action=TEMPLATE&text={quote(event_title)}&dates={start_str}/{end_str}"
        f"&details={quote(details)}&location={quote(location)}"
    )
    return {"url": url}


@router.post("/ref/{public_reference}/calendar/email")
async def send_calendar_email_by_public_ref(
    public_reference: str,
    body: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Отправить ICS на email по публичному коду."""
    booking = _get_booking_for_calendar_by_public_ref(db, public_reference, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    email = getattr(current_user, "email", None)
    if not email or not str(email).strip():
        raise HTTPException(status_code=422, detail="Email required")
    alarm_minutes = max(5, min(120, body.get("alarm_minutes", 60)))
    ics = build_booking_ics(booking, master_tz, alarm_minutes=alarm_minutes)
    service_name = booking.service.name if booking.service else "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = booking.master.user.full_name or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = booking.indie_master.user.full_name or "-"
    subject = f"Запись: {service_name} — {master_name}"
    email_service = get_email_service()
    await email_service.send_ics_to_email(
        to_email=str(email).strip(),
        subject=subject,
        ics_content=ics,
        filename=_calendar_attachment_basename(booking),
        extra_body_html=yandex_link_html_for_email(yandex_maps_url_for_booking(booking)),
    )
    return {"ok": True}


@router.get("/{booking_id}/calendar.ics")
def get_calendar_ics(
    booking_id: int,
    alarm_minutes: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Скачать ICS-файл записи. Только будущие записи, только владелец."""
    booking = _get_booking_for_calendar(db, booking_id, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    alarm_minutes = max(5, min(120, alarm_minutes))
    ics = build_booking_ics(booking, master_tz, alarm_minutes=alarm_minutes)
    fn = _calendar_attachment_basename(booking)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


@router.get("/{booking_id}/calendar/google-link")
def get_google_calendar_link(
    booking_id: int,
    alarm_minutes: int = 60,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Получить ссылку для добавления в Google Calendar. Только будущие записи."""
    booking = _get_booking_for_calendar(db, booking_id, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    start_utc = ensure_utc_aware(booking.start_time)
    end_utc = ensure_utc_aware(booking.end_time)
    start_str = start_utc.strftime("%Y%m%dT%H%M%SZ")
    end_str = end_utc.strftime("%Y%m%dT%H%M%SZ")
    service_name = booking.service.name if booking.service else "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = booking.master.user.full_name or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = booking.indie_master.user.full_name or "-"
    event_title = f"{service_name} — {master_name}"
    details, location = _google_calendar_event_strings(booking)
    url = (
        "https://calendar.google.com/calendar/render"
        f"?action=TEMPLATE&text={quote(event_title)}&dates={start_str}/{end_str}"
        f"&details={quote(details)}&location={quote(location)}"
    )
    return {"url": url}


@router.post("/{booking_id}/calendar/email")
async def send_calendar_email(
    booking_id: int,
    body: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Отправить ICS на email. email обязателен если у пользователя нет."""
    booking = _get_booking_for_calendar(db, booking_id, current_user.id)
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    master_tz = get_master_timezone(booking)
    if not master_tz or not str(master_tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Добавление в календарь недоступно.",
        )
    _check_booking_future_and_tz(booking, master_tz)
    email = getattr(current_user, "email", None)
    if not email or not str(email).strip():
        raise HTTPException(status_code=422, detail="Email required")
    alarm_minutes = max(5, min(120, body.get("alarm_minutes", 60)))
    ics = build_booking_ics(booking, master_tz, alarm_minutes=alarm_minutes)
    service_name = booking.service.name if booking.service else "-"
    master_name = "-"
    if booking.master and booking.master.user:
        master_name = booking.master.user.full_name or "-"
    elif booking.indie_master and booking.indie_master.user:
        master_name = booking.indie_master.user.full_name or "-"
    subject = f"Запись: {service_name} — {master_name}"
    email_service = get_email_service()
    await email_service.send_ics_to_email(
        to_email=str(email).strip(),
        subject=subject,
        ics_content=ics,
        filename=_calendar_attachment_basename(booking),
        extra_body_html=yandex_link_html_for_email(yandex_maps_url_for_booking(booking)),
    )
    return {"ok": True}


@router.post("/", response_model=BookingSchema)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание нового бронирования.
    Перед созданием проверяются ограничения клиента.
    """
    from utils.client_restrictions import check_client_restrictions
    
    # Guard: мастер без timezone не может принимать записи
    if booking_in.master_id:
        master = db.query(Master).filter(Master.id == booking_in.master_id).first()
        if master and (not getattr(master, "timezone", None) or not str(master.timezone).strip()):
            raise HTTPException(
                status_code=400,
                detail="Мастер не настроил часовой пояс. Запись невозможна.",
            )

    # Проверяем ограничения клиента перед созданием бронирования
    if booking_in.master_id:
        # Получаем телефон клиента
        client_phone = current_user.phone
        
        # Проверяем ограничения
        restriction_check = check_client_restrictions(
            db, booking_in.master_id, current_user.id, client_phone
        )
        
        # Если клиент заблокирован - возвращаем ошибку
        if restriction_check['is_blocked']:
            raise HTTPException(
                status_code=403,
                detail=restriction_check.get('reason', 'Запись к этому мастеру невозможна')
            )
        
        # Если требуется предоплата - проверяем настройки оплаты
        # Но не блокируем создание, просто предупреждаем фронтенд
        # Фронтенд должен сам определить, какой эндпоинт использовать
        if restriction_check['requires_advance_payment']:
            payment_settings = db.query(MasterPaymentSettings).filter(
                MasterPaymentSettings.master_id == booking_in.master_id
            ).first()
            
            if payment_settings and payment_settings.accepts_online_payment:
                # Возвращаем ошибку, указывая что нужно использовать временную бронь
                raise HTTPException(
                    status_code=400,
                    detail="Для этого мастера требуется предоплата. Используйте эндпоинт /api/client/bookings/temporary для создания временной брони."
                )
    
    # Проверка доступности времени.
    # Важно: SQLAlchemy `Booking.indie_master_id == None` рендерится как `IS NULL`
    # и матчит ВСЕ записи с null indie. Поэтому в OR подключаем только те owner-поля,
    # которые в booking_in реально не None — иначе ложноположительный clash на
    # любой чужой booking без indie/salon в это же время.
    clash_filters = []
    if booking_in.master_id is not None:
        clash_filters.append(Booking.master_id == booking_in.master_id)
    if booking_in.indie_master_id is not None:
        clash_filters.append(Booking.indie_master_id == booking_in.indie_master_id)
    if booking_in.salon_id is not None:
        clash_filters.append(Booking.salon_id == booking_in.salon_id)

    if clash_filters:
        from sqlalchemy import or_
        existing_booking = (
            db.query(Booking)
            .filter(
                Booking.start_time == booking_in.start_time,
                Booking.status != BookingStatus.CANCELLED,
                or_(*clash_filters),
            )
            .first()
        )
        if existing_booking:
            raise HTTPException(status_code=400, detail="This time slot is already booked")

    # Обработка баллов лояльности
    loyalty_points_used = 0
    if booking_in.use_loyalty_points and booking_in.master_id:
        # Резервирование баллов происходит только для мастеров
        from utils.loyalty import (
            get_loyalty_settings, get_available_points,
            calculate_points_to_spend
        )
        
        # Получаем настройки лояльности мастера
        loyalty_settings = get_loyalty_settings(db, booking_in.master_id)
        
        if loyalty_settings and loyalty_settings.is_enabled:
            # Получаем доступные баллы
            available_points = get_available_points(db, booking_in.master_id, current_user.id)
            
            if available_points > 0:
                # Получаем стоимость услуги
                service = db.query(Service).filter(Service.id == booking_in.service_id).first()
                if service and service.price:
                    service_price = service.price
                else:
                    # Если цена не найдена в service, используем service_price из booking_in (если есть)
                    service_price = booking_in.dict().get('service_price', 0)
                
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
    service = db.query(Service).filter(Service.id == booking_in.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    base_price = service.price or 0

    discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
        master_id=booking_in.master_id,
        client_id=current_user.id,
        client_phone=current_user.phone,
        booking_start=booking_in.start_time,
        service_id=booking_in.service_id,
        db=db,
    )

    # Создаем booking_data (salon_id/branch_id через normalize_booking_fields)
    from utils.booking_factory import normalize_booking_fields, BookingOwnerError

    booking_data = booking_in.dict(
        exclude={
            "use_loyalty_points",
            "client_name",
            "service_name",
            "service_duration",
            "service_price",
        }
    )
    booking_data.pop('salon_id', None)
    booking_data.pop('branch_id', None)
    booking_data['loyalty_points_used'] = loyalty_points_used
    booking_data['payment_amount'] = (
        discounted_payment_amount if discounted_payment_amount is not None else base_price
    )
    booking_data['client_id'] = current_user.id
    if booking_in.indie_master_id:
        owner_type_str = "indie"
        owner_id_val = booking_in.indie_master_id
    elif booking_in.master_id:
        owner_type_str = "master" if (service.salon_id is None) else "salon"
        owner_id_val = booking_in.master_id
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

    booking = Booking(**booking_data)
    db.add(booking)
    db.flush()

    if applied_discount_data:
        applied_discount = AppliedDiscount(
            booking_id=booking.id,
            discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] != "personal" else None,
            personal_discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] == "personal" else None,
            discount_percent=applied_discount_data["discount_percent"],
            discount_amount=applied_discount_data["discount_amount"],
        )
        db.add(applied_discount)

    db.commit()
    db.refresh(booking)
    if applied_discount_data:
        booking.applied_discount = build_applied_discount_info(applied_discount)
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

    # Write-path: master-only — запретить установку indie_master_id
    updates = booking_in.dict(exclude_unset=True)
    if not LEGACY_INDIE_MODE and updates.get("indie_master_id") is not None:
        raise HTTPException(
            status_code=400,
            detail="Use master_id. Indie-masters merged into masters."
        )

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

    for field, value in updates.items():
        setattr(booking, field, value)

    db.commit()
    db.refresh(booking)
    
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
    
    booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
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

    # При отмене сбрасываем резервирование баллов (баллы не были списаны, так как запись не подтверждена)
    if booking.loyalty_points_used:
        booking.loyalty_points_used = 0

    booking.status = BookingStatus.CANCELLED
    db.commit()
    db.refresh(booking)
    return booking


# ========== ЭНДПОИНТЫ ДЛЯ ВРЕМЕННЫХ БРОНЕЙ ==========

@router.post("/temporary", response_model=TemporaryBookingOut)
def create_temporary_booking(
    booking_in: TemporaryBookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание временной брони на период оплаты (20 минут).
    Используется когда требуется предоплата.
    """
    from utils.client_restrictions import check_client_restrictions
    
    master = db.query(Master).filter(Master.id == booking_in.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    
    service = db.query(Service).filter(Service.id == booking_in.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # Проверяем ограничения
    client_phone = current_user.phone
    restriction_check = check_client_restrictions(
        db, booking_in.master_id, current_user.id, client_phone
    )
    
    if restriction_check['is_blocked']:
        raise HTTPException(
            status_code=403,
            detail=restriction_check.get('reason', 'Запись к этому мастеру невозможна')
        )
    
    if not restriction_check['requires_advance_payment']:
        raise HTTPException(
            status_code=400,
            detail="Для этого мастера не требуется предоплата. Используйте обычное бронирование."
        )
    
    # Проверяем настройки оплаты
    payment_settings = db.query(MasterPaymentSettings).filter(
        MasterPaymentSettings.master_id == booking_in.master_id
    ).first()
    
    if not payment_settings or not payment_settings.accepts_online_payment:
        raise HTTPException(
            status_code=400,
            detail="Мастер не принимает онлайн оплату"
        )
    
    # Проверяем конфликты временных броней
    existing_temporary = db.query(TemporaryBooking).filter(
        TemporaryBooking.master_id == booking_in.master_id,
        TemporaryBooking.start_time == booking_in.start_time,
        TemporaryBooking.status == 'pending'
    ).first()
    
    if existing_temporary:
        raise HTTPException(status_code=400, detail="Это время уже забронировано")
    
    # Проверяем конфликты обычных броней
    existing_booking = db.query(Booking).filter(
        Booking.master_id == booking_in.master_id,
        Booking.start_time == booking_in.start_time,
        Booking.status != BookingStatus.CANCELLED
    ).first()
    
    if existing_booking:
        raise HTTPException(status_code=400, detail="Это время уже забронировано")
    
    # Вычисляем время истечения (20 минут от создания)
    expires_at = datetime.utcnow() + timedelta(minutes=20)
    
    # Цена и скидки (runtime)
    service = db.query(Service).filter(Service.id == booking_in.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    base_price = service.price or 0

    discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
        master_id=booking_in.master_id,
        client_id=current_user.id,
        client_phone=current_user.phone,
        booking_start=booking_in.start_time,
        service_id=booking_in.service_id,
        db=db,
    )

    payment_amount = discounted_payment_amount if discounted_payment_amount is not None else base_price
    fixed_rule_type = None
    fixed_rule_id = None
    fixed_percent = None
    fixed_amount = None
    if applied_discount_data:
        fixed_rule_type = applied_discount_data.get("rule_type")
        fixed_rule_id = applied_discount_data.get("rule_id")
        fixed_percent = applied_discount_data.get("discount_percent")
        fixed_amount = applied_discount_data.get("discount_amount")

    # Создаем временную бронь (скидка фиксируется — при confirm не пересчитываем)
    temporary_booking = TemporaryBooking(
        master_id=booking_in.master_id,
        client_id=current_user.id,
        service_id=booking_in.service_id,
        start_time=booking_in.start_time,
        end_time=booking_in.end_time,
        payment_amount=payment_amount,
        expires_at=expires_at,
        status="pending",
        fixed_discount_rule_type=fixed_rule_type,
        fixed_discount_rule_id=fixed_rule_id,
        fixed_discount_percent=fixed_percent,
        fixed_discount_amount=fixed_amount,
    )
    
    db.add(temporary_booking)
    db.commit()
    db.refresh(temporary_booking)
    
    return temporary_booking


@router.post("/temporary/{temporary_booking_id}/confirm-payment", response_model=BookingSchema)
def confirm_temporary_booking_payment(
    temporary_booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Подтверждение оплаты временной брони.
    Создает реальное бронирование и удаляет временную бронь.
    """
    temporary_booking = db.query(TemporaryBooking).filter(
        TemporaryBooking.id == temporary_booking_id,
        TemporaryBooking.client_id == current_user.id,
        TemporaryBooking.status == 'pending'
    ).first()
    
    if not temporary_booking:
        raise HTTPException(status_code=404, detail="Temporary booking not found")
    
    # Проверяем, не истекло ли время
    if datetime.utcnow() > temporary_booking.expires_at:
        temporary_booking.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Время оплаты истекло")

    # Используем фиксированные скидку и сумму из temporary (не пересчитываем)
    payment_amount = temporary_booking.payment_amount
    fixed_type = temporary_booking.fixed_discount_rule_type
    fixed_id = temporary_booking.fixed_discount_rule_id
    fixed_percent = temporary_booking.fixed_discount_percent
    fixed_amount = temporary_booking.fixed_discount_amount
    has_fixed_discount = all(
        x is not None
        for x in (fixed_type, fixed_id, fixed_percent, fixed_amount)
    )

    # Создаем реальное бронирование (salon_id/branch_id через normalize_booking_fields)
    from utils.booking_factory import normalize_booking_fields, BookingOwnerError

    service = db.query(Service).filter(Service.id == temporary_booking.service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    base_data = {
        "master_id": temporary_booking.master_id,
        "client_id": temporary_booking.client_id,
        "service_id": temporary_booking.service_id,
        "start_time": temporary_booking.start_time,
        "end_time": temporary_booking.end_time,
        "status": BookingStatus.COMPLETED.value,
        "payment_amount": payment_amount,
    }
    try:
        booking_data = normalize_booking_fields(
            base_data, service, "salon", temporary_booking.master_id, db=db
        )
    except BookingOwnerError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    booking = Booking(**booking_data)
    db.add(booking)
    db.flush()
    applied_discount_orm = None
    if has_fixed_discount:
        applied_discount_orm = AppliedDiscount(
            booking_id=booking.id,
            discount_id=fixed_id if fixed_type != "personal" else None,
            personal_discount_id=fixed_id if fixed_type == "personal" else None,
            discount_percent=fixed_percent,
            discount_amount=fixed_amount,
        )
        db.add(applied_discount_orm)

    # Обновляем статус временной брони
    temporary_booking.status = "paid"

    db.commit()
    db.refresh(booking)
    if applied_discount_orm:
        booking.applied_discount = build_applied_discount_info(applied_discount_orm)

    return booking


@router.get("/temporary/{temporary_booking_id}/status", response_model=TemporaryBookingOut)
def get_temporary_booking_status(
    temporary_booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Проверка статуса временной брони.
    Возвращает время до истечения и статус.
    """
    temporary_booking = db.query(TemporaryBooking).filter(
        TemporaryBooking.id == temporary_booking_id,
        TemporaryBooking.client_id == current_user.id
    ).first()
    
    if not temporary_booking:
        raise HTTPException(status_code=404, detail="Temporary booking not found")
    
    # Проверяем, не истекло ли время
    if temporary_booking.status == 'pending' and datetime.utcnow() > temporary_booking.expires_at:
        temporary_booking.status = 'expired'
        db.commit()
    
    return temporary_booking


@router.delete("/temporary/{temporary_booking_id}")
def cancel_temporary_booking(
    temporary_booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Отмена временной брони.
    Освобождает слоты.
    """
    temporary_booking = db.query(TemporaryBooking).filter(
        TemporaryBooking.id == temporary_booking_id,
        TemporaryBooking.client_id == current_user.id,
        TemporaryBooking.status == 'pending'
    ).first()
    
    if not temporary_booking:
        raise HTTPException(status_code=404, detail="Temporary booking not found")
    
    temporary_booking.status = 'cancelled'
    db.commit()
    
    return {"message": "Temporary booking cancelled successfully"}


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
            rating=getattr(note, 'rating', None),
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
        rating=getattr(note, 'rating', None),
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
        # Для индивидуальных мастеров salon_id может быть None
        filter_conditions = [
            ClientMasterNote.client_id == current_user.id,
            ClientMasterNote.master_id == note_data.master_id
        ]
        
        if note_data.salon_id is not None:
            filter_conditions.append(ClientMasterNote.salon_id == note_data.salon_id)
        else:
            filter_conditions.append(ClientMasterNote.salon_id.is_(None))
        
        existing_note = (
            db.query(ClientMasterNote)
            .filter(*filter_conditions)
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
                rating=getattr(note, 'rating', None),
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
                rating=getattr(note, 'rating', None),
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


@profile_router.put("/master-notes/{master_id}/rating")
def update_master_rating(
    master_id: int,
    rating_data: dict = Body(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Установка или удаление оценки мастера (большой палец вниз).
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для клиентов"
        )
    
    try:
        rating = rating_data.get('rating') if rating_data else None  # 'dislike' или null
        
        # Находим или создаем заметку для этого мастера
        # Для оценки нужен salon_id, но мы можем использовать 0 или найти первый салон мастера
        note = (
            db.query(ClientMasterNote)
            .filter(
                ClientMasterNote.client_id == current_user.id,
                ClientMasterNote.master_id == master_id
            )
            .first()
        )
        
        if note:
            # Обновляем существующую заметку
            note.rating = rating if rating else None
            note.updated_at = datetime.now(timezone.utc)
        else:
            # Если заметки нет, создаем новую только с оценкой
            # Нужен salon_id, находим первый салон мастера или используем None для индивидуальных мастеров
            from models import Master
            master = db.query(Master).filter(Master.id == master_id).first()
            salon_id = None  # None для индивидуальных мастеров
            if master and master.salons:
                salon_id = master.salons[0].id
            
            note = ClientMasterNote(
                client_id=current_user.id,
                master_id=master_id,
                salon_id=salon_id,
                note="",  # Пустая заметка, только оценка
                rating=rating if rating else None
            )
            db.add(note)
        
        db.commit()
        db.refresh(note)
        
        return {"success": True, "rating": note.rating}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении оценки: {str(e)}"
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
            if not master_timezone or not master_timezone.strip():
                if MASTER_CANON_DEBUG:
                    raise ValueError(
                        f"Booking {booking.id}: master timezone empty. "
                        "Мастер без timezone не должен иметь записей."
                    )
                logger.warning("booking %s: skip in stats (master timezone empty)", booking.id)
                continue
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
        # Получаем все записи (не cancelled) для подсчета будущих
        all_bookings = (
            db.query(Booking)
            .filter(
                Booking.client_id == current_user.id,
                Booking.status != BookingStatus.CANCELLED
            )
            .all()
        )
        
        # Подсчитываем будущие записи с учетом timezone мастера
        future_bookings_count = 0
        for booking in all_bookings:
            master_timezone = get_master_timezone(booking)
            if not master_timezone or not master_timezone.strip():
                if MASTER_CANON_DEBUG:
                    raise ValueError(
                        f"Booking {booking.id}: master timezone empty. "
                        "Мастер без timezone не должен иметь записей."
                    )
                logger.warning("booking %s: skip in stats (master timezone empty)", booking.id)
                continue
            current_time_in_master_tz = get_current_time_in_timezone(master_timezone)
            
            # Приводим start_time к часовому поясу мастера для корректного сравнения
            if booking.start_time and booking.start_time.tzinfo is None:
                # Если start_time не имеет часового пояса, считаем что это UTC
                start_time_in_master_tz = pytz.UTC.localize(booking.start_time).astimezone(pytz.timezone(master_timezone))
            else:
                start_time_in_master_tz = booking.start_time.astimezone(pytz.timezone(master_timezone))
            
            # Проверяем, является ли запись будущей в часовом поясе мастера
            if start_time_in_master_tz > current_time_in_master_tz:
                future_bookings_count += 1
        
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
        
        # Флаг "салоны включены": приоритет БД > env override > false
        salons_enabled = False
        
        try:
            # 1) Пытаемся взять из БД (источник админки)
            setting = db.query(GlobalSettings).filter(GlobalSettings.key == "enableSalonFeatures").first()
            if setting and setting.value is not None:
                # GlobalSettings.value хранит boolean напрямую (JSON column)
                salons_enabled = bool(setting.value) if isinstance(setting.value, bool) else False
            else:
                # 2) Fallback на env переменную (для локальной разработки/override)
                from settings import get_settings
                salons_enabled = get_settings().salons_enabled_env
        except Exception:
            # 3) Если таблицы global_settings нет (миграция не применена) или другая ошибка БД
            # — используем fallback на env или false (безопасный дефолт)
            logger.warning("Не удалось прочитать настройки из БД, используем fallback", exc_info=True)
            from settings import get_settings
            salons_enabled = get_settings().salons_enabled_env
        
        return {
            "past_bookings": past_bookings_count,
            "future_bookings": future_bookings_count,
            "top_salons": top_salons_with_names,
            "top_masters": top_masters_with_names,
            "top_indie_masters": top_indie_masters_with_names,
            "salons_enabled": salons_enabled
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении статистики: {str(e)}"
        )


# Эндпоинты для работы с избранным
@profile_router.post("/favorites", response_model=dict)
def add_to_favorites(
    favorite_data: ClientFavoriteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Добавление элемента в избранное.
    """
    try:
        # master-only: только favorite_type='master'
        if not LEGACY_INDIE_MODE:
            if favorite_data.favorite_type != "master" or not favorite_data.master_id:
                detail = "Only master favorites are supported. Use favorite_type='master' and master_id."
                if favorite_data.favorite_type == "indie_master" or favorite_data.indie_master_id:
                    detail = "Indie-masters merged into masters. Use favorite_type='master' and master_id."
                raise HTTPException(status_code=400, detail=detail)
        elif favorite_data.favorite_type == "indie_master" and MASTER_CANON_DEBUG:
            logger.info("MASTER_CANON deprecated: POST /favorites with favorite_type=indie_master")

        # Проверяем, существует ли уже избранное для этого элемента
        existing_favorite = None
        
        if favorite_data.salon_id:
            existing_favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'salon',
                    ClientFavorite.salon_id == favorite_data.salon_id
                )
                .first()
            )
        elif favorite_data.master_id:
            existing_favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'master',
                    ClientFavorite.master_id == favorite_data.master_id
                )
                .first()
            )
        elif favorite_data.indie_master_id:
            existing_favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'indie_master',
                    ClientFavorite.indie_master_id == favorite_data.indie_master_id
                )
                .first()
            )
        elif favorite_data.service_id:
            existing_favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'service',
                    ClientFavorite.service_id == favorite_data.service_id
                )
                .first()
            )
        
        if existing_favorite:
            raise HTTPException(status_code=400, detail="Item already in favorites")
        
        # Автоматически определяем правильное имя из связанного объекта
        favorite_name = favorite_data.favorite_name
        
        if favorite_data.favorite_type == 'salon' and favorite_data.salon_id:
            salon = db.query(Salon).filter(Salon.id == favorite_data.salon_id).first()
            if salon:
                favorite_name = salon.name
        elif favorite_data.favorite_type == 'master' and favorite_data.master_id:
            master = db.query(Master).options(joinedload(Master.user)).filter(Master.id == favorite_data.master_id).first()
            if master and master.user:
                favorite_name = master.user.full_name
        elif favorite_data.favorite_type == 'indie_master' and favorite_data.indie_master_id:
            indie_master = db.query(IndieMaster).options(joinedload(IndieMaster.user)).filter(IndieMaster.id == favorite_data.indie_master_id).first()
            if indie_master and indie_master.user:
                favorite_name = indie_master.user.full_name
        elif favorite_data.favorite_type == 'service' and favorite_data.service_id:
            service = db.query(Service).filter(Service.id == favorite_data.service_id).first()
            if service:
                favorite_name = service.name
        
        new_favorite = ClientFavorite(
            client_id=current_user.id,
            favorite_type=favorite_data.favorite_type,
            salon_id=favorite_data.salon_id,
            master_id=favorite_data.master_id,
            indie_master_id=favorite_data.indie_master_id,
            service_id=favorite_data.service_id,
            favorite_name=favorite_name
        )
        
        db.add(new_favorite)
        db.commit()
        db.refresh(new_favorite)
        
        return {"message": "Item added to favorites successfully", "favorite": {"id": new_favorite.client_favorite_id}}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при добавлении в избранное: {str(e)}"
        )


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


@profile_router.delete("/favorites/{favorite_type}/{item_id}", response_model=dict)
def remove_from_favorites(
    favorite_type: str,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Удаление элемента из избранного.
    """
    try:
        # master-only: indie-master delete → 410
        if not LEGACY_INDIE_MODE:
            norm = favorite_type.lower().replace("-", "").replace("_", "")
            if norm in ("indiemaster", "indiemasters"):
                raise HTTPException(
                    status_code=410,
                    detail="Use /favorites/masters. Indie-masters merged into masters."
                )

        # Находим избранное по типу и ID элемента
        favorite = None
        
        if favorite_type == 'salon' or favorite_type == 'salons':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'salon',
                    ClientFavorite.salon_id == item_id
                )
                .first()
            )
        elif favorite_type == 'master' or favorite_type == 'masters':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'master',
                    ClientFavorite.master_id == item_id
                )
                .first()
            )
        elif favorite_type == 'indie_master' or favorite_type == 'indie-masters' or favorite_type == 'indieMasters':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'indie_master',
                    ClientFavorite.indie_master_id == item_id
                )
                .first()
            )
        elif favorite_type == 'service' or favorite_type == 'services':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'service',
                    ClientFavorite.service_id == item_id
                )
                .first()
            )
        
        if not favorite:
            raise HTTPException(status_code=404, detail="Favorite not found")
        
        db.delete(favorite)
        db.commit()
        
        return {"success": True, "message": "Удалено из избранного"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при удалении из избранного: {str(e)}"
        )


@profile_router.get("/favorites/salons")
def get_favorite_salons(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка избранных салонов.
    """
    try:
        favorites = (
            db.query(ClientFavorite)
            .options(joinedload(ClientFavorite.salon))
            .filter(
                ClientFavorite.client_id == current_user.id,
                ClientFavorite.favorite_type == 'salon'
            )
            .all()
        )
        # Преобразуем вложенные объекты в словари для сериализации
        result = []
        for fav in favorites:
            fav_dict = {
                "client_favorite_id": fav.client_favorite_id,
                "client_id": fav.client_id,
                "favorite_type": fav.favorite_type,
                "salon_id": fav.salon_id,
                "master_id": fav.master_id,
                "indie_master_id": fav.indie_master_id,
                "service_id": fav.service_id,
                "favorite_name": fav.favorite_name,
                "salon": None,
                "master": None,
                "indie_master": None,
                "service": None
            }
            if fav.salon:
                fav_dict["salon"] = {
                    "id": fav.salon.id,
                    "name": fav.salon.name,
                    "domain": fav.salon.domain,
                    "description": fav.salon.description,
                    "phone": fav.salon.phone,
                    "email": fav.salon.email
                }
            result.append(fav_dict)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении избранных салонов: {str(e)}"
        )


@profile_router.get("/favorites/masters")
def get_favorite_masters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка избранных мастеров.
    """
    try:
        favorites = (
            db.query(ClientFavorite)
            .options(joinedload(ClientFavorite.master).joinedload(Master.user))
            .filter(
                ClientFavorite.client_id == current_user.id,
                ClientFavorite.favorite_type == 'master'
            )
            .all()
        )
        # Преобразуем вложенные объекты в словари для сериализации
        result = []
        for fav in favorites:
            master_domain = getattr(fav.master, 'domain', None) if fav.master else None
            fav_dict = {
                "client_favorite_id": fav.client_favorite_id,
                "client_id": fav.client_id,
                "favorite_type": fav.favorite_type,
                "salon_id": fav.salon_id,
                "master_id": fav.master_id,
                "indie_master_id": fav.indie_master_id,
                "service_id": fav.service_id,
                "favorite_name": fav.favorite_name,
                "master_domain": master_domain,
                "salon": None,
                "master": None,
                "indie_master": None,
                "service": None
            }
            if fav.master:
                master_data = {
                    "id": fav.master.id,
                    "user_id": fav.master.user_id,
                    "bio": getattr(fav.master, 'bio', None),
                    "experience_years": getattr(fav.master, 'experience_years', None),
                    "domain": getattr(fav.master, 'domain', None),
                    "user": None
                }
                if fav.master.user:
                    master_data["user"] = {
                        "id": fav.master.user.id,
                        "full_name": fav.master.user.full_name,
                        "phone": getattr(fav.master.user, 'phone', None),
                        "email": getattr(fav.master.user, 'email', None)
                    }
                fav_dict["master"] = master_data
            result.append(fav_dict)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении избранных мастеров: {str(e)}"
        )


@profile_router.get("/favorites/indie-masters")
def get_favorite_indie_masters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Совместимость: раньше отдавал 410. Избранные indie сведены к salon masters — тот же ответ, что /favorites/masters.
    """
    return get_favorite_masters(db, current_user)


@profile_router.get("/favorites/services")
def get_favorite_services(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Получение списка избранных услуг.
    """
    try:
        favorites = (
            db.query(ClientFavorite)
            .options(
                joinedload(ClientFavorite.service),
                joinedload(ClientFavorite.salon),
                joinedload(ClientFavorite.indie_master)
            )
            .filter(
                ClientFavorite.client_id == current_user.id,
                ClientFavorite.favorite_type == 'service'
            )
            .all()
        )
        # Преобразуем вложенные объекты в словари для сериализации
        result = []
        for fav in favorites:
            fav_dict = {
                "client_favorite_id": fav.client_favorite_id,
                "client_id": fav.client_id,
                "favorite_type": fav.favorite_type,
                "salon_id": fav.salon_id,
                "master_id": fav.master_id,
                "indie_master_id": fav.indie_master_id,
                "service_id": fav.service_id,
                "favorite_name": fav.favorite_name,
                "salon": None,
                "master": None,
                "indie_master": None,
                "service": None
            }
            if fav.service:
                fav_dict["service"] = {
                    "id": fav.service.id,
                    "name": fav.service.name,
                    "description": fav.service.description,
                    "price": float(fav.service.price) if fav.service.price else 0.0,
                    "duration": int(fav.service.duration) if fav.service.duration else 0
                }
            if fav.salon:
                fav_dict["salon"] = {
                    "id": fav.salon.id,
                    "name": fav.salon.name,
                    "domain": fav.salon.domain
                }
            if fav.indie_master:
                fav_dict["indie_master"] = {
                    "id": fav.indie_master.id,
                    "domain": fav.indie_master.domain,
                    "city": fav.indie_master.city
                }
            result.append(fav_dict)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении избранных услуг: {str(e)}"
        )


@profile_router.get("/favorites/check/{favorite_type}/{item_id}")
def check_favorite_status(
    favorite_type: str,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    """
    Проверка статуса избранного для элемента.
    """
    try:
        favorite = None
        
        if favorite_type == 'salon':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'salon',
                    ClientFavorite.salon_id == item_id
                )
                .first()
            )
        elif favorite_type == 'master':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'master',
                    ClientFavorite.master_id == item_id
                )
                .first()
            )
        elif favorite_type == 'indie_master':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'indie_master',
                    ClientFavorite.indie_master_id == item_id
                )
                .first()
            )
        elif favorite_type == 'service':
            favorite = (
                db.query(ClientFavorite)
                .filter(
                    ClientFavorite.client_id == current_user.id,
                    ClientFavorite.favorite_type == 'service',
                    ClientFavorite.service_id == item_id
                )
                .first()
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown favorite type: {favorite_type}")
        
        return {"is_favorite": favorite is not None, "favorite_id": favorite.client_favorite_id if favorite else None}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при проверке статуса избранного: {str(e)}"
        )


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


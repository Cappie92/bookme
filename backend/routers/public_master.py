"""
Публичный API страницы записи к мастеру: /api/public/masters/{slug}
Master-only. Slug = masters.domain.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import quote_plus
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, get_current_user_optional, get_current_active_user
from database import get_db
from schemas import PublicBookingCreateOut
from models import (
    Master,
    MasterService,
    MasterServiceCategory,
    User,
    ClientNote,
    MasterPaymentSettings,
)
from utils.client_restrictions import check_client_restrictions
from utils.loyalty import get_available_points, get_loyalty_settings
from services.scheduling import get_available_slots, check_master_working_hours, check_booking_conflicts
from utils.loyalty_discounts import evaluate_and_prepare_applied_discount
from utils.booking_factory import normalize_booking_fields, BookingOwnerError
from models import Booking, BookingStatus, Service, AppliedDiscount, OwnerType

router = APIRouter(prefix="/api/public/masters", tags=["public_master"])


# --- Schemas ---
class PublicServiceOut(BaseModel):
    id: int
    name: str
    duration: int
    price: float
    category_name: Optional[str] = None


class PublicMasterProfileOut(BaseModel):
    master_id: int
    master_name: str
    master_slug: str
    master_timezone: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    address_detail: Optional[str] = None
    phone: Optional[str] = None
    yandex_maps_url: Optional[str] = None
    services: List[PublicServiceOut]
    requires_advance_payment: bool = False
    booking_blocked: bool = False


def _master_zoneinfo(master: Master) -> ZoneInfo:
    name = (master.timezone or "Europe/Moscow").strip()
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Europe/Moscow")


def _slot_bounds_in_master_tz(
    start: datetime, end: datetime, tz: ZoneInfo
) -> tuple[datetime, datetime]:
    """Считаем naive datetime из scheduling локальным временем мастера и делаем offset-aware."""
    st = start.replace(tzinfo=tz) if start.tzinfo is None else start.astimezone(tz)
    et = end.replace(tzinfo=tz) if end.tzinfo is None else end.astimezone(tz)
    return st, et


def _build_yandex_maps_url(*, city: Optional[str], address: Optional[str]) -> Optional[str]:
    """Собрать ссылку на Яндекс.Карты из текстового адреса (без координат).

    MVP: достаточно 'text=' параметра. Если адреса нет — пробуем хотя бы город.
    """
    parts: list[str] = []
    if city and str(city).strip():
        parts.append(str(city).strip())
    if address and str(address).strip():
        parts.append(str(address).strip())
    if not parts:
        return None
    query = quote_plus(", ".join(parts))
    return f"https://yandex.ru/maps/?text={query}"


class PublicSlotOut(BaseModel):
    start_time: str  # ISO
    end_time: str   # ISO


class PublicAvailabilityOut(BaseModel):
    slots: List[PublicSlotOut]
    master_timezone: str


class PublicBookingCreate(BaseModel):
    service_id: int
    start_time: datetime
    end_time: datetime


class ClientNoteOut(BaseModel):
    note_text: Optional[str] = None


class EligibilityOut(BaseModel):
    booking_blocked: bool = False
    requires_advance_payment: bool = False
    points: Optional[int] = None


def _get_master_by_slug(db: Session, slug: str) -> Optional[Master]:
    """Resolve slug (masters.domain) to Master. Master-only."""
    return db.query(Master).filter(Master.domain == slug).first()


def _ensure_master_timezone(master: Master) -> None:
    """Raise 400 if master has no timezone."""
    tz = getattr(master, "timezone", None)
    if not tz or not str(tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Мастер не настроил часовой пояс. Запись невозможна.",
        )


@router.get(
    "/{slug}",
    response_model=PublicMasterProfileOut,
    summary="Публичный профиль мастера",
    responses={404: {"description": "Мастер не найден"}},
)
def get_public_master_profile(slug: str, db: Session = Depends(get_db)) -> Any:
    """Публичный профиль мастера по slug (masters.domain). Без авторизации."""
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    user = master.user
    if not user:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    services = (
        db.query(MasterService)
        .outerjoin(MasterServiceCategory, MasterService.category_id == MasterServiceCategory.id)
        .filter(MasterService.master_id == master.id)
        .order_by(MasterServiceCategory.name.nullslast(), MasterService.name)
        .all()
    )
    service_list = [
        PublicServiceOut(
            id=s.id,
            name=s.name,
            duration=s.duration or 0,
            price=float(s.price or 0),
            category_name=s.category.name if s.category else None,
        )
        for s in services
    ]

    requires_advance = False
    payment_settings = db.query(MasterPaymentSettings).filter(
        MasterPaymentSettings.master_id == master.id
    ).first()
    if payment_settings and getattr(payment_settings, "requires_advance_payment", False):
        requires_advance = True

    return PublicMasterProfileOut(
        master_id=master.id,
        master_name=user.full_name or "Мастер",
        master_slug=master.domain or slug,
        master_timezone=master.timezone or "Europe/Moscow",
        description=master.site_description or master.bio,
        avatar_url=master.photo or master.logo,
        city=master.city,
        address=master.address,
        address_detail=getattr(master, "address_detail", None),
        phone=user.phone,
        yandex_maps_url=_build_yandex_maps_url(city=master.city, address=master.address),
        services=service_list,
        requires_advance_payment=requires_advance,
        booking_blocked=False,
    )


@router.get(
    "/{slug}/availability",
    response_model=PublicAvailabilityOut,
    summary="Доступные слоты для записи",
    responses={404: {"description": "Мастер не найден"}},
)
def get_public_availability(
    slug: str,
    from_date: str,  # YYYY-MM-DD
    to_date: str,    # YYYY-MM-DD
    service_id: int,
    db: Session = Depends(get_db),
) -> Any:
    """Доступные слоты в диапазоне дат. Единый источник: get_available_slots."""
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    _ensure_master_timezone(master)

    service = db.query(MasterService).filter(
        MasterService.id == service_id,
        MasterService.master_id == master.id,
    ).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    duration = service.duration or 60

    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Неверный формат даты. Используйте YYYY-MM-DD")

    slots_out: List[PublicSlotOut] = []
    tz = _master_zoneinfo(master)
    now_master = datetime.now(tz)
    current = from_dt.date()
    end = to_dt.date()
    while current <= end:
        day_dt = datetime.combine(current, datetime.min.time())
        day_slots = get_available_slots(
            db, OwnerType.MASTER, master.id, day_dt, duration, branch_id=None
        )
        for s in day_slots:
            st = s.get("start_time")
            et = s.get("end_time")
            if st and et:
                if not isinstance(st, datetime) or not isinstance(et, datetime):
                    continue
                st_a, et_a = _slot_bounds_in_master_tz(st, et, tz)
                # Не отдаём уже начавшиеся слоты (единая логика для календаря и списка времён)
                if st_a <= now_master:
                    continue
                slots_out.append(
                    PublicSlotOut(
                        start_time=st_a.isoformat(),
                        end_time=et_a.isoformat(),
                    )
                )
        current = current + timedelta(days=1)

    return PublicAvailabilityOut(
        slots=slots_out,
        master_timezone=master.timezone or "Europe/Moscow",
    )


@router.post(
    "/{slug}/bookings",
    response_model=PublicBookingCreateOut,
    summary="Создать бронирование с публичной страницы",
    responses={
        400: {"description": "Неверное время или предоплата обязательна"},
        403: {"description": "Только клиенты / запись заблокирована"},
        404: {"description": "Мастер или услуга не найдены"},
        422: {"description": "Ошибка валидации тела запроса"},
    },
)
def create_public_booking(
    slug: str,
    body: PublicBookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """Создать бронирование. Требует авторизации клиента."""
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    _ensure_master_timezone(master)

    if current_user.role != "client":
        raise HTTPException(status_code=403, detail="Только клиенты могут создавать записи")

    restriction = check_client_restrictions(
        db, master.id, current_user.id, current_user.phone or ""
    )
    if restriction.get("is_blocked"):
        raise HTTPException(
            status_code=403,
            detail=restriction.get("reason", "Запись к этому мастеру невозможна"),
        )

    if restriction.get("requires_advance_payment"):
        raise HTTPException(
            status_code=400,
            detail="Для этого мастера требуется предоплата. Используйте форму на сайте мастера.",
        )

    master_svc = db.query(MasterService).filter(
        MasterService.id == body.service_id,
        MasterService.master_id == master.id,
    ).first()
    if not master_svc:
        raise HTTPException(status_code=404, detail="Услуга не найдена у этого мастера")

    # Master-only: создаём Service-запись для MasterService (Booking.service_id FK → services)
    service = db.query(Service).filter(
        Service.salon_id.is_(None),
        Service.indie_master_id.is_(None),
        Service.name == master_svc.name,
        Service.duration == master_svc.duration,
        Service.price == master_svc.price,
    ).first()
    if not service:
        service = Service(
            name=master_svc.name,
            duration=master_svc.duration,  # type: ignore[arg-type]
            price=master_svc.price,  # type: ignore[arg-type]
            salon_id=None,
            indie_master_id=None,
            category_id=None,
        )
        db.add(service)
        db.flush()

    if not check_master_working_hours(
        db, master.id, body.start_time, body.end_time,
        is_salon_work=False,
        salon_id=None,
    ):
        raise HTTPException(status_code=400, detail="Мастер не работает в указанное время")

    if check_booking_conflicts(db, body.start_time, body.end_time, OwnerType.MASTER, master.id):
        raise HTTPException(status_code=400, detail="Выбранное время уже занято")

    discounted_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
        master_id=master.id,
        client_id=current_user.id,
        client_phone=current_user.phone or "",
        booking_start=body.start_time,
        service_id=service.id,
        db=db,
    )
    base_price = float(service.price or 0)
    payment_amount = discounted_amount if discounted_amount is not None else base_price

    booking_data = {
        "service_id": service.id,
        "master_id": master.id,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "client_id": current_user.id,
        "status": BookingStatus.CREATED.value,
        "payment_amount": payment_amount,
        "loyalty_points_used": 0,
    }
    try:
        booking_data = normalize_booking_fields(
            booking_data, service, "master", master.id, db=db
        )
    except BookingOwnerError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    booking = Booking(**booking_data)
    db.add(booking)
    db.flush()
    if applied_discount_data:
        db.add(AppliedDiscount(
            booking_id=booking.id,
            discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] != "personal" else None,
            personal_discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] == "personal" else None,
            discount_percent=applied_discount_data["discount_percent"],
            discount_amount=applied_discount_data["discount_amount"],
        ))
    db.commit()
    db.refresh(booking)
    status_val = getattr(booking.status, "value", str(booking.status))
    return PublicBookingCreateOut(
        id=booking.id,
        status=status_val,
        public_reference=booking.public_reference or "",
    )


@router.get(
    "/{slug}/client-note",
    response_model=ClientNoteOut,
    summary="Заметка клиента о мастере",
    responses={404: {"description": "Мастер не найден"}},
)
def get_public_client_note(
    slug: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Any:
    """Заметка клиента о мастере. Без токена — 200 null. С токеном — note_text или null."""
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    if not current_user or not current_user.phone:
        return ClientNoteOut(note_text=None)

    note = db.query(ClientNote).filter(
        ClientNote.client_phone == current_user.phone,
        ClientNote.note_type == "master",
        ClientNote.target_id == master.id,
    ).first()
    return ClientNoteOut(note_text=note.master_note if note and note.master_note else None)


@router.get(
    "/{slug}/eligibility",
    response_model=EligibilityOut,
    summary="Баллы и ограничения для записи",
    responses={404: {"description": "Мастер не найден"}},
)
def get_public_eligibility(
    slug: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Any:
    """Баллы и ограничения для авторизованного клиента. Без токена — booking_blocked: false, points: null."""
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    result = EligibilityOut(booking_blocked=False, requires_advance_payment=False, points=None)
    payment_settings = db.query(MasterPaymentSettings).filter(
        MasterPaymentSettings.master_id == master.id
    ).first()
    if payment_settings and getattr(payment_settings, "requires_advance_payment", False):
        result.requires_advance_payment = True

    if current_user and current_user.role == "client" and current_user.id:
        restriction = check_client_restrictions(
            db, master.id, current_user.id, current_user.phone or ""
        )
        result.booking_blocked = restriction.get("is_blocked", False)
        if restriction.get("requires_advance_payment"):
            result.requires_advance_payment = True
        try:
            result.points = get_available_points(db, master.id, current_user.id)
        except Exception:
            result.points = 0
    return result

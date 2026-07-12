"""
Публичный API страницы записи к мастеру: /api/public/masters/{slug}
Master-only. Slug = masters.domain.
"""
import logging
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user, get_current_user_optional, get_current_active_user
from database import get_db
from schemas import PublicBookingCreateOut
from models import (
    Master,
    MasterService,
    MasterServiceCategory,
    User,
    UserRole,
    ClientNote,
    MasterPaymentSettings,
)
from utils.client_restrictions import check_client_restrictions
from utils.public_booking_loyalty import (
    build_public_booking_price_preview_loyalty,
    compute_public_create_loyalty_points_used,
    effective_available_points,
)
from utils.loyalty import get_loyalty_settings
from services.scheduling import get_available_slots, check_master_working_hours, check_booking_conflicts
from utils.loyalty_discounts import (
    evaluate_and_prepare_applied_discount,
    evaluate_discount_candidates,
    get_master_local_now,
    _master_local_to_utc,
    build_public_loyalty_visual_hints,
)
from utils.booking_factory import normalize_booking_fields, BookingOwnerError
from models import Booking, BookingStatus, Service, AppliedDiscount, OwnerType
from utils.yandex_maps_url import build_yandex_maps_url
from utils.master_domain_lookup import get_master_by_domain_slug

router = APIRouter(prefix="/api/public/masters", tags=["public_master"])
logger = logging.getLogger(__name__)


def _sanitize_public_loyalty_rule_name(name: Optional[str]) -> Optional[str]:
    """Убирает QA-маркеры из отображаемого названия правила на публичной странице (seed остаётся с [QA SMOKE] для идемпотентности)."""
    if not name:
        return None
    s = str(name).replace("[QA SMOKE]", "").replace("[QA_SMOKE]", "")
    s = " ".join(s.split())
    while len(s) >= 3 and s[:3].lower() == "qa ":
        s = s[3:].lstrip()
    return s or None


# --- Schemas ---
class PublicServiceOut(BaseModel):
    id: int
    name: str
    duration: int
    price: float
    category_name: Optional[str] = None


class PublicHappyHoursVisualOut(BaseModel):
    """Активные счастливые часы (локаль календаря мастера, ISO weekday 1=Пн … 7=Вс)."""

    weekday: int
    start_time: str
    end_time: str
    discount_percent: float
    label: str


class PublicServiceDiscountVisualOut(BaseModel):
    master_service_id: int
    discount_percent: float
    label: str


class PublicLoyaltyVisualOut(BaseModel):
    """Подсказки для публичного UI (не заменяют preview; только активные quick-правила)."""

    happy_hours: List[PublicHappyHoursVisualOut] = []
    service_discounts: List[PublicServiceDiscountVisualOut] = []


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
    loyalty_visual: PublicLoyaltyVisualOut = Field(default_factory=PublicLoyaltyVisualOut)


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
    use_loyalty_points: bool = False


class ClientNoteOut(BaseModel):
    note_text: Optional[str] = None


class LoyaltyHintOut(BaseModel):
    """Предпросмотр лояльности без выбранной услуги (опорная дата — сегодня, полдень в TZ мастера)."""

    active: bool = False
    condition_type: Optional[str] = None
    discount_percent: Optional[float] = None
    rule_name: Optional[str] = None


class EligibilityOut(BaseModel):
    booking_blocked: bool = False
    requires_advance_payment: bool = False
    points: Optional[int] = None
    loyalty_hint: Optional[LoyaltyHintOut] = None
    points_payment_available: bool = False
    loyalty_program_enabled: bool = False


class BookingPricePreviewOut(BaseModel):
    base_price: float
    discount_percent: Optional[float] = None
    discount_amount: float = 0.0
    discounted_price: float = Field(..., description="После скидки, до баллов")
    final_price: float = Field(..., description="К оплате деньгами (после баллов), обратная совместимость")
    amount_to_pay: float = Field(..., description="Дублирует final_price")
    rule_name: Optional[str] = None
    condition_type: Optional[str] = None
    use_loyalty_points: bool = False
    points_payment_available: bool = False
    available_points: int = 0
    max_payment_percent: Optional[int] = None
    loyalty_points_to_use: int = 0
    loyalty_program_enabled: bool = Field(
        False, description="Начисление новых баллов включено (is_enabled в настройках)"
    )


def _get_master_by_slug(db: Session, slug: str) -> Optional[Master]:
    """Resolve slug (masters.domain) to Master. Master-only, case-insensitive."""
    return get_master_by_domain_slug(db, slug)


def _reference_preview_start_utc(db: Session, master_id: int) -> datetime:
    """Опорный момент для предпросмотра правил, завязанных на дату визита (без выбранной услуги)."""
    local_now = get_master_local_now(master_id, db)
    noon_local = datetime.combine(local_now.date(), time(12, 0))
    return _master_local_to_utc(noon_local, master_id, db)


def _loyalty_hint_for_eligibility(db: Session, master_id: int, user: User) -> LoyaltyHintOut:
    if getattr(user, "role", None) != UserRole.CLIENT or not user.id:
        return LoyaltyHintOut(active=False)
    try:
        preview_start = _reference_preview_start_utc(db, master_id)
        _, best = evaluate_discount_candidates(
            master_id=master_id,
            client_id=user.id,
            client_phone=user.phone or "",
            booking_payload={
                "start_time": preview_start,
                "service_id": None,
                "category_id": None,
                "service_price": None,
            },
            db=db,
        )
        if not best:
            return LoyaltyHintOut(active=False)
        pct = best.get("discount_percent")
        return LoyaltyHintOut(
            active=True,
            condition_type=best.get("condition_type"),
            discount_percent=float(pct) if pct is not None else None,
            rule_name=_sanitize_public_loyalty_rule_name(best.get("name")),
        )
    except Exception:
        return LoyaltyHintOut(active=False)


def _resolve_canonical_service_for_master_service(
    db: Session, master: Master, master_svc: MasterService
) -> Service:
    """Тот же резолв Service, что при создании публичной записи."""
    service = (
        db.query(Service)
        .filter(
            Service.salon_id.is_(None),
            Service.indie_master_id.is_(None),
            Service.name == master_svc.name,
            Service.duration == master_svc.duration,
            Service.price == master_svc.price,
        )
        .first()
    )
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
    return service


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

    raw_hints = build_public_loyalty_visual_hints(db, master)
    loyalty_visual = PublicLoyaltyVisualOut(
        happy_hours=[PublicHappyHoursVisualOut(**h) for h in raw_hints.get("happy_hours") or []],
        service_discounts=[
            PublicServiceDiscountVisualOut(**x) for x in raw_hints.get("service_discounts") or []
        ],
    )

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
        yandex_maps_url=build_yandex_maps_url(city=master.city, address=master.address),
        services=service_list,
        requires_advance_payment=requires_advance,
        booking_blocked=False,
        loyalty_visual=loyalty_visual,
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

    service = _resolve_canonical_service_for_master_service(db, master, master_svc)

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
    loyalty_points_used = compute_public_create_loyalty_points_used(
        db,
        master_id=master.id,
        client_id=current_user.id,
        discounted_price=float(payment_amount),
        use_loyalty_points=bool(body.use_loyalty_points),
    )

    booking_data = {
        "service_id": service.id,
        "master_id": master.id,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "client_id": current_user.id,
        "status": BookingStatus.CREATED.value,
        "payment_amount": payment_amount,
        "loyalty_points_used": loyalty_points_used,
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
    disc_amt = float(applied_discount_data.get("discount_amount") or 0) if applied_discount_data else 0.0
    disc_pct = applied_discount_data.get("discount_percent") if applied_discount_data else None
    money_to_pay = max(0.0, float(payment_amount) - float(loyalty_points_used))
    return PublicBookingCreateOut(
        id=booking.id,
        status=status_val,
        public_reference=booking.public_reference or "",
        start_time=body.start_time,
        end_time=body.end_time,
        service_name=master_svc.name,
        base_price=base_price,
        discount_percent=float(disc_pct) if disc_pct is not None else None,
        discount_amount=disc_amt,
        discounted_price=float(payment_amount),
        loyalty_points_used=int(loyalty_points_used),
        final_price=money_to_pay,
        rule_name=_sanitize_public_loyalty_rule_name(
            applied_discount_data.get("rule_name") if applied_discount_data else None
        ),
        condition_type=applied_discount_data.get("condition_type") if applied_discount_data else None,
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

    if current_user and current_user.role == UserRole.CLIENT and current_user.id:
        restriction = check_client_restrictions(
            db, master.id, current_user.id, current_user.phone or ""
        )
        result.booking_blocked = restriction.get("is_blocked", False)
        if restriction.get("requires_advance_payment"):
            result.requires_advance_payment = True
        try:
            eff = effective_available_points(db, master_id=master.id, client_id=current_user.id)
            result.points = eff
            result.points_payment_available = eff > 0
        except Exception:
            result.points = 0
            result.points_payment_available = False
        ls = get_loyalty_settings(db, master.id)
        result.loyalty_program_enabled = bool(ls and ls.is_enabled)
        result.loyalty_hint = _loyalty_hint_for_eligibility(db, master.id, current_user)
    return result


@router.get(
    "/{slug}/booking-price-preview",
    response_model=BookingPricePreviewOut,
    summary="Предпросмотр цены и скидки для публичной записи",
    responses={404: {"description": "Мастер или услуга не найдены"}},
)
def get_booking_price_preview(
    slug: str,
    service_id: int = Query(..., description="ID MasterService из профиля"),
    start_time: datetime = Query(..., description="Начало выбранного слота (ISO)"),
    use_loyalty_points: bool = Query(False, description="Учитывать списание баллов (только для авторизованного клиента)"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Any:
    """
    Расчёт скидки как при создании записи: без токена — только правила, не требующие клиента
    (например service_discount, happy_hours); персональные / первая запись — при наличии клиента в токене.
    """
    master = _get_master_by_slug(db, slug)
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    _ensure_master_timezone(master)

    master_svc = db.query(MasterService).filter(
        MasterService.id == service_id,
        MasterService.master_id == master.id,
    ).first()
    if not master_svc:
        raise HTTPException(status_code=404, detail="Услуга не найдена у этого мастера")

    service = _resolve_canonical_service_for_master_service(db, master, master_svc)
    base_price = float(service.price or 0)

    client_id: Optional[int] = None
    client_phone: Optional[str] = None
    if current_user and current_user.role == UserRole.CLIENT and current_user.id:
        client_id = current_user.id
        client_phone = current_user.phone or ""

    try:
        discounted_amount, applied = evaluate_and_prepare_applied_discount(
            master_id=master.id,
            client_id=client_id,
            client_phone=client_phone,
            booking_start=start_time,
            service_id=service.id,
            db=db,
        )
    except Exception:
        logger.exception(
            "booking-price-preview failed slug=%s master_id=%s client_id=%s phone=%r "
            "master_service_id=%s canonical_service_id=%s start_time=%r",
            slug,
            master.id,
            client_id,
            ((current_user.phone or "")[:32] if current_user else None),
            service_id,
            service.id,
            start_time,
        )
        raise
    if not applied or discounted_amount is None:
        disc_amt = 0.0
        disc_pct = None
        discounted_price = base_price
        rule_name = None
        condition_type = None
    else:
        disc_amt = float(applied.get("discount_amount") or 0)
        disc_pct = applied.get("discount_percent")
        discounted_price = float(discounted_amount)
        rule_name = _sanitize_public_loyalty_rule_name(applied.get("rule_name"))
        condition_type = applied.get("condition_type")

    loyalty = build_public_booking_price_preview_loyalty(
        db,
        master_id=master.id,
        client_id=client_id,
        discounted_price=discounted_price,
        use_loyalty_points=use_loyalty_points,
    )
    money = float(loyalty["amount_to_pay"])
    return BookingPricePreviewOut(
        base_price=base_price,
        discount_percent=float(disc_pct) if disc_pct is not None else None,
        discount_amount=disc_amt,
        discounted_price=discounted_price,
        final_price=money,
        amount_to_pay=money,
        rule_name=rule_name,
        condition_type=condition_type,
        use_loyalty_points=bool(loyalty.get("use_loyalty_points")),
        points_payment_available=bool(loyalty.get("points_payment_available")),
        available_points=int(loyalty.get("available_points") or 0),
        max_payment_percent=loyalty.get("max_payment_percent"),
        loyalty_points_to_use=int(loyalty.get("loyalty_points_to_use") or 0),
        loyalty_program_enabled=bool(loyalty.get("loyalty_program_enabled")),
    )

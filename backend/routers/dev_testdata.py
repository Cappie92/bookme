"""
Dev-only API для пересоздания тестовых данных (подписка/баланс без Robokassa).

Доступно ТОЛЬКО при ENVIRONMENT=development и только для ADMIN.
Роутер подключается в main.py только если ENVIRONMENT=development.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from auth import get_current_active_user, require_admin
from constants import duration_months_to_days
from database import get_db
from models import (
    User,
    UserRole,
    Master,
    IndieMaster,
    BookingStatus,
    Salon,
    UserBalance,
    BalanceTransaction,
    Subscription,
    SubscriptionReservation,
    SubscriptionPlan,
    SubscriptionType,
    SubscriptionStatus,
    Booking,
    BookingConfirmation,
    MasterExpense,
    TemporaryBooking,
    BookingEditRequest,
    AppliedDiscount,
    MasterSchedule,
    MasterScheduleSettings,
    MasterService,
    MasterServiceCategory,
    OwnerType,
    Income,
    MissedRevenue,
    LoyaltyTransaction,
)
from utils.balance_utils import (
    deposit_balance,
    get_or_create_user_balance,
    get_user_available_balance,
    withdraw_balance,
)

router = APIRouter(prefix="/dev/testdata", tags=["dev-testdata"])

ADMIN_PHONE = "+79031078685"


def _is_dev() -> bool:
    from settings import get_settings
    s = get_settings()
    env_ok = s.is_development
    flag_ok = s.enable_dev_testdata
    return env_ok and flag_ok


def _ensure_dev_and_admin(
    current_user: User = Depends(require_admin),
) -> User:
    if not _is_dev():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not available outside development",
        )
    return current_user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SetBalanceRequest(BaseModel):
    user_id: Optional[int] = Field(None, description="ID пользователя")
    phone: Optional[str] = Field(None, description="Телефон пользователя")
    balance_rub: float = Field(..., ge=0, description="Целевой баланс в рублях")

    class Config:
        extra = "forbid"


class SetSubscriptionRequest(BaseModel):
    user_id: Optional[int] = Field(None, description="ID пользователя")
    phone: Optional[str] = Field(None, description="Телефон пользователя")
    plan_id: int = Field(..., description="ID плана подписки")
    duration_months: int = Field(..., ge=1, le=12, description="1, 3, 6 или 12 месяцев")
    start_date: Optional[str] = Field(None, description="Дата начала YYYY-MM-DD (по умолчанию сегодня)")

    class Config:
        extra = "forbid"


class CreateServiceAndLinkMasterRequest(BaseModel):
    master_id: int = Field(..., description="ID мастера")
    name: str = Field(..., description="Название услуги")
    duration: int = Field(..., ge=1, description="Длительность в минутах")
    price: float = Field(..., ge=0, description="Цена")
    description: Optional[str] = None

    class Config:
        extra = "forbid"


class EnsureIndieMasterRequest(BaseModel):
    master_id: int = Field(..., description="ID мастера (masters.id)")

    class Config:
        extra = "forbid"


class CreateIndieServiceRequest(BaseModel):
    indie_master_id: int = Field(..., description="ID IndieMaster")
    name: str = Field(..., description="Название услуги")
    duration: int = Field(..., ge=1, description="Длительность в минутах")
    price: float = Field(..., ge=0, description="Цена")

    class Config:
        extra = "forbid"


class CompletedBookingItem(BaseModel):
    client_phone: str = Field(..., description="Телефон клиента")
    service_id: int = Field(..., description="ID услуги (salon или indie)")
    days_ago: Optional[int] = Field(
        None,
        ge=1,
        le=4000,
        description="Дней назад (start_time); взаимоисключимо с on_date / days_ahead",
    )
    on_date: Optional[str] = Field(
        None,
        description="Календарная дата start_time YYYY-MM-DD (UTC-naive); вместо days_ago для фиксированных периодов",
    )
    days_ahead: Optional[int] = Field(
        None,
        ge=0,
        le=400,
        description="Дней вперёд от «сейчас» (UTC) для будущих броней; взаимоисключимо с days_ago и on_date",
    )
    hour: int = Field(10, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    status: str = Field(
        "completed",
        pattern=(
            "^(completed|cancelled|cancelled_by_client_early|cancelled_by_client_late|"
            "awaiting_confirmation|created|confirmed)$"
        ),
    )
    cancellation_reason: Optional[str] = Field(None, pattern="^(client_requested|client_no_show|mutual_agreement|master_unavailable)$")
    payment_amount: Optional[float] = Field(None, ge=0)
    is_indie: bool = Field(False, description="True = indie-запись (indie_master_id, salon_id=NULL)")
    notes: Optional[str] = Field(None, description="Текст в bookings.notes (QA trace)")

    @model_validator(mode="after")
    def _one_time_anchor(self) -> "CompletedBookingItem":
        n = sum(
            1
            for x in (self.on_date, self.days_ago, self.days_ahead)
            if x is not None
        )
        if n != 1:
            raise ValueError("Укажите ровно одно из: days_ago, on_date, days_ahead")
        if self.on_date is not None:
            from datetime import date as date_cls

            date_cls.fromisoformat(self.on_date)
        return self

    class Config:
        extra = "forbid"


class CreateCompletedBookingsRequest(BaseModel):
    master_id: int = Field(..., description="ID мастера")
    bookings: list[CompletedBookingItem] = Field(..., min_length=1)

    class Config:
        extra = "forbid"


class DeleteSmokeTraceBookingsRequest(BaseModel):
    """Удалить брони мастера только для указанных телефонов (идемпотентный smoke-layer)."""

    master_id: int = Field(..., description="ID мастера (masters.id)")
    client_phones: list[str] = Field(..., min_length=1)

    class Config:
        extra = "forbid"


class SeedExpenseItem(BaseModel):
    name: str = Field(..., min_length=1)
    expense_type: str = Field("one_time", pattern="^(one_time|recurring|service_based)$")
    amount: float = Field(..., ge=0)
    expense_date: str = Field(..., description="YYYY-MM-DD")

    class Config:
        extra = "forbid"


class CreateMasterExpensesRequest(BaseModel):
    master_id: int = Field(..., description="ID мастера (masters.id)")
    expenses: list[SeedExpenseItem] = Field(..., min_length=1)

    class Config:
        extra = "forbid"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_SALON_PHONE = "+79990009999"
TEST_SALON_PASSWORD = "test_salon_dev"


def _resolve_user(db: Session, user_id: Optional[int], phone: Optional[str]) -> User:
    if user_id is not None:
        u = db.query(User).filter(User.id == user_id).first()
    elif phone:
        u = db.query(User).filter(User.phone == phone).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide user_id or phone",
        )
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return u


def _get_monthly_price(plan: SubscriptionPlan, duration_months: int) -> float:
    if duration_months == 1:
        return float(plan.price_1month or 0)
    if duration_months == 3:
        return float(plan.price_3months or 0)
    if duration_months == 6:
        return float(plan.price_6months or 0)
    return float(plan.price_12months or 0)


def _plan_total_price(plan: SubscriptionPlan, duration_months: int) -> float:
    import math
    monthly = _get_monthly_price(plan, duration_months)
    return math.ceil(monthly) * duration_months


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/set_balance")
def set_balance(
    body: SetBalanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Установить баланс пользователя (только dev, только admin).
    Использует deposit_balance / withdraw_balance (add_balance_transaction).
    """
    user = _resolve_user(db, body.user_id, body.phone)
    ub = get_or_create_user_balance(db, user.id)
    current = ub.balance
    delta = body.balance_rub - current

    if abs(delta) < 1e-6:
        return {
            "success": True,
            "user_id": user.id,
            "phone": user.phone,
            "balance_rub": body.balance_rub,
            "message": "Already at target balance",
        }

    if delta > 0:
        deposit_balance(
            db,
            user.id,
            delta,
            description="[dev] Test data: set balance",
        )
    else:
        available = get_user_available_balance(db, user.id)
        if available < abs(delta):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient balance: available={available}, need to withdraw={abs(delta)}",
            )
        withdraw_balance(
            db,
            user.id,
            abs(delta),
            description="[dev] Test data: set balance",
        )

    ub = get_or_create_user_balance(db, user.id)
    return {
        "success": True,
        "user_id": user.id,
        "phone": user.phone,
        "balance_rub": float(ub.balance),
    }


@router.post("/set_subscription")
def set_subscription(
    body: SetSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Создать/обновить подписку пользователя (только dev, только admin).
    daily_rate = total_price / duration_days (30/90/180/360).
    Логика как в apply-upgrade-free, без snapshot.
    """
    if body.duration_months not in (1, 3, 6, 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="duration_months must be 1, 3, 6 or 12",
        )

    user = _resolve_user(db, body.user_id, body.phone)
    plan = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.id == body.plan_id,
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
            SubscriptionPlan.is_active == True,
        )
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    import math
    duration_days = duration_months_to_days(body.duration_months)
    total_price = _plan_total_price(plan, body.duration_months)
    daily_rate = int(math.ceil(total_price / duration_days)) if duration_days else 0

    if body.start_date:
        try:
            start_dt = datetime.strptime(body.start_date, "%Y-%m-%d").replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be YYYY-MM-DD",
            )
    else:
        start_dt = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    end_dt = start_dt + timedelta(days=duration_days)

    existing = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.subscription_type == SubscriptionType.MASTER,
        )
        .all()
    )
    for s in existing:
        s.status = SubscriptionStatus.EXPIRED
        s.is_active = False

    new_sub = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        plan_id=plan.id,
        start_date=start_dt,
        end_date=end_dt,
        price=total_price,
        daily_rate=daily_rate,
        is_active=True,
        auto_renewal=False,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0,
    )
    db.add(new_sub)
    db.flush()

    res = SubscriptionReservation(
        user_id=user.id,
        subscription_id=new_sub.id,
        reserved_amount=0.0,
    )
    db.add(res)
    db.commit()
    db.refresh(new_sub)

    return {
        "success": True,
        "user_id": user.id,
        "phone": user.phone,
        "subscription_id": new_sub.id,
        "plan_id": plan.id,
        "plan_name": plan.name,
        "duration_months": body.duration_months,
        "duration_days": duration_days,
        "total_price": total_price,
        "daily_rate": daily_rate,
        "start_date": start_dt.isoformat(),
        "end_date": end_dt.isoformat(),
    }


@router.post("/ensure_test_salon")
def ensure_test_salon(
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Создать тестовый салон (User+Salon+Branch+ServiceCategory) для reseed, если ещё нет.
    Idempotent. Возвращает salon_id, category_id.
    """
    from auth import get_password_hash
    from models import Service, ServiceCategory, SalonBranch
    from models import salon_masters

    su = db.query(User).filter(User.phone == TEST_SALON_PHONE).first()
    if su:
        salon = db.query(Salon).filter(Salon.user_id == su.id).first()
        if not salon:
            raise HTTPException(status_code=500, detail="Test salon user exists but no Salon")
        branch = db.query(SalonBranch).filter(SalonBranch.salon_id == salon.id).first()
        cat = db.query(ServiceCategory).filter(ServiceCategory.salon_id == salon.id).first()
        return {
            "success": True,
            "salon_id": salon.id,
            "user_id": su.id,
            "branch_id": branch.id if branch else None,
            "category_id": cat.id if cat else None,
        }

    su = User(
        phone=TEST_SALON_PHONE,
        email=f"{TEST_SALON_PHONE}@test.local",
        role=UserRole.SALON,
        is_active=True,
        hashed_password=get_password_hash(TEST_SALON_PASSWORD),
        full_name="Тестовый салон",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(su)
    db.flush()

    salon = Salon(
        user_id=su.id,
        name="Тестовый салон (reseed)",
        city="Москва",
        timezone="Europe/Moscow",
        is_active=True,
    )
    db.add(salon)
    db.flush()

    branch = SalonBranch(salon_id=salon.id, name="Основной")
    db.add(branch)
    db.flush()

    cat = ServiceCategory(salon_id=salon.id, name="Услуги")
    db.add(cat)
    db.flush()

    db.commit()
    db.refresh(salon)
    db.refresh(cat)
    return {
        "success": True,
        "salon_id": salon.id,
        "user_id": su.id,
        "branch_id": branch.id,
        "category_id": cat.id,
    }


@router.post("/create_service_and_link_master")
def create_service_and_link_master(
    body: CreateServiceAndLinkMasterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Создать Service в тестовом салоне, привязать мастер к салону и к услуге.
    Сначала вызвать ensure_test_salon.
    """
    from sqlalchemy import select, insert
    from models import Service, ServiceCategory
    from models import salon_masters, master_services

    master = db.query(Master).filter(Master.id == body.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")

    su = db.query(User).filter(User.phone == TEST_SALON_PHONE).first()
    if not su:
        raise HTTPException(status_code=400, detail="Run ensure_test_salon first")
    salon = db.query(Salon).filter(Salon.user_id == su.id).first()
    if not salon:
        raise HTTPException(status_code=400, detail="Test salon not found")
    cat = db.query(ServiceCategory).filter(ServiceCategory.salon_id == salon.id).first()
    if not cat:
        raise HTTPException(status_code=400, detail="Test salon category not found")

    svc = Service(
        name=body.name,
        description=body.description or "",
        duration=body.duration,
        price=body.price,
        salon_id=salon.id,
        category_id=cat.id,
    )
    db.add(svc)
    db.flush()

    r = db.execute(
        select(salon_masters).where(
            (salon_masters.c.salon_id == salon.id) & (salon_masters.c.master_id == master.id)
        )
    ).first()
    if not r:
        db.execute(
            insert(salon_masters).values(salon_id=salon.id, master_id=master.id)
        )

    r2 = db.execute(
        select(master_services).where(
            (master_services.c.master_id == master.id) & (master_services.c.service_id == svc.id)
        )
    ).first()
    if not r2:
        db.execute(
            insert(master_services).values(master_id=master.id, service_id=svc.id)
        )

    db.commit()
    db.refresh(svc)
    return {"success": True, "service_id": svc.id, "master_id": master.id}


@router.post("/ensure_indie_master")
def ensure_indie_master(
    body: EnsureIndieMasterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Создать IndieMaster (alias/bridge) для мастера, если нет.
    MASTER_CANON: indie_masters.master_id NOT NULL, UNIQUE — обязательно проставляем master_id.
    """
    from datetime import time
    from models import IndieMasterSchedule

    master = db.query(Master).filter(Master.id == body.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")

    # Ищем по master_id (1:1) или по user_id (legacy lookup)
    indie = db.query(IndieMaster).filter(IndieMaster.master_id == master.id).first()
    if not indie:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
    if indie:
        if indie.master_id != master.id:
            indie.master_id = master.id
            db.commit()
        master.can_work_independently = True
        db.commit()
        return {"success": True, "indie_master_id": indie.id, "master_id": master.id, "created": False}

    domain_base = f"master-{master.id}-{master.user_id}"
    existing = db.query(IndieMaster).filter(IndieMaster.domain.like(f"{domain_base}%")).count()
    domain = f"{domain_base}" if existing == 0 else f"{domain_base}-{existing}"

    indie = IndieMaster(
        user_id=master.user_id,
        master_id=master.id,
        bio="",
        experience_years=master.experience_years or 0,
        domain=domain,
        address=master.address,
        city=master.city or "Москва",
        timezone=master.timezone or "Europe/Moscow",
        payment_on_visit=True,
        payment_advance=False,
    )
    db.add(indie)
    db.flush()

    master.can_work_independently = True
    if not master.domain:
        master.domain = domain

    for day in (2, 4, 6):
        base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        start_dt = base.replace(hour=10, minute=0)
        end_dt = base.replace(hour=18, minute=0)
        db.add(IndieMasterSchedule(
            indie_master_id=indie.id,
            day_of_week=day,
            start_time=start_dt,
            end_time=end_dt,
            is_available=True,
        ))
    db.commit()
    db.refresh(indie)
    return {"success": True, "indie_master_id": indie.id, "master_id": master.id, "created": True}


@router.post("/create_indie_service")
def create_indie_service(
    body: CreateIndieServiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """Создать indie-услугу (Service.salon_id=NULL, indie_master_id set)."""
    from models import Service
    from utils.master_canon import LEGACY_INDIE_MODE

    if not LEGACY_INDIE_MODE:
        raise HTTPException(
            status_code=400,
            detail="Indie services disabled in master-only MVP. Use master services.",
        )

    indie = db.query(IndieMaster).filter(IndieMaster.id == body.indie_master_id).first()
    if not indie:
        raise HTTPException(status_code=404, detail="IndieMaster not found")

    svc = Service(
        name=body.name,
        description="",
        duration=body.duration,
        price=body.price,
        salon_id=None,
        indie_master_id=indie.id,
        category_id=None,
    )
    db.add(svc)
    db.flush()
    db.commit()
    db.refresh(svc)
    return {"success": True, "service_id": svc.id, "indie_master_id": indie.id}


@router.post("/create_completed_bookings")
def create_completed_bookings_bulk(
    body: CreateCompletedBookingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Создать прошедшие бронирования (COMPLETED или CANCELLED) для тестирования модуля «Клиенты».
    Клиент (User) создаётся по client_phone, если не существует.
    """
    from auth import get_password_hash
    from datetime import date as date_cls
    from models import Service, BookingStatus

    master = db.query(Master).filter(Master.id == body.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")

    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
    indie_master_id = indie.id if indie else None

    created = 0
    created_with_salon = 0
    created_with_indie = 0
    now = datetime.utcnow()

    for item in body.bookings:
        client = db.query(User).filter(User.phone == item.client_phone).first()
        if not client:
            client = User(
                phone=item.client_phone,
                email=f"{item.client_phone}@client.test",
                role=UserRole.CLIENT,
                is_active=True,
                is_verified=True,
                is_phone_verified=True,
                hashed_password=get_password_hash("test123"),
                full_name=f"Клиент {item.client_phone}",
            )
            db.add(client)
            db.flush()

        svc = db.query(Service).filter(Service.id == item.service_id).first()
        if not svc:
            continue
        is_indie_item = getattr(item, "is_indie", False)
        if is_indie_item:
            if not indie_master_id or svc.indie_master_id != indie_master_id:
                continue
        else:
            if svc.salon_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Salon booking requires service.salon_id; use is_indie=True for indie services",
                )

        if item.on_date is not None:
            od = date_cls.fromisoformat(item.on_date)
            start_dt = datetime(od.year, od.month, od.day, item.hour, item.minute, 0, 0)
        elif item.days_ahead is not None:
            base = now + timedelta(days=item.days_ahead)
            start_dt = base.replace(hour=item.hour, minute=item.minute, second=0, microsecond=0)
        else:
            start_dt = now - timedelta(days=item.days_ago or 0)
            start_dt = start_dt.replace(hour=item.hour, minute=item.minute, second=0, microsecond=0)
            if start_dt > now:
                start_dt = start_dt - timedelta(days=1)
        duration = svc.duration or 60
        end_dt = start_dt + timedelta(minutes=duration)

        # Не создаём completed в будущем — иначе ломается продуктовая модель и future-списки.
        if item.status == "completed" and start_dt > now:
            start_dt = now - timedelta(hours=2)
            end_dt = start_dt + timedelta(minutes=duration)

        statuses_with_price = (
            "completed",
            "awaiting_confirmation",
            "created",
            "confirmed",
        )
        payment = (
            item.payment_amount
            if item.payment_amount is not None
            else (float(svc.price or 0) if item.status in statuses_with_price else None)
        )

        status_map = {
            "completed": BookingStatus.COMPLETED.value,
            "cancelled": BookingStatus.CANCELLED.value,
            "cancelled_by_client_early": BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
            "cancelled_by_client_late": BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
            "awaiting_confirmation": BookingStatus.AWAITING_CONFIRMATION.value,
            "created": BookingStatus.CREATED.value,
            "confirmed": BookingStatus.CONFIRMED.value,
        }
        status_val = status_map.get(item.status, BookingStatus.COMPLETED.value)
        cancel_reason = None
        if item.status != "completed" and item.status.startswith("cancelled"):
            cancel_reason = item.cancellation_reason or "client_requested"

        from utils.booking_factory import normalize_booking_fields
        from utils.master_canon import LEGACY_INDIE_MODE

        if is_indie_item:
            if not LEGACY_INDIE_MODE:
                continue
            owner_type = "indie"
            owner_id = indie_master_id
        else:
            owner_type = "master" if (svc.salon_id is None) else "salon"
            owner_id = body.master_id
        base_data = {
            "client_id": client.id,
            "service_id": item.service_id,
            "start_time": start_dt,
            "end_time": end_dt,
            "status": status_val,
            "payment_amount": payment,
            "cancellation_reason": cancel_reason,
        }
        if item.notes:
            base_data["notes"] = item.notes
        norm = normalize_booking_fields(base_data, svc, owner_type, owner_id, db=db)

        b = Booking(**norm)
        db.add(b)
        db.flush()
        if status_val == BookingStatus.COMPLETED.value:
            master_user_id = master.user_id
            existing_conf = (
                db.query(BookingConfirmation)
                .filter(BookingConfirmation.booking_id == b.id)
                .first()
            )
            if not existing_conf:
                db.add(
                    BookingConfirmation(
                        booking_id=b.id,
                        master_id=master_user_id,
                        confirmed_at=start_dt,
                        confirmed_income=float(payment or 0),
                    )
                )
        created += 1
        if norm.get("salon_id"):
            created_with_salon += 1
        if norm.get("indie_master_id"):
            created_with_indie += 1

    db.commit()

    # Sanity stats для reseed
    n_completed = sum(1 for it in body.bookings if it.status == "completed")
    n_cancelled = sum(1 for it in body.bookings if str(it.status).startswith("cancelled"))
    unique_phones = len({it.client_phone for it in body.bookings})
    return {
        "success": True,
        "created": created,
        "master_id": body.master_id,
        "completed_count": n_completed,
        "cancelled_count": n_cancelled,
        "unique_clients": unique_phones,
        "master_has_indie": indie_master_id is not None,
        "created_with_salon": created_with_salon,
        "created_with_indie": created_with_indie,
    }


@router.post("/delete_smoke_trace_bookings")
def delete_smoke_trace_bookings(
    body: DeleteSmokeTraceBookingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Удалить брони мастера только для указанных телефонов клиентов (FK-safe).
    Для идемпотентного повторного прогона smoke-layer без полного reset.
    """
    master = db.query(Master).filter(Master.id == body.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")

    users = db.query(User).filter(User.phone.in_(body.client_phones)).all()
    if not users:
        return {"success": True, "deleted_bookings": 0, "master_id": body.master_id}

    uids = [u.id for u in users]
    q = db.query(Booking).filter(Booking.master_id == body.master_id, Booking.client_id.in_(uids))
    bids = [b.id for b in q.all()]
    deleted = 0
    if bids:
        db.query(BookingEditRequest).filter(BookingEditRequest.booking_id.in_(bids)).delete(
            synchronize_session=False
        )
        db.query(AppliedDiscount).filter(AppliedDiscount.booking_id.in_(bids)).delete(
            synchronize_session=False
        )
        db.query(Income).filter(Income.booking_id.in_(bids)).delete(synchronize_session=False)
        db.query(MissedRevenue).filter(MissedRevenue.booking_id.in_(bids)).delete(
            synchronize_session=False
        )
        db.query(LoyaltyTransaction).filter(LoyaltyTransaction.booking_id.in_(bids)).delete(
            synchronize_session=False
        )
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id.in_(bids)).delete(
            synchronize_session=False
        )
        deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"success": True, "deleted_bookings": deleted, "master_id": body.master_id}


@router.post("/create_master_expenses")
def create_master_expenses_bulk(
    body: CreateMasterExpensesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """Создать расходы мастера (MasterExpense.master_id = users.id) для QA финансов."""
    from datetime import date as date_cls

    master = db.query(Master).filter(Master.id == body.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    uid = master.user_id
    created_n = 0
    for e in body.expenses:
        d = date_cls.fromisoformat(e.expense_date)
        dt = datetime(d.year, d.month, d.day, 12, 0, 0, 0)
        db.add(
            MasterExpense(
                master_id=uid,
                name=e.name,
                expense_type=e.expense_type,
                amount=float(e.amount),
                expense_date=dt,
                is_active=True,
            )
        )
        created_n += 1
    db.commit()
    return {"success": True, "created": created_n, "master_id": body.master_id}


@router.get("/indie_sanity")
def indie_sanity_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """Статистика indie_masters и бронирований для sanity-check после reseed."""
    from sqlalchemy import func

    indie_count = db.query(func.count(IndieMaster.id)).scalar() or 0
    masters = db.query(Master).all()
    per_master: list[dict] = []
    for m in masters:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == m.user_id).first()
        indie_id = indie.id if indie else None
        q = db.query(Booking).filter(
            (Booking.master_id == m.id) | (Booking.indie_master_id == indie_id)
        ) if indie_id else db.query(Booking).filter(Booking.master_id == m.id)
        completed = q.filter(Booking.status == BookingStatus.COMPLETED.value).all()
        now = datetime.utcnow()
        future = q.filter(
            Booking.start_time >= now,
            Booking.status.in_([BookingStatus.CREATED.value, BookingStatus.CONFIRMED.value])
        ).all()
        user = db.query(User).filter(User.id == m.user_id).first()
        per_master.append({
            "master_id": m.id,
            "phone": user.phone if user else "",
            "indie_master_id": indie_id,
            "completed_total": len(completed),
            "completed_with_indie": sum(1 for b in completed if b.indie_master_id),
            "completed_with_salon": sum(1 for b in completed if b.salon_id),
            "future_total": len(future),
            "future_with_indie": sum(1 for b in future if b.indie_master_id),
            "future_with_salon": sum(1 for b in future if b.salon_id),
        })
    return {"indie_masters_count": indie_count, "per_master": per_master}


@router.post("/run_daily_charges")
def run_daily_charges(
    date_str: Optional[str] = Query(None, description="Дата YYYY-MM-DD (по умолчанию сегодня)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Запустить ежедневные списания вручную (только dev, только admin).
    Вызывает process_all_daily_charges через сервисную логику.
    """
    from datetime import date as date_type
    from services.daily_charges import process_all_daily_charges

    charge_date = date_type.today()
    if date_str:
        try:
            charge_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="date должен быть YYYY-MM-DD",
            )

    result = process_all_daily_charges(charge_date, db=db)

    affected_ids = result.get("affected_user_ids", [])
    affected_users: list[dict[str, Any]] = []
    for uid in affected_ids[:20]:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            affected_users.append({"user_id": uid, "phone": u.phone})

    return {
        "processed_total": result.get("total_subscriptions", 0),
        "success_count": result.get("successful_charges", 0),
        "failed_count": result.get("failed_charges", 0),
        "deactivated_count": result.get("deactivated_subscriptions", 0),
        "charge_date": result.get("date", charge_date.isoformat()),
        "affected_users": affected_users,
        "errors": result.get("errors", [])[:10],
    }


@router.post("/reset_non_admin_users")
def reset_non_admin_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(_ensure_dev_and_admin),
) -> dict[str, Any]:
    """
    Удалить всех пользователей кроме админа (+79031078685).
    Каскадное удаление в порядке FK. Не трогаем subscription_plans, service_functions.
    """
    admin = db.query(User).filter(User.phone == ADMIN_PHONE, User.role == UserRole.ADMIN).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin user +79031078685 not found",
        )
    admin_id = admin.id

    to_delete = db.query(User).filter(User.id != admin_id).all()
    user_ids = [u.id for u in to_delete]
    user_phones = [u.phone for u in to_delete if u.phone]
    if not user_ids:
        return {"success": True, "deleted_users": 0, "message": "No non-admin users to delete"}

    master_ids = [m.id for m in db.query(Master).filter(Master.user_id.in_(user_ids)).all()]
    indie_ids = [i.id for i in db.query(IndieMaster).filter(IndieMaster.user_id.in_(user_ids)).all()]
    salon_ids = [s.id for s in db.query(Salon).filter(Salon.user_id.in_(user_ids)).all()]

    from sqlalchemy import delete
    from models import (
        DailySubscriptionCharge,
        SubscriptionPriceSnapshot,
        SubscriptionFreeze,
        Payment,
        ClientRestriction,
        ClientRestrictionRule,
        LoyaltyDiscount,
        PersonalDiscount,
        LoyaltySettings,
        LoyaltyTransaction,
        MasterPaymentSettings,
        ClientMasterNote,
        ClientSalonNote,
        Service,
        ServiceCategory,
        SalonBranch,
        ClientNote,
        ClientFavorite,
        AvailabilitySlot,
        SalonMasterInvitation,
        IndieMasterSchedule,
    )
    from models import salon_masters

    try:
        _delete_booking_edit_requests_for_users(db, user_ids, master_ids, indie_ids, salon_ids)
        _delete_applied_discounts_for_users(db, user_ids, master_ids, indie_ids, salon_ids)
        _delete_bookings_for_users(db, user_ids, master_ids, indie_ids, salon_ids)
        _delete_temporary_bookings_for_users(db, user_ids, master_ids)

        if master_ids:
            db.query(MasterSchedule).filter(MasterSchedule.master_id.in_(master_ids)).delete(synchronize_session=False)
            db.query(MasterScheduleSettings).filter(MasterScheduleSettings.master_id.in_(master_ids)).delete(
                synchronize_session=False
            )
            db.query(MasterService).filter(MasterService.master_id.in_(master_ids)).delete(synchronize_session=False)
            db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id.in_(master_ids)).delete(
                synchronize_session=False
            )

        sub_ids = [s.id for s in db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()]
        if sub_ids:
            db.query(DailySubscriptionCharge).filter(
                DailySubscriptionCharge.subscription_id.in_(sub_ids)
            ).delete(synchronize_session=False)
            db.query(SubscriptionFreeze).filter(SubscriptionFreeze.subscription_id.in_(sub_ids)).delete(
                synchronize_session=False
            )
        db.query(SubscriptionReservation).filter(SubscriptionReservation.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(SubscriptionPriceSnapshot).filter(SubscriptionPriceSnapshot.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(Payment).filter(Payment.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(BalanceTransaction).filter(BalanceTransaction.user_id.in_(user_ids)).delete(
            synchronize_session=False
        )
        db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(UserBalance).filter(UserBalance.user_id.in_(user_ids)).delete(synchronize_session=False)

        for mid in master_ids:
            db.query(ClientRestrictionRule).filter(ClientRestrictionRule.master_id == mid).delete(
                synchronize_session=False
            )
            db.query(LoyaltyDiscount).filter(LoyaltyDiscount.master_id == mid).delete(synchronize_session=False)
            db.query(PersonalDiscount).filter(PersonalDiscount.master_id == mid).delete(synchronize_session=False)
            db.query(LoyaltyTransaction).filter(LoyaltyTransaction.master_id == mid).delete(synchronize_session=False)
            db.query(MasterPaymentSettings).filter(MasterPaymentSettings.master_id == mid).delete(
                synchronize_session=False
            )
            db.query(ClientMasterNote).filter(ClientMasterNote.master_id == mid).delete(synchronize_session=False)

        for sid in salon_ids:
            db.query(ClientSalonNote).filter(ClientSalonNote.salon_id == sid).delete(synchronize_session=False)

        for sid in salon_ids:
            db.query(ClientRestriction).filter(ClientRestriction.salon_id == sid).delete(
                synchronize_session=False
            )
        for iid in indie_ids:
            db.query(ClientRestriction).filter(ClientRestriction.indie_master_id == iid).delete(
                synchronize_session=False
            )
        if user_phones:
            db.query(ClientNote).filter(ClientNote.client_phone.in_(user_phones)).delete(
                synchronize_session=False
            )
        db.query(ClientFavorite).filter(ClientFavorite.client_id.in_(user_ids)).delete(synchronize_session=False)

        db.query(Master).filter(Master.user_id.in_(user_ids)).delete(synchronize_session=False)
        if indie_ids:
            db.query(IndieMasterSchedule).filter(
                IndieMasterSchedule.indie_master_id.in_(indie_ids)
            ).delete(synchronize_session=False)
        db.query(IndieMaster).filter(IndieMaster.user_id.in_(user_ids)).delete(synchronize_session=False)

        for sid in salon_ids:
            db.query(Service).filter(Service.salon_id == sid).delete(synchronize_session=False)
            db.query(ServiceCategory).filter(ServiceCategory.salon_id == sid).delete(synchronize_session=False)
            for b in db.query(SalonBranch).filter(SalonBranch.salon_id == sid).all():
                db.query(MasterSchedule).filter(MasterSchedule.branch_id == b.id).delete(synchronize_session=False)
            db.query(SalonBranch).filter(SalonBranch.salon_id == sid).delete(synchronize_session=False)
            db.execute(delete(salon_masters).where(salon_masters.c.salon_id == sid))
        db.query(Salon).filter(Salon.user_id.in_(user_ids)).delete(synchronize_session=False)

        for iid in indie_ids:
            db.query(Service).filter(Service.indie_master_id == iid).delete(synchronize_session=False)

        for oid in master_ids:
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.MASTER,
                AvailabilitySlot.owner_id == oid,
            ).delete(synchronize_session=False)
        for oid in salon_ids:
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.SALON,
                AvailabilitySlot.owner_id == oid,
            ).delete(synchronize_session=False)
        for oid in indie_ids:
            db.query(AvailabilitySlot).filter(
                AvailabilitySlot.owner_type == OwnerType.INDIE_MASTER,
                AvailabilitySlot.owner_id == oid,
            ).delete(synchronize_session=False)

        if master_ids:
            db.query(SalonMasterInvitation).filter(SalonMasterInvitation.master_id.in_(master_ids)).delete(
                synchronize_session=False
            )
            db.query(LoyaltySettings).filter(LoyaltySettings.master_id.in_(master_ids)).delete(
                synchronize_session=False
            )

        deleted = db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
        db.commit()
        return {"success": True, "deleted_users": deleted}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reset failed: {e!s}",
        )


def _booking_ids_for_users(
    db: Session,
    user_ids: list[int],
    master_ids: list[int],
    indie_ids: list[int],
    salon_ids: list[int],
) -> list[int]:
    from sqlalchemy import or_
    cond = [Booking.client_id.in_(user_ids)]
    if master_ids:
        cond.append(Booking.master_id.in_(master_ids))
    if indie_ids:
        cond.append(Booking.indie_master_id.in_(indie_ids))
    if salon_ids:
        cond.append(Booking.salon_id.in_(salon_ids))
    rows = db.query(Booking.id).filter(or_(*cond)).all()
    return [r[0] for r in rows]


def _delete_booking_edit_requests_for_users(
    db: Session,
    user_ids: list[int],
    master_ids: list[int],
    indie_ids: list[int],
    salon_ids: list[int],
):
    bid_list = _booking_ids_for_users(db, user_ids, master_ids, indie_ids, salon_ids)
    if not bid_list:
        return
    db.query(BookingEditRequest).filter(BookingEditRequest.booking_id.in_(bid_list)).delete(
        synchronize_session=False
    )


def _delete_applied_discounts_for_users(
    db: Session,
    user_ids: list[int],
    master_ids: list[int],
    indie_ids: list[int],
    salon_ids: list[int],
):
    bid_list = _booking_ids_for_users(db, user_ids, master_ids, indie_ids, salon_ids)
    if not bid_list:
        return
    db.query(AppliedDiscount).filter(AppliedDiscount.booking_id.in_(bid_list)).delete(
        synchronize_session=False
    )


def _delete_bookings_for_users(
    db: Session,
    user_ids: list[int],
    master_ids: list[int],
    indie_ids: list[int],
    salon_ids: list[int],
) -> None:
    from sqlalchemy import or_
    from models import Income, MissedRevenue, BookingConfirmation
    cond = [Booking.client_id.in_(user_ids)]
    if master_ids:
        cond.append(Booking.master_id.in_(master_ids))
    if indie_ids:
        cond.append(Booking.indie_master_id.in_(indie_ids))
    if salon_ids:
        cond.append(Booking.salon_id.in_(salon_ids))
    q = db.query(Booking).filter(or_(*cond))
    bid_list = [b.id for b in q.all()]
    if bid_list:
        db.query(Income).filter(Income.booking_id.in_(bid_list)).delete(synchronize_session=False)
        db.query(MissedRevenue).filter(MissedRevenue.booking_id.in_(bid_list)).delete(synchronize_session=False)
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id.in_(bid_list)).delete(
            synchronize_session=False
        )
    q.delete(synchronize_session=False)


def _delete_temporary_bookings_for_users(
    db: Session,
    user_ids: list[int],
    master_ids: list[int],
) -> None:
    from sqlalchemy import or_
    cond = [TemporaryBooking.client_id.in_(user_ids)]
    if master_ids:
        cond.append(TemporaryBooking.master_id.in_(master_ids))
    db.query(TemporaryBooking).filter(or_(*cond)).delete(synchronize_session=False)

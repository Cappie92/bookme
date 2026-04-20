from __future__ import annotations

from datetime import date, datetime, timedelta, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    AppliedDiscount,
    Booking,
    BookingConfirmation,
    BookingEditRequest,
    BookingStatus,
    ClientRestriction,
    ClientRestrictionRule,
    Income,
    LoyaltyTransaction,
    Master,
    MasterExpense,
    MasterSchedule,
    MasterService,
    MasterServiceCategory,
    MissedRevenue,
    Service,
    User,
    UserRole,
    master_services,
)
from settings import get_settings


def _canonical_demo_domain(user_id: int) -> str:
    return f"demo-master-{user_id}"


def _pick_unique_demo_domain(db: Session, user_id: int) -> str:
    """Детерминированно подобрать уникальный домен для demo master (без INSERT)."""
    for n in range(0, 64):
        candidate = _canonical_demo_domain(user_id) if n == 0 else f"demo-master-{user_id}-{n}"
        taken = db.query(Master.id).filter(Master.domain == candidate).first()
        if not taken:
            return candidate
    raise RuntimeError("Could not allocate a unique demo master domain")


def _ensure_demo_master_user(db: Session) -> tuple[User, Master]:
    s = get_settings()
    user = db.query(User).filter(User.phone == s.DEMO_MASTER_PHONE).first()
    if not user:
        user = User(
            phone=s.DEMO_MASTER_PHONE,
            email=s.DEMO_MASTER_EMAIL,
            full_name=s.DEMO_MASTER_NAME,
            role=UserRole.MASTER,
            hashed_password=get_password_hash("demo_disabled_login"),
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
            is_always_free=True,
        )
        db.add(user)
        db.flush()
    else:
        user.role = UserRole.MASTER
        user.is_active = True
        user.is_verified = True
        user.is_phone_verified = True
        user.is_always_free = True
        if not user.email:
            user.email = s.DEMO_MASTER_EMAIL
        if not user.full_name:
            user.full_name = s.DEMO_MASTER_NAME

    master = db.query(Master).filter(Master.user_id == user.id).first()
    if not master:
        want = _canonical_demo_domain(user.id)
        by_domain = db.query(Master).filter(Master.domain == want).first()
        if by_domain:
            prev_uid = by_domain.user_id
            prev_user = db.get(User, prev_uid) if prev_uid is not None else None
            if prev_user is None:
                # «Сирота»: запись masters без users — привязываем к текущему demo user
                by_domain.user_id = user.id
                master = by_domain
            elif prev_user.id == user.id:
                master = by_domain
            else:
                # Домен занят другим живым пользователем — не перетираем чужой профиль
                alt = _pick_unique_demo_domain(db, user.id)
                master = Master(
                    user_id=user.id,
                    bio="Демо-кабинет DeDato для ознакомления с возможностями сервиса.",
                    experience_years=5,
                    can_work_independently=True,
                    can_work_in_salon=True,
                    city="Москва",
                    timezone="Europe/Moscow",
                    timezone_confirmed=True,
                    domain=alt,
                    site_description="Демо мастер",
                )
                db.add(master)
                db.flush()
        else:
            master = Master(
                user_id=user.id,
                bio="Демо-кабинет DeDato для ознакомления с возможностями сервиса.",
                experience_years=5,
                can_work_independently=True,
                can_work_in_salon=True,
                city="Москва",
                timezone="Europe/Moscow",
                timezone_confirmed=True,
                domain=want,
                site_description="Демо мастер",
            )
            db.add(master)
            db.flush()
    else:
        master.bio = "Демо-кабинет DeDato для ознакомления с возможностями сервиса."
        master.experience_years = 5
        master.can_work_independently = True
        master.city = master.city or "Москва"
        master.timezone = master.timezone or "Europe/Moscow"
        master.timezone_confirmed = True
        if not master.domain:
            master.domain = _pick_unique_demo_domain(db, user.id)

    return user, master


# Услуги для MasterService (каталог) и зеркальные Service для бронирований/статистики
_DEMO_SERVICES_SPEC: list[tuple[str, str, int, float]] = [
    # (category_name, service_name, duration_min, price_rub)
    ("Стрижки", "Стрижка женская", 60, 1800.0),
    ("Стрижки", "Стрижка мужская", 45, 1200.0),
    ("Стрижки", "Укладка", 45, 1400.0),
    ("Окрашивание", "Окрашивание корней", 120, 4200.0),
    ("Окрашивание", "Окрашивание полное", 180, 7500.0),
]


def _ensure_client(db: Session, phone: str, name: str) -> User:
    client = db.query(User).filter(User.phone == phone).first()
    if not client:
        client = User(
            phone=phone,
            email=f"{phone.replace('+', '')}@demo-client.local",
            full_name=name,
            role=UserRole.CLIENT,
            hashed_password=get_password_hash("demo_client_pw"),
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        db.add(client)
        db.flush()
    return client


def _delete_demo_booking_dependents(db: Session, booking_ids: list[int]) -> None:
    if not booking_ids:
        return
    db.query(BookingConfirmation).filter(BookingConfirmation.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(Income).filter(Income.booking_id.in_(booking_ids)).delete(synchronize_session=False)
    db.query(MissedRevenue).filter(MissedRevenue.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(AppliedDiscount).filter(AppliedDiscount.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(BookingEditRequest).filter(BookingEditRequest.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )
    db.query(LoyaltyTransaction).filter(LoyaltyTransaction.booking_id.in_(booking_ids)).delete(
        synchronize_session=False
    )


def _make_booking(
    *,
    client: User,
    service: Service,
    master: Master,
    start: datetime,
    duration_min: int,
    status: str,
    payment_amount: float | None,
    notes: str = "",
    cancellation_reason: str | None = None,
    is_paid: bool = False,
) -> Booking:
    end = start + timedelta(minutes=duration_min)
    return Booking(
        client_id=client.id,
        service_id=service.id,
        master_id=master.id,
        indie_master_id=None,
        salon_id=None,
        start_time=start,
        end_time=end,
        status=status,
        notes=notes or None,
        payment_method="on_visit",
        payment_amount=payment_amount,
        is_paid=is_paid,
        cancellation_reason=cancellation_reason,
    )


def reseed_demo_master(db: Session) -> dict[str, Any]:
    user, master = _ensure_demo_master_user(db)

    # --- Снять зависимости от старых броней demo-мастера ---
    old_booking_ids = [bid for (bid,) in db.query(Booking.id).filter(Booking.master_id == master.id).all()]
    _delete_demo_booking_dependents(db, old_booking_ids)
    db.query(Booking).filter(Booking.master_id == master.id).delete(synchronize_session=False)

    # Расходы мастера (users.id)
    db.query(MasterExpense).filter(MasterExpense.master_id == user.id).delete(synchronize_session=False)

    # Услуги Service + master_services
    old_service_ids = list(
        db.execute(select(master_services.c.service_id).where(master_services.c.master_id == master.id)).scalars()
    )
    db.execute(master_services.delete().where(master_services.c.master_id == master.id))
    if old_service_ids:
        db.query(Service).filter(Service.id.in_(old_service_ids)).delete(synchronize_session=False)

    db.query(ClientRestrictionRule).filter(ClientRestrictionRule.master_id == master.id).delete(
        synchronize_session=False
    )
    db.query(ClientRestriction).filter(ClientRestriction.master_id == master.id).delete(
        synchronize_session=False
    )
    db.query(MasterSchedule).filter(MasterSchedule.master_id == master.id).delete(synchronize_session=False)
    db.query(MasterService).filter(MasterService.master_id == master.id).delete(synchronize_session=False)
    db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id == master.id).delete(
        synchronize_session=False
    )

    # Категории и MasterService (экран «Услуги»)
    cat_by_name: dict[str, MasterServiceCategory] = {}
    for cat_name in sorted({row[0] for row in _DEMO_SERVICES_SPEC}):
        c = MasterServiceCategory(master_id=master.id, name=cat_name)
        db.add(c)
        cat_by_name[cat_name] = c
    db.flush()
    service_by_name: dict[str, Service] = {}
    for cat_name, name, duration, price in _DEMO_SERVICES_SPEC:
        db.add(
            MasterService(
                master_id=master.id,
                category_id=cat_by_name[cat_name].id,
                name=name,
                description="Демо-услуга",
                duration=duration,
                price=price,
            )
        )
        svc = Service(
            name=name,
            description="[DEMO]",
            duration=duration,
            price=price,
            salon_id=None,
            indie_master_id=None,
        )
        db.add(svc)
        db.flush()
        db.execute(master_services.insert().values(master_id=master.id, service_id=svc.id))
        service_by_name[name] = svc

    def S(name: str) -> Service:
        return service_by_name[name]

    # Календарь как в dashboard/accounting: локальная дата сервера (согласовано с get_period_dates)
    today_d = date.today()
    for i in range(14):
        d = today_d + timedelta(days=i)
        db.add(
            MasterSchedule(
                master_id=master.id,
                salon_id=None,
                date=d,
                start_time=time(10, 0),
                end_time=time(18, 0),
                is_available=True,
            )
        )

    # Клиенты
    clients = [
        _ensure_client(db, "+79990001001", "Анна Демо"),
        _ensure_client(db, "+79990001002", "Мария Демо"),
        _ensure_client(db, "+79990001003", "Елена Демо"),
        _ensure_client(db, "+79990001004", "Ольга Демо"),
        _ensure_client(db, "+79990001005", "Ирина Демо"),
        _ensure_client(db, "+79990001006", "Светлана Демо"),
    ]
    c1, c2, c3, c4, c5, c6 = clients

    # Якорь недель: как в dashboard get_period_dates(week) — понедельник текущей недели по UTC-дате
    monday = today_d - timedelta(days=today_d.weekday())
    prev_monday = monday - timedelta(days=7)

    def dt(day: datetime.date, h: int, m: int = 0) -> datetime:
        return datetime.combine(day, time(h, m))

    bookings_to_add: list[Booking] = []

    # --- Прошлая неделя: завершённые (доход в «предыдущий период» при сравнении недель) ---
    bookings_to_add.append(
        _make_booking(
            client=c1,
            service=S("Стрижка женская"),
            master=master,
            start=dt(prev_monday + timedelta(days=1), 10, 0),
            duration_min=60,
            status=BookingStatus.COMPLETED.value,
            payment_amount=1800.0,
            notes="Прошлая неделя",
            is_paid=True,
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c2,
            service=S("Окрашивание корней"),
            master=master,
            start=dt(prev_monday + timedelta(days=3), 14, 0),
            duration_min=120,
            status=BookingStatus.COMPLETED.value,
            payment_amount=4200.0,
            notes="Прошлая неделя",
            is_paid=True,
        )
    )

    # --- Текущая неделя: завершённые + отмена ---
    bookings_to_add.append(
        _make_booking(
            client=c3,
            service=S("Стрижка мужская"),
            master=master,
            start=dt(monday + timedelta(days=0), 9, 30),
            duration_min=45,
            status=BookingStatus.COMPLETED.value,
            payment_amount=1200.0,
            notes="Пн, текущая неделя",
            is_paid=True,
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c4,
            service=S("Укладка"),
            master=master,
            start=dt(monday + timedelta(days=2), 11, 0),
            duration_min=45,
            status=BookingStatus.COMPLETED.value,
            payment_amount=1400.0,
            notes="Ср",
            is_paid=True,
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c5,
            service=S("Окрашивание полное"),
            master=master,
            start=dt(monday + timedelta(days=4), 12, 0),
            duration_min=180,
            status=BookingStatus.COMPLETED.value,
            payment_amount=7500.0,
            notes="Пт",
            is_paid=True,
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c1,
            service=S("Стрижка женская"),
            master=master,
            start=dt(monday + timedelta(days=3), 16, 0),
            duration_min=60,
            status=BookingStatus.CANCELLED.value,
            payment_amount=0.0,
            notes="Отмена клиентом",
            cancellation_reason="client_requested",
        )
    )

    # --- Вчера (фиксированный календарный день — без сдвига UTC/local) ---
    bookings_to_add.append(
        _make_booking(
            client=c6,
            service=S("Стрижка женская"),
            master=master,
            start=dt(today_d - timedelta(days=1), 14, 0),
            duration_min=60,
            status=BookingStatus.COMPLETED.value,
            payment_amount=1800.0,
            notes="Вчера",
            is_paid=True,
        )
    )

    # --- Будущие записи (ожидаемый доход во «Финансах»: CREATED / CONFIRMED) ---
    fut_base = datetime.combine(today_d + timedelta(days=1), time(10, 0))
    bookings_to_add.append(
        _make_booking(
            client=c2,
            service=S("Окрашивание корней"),
            master=master,
            start=fut_base.replace(hour=10, minute=0),
            duration_min=120,
            status=BookingStatus.CREATED.value,
            payment_amount=4200.0,
            notes="Запланировано",
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c3,
            service=S("Стрижка женская"),
            master=master,
            start=fut_base.replace(hour=14, minute=30) + timedelta(days=1),
            duration_min=60,
            status=BookingStatus.CONFIRMED.value,
            payment_amount=1800.0,
            notes="Подтверждено",
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c4,
            service=S("Укладка"),
            master=master,
            start=fut_base.replace(hour=11, minute=0) + timedelta(days=3),
            duration_min=45,
            status=BookingStatus.CREATED.value,
            payment_amount=1400.0,
        )
    )
    bookings_to_add.append(
        _make_booking(
            client=c5,
            service=S("Стрижка мужская"),
            master=master,
            start=fut_base.replace(hour=15, minute=0) + timedelta(days=5),
            duration_min=45,
            status=BookingStatus.CREATED.value,
            payment_amount=1200.0,
        )
    )

    # No-show / основание для правил (отмена с причиной)
    bookings_to_add.append(
        _make_booking(
            client=c6,
            service=S("Укладка"),
            master=master,
            start=dt(today_d - timedelta(days=5), 11, 0),
            duration_min=45,
            status=BookingStatus.CANCELLED.value,
            payment_amount=0.0,
            cancellation_reason="client_no_show",
            notes="Демо: неявка",
        )
    )

    for b in bookings_to_add:
        db.add(b)
    db.flush()

    # Подтверждения и Income для завершённых — как после confirm в accounting (финансы + согласованность)
    for b in bookings_to_add:
        if b.status != BookingStatus.COMPLETED.value:
            continue
        amt = float(b.payment_amount or 0)
        conf_at = b.end_time or (b.start_time + timedelta(hours=1))
        db.add(
            BookingConfirmation(
                booking_id=b.id,
                master_id=user.id,
                confirmed_at=conf_at,
                confirmed_income=amt,
            )
        )
        db.add(
            Income(
                booking_id=b.id,
                salon_id=None,
                indie_master_id=None,
                branch_id=None,
                total_amount=amt,
                master_earnings=amt,
                salon_earnings=0.0,
                income_date=(b.start_time.date() if b.start_time else datetime.utcnow().date()),
                service_date=(b.start_time.date() if b.start_time else datetime.utcnow().date()),
            )
        )

    # Расходы в те же календарные дни, что и завершённые визиты (нет крупного минуса «в пустой день»)
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Расходные материалы (демо)",
            expense_type="one_time",
            amount=450.0,
            expense_date=datetime.combine(prev_monday + timedelta(days=1), time(12, 0)),
            is_active=True,
        )
    )
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Краска и окислитель (демо)",
            expense_type="one_time",
            amount=900.0,
            expense_date=datetime.combine(prev_monday + timedelta(days=3), time(15, 0)),
            is_active=True,
        )
    )
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Расходные материалы (демо)",
            expense_type="one_time",
            amount=400.0,
            expense_date=datetime.combine(monday + timedelta(days=0), time(10, 0)),
            is_active=True,
        )
    )
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Расходные материалы (демо)",
            expense_type="one_time",
            amount=350.0,
            expense_date=datetime.combine(monday + timedelta(days=2), time(12, 0)),
            is_active=True,
        )
    )
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Аренда кабинета (демо)",
            expense_type="one_time",
            amount=1600.0,
            expense_date=datetime.combine(monday + timedelta(days=4), time(9, 0)),
            is_active=True,
        )
    )
    db.add(
        MasterExpense(
            master_id=user.id,
            name="Расходные материалы (демо)",
            expense_type="one_time",
            amount=400.0,
            expense_date=datetime.combine(today_d - timedelta(days=1), time(18, 0)),
            is_active=True,
        )
    )

    db.add_all(
        [
            ClientRestriction(
                master_id=master.id,
                client_phone="+79990001111",
                restriction_type="blacklist",
                reason="Два no-show",
            ),
            ClientRestriction(
                master_id=master.id,
                client_phone="+79990002222",
                restriction_type="advance_payment_only",
                reason="Частые поздние отмены",
            ),
            ClientRestrictionRule(
                master_id=master.id,
                cancellation_reason="client_no_show",
                cancel_count=2,
                period_days=60,
                restriction_type="advance_payment_only",
            ),
        ]
    )

    db.commit()
    return {
        "demo_user_id": user.id,
        "demo_master_id": master.id,
        "master_services": len(_DEMO_SERVICES_SPEC),
        "linked_services": len(service_by_name),
        "bookings": len(bookings_to_add),
    }


def ensure_demo_master_exists(db: Session) -> dict[str, Any]:
    s = get_settings()
    user = db.query(User).filter(User.phone == s.DEMO_MASTER_PHONE).first()
    master = db.query(Master).filter(Master.user_id == user.id).first() if user else None
    if user and master:
        return {"demo_user_id": user.id, "demo_master_id": master.id, "created": False}
    data = reseed_demo_master(db)
    data["created"] = True
    return data

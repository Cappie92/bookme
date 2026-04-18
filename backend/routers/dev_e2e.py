"""
Dev-only E2E seed: создаёт фиксированных Master A (free), Master B (Pro), Client C и тестовые данные.
Доступно ТОЛЬКО при DEV_E2E=true. Без авторизации (вызывается до логина в E2E).
Детерминированный идемпотентный seed под все E2E сценарии.
POST /seed с body {"reset": true} — удаляет E2E-сущности и выполняет seed заново.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, time
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_password_hash
from database import get_db
from models import (
    User,
    UserRole,
    Master,
    IndieMaster,
    IndieMasterSchedule,
    Booking,
    BookingStatus,
    BookingConfirmation,
    Service,
    Subscription,
    SubscriptionPlan,
    SubscriptionType,
    SubscriptionStatus,
    ClientFavorite,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dev/e2e", tags=["dev-e2e"])

# Фиксированные учётные данные для E2E (example.com — валидный домен для EmailStr)
MASTER_A_PHONE = "+79991111111"
MASTER_B_PHONE = "+79992222222"
CLIENT_C_PHONE = "+79993333333"
E2E_PASSWORD = "e2e123"
E2E_EMAILS = {
    MASTER_A_PHONE: "e2e.master.a@example.com",
    MASTER_B_PHONE: "e2e.master.b@example.com",
    CLIENT_C_PHONE: "e2e.client.c@example.com",
}

MASTER_A_DOMAIN = "e2e-master-a"
MASTER_B_DOMAIN = "e2e-master-b"


def _is_dev_e2e() -> bool:
    from settings import get_settings
    return get_settings().dev_e2e


def _ensure_dev_e2e():
    if not _is_dev_e2e():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="E2E seed available only when DEV_E2E=true",
        )


class SeedBody(BaseModel):
    reset: Optional[bool] = False


def _reset_e2e_data(db: Session) -> None:
    """
    Удаляет только E2E-сущности перед новым seed.
    
    SAFETY: Удаляет ТОЛЬКО тестовые данные, определяемые по:
    - Телефонам: +79991111111 (Master A), +79992222222 (Master B), +79993333333 (Client C)
    - Доменам: e2e-master-a, e2e-master-b
    
    Никогда не запускается в production (требует DEV_E2E=true).
    Порядок удаления соблюдает foreign key constraints:
    1. BookingConfirmation → 2. Booking → 3. Services/Schedules/Subscriptions → 4. Masters → 5. Users
    """
    e2e_phones = [MASTER_A_PHONE, MASTER_B_PHONE, CLIENT_C_PHONE]
    e2e_users = db.query(User).filter(User.phone.in_(e2e_phones)).all()
    if not e2e_users:
        return

    user_ids = [u.id for u in e2e_users]
    masters = db.query(Master).filter(Master.user_id.in_(user_ids)).all()
    master_ids = [m.id for m in masters]
    indie_masters = db.query(IndieMaster).filter(
        IndieMaster.domain.in_([MASTER_A_DOMAIN, MASTER_B_DOMAIN])
    ).filter(IndieMaster.user_id.in_(user_ids)).all()
    indie_master_ids = [im.id for im in indie_masters]

    # Удаляем BookingConfirmation для E2E-записей перед удалением самих Booking
    e2e_bookings = db.query(Booking).filter(
        (Booking.client_id.in_(user_ids)) | (Booking.indie_master_id.in_(indie_master_ids))
    ).all()
    e2e_booking_ids = [b.id for b in e2e_bookings]
    if e2e_booking_ids:
        db.query(BookingConfirmation).filter(BookingConfirmation.booking_id.in_(e2e_booking_ids)).delete(synchronize_session=False)

    db.query(Booking).filter(
        (Booking.client_id.in_(user_ids)) | (Booking.indie_master_id.in_(indie_master_ids))
    ).delete(synchronize_session=False)
    db.query(ClientFavorite).filter(
        (ClientFavorite.client_id.in_(user_ids))
        | (ClientFavorite.master_id.in_(master_ids))
        | (ClientFavorite.indie_master_id.in_(indie_master_ids))
    ).delete(synchronize_session=False)
    db.query(Service).filter(Service.indie_master_id.in_(indie_master_ids)).delete(synchronize_session=False)
    db.query(IndieMasterSchedule).filter(
        IndieMasterSchedule.indie_master_id.in_(indie_master_ids)
    ).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(IndieMaster).filter(IndieMaster.id.in_(indie_master_ids)).delete(synchronize_session=False)
    db.query(Master).filter(Master.id.in_(master_ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    logger.info("E2E reset: удалены users=%s, masters=%s, indie_masters=%s", user_ids, master_ids, indie_master_ids)


@router.post("/seed", response_model=dict[str, Any])
async def seed_e2e(
    body: Optional[SeedBody] = Body(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Создать/обновить E2E тестовые данные:
    - Master A: Free plan, domain e2e-master-a
    - Master B: Pro plan, pre_visit_confirmations_enabled, domain e2e-master-b
    - Client C
    - 2 indie-услуги, расписание, 2 записи (прошлая AWAITING_CONFIRMATION, будущая CONFIRMED)
    При body.reset=True — сначала удаляет E2E-сущности, затем seed.
    """
    _ensure_dev_e2e()

    if body and body.reset:
        _reset_e2e_data(db)

    now = datetime.utcnow()
    today = now.date()

    # Планы
    free_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "Free",
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
    ).first()
    pro_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "Pro",
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
    ).first()
    if not free_plan or not pro_plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Subscription plans Free and Pro must exist. Run migrations.",
        )

    def get_or_create_user(
        phone: str,
        role: UserRole,
        full_name: str,
        birth_date: Optional[date] = None,
    ) -> User:
        email = E2E_EMAILS.get(phone, f"e2e+{phone.replace('+', '')}@example.com")
        u = db.query(User).filter(User.phone == phone).first()
        if u:
            u.email = email
            u.hashed_password = get_password_hash(E2E_PASSWORD)
            u.role = role
            u.full_name = full_name
            u.is_active = True
            u.is_verified = True
            u.is_phone_verified = True
            if birth_date is not None:
                u.birth_date = birth_date
            db.flush()
            return u
        u = User(
            phone=phone,
            email=email,
            hashed_password=get_password_hash(E2E_PASSWORD),
            role=role,
            full_name=full_name,
            birth_date=birth_date,
            is_active=True,
            is_verified=True,
            is_phone_verified=True,
        )
        db.add(u)
        db.flush()
        return u

    def get_or_create_master(user: User, domain: str) -> Master:
        m = db.query(Master).filter(Master.user_id == user.id).first()
        if m:
            m.domain = domain
            m.can_work_independently = True
            db.flush()
            return m
        m = Master(
            user_id=user.id,
            domain=domain,
            can_work_independently=True,
            can_work_in_salon=False,
            city="Москва",
            timezone="Europe/Moscow",
            timezone_confirmed=True,
            address="ул. Тестовая, 1",
        )
        db.add(m)
        db.flush()
        return m

    def set_subscription(user: User, plan: SubscriptionPlan):
        existing = db.query(Subscription).filter(
            Subscription.user_id == user.id,
            Subscription.subscription_type == SubscriptionType.MASTER,
        ).all()
        for s in existing:
            s.status = SubscriptionStatus.EXPIRED
            s.is_active = False
        end_date = datetime(2099, 12, 31)
        days = (end_date - datetime.utcnow()).days or 365
        daily_rate = int((float(plan.price_1month or 0) / 30)) if plan.price_1month else 0
        sub = Subscription(
            user_id=user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            start_date=datetime.utcnow(),
            end_date=end_date,
            price=float(plan.price_1month or 0),
            daily_rate=daily_rate,
            is_active=True,
            auto_renewal=False,
            salon_branches=0,
            salon_employees=0,
            master_bookings=0,
        )
        db.add(sub)
        db.flush()

    # Master A (Free): manual confirm, post-visit pending
    u_a = get_or_create_user(MASTER_A_PHONE, UserRole.MASTER, "E2E Master A")
    m_a = get_or_create_master(u_a, MASTER_A_DOMAIN)
    m_a.auto_confirm_bookings = False
    manual_at = now - timedelta(days=7)
    m_a.manual_confirm_enabled_at = manual_at
    set_subscription(u_a, free_plan)

    # Master B (Pro): pre_visit_confirmations, has_extended_stats via Pro plan
    u_b = get_or_create_user(MASTER_B_PHONE, UserRole.MASTER, "E2E Master B")
    m_b = get_or_create_master(u_b, MASTER_B_DOMAIN)
    m_b.auto_confirm_bookings = False
    m_b.pre_visit_confirmations_enabled = True
    m_b.manual_confirm_enabled_at = manual_at
    set_subscription(u_b, pro_plan)

    # Client C — реалистичный профиль для ЛК / smoke (логин те же: телефон + e2e123)
    u_c = get_or_create_user(
        CLIENT_C_PHONE,
        UserRole.CLIENT,
        "Екатерина Соколова",
        birth_date=date(1992, 3, 15),
    )

    # IndieMaster для A и B
    def ensure_indie(master: Master, domain: str) -> IndieMaster:
        im = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        if im:
            im.domain = domain
            im.address = master.address or "ул. Тестовая, 1"
            im.city = master.city or "Москва"
            if im.master_id is None:
                im.master_id = master.id
            db.flush()
            return im
        im = IndieMaster(
            user_id=master.user_id,
            master_id=master.id,
            domain=domain,
            address=master.address or "ул. Тестовая, 1",
            city="Москва",
            timezone="Europe/Moscow",
        )
        db.add(im)
        db.flush()
        return im

    im_a = ensure_indie(m_a, MASTER_A_DOMAIN)
    im_b = ensure_indie(m_b, MASTER_B_DOMAIN)

    # Услуги для indie
    def ensure_services(indie: IndieMaster, names: list[tuple[str, int, float]]) -> list[Service]:
        existing = db.query(Service).filter(Service.indie_master_id == indie.id).all()
        result = []
        for name, duration, price in names:
            svc = next((s for s in existing if s.name == name), None)
            if not svc:
                svc = Service(
                    name=name,
                    duration=duration,
                    price=price,
                    indie_master_id=indie.id,
                )
                db.add(svc)
                db.flush()
            result.append(svc)
        return result

    svcs_a = ensure_services(im_a, [("E2E Стрижка", 30, 1000), ("E2E Окрашивание", 60, 2000)])
    svcs_b = ensure_services(im_b, [("E2E Укладка", 45, 1500)])

    # Расписание: все дни 1–7 (пн–вс), чтобы слоты были всегда (get_available_slots: day_of_week = date.weekday()+1)
    for im in [im_a, im_b]:
        for dow in range(1, 8):
            st = datetime.combine(today, time(10, 0))
            et = datetime.combine(today, time(20, 0))
            ex = db.query(IndieMasterSchedule).filter(
                IndieMasterSchedule.indie_master_id == im.id,
                IndieMasterSchedule.day_of_week == dow,
            ).first()
            if ex:
                ex.start_time = st
                ex.end_time = et
                ex.is_available = True
                db.flush()
            else:
                db.add(IndieMasterSchedule(
                    indie_master_id=im.id,
                    day_of_week=dow,
                    start_time=st,
                    end_time=et,
                    is_available=True,
                ))
                db.flush()

    # 1) Прошлая AWAITING_CONFIRMATION для post-visit (Master A): created_at >= manual_confirm_enabled_at
    past_start = now - timedelta(hours=2)
    past_end = past_start + timedelta(minutes=svcs_a[0].duration or 30)
    past_booking = db.query(Booking).filter(
        Booking.indie_master_id == im_a.id,
        Booking.client_id == u_c.id,
        Booking.start_time < now,
        Booking.status == BookingStatus.AWAITING_CONFIRMATION.value,
    ).first()
    if past_booking:
        past_booking.master_id = m_a.id
        past_booking.indie_master_id = im_a.id
        past_booking.start_time = past_start
        past_booking.end_time = past_end
        past_booking.created_at = now  # >= manual_confirm_enabled_at
        db.flush()
    else:
        past_booking = Booking(
            client_id=u_c.id,
            service_id=svcs_a[0].id,
            master_id=m_a.id,
            indie_master_id=im_a.id,
            start_time=past_start,
            end_time=past_end,
            status=BookingStatus.AWAITING_CONFIRMATION.value,
            payment_amount=float(svcs_a[0].price or 0),
            created_at=now,
        )
        db.add(past_booking)
        db.flush()

    # 2) Будущая запись Master A для client cancel flow
    client_cancel_start = now + timedelta(hours=2)
    client_cancel_end = client_cancel_start + timedelta(minutes=svcs_a[0].duration or 30)
    client_cancel_booking = db.query(Booking).filter(
        Booking.indie_master_id == im_a.id,
        Booking.client_id == u_c.id,
        Booking.start_time >= now,
    ).first()
    if client_cancel_booking:
        client_cancel_booking.master_id = m_a.id
        client_cancel_booking.indie_master_id = im_a.id
        client_cancel_booking.start_time = client_cancel_start
        client_cancel_booking.end_time = client_cancel_end
        client_cancel_booking.status = BookingStatus.CONFIRMED.value
        db.flush()
    else:
        client_cancel_booking = Booking(
            client_id=u_c.id,
            service_id=svcs_a[0].id,
            master_id=m_a.id,
            indie_master_id=im_a.id,
            start_time=client_cancel_start,
            end_time=client_cancel_end,
            status=BookingStatus.CONFIRMED.value,
            payment_amount=float(svcs_a[0].price or 0),
        )
        db.add(client_cancel_booking)
        db.flush()

    # 3) Будущая CREATED для pre-visit (Master B): canConfirmPreVisit требует status=created
    pre_visit_start = now + timedelta(hours=3)
    pre_visit_end = pre_visit_start + timedelta(minutes=svcs_b[0].duration or 45)
    pre_visit_booking = db.query(Booking).filter(
        Booking.indie_master_id == im_b.id,
        Booking.client_id == u_c.id,
        Booking.start_time >= now,
    ).first()
    if pre_visit_booking:
        pre_visit_booking.master_id = m_b.id
        pre_visit_booking.indie_master_id = im_b.id
        pre_visit_booking.start_time = pre_visit_start
        pre_visit_booking.end_time = pre_visit_end
        pre_visit_booking.status = BookingStatus.CREATED.value
        db.flush()
    else:
        pre_visit_booking = Booking(
            client_id=u_c.id,
            service_id=svcs_b[0].id,
            master_id=m_b.id,
            indie_master_id=im_b.id,
            start_time=pre_visit_start,
            end_time=pre_visit_end,
            status=BookingStatus.CREATED.value,
            payment_amount=float(svcs_b[0].price or 0),
        )
        db.add(pre_visit_booking)
        db.flush()

    db.commit()

    smoke = {
        "master_a_domain": MASTER_A_DOMAIN,
        "master_b_domain": MASTER_B_DOMAIN,
        "services_a": [s.name for s in svcs_a],
        "services_b": [s.name for s in svcs_b],
        "schedule_days": list(range(1, 8)),
        "past_booking_id": past_booking.id,
        "past_status": past_booking.status,
        "client_cancel_booking_id": client_cancel_booking.id,
        "pre_visit_booking_id": pre_visit_booking.id,
        "pre_visit_status": pre_visit_booking.status,
    }
    logger.info("E2E seed smoke: %s", smoke)

    return {
        "success": True,
        "master_a": {"phone": MASTER_A_PHONE, "password": E2E_PASSWORD, "domain": MASTER_A_DOMAIN},
        "master_b": {"phone": MASTER_B_PHONE, "password": E2E_PASSWORD, "domain": MASTER_B_DOMAIN},
        "client_c": {"phone": CLIENT_C_PHONE, "password": E2E_PASSWORD},
        "past_booking_id": past_booking.id,
        "client_cancel_booking_id": client_cancel_booking.id,
        "pre_visit_booking_id": pre_visit_booking.id,
        "smoke": smoke,
    }

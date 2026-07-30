"""
Единый сервис self-service / admin удаления аккаунта.

CLIENT — анонимизация и деактивация пользователя (история записей сохраняется).
MASTER — анонимизация/деактивация master+user без hard delete ID (история сохраняется).

Коммит только в delete_account(); helper-функции не коммитят.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pytz
from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from models import (
    AppliedDiscount,
    AvailabilitySlot,
    Booking,
    BookingStatus,
    ClientFavorite,
    ClientMasterNote,
    ClientNote,
    ClientRestriction,
    ClientRestrictionRule,
    ClientSalonNote,
    EmailVerification,
    IndieMaster,
    IndieMasterSchedule,
    LoyaltyDiscount,
    LoyaltySettings,
    LoyaltyTransaction,
    Master,
    MasterClientMetadata,
    MasterPageModule,
    MasterPaymentSettings,
    MasterSchedule,
    MasterScheduleSettings,
    MasterService,
    MasterServiceCategory,
    OwnerType,
    PasswordReset,
    PersonalDiscount,
    PromoCampaign,
    PromoCampaignStatus,
    Service,
    Subscription,
    SubscriptionStatus,
    TemporaryBooking,
    User,
    UserOAuthAccount,
    UserRole,
    master_services,
    salon_masters,
)

logger = logging.getLogger(__name__)

MASTER_ACCOUNT_DELETED_REASON = "Аккаунт мастера удалён"
CLIENT_ACCOUNT_DELETED_REASON = "Аккаунт клиента удалён"

_CANCELLED_STATUSES = frozenset(
    {
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.PAYMENT_EXPIRED.value,
    }
)


@dataclass(frozen=True)
class AccountDeletionResult:
    user_id: int
    role: str
    already_deleted: bool
    master_id: Optional[int] = None
    message: str = "Аккаунт успешно удален"


def deleted_master_display_name(master_id: int) -> str:
    return f"Удалённый мастер №{master_id}"


def deleted_client_display_name(user_id: int) -> str:
    return f"Удалённый клиент №{user_id}"


def is_user_deleted(user: User) -> bool:
    return bool(getattr(user, "deleted_at", None)) or not bool(user.is_active)


def is_master_deleted(master: Optional[Master]) -> bool:
    if master is None:
        return False
    return bool(getattr(master, "is_deleted", False)) or bool(getattr(master, "deleted_at", None))


def _now() -> datetime:
    return datetime.utcnow()


def _tz(name: Optional[str]):
    try:
        return pytz.timezone(name or "Europe/Moscow")
    except Exception:
        return pytz.timezone("Europe/Moscow")


def _current_time_in_tz(timezone_str: Optional[str]) -> datetime:
    zone = _tz(timezone_str)
    return datetime.now(zone)


def _booking_start_in_tz(start_time: datetime, timezone_str: Optional[str]) -> datetime:
    zone = _tz(timezone_str)
    if start_time.tzinfo is None:
        return pytz.UTC.localize(start_time).astimezone(zone)
    return start_time.astimezone(zone)


def _safe_unlink_upload(path: Optional[str]) -> None:
    """Удаляет локальный файл uploads/* если путь указывает на существующий файл. Без raise."""
    if not path or not isinstance(path, str):
        return
    rel = path.lstrip("/")
    if not (rel.startswith("uploads/") or path.startswith("uploads/")):
        # URL вида /uploads/photos/x.jpg
        if "/uploads/" in path:
            rel = path.split("/uploads/", 1)[-1]
            rel = f"uploads/{rel}"
        else:
            return
    try:
        if os.path.isfile(rel):
            os.remove(rel)
    except OSError as e:
        logger.warning("account_deletion: failed to remove file %s: %s", rel, e)


def _anonymize_user_pii(user: User, display_name: str, now: datetime) -> None:
    user.full_name = display_name
    user.email = None
    user.phone = None
    user.birth_date = None
    user.hashed_password = None
    user.is_active = False
    user.is_verified = False
    user.is_phone_verified = False
    user.phone_verification_code = None
    user.phone_verification_expires = None
    user.phone_verification_call_id = None
    user.phone_verification_attempts = 0
    user.phone_verification_target_phone = None
    user.phone_verification_purpose = None
    user.password_reset_code = None
    user.password_reset_expires = None
    user.pending_phone = None
    user.pending_phone_expires_at = None
    user.pending_email = None
    user.deleted_at = now
    user.updated_at = now


def _clear_user_auth_side_tables(db: Session, user_id: int) -> None:
    db.query(UserOAuthAccount).filter(UserOAuthAccount.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(EmailVerification).filter(EmailVerification.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(PasswordReset).filter(PasswordReset.user_id == user_id).delete(
        synchronize_session=False
    )


def _stop_subscriptions(db: Session, user_id: int) -> None:
    subs = db.query(Subscription).filter(Subscription.user_id == user_id).all()
    for sub in subs:
        sub.is_active = False
        sub.auto_renewal = False
        if sub.status != SubscriptionStatus.CANCELLED:
            sub.status = SubscriptionStatus.CANCELLED


def _cancel_future_bookings_for_master(
    db: Session,
    *,
    master_id: int,
    indie_master_id: Optional[int],
    timezone_str: Optional[str],
    cancelled_by_user_id: int,
    reason: str,
) -> int:
    now_local = _current_time_in_tz(timezone_str)
    if indie_master_id:
        q = db.query(Booking).filter(
            or_(Booking.master_id == master_id, Booking.indie_master_id == indie_master_id)
        )
    else:
        q = db.query(Booking).filter(Booking.master_id == master_id)
    cancelled = 0
    for booking in q.all():
        status_val = booking.status.value if hasattr(booking.status, "value") else str(booking.status or "")
        if status_val in _CANCELLED_STATUSES:
            continue
        if booking.start_time is None:
            continue
        start_local = _booking_start_in_tz(booking.start_time, timezone_str)
        if start_local <= now_local:
            continue
        from utils.booking_loyalty_reserve import clear_loyalty_points_reserve

        clear_loyalty_points_reserve(booking)
        booking.status = BookingStatus.CANCELLED.value
        booking.cancellation_reason = reason
        booking.cancelled_by_user_id = cancelled_by_user_id
        booking.updated_at = _now()
        cancelled += 1
    return cancelled


def _cancel_future_bookings_for_client(
    db: Session,
    *,
    client_id: int,
    cancelled_by_user_id: int,
    reason: str,
) -> int:
    cancelled = 0
    bookings = db.query(Booking).filter(Booking.client_id == client_id).all()
    for booking in bookings:
        status_val = booking.status.value if hasattr(booking.status, "value") else str(booking.status or "")
        if status_val in _CANCELLED_STATUSES:
            continue
        tz_name = None
        if booking.master and booking.master.timezone:
            tz_name = booking.master.timezone
        elif booking.indie_master and booking.indie_master.timezone:
            tz_name = booking.indie_master.timezone
        now_local = _current_time_in_tz(tz_name)
        if booking.start_time is None:
            continue
        start_local = _booking_start_in_tz(booking.start_time, tz_name)
        if start_local <= now_local:
            continue
        from utils.booking_loyalty_reserve import clear_loyalty_points_reserve

        clear_loyalty_points_reserve(booking)
        booking.status = BookingStatus.CANCELLED.value
        booking.cancellation_reason = reason
        booking.cancelled_by_user_id = cancelled_by_user_id
        booking.updated_at = _now()
        cancelled += 1
    return cancelled


def _delete_master_schedule(db: Session, master_id: int, indie_master_id: Optional[int]) -> None:
    db.query(MasterSchedule).filter(MasterSchedule.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(MasterScheduleSettings).filter(MasterScheduleSettings.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(AvailabilitySlot).filter(
        AvailabilitySlot.owner_type == OwnerType.MASTER,
        AvailabilitySlot.owner_id == master_id,
    ).delete(synchronize_session=False)
    if indie_master_id:
        db.query(IndieMasterSchedule).filter(
            IndieMasterSchedule.indie_master_id == indie_master_id
        ).delete(synchronize_session=False)
        db.query(AvailabilitySlot).filter(
            AvailabilitySlot.owner_type == OwnerType.INDIE_MASTER,
            AvailabilitySlot.owner_id == indie_master_id,
        ).delete(synchronize_session=False)


def _deactivate_master_services(db: Session, master_id: int, indie_master_id: Optional[int]) -> None:
    """
    Услуги: удаляем актуальные MasterService/категории и M2M-связи.
    Service rows, на которые ссылаются bookings, не hard-delete — история имён услуг сохраняется.
    """
    db.execute(delete(master_services).where(master_services.c.master_id == master_id))
    db.query(MasterService).filter(MasterService.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(MasterServiceCategory).filter(MasterServiceCategory.master_id == master_id).delete(
        synchronize_session=False
    )
    if indie_master_id:
        # Не удаляем Service с bookings; убираем публичную привязку к indie.
        services = db.query(Service).filter(Service.indie_master_id == indie_master_id).all()
        for svc in services:
            # Оставляем name/price как snapshot для истории; отвязываем от активного indie-профиля
            # нельзя обнулить indie_master_id если NOT NULL — колонка nullable.
            svc.indie_master_id = None
            svc.description = None


def _delete_master_crm_and_loyalty(
    db: Session, master_id: int, indie_master_id: Optional[int] = None
) -> None:
    # AppliedDiscount FK → null before deleting discount rows
    discount_ids = [
        r.id
        for r in db.query(LoyaltyDiscount.id).filter(LoyaltyDiscount.master_id == master_id).all()
    ]
    personal_ids = [
        r.id
        for r in db.query(PersonalDiscount.id).filter(PersonalDiscount.master_id == master_id).all()
    ]
    if discount_ids:
        db.query(AppliedDiscount).filter(AppliedDiscount.discount_id.in_(discount_ids)).update(
            {AppliedDiscount.discount_id: None}, synchronize_session=False
        )
    if personal_ids:
        db.query(AppliedDiscount).filter(
            AppliedDiscount.personal_discount_id.in_(personal_ids)
        ).update({AppliedDiscount.personal_discount_id: None}, synchronize_session=False)

    db.query(LoyaltyDiscount).filter(LoyaltyDiscount.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(PersonalDiscount).filter(PersonalDiscount.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(ClientRestriction).filter(ClientRestriction.master_id == master_id).delete(
        synchronize_session=False
    )
    if indie_master_id:
        db.query(ClientRestriction).filter(
            ClientRestriction.indie_master_id == indie_master_id
        ).delete(synchronize_session=False)
    db.query(ClientRestrictionRule).filter(ClientRestrictionRule.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(ClientMasterNote).filter(ClientMasterNote.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(ClientNote).filter(
        ClientNote.note_type == "master",
        ClientNote.target_id == master_id,
    ).delete(synchronize_session=False)
    if indie_master_id:
        db.query(ClientNote).filter(
            ClientNote.note_type == "indie_master",
            ClientNote.target_id == indie_master_id,
        ).delete(synchronize_session=False)

    # Промо-баллы этого мастера: удаляем весь ledger по master_id (баланс → 0, без отрицательных).
    db.query(LoyaltyTransaction).filter(LoyaltyTransaction.master_id == master_id).delete(
        synchronize_session=False
    )
    db.query(LoyaltySettings).filter(LoyaltySettings.master_id == master_id).delete(
        synchronize_session=False
    )

    db.query(ClientFavorite).filter(ClientFavorite.master_id == master_id).delete(
        synchronize_session=False
    )
    if indie_master_id:
        db.query(ClientFavorite).filter(ClientFavorite.indie_master_id == indie_master_id).delete(
            synchronize_session=False
        )


def _deactivate_master_public_page(db: Session, master: Master, indie: Optional[IndieMaster]) -> None:
    _safe_unlink_upload(master.photo)
    _safe_unlink_upload(master.logo)
    master.bio = None
    master.experience_years = None
    master.website = None
    master.domain = None
    master.logo = None
    master.photo = None
    master.use_photo_as_logo = False
    master.address = None
    master.address_detail = None
    master.site_description = None
    master.city = None
    master.can_work_independently = False
    master.auto_confirm_bookings = False
    master.pre_visit_confirmations_enabled = False

    db.query(MasterPageModule).filter(MasterPageModule.master_id == master.id).delete(
        synchronize_session=False
    )
    db.query(MasterPaymentSettings).filter(MasterPaymentSettings.master_id == master.id).delete(
        synchronize_session=False
    )
    db.execute(delete(salon_masters).where(salon_masters.c.master_id == master.id))

    if indie:
        indie.bio = None
        indie.experience_years = None
        indie.domain = None
        indie.address = None
        indie.city = None
        indie.payment_on_visit = False
        indie.payment_advance = False


def _deactivate_master_promo_campaigns(db: Session, master_id: int) -> None:
    campaigns = (
        db.query(PromoCampaign).filter(PromoCampaign.owner_master_id == master_id).all()
    )
    for camp in campaigns:
        camp.status = PromoCampaignStatus.CANCELLED
        camp.owner_master_id = None


def _anonymize_master(db: Session, user: User) -> AccountDeletionResult:
    now = _now()
    master = db.query(Master).filter(Master.user_id == user.id).first()
    if not master:
        # Пользователь с ролью MASTER без профиля — всё равно деактивируем user
        _anonymize_user_pii(user, deleted_client_display_name(user.id), now)
        _clear_user_auth_side_tables(db, user.id)
        _stop_subscriptions(db, user.id)
        return AccountDeletionResult(
            user_id=user.id,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
            already_deleted=False,
            master_id=None,
        )

    if is_master_deleted(master) and is_user_deleted(user):
        return AccountDeletionResult(
            user_id=user.id,
            role="master",
            already_deleted=True,
            master_id=master.id,
            message="Аккаунт уже удалён",
        )

    indie = db.query(IndieMaster).filter(IndieMaster.master_id == master.id).first()
    indie_id = indie.id if indie else None
    display = deleted_master_display_name(master.id)

    _cancel_future_bookings_for_master(
        db,
        master_id=master.id,
        indie_master_id=indie_id,
        timezone_str=master.timezone,
        cancelled_by_user_id=user.id,
        reason=MASTER_ACCOUNT_DELETED_REASON,
    )

    db.query(TemporaryBooking).filter(TemporaryBooking.master_id == master.id).delete(
        synchronize_session=False
    )

    _delete_master_schedule(db, master.id, indie_id)
    _deactivate_master_services(db, master.id, indie_id)
    _delete_master_crm_and_loyalty(db, master.id, indie_id)
    _deactivate_master_public_page(db, master, indie)
    _deactivate_master_promo_campaigns(db, master.id)
    _stop_subscriptions(db, user.id)
    _clear_user_auth_side_tables(db, user.id)

    master.is_deleted = True
    master.deleted_at = now
    _anonymize_user_pii(user, display, now)

    return AccountDeletionResult(
        user_id=user.id,
        role="master",
        already_deleted=False,
        master_id=master.id,
    )


def _delete_client_phone_keyed(db: Session, phone: Optional[str]) -> None:
    if not phone:
        return
    db.query(PersonalDiscount).filter(PersonalDiscount.client_phone == phone).delete(
        synchronize_session=False
    )
    db.query(ClientRestriction).filter(ClientRestriction.client_phone == phone).delete(
        synchronize_session=False
    )
    db.query(MasterClientMetadata).filter(MasterClientMetadata.client_phone == phone).delete(
        synchronize_session=False
    )
    db.query(ClientNote).filter(ClientNote.client_phone == phone).delete(
        synchronize_session=False
    )


def _anonymize_client(db: Session, user: User) -> AccountDeletionResult:
    now = _now()
    if is_user_deleted(user):
        return AccountDeletionResult(
            user_id=user.id,
            role="client",
            already_deleted=True,
            message="Аккаунт уже удалён",
        )

    old_phone = user.phone
    display = deleted_client_display_name(user.id)

    _cancel_future_bookings_for_client(
        db,
        client_id=user.id,
        cancelled_by_user_id=user.id,
        reason=CLIENT_ACCOUNT_DELETED_REASON,
    )

    db.query(TemporaryBooking).filter(TemporaryBooking.client_id == user.id).delete(
        synchronize_session=False
    )
    db.query(ClientFavorite).filter(ClientFavorite.client_id == user.id).delete(
        synchronize_session=False
    )
    db.query(ClientMasterNote).filter(ClientMasterNote.client_id == user.id).delete(
        synchronize_session=False
    )
    db.query(ClientSalonNote).filter(ClientSalonNote.client_id == user.id).delete(
        synchronize_session=False
    )
    # Баллы клиента у всех мастеров — персональные данные программы; при удалении аккаунта снимаем ledger.
    db.query(LoyaltyTransaction).filter(LoyaltyTransaction.client_id == user.id).delete(
        synchronize_session=False
    )
    _delete_client_phone_keyed(db, old_phone)
    _clear_user_auth_side_tables(db, user.id)
    _stop_subscriptions(db, user.id)
    _anonymize_user_pii(user, display, now)

    return AccountDeletionResult(
        user_id=user.id,
        role="client",
        already_deleted=False,
    )


def delete_account(db: Session, user: User, *, commit: bool = True) -> AccountDeletionResult:
    """
    Удаляет/анонимизирует аккаунт по роли.
    При ошибке — rollback. Один commit в конце (если commit=True).
    """
    if user is None:
        raise ValueError("user is required")

    role = user.role
    role_val = role.value if hasattr(role, "value") else str(role)

    try:
        with db.no_autoflush:
            if role in (UserRole.MASTER, UserRole.INDIE) or role_val in ("master", "indie"):
                result = _anonymize_master(db, user)
            elif role == UserRole.CLIENT or role_val == "client":
                result = _anonymize_client(db, user)
            else:
                raise ValueError(f"Account deletion is not supported for role={role_val}")

        if commit:
            db.commit()
        return result
    except Exception:
        db.rollback()
        logger.exception("account_deletion failed for user_id=%s", getattr(user, "id", None))
        raise

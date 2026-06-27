import math
import secrets
import string
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    Master,
    Payment,
    PromoCampaign,
    PromoCampaignStatus,
    PromoCampaignType,
    PromoCategory,
    PromoCodeStatus,
    PromoEngineCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromoReferrerType,
    PromoRewardType,
    PromoRewardGrant,
    PromoRewardGrantStatus,
    PromoRewardRecipientRole,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionType,
    User,
    UserRole,
)


ACTIVE_REDEMPTION_STATUSES = (
    PromoRedemptionStatus.PENDING_FIRST_PAYMENT,
    PromoRedemptionStatus.REDEEMED,
)

DEFAULT_BENEFICIARY_POINTS_CONFIG = {"1": 0, "3": 15, "6": 20, "12": 25}
DEFAULT_REFERRER_POINTS_CONFIG = {"1": 0, "3": 15, "6": 15, "12": 15}
MASTER_REFERRAL_SHARED_CAMPAIGN_NAME = "Реферальные коды мастеров"


class PromoEngineError(ValueError):
    """Domain-level validation error for promo-engine operations."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PromoValidationResult:
    campaign: PromoCampaign
    promo_code: PromoEngineCode
    master: Master
    referrer_master_id: Optional[int]
    referrer_type: Optional[PromoReferrerType]


@dataclass(frozen=True)
class PromoRewardApplyResult:
    applied: bool
    reason: Optional[str] = None
    redemption_id: Optional[int] = None
    beneficiary_points: int = 0
    referrer_points: int = 0
    grants_created: int = 0
    ledger_entries_created: int = 0


def normalize_promo_code(code: str) -> str:
    normalized = "".join(str(code or "").strip().upper().split())
    if not normalized:
        raise PromoEngineError("empty_code", "Промокод не может быть пустым")
    return normalized


def get_beneficiary_subscription_points_percent(period_months: int) -> int:
    return {1: 0, 3: 15, 6: 20, 12: 25}.get(int(period_months or 0), 0)


def get_referrer_subscription_points_percent(
    period_months: int,
    campaign_type: Union[str, PromoCampaignType],
) -> int:
    value = campaign_type.value if isinstance(campaign_type, PromoCampaignType) else str(campaign_type or "")
    if value != PromoCampaignType.MASTER_REFERRAL.value:
        return 0
    if int(period_months or 0) < 3:
        return 0
    return 15


def calculate_subscription_points(base_amount: float, percent: float) -> int:
    amount = max(0.0, float(base_amount or 0.0))
    pct = max(0.0, float(percent or 0.0))
    if amount <= 0 or pct <= 0:
        return 0
    return int(math.floor(amount * pct / 100.0))


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) < 4:
        return None
    tail = digits[-2:]
    if digits.startswith("7") and len(digits) == 11:
        return f"+7 {digits[1:4]} ***-**-{tail}"
    return f"***-**-{tail}"


def mask_name(name: Optional[str]) -> Optional[str]:
    parts = [p for p in str(name or "").strip().split() if p]
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[1][0]}."


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def build_expected_bonus_by_period() -> Dict[str, int]:
    return {str(months): get_beneficiary_subscription_points_percent(months) for months in (1, 3, 6, 12)}


def _campaign_type_value(redemption: PromoRedemption) -> str:
    return _enum_value(redemption.campaign_type_snapshot)


def serialize_current_redemption(redemption: Optional[PromoRedemption]) -> Optional[dict]:
    if not redemption:
        return None
    return {
        "code": redemption.code.code if redemption.code else None,
        "campaign_type": _campaign_type_value(redemption),
        "promo_category": _enum_value(redemption.promo_category_snapshot),
        "status": _enum_value(redemption.status),
        "applied_at": redemption.applied_at,
        "expected_bonus_by_period": build_expected_bonus_by_period(),
    }


def build_promo_apply_response(redemption: PromoRedemption) -> dict:
    data = serialize_current_redemption(redemption) or {}
    data["message"] = "Промокод применён. Бонусные баллы будут начислены после первой оплаты подписки."
    return data


def build_promo_preview_for_subscription_calculation(
    db: Session,
    master_id: int,
    period_months: int,
    amount: float,
) -> Optional[dict]:
    redemption = get_current_acquisition_redemption(db, master_id)
    if not redemption:
        return None
    percent = get_beneficiary_subscription_points_percent(period_months)
    points_amount = calculate_subscription_points(amount, percent)
    eligible = percent > 0 and points_amount > 0
    return {
        "code": redemption.code.code if redemption.code else None,
        "campaign_type": _campaign_type_value(redemption),
        "eligible": eligible,
        "period_months": int(period_months or 0),
        "percent": percent,
        "points_amount": points_amount,
        "label": f"+{points_amount} бонусных баллов после оплаты"
        if eligible
        else "Бонус доступен при оплате от 3 месяцев",
        "ineligible_reason": None if eligible else "minimum_period_3_months",
    }


def get_referral_stats(db: Session, master_id: int) -> dict:
    applied_count = (
        db.query(func.count(PromoRedemption.id))
        .filter(PromoRedemption.referrer_master_id == master_id)
        .scalar()
        or 0
    )
    paid_count = (
        db.query(func.count(PromoRedemption.id))
        .filter(
            PromoRedemption.referrer_master_id == master_id,
            PromoRedemption.status == PromoRedemptionStatus.REDEEMED,
        )
        .scalar()
        or 0
    )
    rewards_total_points = (
        db.query(func.coalesce(func.sum(PromoRewardGrant.points_amount), 0))
        .filter(
            PromoRewardGrant.recipient_master_id == master_id,
            PromoRewardGrant.recipient_role == PromoRewardRecipientRole.REFERRER,
            PromoRewardGrant.status == PromoRewardGrantStatus.APPLIED,
        )
        .scalar()
        or 0
    )
    rewards_pending_count = (
        db.query(func.count(PromoRewardGrant.id))
        .filter(
            PromoRewardGrant.recipient_master_id == master_id,
            PromoRewardGrant.recipient_role == PromoRewardRecipientRole.REFERRER,
            PromoRewardGrant.status == PromoRewardGrantStatus.PENDING,
        )
        .scalar()
        or 0
    )
    return {
        "applied_count": int(applied_count),
        "paid_count": int(paid_count),
        "rewards_total_points": int(rewards_total_points),
        "rewards_pending_count": int(rewards_pending_count),
    }


def get_payment_period_months(db: Session, payment: Payment) -> Optional[int]:
    meta = payment.payment_metadata or {}
    for key in ("selected_duration", "duration_months"):
        value = meta.get(key)
        if value in (1, 3, 6, 12, "1", "3", "6", "12"):
            return int(value)

    calculation_id = meta.get("calculation_id")
    if calculation_id:
        from models import SubscriptionPriceSnapshot

        snapshot = (
            db.query(SubscriptionPriceSnapshot)
            .filter(
                SubscriptionPriceSnapshot.id == int(calculation_id),
                SubscriptionPriceSnapshot.user_id == payment.user_id,
            )
            .first()
        )
        if snapshot and snapshot.duration_months in (1, 3, 6, 12):
            return int(snapshot.duration_months)

    if payment.subscription:
        try:
            days = int((payment.subscription.end_date - payment.subscription.start_date).days)
        except Exception:
            days = 0
        if days <= 45:
            return 1
        if days <= 120:
            return 3
        if days <= 240:
            return 6
        if days <= 420:
            return 12
    return None


def get_payment_base_amount(db: Session, payment: Payment) -> float:
    return max(0.0, float(payment.amount or 0.0))


def _has_prior_successful_paid_subscription_payment(db: Session, master: Master, payment: Payment) -> bool:
    query = (
        db.query(Payment.id)
        .filter(
            Payment.user_id == master.user_id,
            Payment.payment_type == "subscription",
            Payment.status == "paid",
            Payment.paid_at.isnot(None),
            Payment.subscription_apply_status == "applied",
            Payment.subscription_id.isnot(None),
            Payment.id != payment.id,
        )
    )
    if payment.paid_at:
        query = query.filter(Payment.paid_at < payment.paid_at)
    return query.first() is not None


def _build_reward_metadata(
    *,
    redemption: PromoRedemption,
    payment: Payment,
    period_months: int,
    base_amount: float,
    percent: int,
    recipient_role: PromoRewardRecipientRole,
) -> dict:
    invited_master = redemption.redeemer_master
    invited_user = invited_master.user if invited_master else None
    metadata = {
        "promo_code": redemption.code.code if redemption.code else None,
        "campaign_id": redemption.campaign_id,
        "campaign_type": _enum_value(redemption.campaign_type_snapshot),
        "redemption_id": redemption.id,
        "payment_id": payment.id,
        "period_months": period_months,
        "base_amount": base_amount,
        "percent": percent,
        "recipient_role": _enum_value(recipient_role),
    }
    if recipient_role == PromoRewardRecipientRole.REFERRER:
        metadata.update(
            {
                "invited_master_id": redemption.redeemer_master_id,
                "invited_master_name_masked": mask_name(getattr(invited_user, "full_name", None)),
                "invited_master_phone_masked": mask_phone(getattr(invited_user, "phone", None)),
                "source_label": "Приглашённый мастер",
            }
        )
    else:
        metadata.update(
            {
                "referrer_master_id": redemption.referrer_master_id,
                "source_label": "Промокод",
            }
        )
    return metadata


def create_or_apply_reward_grant(
    db: Session,
    *,
    redemption: PromoRedemption,
    payment: Payment,
    recipient_master_id: int,
    recipient_role: PromoRewardRecipientRole,
    percent: int,
    base_amount: float,
    points_amount: int,
    period_months: int,
    description: str,
) -> tuple[PromoRewardGrant, bool, bool]:
    grant = (
        db.query(PromoRewardGrant)
        .filter(
            PromoRewardGrant.redemption_id == redemption.id,
            PromoRewardGrant.recipient_role == recipient_role,
        )
        .with_for_update()
        .first()
    )
    grant_created = False
    ledger_created = False
    metadata = _build_reward_metadata(
        redemption=redemption,
        payment=payment,
        period_months=period_months,
        base_amount=base_amount,
        percent=percent,
        recipient_role=recipient_role,
    )
    if not grant:
        grant = PromoRewardGrant(
            redemption_id=redemption.id,
            recipient_master_id=recipient_master_id,
            recipient_role=recipient_role,
            reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
            reward_percent=percent,
            base_amount=base_amount,
            points_amount=points_amount,
            status=PromoRewardGrantStatus.PENDING,
            payment_id=payment.id,
            source_label=metadata.get("source_label"),
            extra_metadata=metadata,
        )
        db.add(grant)
        db.flush()
        grant_created = True

    if grant.status == PromoRewardGrantStatus.APPLIED and grant.subscription_points_ledger_id:
        return grant, grant_created, ledger_created

    if not grant.subscription_points_ledger_id:
        entry = create_subscription_points_credit(
            db,
            master_id=recipient_master_id,
            amount=points_amount,
            source_type=SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
            source_id=grant.id,
            description=description,
            metadata=metadata,
        )
        if entry:
            grant.subscription_points_ledger_id = entry.id
            ledger_created = True

    grant.status = PromoRewardGrantStatus.APPLIED
    grant.applied_at = datetime.utcnow()
    grant.payment_id = payment.id
    grant.reward_percent = percent
    grant.base_amount = base_amount
    grant.points_amount = points_amount
    grant.extra_metadata = metadata
    return grant, grant_created, ledger_created


def apply_promo_rewards_for_first_payment(db: Session, payment_or_id: Union[int, Payment]) -> PromoRewardApplyResult:
    payment = (
        db.query(Payment).filter(Payment.id == int(payment_or_id)).with_for_update().first()
        if isinstance(payment_or_id, int)
        else payment_or_id
    )
    if not payment:
        return PromoRewardApplyResult(applied=False, reason="payment_not_found")
    if payment.payment_type != "subscription":
        return PromoRewardApplyResult(applied=False, reason="not_subscription_payment")
    if (
        payment.status != "paid"
        or not payment.paid_at
        or payment.subscription_apply_status != "applied"
        or not payment.subscription_id
    ):
        return PromoRewardApplyResult(applied=False, reason="payment_not_applied")

    master = db.query(Master).filter(Master.user_id == payment.user_id).with_for_update().first()
    if not master:
        return PromoRewardApplyResult(applied=False, reason="master_not_found")

    redemption = get_current_acquisition_redemption(db, master.id)
    if not redemption:
        return PromoRewardApplyResult(applied=False, reason="no_pending_redemption")
    redemption = (
        db.query(PromoRedemption)
        .filter(PromoRedemption.id == redemption.id)
        .with_for_update()
        .first()
    )
    if not redemption:
        return PromoRewardApplyResult(applied=False, reason="no_pending_redemption")

    if redemption.status == PromoRedemptionStatus.REDEEMED:
        if redemption.first_payment_id == payment.id:
            return PromoRewardApplyResult(applied=False, reason="already_applied", redemption_id=redemption.id)
        return PromoRewardApplyResult(applied=False, reason="redemption_already_redeemed", redemption_id=redemption.id)
    if redemption.status != PromoRedemptionStatus.PENDING_FIRST_PAYMENT:
        return PromoRewardApplyResult(applied=False, reason="no_pending_redemption", redemption_id=redemption.id)
    if _has_prior_successful_paid_subscription_payment(db, master, payment):
        return PromoRewardApplyResult(applied=False, reason="not_first_payment", redemption_id=redemption.id)

    period_months = get_payment_period_months(db, payment)
    if period_months not in (1, 3, 6, 12):
        return PromoRewardApplyResult(applied=False, reason="unknown_period", redemption_id=redemption.id)

    base_amount = get_payment_base_amount(db, payment)
    beneficiary_percent = get_beneficiary_subscription_points_percent(period_months)
    beneficiary_points = calculate_subscription_points(base_amount, beneficiary_percent)
    referrer_percent = get_referrer_subscription_points_percent(period_months, redemption.campaign_type_snapshot)
    referrer_points = calculate_subscription_points(base_amount, referrer_percent)
    grants_created = 0
    ledger_entries_created = 0

    if beneficiary_points > 0:
        _, grant_created, ledger_created = create_or_apply_reward_grant(
            db,
            redemption=redemption,
            payment=payment,
            recipient_master_id=redemption.redeemer_master_id,
            recipient_role=PromoRewardRecipientRole.BENEFICIARY,
            percent=beneficiary_percent,
            base_amount=base_amount,
            points_amount=beneficiary_points,
            period_months=period_months,
            description=f"Бонусные баллы по промокоду {redemption.code.code if redemption.code else ''}".strip(),
        )
        grants_created += int(grant_created)
        ledger_entries_created += int(ledger_created)

    can_create_referrer = (
        redemption.campaign_type_snapshot == PromoCampaignType.MASTER_REFERRAL
        and redemption.referrer_master_id
        and redemption.referrer_master_id != redemption.redeemer_master_id
        and period_months >= 3
        and referrer_points > 0
    )
    if can_create_referrer:
        _, grant_created, ledger_created = create_or_apply_reward_grant(
            db,
            redemption=redemption,
            payment=payment,
            recipient_master_id=redemption.referrer_master_id,
            recipient_role=PromoRewardRecipientRole.REFERRER,
            percent=referrer_percent,
            base_amount=base_amount,
            points_amount=referrer_points,
            period_months=period_months,
            description="Бонусные баллы за приглашение мастера",
        )
        grants_created += int(grant_created)
        ledger_entries_created += int(ledger_created)

    redemption.status = PromoRedemptionStatus.REDEEMED
    redemption.first_payment_id = payment.id
    redemption.first_payment_amount = base_amount
    redemption.first_payment_period_months = period_months
    redemption.redeemed_at = datetime.utcnow()

    return PromoRewardApplyResult(
        applied=(beneficiary_points > 0 or referrer_points > 0),
        reason=None if (beneficiary_points > 0 or referrer_points > 0) else "no_points_for_period",
        redemption_id=redemption.id,
        beneficiary_points=beneficiary_points,
        referrer_points=referrer_points if can_create_referrer else 0,
        grants_created=grants_created,
        ledger_entries_created=ledger_entries_created,
    )


def _get_master_for_update(db: Session, master_id: int) -> Optional[Master]:
    return (
        db.query(Master)
        .filter(Master.id == master_id)
        .with_for_update()
        .first()
    )


def _assert_master_can_use_promo(master: Optional[Master]) -> Master:
    if not master:
        raise PromoEngineError("master_not_found", "Профиль мастера не найден")
    user = master.user
    if not user or not user.is_active:
        raise PromoEngineError("master_inactive", "Мастер неактивен")
    if user.role not in (UserRole.MASTER, UserRole.INDIE):
        raise PromoEngineError("master_only", "Промокод доступен только мастеру")
    return master


def has_successful_paid_subscription_payment(db: Session, master_id: int) -> bool:
    master = db.query(Master).filter(Master.id == master_id).first()
    if not master:
        return False
    return (
        db.query(Payment.id)
        .filter(
            Payment.user_id == master.user_id,
            Payment.payment_type == "subscription",
            Payment.status == "paid",
            Payment.paid_at.isnot(None),
            Payment.subscription_apply_status == "applied",
            Payment.subscription_id.isnot(None),
        )
        .first()
        is not None
    )


def get_current_acquisition_redemption(db: Session, master_id: int) -> Optional[PromoRedemption]:
    return (
        db.query(PromoRedemption)
        .filter(
            PromoRedemption.redeemer_master_id == master_id,
            PromoRedemption.promo_category_snapshot == PromoCategory.ACQUISITION,
            PromoRedemption.status.in_(ACTIVE_REDEMPTION_STATUSES),
        )
        .order_by(PromoRedemption.applied_at.desc())
        .first()
    )


def _check_campaign_limits(db: Session, campaign: PromoCampaign, master_id: int) -> None:
    if campaign.max_total_redemptions is not None:
        total = (
            db.query(func.count(PromoRedemption.id))
            .filter(
                PromoRedemption.campaign_id == campaign.id,
                PromoRedemption.status.in_(ACTIVE_REDEMPTION_STATUSES),
            )
            .scalar()
            or 0
        )
        if total >= campaign.max_total_redemptions:
            raise PromoEngineError("campaign_limit_reached", "Лимит кампании исчерпан")

    per_user = int(campaign.max_redemptions_per_user or 1)
    used_by_master = (
        db.query(func.count(PromoRedemption.id))
        .filter(
            PromoRedemption.campaign_id == campaign.id,
            PromoRedemption.redeemer_master_id == master_id,
            PromoRedemption.status.in_(ACTIVE_REDEMPTION_STATUSES),
        )
        .scalar()
        or 0
    )
    if used_by_master >= per_user:
        raise PromoEngineError("campaign_user_limit_reached", "Лимит промокода для мастера исчерпан")


def validate_promo_code_for_master(
    db: Session,
    master_id: int,
    code: str,
    promo_category: Union[PromoCategory, str] = PromoCategory.ACQUISITION,
) -> PromoValidationResult:
    normalized = normalize_promo_code(code)
    category = promo_category if isinstance(promo_category, PromoCategory) else PromoCategory(str(promo_category))
    now = datetime.utcnow()

    master = _assert_master_can_use_promo(_get_master_for_update(db, master_id))

    promo_code = (
        db.query(PromoEngineCode)
        .filter(PromoEngineCode.code == normalized)
        .with_for_update()
        .first()
    )
    if not promo_code:
        raise PromoEngineError("code_not_found", "Промокод не найден")
    if promo_code.status != PromoCodeStatus.ACTIVE:
        raise PromoEngineError("code_inactive", "Промокод отключён")

    campaign = promo_code.campaign
    if not campaign:
        raise PromoEngineError("campaign_not_found", "Кампания не найдена")
    if campaign.status != PromoCampaignStatus.ACTIVE:
        raise PromoEngineError("campaign_inactive", "Кампания неактивна")
    if campaign.starts_at and campaign.starts_at > now:
        raise PromoEngineError("campaign_not_started", "Кампания ещё не началась")
    if campaign.ends_at and campaign.ends_at < now:
        raise PromoEngineError("campaign_expired", "Кампания истекла")
    if campaign.promo_category != category:
        raise PromoEngineError("wrong_category", "Промокод недоступен для этой категории")
    if campaign.eligible_subscription_type != SubscriptionType.MASTER:
        raise PromoEngineError("wrong_subscription_type", "Промокод недоступен для мастеров")
    if campaign.first_payment_only and has_successful_paid_subscription_payment(db, master_id):
        raise PromoEngineError("first_payment_already_done", "Промокод доступен только до первой оплаты")
    if get_current_acquisition_redemption(db, master_id):
        raise PromoEngineError("acquisition_promo_already_used", "Промокод уже применён")
    if promo_code.max_redemptions is not None and promo_code.current_redemptions >= promo_code.max_redemptions:
        raise PromoEngineError("code_limit_reached", "Промокод исчерпан")

    _check_campaign_limits(db, campaign, master_id)

    referrer_master_id = None
    referrer_type = campaign.referrer_type
    if campaign.type == PromoCampaignType.MASTER_REFERRAL:
        referrer_master_id = campaign.owner_master_id
        if not referrer_master_id and promo_code.assigned_to_user_id:
            referrer = db.query(Master).filter(Master.user_id == promo_code.assigned_to_user_id).first()
            referrer_master_id = referrer.id if referrer else None
        referrer_type = PromoReferrerType.MASTER
        if not referrer_master_id:
            raise PromoEngineError("referrer_missing", "Владелец реферального кода не найден")
        if referrer_master_id == master_id:
            raise PromoEngineError("self_referral", "Нельзя применить собственный промокод")
    elif campaign.type == PromoCampaignType.ADMIN_CAMPAIGN:
        referrer_type = PromoReferrerType.ADMIN_CAMPAIGN

    return PromoValidationResult(
        campaign=campaign,
        promo_code=promo_code,
        master=master,
        referrer_master_id=referrer_master_id,
        referrer_type=referrer_type,
    )


def create_pending_redemption(db: Session, master_id: int, code: str) -> PromoRedemption:
    result = validate_promo_code_for_master(db, master_id, code, PromoCategory.ACQUISITION)
    campaign = result.campaign
    promo_code = result.promo_code
    master = result.master

    redemption = PromoRedemption(
        campaign_id=campaign.id,
        code_id=promo_code.id,
        redeemer_user_id=master.user_id,
        redeemer_master_id=master.id,
        promo_category_snapshot=campaign.promo_category,
        campaign_type_snapshot=campaign.type,
        referrer_type_snapshot=result.referrer_type,
        referrer_master_id=result.referrer_master_id,
        referrer_campaign_id=campaign.id if campaign.type == PromoCampaignType.ADMIN_CAMPAIGN else None,
        status=PromoRedemptionStatus.PENDING_FIRST_PAYMENT,
        beneficiary_reward_type_snapshot=campaign.beneficiary_reward_type,
        beneficiary_reward_value_snapshot=campaign.beneficiary_reward_config,
        referrer_reward_type_snapshot=campaign.referrer_reward_type,
        referrer_reward_value_snapshot=campaign.referrer_reward_config,
        extra_metadata={"reserved_usage_on_apply": True},
    )
    promo_code.current_redemptions += 1
    db.add(redemption)
    db.flush()
    return redemption


def get_subscription_points_balance(db: Session, master_id: int) -> int:
    total = (
        db.query(func.coalesce(func.sum(SubscriptionPointsLedger.remaining_amount), 0))
        .filter(
            SubscriptionPointsLedger.master_id == master_id,
            SubscriptionPointsLedger.status == SubscriptionPointsStatus.ACTIVE,
            SubscriptionPointsLedger.direction == SubscriptionPointsDirection.CREDIT,
            SubscriptionPointsLedger.remaining_amount > 0,
        )
        .scalar()
        or 0
    )
    return int(total)


def list_subscription_points_history(
    db: Session,
    master_id: int,
    limit: int = 50,
) -> List[SubscriptionPointsLedger]:
    safe_limit = max(1, min(int(limit or 50), 200))
    return (
        db.query(SubscriptionPointsLedger)
        .filter(SubscriptionPointsLedger.master_id == master_id)
        .order_by(SubscriptionPointsLedger.created_at.desc(), SubscriptionPointsLedger.id.desc())
        .limit(safe_limit)
        .all()
    )


def create_subscription_points_credit(
    db: Session,
    master_id: int,
    amount: int,
    source_type: SubscriptionPointsSourceType,
    source_id: Optional[int],
    description: Optional[str],
    metadata: Optional[dict] = None,
) -> Optional[SubscriptionPointsLedger]:
    points = int(amount or 0)
    if points <= 0:
        return None
    entry = SubscriptionPointsLedger(
        master_id=master_id,
        amount=points,
        remaining_amount=points,
        direction=SubscriptionPointsDirection.CREDIT,
        source_type=source_type,
        source_id=source_id,
        status=SubscriptionPointsStatus.ACTIVE,
        description=description,
        expires_at=None,
        extra_metadata=metadata,
    )
    db.add(entry)
    db.flush()
    return entry


def generate_master_referral_code(master: Master) -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"M{int(master.id)}{suffix}"


def get_or_create_master_referral_shared_campaign(db: Session) -> PromoCampaign:
    campaign = (
        db.query(PromoCampaign)
        .filter(
            PromoCampaign.type == PromoCampaignType.MASTER_REFERRAL,
            PromoCampaign.promo_category == PromoCategory.ACQUISITION,
            PromoCampaign.owner_master_id.is_(None),
            PromoCampaign.name == MASTER_REFERRAL_SHARED_CAMPAIGN_NAME,
        )
        .order_by(PromoCampaign.created_at.asc(), PromoCampaign.id.asc())
        .first()
    )
    if campaign:
        return campaign

    campaign = PromoCampaign(
        name=MASTER_REFERRAL_SHARED_CAMPAIGN_NAME,
        promo_category=PromoCategory.ACQUISITION,
        type=PromoCampaignType.MASTER_REFERRAL,
        status=PromoCampaignStatus.ACTIVE,
        owner_master_id=None,
        eligible_subscription_type=SubscriptionType.MASTER,
        eligible_period_months=[3, 6, 12],
        first_payment_only=True,
        beneficiary_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_config=DEFAULT_BENEFICIARY_POINTS_CONFIG,
        referrer_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        referrer_reward_config=DEFAULT_REFERRER_POINTS_CONFIG,
        referrer_type=PromoReferrerType.MASTER,
    )
    db.add(campaign)
    db.flush()
    return campaign


def ensure_master_referral_code(db: Session, master_id: int) -> PromoEngineCode:
    master = _assert_master_can_use_promo(_get_master_for_update(db, master_id))
    existing = (
        db.query(PromoEngineCode)
        .join(PromoCampaign, PromoEngineCode.campaign_id == PromoCampaign.id)
        .filter(
            PromoCampaign.type == PromoCampaignType.MASTER_REFERRAL,
            PromoCampaign.promo_category == PromoCategory.ACQUISITION,
            PromoEngineCode.status == PromoCodeStatus.ACTIVE,
        )
        .filter(
            (PromoEngineCode.assigned_to_user_id == master.user_id)
            | (PromoCampaign.owner_master_id == master.id)
        )
        .order_by(PromoEngineCode.created_at.asc())
        .first()
    )
    if existing:
        return existing

    campaign = get_or_create_master_referral_shared_campaign(db)

    for _ in range(10):
        candidate = generate_master_referral_code(master)
        if not db.query(PromoEngineCode.id).filter(PromoEngineCode.code == candidate).first():
            code = PromoEngineCode(
                campaign_id=campaign.id,
                code=candidate,
                status=PromoCodeStatus.ACTIVE,
                assigned_to_user_id=master.user_id,
            )
            db.add(code)
            db.flush()
            return code
    raise PromoEngineError("code_generation_failed", "Не удалось создать уникальный промокод")

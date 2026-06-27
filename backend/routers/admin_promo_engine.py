import csv
import io
import secrets
import string
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from models import (
    PromoCampaign,
    PromoCampaignStatus,
    PromoCampaignType,
    PromoCategory,
    PromoCodeStatus,
    PromoEngineCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromoRewardGrant,
    PromoRewardGrantStatus,
    PromoRewardType,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionType,
    Master,
    User,
    UserRole,
)
from services.promo_engine import (
    MASTER_REFERRAL_SHARED_CAMPAIGN_NAME,
    ensure_master_referral_code,
    get_or_create_master_referral_shared_campaign,
    normalize_promo_code,
    PromoEngineError,
)


router = APIRouter(
    prefix="/admin/promo-engine",
    tags=["admin-promo-engine"],
    dependencies=[Depends(require_admin)],
)

SUPPORTED_PERIODS = (1, 3, 6, 12)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _parse_enum(enum_cls, value: Any, field_name: str):
    if value is None:
        return None
    if isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(str(value))
    except ValueError:
        allowed = ", ".join(item.value for item in enum_cls)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверное значение {field_name}: {value}. Допустимо: {allowed}",
        )


def _validate_json_config(value: Any, field_name: str) -> Any:
    if value is None:
        return None
    if not isinstance(value, (dict, list)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} должен быть JSON object/array",
        )
    return value


def _periods_from_min_months(value: Optional[int]) -> Optional[list[int]]:
    if value is None:
        return None
    months = int(value)
    if months < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_subscription_months должен быть >= 0",
        )
    if months == 0:
        return list(SUPPORTED_PERIODS)
    return [period for period in SUPPORTED_PERIODS if period >= months]


def _subscription_type_from_roles(roles: Optional[Any]) -> SubscriptionType:
    if roles is None:
        return SubscriptionType.MASTER
    if not isinstance(roles, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="eligible_roles должен быть JSON array",
        )
    normalized = {str(role).strip().lower() for role in roles}
    if normalized <= {"master", "indie"} and normalized:
        return SubscriptionType.MASTER
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="В MVP promo-engine поддерживает eligible_roles только для master/indie",
    )


class CampaignCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    promo_category: str = PromoCategory.ACQUISITION.value
    type: str = PromoCampaignType.ADMIN_CAMPAIGN.value
    status: str = PromoCampaignStatus.ACTIVE.value
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_total_redemptions: Optional[int] = None
    max_redemptions_per_user: Optional[int] = None
    first_payment_only: Optional[bool] = True
    min_subscription_months: Optional[int] = None
    eligible_roles: Optional[Any] = None
    reward_config: Optional[Any] = None
    referrer_reward_config: Optional[Any] = None
    beneficiary_reward_config: Optional[Any] = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("name required")
        return normalized


class CampaignPatchRequest(BaseModel):
    name: Optional[str] = None
    promo_category: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_total_redemptions: Optional[int] = None
    max_redemptions_per_user: Optional[int] = None
    first_payment_only: Optional[bool] = None
    min_subscription_months: Optional[int] = None
    eligible_roles: Optional[Any] = None
    reward_config: Optional[Any] = None
    referrer_reward_config: Optional[Any] = None
    beneficiary_reward_config: Optional[Any] = None


class CodeCreateRequest(BaseModel):
    campaign_id: int
    code: str = Field(..., min_length=1)
    status: Optional[str] = PromoCodeStatus.ACTIVE.value
    max_redemptions: Optional[int] = None
    assigned_to_user_id: Optional[int] = None


class CodePatchRequest(BaseModel):
    code: Optional[str] = None
    status: Optional[str] = None
    max_redemptions: Optional[int] = None
    assigned_to_user_id: Optional[int] = None


class BulkCodeCreateRequest(BaseModel):
    campaign_id: int
    count: int = Field(..., ge=1, le=1000)
    prefix: Optional[str] = None
    code_length: Optional[int] = 8
    max_redemptions: Optional[int] = None
    status: Optional[str] = PromoCodeStatus.ACTIVE.value


def _validate_dates(starts_at: Optional[datetime], ends_at: Optional[datetime]) -> None:
    if starts_at and ends_at and ends_at < starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at должен быть >= starts_at",
        )


def _get_campaign_or_404(db: Session, campaign_id: int) -> PromoCampaign:
    campaign = db.query(PromoCampaign).filter(PromoCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Кампания не найдена")
    return campaign


def _get_code_or_404(db: Session, code_id: int) -> PromoEngineCode:
    code = db.query(PromoEngineCode).filter(PromoEngineCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Промокод не найден")
    return code


def _validate_assigned_user(db: Session, user_id: Optional[int]) -> None:
    if user_id is None:
        return
    exists = db.query(User.id).filter(User.id == user_id).first()
    if not exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="assigned_to_user_id не найден")


def _normalize_code_or_400(code: str) -> str:
    try:
        return normalize_promo_code(code)
    except PromoEngineError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)


def _master_referral_code_query(db: Session, master: Master):
    return (
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
        .order_by(PromoEngineCode.created_at.asc(), PromoEngineCode.id.asc())
    )


def _generate_bulk_code(prefix: str, code_length: int) -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(code_length))
    return f"{prefix}{suffix}"


def _csv_escape(value: Any) -> Any:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _campaign_stats(db: Session, campaign_id: int) -> dict:
    redemptions_count = db.query(func.count(PromoRedemption.id)).filter(
        PromoRedemption.campaign_id == campaign_id
    ).scalar() or 0
    pending_count = db.query(func.count(PromoRedemption.id)).filter(
        PromoRedemption.campaign_id == campaign_id,
        PromoRedemption.status == PromoRedemptionStatus.PENDING_FIRST_PAYMENT,
    ).scalar() or 0
    redeemed_count = db.query(func.count(PromoRedemption.id)).filter(
        PromoRedemption.campaign_id == campaign_id,
        PromoRedemption.status == PromoRedemptionStatus.REDEEMED,
    ).scalar() or 0
    grants_query = db.query(PromoRewardGrant).join(PromoRedemption).filter(
        PromoRedemption.campaign_id == campaign_id
    )
    grants_count = grants_query.count()
    points_granted = grants_query.filter(
        PromoRewardGrant.status == PromoRewardGrantStatus.APPLIED
    ).with_entities(func.coalesce(func.sum(PromoRewardGrant.points_amount), 0)).scalar() or 0
    return {
        "codes_count": db.query(func.count(PromoEngineCode.id)).filter(
            PromoEngineCode.campaign_id == campaign_id
        ).scalar() or 0,
        "redemptions_count": redemptions_count,
        "pending_count": pending_count,
        "redeemed_count": redeemed_count,
        "grants_count": grants_count,
        "points_granted": int(points_granted),
    }


def _campaign_item(campaign: PromoCampaign, db: Optional[Session] = None) -> dict:
    is_master_referral_system = (
        campaign.type == PromoCampaignType.MASTER_REFERRAL
        and campaign.promo_category == PromoCategory.ACQUISITION
        and campaign.owner_master_id is None
        and campaign.name == MASTER_REFERRAL_SHARED_CAMPAIGN_NAME
    )
    item = {
        "id": campaign.id,
        "name": campaign.name,
        "is_master_referral_system": is_master_referral_system,
        "promo_category": _enum_value(campaign.promo_category),
        "type": _enum_value(campaign.type),
        "status": _enum_value(campaign.status),
        "starts_at": campaign.starts_at,
        "ends_at": campaign.ends_at,
        "max_total_redemptions": campaign.max_total_redemptions,
        "max_redemptions_per_user": campaign.max_redemptions_per_user,
        "eligible_subscription_type": _enum_value(campaign.eligible_subscription_type),
        "eligible_plan_ids": campaign.eligible_plan_ids,
        "eligible_period_months": campaign.eligible_period_months,
        "first_payment_only": campaign.first_payment_only,
        "beneficiary_reward_type": _enum_value(campaign.beneficiary_reward_type),
        "beneficiary_reward_config": campaign.beneficiary_reward_config,
        "referrer_reward_type": _enum_value(campaign.referrer_reward_type),
        "referrer_reward_config": campaign.referrer_reward_config,
        "referrer_type": _enum_value(campaign.referrer_type),
        "created_by_user_id": campaign.created_by_user_id,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
    }
    if db is not None:
        item["stats"] = _campaign_stats(db, campaign.id)
    return item


def _code_item(code: PromoEngineCode) -> dict:
    return {
        "id": code.id,
        "campaign_id": code.campaign_id,
        "campaign_name": code.campaign.name if code.campaign else None,
        "code": code.code,
        "status": _enum_value(code.status),
        "max_redemptions": code.max_redemptions,
        "current_redemptions": code.current_redemptions,
        "assigned_to_user_id": code.assigned_to_user_id,
        "created_at": code.created_at,
        "updated_at": code.updated_at,
    }


def _redemption_item(redemption: PromoRedemption) -> dict:
    return {
        "id": redemption.id,
        "campaign_id": redemption.campaign_id,
        "code_id": redemption.code_id,
        "code": redemption.code.code if redemption.code else None,
        "status": _enum_value(redemption.status),
        "redeemer_user_id": redemption.redeemer_user_id,
        "redeemer_master_id": redemption.redeemer_master_id,
        "referrer_master_id": redemption.referrer_master_id,
        "first_payment_id": redemption.first_payment_id,
        "first_payment_amount": redemption.first_payment_amount,
        "first_payment_period_months": redemption.first_payment_period_months,
        "applied_at": redemption.applied_at,
        "redeemed_at": redemption.redeemed_at,
        "campaign_type": _enum_value(redemption.campaign_type_snapshot),
        "promo_category": _enum_value(redemption.promo_category_snapshot),
    }


def _grant_item(grant: PromoRewardGrant) -> dict:
    return {
        "id": grant.id,
        "redemption_id": grant.redemption_id,
        "recipient_master_id": grant.recipient_master_id,
        "recipient_role": _enum_value(grant.recipient_role),
        "reward_type": _enum_value(grant.reward_type),
        "status": _enum_value(grant.status),
        "base_amount": grant.base_amount,
        "percent": grant.reward_percent,
        "points_amount": grant.points_amount,
        "ledger_entry_id": grant.subscription_points_ledger_id,
        "payment_id": grant.payment_id,
        "created_at": grant.created_at,
        "applied_at": grant.applied_at,
    }


def _ledger_item(entry: SubscriptionPointsLedger) -> dict:
    return {
        "id": entry.id,
        "master_id": entry.master_id,
        "amount": entry.amount,
        "remaining_amount": entry.remaining_amount,
        "direction": _enum_value(entry.direction),
        "source_type": _enum_value(entry.source_type),
        "source_id": entry.source_id,
        "status": _enum_value(entry.status),
        "description": entry.description,
        "metadata": entry.extra_metadata,
        "created_at": entry.created_at,
        "expires_at": entry.expires_at,
    }


def _paginated(query, skip: int, limit: int, serializer):
    total = query.order_by(None).count()
    items = query.offset(skip).limit(limit).all()
    return {
        "items": [serializer(item) for item in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


def _apply_campaign_payload(campaign: PromoCampaign, data: Dict[str, Any], db: Session) -> None:
    starts_at = data.get("starts_at", campaign.starts_at)
    ends_at = data.get("ends_at", campaign.ends_at)
    _validate_dates(starts_at, ends_at)

    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name required")
        campaign.name = name
    if "promo_category" in data and data["promo_category"] is not None:
        campaign.promo_category = _parse_enum(PromoCategory, data["promo_category"], "promo_category")
    if "type" in data and data["type"] is not None:
        campaign.type = _parse_enum(PromoCampaignType, data["type"], "type")
    if "status" in data and data["status"] is not None:
        campaign.status = _parse_enum(PromoCampaignStatus, data["status"], "status")
    if "starts_at" in data:
        campaign.starts_at = data["starts_at"]
    if "ends_at" in data:
        campaign.ends_at = data["ends_at"]
    if "max_total_redemptions" in data:
        value = data["max_total_redemptions"]
        if value is not None and int(value) < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_total_redemptions должен быть >= 0")
        campaign.max_total_redemptions = value
    if "max_redemptions_per_user" in data:
        value = data["max_redemptions_per_user"]
        if value is not None and int(value) < 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_redemptions_per_user должен быть >= 1")
        campaign.max_redemptions_per_user = value if value is not None else 1
    if "first_payment_only" in data and data["first_payment_only"] is not None:
        campaign.first_payment_only = bool(data["first_payment_only"])
    if "min_subscription_months" in data:
        campaign.eligible_period_months = _periods_from_min_months(data["min_subscription_months"])
    if "eligible_roles" in data:
        campaign.eligible_subscription_type = _subscription_type_from_roles(data["eligible_roles"])
    if "reward_config" in data and data["reward_config"] is not None:
        campaign.beneficiary_reward_config = _validate_json_config(data["reward_config"], "reward_config")
    if "beneficiary_reward_config" in data and data["beneficiary_reward_config"] is not None:
        campaign.beneficiary_reward_config = _validate_json_config(data["beneficiary_reward_config"], "beneficiary_reward_config")
    if "referrer_reward_config" in data:
        campaign.referrer_reward_config = _validate_json_config(data["referrer_reward_config"], "referrer_reward_config")

    campaign.beneficiary_reward_type = PromoRewardType.SUBSCRIPTION_POINTS
    if campaign.referrer_reward_config:
        campaign.referrer_reward_type = PromoRewardType.SUBSCRIPTION_POINTS


@router.get("/stats")
def get_promo_engine_stats(db: Session = Depends(get_db)) -> dict:
    return {
        "total_campaigns": db.query(func.count(PromoCampaign.id)).scalar() or 0,
        "active_campaigns": db.query(func.count(PromoCampaign.id)).filter(
            PromoCampaign.status == PromoCampaignStatus.ACTIVE
        ).scalar() or 0,
        "total_codes": db.query(func.count(PromoEngineCode.id)).scalar() or 0,
        "active_codes": db.query(func.count(PromoEngineCode.id)).filter(
            PromoEngineCode.status == PromoCodeStatus.ACTIVE
        ).scalar() or 0,
        "total_redemptions": db.query(func.count(PromoRedemption.id)).scalar() or 0,
        "pending_redemptions": db.query(func.count(PromoRedemption.id)).filter(
            PromoRedemption.status == PromoRedemptionStatus.PENDING_FIRST_PAYMENT
        ).scalar() or 0,
        "redeemed_redemptions": db.query(func.count(PromoRedemption.id)).filter(
            PromoRedemption.status == PromoRedemptionStatus.REDEEMED
        ).scalar() or 0,
        "total_grants": db.query(func.count(PromoRewardGrant.id)).scalar() or 0,
        "applied_grants": db.query(func.count(PromoRewardGrant.id)).filter(
            PromoRewardGrant.status == PromoRewardGrantStatus.APPLIED
        ).scalar() or 0,
        "total_points_granted": int(db.query(func.coalesce(func.sum(PromoRewardGrant.points_amount), 0)).filter(
            PromoRewardGrant.status == PromoRewardGrantStatus.APPLIED
        ).scalar() or 0),
        "total_ledger_entries": db.query(func.count(SubscriptionPointsLedger.id)).filter(
            SubscriptionPointsLedger.source_type == SubscriptionPointsSourceType.PROMO_REWARD_GRANT
        ).scalar() or 0,
        "total_ledger_points": int(db.query(func.coalesce(func.sum(SubscriptionPointsLedger.amount), 0)).filter(
            SubscriptionPointsLedger.source_type == SubscriptionPointsSourceType.PROMO_REWARD_GRANT
        ).scalar() or 0),
    }


@router.post("/master-referral-codes/backfill")
def backfill_master_referral_codes(db: Session = Depends(get_db)) -> dict:
    shared_before = (
        db.query(PromoCampaign.id)
        .filter(
            PromoCampaign.type == PromoCampaignType.MASTER_REFERRAL,
            PromoCampaign.promo_category == PromoCategory.ACQUISITION,
            PromoCampaign.owner_master_id.is_(None),
            PromoCampaign.name == MASTER_REFERRAL_SHARED_CAMPAIGN_NAME,
        )
        .first()
    )
    shared_campaign = get_or_create_master_referral_shared_campaign(db)
    if shared_before is None:
        db.commit()
        db.refresh(shared_campaign)
    masters = (
        db.query(Master)
        .join(User, Master.user_id == User.id)
        .filter(
            User.role.in_([UserRole.MASTER, UserRole.INDIE]),
            User.is_active.is_(True),
        )
        .order_by(Master.id.asc())
        .all()
    )
    summary = {
        "created_campaign": shared_before is None,
        "shared_campaign_id": shared_campaign.id,
        "created_codes": 0,
        "migrated_codes": 0,
        "skipped_existing": 0,
        "failed": 0,
        "items": [],
    }

    for master in masters:
        existing = _master_referral_code_query(db, master).first()
        if existing:
            if existing.assigned_to_user_id not in (None, master.user_id):
                summary["failed"] += 1
                summary["items"].append({
                    "master_id": master.id,
                    "user_id": master.user_id,
                    "status": "failed",
                    "code": existing.code,
                    "code_id": existing.id,
                    "error": "У промокода уже указан другой владелец",
                })
                continue

            changed = False
            if existing.assigned_to_user_id is None:
                existing.assigned_to_user_id = master.user_id
                changed = True
            if existing.campaign_id != shared_campaign.id:
                existing.campaign_id = shared_campaign.id
                changed = True

            if changed:
                try:
                    db.commit()
                    db.refresh(existing)
                except IntegrityError:
                    db.rollback()
                    summary["failed"] += 1
                    summary["items"].append({
                        "master_id": master.id,
                        "user_id": master.user_id,
                        "status": "failed",
                        "code": existing.code,
                        "code_id": existing.id,
                        "error": "Не удалось перенести промокод в общую кампанию",
                    })
                    continue
                summary["migrated_codes"] += 1
                item_status = "migrated"
            else:
                summary["skipped_existing"] += 1
                item_status = "skipped_existing"

            summary["items"].append({
                "master_id": master.id,
                "user_id": master.user_id,
                "status": item_status,
                "code": existing.code,
                "code_id": existing.id,
                "campaign_id": existing.campaign_id,
            })
            continue

        try:
            code = ensure_master_referral_code(db, master.id)
            db.commit()
            db.refresh(code)
            summary["created_codes"] += 1
            summary["items"].append({
                "master_id": master.id,
                "user_id": master.user_id,
                "status": "created",
                "code": code.code,
                "code_id": code.id,
                "campaign_id": code.campaign_id,
            })
        except PromoEngineError as exc:
            db.rollback()
            summary["failed"] += 1
            summary["items"].append({
                "master_id": master.id,
                "user_id": master.user_id,
                "status": "failed",
                "error": exc.message,
            })
        except IntegrityError:
            db.rollback()
            summary["failed"] += 1
            summary["items"].append({
                "master_id": master.id,
                "user_id": master.user_id,
                "status": "failed",
                "error": "Не удалось создать уникальный промокод",
            })

    return summary


@router.get("/campaigns")
def list_campaigns(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(PromoCampaign)
    if status:
        query = query.filter(PromoCampaign.status == _parse_enum(PromoCampaignStatus, status, "status"))
    if type:
        query = query.filter(PromoCampaign.type == _parse_enum(PromoCampaignType, type, "type"))
    if search:
        query = query.filter(PromoCampaign.name.ilike(f"%{search}%"))
    query = query.order_by(PromoCampaign.created_at.desc(), PromoCampaign.id.desc())
    return _paginated(query, skip, limit, lambda item: _campaign_item(item, db))


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CampaignCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    campaign = PromoCampaign(
        name=payload.name.strip(),
        promo_category=_parse_enum(PromoCategory, payload.promo_category, "promo_category"),
        type=_parse_enum(PromoCampaignType, payload.type, "type"),
        status=_parse_enum(PromoCampaignStatus, payload.status, "status"),
        eligible_subscription_type=SubscriptionType.MASTER,
        max_redemptions_per_user=payload.max_redemptions_per_user or 1,
        beneficiary_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_config={},
        created_by_user_id=current_user.id,
    )
    _apply_campaign_payload(campaign, data, db)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_item(campaign, db)


@router.patch("/campaigns/{campaign_id}")
def patch_campaign(
    campaign_id: int,
    payload: CampaignPatchRequest,
    db: Session = Depends(get_db),
) -> dict:
    campaign = _get_campaign_or_404(db, campaign_id)
    data = payload.model_dump(exclude_unset=True)
    _apply_campaign_payload(campaign, data, db)
    campaign.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return _campaign_item(campaign, db)


@router.get("/codes")
def list_codes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    campaign_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(PromoEngineCode).join(PromoCampaign)
    if campaign_id:
        query = query.filter(PromoEngineCode.campaign_id == campaign_id)
    if status:
        query = query.filter(PromoEngineCode.status == _parse_enum(PromoCodeStatus, status, "status"))
    if search:
        query = query.filter(PromoEngineCode.code.ilike(f"%{search}%"))
    query = query.order_by(PromoEngineCode.created_at.desc(), PromoEngineCode.id.desc())
    return _paginated(query, skip, limit, _code_item)


@router.get("/codes/export")
def export_codes_csv(
    campaign_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Response:
    query = db.query(PromoEngineCode).join(PromoCampaign)
    if campaign_id:
        query = query.filter(PromoEngineCode.campaign_id == campaign_id)
    if status:
        query = query.filter(PromoEngineCode.status == _parse_enum(PromoCodeStatus, status, "status"))
    search_value = search or q
    if search_value:
        query = query.filter(PromoEngineCode.code.ilike(f"%{search_value}%"))
    codes = query.order_by(PromoEngineCode.created_at.desc(), PromoEngineCode.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Промокод",
        "Кампания",
        "Статус",
        "Применено",
        "Лимит",
        "Персональный пользователь",
        "Дата создания",
    ])
    for code in codes:
        writer.writerow([
            _csv_escape(code.code),
            _csv_escape(code.campaign.name if code.campaign else code.campaign_id),
            _csv_escape(_enum_value(code.status)),
            _csv_escape(code.current_redemptions),
            _csv_escape(code.max_redemptions),
            _csv_escape(code.assigned_to_user_id),
            _csv_escape(code.created_at),
        ])

    content = "\ufeff" + output.getvalue()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="promo-engine-codes.csv"'},
    )


@router.post("/codes", status_code=status.HTTP_201_CREATED)
def create_code(payload: CodeCreateRequest, db: Session = Depends(get_db)) -> dict:
    campaign = _get_campaign_or_404(db, payload.campaign_id)
    normalized_code = _normalize_code_or_400(payload.code)
    if payload.max_redemptions is not None and payload.max_redemptions < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_redemptions должен быть >= 0")
    _validate_assigned_user(db, payload.assigned_to_user_id)
    if db.query(PromoEngineCode.id).filter(PromoEngineCode.code == normalized_code).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Промокод уже существует")
    code = PromoEngineCode(
        campaign_id=campaign.id,
        code=normalized_code,
        status=_parse_enum(PromoCodeStatus, payload.status or PromoCodeStatus.ACTIVE.value, "status"),
        max_redemptions=payload.max_redemptions,
        assigned_to_user_id=payload.assigned_to_user_id,
    )
    db.add(code)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Промокод уже существует")
    db.refresh(code)
    return _code_item(code)


@router.post("/codes/bulk-create", status_code=status.HTTP_201_CREATED)
def bulk_create_codes(payload: BulkCodeCreateRequest, db: Session = Depends(get_db)) -> dict:
    campaign = _get_campaign_or_404(db, payload.campaign_id)
    count = int(payload.count)
    if count < 1 or count > 1000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="count должен быть от 1 до 1000")
    code_length = int(payload.code_length or 8)
    if code_length < 4 or code_length > 32:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_length должен быть от 4 до 32")
    if payload.max_redemptions is not None and payload.max_redemptions < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_redemptions должен быть >= 0")
    code_status = _parse_enum(PromoCodeStatus, payload.status or PromoCodeStatus.ACTIVE.value, "status")
    prefix = "".join(str(payload.prefix or "").strip().upper().split())

    created = []
    generated = set()
    attempts = 0
    max_attempts = max(100, count * 20)
    while len(created) < count and attempts < max_attempts:
        attempts += 1
        candidate = _generate_bulk_code(prefix, code_length)
        if candidate in generated:
            continue
        if db.query(PromoEngineCode.id).filter(PromoEngineCode.code == candidate).first():
            continue
        generated.add(candidate)
        created.append(PromoEngineCode(
            campaign_id=campaign.id,
            code=candidate,
            status=code_status,
            max_redemptions=payload.max_redemptions,
        ))

    if len(created) < count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не удалось сгенерировать нужное количество уникальных промокодов. Измените префикс или длину кода.",
        )

    db.add_all(created)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не удалось сохранить промокоды из-за совпадения кодов. Повторите попытку.",
        )

    for code in created:
        db.refresh(code)
    return {
        "created": len(created),
        "items": [_code_item(code) for code in created],
    }


@router.patch("/codes/{code_id}")
def patch_code(code_id: int, payload: CodePatchRequest, db: Session = Depends(get_db)) -> dict:
    code = _get_code_or_404(db, code_id)
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] is not None:
        normalized_code = _normalize_code_or_400(data["code"])
        existing = db.query(PromoEngineCode.id).filter(
            PromoEngineCode.code == normalized_code,
            PromoEngineCode.id != code.id,
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Промокод уже существует")
        code.code = normalized_code
    if "status" in data and data["status"] is not None:
        code.status = _parse_enum(PromoCodeStatus, data["status"], "status")
    if "max_redemptions" in data:
        value = data["max_redemptions"]
        if value is not None and value < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_redemptions должен быть >= 0")
        if value is not None and value < code.current_redemptions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_redemptions не может быть меньше current_redemptions",
            )
        code.max_redemptions = value
    if "assigned_to_user_id" in data:
        _validate_assigned_user(db, data["assigned_to_user_id"])
        code.assigned_to_user_id = data["assigned_to_user_id"]
    code.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(code)
    return _code_item(code)


@router.get("/redemptions")
def list_redemptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    campaign_id: Optional[int] = None,
    code_id: Optional[int] = None,
    status: Optional[str] = None,
    redeemer_master_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(PromoRedemption).join(PromoEngineCode)
    if campaign_id:
        query = query.filter(PromoRedemption.campaign_id == campaign_id)
    if code_id:
        query = query.filter(PromoRedemption.code_id == code_id)
    if status:
        query = query.filter(PromoRedemption.status == _parse_enum(PromoRedemptionStatus, status, "status"))
    if redeemer_master_id:
        query = query.filter(PromoRedemption.redeemer_master_id == redeemer_master_id)
    query = query.order_by(PromoRedemption.applied_at.desc(), PromoRedemption.id.desc())
    return _paginated(query, skip, limit, _redemption_item)


@router.get("/grants")
def list_grants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    campaign_id: Optional[int] = None,
    code_id: Optional[int] = None,
    status: Optional[str] = None,
    recipient_master_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(PromoRewardGrant).join(PromoRedemption)
    if campaign_id:
        query = query.filter(PromoRedemption.campaign_id == campaign_id)
    if code_id:
        query = query.filter(PromoRedemption.code_id == code_id)
    if status:
        query = query.filter(PromoRewardGrant.status == _parse_enum(PromoRewardGrantStatus, status, "status"))
    if recipient_master_id:
        query = query.filter(PromoRewardGrant.recipient_master_id == recipient_master_id)
    query = query.order_by(PromoRewardGrant.created_at.desc(), PromoRewardGrant.id.desc())
    return _paginated(query, skip, limit, _grant_item)


@router.get("/ledger")
def list_ledger(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    master_id: Optional[int] = None,
    source_type: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(SubscriptionPointsLedger)
    if master_id:
        query = query.filter(SubscriptionPointsLedger.master_id == master_id)
    if source_type:
        query = query.filter(
            SubscriptionPointsLedger.source_type == _parse_enum(SubscriptionPointsSourceType, source_type, "source_type")
        )
    query = query.order_by(SubscriptionPointsLedger.created_at.desc(), SubscriptionPointsLedger.id.desc())
    return _paginated(query, skip, limit, _ledger_item)

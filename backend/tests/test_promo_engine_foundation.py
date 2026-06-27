from datetime import datetime, timedelta
from typing import Optional

import pytest

from auth import get_password_hash
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
    Subscription,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserRole,
)
from services.promo_engine import (
    PromoEngineError,
    calculate_subscription_points,
    create_pending_redemption,
    create_subscription_points_credit,
    ensure_master_referral_code,
    get_beneficiary_subscription_points_percent,
    get_current_acquisition_redemption,
    get_referrer_subscription_points_percent,
    get_subscription_points_balance,
    has_successful_paid_subscription_payment,
    list_subscription_points_history,
    normalize_promo_code,
    validate_promo_code_for_master,
)


def _user(db, idx: int, role: UserRole = UserRole.MASTER) -> User:
    u = User(
        email=f"promo{idx}@example.com",
        phone=f"+79990000{idx:03d}",
        full_name=f"Promo User {idx}",
        hashed_password=get_password_hash("test123"),
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _master(db, idx: int) -> Master:
    u = _user(db, idx, UserRole.MASTER)
    m = Master(user_id=u.id, bio="", experience_years=1, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def _campaign(
    db,
    *,
    type_: PromoCampaignType = PromoCampaignType.ADMIN_CAMPAIGN,
    owner_master_id: Optional[int] = None,
    status: PromoCampaignStatus = PromoCampaignStatus.ACTIVE,
    ends_at=None,
) -> PromoCampaign:
    campaign = PromoCampaign(
        name=f"Campaign {type_.value}",
        promo_category=PromoCategory.ACQUISITION,
        type=type_,
        status=status,
        owner_master_id=owner_master_id,
        ends_at=ends_at,
        eligible_subscription_type=SubscriptionType.MASTER,
        first_payment_only=True,
        beneficiary_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
        referrer_reward_type=PromoRewardType.SUBSCRIPTION_POINTS if type_ == PromoCampaignType.MASTER_REFERRAL else None,
        referrer_reward_config={"1": 0, "3": 15, "6": 15, "12": 15}
        if type_ == PromoCampaignType.MASTER_REFERRAL
        else None,
        referrer_type=PromoReferrerType.MASTER
        if type_ == PromoCampaignType.MASTER_REFERRAL
        else PromoReferrerType.ADMIN_CAMPAIGN,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def _code(db, campaign: PromoCampaign, code: str = "DEDATO2026", **kwargs) -> PromoEngineCode:
    c = PromoEngineCode(
        campaign_id=campaign.id,
        code=code,
        status=kwargs.pop("status", PromoCodeStatus.ACTIVE),
        max_redemptions=kwargs.pop("max_redemptions", None),
        current_redemptions=kwargs.pop("current_redemptions", 0),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _subscription(db, master: Master) -> Subscription:
    now = datetime.utcnow()
    sub = Subscription(
        user_id=master.user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days=90),
        price=3000,
        daily_rate=33.33,
        is_active=True,
        auto_renewal=False,
        payment_period="3months",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _payment(db, master: Master, *, status="paid", apply_status="applied", with_subscription=True) -> Payment:
    sub = _subscription(db, master) if with_subscription else None
    payment = Payment(
        user_id=master.user_id,
        subscription_id=sub.id if sub else None,
        amount=3000,
        status=status,
        payment_type="subscription",
        robokassa_invoice_id=f"promo-inv-{master.id}-{status}-{apply_status}-{with_subscription}",
        subscription_apply_status=apply_status,
        paid_at=datetime.utcnow() if status == "paid" else None,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def test_normalize_and_points_helpers():
    assert normalize_promo_code("  de dato 2026 ") == "DEDATO2026"
    with pytest.raises(PromoEngineError) as exc:
        normalize_promo_code("   ")
    assert exc.value.code == "empty_code"

    assert get_beneficiary_subscription_points_percent(1) == 0
    assert get_beneficiary_subscription_points_percent(3) == 15
    assert get_beneficiary_subscription_points_percent(6) == 20
    assert get_beneficiary_subscription_points_percent(12) == 25
    assert get_beneficiary_subscription_points_percent(2) == 0

    assert get_referrer_subscription_points_percent(1, PromoCampaignType.MASTER_REFERRAL) == 0
    assert get_referrer_subscription_points_percent(3, PromoCampaignType.MASTER_REFERRAL) == 15
    assert get_referrer_subscription_points_percent(6, PromoCampaignType.MASTER_REFERRAL) == 15
    assert get_referrer_subscription_points_percent(12, PromoCampaignType.MASTER_REFERRAL) == 15
    assert get_referrer_subscription_points_percent(12, PromoCampaignType.ADMIN_CAMPAIGN) == 0

    assert calculate_subscription_points(1000, 15) == 150
    assert calculate_subscription_points(999, 15) == 149
    assert calculate_subscription_points(760, 15) == 114
    assert calculate_subscription_points(1000, 0) == 0


def test_validate_admin_campaign_code_for_unpaid_master(db):
    master = _master(db, 1)
    campaign = _campaign(db)
    _code(db, campaign)

    result = validate_promo_code_for_master(db, master.id, " dedato2026 ")

    assert result.campaign.id == campaign.id
    assert result.promo_code.code == "DEDATO2026"
    assert result.referrer_type == PromoReferrerType.ADMIN_CAMPAIGN
    assert result.referrer_master_id is None


def test_validate_master_referral_for_unpaid_master(db):
    referrer = _master(db, 2)
    redeemer = _master(db, 3)
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=referrer.id)
    _code(db, campaign, code="REFMASTER")

    result = validate_promo_code_for_master(db, redeemer.id, "refmaster")

    assert result.referrer_master_id == referrer.id
    assert result.referrer_type == PromoReferrerType.MASTER


@pytest.mark.parametrize(
    ("code_status", "campaign_status", "expected"),
    [
        (PromoCodeStatus.DISABLED, PromoCampaignStatus.ACTIVE, "code_inactive"),
        (PromoCodeStatus.ACTIVE, PromoCampaignStatus.PAUSED, "campaign_inactive"),
        (PromoCodeStatus.ACTIVE, PromoCampaignStatus.ARCHIVED, "campaign_inactive"),
    ],
)
def test_inactive_code_or_campaign_rejected(db, code_status, campaign_status, expected):
    master = _master(db, 4)
    campaign = _campaign(db, status=campaign_status)
    _code(db, campaign, status=code_status)

    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "DEDATO2026")
    assert exc.value.code == expected


def test_expired_campaign_rejected(db):
    master = _master(db, 5)
    campaign = _campaign(db, ends_at=datetime.utcnow() - timedelta(days=1))
    _code(db, campaign)

    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "DEDATO2026")
    assert exc.value.code == "campaign_expired"


def test_self_referral_rejected(db):
    master = _master(db, 6)
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=master.id)
    _code(db, campaign, code="SELF")

    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "SELF")
    assert exc.value.code == "self_referral"


def test_existing_paid_master_rejected_for_acquisition(db):
    master = _master(db, 7)
    _payment(db, master)
    campaign = _campaign(db)
    _code(db, campaign)

    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "DEDATO2026")
    assert exc.value.code == "first_payment_already_done"


def test_existing_unpaid_master_allowed(db):
    master = _master(db, 8)
    campaign = _campaign(db)
    _code(db, campaign)

    assert validate_promo_code_for_master(db, master.id, "DEDATO2026").master.id == master.id


def test_second_acquisition_promo_rejected(db):
    master = _master(db, 9)
    c1 = _campaign(db)
    _code(db, c1, code="FIRST")
    create_pending_redemption(db, master.id, "FIRST")
    db.commit()

    c2 = _campaign(db)
    _code(db, c2, code="SECOND")
    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "SECOND")
    assert exc.value.code == "acquisition_promo_already_used"


def test_one_time_code_max_redemptions_respected(db):
    master = _master(db, 10)
    campaign = _campaign(db)
    _code(db, campaign, max_redemptions=1, current_redemptions=1)

    with pytest.raises(PromoEngineError) as exc:
        validate_promo_code_for_master(db, master.id, "DEDATO2026")
    assert exc.value.code == "code_limit_reached"


def test_create_pending_redemption_for_admin_campaign(db):
    master = _master(db, 11)
    campaign = _campaign(db)
    code = _code(db, campaign)

    redemption = create_pending_redemption(db, master.id, "DEDATO2026")
    db.commit()
    db.refresh(code)

    assert redemption.status == PromoRedemptionStatus.PENDING_FIRST_PAYMENT
    assert redemption.campaign_type_snapshot == PromoCampaignType.ADMIN_CAMPAIGN
    assert redemption.referrer_campaign_id == campaign.id
    assert redemption.referrer_master_id is None
    assert redemption.beneficiary_reward_value_snapshot == {"1": 0, "3": 15, "6": 20, "12": 25}
    assert code.current_redemptions == 1
    assert get_current_acquisition_redemption(db, master.id).id == redemption.id


def test_create_pending_redemption_for_master_referral(db):
    referrer = _master(db, 12)
    redeemer = _master(db, 13)
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=referrer.id)
    _code(db, campaign, code="MASTERREF")

    redemption = create_pending_redemption(db, redeemer.id, "MASTERREF")

    assert redemption.referrer_master_id == referrer.id
    assert redemption.referrer_type_snapshot == PromoReferrerType.MASTER
    assert redemption.referrer_reward_type_snapshot == PromoRewardType.SUBSCRIPTION_POINTS


def test_subscription_points_credit_and_balance(db):
    master = _master(db, 14)
    zero = create_subscription_points_credit(
        db,
        master.id,
        0,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        None,
        "zero",
    )
    assert zero is None

    active = create_subscription_points_credit(
        db,
        master.id,
        150,
        SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
        1,
        "manual",
        metadata={"reason": "test"},
    )
    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=50,
            remaining_amount=50,
            direction=SubscriptionPointsDirection.CREDIT,
            source_type=SubscriptionPointsSourceType.MANUAL_ADJUSTMENT,
            status=SubscriptionPointsStatus.CONSUMED,
        )
    )
    db.commit()

    assert active is not None
    assert get_subscription_points_balance(db, master.id) == 150
    history = list_subscription_points_history(db, master.id)
    assert len(history) == 2


def test_first_payment_detector(db):
    master = _master(db, 15)
    assert has_successful_paid_subscription_payment(db, master.id) is False

    _payment(db, master, status="failed", apply_status="failed", with_subscription=False)
    assert has_successful_paid_subscription_payment(db, master.id) is False

    _payment(db, master, status="paid", apply_status="pending", with_subscription=True)
    assert has_successful_paid_subscription_payment(db, master.id) is False

    _payment(db, master, status="paid", apply_status="applied", with_subscription=False)
    assert has_successful_paid_subscription_payment(db, master.id) is False

    _payment(db, master, status="paid", apply_status="applied", with_subscription=True)
    assert has_successful_paid_subscription_payment(db, master.id) is True


def test_ensure_master_referral_code_creates_unique_active_code(db):
    master = _master(db, 16)
    another_master = _master(db, 17)

    first = ensure_master_referral_code(db, master.id)
    second = ensure_master_referral_code(db, master.id)
    another = ensure_master_referral_code(db, another_master.id)

    assert first.id == second.id
    assert first.code.startswith(f"M{master.id}")
    assert another.code.startswith(f"M{another_master.id}")
    assert first.id != another.id
    assert first.campaign_id == another.campaign_id
    assert first.campaign.type == PromoCampaignType.MASTER_REFERRAL
    assert first.campaign.owner_master_id is None
    assert first.campaign.name == "Реферальные коды мастеров"
    assert first.assigned_to_user_id == master.user_id
    assert another.assigned_to_user_id == another_master.user_id

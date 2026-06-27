from datetime import datetime, timedelta

import pytest
from fastapi import status
from sqlalchemy.orm import Session

from auth import get_password_hash
from models import (
    Master,
    PromoCampaign,
    PromoCampaignStatus,
    PromoCampaignType,
    PromoCategory,
    PromoCodeStatus,
    PromoEngineCode,
    PromoRedemption,
    PromoRewardGrant,
    SubscriptionPlan,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    SubscriptionType,
    User,
    UserRole,
)


def _login(client, phone: str):
    response = client.post("/api/auth/login", json={"phone": phone, "password": "testpassword"})
    assert response.status_code == 200, response.json()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _master(db: Session, idx: int) -> Master:
    user = User(
        email=f"stage2-master-{idx}@example.com",
        phone=f"+79991000{idx:03d}",
        full_name=f"Stage2 Master {idx}",
        hashed_password=get_password_hash("testpassword"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    master = Master(
        user_id=user.id,
        bio="",
        experience_years=0,
        can_work_independently=True,
        can_work_in_salon=True,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


def _campaign(
    db: Session,
    *,
    type_: PromoCampaignType = PromoCampaignType.ADMIN_CAMPAIGN,
    owner_master_id=None,
    status_: PromoCampaignStatus = PromoCampaignStatus.ACTIVE,
    ends_at=None,
    eligible_period_months=None,
) -> PromoCampaign:
    campaign = PromoCampaign(
        name=f"Stage2 {type_.value}",
        promo_category=PromoCategory.ACQUISITION,
        type=type_,
        status=status_,
        owner_master_id=owner_master_id,
        ends_at=ends_at,
        eligible_subscription_type=SubscriptionType.MASTER,
        eligible_period_months=eligible_period_months,
        first_payment_only=True,
        beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def _code(db: Session, campaign: PromoCampaign, code: str = "STAGE2", **kwargs) -> PromoEngineCode:
    promo_code = PromoEngineCode(
        campaign_id=campaign.id,
        code=code,
        status=kwargs.pop("status", PromoCodeStatus.ACTIVE),
        max_redemptions=kwargs.pop("max_redemptions", None),
        current_redemptions=kwargs.pop("current_redemptions", 0),
    )
    db.add(promo_code)
    db.commit()
    db.refresh(promo_code)
    return promo_code


def _plan(db: Session) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        name="Stage2 Plan",
        display_name="Stage2 Plan",
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=999,
        price_6months=760,
        price_12months=1000,
        features={},
        limits={},
        is_active=True,
        display_order=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def test_referral_code_endpoint_creates_and_reuses_code(client, db: Session):
    master = _master(db, 1)
    master_user_id = master.user_id
    headers = _login(client, master.user.phone)

    first = client.get("/api/master/referral-code", headers=headers)
    second = client.get("/api/master/referral-code", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    data = first.json()
    assert data["code"] == second.json()["code"]
    assert data["beneficiary_bonus_rules"] == {"1": 0, "3": 15, "6": 20, "12": 25}
    assert data["referrer_bonus_rules"] == {"1": 0, "3": 15, "6": 15, "12": 15}
    code = db.query(PromoEngineCode).filter(PromoEngineCode.code == data["code"]).first()
    assert code.campaign.type == PromoCampaignType.MASTER_REFERRAL
    assert code.campaign.owner_master_id is None
    assert code.campaign.name == "Реферальные коды мастеров"
    assert code.assigned_to_user_id == master_user_id


def test_apply_admin_campaign_and_current_promo(client, db: Session):
    master = _master(db, 2)
    campaign = _campaign(db)
    code = _code(db, campaign, "ADMIN2026")
    code_id = code.id
    headers = _login(client, master.user.phone)

    response = client.post("/api/master/promo-code/apply", json={"code": " admin2026 "}, headers=headers)

    assert response.status_code == 200, response.json()
    data = response.json()
    assert data["code"] == "ADMIN2026"
    assert data["campaign_type"] == "admin_campaign"
    assert data["promo_category"] == "acquisition"
    assert data["status"] == "pending_first_payment"
    refreshed_code = db.query(PromoEngineCode).filter(PromoEngineCode.id == code_id).first()
    assert refreshed_code.current_redemptions == 1

    current = client.get("/api/master/promo-code/current", headers=headers)
    assert current.status_code == 200
    assert current.json()["promo_code"]["code"] == "ADMIN2026"


def test_zero_min_period_campaign_applies_before_payment_and_calculates(client, db: Session):
    master = _master(db, 21)
    campaign = _campaign(db, eligible_period_months=[1, 3, 6, 12])
    _code(db, campaign, "ZEROMIN")
    plan = _plan(db)
    headers = _login(client, master.user.phone)

    apply_response = client.post("/api/master/promo-code/apply", json={"code": "ZEROMIN"}, headers=headers)
    assert apply_response.status_code == 200, apply_response.json()
    assert apply_response.json()["status"] == "pending_first_payment"

    calculation = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
        headers=headers,
    )

    assert calculation.status_code == 200, calculation.json()
    assert calculation.json()["promo_preview"]["code"] == "ZEROMIN"
    assert db.query(PromoRewardGrant).count() == 0
    assert db.query(SubscriptionPointsLedger).count() == 0


def test_current_promo_empty(client, db: Session):
    master = _master(db, 3)
    headers = _login(client, master.user.phone)

    response = client.get("/api/master/promo-code/current", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"promo_code": None}


def test_apply_master_referral_self_referral_rejected(client, db: Session):
    master = _master(db, 4)
    campaign = _campaign(db, type_=PromoCampaignType.MASTER_REFERRAL, owner_master_id=master.id)
    _code(db, campaign, "SELF2026")
    headers = _login(client, master.user.phone)

    response = client.post("/api/master/promo-code/apply", json={"code": "SELF2026"}, headers=headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "self_referral"


@pytest.mark.parametrize(
    ("code_status", "campaign_status", "expected_code"),
    [
        (PromoCodeStatus.DISABLED, PromoCampaignStatus.ACTIVE, "code_inactive"),
        (PromoCodeStatus.ACTIVE, PromoCampaignStatus.PAUSED, "campaign_inactive"),
        (PromoCodeStatus.ACTIVE, PromoCampaignStatus.ARCHIVED, "campaign_inactive"),
    ],
)
def test_apply_invalid_inactive_and_campaign_states(client, db: Session, code_status, campaign_status, expected_code):
    master = _master(db, 5)
    campaign = _campaign(db, status_=campaign_status)
    _code(db, campaign, "STATE2026", status=code_status)
    headers = _login(client, master.user.phone)

    response = client.post("/api/master/promo-code/apply", json={"code": "STATE2026"}, headers=headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == expected_code


def test_apply_invalid_expired_already_used_and_one_time_code(client, db: Session):
    expired_master = _master(db, 6)
    expired_campaign = _campaign(db, ends_at=datetime.utcnow() - timedelta(days=1))
    _code(db, expired_campaign, "EXPIRED2026")
    expired_response = client.post(
        "/api/master/promo-code/apply",
        json={"code": "EXPIRED2026"},
        headers=_login(client, expired_master.user.phone),
    )
    assert expired_response.status_code == 400
    assert expired_response.json()["detail"]["code"] == "campaign_expired"

    first_master = _master(db, 7)
    second_master = _master(db, 8)
    first_phone = first_master.user.phone
    second_phone = second_master.user.phone
    one_time_campaign = _campaign(db)
    _code(db, one_time_campaign, "ONETIME", max_redemptions=1)
    first = client.post(
        "/api/master/promo-code/apply",
        json={"code": "ONETIME"},
        headers=_login(client, first_phone),
    )
    assert first.status_code == 200
    second = client.post(
        "/api/master/promo-code/apply",
        json={"code": "ONETIME"},
        headers=_login(client, second_phone),
    )
    assert second.status_code == 400
    assert second.json()["detail"]["code"] == "code_limit_reached"

    another_campaign = _campaign(db)
    _code(db, another_campaign, "SECOND2026")
    repeated = client.post(
        "/api/master/promo-code/apply",
        json={"code": "SECOND2026"},
        headers=_login(client, first_phone),
    )
    assert repeated.status_code == 400
    assert repeated.json()["detail"]["code"] == "acquisition_promo_already_used"


def test_subscription_points_endpoint_empty_and_history(client, db: Session):
    master = _master(db, 9)
    headers = _login(client, master.user.phone)

    empty = client.get("/api/master/subscription-points", headers=headers)
    assert empty.status_code == 200
    assert empty.json() == {"balance": 0, "items": []}

    db.add(
        SubscriptionPointsLedger(
            master_id=master.id,
            amount=114,
            remaining_amount=114,
            direction=SubscriptionPointsDirection.CREDIT,
            source_type=SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
            source_id=123,
            status=SubscriptionPointsStatus.ACTIVE,
            description="Бонусные баллы по промокоду",
            extra_metadata={"code": "ADMIN2026"},
        )
    )
    db.commit()

    response = client.get("/api/master/subscription-points", headers=headers)
    data = response.json()
    assert response.status_code == 200
    assert data["balance"] == 114
    assert data["items"][0]["amount"] == 114
    assert data["items"][0]["metadata"] == {"code": "ADMIN2026"}


def test_calculate_preview_null_without_promo(client, db: Session):
    master = _master(db, 10)
    plan = _plan(db)
    headers = _login(client, master.user.phone)

    response = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": plan.id, "duration_months": 3, "upgrade_type": "immediate"},
        headers=headers,
    )

    assert response.status_code == 200, response.json()
    assert response.json()["promo_preview"] is None


@pytest.mark.parametrize(
    ("months", "expected_percent", "expected_points"),
    [(3, 15, 449), (6, 20, 912), (12, 25, 3000)],
)
def test_calculate_preview_for_current_promo(client, db: Session, months, expected_percent, expected_points):
    master = _master(db, 11 + months)
    campaign = _campaign(db)
    _code(db, campaign, f"CALC{months}")
    plan = _plan(db)
    headers = _login(client, master.user.phone)
    apply_response = client.post("/api/master/promo-code/apply", json={"code": f"CALC{months}"}, headers=headers)
    assert apply_response.status_code == 200

    response = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": plan.id, "duration_months": months, "upgrade_type": "immediate"},
        headers=headers,
    )

    data = response.json()
    assert response.status_code == 200, data
    preview = data["promo_preview"]
    assert preview["code"] == f"CALC{months}"
    assert preview["eligible"] is True
    assert preview["percent"] == expected_percent
    assert preview["points_amount"] == expected_points
    assert data["final_price"] == data["total_price"]
    assert db.query(PromoRewardGrant).count() == 0
    assert db.query(SubscriptionPointsLedger).count() == 0


def test_calculate_preview_for_one_month_ineligible(client, db: Session):
    master = _master(db, 20)
    campaign = _campaign(db)
    _code(db, campaign, "MONTH1")
    plan = _plan(db)
    headers = _login(client, master.user.phone)
    assert client.post("/api/master/promo-code/apply", json={"code": "MONTH1"}, headers=headers).status_code == 200

    response = client.post(
        "/api/subscriptions/calculate",
        json={"plan_id": plan.id, "duration_months": 1, "upgrade_type": "immediate"},
        headers=headers,
    )

    preview = response.json()["promo_preview"]
    assert response.status_code == 200
    assert preview["eligible"] is False
    assert preview["percent"] == 0
    assert preview["points_amount"] == 0
    assert preview["ineligible_reason"] == "minimum_period_3_months"


def test_registration_master_with_valid_promo_creates_pending_redemption(client, db: Session):
    campaign = _campaign(db)
    _code(db, campaign, "REGOK")

    response = client.post(
        "/api/auth/register",
        json={
            "email": "reg-ok@example.com",
            "phone": "+79002000001",
            "full_name": "Reg Ok",
            "password": "testpassword",
            "role": "master",
            "city": "Москва",
            "timezone": "Europe/Moscow",
            "promo_code": "regok",
        },
    )

    assert response.status_code == 200, response.json()
    user = db.query(User).filter(User.email == "reg-ok@example.com").first()
    master = db.query(Master).filter(Master.user_id == user.id).first()
    redemption = db.query(PromoRedemption).filter(PromoRedemption.redeemer_master_id == master.id).first()
    assert redemption is not None
    assert redemption.code.code == "REGOK"


def test_registration_master_invalid_promo_rolls_back(client, db: Session):
    response = client.post(
        "/api/auth/register",
        json={
            "email": "reg-bad@example.com",
            "phone": "+79002000002",
            "full_name": "Reg Bad",
            "password": "testpassword",
            "role": "master",
            "city": "Москва",
            "timezone": "Europe/Moscow",
            "promo_code": "NOPE",
        },
    )

    assert response.status_code == 400
    assert db.query(User).filter(User.email == "reg-bad@example.com").first() is None


def test_registration_client_with_promo_rejected_and_without_promo_unchanged(client, db: Session):
    rejected = client.post(
        "/api/auth/register",
        json={
            "email": "client-promo@example.com",
            "phone": "+79002000003",
            "full_name": "Client Promo",
            "password": "testpassword",
            "role": "client",
            "promo_code": "ANY",
        },
    )
    assert rejected.status_code == 400

    ok = client.post(
        "/api/auth/register",
        json={
            "email": "client-no-promo@example.com",
            "phone": "+79002000004",
            "full_name": "Client No Promo",
            "password": "testpassword",
            "role": "client",
        },
    )
    assert ok.status_code == 200, ok.json()

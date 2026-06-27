from datetime import datetime

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
    PromoRewardGrant,
    PromoRewardGrantStatus,
    PromoRewardRecipientRole,
    PromoRewardType,
    SubscriptionType,
    SubscriptionPointsDirection,
    SubscriptionPointsLedger,
    SubscriptionPointsSourceType,
    SubscriptionPointsStatus,
    User,
    UserRole,
)


BASE = "/api/admin/promo-engine"


def _user(db, idx: int, role: UserRole = UserRole.MASTER) -> User:
    user = User(
        email=f"admin-promo-engine-{idx}@example.com",
        phone=f"+79991000{idx:03d}",
        full_name=f"Admin Promo User {idx}",
        hashed_password=get_password_hash("testpassword"),
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _master(db, idx: int) -> Master:
    user = _user(db, idx, UserRole.MASTER)
    master = Master(user_id=user.id, bio="", experience_years=1, timezone="Europe/Moscow", timezone_confirmed=True)
    db.add(master)
    db.commit()
    db.refresh(master)
    return master


def _campaign(
    db,
    name: str = "Admin Promo",
    type_: PromoCampaignType = PromoCampaignType.ADMIN_CAMPAIGN,
    owner_master_id=None,
) -> PromoCampaign:
    campaign = PromoCampaign(
        name=name,
        promo_category=PromoCategory.ACQUISITION,
        type=type_,
        status=PromoCampaignStatus.ACTIVE,
        owner_master_id=owner_master_id,
        eligible_subscription_type=SubscriptionType.MASTER,
        max_redemptions_per_user=1,
        first_payment_only=True,
        beneficiary_reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def _code(db, campaign: PromoCampaign, code: str = "ADMIN2026") -> PromoEngineCode:
    promo_code = PromoEngineCode(
        campaign_id=campaign.id,
        code=code,
        status=PromoCodeStatus.ACTIVE,
        max_redemptions=10,
        current_redemptions=0,
    )
    db.add(promo_code)
    db.commit()
    db.refresh(promo_code)
    return promo_code


def _redemption_graph(db):
    master = _master(db, 501)
    campaign = _campaign(db, "Graph Campaign")
    code = _code(db, campaign, "GRAPH2026")
    payment = Payment(
        user_id=master.user_id,
        amount=3000,
        status="paid",
        payment_type="subscription",
        robokassa_invoice_id=f"admin-promo-engine-{master.id}",
        paid_at=datetime.utcnow(),
        subscription_apply_status="applied",
    )
    db.add(payment)
    db.flush()
    redemption = PromoRedemption(
        campaign_id=campaign.id,
        code_id=code.id,
        redeemer_user_id=master.user_id,
        redeemer_master_id=master.id,
        promo_category_snapshot=PromoCategory.ACQUISITION,
        campaign_type_snapshot=PromoCampaignType.ADMIN_CAMPAIGN,
        status=PromoRedemptionStatus.REDEEMED,
        first_payment_id=payment.id,
        first_payment_amount=3000,
        first_payment_period_months=3,
        redeemed_at=datetime.utcnow(),
        beneficiary_reward_type_snapshot=PromoRewardType.SUBSCRIPTION_POINTS,
        beneficiary_reward_value_snapshot={"3": 15},
    )
    db.add(redemption)
    db.flush()
    grant = PromoRewardGrant(
        redemption_id=redemption.id,
        recipient_master_id=master.id,
        recipient_role=PromoRewardRecipientRole.BENEFICIARY,
        reward_type=PromoRewardType.SUBSCRIPTION_POINTS,
        reward_percent=15,
        base_amount=3000,
        points_amount=450,
        status=PromoRewardGrantStatus.APPLIED,
        payment_id=payment.id,
        applied_at=datetime.utcnow(),
    )
    db.add(grant)
    db.flush()
    ledger = SubscriptionPointsLedger(
        master_id=master.id,
        amount=450,
        remaining_amount=450,
        direction=SubscriptionPointsDirection.CREDIT,
        source_type=SubscriptionPointsSourceType.PROMO_REWARD_GRANT,
        source_id=grant.id,
        status=SubscriptionPointsStatus.ACTIVE,
        description="Promo reward",
        extra_metadata={"campaign_id": campaign.id, "code_id": code.id},
    )
    db.add(ledger)
    db.flush()
    grant.subscription_points_ledger_id = ledger.id
    code.current_redemptions = 1
    db.commit()
    return campaign, code, redemption, grant, ledger


def _assert_paginated_shape(body):
    assert set(["items", "total", "skip", "limit"]).issubset(body.keys())
    assert isinstance(body["items"], list)


def test_admin_only_access_for_all_endpoints(client, admin_auth_headers, master_auth_headers):
    for method, path, payload in [
        ("get", f"{BASE}/stats", None),
        ("get", f"{BASE}/campaigns", None),
        ("get", f"{BASE}/codes", None),
        ("get", f"{BASE}/redemptions", None),
        ("get", f"{BASE}/grants", None),
        ("get", f"{BASE}/ledger", None),
        ("get", f"{BASE}/codes/export", None),
        ("post", f"{BASE}/master-referral-codes/backfill", None),
        ("post", f"{BASE}/campaigns", {"name": "Forbidden"}),
        ("post", f"{BASE}/codes", {"campaign_id": 1, "code": "FORBIDDEN"}),
        ("post", f"{BASE}/codes/bulk-create", {"campaign_id": 1, "count": 1}),
        ("patch", f"{BASE}/campaigns/1", {"name": "Forbidden"}),
        ("patch", f"{BASE}/codes/1", {"status": "disabled"}),
    ]:
        unauth = getattr(client, method)(path, json=payload) if payload else getattr(client, method)(path)
        assert unauth.status_code in (401, 403)

        non_admin = (
            getattr(client, method)(path, json=payload, headers=master_auth_headers)
            if payload
            else getattr(client, method)(path, headers=master_auth_headers)
        )
        assert non_admin.status_code == 403

    admin = client.get(f"{BASE}/stats", headers=admin_auth_headers)
    assert admin.status_code == 200


def test_core_admin_endpoints_reject_unauthenticated_requests(client):
    for path in [
        f"{BASE}/stats",
        "/api/admin/users",
        "/api/admin/service-functions",
    ]:
        response = client.get(path)
        assert response.status_code in (401, 403), path


def test_create_campaign_success(client, admin_auth_headers, db):
    response = client.post(
        f"{BASE}/campaigns",
        headers=admin_auth_headers,
        json={
            "name": "Admin Summer",
            "promo_category": "acquisition",
            "type": "admin_campaign",
            "status": "active",
            "max_total_redemptions": 100,
            "max_redemptions_per_user": 1,
            "min_subscription_months": 3,
            "eligible_roles": ["master", "indie"],
            "beneficiary_reward_config": {"1": 0, "3": 15, "6": 20, "12": 25},
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Admin Summer"
    assert body["type"] == "admin_campaign"
    assert body["status"] == "active"
    assert body["eligible_period_months"] == [3, 6, 12]
    assert db.query(PromoCampaign).filter(PromoCampaign.name == "Admin Summer").count() == 1


def test_create_campaign_accepts_zero_min_subscription_months(client, admin_auth_headers):
    response = client.post(
        f"{BASE}/campaigns",
        headers=admin_auth_headers,
        json={
            "name": "No Min Period",
            "promo_category": "acquisition",
            "type": "admin_campaign",
            "status": "active",
            "min_subscription_months": 0,
            "eligible_roles": ["master", "indie"],
            "beneficiary_reward_config": {"1": 0, "3": 15, "6": 20, "12": 25},
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "No Min Period"
    assert body["eligible_period_months"] == [1, 3, 6, 12]


def test_list_campaigns_returns_paginated_shape(client, admin_auth_headers, db):
    _campaign(db, "List Campaign")

    response = client.get(f"{BASE}/campaigns?limit=10&search=List", headers=admin_auth_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    _assert_paginated_shape(body)
    assert body["total"] >= 1
    assert body["items"][0]["stats"]["codes_count"] == 0


def test_patch_campaign_status_and_name_success(client, admin_auth_headers, db):
    campaign = _campaign(db, "Before Patch")

    response = client.patch(
        f"{BASE}/campaigns/{campaign.id}",
        headers=admin_auth_headers,
        json={"name": "After Patch", "status": "paused"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "After Patch"
    assert body["status"] == "paused"


def test_patch_campaign_accepts_zero_min_subscription_months(client, admin_auth_headers, db):
    campaign = _campaign(db, "Patch Zero Min")
    campaign.eligible_period_months = [3, 6, 12]
    db.commit()

    response = client.patch(
        f"{BASE}/campaigns/{campaign.id}",
        headers=admin_auth_headers,
        json={"min_subscription_months": 0},
    )

    assert response.status_code == 200, response.text
    assert response.json()["eligible_period_months"] == [1, 3, 6, 12]


def test_backfill_master_referral_codes_creates_missing_and_is_idempotent(client, admin_auth_headers, db):
    master_with_code = _master(db, 601)
    master_without_code = _master(db, 602)
    existing_campaign = _campaign(
        db,
        "Existing Referral",
        type_=PromoCampaignType.MASTER_REFERRAL,
        owner_master_id=master_with_code.id,
    )
    existing_code = _code(db, existing_campaign, "EXIST601")
    existing_code_id = existing_code.id

    first = client.post(f"{BASE}/master-referral-codes/backfill", headers=admin_auth_headers)

    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["created"] >= 1
    assert first_body["skipped_existing"] >= 1
    assert first_body["failed"] == 0
    assert db.query(PromoEngineCode).filter(PromoEngineCode.id == existing_code_id).one().code == "EXIST601"

    created_for_missing = (
        db.query(PromoEngineCode)
        .join(PromoCampaign, PromoEngineCode.campaign_id == PromoCampaign.id)
        .filter(
            PromoCampaign.type == PromoCampaignType.MASTER_REFERRAL,
            PromoCampaign.owner_master_id == master_without_code.id,
        )
        .one()
    )
    assert created_for_missing.code

    second = client.post(f"{BASE}/master-referral-codes/backfill", headers=admin_auth_headers)

    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["created"] == 0
    assert second_body["skipped_existing"] >= 2
    assert second_body["failed"] == 0
    assert db.query(PromoEngineCode).filter(PromoEngineCode.code == created_for_missing.code).count() == 1


def test_create_code_success_uses_promo_engine_codes(client, admin_auth_headers, db):
    campaign = _campaign(db)

    response = client.post(
        f"{BASE}/codes",
        headers=admin_auth_headers,
        json={"campaign_id": campaign.id, "code": " admin-new ", "max_redemptions": 5},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["code"] == "ADMIN-NEW"
    assert PromoEngineCode.__tablename__ == "promo_engine_codes"
    assert db.query(PromoEngineCode).filter(PromoEngineCode.code == "ADMIN-NEW").count() == 1


def test_duplicate_code_rejected(client, admin_auth_headers, db):
    campaign = _campaign(db)
    _code(db, campaign, "DUPLICATE")

    response = client.post(
        f"{BASE}/codes",
        headers=admin_auth_headers,
        json={"campaign_id": campaign.id, "code": " duplicate "},
    )

    assert response.status_code == 409


def test_patch_code_status_and_max_redemptions_success(client, admin_auth_headers, db):
    campaign = _campaign(db)
    code = _code(db, campaign, "PATCHME")

    response = client.patch(
        f"{BASE}/codes/{code.id}",
        headers=admin_auth_headers,
        json={"status": "disabled", "max_redemptions": 20},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "disabled"
    assert body["max_redemptions"] == 20


def test_bulk_create_codes_success_unique_and_campaign_required(client, admin_auth_headers, db):
    campaign = _campaign(db, "Bulk Campaign")

    response = client.post(
        f"{BASE}/codes/bulk-create",
        headers=admin_auth_headers,
        json={"campaign_id": campaign.id, "count": 5, "prefix": "bulk", "code_length": 6, "max_redemptions": 1},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["created"] == 5
    codes = [item["code"] for item in body["items"]]
    assert len(codes) == len(set(codes))
    assert all(code.startswith("BULK") for code in codes)
    assert all(item["campaign_id"] == campaign.id for item in body["items"])
    assert all(item["max_redemptions"] == 1 for item in body["items"])

    missing_campaign = client.post(
        f"{BASE}/codes/bulk-create",
        headers=admin_auth_headers,
        json={"count": 1},
    )
    assert missing_campaign.status_code == 422


def test_bulk_create_codes_rejects_invalid_count(client, admin_auth_headers, db):
    campaign = _campaign(db, "Bulk Invalid")

    response = client.post(
        f"{BASE}/codes/bulk-create",
        headers=admin_auth_headers,
        json={"campaign_id": campaign.id, "count": 0},
    )

    assert response.status_code == 422


def test_export_codes_csv_respects_filters(client, admin_auth_headers, db):
    campaign = _campaign(db, "Export Campaign")
    _code(db, campaign, "EXPORT1")
    _code(db, campaign, "EXPORT2")
    other_campaign = _campaign(db, "Other Export Campaign")
    _code(db, other_campaign, "OTHEREXPORT")

    response = client.get(
        f"{BASE}/codes/export?campaign_id={campaign.id}&search=EXPORT",
        headers=admin_auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert "promo-engine-codes.csv" in response.headers["content-disposition"]
    text = response.text
    assert "Промокод" in text
    assert "EXPORT1" in text
    assert "EXPORT2" in text
    assert "OTHEREXPORT" not in text


def test_readonly_lists_return_paginated_shape(client, admin_auth_headers, db):
    _redemption_graph(db)

    for path in ["redemptions", "grants", "ledger"]:
        response = client.get(f"{BASE}/{path}?limit=10", headers=admin_auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        _assert_paginated_shape(body)
        assert body["total"] >= 1


def test_stats_returns_expected_keys_and_counts(client, admin_auth_headers, db):
    _redemption_graph(db)

    response = client.get(f"{BASE}/stats", headers=admin_auth_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    expected_keys = {
        "total_campaigns",
        "active_campaigns",
        "total_codes",
        "active_codes",
        "total_redemptions",
        "pending_redemptions",
        "redeemed_redemptions",
        "total_grants",
        "applied_grants",
        "total_points_granted",
        "total_ledger_entries",
        "total_ledger_points",
    }
    assert expected_keys.issubset(body.keys())
    assert body["total_campaigns"] == 1
    assert body["total_codes"] == 1
    assert body["redeemed_redemptions"] == 1
    assert body["applied_grants"] == 1
    assert body["total_points_granted"] == 450
    assert body["total_ledger_points"] == 450

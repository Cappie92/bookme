#!/usr/bin/env python3
"""
Production-safe promo-engine smoke.

Dry-run/read-only by default:
  python3 scripts/smoke_promo_engine_prod.py --prod-smoke

Local execute:
  python3 backend/scripts/smoke_promo_engine_prod.py --local --execute

Prod execute (inside backend container):
  python3 scripts/smoke_promo_engine_prod.py \\
    --prod-smoke --i-understand-this-writes-smoke-data --execute

Cleanup:
  python3 scripts/smoke_promo_engine_prod.py --local --cleanup --execute
  python3 scripts/smoke_promo_engine_prod.py \\
    --prod-smoke --i-understand-this-writes-smoke-data --cleanup --execute

Only touches entities marked with PROMO_ENGINE_SMOKE_2026_06 or fixed smoke-safe phones.
Does not call Robokassa and does not create checkout/payment URLs.
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from auth import get_password_hash
from database import SessionLocal
from models import (
    Master,
    Payment,
    PromoCampaign,
    PromoCampaignType,
    PromoCategory,
    PromoCodeStatus,
    PromoEngineCode,
    PromoRedemption,
    PromoRewardGrant,
    Subscription,
    SubscriptionPlan,
    SubscriptionPriceSnapshot,
    SubscriptionPointsLedger,
    SubscriptionStatus,
    SubscriptionType,
    User,
    UserBalance,
    UserRole,
)
from services.promo_engine import apply_promo_rewards_for_first_payment
from settings import get_settings


MARKER = "PROMO_ENGINE_SMOKE_2026_06"
PASSWORD = "test123"

PHONE_REFERRER = "+79991626001"
PHONE_BENEFICIARY_REF = "+79991626002"
PHONE_BENEFICIARY_ADMIN = "+79991626003"
PHONE_SELF = "+79991626004"
PHONE_CLIENT = "+79991626005"
SMOKE_PHONES = {PHONE_REFERRER, PHONE_BENEFICIARY_REF, PHONE_BENEFICIARY_ADMIN, PHONE_SELF, PHONE_CLIENT}

EMAIL_REFERRER = "promo-engine-smoke-referrer-2026-06@example.com"
EMAIL_BENEFICIARY_REF = "promo-engine-smoke-beneficiary-ref-2026-06@example.com"
EMAIL_BENEFICIARY_ADMIN = "promo-engine-smoke-beneficiary-admin-2026-06@example.com"
EMAIL_SELF = "promo-engine-smoke-self-2026-06@example.com"
EMAIL_CLIENT = "promo-engine-smoke-client-2026-06@example.com"
SMOKE_EMAILS = {EMAIL_REFERRER, EMAIL_BENEFICIARY_REF, EMAIL_BENEFICIARY_ADMIN, EMAIL_SELF, EMAIL_CLIENT}

CODE_ADMIN = f"{MARKER}_ADMIN"
CODE_STACK = f"{MARKER}_STACK"
CODE_REFERRAL = f"{MARKER}_REF"
CODE_SELF = f"{MARKER}_SELF"
PLAN_NAME = f"{MARKER}_PLAN"

REQUIRED_TABLES = {
    "promo_campaigns",
    "promo_engine_codes",
    "promo_redemptions",
    "promo_reward_grants",
    "subscription_points_ledger",
}


class SmokeSafetyError(RuntimeError):
    pass


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class SmokeReport:
    mode: str
    marker: str = MARKER
    base_url: Optional[str] = None
    checks: List[CheckResult] = field(default_factory=list)
    created_ids: Dict[str, List[int]] = field(default_factory=dict)
    cleanup_summary: Dict[str, int] = field(default_factory=dict)

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append(CheckResult(name=name, ok=ok, detail=detail))

    @property
    def passed(self) -> bool:
        return all(c.ok for c in self.checks)


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Production-safe promo-engine smoke")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--local", action="store_true", help="Local/dev mode")
    mode.add_argument("--prod-smoke", action="store_true", help="Production smoke mode")
    parser.add_argument("--execute", action="store_true", help="Allow writes. Without this, dry-run/read-only.")
    parser.add_argument("--cleanup", action="store_true", help="Cleanup smoke-marker entities only")
    parser.add_argument(
        "--i-understand-this-writes-smoke-data",
        action="store_true",
        help="Required with --prod-smoke --execute",
    )
    parser.add_argument("--base-url", default=None, help="API base URL; defaults to settings.API_BASE_URL")
    return parser.parse_args(argv)


def validate_safety_flags(args: argparse.Namespace) -> str:
    if args.local and args.prod_smoke:
        raise SmokeSafetyError("Choose only one mode: --local or --prod-smoke")
    if not args.local and not args.prod_smoke:
        return "dry-run"
    if args.cleanup and not args.execute:
        raise SmokeSafetyError("--cleanup requires --execute")
    if args.prod_smoke and args.execute and not args.i_understand_this_writes_smoke_data:
        raise SmokeSafetyError("--prod-smoke --execute requires --i-understand-this-writes-smoke-data")
    if args.prod_smoke and args.cleanup and not args.i_understand_this_writes_smoke_data:
        raise SmokeSafetyError("--prod-smoke --cleanup requires --i-understand-this-writes-smoke-data")
    if args.prod_smoke:
        return "prod-cleanup" if args.cleanup else ("prod-execute" if args.execute else "prod-dry-run")
    return "local-cleanup" if args.cleanup else ("local-execute" if args.execute else "local-dry-run")


def has_marker(value: Any) -> bool:
    return MARKER in str(value or "")


def is_smoke_user(user: Optional[User]) -> bool:
    if not user:
        return False
    return (
        user.email in SMOKE_EMAILS
        or user.phone in SMOKE_PHONES
        or has_marker(user.email)
        or has_marker(user.full_name)
    )


def assert_safe_user(user: Optional[User], action: str) -> None:
    if not user:
        return
    if user.role == UserRole.ADMIN:
        raise SmokeSafetyError(f"Refusing to {action} ADMIN user id={user.id}")
    if not is_smoke_user(user):
        raise SmokeSafetyError(f"Refusing to {action} non-smoke user id={user.id}")


def assert_safe_campaign(campaign: Optional[PromoCampaign], action: str) -> None:
    if campaign and not has_marker(campaign.name):
        raise SmokeSafetyError(f"Refusing to {action} non-smoke campaign id={campaign.id}")


def assert_safe_code(code: Optional[PromoEngineCode], action: str) -> None:
    if code and not has_marker(code.code):
        raise SmokeSafetyError(f"Refusing to {action} non-smoke promo code id={code.id}")


def check_tables(db: Session, report: SmokeReport) -> None:
    existing = set(inspect(db.bind).get_table_names())
    missing = sorted(REQUIRED_TABLES - existing)
    report.add("tables_exist", not missing, f"missing={missing}" if missing else "all required tables exist")


def _record(report: SmokeReport, key: str, obj: Any) -> None:
    if obj is not None and getattr(obj, "id", None):
        report.created_ids.setdefault(key, []).append(int(obj.id))


def _ensure_user(db: Session, *, email: str, phone: str, full_name: str, role: UserRole, report: SmokeReport) -> User:
    user = db.query(User).filter((User.email == email) | (User.phone == phone)).first()
    if user:
        assert_safe_user(user, "reuse")
        return user
    user = User(
        email=email,
        phone=phone,
        full_name=f"{full_name} {MARKER}",
        hashed_password=get_password_hash(PASSWORD),
        role=role,
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
    )
    db.add(user)
    db.flush()
    _record(report, "users", user)
    return user


def _ensure_master(db: Session, *, email: str, phone: str, full_name: str, domain: str, report: SmokeReport) -> Master:
    user = _ensure_user(db, email=email, phone=phone, full_name=full_name, role=UserRole.MASTER, report=report)
    master = db.query(Master).filter(Master.user_id == user.id).first()
    if master:
        assert_safe_user(user, "reuse master")
        return master
    master = Master(
        user_id=user.id,
        bio=MARKER,
        experience_years=0,
        can_work_independently=True,
        can_work_in_salon=True,
        domain=domain,
        city="Москва",
        timezone="Europe/Moscow",
        timezone_confirmed=True,
    )
    db.add(master)
    db.flush()
    _record(report, "masters", master)
    return master


def _ensure_client_user(db: Session, report: SmokeReport) -> User:
    return _ensure_user(
        db,
        email=EMAIL_CLIENT,
        phone=PHONE_CLIENT,
        full_name="Promo Smoke Client",
        role=UserRole.CLIENT,
        report=report,
    )


def _ensure_plan(db: Session, report: SmokeReport) -> SubscriptionPlan:
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == PLAN_NAME).first()
    if plan:
        return plan
    plan = SubscriptionPlan(
        name=PLAN_NAME,
        display_name=PLAN_NAME,
        subscription_type=SubscriptionType.MASTER,
        price_1month=1000,
        price_3months=1000,
        price_6months=1000,
        price_12months=1000,
        features={},
        limits={},
        is_active=True,
        display_order=9999,
    )
    db.add(plan)
    db.flush()
    _record(report, "plans", plan)
    return plan


def _ensure_admin_campaign(db: Session, report: SmokeReport) -> tuple[PromoCampaign, PromoEngineCode]:
    campaign = db.query(PromoCampaign).filter(PromoCampaign.name == f"{MARKER} admin_campaign").first()
    if campaign:
        assert_safe_campaign(campaign, "reuse")
    else:
        campaign = PromoCampaign(
            name=f"{MARKER} admin_campaign",
            promo_category=PromoCategory.ACQUISITION,
            type=PromoCampaignType.ADMIN_CAMPAIGN,
            eligible_subscription_type=SubscriptionType.MASTER,
            first_payment_only=True,
            beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
        )
        db.add(campaign)
        db.flush()
        _record(report, "campaigns", campaign)

    code = db.query(PromoEngineCode).filter(PromoEngineCode.code == CODE_ADMIN).first()
    if code:
        assert_safe_code(code, "reuse")
    else:
        code = PromoEngineCode(campaign_id=campaign.id, code=CODE_ADMIN, status=PromoCodeStatus.ACTIVE)
        db.add(code)
        db.flush()
        _record(report, "codes", code)
    return campaign, code


def _ensure_referral_campaign(db: Session, referrer: Master, report: SmokeReport, *, name_suffix: str, code_value: str) -> tuple[PromoCampaign, PromoEngineCode]:
    campaign_name = f"{MARKER} master_referral {name_suffix}"
    campaign = db.query(PromoCampaign).filter(PromoCampaign.name == campaign_name).first()
    if campaign:
        assert_safe_campaign(campaign, "reuse")
    else:
        campaign = PromoCampaign(
            name=campaign_name,
            promo_category=PromoCategory.ACQUISITION,
            type=PromoCampaignType.MASTER_REFERRAL,
            owner_master_id=referrer.id,
            eligible_subscription_type=SubscriptionType.MASTER,
            first_payment_only=True,
            beneficiary_reward_config={"1": 0, "3": 15, "6": 20, "12": 25},
        )
        db.add(campaign)
        db.flush()
        _record(report, "campaigns", campaign)

    code = db.query(PromoEngineCode).filter(PromoEngineCode.code == code_value).first()
    if code:
        assert_safe_code(code, "reuse")
    else:
        code = PromoEngineCode(campaign_id=campaign.id, code=code_value, status=PromoCodeStatus.ACTIVE)
        db.add(code)
        db.flush()
        _record(report, "codes", code)
    return campaign, code


def _base_url(raw: Optional[str]) -> str:
    value = (raw or get_settings().API_BASE_URL or "http://127.0.0.1:8000").strip()
    return value.rstrip("/")


def _login(client: httpx.Client, base_url: str, phone: str) -> dict:
    response = client.post(f"{base_url}/api/auth/login", json={"phone": phone, "password": PASSWORD})
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _assert(condition: bool, report: SmokeReport, name: str, detail: str = "") -> None:
    report.add(name, bool(condition), detail)
    if not condition:
        raise AssertionError(f"{name} failed: {detail}")


def _counts(db: Session) -> dict:
    return {
        "grants": db.query(PromoRewardGrant).count(),
        "ledger": db.query(SubscriptionPointsLedger).count(),
    }


def _smoke_counts(db: Session) -> dict:
    return {
        "grants": db.query(PromoRewardGrant).join(PromoRedemption).join(PromoEngineCode).filter(PromoEngineCode.code.contains(MARKER)).count(),
        "ledger": db.query(SubscriptionPointsLedger).filter(SubscriptionPointsLedger.source_type == "promo_reward_grant").count(),
    }


def run_dry_run(db: Session, report: SmokeReport) -> None:
    check_tables(db, report)
    for table in REQUIRED_TABLES:
        report.add(f"table_read_{table}", True, "read-only table check")


def run_cleanup(db: Session, report: SmokeReport) -> None:
    summary: Dict[str, int] = {}

    smoke_codes = db.query(PromoEngineCode).filter(PromoEngineCode.code.contains(MARKER)).all()
    for code in smoke_codes:
        assert_safe_code(code, "cleanup")
    smoke_code_ids = [c.id for c in smoke_codes]

    smoke_campaigns = db.query(PromoCampaign).filter(PromoCampaign.name.contains(MARKER)).all()
    for campaign in smoke_campaigns:
        assert_safe_campaign(campaign, "cleanup")
    smoke_campaign_ids = [c.id for c in smoke_campaigns]

    redemption_ids = [
        r.id
        for r in db.query(PromoRedemption)
        .filter(
            (PromoRedemption.code_id.in_(smoke_code_ids or [-1]))
            | (PromoRedemption.campaign_id.in_(smoke_campaign_ids or [-1]))
        )
        .all()
    ]
    grant_ids = [g.id for g in db.query(PromoRewardGrant).filter(PromoRewardGrant.redemption_id.in_(redemption_ids or [-1])).all()]

    summary["ledger"] = db.query(SubscriptionPointsLedger).filter(
        SubscriptionPointsLedger.source_id.in_(grant_ids or [-1])
    ).delete(synchronize_session=False)
    summary["grants"] = db.query(PromoRewardGrant).filter(PromoRewardGrant.id.in_(grant_ids or [-1])).delete(synchronize_session=False)
    summary["redemptions"] = db.query(PromoRedemption).filter(PromoRedemption.id.in_(redemption_ids or [-1])).delete(synchronize_session=False)
    summary["codes"] = db.query(PromoEngineCode).filter(PromoEngineCode.id.in_(smoke_code_ids or [-1])).delete(synchronize_session=False)
    summary["campaigns"] = db.query(PromoCampaign).filter(PromoCampaign.id.in_(smoke_campaign_ids or [-1])).delete(synchronize_session=False)

    smoke_payments = db.query(Payment).filter(Payment.robokassa_invoice_id.contains(MARKER)).all()
    payment_ids = [p.id for p in smoke_payments if has_marker(p.robokassa_invoice_id) or has_marker(p.payment_metadata)]
    subscription_ids = [p.subscription_id for p in smoke_payments if p.subscription_id]
    summary["payments"] = db.query(Payment).filter(Payment.id.in_(payment_ids or [-1])).delete(synchronize_session=False)

    snapshot_ids = [
        s.id
        for s in db.query(SubscriptionPriceSnapshot)
        .filter(SubscriptionPriceSnapshot.plan_id.in_([p.id for p in db.query(SubscriptionPlan).filter(SubscriptionPlan.name == PLAN_NAME).all()] or [-1]))
        .all()
    ]
    summary["snapshots"] = db.query(SubscriptionPriceSnapshot).filter(SubscriptionPriceSnapshot.id.in_(snapshot_ids or [-1])).delete(synchronize_session=False)
    summary["subscriptions"] = db.query(Subscription).filter(Subscription.id.in_(subscription_ids or [-1])).delete(synchronize_session=False)
    summary["plans"] = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == PLAN_NAME).delete(synchronize_session=False)

    users = db.query(User).filter((User.email.in_(SMOKE_EMAILS)) | (User.phone.in_(SMOKE_PHONES))).all()
    for user in users:
        assert_safe_user(user, "cleanup")
    user_ids = [u.id for u in users]
    summary["masters"] = db.query(Master).filter(Master.user_id.in_(user_ids or [-1])).delete(synchronize_session=False)
    summary["users"] = db.query(User).filter(User.id.in_(user_ids or [-1])).delete(synchronize_session=False)

    report.cleanup_summary = summary
    db.commit()
    report.add("cleanup_marker_only", True, str(summary))


def run_execute(db: Session, report: SmokeReport) -> None:
    check_tables(db, report)

    referrer = _ensure_master(
        db,
        email=EMAIL_REFERRER,
        phone=PHONE_REFERRER,
        full_name="Promo Smoke Referrer",
        domain="promo-engine-smoke-referrer",
        report=report,
    )
    beneficiary_ref = _ensure_master(
        db,
        email=EMAIL_BENEFICIARY_REF,
        phone=PHONE_BENEFICIARY_REF,
        full_name="Promo Smoke Beneficiary Ref",
        domain="promo-engine-smoke-beneficiary-ref",
        report=report,
    )
    beneficiary_admin = _ensure_master(
        db,
        email=EMAIL_BENEFICIARY_ADMIN,
        phone=PHONE_BENEFICIARY_ADMIN,
        full_name="Promo Smoke Beneficiary Admin",
        domain="promo-engine-smoke-beneficiary-admin",
        report=report,
    )
    self_master = _ensure_master(
        db,
        email=EMAIL_SELF,
        phone=PHONE_SELF,
        full_name="Promo Smoke Self",
        domain="promo-engine-smoke-self",
        report=report,
    )
    _ensure_client_user(db, report)
    plan = _ensure_plan(db, report)
    _ensure_admin_campaign(db, report)
    _ensure_referral_campaign(db, referrer, report, name_suffix="referrer", code_value=CODE_REFERRAL)
    _ensure_referral_campaign(db, self_master, report, name_suffix="self", code_value=CODE_SELF)
    db.commit()

    base_url = _base_url(report.base_url)
    with httpx.Client(timeout=30) as client:
        ref_headers = _login(client, base_url, PHONE_REFERRER)
        ben_ref_headers = _login(client, base_url, PHONE_BENEFICIARY_REF)
        self_headers = _login(client, base_url, PHONE_SELF)

        r1 = client.get(f"{base_url}/api/master/referral-code", headers=ref_headers)
        r1.raise_for_status()
        r2 = client.get(f"{base_url}/api/master/referral-code", headers=ref_headers)
        r2.raise_for_status()
        referral_code = r1.json()["code"]
        _assert(referral_code == r2.json()["code"], report, "referral_code_idempotent", referral_code)
        _assert(has_marker(referral_code), report, "referral_code_has_marker_or_generated_smoke", referral_code)

        apply_ref = client.post(f"{base_url}/api/master/promo-code/apply", json={"code": referral_code}, headers=ben_ref_headers)
        apply_ref.raise_for_status()
        _assert(apply_ref.json()["status"] == "pending_first_payment", report, "apply_referral_pending")

        current = client.get(f"{base_url}/api/master/promo-code/current", headers=ben_ref_headers)
        current.raise_for_status()
        _assert(current.json()["promo_code"]["code"] == referral_code, report, "current_promo_referral")

        before_counts = _counts(db)
        for months, percent in [(1, 0), (3, 15), (6, 20), (12, 25)]:
            calc = client.post(
                f"{base_url}/api/subscriptions/calculate",
                json={"plan_id": plan.id, "duration_months": months, "upgrade_type": "immediate"},
                headers=ben_ref_headers,
            )
            calc.raise_for_status()
            data = calc.json()
            preview = data["promo_preview"]
            if months == 1:
                _assert(
                    preview["eligible"] is False and preview["points_amount"] == 0 and preview["ineligible_reason"] == "minimum_period_3_months",
                    report,
                    "calculate_preview_1_month",
                    str(preview),
                )
            else:
                expected = int(float(data["final_price"]) * percent // 100)
                _assert(
                    preview["percent"] == percent and preview["points_amount"] == expected,
                    report,
                    f"calculate_preview_{months}_months",
                    str(preview),
                )
        after_counts = _counts(db)
        _assert(before_counts == after_counts, report, "calculate_no_grants_or_ledger", f"{before_counts}->{after_counts}")

        stack = client.post(f"{base_url}/api/master/promo-code/apply", json={"code": CODE_ADMIN}, headers=ben_ref_headers)
        _assert(stack.status_code == 400, report, "no_stacking_rejected", stack.text)

        self_ref_code = client.get(f"{base_url}/api/master/referral-code", headers=self_headers)
        self_ref_code.raise_for_status()
        self_ref = client.post(f"{base_url}/api/master/promo-code/apply", json={"code": self_ref_code.json()["code"]}, headers=self_headers)
        _assert(self_ref.status_code == 400, report, "self_referral_rejected", self_ref.text)

        client_reg = client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": f"promo-engine-smoke-client-reject-{MARKER.lower()}@example.com",
                "phone": "+79991626099",
                "full_name": f"Client Reject {MARKER}",
                "password": PASSWORD,
                "role": "client",
                "promo_code": CODE_ADMIN,
            },
        )
        _assert(client_reg.status_code == 400, report, "client_promo_rejected", client_reg.text)

        points_before = client.get(f"{base_url}/api/master/subscription-points", headers=ben_ref_headers)
        points_before.raise_for_status()
        _assert(points_before.json()["balance"] == 0 and points_before.json()["items"] == [], report, "points_empty_before_accrual")

    user_balance_before = db.query(UserBalance).filter(UserBalance.user_id == beneficiary_ref.user_id).first()
    user_balance_value_before = float(user_balance_before.balance) if user_balance_before else None

    now = datetime.utcnow()
    subscription = Subscription(
        user_id=beneficiary_ref.user_id,
        subscription_type=SubscriptionType.MASTER,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        end_date=now + timedelta(days=90),
        price=3000,
        daily_rate=34,
        payment_period="month",
        is_active=True,
        auto_renewal=False,
        plan_id=plan.id,
    )
    db.add(subscription)
    db.flush()
    payment = Payment(
        user_id=beneficiary_ref.user_id,
        subscription_id=subscription.id,
        amount=3000,
        status="paid",
        payment_type="subscription",
        robokassa_invoice_id=f"{MARKER}_FAKE_INTERNAL_PAYMENT",
        robokassa_payment_id=f"{MARKER}:fake",
        subscription_period="month",
        plan_id=plan.id,
        subscription_apply_status="applied",
        subscription_applied_at=now,
        paid_at=now,
        payment_metadata={"marker": MARKER, "selected_duration": 3, "source": "promo_engine_smoke"},
    )
    db.add(payment)
    db.flush()
    _record(report, "subscriptions", subscription)
    _record(report, "payments", payment)

    result = apply_promo_rewards_for_first_payment(db, payment)
    db.commit()
    again = apply_promo_rewards_for_first_payment(db, payment.id)
    db.commit()

    _assert(result.beneficiary_points == 450, report, "beneficiary_reward_points", str(result))
    _assert(result.referrer_points == 450, report, "referrer_reward_points", str(result))
    _assert(result.grants_created == 2 and result.ledger_entries_created == 2, report, "reward_grants_and_ledger_created", str(result))
    _assert(again.reason == "already_applied", report, "reward_idempotent_retry", str(again))

    grants = db.query(PromoRewardGrant).join(PromoRedemption).join(PromoEngineCode).filter(PromoEngineCode.code == referral_code).all()
    ledgers = db.query(SubscriptionPointsLedger).filter(SubscriptionPointsLedger.source_id.in_([g.id for g in grants])).all()
    _assert(len(grants) == 2 and len(ledgers) == 2, report, "reward_no_duplicates", f"grants={len(grants)} ledger={len(ledgers)}")
    _assert(all((l.extra_metadata or {}).get("promo_code") == referral_code for l in ledgers), report, "ledger_trace_metadata")

    user_balance_after = db.query(UserBalance).filter(UserBalance.user_id == beneficiary_ref.user_id).first()
    user_balance_value_after = float(user_balance_after.balance) if user_balance_after else None
    _assert(user_balance_value_before == user_balance_value_after, report, "user_balance_unchanged", f"{user_balance_value_before}->{user_balance_value_after}")


def print_report(report: SmokeReport) -> None:
    print(f"mode: {report.mode}")
    print(f"marker: {report.marker}")
    if report.created_ids:
        print(f"created_ids: {report.created_ids}")
    if report.cleanup_summary:
        print(f"cleanup_summary: {report.cleanup_summary}")
    print("checks:")
    for check in report.checks:
        status = "PASS" if check.ok else "FAIL"
        suffix = f" — {check.detail}" if check.detail else ""
        print(f"  [{status}] {check.name}{suffix}")
    print(f"final status: {'PASS' if report.passed else 'FAIL'}")


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    try:
        mode = validate_safety_flags(args)
    except SmokeSafetyError as exc:
        print(f"SAFETY ERROR: {exc}")
        return 2

    report = SmokeReport(mode=mode, base_url=args.base_url)
    db = SessionLocal()
    try:
        if args.cleanup:
            run_cleanup(db, report)
        elif args.execute:
            run_execute(db, report)
        else:
            run_dry_run(db, report)
        print_report(report)
        return 0 if report.passed else 1
    except Exception as exc:
        db.rollback()
        report.add("unhandled_exception", False, repr(exc))
        print_report(report)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

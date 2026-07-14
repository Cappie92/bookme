"""Read-only аудит согласованности subscription billing (без изменений в БД)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from utils.subscription_billing_calc import (
    compute_subscription_daily_rate_float,
    subscription_period_days,
    to_display_period,
)
from utils.subscription_payment_display import compute_monthly_price_from_package

MONEY_TOLERANCE = 1.0
RATE_TOLERANCE = 1e-4


def _money_close(a: float, b: float, *, tol: float = MONEY_TOLERANCE) -> bool:
    return abs(float(a) - float(b)) <= tol


def run_audit_checks(row: Dict[str, Any]) -> Dict[str, bool]:
    """
    Проверки инвариантов billing для одного paid/applied payment.

    row — нормализованный словарь (см. build_audit_report).
    """
    amount_paid = float(row.get("amount_paid") or 0)
    points_spent = int(row.get("points_spent") or 0)
    package_value = float(row.get("package_value") or 0)
    duration_months = int(row.get("duration_months") or 0)
    monthly_price = float(row.get("monthly_price") or 0)
    subscription_price = row.get("subscription_price")
    daily_rate = row.get("daily_rate")
    period_days = int(row.get("period_days") or 0)
    expected_chargeable = float(row.get("expected_chargeable_total") or 0)
    charged_total = float(row.get("charged_total_so_far") or 0)
    period_start = row.get("period_start")
    period_end_exclusive = row.get("period_end_exclusive")

    expected_monthly = compute_monthly_price_from_package(package_value, duration_months)

    package_equals_paid_plus_points = _money_close(
        package_value,
        amount_paid + points_spent,
    )
    monthly_price_correct = duration_months > 0 and _money_close(
        monthly_price,
        expected_monthly,
        tol=0.01,
    )
    subscription_price_equals_chargeable = (
        subscription_price is not None
        and _money_close(float(subscription_price), expected_chargeable, tol=0.01)
    )
    charged_not_over_total = charged_total <= expected_chargeable + 0.01

    if expected_chargeable <= 0:
        zero_rate_valid = daily_rate is not None and abs(float(daily_rate)) <= RATE_TOLERANCE
        zero_rate_valid = zero_rate_valid and charged_total <= 0.01
    else:
        if daily_rate is None or period_days <= 0:
            zero_rate_valid = False
        else:
            expected_rate = compute_subscription_daily_rate_float(
                expected_chargeable,
                duration_days=period_days,
            )
            zero_rate_valid = abs(float(daily_rate) - expected_rate) <= RATE_TOLERANCE

    period_valid = False
    if period_start is not None and period_end_exclusive is not None:
        try:
            period_valid = period_end_exclusive > period_start and period_days >= 1
            _, display_end = to_display_period(period_start, period_end_exclusive)
            stored_display = row.get("period_end_display")
            if stored_display is not None and display_end is not None:
                period_valid = period_valid and display_end.date() == stored_display.date()
        except Exception:
            period_valid = False

    return {
        "package_equals_paid_plus_points": package_equals_paid_plus_points,
        "monthly_price_correct": monthly_price_correct,
        "subscription_price_equals_chargeable": subscription_price_equals_chargeable,
        "charged_not_over_total": charged_not_over_total,
        "zero_rate_valid": zero_rate_valid,
        "period_valid": period_valid,
    }


def audit_passed(checks: Dict[str, bool]) -> bool:
    return all(bool(v) for v in checks.values())


def build_audit_report(row: Dict[str, Any], checks: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
    checks = checks if checks is not None else run_audit_checks(row)
    return {
        **row,
        "checks": checks,
        "passed": audit_passed(checks),
    }


def _iso_dt(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")
    return str(value)


def serialize_audit_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """JSON-safe представление (datetime → ISO string)."""
    out = dict(report)
    for key in (
        "period_start",
        "period_end_exclusive",
        "period_end_display",
    ):
        if key in out:
            out[key] = _iso_dt(out[key])
    return out


def summarize_audit_reports(reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    failed_ids = [
        int(r["payment_id"])
        for r in reports
        if not r.get("passed")
    ]
    passed_count = sum(1 for r in reports if r.get("passed"))
    return {
        "checked": len(reports),
        "passed": passed_count,
        "failed": len(failed_ids),
        "failed_payment_ids": failed_ids,
    }


def build_audit_row_from_billing(
    *,
    payment_id: int,
    user_id: int,
    amount_paid: float,
    points_spent: int,
    package_value: float,
    duration_months: int,
    monthly_price: float,
    subscription_id: Optional[int],
    subscription_price: Optional[float],
    daily_rate: Optional[float],
    period_start: Optional[datetime],
    period_end_exclusive: Optional[datetime],
    charged_total_so_far: float,
    payment_status: str,
    subscription_apply_status: Optional[str],
) -> Dict[str, Any]:
    expected_chargeable = max(0.0, float(package_value) - int(points_spent or 0))
    period_days = 0
    period_end_display = None
    if period_start is not None and period_end_exclusive is not None:
        period_days = subscription_period_days(period_start, period_end_exclusive)
        _, period_end_display = to_display_period(period_start, period_end_exclusive)

    remaining = max(0.0, expected_chargeable - float(charged_total_so_far or 0))

    status = payment_status
    if subscription_apply_status:
        status = f"{payment_status}/{subscription_apply_status}"

    return {
        "payment_id": int(payment_id),
        "user_id": int(user_id),
        "amount_paid": float(amount_paid),
        "points_spent": int(points_spent),
        "package_value": float(package_value),
        "duration_months": int(duration_months),
        "monthly_price": float(monthly_price),
        "subscription_id": subscription_id,
        "subscription_price": subscription_price,
        "daily_rate": daily_rate,
        "period_days": period_days,
        "expected_chargeable_total": expected_chargeable,
        "charged_total_so_far": float(charged_total_so_far),
        "remaining_to_charge": remaining,
        "period_start": period_start,
        "period_end_exclusive": period_end_exclusive,
        "period_end_display": period_end_display,
        "status": status,
    }


def load_charged_total(db, subscription_id: Optional[int]) -> float:
    if not subscription_id:
        return 0.0
    from models import DailyChargeStatus, DailySubscriptionCharge

    rows = (
        db.query(DailySubscriptionCharge)
        .filter(
            DailySubscriptionCharge.subscription_id == int(subscription_id),
            DailySubscriptionCharge.status == DailyChargeStatus.SUCCESS,
        )
        .all()
    )
    return sum(float(r.amount or 0) for r in rows)


def audit_payment_from_db(db, payment) -> Dict[str, Any]:
    """Read-only: собрать audit report для ORM Payment."""
    from models import Subscription
    from utils.subscription_payment_display import resolve_subscription_payment_billing

    billing = resolve_subscription_payment_billing(db, payment=payment)
    subscription = None
    if payment.subscription_id:
        subscription = (
            db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
        )

    period_start = subscription.start_date if subscription else None
    period_end_exclusive = subscription.end_date if subscription else None
    charged_total = load_charged_total(db, payment.subscription_id)

    row = build_audit_row_from_billing(
        payment_id=int(payment.id),
        user_id=int(payment.user_id),
        amount_paid=float(billing.get("amount_paid") or payment.amount or 0),
        points_spent=int(billing.get("points_spent") or 0),
        package_value=float(billing.get("package_value") or 0),
        duration_months=int(billing.get("duration_months") or 1),
        monthly_price=float(billing.get("monthly_price") or 0),
        subscription_id=int(payment.subscription_id) if payment.subscription_id else None,
        subscription_price=float(subscription.price) if subscription else None,
        daily_rate=float(subscription.daily_rate) if subscription else None,
        period_start=period_start,
        period_end_exclusive=period_end_exclusive,
        charged_total_so_far=charged_total,
        payment_status=str(payment.status or "unknown"),
        subscription_apply_status=getattr(payment, "subscription_apply_status", None),
    )
    return build_audit_report(row)


def fetch_subscription_payments(
    db,
    *,
    payment_id: Optional[int] = None,
    user_id: Optional[int] = None,
    limit: int = 20,
) -> List[Any]:
    from models import Payment

    query = db.query(Payment).filter(
        Payment.payment_type == "subscription",
        Payment.status == "paid",
        Payment.subscription_apply_status == "applied",
    )
    if payment_id is not None:
        query = query.filter(Payment.id == int(payment_id))
    if user_id is not None:
        query = query.filter(Payment.user_id == int(user_id))
    return (
        query.order_by(Payment.paid_at.desc(), Payment.id.desc())
        .limit(max(1, int(limit)))
        .all()
    )

"""
Runtime-логика для оценки скидок мастера (без изменения правил).
"""
from __future__ import annotations

import pytz
from datetime import date, datetime, timedelta, time
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import (
    LoyaltyDiscount,
    PersonalDiscount,
    LoyaltyConditionType,
    Booking,
    BookingStatus,
    User,
    Service,
    AppliedDiscount,
    Master,
)
from utils.loyalty_params import normalize_parameters

# Приоритет condition_type при ничьей по discount_percent (меньше = выше)
CONDITION_TYPE_PRIORITY: Dict[str, int] = {
    "birthday": 1,
    "returning_client": 2,
    "regular_visits": 3,
    "first_visit": 4,
    "happy_hours": 5,
    "service_discount": 6,
}
PERSONAL_PRIORITY = 7

# Whitelist поддерживаемых condition_type (реально обрабатываются в evaluate_discount_candidates)
SUPPORTED_CONDITION_TYPES = {
    LoyaltyConditionType.FIRST_VISIT.value,
    LoyaltyConditionType.RETURNING_CLIENT.value,
    LoyaltyConditionType.REGULAR_VISITS.value,
    LoyaltyConditionType.HAPPY_HOURS.value,
    LoyaltyConditionType.SERVICE_DISCOUNT.value,
    LoyaltyConditionType.BIRTHDAY.value,
}


def _master_timezone(master_id: int, db: Session) -> str:
    """Часовой пояс мастера. Обязателен на уровне домена; при create/update профиля — валидация 400.
    Fallback UTC — только safety-net (миграции, старые данные), не допустимое нормальное состояние."""
    m = db.query(Master).filter(Master.id == master_id).first()
    if m and getattr(m, "timezone", None) and str(m.timezone).strip():
        return str(m.timezone).strip()
    return "UTC"


def get_master_local_now(master_id: int, db: Session, now_utc: Optional[datetime] = None) -> datetime:
    """Текущее время в локальной зоне мастера (naive). now_utc — naive UTC или None (тогда utcnow())."""
    if now_utc is None:
        now_utc = datetime.utcnow()
    tz_str = _master_timezone(master_id, db)
    tz = pytz.timezone(tz_str)
    utc = pytz.UTC.localize(now_utc) if (now_utc.tzinfo is None) else now_utc.astimezone(pytz.UTC)
    local = utc.astimezone(tz)
    return local.replace(tzinfo=None)


def to_master_local(dt_utc: datetime, master_id: int, db: Session) -> datetime:
    """Приводит dt (naive UTC) к локальному времени мастера (naive)."""
    tz_str = _master_timezone(master_id, db)
    tz = pytz.timezone(tz_str)
    if dt_utc.tzinfo is None:
        utc = pytz.UTC.localize(dt_utc)
    else:
        utc = dt_utc.astimezone(pytz.UTC)
    local = utc.astimezone(tz)
    return local.replace(tzinfo=None)


def _master_local_to_utc(local_naive: datetime, master_id: int, db: Session) -> datetime:
    """Локальное время мастера (naive) -> naive UTC для запросов к БД."""
    tz_str = _master_timezone(master_id, db)
    tz = pytz.timezone(tz_str)
    local = tz.localize(local_naive)
    utc = local.astimezone(pytz.UTC)
    return utc.replace(tzinfo=None)


def _parse_time(value: Optional[str]) -> Optional[time]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%H:%M").time()
    except Exception:
        return None


def _get_client_data(db: Session, client_id: Optional[int], client_phone: Optional[str]) -> Tuple[Optional[int], Optional[str], Optional[datetime]]:
    if client_id:
        user = db.query(User).filter(User.id == client_id).first()
        if user:
            return user.id, user.phone, user.birth_date
    return None, client_phone, None


def _get_service_context(
    db: Session,
    service_id: Optional[int],
    category_id: Optional[int],
) -> Tuple[Optional[int], Optional[float], Optional[int]]:
    if service_id:
        service = db.query(Service).filter(Service.id == service_id).first()
        if service:
            return service.id, service.price, category_id or service.category_id
    return service_id, None, category_id


def _count_completed_visits(
    db: Session,
    master_id: int,
    client_id: int,
    start_dt: Optional[datetime],
    end_dt: Optional[datetime],
) -> int:
    query = db.query(Booking).filter(
        Booking.master_id == master_id,
        Booking.client_id == client_id,
        Booking.status == BookingStatus.COMPLETED,
    )
    if start_dt:
        query = query.filter(Booking.start_time >= start_dt)
    if end_dt:
        query = query.filter(Booking.start_time <= end_dt)
    return query.count()


def _get_last_completed_visit(
    db: Session,
    master_id: int,
    client_id: int,
) -> Optional[datetime]:
    last_booking = (
        db.query(Booking)
        .filter(
            Booking.master_id == master_id,
            Booking.client_id == client_id,
            Booking.status == BookingStatus.COMPLETED,
        )
        .order_by(desc(Booking.start_time))
        .first()
    )
    return last_booking.start_time if last_booking else None


def _ref_date_in_year(y: int, birth_date: date) -> date:
    try:
        return date(y, birth_date.month, birth_date.day)
    except ValueError:
        return date(y, 2, 28)


def _birthday_in_window(
    birth_date: date,
    booking_date: date,
    days_before: int,
    days_after: int,
) -> Tuple[bool, Optional[str]]:
    """Проверяет, попадает ли booking_date в окно [ДР - days_before, ДР + days_after].
    Учитывает пересечение года: ДР в начале января + бронь в декабре; ДР в конце декабря + бронь в январе.
    """
    ref = _ref_date_in_year(booking_date.year, birth_date)
    if booking_date.month == 12 and birth_date.month == 1 and ref < booking_date:
        ref = _ref_date_in_year(booking_date.year + 1, birth_date)
    elif booking_date.month == 1 and birth_date.month == 12 and ref > booking_date:
        ref = _ref_date_in_year(booking_date.year - 1, birth_date)
    low = ref - timedelta(days=days_before)
    high = ref + timedelta(days=days_after)
    return low <= booking_date <= high, None


def calculate_discount_amount(
    base_price: float,
    discount_percent: float,
    max_discount_amount: Optional[float],
) -> float:
    discount_amount = base_price * (discount_percent / 100.0)
    if max_discount_amount is not None:
        discount_amount = min(discount_amount, max_discount_amount)
    return max(discount_amount, 0.0)


def evaluate_and_prepare_applied_discount(
    master_id: int,
    client_id: Optional[int],
    client_phone: Optional[str],
    booking_start: Optional[datetime],
    service_id: Optional[int],
    db: Session,
    now: Optional[datetime] = None,
) -> Tuple[Optional[float], Optional[Dict[str, Any]]]:
    """
    Общая логика расчёта скидки для бронирования.
    Источник цены — Service.price.
    now: опционально, для тестов (иначе datetime.utcnow()).
    """
    if not master_id or not service_id or not booking_start:
        return None, None

    service = db.query(Service).filter(Service.id == service_id).first()
    if not service or not service.price or service.price <= 0:
        return None, None

    booking_payload = {
        "start_time": booking_start,
        "service_id": service_id,
        "service_price": service.price,
        "category_id": service.category_id,
    }

    candidates, best_candidate = evaluate_discount_candidates(
        master_id=master_id,
        client_id=client_id,
        client_phone=client_phone,
        booking_payload=booking_payload,
        db=db,
        now=now,
    )

    if not best_candidate:
        return None, None

    discount_amount = calculate_discount_amount(
        base_price=float(service.price),
        discount_percent=float(best_candidate["discount_percent"]),
        max_discount_amount=best_candidate.get("max_discount_amount"),
    )
    if discount_amount <= 0:
        return None, None

    discounted_payment_amount = max(float(service.price) - discount_amount, 0.0)
    applied_discount_data = {
        "rule_type": best_candidate["rule_type"],
        "rule_id": best_candidate["rule_id"],
        "discount_percent": float(best_candidate["discount_percent"]),
        "discount_amount": float(discount_amount),
    }

    return discounted_payment_amount, applied_discount_data


def create_applied_discount(
    booking_id: int,
    applied_discount_data: Dict[str, Any],
) -> AppliedDiscount:
    return AppliedDiscount(
        booking_id=booking_id,
        discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] != "personal" else None,
        personal_discount_id=applied_discount_data["rule_id"] if applied_discount_data["rule_type"] == "personal" else None,
        discount_percent=applied_discount_data["discount_percent"],
        discount_amount=applied_discount_data["discount_amount"],
    )


def build_applied_discount_info(applied_discount: AppliedDiscount) -> Optional[Dict[str, Any]]:
    if not applied_discount:
        return None
    rule_type = "unknown"
    name = "Скидка"
    if applied_discount.personal_discount_id:
        rule_type = "personal"
        personal = applied_discount.personal_discount
        if personal and personal.description:
            name = personal.description
        else:
            name = "Персональная скидка"
    elif applied_discount.discount_id:
        loyalty_rule = applied_discount.loyalty_discount
        if loyalty_rule:
            rule_type = loyalty_rule.discount_type
            name = loyalty_rule.name

    return {
        "id": applied_discount.id,
        "rule_type": rule_type,
        "name": name,
        "discount_percent": applied_discount.discount_percent,
        "discount_amount": applied_discount.discount_amount,
    }


def evaluate_discount_candidates(
    master_id: int,
    client_id: Optional[int],
    client_phone: Optional[str],
    booking_payload: Dict[str, Any],
    db: Session,
    now: Optional[datetime] = None,
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Возвращает список кандидатов + лучший кандидат (deterministic).
    Не использует salon_id, только master_id.
    now: опционально для тестов; иначе datetime.utcnow().
    """
    if now is None:
        now = datetime.utcnow()
    booking_start: Optional[datetime] = booking_payload.get("start_time")
    service_id: Optional[int] = booking_payload.get("service_id")
    category_id: Optional[int] = booking_payload.get("category_id")

    _, resolved_phone, birth_date = _get_client_data(db, client_id, client_phone)
    _, resolved_price, resolved_category_id = _get_service_context(
        db, service_id, category_id
    )

    candidates: List[Dict[str, Any]] = []

    loyalty_rules = (
        db.query(LoyaltyDiscount)
        .filter(LoyaltyDiscount.master_id == master_id)
        .all()
    )
    personal_rules = (
        db.query(PersonalDiscount)
        .filter(PersonalDiscount.master_id == master_id)
        .all()
    )

    for rule in loyalty_rules:
        condition = rule.conditions or {}
        condition_type = condition.get("condition_type")
        raw_params = condition.get("parameters", {}) if isinstance(condition, dict) else {}
        parameters = normalize_parameters(
            condition_type or "",
            raw_params,
            rule_discount_percent=float(rule.discount_percent) if rule.discount_percent is not None else None,
        )

        candidate = {
            "rule_id": rule.id,
            "rule_type": rule.discount_type,
            "name": rule.name,
            "condition_type": condition_type,
            "parameters": parameters,
            "priority": rule.priority,
            "is_active": rule.is_active,
            "match": False,
            "reason": "inactive" if not rule.is_active else "unknown_condition",
            "discount_percent": rule.discount_percent,
            "max_discount_amount": rule.max_discount_amount,
        }

        if not rule.is_active:
            candidates.append(candidate)
            continue

        if not condition_type:
            candidate["reason"] = "insufficient_data"
            candidates.append(candidate)
            continue

        # Personal is handled separately
        if condition_type == LoyaltyConditionType.FIRST_VISIT.value:
            if not client_id:
                candidate["reason"] = "insufficient_data"
            else:
                visits = _count_completed_visits(db, master_id, client_id, None, None)
                candidate["match"] = visits == 0
                candidate["reason"] = "matched" if candidate["match"] else "has_previous_visit"

        elif condition_type == LoyaltyConditionType.RETURNING_CLIENT.value:
            if not client_id or not booking_start:
                candidate["reason"] = "insufficient_data"
            else:
                min_days = parameters.get("min_days_since_last_visit")
                max_days = parameters.get("max_days_since_last_visit")
                last_visit = _get_last_completed_visit(db, master_id, client_id)
                if not last_visit or not isinstance(min_days, (int, float)):
                    candidate["reason"] = "insufficient_data"
                else:
                    delta_days = (booking_start - last_visit).days
                    min_ok = delta_days >= int(min_days)
                    max_ok = True
                    if max_days is not None:
                        max_ok = delta_days <= int(max_days)
                    candidate["match"] = min_ok and max_ok
                    candidate["reason"] = "matched" if candidate["match"] else "too_recent" if not min_ok else "too_old"

        elif condition_type == LoyaltyConditionType.REGULAR_VISITS.value:
            if not client_id:
                candidate["reason"] = "insufficient_data"
            else:
                visits_count = parameters.get("visits_count")
                period_days = parameters.get("period_days")
                if not isinstance(visits_count, (int, float)) or not isinstance(period_days, (int, float)):
                    candidate["reason"] = "insufficient_data"
                else:
                    # B1: окно от «сейчас» (локальное время мастера), не от даты визита
                    now_local = get_master_local_now(master_id, db, now)
                    window_end_local = now_local
                    window_start_local = now_local - timedelta(days=int(period_days))
                    start_utc = _master_local_to_utc(window_start_local, master_id, db)
                    end_utc = _master_local_to_utc(window_end_local, master_id, db)
                    visits = _count_completed_visits(db, master_id, client_id, start_utc, end_utc)
                    candidate["match"] = visits >= int(visits_count)
                    candidate["reason"] = "matched" if candidate["match"] else "not_enough_visits"

        elif condition_type == LoyaltyConditionType.BIRTHDAY.value:
            if not birth_date or not booking_start:
                candidate["reason"] = "insufficient_data"
            else:
                days_before = int(parameters.get("days_before") or 0)
                days_after = int(parameters.get("days_after") or 0)
                booking_local = to_master_local(booking_start, master_id, db)
                booking_date = booking_local.date() if hasattr(booking_local, "date") else booking_local
                in_window, _ = _birthday_in_window(
                    birth_date=birth_date,
                    booking_date=booking_date,
                    days_before=days_before,
                    days_after=days_after,
                )
                candidate["match"] = in_window
                candidate["reason"] = "matched" if in_window else "outside_birthday_window"

        elif condition_type == LoyaltyConditionType.HAPPY_HOURS.value:
            if not booking_start:
                candidate["reason"] = "insufficient_data"
            else:
                days_list = parameters.get("days") or []
                intervals = parameters.get("intervals") or []
                if not isinstance(days_list, list) or not isinstance(intervals, list) or len(intervals) == 0:
                    candidate["reason"] = "insufficient_data"
                else:
                    booking_local = to_master_local(booking_start, master_id, db)
                    booking_time = booking_local.time()
                    booking_day = booking_local.isoweekday()
                    in_day = booking_day in days_list
                    in_any = False
                    for iv in intervals:
                        st = _parse_time(iv.get("start"))
                        et = _parse_time(iv.get("end"))
                        # B4: start включительно, end исключительно
                        if st and et and st <= booking_time < et:
                            in_any = True
                            break
                    candidate["match"] = in_day and in_any
                    candidate["reason"] = "matched" if candidate["match"] else "outside_happy_hours"

        elif condition_type == LoyaltyConditionType.SERVICE_DISCOUNT.value:
            if parameters.get("_invalid"):
                candidate["match"] = False
                candidate["reason"] = "invalid_parameters"
            elif not service_id and not resolved_category_id:
                candidate["reason"] = "insufficient_data"
            else:
                sid = parameters.get("service_id")
                cid = parameters.get("category_id")
                matched = False
                if sid is not None and service_id is not None and int(sid) == int(service_id):
                    matched = True
                if not matched and cid is not None and resolved_category_id is not None and int(cid) == int(resolved_category_id):
                    matched = True
                candidate["match"] = matched
                candidate["reason"] = "matched" if matched else "service_not_matched"
                # percent всегда из rule.discount_percent (уже в candidate)

        else:
            candidate["match"] = False
            candidate["reason"] = "unknown_condition"

        candidates.append(candidate)

    for rule in personal_rules:
        candidate = {
            "rule_id": rule.id,
            "rule_type": "personal",
            "name": "Персональная скидка",
            "condition_type": None,
            "parameters": {},
            "priority": 1,
            "is_active": rule.is_active,
            "match": False,
            "reason": "inactive" if not rule.is_active else "insufficient_data",
            "discount_percent": rule.discount_percent,
            "max_discount_amount": rule.max_discount_amount,
        }

        if not rule.is_active:
            candidates.append(candidate)
            continue

        if not resolved_phone:
            candidate["reason"] = "insufficient_data"
        else:
            candidate["match"] = rule.client_phone == resolved_phone
            candidate["reason"] = "matched" if candidate["match"] else "phone_mismatch"

        candidates.append(candidate)

    applicable = [c for c in candidates if c["is_active"] and c["match"]]
    # Winner: 1) max discount_percent  2) condition_type priority (lower=higher)  3) min(rule_id)
    def _sort_key(c: Dict[str, Any]) -> Tuple[float, int, int]:
        pct = float(c.get("discount_percent") or 0)
        ct = c.get("condition_type")
        priority = CONDITION_TYPE_PRIORITY.get(ct, PERSONAL_PRIORITY) if ct else PERSONAL_PRIORITY
        rid = int(c.get("rule_id") or 0)
        return (-pct, priority, rid)
    applicable.sort(key=_sort_key)
    best_candidate = applicable[0] if applicable else None

    return candidates, best_candidate

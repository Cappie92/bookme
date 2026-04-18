"""
Нормализация parameters условий скидок. Единый формат + backward compatibility.
Используется в evaluate_discount_candidates и при валидации create/update.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# Дефолты (должны совпадать с QUICK_DISCOUNT_TEMPLATES и shared-типами)
DEFAULT_RETURNING_MIN_DAYS = 30
DEFAULT_RETURNING_MAX_DAYS: Optional[int] = None
DEFAULT_BIRTHDAY_DAYS_BEFORE = 7
DEFAULT_BIRTHDAY_DAYS_AFTER = 7
DEFAULT_REGULAR_VISITS_COUNT = 2
DEFAULT_REGULAR_VISITS_PERIOD_DAYS = 60
PERIOD_TO_DAYS = {"week": 7, "month": 30, "year": 365}

_TIME_HHMM = re.compile(r"^\d{1,2}:\d{2}$")


def _to_hhmm(s: Any) -> Optional[str]:
    if not s:
        return None
    t = str(s).strip()
    if not _TIME_HHMM.match(t):
        return None
    parts = t.split(":")
    h, m = int(parts[0]), int(parts[1])
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return f"{h:02d}:{m:02d}"


def _sort_list(items: List[Any]) -> List[Any]:
    try:
        return sorted(items, key=lambda x: (str(type(x).__name__), x))
    except Exception:
        return list(items)


def normalize_first_visit(params: Dict[str, Any]) -> Dict[str, Any]:
    return {}


def normalize_regular_visits(params: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(params)
    visits_count = p.get("visits_count")
    period_days = p.get("period_days")
    period = p.get("period")

    if period_days is not None and isinstance(period_days, (int, float)):
        period_days = int(period_days)
    elif period and isinstance(period, str) and period in PERIOD_TO_DAYS:
        period_days = PERIOD_TO_DAYS[period]
    else:
        period_days = DEFAULT_REGULAR_VISITS_PERIOD_DAYS

    if visits_count is not None and isinstance(visits_count, (int, float)):
        visits_count = int(visits_count)
    else:
        visits_count = DEFAULT_REGULAR_VISITS_COUNT

    return {"visits_count": max(1, visits_count), "period_days": max(1, period_days)}


def normalize_returning_client(params: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(params)
    min_days = p.get("min_days_since_last_visit")
    max_days = p.get("max_days_since_last_visit")
    legacy = p.get("days_since_last_visit")

    if min_days is not None and isinstance(min_days, (int, float)):
        min_days = int(min_days)
    elif legacy is not None and isinstance(legacy, (int, float)):
        min_days = int(legacy)
    else:
        min_days = DEFAULT_RETURNING_MIN_DAYS

    if max_days is not None and isinstance(max_days, (int, float)):
        max_days = int(max_days)
    else:
        max_days = DEFAULT_RETURNING_MAX_DAYS

    out: Dict[str, Any] = {"min_days_since_last_visit": max(0, min_days)}
    if max_days is not None:
        out["max_days_since_last_visit"] = max(0, max_days)
    else:
        out["max_days_since_last_visit"] = None
    return out


def normalize_birthday(params: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(params)
    before = p.get("days_before")
    after = p.get("days_after")
    if before is not None and isinstance(before, (int, float)):
        before = int(before)
    else:
        before = DEFAULT_BIRTHDAY_DAYS_BEFORE
    if after is not None and isinstance(after, (int, float)):
        after = int(after)
    else:
        after = DEFAULT_BIRTHDAY_DAYS_AFTER
    return {"days_before": max(0, before), "days_after": max(0, after)}


def _intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    """Проверка пересечения двух интервалов (HH:MM)."""
    def to_minutes(hhmm: str) -> int:
        parts = hhmm.split(":")
        return int(parts[0]) * 60 + int(parts[1])

    a0, a1 = to_minutes(a_start), to_minutes(a_end)
    b0, b1 = to_minutes(b_start), to_minutes(b_end)
    return not (a1 <= b0 or b1 <= a0)


def normalize_happy_hours(params: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(params)
    days = p.get("days")
    intervals = p.get("intervals")
    # Legacy: start_time, end_time, days_of_week
    start_time = p.get("start_time")
    end_time = p.get("end_time")
    days_of_week = p.get("days_of_week")

    if days is not None and isinstance(days, list):
        days = _sort_list([int(x) for x in days if isinstance(x, (int, float))])
        days = [d for d in days if 1 <= d <= 7]
        days = sorted(set(days))
    elif days_of_week is not None and isinstance(days_of_week, list):
        days = _sort_list([int(x) for x in days_of_week if isinstance(x, (int, float))])
        days = [d for d in days if 1 <= d <= 7]
        days = sorted(set(days))
    else:
        days = [1, 2, 3, 4, 5]

    if intervals is not None and isinstance(intervals, list) and len(intervals) > 0:
        out_intervals: List[Dict[str, str]] = []
        for iv in intervals:
            if not isinstance(iv, dict):
                continue
            s = _to_hhmm(iv.get("start"))
            e = _to_hhmm(iv.get("end"))
            if s and e and s < e:
                out_intervals.append({"start": s, "end": e})
        out_intervals.sort(key=lambda x: (x["start"], x["end"]))
    elif start_time and end_time:
        s = _to_hhmm(start_time)
        e = _to_hhmm(end_time)
        if s and e and s < e:
            out_intervals = [{"start": s, "end": e}]
        else:
            out_intervals = [{"start": "09:00", "end": "12:00"}]
    else:
        out_intervals = [{"start": "09:00", "end": "12:00"}]

    return {"days": days, "intervals": out_intervals}


def normalize_service_discount(
    params: Dict[str, Any],
    rule_discount_percent: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Новая модель: одно правило = один селекшен (service_id ИЛИ category_id).
    Возвращает {service_id: int} | {category_id: int} | {_invalid: True, _invalid_reason: str}.
    Legacy: items[], service_ids[], category_ids[] — конвертируем при 1 элементе; при >1 — invalid.
    """
    p = dict(params)
    items = p.get("items") if isinstance(p.get("items"), list) else []
    service_ids = p.get("service_ids") if isinstance(p.get("service_ids"), list) else []
    category_ids = p.get("category_ids") if isinstance(p.get("category_ids"), list) else []

    def invalid(msg: str) -> Dict[str, Any]:
        return {"_invalid": True, "_invalid_reason": msg}

    # Новый формат
    if "service_id" in p and p.get("service_id") is not None:
        try:
            return {"service_id": int(p["service_id"])}
        except (TypeError, ValueError):
            return invalid("service_id должен быть числом.")

    if "category_id" in p and p.get("category_id") is not None:
        try:
            return {"category_id": int(p["category_id"])}
        except (TypeError, ValueError):
            return invalid("category_id должен быть числом.")

    # Legacy: >1 элемента — invalid
    if len(items) > 1:
        return invalid(
            "legacy items: больше одного элемента. Используйте одно правило на одну услугу."
        )
    if len(service_ids) > 1:
        return invalid(
            "legacy service_ids: больше одного. Используйте одно правило на одну услугу."
        )
    if len(category_ids) > 1:
        return invalid(
            "legacy category_ids: больше одного. Используйте одно правило на одну категорию."
        )

    # Legacy: 1 элемент — конвертируем (приоритет: items/service_ids, затем category_ids)
    if len(items) == 1:
        it = items[0]
        if not isinstance(it, dict) or it.get("service_id") is None:
            return invalid("legacy items[0]: требуется service_id.")
        try:
            return {"service_id": int(it["service_id"])}
        except (TypeError, ValueError):
            return invalid("legacy items[0].service_id должен быть числом.")

    if len(service_ids) == 1:
        try:
            return {"service_id": int(service_ids[0])}
        except (TypeError, ValueError):
            return invalid("legacy service_ids[0] должен быть числом.")

    if len(category_ids) == 1:
        try:
            return {"category_id": int(category_ids[0])}
        except (TypeError, ValueError):
            return invalid("legacy category_ids[0] должен быть числом.")

    return invalid("service_discount: задайте service_id или category_id.")


def normalize_parameters(
    condition_type: str,
    parameters: Dict[str, Any],
    rule_discount_percent: Optional[float] = None,
) -> Dict[str, Any]:
    """Нормализует parameters для заданного condition_type. Обратная совместимость."""
    if not isinstance(parameters, dict):
        parameters = {}

    if condition_type == "first_visit":
        return normalize_first_visit(parameters)
    if condition_type == "regular_visits":
        return normalize_regular_visits(parameters)
    if condition_type == "returning_client":
        return normalize_returning_client(parameters)
    if condition_type == "birthday":
        return normalize_birthday(parameters)
    if condition_type == "happy_hours":
        return normalize_happy_hours(parameters)
    if condition_type == "service_discount":
        return normalize_service_discount(parameters, rule_discount_percent)

    return dict(parameters)


def validate_happy_hours_intervals(intervals: List[Dict[str, str]]) -> Tuple[bool, Optional[str]]:
    """Проверка: start < end, интервалы не пересекаются. Возврат (ok, error_message)."""
    for iv in intervals:
        s = iv.get("start") or ""
        e = iv.get("end") or ""
        if not s or not e:
            return False, "Каждый интервал должен содержать start и end (HH:MM)."
        if s >= e:
            return False, f"start должен быть строго меньше end: {s} — {e}."

    for i in range(len(intervals)):
        for j in range(i + 1, len(intervals)):
            a, b = intervals[i], intervals[j]
            if _intervals_overlap(a["start"], a["end"], b["start"], b["end"]):
                return False, (
                    f"Интервалы пересекаются: [{a['start']}, {a['end']}] и "
                    f"[{b['start']}, {b['end']}]. Задайте непересекающиеся слоты."
                )
    return True, None


def stable_stringify_params(params: Dict[str, Any]) -> str:
    """Каноническая сериализация для сравнения (ключи отсортированы, массивы стабильны)."""
    import json
    return json.dumps(params, sort_keys=True, ensure_ascii=False)

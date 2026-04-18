"""
Единая разметка периодов для dashboard/stats и stats/extended (те же границы, что у графиков).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def get_period_dates(
    period_type: str,
    offset: int = 0,
    anchor: Optional[date] = None,
    win_before: int = 9,
    win_after: int = 9,
) -> List[Dict[str, Any]]:
    """Копия логики из GET /dashboard/stats: список под-периодов с флагом is_current."""
    today = datetime.now().date()

    if period_type == "day" and anchor is not None:
        range_start = anchor - timedelta(days=win_before)
        periods: List[Dict[str, Any]] = []
        for i in range(win_before + 1 + win_after):
            period_date = range_start + timedelta(days=i)
            is_anchor = period_date == anchor
            periods.append(
                {
                    "start": period_date,
                    "end": period_date,
                    "label": period_date.strftime("%d.%m"),
                    "is_current": is_anchor,
                    "is_past": period_date < anchor,
                    "is_future": period_date > anchor,
                }
            )
        return periods

    if period_type == "day":
        base_date = today + timedelta(days=offset)
        periods = []
        for i in range(-2, 3):
            period_date = base_date + timedelta(days=i)
            periods.append(
                {
                    "start": period_date,
                    "end": period_date,
                    "label": period_date.strftime("%d.%m"),
                    "is_current": i == 0,
                    "is_past": i < 0,
                    "is_future": i > 0,
                }
            )
        return periods

    if period_type == "week":
        current_week_monday = today - timedelta(days=today.weekday()) + timedelta(days=offset * 7)
        periods = []
        for i in range(-2, 3):
            week_monday = current_week_monday + timedelta(days=i * 7)
            week_sunday = week_monday + timedelta(days=6)
            periods.append(
                {
                    "start": week_monday,
                    "end": week_sunday,
                    "label": week_monday.strftime("%d.%m"),
                    "is_current": i == 0,
                    "is_past": i < 0,
                    "is_future": i > 0,
                }
            )
        return periods

    if period_type == "month":
        current_month = today.replace(day=1) + timedelta(days=offset * 32)
        current_month = current_month.replace(day=1)
        periods = []
        for i in range(-2, 3):
            if i == 0:
                month_start = current_month
            else:
                month_start = current_month
                for _ in range(abs(i)):
                    if i > 0:
                        if month_start.month == 12:
                            month_start = month_start.replace(year=month_start.year + 1, month=1)
                        else:
                            month_start = month_start.replace(month=month_start.month + 1)
                    else:
                        if month_start.month == 1:
                            month_start = month_start.replace(year=month_start.year - 1, month=12)
                        else:
                            month_start = month_start.replace(month=month_start.month - 1)

            if month_start.month == 12:
                next_month = month_start.replace(year=month_start.year + 1, month=1)
            else:
                next_month = month_start.replace(month=month_start.month + 1)
            month_end = next_month - timedelta(days=1)

            periods.append(
                {
                    "start": month_start,
                    "end": month_end,
                    "label": month_start.strftime("%m.%Y"),
                    "is_current": i == 0,
                    "is_past": i < 0,
                    "is_future": i > 0,
                }
            )
        return periods

    if period_type == "quarter":
        current_year = today.year
        current_quarter = (today.month - 1) // 3 + 1 + offset
        while current_quarter > 4:
            current_quarter -= 4
            current_year += 1
        while current_quarter < 1:
            current_quarter += 4
            current_year -= 1

        periods = []
        for i in range(-2, 3):
            quarter = current_quarter + i
            year = current_year
            while quarter > 4:
                quarter -= 4
                year += 1
            while quarter < 1:
                quarter += 4
                year -= 1

            quarter_start_month = (quarter - 1) * 3 + 1
            quarter_start = date(year, quarter_start_month, 1)

            quarter_end_month = quarter * 3
            quarter_end = date(year, quarter_end_month, 1)
            if quarter_end_month == 12:
                next_month = date(year + 1, 1, 1)
            else:
                next_month = date(year, quarter_end_month + 1, 1)
            quarter_end = next_month - timedelta(days=1)

            periods.append(
                {
                    "start": quarter_start,
                    "end": quarter_end,
                    "label": f"Q{quarter} {year}",
                    "is_current": i == 0,
                    "is_past": i < 0,
                    "is_future": i > 0,
                }
            )
        return periods

    if period_type == "year":
        current_year = today.year + offset
        periods = []
        for i in range(-2, 3):
            year = current_year + i
            year_start = date(year, 1, 1)
            year_end = date(year, 12, 31)
            periods.append(
                {
                    "start": year_start,
                    "end": year_end,
                    "label": str(year),
                    "is_current": i == 0,
                    "is_past": i < 0,
                    "is_future": i > 0,
                }
            )
        return periods

    return []


def build_stats_periods_bundle(
    period: str,
    offset: int = 0,
    anchor_date: Optional[str] = None,
    window_before: Optional[int] = None,
    window_after: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Как в dashboard/stats: periods, meta дня, текущий и предыдущий bucket.
    """
    day_window_meta: Dict[str, Any] = {}
    anchor_parsed: Optional[date] = None

    if period == "day" and (window_before is not None or window_after is not None):
        win_b = window_before if window_before is not None else 9
        win_a = window_after if window_after is not None else 9
        win_b = max(0, min(31, win_b))
        win_a = max(0, min(31, win_a))
        try:
            if anchor_date:
                anchor_parsed = datetime.strptime(anchor_date.strip(), "%Y-%m-%d").date()
            else:
                anchor_parsed = datetime.now().date()
        except ValueError:
            anchor_parsed = datetime.now().date()
        periods = get_period_dates(period, offset, anchor=anchor_parsed, win_before=win_b, win_after=win_a)
        range_start = anchor_parsed - timedelta(days=win_b)
        range_end = anchor_parsed + timedelta(days=win_a)
        selected_idx = next((i for i, p in enumerate(periods) if p["start"] == anchor_parsed), win_b)
        day_window_meta = {
            "anchor_date": anchor_parsed.isoformat(),
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "selected_index": selected_idx,
        }
    else:
        periods = get_period_dates(period, offset)

    current_period = next((p for p in periods if p["is_current"]), None)
    previous_period = None
    if current_period:
        current_index = periods.index(current_period)
        if current_index > 0:
            previous_period = periods[current_index - 1]

    return periods, day_window_meta, current_period, previous_period

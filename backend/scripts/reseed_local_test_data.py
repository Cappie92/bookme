#!/usr/bin/env python3
"""
Пересоздание тестовых данных локально строго через API (без прямых INSERT/UPDATE).

Запуск:
  python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

Опции:
  --no-smoke-extended  — пропустить шаг 7d (loyalty QA + заметка клиента; см. docs/SMOKE_RESEED_MAP.md)

Требует: ENVIRONMENT=development, backend запущен, админ +79031078685 существует.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from collections import defaultdict

# Для import utils.phone при запуске из корня проекта
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _BACKEND_ROOT)
sys.path.insert(0, _SCRIPTS_DIR)
from datetime import date, datetime, timedelta
from typing import Any

import httpx

ADMIN_PHONE = "+79031078685"
ADMIN_PASSWORD = "test123"  # устанавливается через reset_admin_password_dev.py
MASTER_PASSWORD = "test123"
CITY = "Москва"
TIMEZONE = "Europe/Moscow"

# Мастера: 10 шт. Канонический формат: +7 + 10 цифр = 12 символов (см. docs/PHONE_FORMAT_AUDIT.md)
MASTER_PHONES = [f"+7999000000{i}" for i in range(10)]  # +79990000000 .. +79990000009
MASTER_PHONES_SET: frozenset[str] = frozenset(MASTER_PHONES)
CLIENT_PASSWORD = "test123"

# Клиенты для будущих броней (3 шт, как было)
CLIENT_PHONES_LEGACY = ["+79990000100", "+79990000101", "+79990000102"]

# Каноника документации / TEST_DATA_ACCOUNTS (не детерминированные ФИО как у +7999{mi}{ci})
_LEGACY_CLIENT_REGISTER: dict[str, tuple[str, str]] = {
    "+79990000100": ("client0@79990000100.example.com", "Клиент +79990000100"),
    "+79990000101": ("client1@79990000101.example.com", "Клиент +79990000101"),
    "+79990000102": ("client2@79990000102.example.com", "Клиент +79990000102"),
}

# Клиенты для модуля «Клиенты»: 40 на мастера, детерминированные телефоны
# Канонический формат: +7 + 10 цифр = 12 символов (см. docs/PHONE_FORMAT_AUDIT.md)
# Шаблон +7999{master_idx}{client_idx:06d}: после «+7» идёт «999» (3) + master_idx (1) + client (6) = 10 цифр.
# Важно: литерал «+7999» даёт только три девятки после кода страны, не четыре; :05d давало 9 цифр всего.
# Старый +7999{1+master_idx}000{client_idx:03d} при master_idx=9 давал «10» → 11 цифр после +7.
# Коллизия: при master_idx==0 и client_idx 0..9 строка совпадает с MASTER_PHONES — в БД это пользователи-мастера.
# Их нельзя подставлять в POST /api/bookings/public (роль client); см. отбор в all_client_phones ниже.
CLIENTS_PER_MASTER = 40

# Реалистичные ФИО и дата рождения для smoke/LK (детерминированно от индекса)
_CLIENT_FIRST = (
    "Алексей",
    "Мария",
    "Дмитрий",
    "Анна",
    "Иван",
    "Ольга",
    "Сергей",
    "Елена",
    "Павел",
    "Наталья",
    "Андрей",
    "Татьяна",
    "Михаил",
    "Юлия",
)
_CLIENT_LAST = (
    "Иванов",
    "Петрова",
    "Сидоров",
    "Козлова",
    "Новиков",
    "Морозова",
    "Волков",
    "Соколова",
    "Лебедев",
    "Кузнецова",
    "Морозов",
    "Васильева",
    "Павлов",
    "Фёдорова",
)


def client_register_body(index: int, phone: str) -> dict[str, Any]:
    """Тело POST /api/auth/register для тестового клиента: имя, email, день рождения."""
    if phone in _LEGACY_CLIENT_REGISTER:
        email, full_name = _LEGACY_CLIENT_REGISTER[phone]
        return {
            "phone": phone,
            "password": CLIENT_PASSWORD,
            "role": "client",
            "email": email,
            "full_name": full_name,
        }
    fn = _CLIENT_FIRST[index % len(_CLIENT_FIRST)]
    ln = _CLIENT_LAST[(index // len(_CLIENT_FIRST)) % len(_CLIENT_LAST)]
    digits = "".join(c for c in phone if c.isdigit())
    # example.com — валидный домен для EmailStr (зарезервированные TLD вроде .test отклоняются)
    email = f"reseed.client.{digits}@example.com"
    full_name = f"{fn} {ln}"
    y = 1985 + (index % 22)
    m = (index % 12) + 1
    d = min(28, (index % 28) + 1)
    birth = date(y, m, d)
    return {
        "phone": phone,
        "password": CLIENT_PASSWORD,
        "role": "client",
        "email": email,
        "full_name": full_name,
        "birth_date": birth.isoformat(),
    }


def client_phone_for_master(master_idx: int, client_idx: int) -> str:
    """Телефон клиента в каноническом формате +7XXXXXXXXXX (10 цифр после +7)."""
    if not (0 <= master_idx <= 9):
        raise ValueError(f"client_phone_for_master: master_idx must be 0..9, got {master_idx}")
    if not (0 <= client_idx < CLIENTS_PER_MASTER):
        raise ValueError(
            f"client_phone_for_master: client_idx must be 0..{CLIENTS_PER_MASTER - 1}, got {client_idx}"
        )
    return f"+7999{master_idx}{client_idx:06d}"


INDIE_SERVICES = [
    {"name": "Инди: Стрижка", "duration": 30, "price": 1200.0},
    {"name": "Инди: Борода", "duration": 20, "price": 800.0},
    {"name": "Инди: Укладка", "duration": 45, "price": 1500.0},
]

CATEGORIES = ["Стрижки", "Окрашивание"]
SERVICES = [
    {"name": "Стрижка мужская", "duration": 30, "price": 1000.0},
    {"name": "Стрижка женская", "duration": 60, "price": 1500.0},
    {"name": "Окрашивание корни", "duration": 90, "price": 2200.0},
    {"name": "Окрашивание полное", "duration": 120, "price": 3000.0},
]

# Планы: Free…Pro как раньше + 2 Premium (макс. коммерческий тариф в БД) normal/low.
# Индексы 0–6 совпадают с прежними 8 мастерами; +79990000006/07 по-прежнему Pro stable/low (регрессионные скрипты).
PLAN_ASSIGNMENTS = [
    ("Free", None, None),
    ("Free", None, None),
    ("Basic", "normal", None),
    ("Basic", "low", None),
    ("Standard", "normal", None),
    ("Standard", "low", None),
    ("Pro", "normal", None),
    ("Pro", "low", None),
    ("Premium", "normal", None),
    ("Premium", "low", None),
]

# Часы для разнообразия броней (10:00, 12:00, 14:00)
PREFERRED_HOURS = [10, 12, 14]

SCHEDULE_DAYS = 35
BOOKING_PERIOD_DAYS = 30
ACTIVE_WEEKDAYS = (2, 4, 6)  # Tue, Thu, Sat (isoweekday)

# Дашборд мастера (smoke): тот же мастер, что и «выравнивание графиков» — первый в MASTER_PHONES (+79990000000)
SMOKE_DASHBOARD_MASTER_IDX = 0
# Клиент «VIP» для подписи в логе / модуль Клиенты (не idx 0 — коллизия с телефоном мастера)
SMOKE_MASTER0_VIP_CLIENT_IDX = 5
# Ровно 6 completed у smoke-VIP в дашборд-окне: по 2 в неделях -2, -1, 0 (лимит ≤2 визита на клиента в bucket)
SMOKE_MASTER0_VIP_COMPLETED_TARGET = 6
# Целевой bt = bc+bp по bucket (как GET /master/dashboard/stats period=week offset=0); cancelled в totals не входят
SMOKE_MASTER0_BUCKET_BT_TARGET: dict[int, int] = {-2: 8, -1: 9, 0: 8, 1: 8, 2: 9}


def _dashboard_anchor_monday(anchor: date) -> date:
    return anchor - timedelta(days=anchor.weekday())


def _ordered_days_in_week(week_monday: date) -> list[date]:
    days = [week_monday + timedelta(days=k) for k in range(7)]
    pref = [d for d in days if d.isoweekday() in ACTIVE_WEEKDAYS]
    rest = [d for d in days if d not in pref]
    return pref + rest


def _smoke_week_bucket_index(booking_date: date, today: date) -> int:
    """Индекс недели относительно текущей (0 = текущая), как у dashboard/stats period=week offset=0."""
    cur_mon = today - timedelta(days=today.weekday())
    b_mon = booking_date - timedelta(days=booking_date.weekday())
    return (b_mon - cur_mon).days // 7


# Фиксированные слоты часов (детерминированно, без random); соседние брони в один день разведены по времени
_SMOKE_HOUR_SLOTS: list[tuple[int, int]] = [
    (10, 0),
    (11, 30),
    (12, 0),
    (14, 0),
    (15, 30),
    (13, 0),
    (16, 0),
    (10, 30),
    (12, 30),
]


def build_smoke_master0_dashboard_bookings(
    today: date, service_id: int, *, is_indie: bool = False
) -> list[dict[str, Any]]:
    """
    Жёсткий детерминированный сценарий для smoke-мастера (MASTER_PHONES[0]).
    Совпадает с окном GET /api/master/dashboard/stats period=week offset=0 (5 недель).

    Правила: в каждом bucket ≤2 брони на одного клиента; ≤3 брони в день на мастера;
    completed только в прошлом/текущей неделе и только на днях <= today в текущей неделе;
    pending в текущей неделе только на днях > today; в +1/+2 только pending;
    cancelled — отдельно, статусы исключены из bc/bp/bt в API.
    """
    mon0 = _dashboard_anchor_monday(today)
    vip_idx = SMOKE_MASTER0_VIP_CLIENT_IDX

    items: list[dict[str, Any]] = []
    hour_slot = 0

    def append_row(
        d: date,
        status: str,
        client_idx: int,
        *,
        cancellation_reason: str | None = None,
    ) -> None:
        nonlocal hour_slot
        ph = client_phone_for_master(0, client_idx)
        if ph in MASTER_PHONES_SET:
            client_idx = max(1, (client_idx + 3) % CLIENTS_PER_MASTER)
            ph = client_phone_for_master(0, client_idx)
        ho, mo = _SMOKE_HOUR_SLOTS[hour_slot % len(_SMOKE_HOUR_SLOTS)]
        hour_slot += 1
        row: dict[str, Any] = {
            "client_phone": ph,
            "service_id": service_id,
            "on_date": d.isoformat(),
            "hour": ho,
            "minute": mo,
            "status": status,
            "is_indie": is_indie,
        }
        if cancellation_reason:
            row["cancellation_reason"] = cancellation_reason
        items.append(row)

    # --- Week -2: 8 completed (VIP ровно 2: Tue+Thu; max 2 брони/день) ---
    w_m2 = mon0 - timedelta(days=14)
    append_row(w_m2 + timedelta(days=1), "completed", vip_idx)  # Tue
    append_row(w_m2 + timedelta(days=1), "completed", 10)
    append_row(w_m2 + timedelta(days=3), "completed", vip_idx)  # Thu
    append_row(w_m2 + timedelta(days=3), "completed", 11)
    append_row(w_m2 + timedelta(days=5), "completed", 12)  # Sat
    append_row(w_m2 + timedelta(days=5), "completed", 13)
    append_row(w_m2 + timedelta(days=0), "completed", 14)  # Mon
    append_row(w_m2 + timedelta(days=0), "completed", 15)

    # --- Week -1: 9 completed (VIP Tue+Thu по 1; max 2/день) ---
    w_m1 = mon0 - timedelta(days=7)
    append_row(w_m1 + timedelta(days=1), "completed", vip_idx)
    append_row(w_m1 + timedelta(days=1), "completed", 20)
    append_row(w_m1 + timedelta(days=3), "completed", vip_idx)
    append_row(w_m1 + timedelta(days=3), "completed", 21)
    append_row(w_m1 + timedelta(days=5), "completed", 22)
    append_row(w_m1 + timedelta(days=5), "completed", 23)
    append_row(w_m1 + timedelta(days=0), "completed", 24)
    append_row(w_m1 + timedelta(days=0), "completed", 25)
    append_row(w_m1 + timedelta(days=2), "completed", 26)  # Wed

    # --- Week 0: bt=8 — completed только d<=today, pending только d>today; при нехватке дней — до 3 броней/день ---
    bt0 = SMOKE_MASTER0_BUCKET_BT_TARGET[0]
    ordered0 = _ordered_days_in_week(mon0)
    past_days0 = [d for d in ordered0 if d <= today]
    fut_days0 = [d for d in ordered0 if d > today]
    n_completed_w0 = min(4, len(past_days0))
    need_pending = max(0, bt0 - n_completed_w0)
    pend_by_day: dict[date, int] = {d: 0 for d in fut_days0}
    pend_dates: list[date] = []
    _guard = 0
    while len(pend_dates) < need_pending and fut_days0 and _guard < 64:
        _guard += 1
        progressed = False
        for d in fut_days0:
            if len(pend_dates) >= need_pending:
                break
            if pend_by_day.get(d, 0) >= 3:
                continue
            pend_by_day[d] = pend_by_day.get(d, 0) + 1
            pend_dates.append(d)
            progressed = True
        if not progressed:
            break
    # Добор completed в текущей неделе, если pending не заполнили bt (только дни <= today)
    n_completed_w0 = min(len(past_days0), max(0, bt0 - len(pend_dates)))

    vip_left_w0 = 2
    comp_days = past_days0[:n_completed_w0]
    comp_cids: list[int] = []
    nonv_i = 0
    for _ in comp_days:
        if vip_left_w0 > 0:
            comp_cids.append(vip_idx)
            vip_left_w0 -= 1
        else:
            comp_cids.append(7 + nonv_i)
            nonv_i += 1
    for d, cid in zip(comp_days, comp_cids):
        append_row(d, "completed", cid)
    pend_client_pool = list(range(15, CLIENTS_PER_MASTER))
    w0_c_count: defaultdict[int, int] = defaultdict(int)
    for c in comp_cids:
        w0_c_count[c] += 1
    pi = 0
    for d in pend_dates:
        st = "created" if pi % 2 == 0 else "awaiting_confirmation"
        chosen: int | None = None
        for off, cid in enumerate(pend_client_pool):
            c = pend_client_pool[(pi + off) % len(pend_client_pool)]
            if w0_c_count[c] < 2:
                chosen = c
                break
        if chosen is None:
            chosen = 23
        w0_c_count[chosen] += 1
        append_row(d, st, chosen)
        pi += 1

    # --- Week +1: 8 pending only ---
    w_p1 = mon0 + timedelta(days=7)
    append_row(w_p1 + timedelta(days=1), "created", 30)
    append_row(w_p1 + timedelta(days=1), "awaiting_confirmation", 31)
    append_row(w_p1 + timedelta(days=1), "created", 32)
    append_row(w_p1 + timedelta(days=3), "awaiting_confirmation", 33)
    append_row(w_p1 + timedelta(days=3), "created", 34)
    append_row(w_p1 + timedelta(days=5), "awaiting_confirmation", 35)
    append_row(w_p1 + timedelta(days=5), "created", 36)
    append_row(w_p1 + timedelta(days=2), "awaiting_confirmation", 37)

    # --- Week +2: 9 pending only ---
    w_p2 = mon0 + timedelta(days=14)
    append_row(w_p2 + timedelta(days=1), "created", 38)
    append_row(w_p2 + timedelta(days=1), "awaiting_confirmation", 39)
    append_row(w_p2 + timedelta(days=1), "created", 10)
    append_row(w_p2 + timedelta(days=3), "awaiting_confirmation", 11)
    append_row(w_p2 + timedelta(days=3), "created", 12)
    append_row(w_p2 + timedelta(days=3), "awaiting_confirmation", 13)
    append_row(w_p2 + timedelta(days=5), "created", 14)
    append_row(w_p2 + timedelta(days=5), "awaiting_confirmation", 15)
    append_row(w_p2 + timedelta(days=5), "created", 16)

    # --- Cancelled: малый сценарий в прошлом bucket -2 (не входит в bt) ---
    for j, off in enumerate((2, 4)):  # Wed, Fri недели -2
        cd = w_m2 + timedelta(days=off)
        if cd <= today:
            append_row(
                cd,
                "cancelled",
                CLIENTS_PER_MASTER - 5 + j,
                cancellation_reason=["client_requested", "client_no_show"][j % 2],
            )

    return items


def analyze_smoke_master_plan_buckets(
    items: list[dict[str, Any]], today: date
) -> dict[int, dict[str, Any]]:
    """
    Агрегаты по плану (до/независимо от БД): те же excluded/pending правила, что у dashboard/stats.
    """
    out: dict[int, dict[str, Any]] = {
        i: {"bc": 0, "bp": 0, "bt": 0, "by_client": {}}
        for i in range(-2, 3)
    }
    for row in items:
        st = str(row.get("status") or "")
        if st == "cancelled" or st.startswith("cancelled"):
            continue
        od = row.get("on_date")
        if not od:
            continue
        d = date.fromisoformat(str(od))
        bi = _smoke_week_bucket_index(d, today)
        if bi not in out:
            continue
        ph = str(row.get("client_phone") or "")
        bucket = out[bi]
        if st == "completed":
            bucket["bc"] += 1
        elif st in ("created", "awaiting_confirmation", "confirmed"):
            bucket["bp"] += 1
        else:
            continue
        bucket["bt"] = bucket["bc"] + bucket["bp"]
        bucket["by_client"][ph] = bucket["by_client"].get(ph, 0) + 1
    for b in out.values():
        phones = b["by_client"]
        b["unique_clients"] = len(phones)
        b["max_per_client"] = max(phones.values()) if phones else 0
        del b["by_client"]
    return out


def print_smoke_master_week_bucket_report(
    client: httpx.Client,
    base: str,
    master_token: str,
    *,
    headline: str,
    planned_items: list[dict[str, Any]] | None = None,
    today: date | None = None,
) -> None:
    """Печать totals как у дашборда (источник правды — API) + сверка с планом генератора."""
    plan_by_idx: dict[int, dict[str, Any]] | None = None
    if planned_items is not None and today is not None:
        plan_by_idx = analyze_smoke_master_plan_buckets(planned_items, today)

    try:
        r = client.get(
            f"{base}/api/master/dashboard/stats",
            params={"period": "week", "offset": "0"},
            headers={**auth_headers(master_token), "Content-Type": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
    except Exception as ex:
        print(f"\n[WARN] {headline}: не удалось получить /api/master/dashboard/stats: {ex}")
        return

    weeks = data.get("weeks_data") or []
    print(f"\n=== {headline} ===")
    print(
        "period_start..period_end | past/cur/fut | "
        "bc bp bt | ic ip it | Δbt | Δbt%  "
        "(bc=bookings_confirmed, bp=pending, bt=total; ic/ip/it=income_*; "
        "Δbt к предыдущему bucket по API)"
    )
    prev_bt: int | None = None
    bucket_labels = ("week -2", "week -1", "current", "week +1", "week +2")
    for idx, w in enumerate(weeks):
        ps, pe = w.get("period_start"), w.get("period_end")
        flags = f"p={w.get('is_past')} c={w.get('is_current')} f={w.get('is_future')}"
        bc = int(w.get("bookings_confirmed") or 0)
        bp = int(w.get("bookings_pending") or 0)
        bt = int(w.get("bookings_total") or w.get("bookings") or 0)
        ic = float(w.get("income_confirmed_rub") or w.get("income") or 0)
        ip = float(w.get("income_pending_rub") or 0)
        it = float(w.get("income_total_rub") or 0)
        delta_bt = ""
        delta_pct = ""
        if prev_bt is not None:
            d = bt - prev_bt
            delta_bt = f"{d:+d}"
            if prev_bt > 0:
                delta_pct = f"{round((bt - prev_bt) / prev_bt * 100):+d}%"
            elif bt > 0:
                delta_pct = "(prev 0)"
        else:
            delta_bt = "—"
            delta_pct = "—"
        line = (
            f"  {ps}..{pe} | {flags} | "
            f"{bc} {bp} {bt} | {ic:.0f} {ip:.0f} {it:.0f} | Δbt={delta_bt} | {delta_pct}"
        )
        print(line)
        wi = idx - 2
        if plan_by_idx is not None and wi in plan_by_idx:
            p = plan_by_idx[wi]
            tgt = SMOKE_MASTER0_BUCKET_BT_TARGET.get(wi, "")
            lbl = bucket_labels[idx] if idx < len(bucket_labels) else f"idx {wi}"
            print(
                f"    план [{lbl}]: bc={p['bc']} bp={p['bp']} bt={p['bt']} "
                f"(target bt={tgt}) | уник.клиентов={p['unique_clients']} max/клиент={p['max_per_client']}"
            )
        prev_bt = bt
    print("=== конец week buckets ===\n")


def warn_if_demo_master_collides_reseed_phones() -> None:
    """
    Если в .env задан DEMO_MASTER_PHONE из канонической матрицы мастеров reseed,
    этот пользователь блокируется на PUT (демо read-only) — второй мастер «молча» ломается.
    """
    demo = (os.getenv("DEMO_MASTER_PHONE") or "").strip()
    if not demo or demo not in MASTER_PHONES_SET:
        return
    print(
        "\n*** WARN: DEMO_MASTER_PHONE=%r совпадает с MASTER_PHONES reseed (+79990000000…+79990000009). "
        "Мастер с этим номером получит 403 на PUT/PATCH/DELETE. Уберите из .env или задайте, например, +79990009999 "
        "(см. backend/settings.py).\n"
        % demo
    )


def login(client: httpx.Client, base_url: str, phone: str, password: str) -> str:
    r = client.post(
        f"{base_url}/api/auth/login",
        json={"phone": phone, "password": password},
    )
    r.raise_for_status()
    data = r.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError("No access_token in login response")
    return token


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def resolve_plan(plans: list[dict], name: str) -> dict | None:
    """Найти план по имени с fallback (Standard -> Standart)."""
    by_name = {p["name"]: p for p in plans}
    p = by_name.get(name)
    if p:
        return p
    if name == "Standard":
        return by_name.get("Standart")
    return None


def fetch_master_subscription_feature_row(client: httpx.Client, base: str, token: str) -> dict[str, Any]:
    """Каноничные флаги с GET /api/master/subscription/features для артефакта TEST_DATA_ACCOUNTS.md."""
    keys = (
        "has_booking_page",
        "has_unlimited_bookings",
        "has_extended_stats",
        "has_loyalty_access",
        "has_finance_access",
        "has_client_restrictions",
        "can_customize_domain",
        "has_clients_access",
        "max_page_modules",
        "plan_name",
        "plan_id",
    )
    row: dict[str, Any] = {}
    try:
        r = client.get(
            f"{base}/api/master/subscription/features",
            headers=auth_headers(token),
        )
        r.raise_for_status()
        j = r.json()
        for k in keys:
            row[k] = j.get(k)
    except Exception as e:
        row["_fetch_error"] = str(e)
    return row


def _md_cell(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).replace("|", "\\|").replace("\n", " ").strip()
    return s


def _fmt_bool_yn(v: Any) -> str:
    if v is True:
        return "yes"
    if v is False:
        return "no"
    return ""


def write_test_data_accounts_artifact(
    repo_root: str,
    *,
    mode_str: str,
    no_salon: bool,
    indie_mode_str: str,
    admin_phone: str,
    admin_password: str,
    master_password: str,
    client_password: str,
    master_results: list[dict[str, Any]],
    client_phones_legacy: list[str],
    master_phones: list[str],
    clients_per_master: int,
) -> str:
    """
    Перезаписывает docs/TEST_DATA_ACCOUNTS.md (source of truth после reseed).
    Возвращает абсолютный путь к файлу.
    """
    path = os.path.join(repo_root, "docs", "TEST_DATA_ACCOUNTS.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    lines: list[str] = [
        "# Тестовые аккаунты DeDato (автогенерация)",
        "",
        "> **Не редактировать вручную.** Файл перезаписывается `backend/scripts/reseed_local_test_data.py` после каждого reseed.",
        "",
        f"- **Сгенерировано:** {now}",
        f"- **Режим reseed:** `{mode_str}` (`--no-salon`={'да' if no_salon else 'нет'})",
        f"- **Indie / брони:** `{indie_mode_str}`",
        f"- **Макс. коммерческий план мастера в БД:** `Premium` (план `AlwaysFree` — служебный, в публичном списке не показывается).",
        "",
        "## Администратор",
        "",
        "| Role | Phone | Email | Full name | Plan | Balance / scenario | Password | Notes |",
        "|------|-------|-------|-----------|------|-------------------|----------|-------|",
        f"| admin | {_md_cell(admin_phone)} | (см. БД) | (см. БД) | — | — | {_md_cell(admin_password)} | NOT DELETED при reset |",
        "",
        "## Мастера (подписка + флаги `/api/master/subscription/features`)",
        "",
        "| Role | Phone | Email | Full name | Plan | Balance type | Expected behavior | Password | "
        "has_clients | ext.stats | finance | restrictions | loyalty | domain | max_modules | API plan_name |",
        "|------|-------|-------|-----------|------|--------------|-------------------|----------|"
        "------------|-----------|---------|----------------|---------|--------|-------------|---------------|",
    ]

    for m in master_results:
        ff = m.get("feature_flags") or {}
        err = ff.get("_fetch_error")
        if err:
            ff_cols = ["—"] * 7 + [f"ERROR: {_md_cell(str(err))[:100]}"]
        else:
            ff_cols = [
                _fmt_bool_yn(ff.get("has_clients_access")),
                _fmt_bool_yn(ff.get("has_extended_stats")),
                _fmt_bool_yn(ff.get("has_finance_access")),
                _fmt_bool_yn(ff.get("has_client_restrictions")),
                _fmt_bool_yn(ff.get("has_loyalty_access")),
                _fmt_bool_yn(ff.get("can_customize_domain")),
                _md_cell(ff.get("max_page_modules")),
                _md_cell(ff.get("plan_name")),
            ]
        exp = "20+ дней подписки" if m["balance_type"] == "normal" else "деактивация после daily job"
        if m["plan_name"] == "Free":
            exp = "can_continue=true"
        row_cells = [
            "master",
            _md_cell(m["phone"]),
            _md_cell(m["email"]),
            _md_cell(m["full_name"]),
            _md_cell(m["plan_name"]),
            _md_cell(m["balance_type"]),
            _md_cell(exp),
            _md_cell(master_password),
        ] + [_md_cell(x) for x in ff_cols]
        lines.append("| " + " | ".join(row_cells) + " |")

    lines += [
        "",
        "## Клиенты (legacy, всегда регистрируются)",
        "",
        "| Role | Phone | Email | Full name | Plan | Password | Notes |",
        "|------|-------|-------|-----------|------|----------|-------|",
    ]
    for i, cphone in enumerate(client_phones_legacy):
        body = client_register_body(i, cphone)
        lines.append(
            f"| client | {_md_cell(cphone)} | {_md_cell(body['email'])} | "
            f"{_md_cell(body['full_name'])} | — | {_md_cell(client_password)} | логин, ЛК |"
        )

    if not no_salon:
        lines += [
            "",
            "## Модуль «Клиенты» — дополнительные клиенты (только полный reseed)",
            "",
            f"По **{clients_per_master}** клиентов на каждого из **{len(master_phones)}** мастеров. "
            f"Телефон: `+7999{{master_idx}}{{client_idx:06d}}`, `master_idx` 0…{len(master_phones) - 1}, "
            f"`client_idx` 0…{clients_per_master - 1}. Пароль: `{client_password}`.",
            "",
            "| Назначение | Пример телефона |",
            "|------------|-----------------|",
        ]
        for mi in range(min(3, len(master_phones))):
            ex1 = client_phone_for_master(mi, 0)
            ex2 = client_phone_for_master(mi, 1)
            lines.append(f"| Мастер idx={mi} ({master_phones[mi]}) VIP + обычный | `{ex1}`, `{ex2}` |")

    lines += ["", "---", "", "*Конец автогенерации.*", ""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Пересоздание тестовых данных через API. "
        "Режим --no-salon: только подписки (мастера, балансы, клиенты), без салона/услуг/расписаний/броней."
    )
    ap.add_argument("--base-url", default="http://localhost:8000", help="Base API URL")
    ap.add_argument("--admin-password", default=ADMIN_PASSWORD, help="Admin password")
    ap.add_argument(
        "--no-salon",
        action="store_true",
        help="Только подписки: мастера, балансы, клиенты. Без салона, услуг, расписаний, броней. Подходит для daily charges regression.",
    )
    ap.add_argument(
        "--legacy-indie-bookings",
        action="store_true",
        help="Создать IndieMaster + indie-услуги + брони с indie_master_id (legacy). По умолчанию OFF — master-only.",
    )
    ap.add_argument("--verbose", "-v", action="store_true", help="Подробный вывод (в т.ч. testdata container)")
    ap.add_argument(
        "--no-smoke-extended",
        action="store_true",
        help="Не выполнять шаг 7d: расширение smoke (loyalty settings, quick/personal, заметка клиента).",
    )
    args = ap.parse_args()
    base = args.base_url.rstrip("/")
    admin_password = args.admin_password
    no_salon = args.no_salon
    legacy_indie_bookings = args.legacy_indie_bookings
    verbose = args.verbose
    smoke_extended = not args.no_smoke_extended

    if no_salon:
        print("Режим --no-salon: только подписки (мастера, балансы, клиенты). Без салона/услуг/расписаний/броней.")
    if legacy_indie_bookings:
        print("Режим --legacy-indie-bookings: IndieMaster + indie-услуги + брони с indie_master_id.")
    else:
        print("Режим master-only (по умолчанию): брони только с master_id, без indie.")

    warn_if_demo_master_collides_reseed_phones()

    with httpx.Client(timeout=60.0) as client:
        # 1) Login admin
        try:
            admin_token = login(client, base, ADMIN_PHONE, admin_password)
        except Exception as e:
            print(f"Login admin failed: {e}")
            return 1
        headers = auth_headers(admin_token)

        # 2) Reset non-admin users
        try:
            r = client.post(f"{base}/api/dev/testdata/reset_non_admin_users", headers=headers)
            r.raise_for_status()
            reset_data = r.json()
            print(f"Reset: deleted {reset_data.get('deleted_users', 0)} users")
        except httpx.HTTPStatusError as e:
            print(f"Reset failed: {e.response.status_code} {e.response.text}")
            return 1

        # 3) Plans (не хардкодим id, получаем по API)
        r = client.get(f"{base}/api/subscription-plans/available?subscription_type=master")
        r.raise_for_status()
        plans = r.json()
        plan_names = [p["name"] for p in plans]
        print(f"Available plans: {plan_names}")

        free_plan = resolve_plan(plans, "Free")
        basic_plan = resolve_plan(plans, "Basic")
        standard_plan = resolve_plan(plans, "Standard") or resolve_plan(plans, "Standart")
        pro_plan = resolve_plan(plans, "Pro")
        premium_plan = resolve_plan(plans, "Premium")

        if not free_plan or not basic_plan or not pro_plan:
            print("Missing plans: need Free, Basic, Pro (Standard/Standart optional)")
            return 1
        if not standard_plan:
            standard_plan = basic_plan
        if not premium_plan:
            print("WARN: Premium plan not in /available; slots Premium → Pro (регресс premium-фич урезан).")
            premium_plan = pro_plan

        plan_map = {
            "Free": free_plan,
            "Basic": basic_plan,
            "Standard": standard_plan,
            "Standart": standard_plan,
            "Pro": pro_plan,
            "Premium": premium_plan,
        }

        # 4) Ensure test salon (контейнер для услуг/броней — только если не --no-salon)
        salon_data = None
        if not no_salon:
            r = client.post(f"{base}/api/dev/testdata/ensure_test_salon", headers=headers)
            r.raise_for_status()
            salon_data = r.json()
            if verbose:
                print(f"Testdata container: salon_id={salon_data['salon_id']}, category_id={salon_data['category_id']} (для услуг/броней)")

        # 5) Create masters
        today = date.today()
        master_results: list[dict[str, Any]] = []
        master_id_to_services: dict[int, list[dict]] = {}

        for idx, (plan_name, balance_type, _) in enumerate(PLAN_ASSIGNMENTS):
            if idx >= len(MASTER_PHONES):
                break
            phone = MASTER_PHONES[idx]
            email = f"master{idx}@example.com"
            full_name = f"Мастер {plan_name} {idx}"

            # Register (city, timezone обязательны для master -> timezone_confirmed=True)
            token = None
            try:
                r = client.post(
                    f"{base}/api/auth/register",
                    json={
                        "phone": phone,
                        "password": MASTER_PASSWORD,
                        "role": "master",
                        "email": email,
                        "full_name": full_name,
                        "city": CITY,
                        "timezone": TIMEZONE,
                    },
                )
                r.raise_for_status()
                token = r.json()["access_token"]
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 400 and ("already" in (e.response.text or "").lower() or "registered" in (e.response.text or "").lower()):
                    try:
                        token = login(client, base, phone, MASTER_PASSWORD)
                    except Exception as login_err:
                        print(f"Register {phone} failed, login fallback failed: {login_err}")
                        continue
                else:
                    print(f"Register {phone} failed: {e.response.status_code} {e.response.text[:200]}")
                    continue
            m_headers = auth_headers(token)

            # Master id from settings
            r = client.get(f"{base}/api/master/settings", headers=m_headers)
            r.raise_for_status()
            settings = r.json()
            master_id = settings["master"]["id"]

            # Update profile (full_name, email)
            r = client.put(
                f"{base}/api/master/profile",
                headers=m_headers,
                data={"full_name": full_name, "email": email},
            )
            r.raise_for_status()

            # Categories, MasterService, salon Services (только если не --no-salon)
            cat_ids = []
            service_ids = []
            if not no_salon:
                for cname in CATEGORIES:
                    r = client.post(f"{base}/api/master/categories", headers=m_headers, json={"name": cname})
                    r.raise_for_status()
                    cat_ids.append(r.json()["id"])

                ms_list = []
                for i, svc in enumerate(SERVICES):
                    cid = cat_ids[i % 2]
                    r = client.post(
                        f"{base}/api/master/services",
                        headers=m_headers,
                        json={
                            "name": svc["name"],
                            "duration": svc["duration"],
                            "price": svc["price"],
                            "category_id": cid,
                        },
                    )
                    r.raise_for_status()
                    ms_list.append({**svc, "id": r.json()["id"]})

                for svc in ms_list:
                    r = client.post(
                        f"{base}/api/dev/testdata/create_service_and_link_master",
                        headers=headers,
                        json={
                            "master_id": master_id,
                            "name": svc["name"],
                            "duration": svc["duration"],
                            "price": svc["price"],
                        },
                    )
                    r.raise_for_status()
                    service_ids.append(r.json()["service_id"])
                master_id_to_services[master_id] = [
                    {"service_id": sid, **svc} for sid, svc in zip(service_ids, SERVICES)
                ]

                # Indie: только при --legacy-indie-bookings
                if legacy_indie_bookings:
                    r = client.post(
                        f"{base}/api/dev/testdata/ensure_indie_master",
                        headers=headers,
                        json={"master_id": master_id},
                    )
                    r.raise_for_status()
                    indie_data = r.json()
                    indie_master_id_val = indie_data.get("indie_master_id")
                    indie_services_list = []
                    if indie_master_id_val:
                        for isvc in INDIE_SERVICES:
                            rr = client.post(
                                f"{base}/api/dev/testdata/create_indie_service",
                                headers=headers,
                                json={
                                    "indie_master_id": indie_master_id_val,
                                    "name": isvc["name"],
                                    "duration": isvc["duration"],
                                    "price": isvc["price"],
                                },
                            )
                            rr.raise_for_status()
                            indie_services_list.append({
                                "service_id": rr.json()["service_id"],
                                **isvc,
                            })
                else:
                    indie_master_id_val = None
                    indie_services_list = []
            else:
                indie_master_id_val = None
                indie_services_list = []

            # Plan + balance (dev-only)
            plan = plan_map.get(plan_name) or free_plan
            plan_id = plan["id"]
            duration_months = 1
            r = client.post(
                f"{base}/api/dev/testdata/set_subscription",
                headers=headers,
                json={"phone": phone, "plan_id": plan_id, "duration_months": duration_months},
            )
            r.raise_for_status()
            sub = r.json()
            daily_rate = sub["daily_rate"]
            total_price = sub.get("total_price") or (daily_rate * sub.get("duration_days", 30))
            duration_days = sub.get("duration_days", 30)

            # Stable: баланс на полный период + 5%, чтобы days_remaining ≈ calendar_days (29–30)
            # Low: balance = ceil(daily_rate * 1.2) — хватает на 1 SUCCESS, 2-й день FAIL
            if plan_name == "Free":
                balance_rub = 0.0
            elif balance_type == "normal":
                balance_rub = max(math.ceil(daily_rate * duration_days * 1.05), total_price * 1.05)
            else:
                balance_rub = max(math.ceil(daily_rate * 1.2), 1.0)

            r = client.post(
                f"{base}/api/dev/testdata/set_balance",
                headers=headers,
                json={"phone": phone, "balance_rub": balance_rub},
            )
            r.raise_for_status()

            feature_flags = fetch_master_subscription_feature_row(client, base, token)

            # Schedule (только если не --no-salon)
            slots_created = 0
            if not no_salon:
                start_str = today.isoformat()
                end_str = (today + timedelta(days=SCHEDULE_DAYS)).isoformat()
                weekdays = {
                    str(d): {"start": "10:00", "end": "18:00", "enabled": True}
                    for d in ACTIVE_WEEKDAYS
                }
                r = client.post(
                    f"{base}/api/master/schedule/rules",
                    headers=m_headers,
                    json={
                        "type": "weekdays",
                        "effective_start_date": start_str,
                        "valid_until": end_str,
                        "weekdays": weekdays,
                    },
                )
                r.raise_for_status()
                rules_resp = r.json()
                slots_created = rules_resp.get("slots_created", 0)

                try:
                    r = client.post(
                        f"{base}/api/master/schedule/bulk-create",
                        params={"start_date": start_str, "end_date": end_str},
                        headers=m_headers,
                    )
                    if r.status_code == 200:
                        bulk = r.json()
                        slots_created += bulk.get("created_records", 0)
                except Exception:
                    pass

            balance_type_str = balance_type or "—"
            master_results.append({
                "phone": phone,
                "email": email,
                "full_name": full_name,
                "master_id": master_id,
                "plan_name": plan_name,
                "balance_type": balance_type_str,
                "daily_rate": daily_rate,
                "total_price": total_price,
                "duration_days": duration_days,
                "balance_rub": balance_rub,
                "services_count": 4 if not no_salon else 0,
                "categories_count": 2 if not no_salon else 0,
                "schedule_days_created": slots_created,
                "bookings_created": 0,
                "service_ids": service_ids,
                "token": token,
                "indie_master_id": indie_master_id_val if not no_salon else None,
                "indie_services": indie_services_list if not no_salon else [],
                "feature_flags": feature_flags,
            })

        # 6) Register clients: legacy (3) всегда; для full reseed — +40 на мастера для модуля «Клиенты»
        all_client_phones: list[str] = list(CLIENT_PHONES_LEGACY)
        if not no_salon:
            for mi in range(len(MASTER_PHONES)):
                for ci in range(CLIENTS_PER_MASTER):
                    all_client_phones.append(client_phone_for_master(mi, ci))
        # Публичная запись: client_phone должен быть ролью client; MASTER_PHONES совпадают с client_phone_for_master(0,0..9).
        booking_client_phones = [p for p in all_client_phones if p not in MASTER_PHONES_SET]
        if not booking_client_phones:
            booking_client_phones = list(CLIENT_PHONES_LEGACY)

        for i, cphone in enumerate(all_client_phones):
            if cphone in MASTER_PHONES_SET:
                continue
            try:
                r = client.post(
                    f"{base}/api/auth/register",
                    json=client_register_body(i, cphone),
                )
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 400 and ("already" in (e.response.text or "").lower() or "registered" in (e.response.text or "").lower()):
                    try:
                        login(client, base, cphone, CLIENT_PASSWORD)
                    except Exception:
                        print(f"[reseed] client {cphone} exists but login failed (no password?)")
                else:
                    print(f"[reseed] client register {cphone} failed: {e.response.status_code} {e.response.text[:150]!r}")

        # 7) Bookings (только если не --no-salon)
        if not no_salon:
            end_date = today + timedelta(days=BOOKING_PERIOD_DAYS)
            client_idx = 0

            for m in master_results:
                mid = m["master_id"]
                # Smoke-мастер (первый): без шага 7 публичных броней — иначе pending в будущих bucket даёт скачки ~80%
                if mid == master_results[SMOKE_DASHBOARD_MASTER_IDX]["master_id"]:
                    m["bookings_created"] = 0
                    continue
                m_headers = auth_headers(m["token"])
                services = master_id_to_services.get(mid, [])
                indie_svcs = m.get("indie_services") or []
                indie_id = m.get("indie_master_id")
                use_indie_pct = 0.7 if indie_svcs else 0
                created = 0
                d = today
                while d <= end_date:
                    if d.isoweekday() not in ACTIVE_WEEKDAYS:
                        d += timedelta(days=1)
                        continue
                    booked = False
                    use_indie = use_indie_pct > 0 and (client_idx % 10) < int(use_indie_pct * 10)
                    svc_list = indie_svcs if use_indie and indie_svcs else services
                    for svc in svc_list:
                        duration = svc["duration"]
                        sid = svc["service_id"]
                        owner_type = "indie_master" if use_indie and indie_id else "master"
                        owner_id = indie_id if use_indie and indie_id else mid
                        try:
                            r = client.get(
                                f"{base}/api/bookings/available-slots-repeat",
                                params={
                                    "owner_type": owner_type,
                                    "owner_id": owner_id,
                                    "year": d.year,
                                    "month": d.month,
                                    "day": d.day,
                                    "service_duration": duration,
                                },
                            )
                            r.raise_for_status()
                            slots = r.json()
                        except Exception:
                            continue
                        if not slots:
                            continue

                        for slot in slots:
                            st = slot.get("start_time")
                            et = slot.get("end_time")
                            if isinstance(st, str):
                                st = datetime.fromisoformat(st.replace("Z", "+00:00"))
                            if isinstance(et, str):
                                et = datetime.fromisoformat(et.replace("Z", "+00:00"))
                            cphone = booking_client_phones[client_idx % len(booking_client_phones)]
                            client_idx += 1
                            if use_indie and indie_id:
                                booking = {
                                    "indie_master_id": indie_id,
                                    "service_id": sid,
                                    "start_time": st.isoformat(),
                                    "end_time": et.isoformat(),
                                    "client_name": f"Клиент {cphone}",
                                    "service_name": svc["name"],
                                    "service_duration": duration,
                                    "service_price": svc["price"],
                                }
                            else:
                                booking = {
                                    "master_id": mid,
                                    "service_id": sid,
                                    "start_time": st.isoformat(),
                                    "end_time": et.isoformat(),
                                    "client_name": f"Клиент {cphone}",
                                    "service_name": svc["name"],
                                    "service_duration": duration,
                                    "service_price": svc["price"],
                                }
                            try:
                                rr = client.post(
                                    f"{base}/api/bookings/public",
                                    params={"client_phone": cphone},
                                    json=booking,
                                )
                                rr.raise_for_status()
                                created += 1
                                booked = True
                                break
                            except httpx.HTTPStatusError as e:
                                print(
                                    f"[reseed] booking fail master={mid} day={d} "
                                    f"status={e.response.status_code} body={(e.response.text or '')[:200]!r}"
                                )
                                continue
                        if booked:
                            break
                    d += timedelta(days=1)

                m["bookings_created"] = created

            # 7a) Дополнительные брони для клиента +79990000101 (для визуальной проверки ЛК)
            # Без smoke-мастера (MASTER_PHONES[0]): иначе брони попадают в те же week buckets и ломают детерминированный график.
            target_client_phone = "+79990000101"
            target_client_bookings_created = 0
            _7a_master_indices = [i for i in range(len(master_results)) if i != SMOKE_DASHBOARD_MASTER_IDX]
            if target_client_phone in all_client_phones:
                print(f"\n  Создаём дополнительные брони для {target_client_phone}...")
                # Прошлые брони (до 4 шт у разных мастеров, не включая smoke)
                for mi in _7a_master_indices[:4]:
                    m = master_results[mi]
                    services = master_id_to_services.get(m["master_id"], [])
                    indie_svcs = m.get("indie_services") or []
                    if not services and not indie_svcs:
                        continue
                    use_indie = bool(indie_svcs) and mi % 2 == 0
                    svc = (indie_svcs[0] if use_indie else services[0]) if (use_indie and indie_svcs) or services else None
                    if not svc:
                        continue
                    days_ago = 7 + mi * 2
                    try:
                        rr = client.post(
                            f"{base}/api/dev/testdata/create_completed_bookings",
                            headers=headers,
                            json={
                                "master_id": m["master_id"],
                                "bookings": [{
                                    "client_phone": target_client_phone,
                                    "service_id": svc["service_id"],
                                    "days_ago": days_ago,
                                    "hour": 11 + mi,
                                    "minute": 0,
                                    "status": "completed",
                                    "is_indie": use_indie,
                                }]
                            },
                        )
                        rr.raise_for_status()
                        target_client_bookings_created += 1
                    except httpx.HTTPStatusError as ex:
                        detail = (ex.response.text or "")[:500]
                        print(f"    [WARN] Не удалось создать прошлую бронь для {target_client_phone} у мастера {mi}: {ex.response.status_code} {detail}")
                    except Exception as ex:
                        print(f"    [WARN] Не удалось создать прошлую бронь для {target_client_phone} у мастера {mi}: {ex}")
                
                # Будущие брони (до 4 шт у разных мастеров, не включая smoke)
                for mi in _7a_master_indices[:4]:
                    m = master_results[mi]
                    m_headers = auth_headers(m["token"])
                    services = master_id_to_services.get(m["master_id"], [])
                    indie_svcs = m.get("indie_services") or []
                    indie_id = m.get("indie_master_id")
                    use_indie = bool(indie_svcs and indie_id) and mi % 2 == 1
                    svc_list = indie_svcs if use_indie else services
                    if not svc_list:
                        continue
                    svc = svc_list[0]
                    future_day = today + timedelta(days=2 + mi * 2)
                    if future_day.isoweekday() not in ACTIVE_WEEKDAYS:
                        future_day += timedelta(days=1)
                    owner_type = "indie_master" if use_indie and indie_id else "master"
                    owner_id = indie_id if use_indie and indie_id else m["master_id"]
                    try:
                        r = client.get(
                            f"{base}/api/bookings/available-slots-repeat",
                            params={
                                "owner_type": owner_type,
                                "owner_id": owner_id,
                                "year": future_day.year,
                                "month": future_day.month,
                                "day": future_day.day,
                                "service_duration": svc["duration"],
                            },
                        )
                        r.raise_for_status()
                        slots = r.json()
                        if slots:
                            slot = slots[0]
                            st = slot.get("start_time")
                            et = slot.get("end_time")
                            if isinstance(st, str):
                                st = datetime.fromisoformat(st.replace("Z", "+00:00"))
                            if isinstance(et, str):
                                et = datetime.fromisoformat(et.replace("Z", "+00:00"))
                            booking = {
                                "service_id": svc["service_id"],
                                "start_time": st.isoformat(),
                                "end_time": et.isoformat(),
                                "client_name": f"Клиент {target_client_phone}",
                                "service_name": svc["name"],
                                "service_duration": svc["duration"],
                                "service_price": svc["price"],
                            }
                            if use_indie and indie_id:
                                booking["indie_master_id"] = indie_id
                            else:
                                booking["master_id"] = m["master_id"]
                            rr = client.post(
                                f"{base}/api/bookings/public",
                                params={"client_phone": target_client_phone},
                                json=booking,
                            )
                            rr.raise_for_status()
                            target_client_bookings_created += 1
                    except Exception as ex:
                        print(f"    [WARN] Не удалось создать будущую бронь для {target_client_phone} у мастера {mi}: {ex}")
                
                # 1 отменённая бронь (не у smoke-мастера — см. выше)
                if _7a_master_indices:
                    m = master_results[_7a_master_indices[0]]
                    services = master_id_to_services.get(m["master_id"], [])
                    if services:
                        try:
                            rr = client.post(
                                f"{base}/api/dev/testdata/create_completed_bookings",
                                headers=headers,
                                json={
                                    "master_id": m["master_id"],
                                    "bookings": [{
                                        "client_phone": target_client_phone,
                                        "service_id": services[0]["service_id"],
                                        "days_ago": 3,
                                        "hour": 15,
                                        "minute": 0,
                                        "status": "cancelled",
                                        "cancellation_reason": "client_requested",
                                        "is_indie": False,
                                    }]
                                },
                            )
                            rr.raise_for_status()
                            target_client_bookings_created += 1
                        except httpx.HTTPStatusError as ex:
                            detail = (ex.response.text or "")[:500]
                            print(f"    [WARN] Не удалось создать отменённую бронь для {target_client_phone}: {ex.response.status_code} {detail}")
                        except Exception as ex:
                            print(f"    [WARN] Не удалось создать отменённую бронь для {target_client_phone}: {ex}")
                
                print(f"  Создано {target_client_bookings_created} дополнительных броней для {target_client_phone}")
                
                # Начисляем баллы лояльности для первого мастера (идемпотентно)
                if len(master_results) > 0:
                    m = master_results[SMOKE_DASHBOARD_MASTER_IDX]
                    try:
                        # Проверяем наличие SQLite файла
                        import sqlite3
                        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bookme.db")
                        
                        if not os.path.exists(db_path):
                            print(f"  [INFO] Skipped loyalty points grant: SQLite db file not found (likely using Postgres)")
                        else:
                            conn = sqlite3.connect(db_path)
                            cursor = conn.cursor()
                            
                            # Получаем client_id
                            cursor.execute("SELECT id FROM users WHERE phone = ?", (target_client_phone,))
                            client_row = cursor.fetchone()
                            if client_row:
                                client_id = client_row[0]
                                
                                # Удаляем старые транзакции для идемпотентности (только с source='reseed')
                                cursor.execute(
                                    "DELETE FROM loyalty_transactions WHERE client_id = ? AND master_id = ? AND source = 'reseed'",
                                    (client_id, m["master_id"])
                                )
                                
                                # Начисляем 100 баллов с маркером source='reseed'
                                cursor.execute(
                                    """INSERT INTO loyalty_transactions 
                                       (master_id, client_id, booking_id, transaction_type, points, earned_at, expires_at, created_at, source)
                                       VALUES (?, ?, NULL, 'earned', 100, datetime('now'), datetime('now', '+365 days'), datetime('now'), 'reseed')""",
                                    (m["master_id"], client_id)
                                )
                                conn.commit()
                                print(f"  ✓ Начислено 100 баллов лояльности для {target_client_phone} у мастера {m['master_id']} (source=reseed)")
                            else:
                                print(f"    [WARN] Клиент {target_client_phone} не найден в БД")
                            
                            conn.close()
                    except Exception as ex:
                        print(f"    [WARN] Не удалось начислить баллы для {target_client_phone}: {ex}")

            # 7b) Прошедшие COMPLETED брони для модуля «Клиенты» (смесь indie + salon)
            clients_module_completed = 0
            clients_module_cancelled = 0
            clients_module_unique = 0
            sanity_log: list[str] = []
            for mi, m in enumerate(master_results):
                services = master_id_to_services.get(m["master_id"], [])
                indie_svcs = m.get("indie_services") or []
                if not services and not indie_svcs:
                    continue
                booking_items: list[dict] = []
                salon_svc_ids = [s["service_id"] for s in services]
                indie_svc_ids = [s["service_id"] for s in indie_svcs]
                if mi == SMOKE_DASHBOARD_MASTER_IDX:
                    if salon_svc_ids:
                        booking_items = build_smoke_master0_dashboard_bookings(
                            today, salon_svc_ids[0], is_indie=False
                        )
                    elif indie_svc_ids:
                        booking_items = build_smoke_master0_dashboard_bookings(
                            today, indie_svc_ids[0], is_indie=True
                        )
                    else:
                        booking_items = []
                    m["smoke_dashboard_plan"] = booking_items
                else:
                    for ci in range(CLIENTS_PER_MASTER):
                        cphone = client_phone_for_master(mi, ci)
                        use_indie = bool(indie_svc_ids) and (ci % 10) < 7
                        svc_id = (indie_svc_ids[ci % len(indie_svc_ids)] if use_indie else
                                  salon_svc_ids[ci % len(salon_svc_ids)])
                        n_completed = 1
                        if ci == 0:
                            n_completed = 8  # VIP-клиент
                        elif ci < 12:
                            n_completed = min(2 + (ci % 3), 5)  # 30% с 2–5 визитами
                        for k in range(n_completed):
                            booking_items.append({
                                "client_phone": cphone,
                                "service_id": svc_id,
                                "days_ago": 5 + k * 7 + (ci % 5),
                                "hour": 10 + (ci + k) % 8,
                                "minute": 0,
                                "status": "completed",
                                "is_indie": use_indie,
                            })
                        if ci >= CLIENTS_PER_MASTER - 5:
                            cancel_svc = (indie_svc_ids[0] if use_indie and indie_svc_ids
                                          else salon_svc_ids[0] if salon_svc_ids else indie_svc_ids[0])
                            booking_items.append({
                                "client_phone": cphone,
                                "service_id": cancel_svc,
                                "days_ago": 3,
                                "hour": 14,
                                "minute": 0,
                                "status": "cancelled",
                                "cancellation_reason": ["client_no_show", "client_requested", "mutual_agreement", "master_unavailable"][ci % 4],
                                "is_indie": use_indie,
                            })
                if booking_items:
                    try:
                        rr = client.post(
                            f"{base}/api/dev/testdata/create_completed_bookings",
                            headers=headers,
                            json={"master_id": m["master_id"], "bookings": booking_items},
                        )
                        rr.raise_for_status()
                        data = rr.json()
                        nc = data.get("completed_count", 0)
                        nca = data.get("cancelled_count", 0)
                        nu = data.get("unique_clients", 0)
                        indie = data.get("master_has_indie", False)
                        with_salon = data.get("created_with_salon", 0)
                        clients_module_completed += nc
                        clients_module_cancelled += nca
                        clients_module_unique += nu
                        top3 = [client_phone_for_master(mi, 0), client_phone_for_master(mi, 1), client_phone_for_master(mi, 2)]
                        sanity_log.append(
                            f"  M{mi} {m['phone']}: indie={indie} completed={nc} cancelled={nca} "
                            f"unique={nu} with_salon={with_salon} top3={top3}"
                        )
                    except httpx.HTTPStatusError as ex:
                        detail = (ex.response.text or "")[:500]
                        print(f"[reseed] create_completed_bookings master={m['master_id']} failed: {ex.response.status_code} {detail}")
                    except Exception as ex:
                        print(f"[reseed] create_completed_bookings master={m['master_id']} failed: {ex}")

            if clients_module_completed or clients_module_cancelled:
                print("  Clients module (прошлые записи):")
                for line in sanity_log[:4]:
                    print(line)
                if len(sanity_log) > 4:
                    print(f"  ... и ещё {len(sanity_log) - 4} мастеров")
                print(f"  Итого: {clients_module_completed} completed, {clients_module_cancelled} cancelled")

            # 7c) Финансы: фиксированные точки в 2026-02..2026-04 для mobile «Финансы» / custom range
            finance_bookings_ok = 0
            finance_expenses_ok = 0
            for mi, m in enumerate(master_results):
                services = master_id_to_services.get(m["master_id"], [])
                if not services:
                    continue
                svc_id = services[0]["service_id"]
                cphone = client_phone_for_master(mi, 0)
                finance_bookings = [
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-02-10",
                        "hour": 10,
                        "minute": 0,
                        "status": "completed",
                        "is_indie": False,
                    },
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-02-14",
                        "hour": 14,
                        "minute": 0,
                        "status": "awaiting_confirmation",
                        "is_indie": False,
                    },
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-03-12",
                        "hour": 11,
                        "minute": 30,
                        "status": "completed",
                        "is_indie": False,
                    },
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-03-20",
                        "hour": 15,
                        "minute": 0,
                        "status": "created",
                        "is_indie": False,
                    },
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-04-08",
                        "hour": 10,
                        "minute": 0,
                        "status": "completed",
                        "is_indie": False,
                        "payment_amount": 1800,
                    },
                    {
                        "client_phone": cphone,
                        "service_id": svc_id,
                        "on_date": "2026-04-25",
                        "hour": 16,
                        "minute": 0,
                        "status": "awaiting_confirmation",
                        "is_indie": False,
                    },
                ]
                # Smoke-мастер: не дублируем 7c-брони — фиксированные даты попадают в те же week buckets и ломают ±20–30%
                if mi != SMOKE_DASHBOARD_MASTER_IDX:
                    try:
                        rr = client.post(
                            f"{base}/api/dev/testdata/create_completed_bookings",
                            headers=headers,
                            json={"master_id": m["master_id"], "bookings": finance_bookings},
                        )
                        rr.raise_for_status()
                        finance_bookings_ok += 1
                    except httpx.HTTPStatusError as ex:
                        detail = (ex.response.text or "")[:500]
                        print(
                            f"[reseed] 7c finance bookings master={m['master_id']} failed: "
                            f"{ex.response.status_code} {detail}"
                        )
                    except Exception as ex:
                        print(f"[reseed] 7c finance bookings master={m['master_id']} failed: {ex}")
                try:
                    rr = client.post(
                        f"{base}/api/dev/testdata/create_master_expenses",
                        headers=headers,
                        json={
                            "master_id": m["master_id"],
                            "expenses": [
                                {
                                    "name": "Аренда (reseed QA)",
                                    "expense_type": "one_time",
                                    "amount": 2500.0,
                                    "expense_date": "2026-02-05",
                                },
                                {
                                    "name": "Материалы (reseed QA)",
                                    "expense_type": "one_time",
                                    "amount": 890.0,
                                    "expense_date": "2026-03-18",
                                },
                                {
                                    "name": "Реклама (reseed QA)",
                                    "expense_type": "one_time",
                                    "amount": 1200.0,
                                    "expense_date": "2026-04-14",
                                },
                            ],
                        },
                    )
                    rr.raise_for_status()
                    finance_expenses_ok += 1
                except httpx.HTTPStatusError as ex:
                    detail = (ex.response.text or "")[:500]
                    print(
                        f"[reseed] 7c finance expenses master={m['master_id']} failed: "
                        f"{ex.response.status_code} {detail}"
                    )
                except Exception as ex:
                    print(f"[reseed] 7c finance expenses master={m['master_id']} failed: {ex}")
            if finance_bookings_ok or finance_expenses_ok:
                print(
                    f"  7c) Финансы 2026 Q1: мастеров с бронями={finance_bookings_ok}, "
                    f"с расходами={finance_expenses_ok}"
                )

            if master_results:
                m0 = master_results[SMOKE_DASHBOARD_MASTER_IDX]
                print_smoke_master_week_bucket_report(
                    client,
                    base,
                    m0["token"],
                    headline=(
                        f"Smoke master {m0['phone']}: week buckets (GET /api/master/dashboard/stats "
                        f"period=week offset=0, после 7/7a/7b/7c)"
                    ),
                    planned_items=m0.get("smoke_dashboard_plan"),
                    today=today,
                )

                # 7d) Расширение smoke/QA (loyalty, заметка клиента) — см. scripts/smoke_reseed_layer.py, docs/SMOKE_RESEED_MAP.md
                if smoke_extended:
                    try:
                        from smoke_reseed_layer import run_smoke_reseed_extensions

                        run_smoke_reseed_extensions(
                            client=client,
                            base=base,
                            master_results=master_results,
                            master_id_to_services=master_id_to_services,
                            today=today,
                            client_phone_for_master=client_phone_for_master,
                            admin_headers=headers,
                        )
                    except Exception as ex:
                        print(f"\n[WARN] Smoke extension (7d) failed: {ex}")

            # Indie sanity check (только при --legacy-indie-bookings)
            if legacy_indie_bookings:
                try:
                    r = client.get(f"{base}/api/dev/testdata/indie_sanity", headers=headers)
                    r.raise_for_status()
                    sanity = r.json()
                    print("\n--- Indie sanity ---")
                    print(f"  indie_masters: {sanity.get('indie_masters_count', 0)}")
                    for pm in sanity.get("per_master", [])[:8]:
                        print(
                            f"  M{pm['master_id']} {pm.get('phone', '')}: "
                            f"compl={pm.get('completed_total')} (indie={pm.get('completed_with_indie')} salon={pm.get('completed_with_salon')}) "
                            f"future={pm.get('future_total')} (indie={pm.get('future_with_indie')} salon={pm.get('future_with_salon')})"
                        )
                    indie_cnt = sanity.get("indie_masters_count", 0)
                    assert indie_cnt > 0, "indie_masters must be > 0"
                    any_compl_indie = any(pm.get("completed_with_indie", 0) > 0 for pm in sanity.get("per_master", []))
                    assert any_compl_indie, "At least one master must have completed bookings with indie_master_id"
                    any_future_indie = any(pm.get("future_with_indie", 0) > 0 for pm in sanity.get("per_master", []))
                    assert any_future_indie, "At least one master must have future bookings with indie_master_id"
                    print("  [OK] Indie sanity checks passed")
                except AssertionError as e:
                    print(f"  [FAIL] Indie sanity: {e}")
                    return 1
                except Exception as e:
                    print(f"  [WARN] Indie sanity request failed: {e}")
            else:
                print("\n--- Master-only mode: Indie sanity skipped ---")

        # 8) Subscription-status check (self-check: в --no-salon все мастера должны иметь подписку)
        print("\n--- Subscription status (GET /api/balance/subscription-status) ---")
        status_ok_count = 0
        for m in master_results:
            try:
                r = client.get(
                    f"{base}/api/balance/subscription-status",
                    headers=auth_headers(m["token"]),
                )
                r.raise_for_status()
                st = r.json()
                status_ok_count += 1
                print(
                    f"  {m['phone']} {m['plan_name']}: can_continue={st.get('can_continue')} "
                    f"days_remaining={st.get('days_remaining')} balance={st.get('balance')} daily_rate={st.get('daily_rate')}"
                )
            except Exception as e:
                print(f"  {m['phone']}: status check failed: {e}")
        subscription_check_ok = status_ok_count >= len(master_results)
        if no_salon and not subscription_check_ok:
            print(f"\n[FAIL] Self-check --no-salon: subscription-status OK только для {status_ok_count}/{len(master_results)} мастеров")

        # 9) Phone format sanity (канонический формат +7XXXXXXXXXX, см. docs/PHONE_FORMAT_AUDIT.md)
        from utils.phone import is_canonical_phone

        all_phones = [ADMIN_PHONE] + list(MASTER_PHONES) + list(CLIENT_PHONES_LEGACY)
        if not no_salon:
            for mi in range(len(MASTER_PHONES)):
                for ci in range(CLIENTS_PER_MASTER):
                    all_phones.append(client_phone_for_master(mi, ci))
        bad_phones = [p for p in all_phones if not is_canonical_phone(p)]
        if bad_phones:
            print(f"\n[FAIL] Phone format: неканонические номера (ожидается +7 + 10 цифр): {bad_phones[:10]}{'...' if len(bad_phones) > 10 else ''}")
            all_ok = False
        else:
            print(f"\n[OK] Phone format: все {len(all_phones)} номеров в каноническом формате +7XXXXXXXXXX")

        # 10) Output and validation
        mode_str = "subscriptions only" if no_salon else "full"
        indie_mode_str = "legacy-indie" if legacy_indie_bookings else "master-only"
        print(f"\n--- Результат reseed ({mode_str}, mode={indie_mode_str}) ---")
        all_ok = subscription_check_ok and not bad_phones
        for m in master_results:
            dr = m["daily_rate"]
            bal = m["balance_rub"]
            days_left = (bal / dr) if dr and dr > 0 else 0
            print(
                f"  {m['phone']}  plan={m['plan_name']}  daily_rate={dr:.0f}  balance={bal:.0f}  "
                f"days_left≈{days_left:.1f}  services={m['services_count']}  cats={m['categories_count']}  "
                f"schedule_days={m['schedule_days_created']}  bookings={m['bookings_created']}"
            )
            if not no_salon:
                if m["categories_count"] < 2 or m["services_count"] < 4:
                    print(f"    [FAIL] Мало категорий/услуг")
                    all_ok = False
                if m["schedule_days_created"] < 1:
                    print(f"    [FAIL] Нет расписания")
                    all_ok = False

        if not no_salon:
            active_days_in_period = sum(
                1 for i in range(BOOKING_PERIOD_DAYS + 1)
                if (today + timedelta(days=i)).isoweekday() in ACTIVE_WEEKDAYS
            )
            # Smoke-мастер (MASTER_PHONES[0]) намеренно не создаёт публичные брони в шаге 7 — см. цикл bookings.
            masters_in_public_booking_loop = max(0, len(master_results) - 1)
            min_bookings_expected = masters_in_public_booking_loop * active_days_in_period
            total_bookings = sum(m["bookings_created"] for m in master_results)
            if total_bookings < min_bookings_expected:
                print(f"\n[FAIL] Брони: ожидалось >= {min_bookings_expected}, создано {total_bookings}")
                all_ok = False
            else:
                print(
                    f"\nБрони создано: {total_bookings} (ожидалось >= {min_bookings_expected}; "
                    f"шаг 7: {masters_in_public_booking_loop} мастеров × {active_days_in_period} активных дней, "
                    f"без smoke-мастера {MASTER_PHONES[SMOKE_DASHBOARD_MASTER_IDX]})"
                )
        else:
            total_bookings = 0
            print("\n(Брони не создаются в режиме --no-salon)")

        # Финальная таблица (stdout; каноничная таблица с флагами — docs/TEST_DATA_ACCOUNTS.md после 10b)
        print("\n--- Таблица аккаунтов (краткая; полная — docs/TEST_DATA_ACCOUNTS.md) ---")
        print("| Role | Phone | Email | Full name | Plan | Balance type | Expected behavior | Password |")
        print("|------|-------|-------|-----------|------|--------------|-------------------|----------|")
        print(f"| admin | {ADMIN_PHONE} | (из БД) | (из БД) | — | — | NOT DELETED | {admin_password} |")
        for m in master_results:
            exp = "20+ дней" if m["balance_type"] == "normal" else "деактивация после daily job"
            if m["plan_name"] == "Free":
                exp = "can_continue=true"
            print(f"| master | {m['phone']} | {m['email']} | {m['full_name']} | {m['plan_name']} | {m['balance_type']} | {exp} | {MASTER_PASSWORD} |")
        for i, cphone in enumerate(CLIENT_PHONES_LEGACY):
            b = client_register_body(i, cphone)
            print(f"| client | {cphone} | {b['email']} | {b['full_name']} | — | — | логин, ЛК | {CLIENT_PASSWORD} |")
        if not no_salon:
            print("\n--- Модуль «Клиенты»: примеры client_phone для поиска ---")
            for mi in range(min(3, len(MASTER_PHONES))):
                ex1 = client_phone_for_master(mi, 0)
                ex2 = client_phone_for_master(mi, 1)
                if mi == SMOKE_DASHBOARD_MASTER_IDX:
                    ex1 = client_phone_for_master(mi, SMOKE_MASTER0_VIP_CLIENT_IDX)
                    nvip = SMOKE_MASTER0_VIP_COMPLETED_TARGET
                else:
                    nvip = 8
                print(f"  Мастер {mi} ({MASTER_PHONES[mi]}): VIP {ex1} ({nvip} визитов), {ex2}")
        print(f"\nПароль мастеров и клиентов: {MASTER_PASSWORD} / {CLIENT_PASSWORD}")

        # 10b) Единый артефакт с аккаунтами и флагами подписки (автообновление)
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if master_results:
            try:
                artifact_path = write_test_data_accounts_artifact(
                    repo_root,
                    mode_str=mode_str,
                    no_salon=no_salon,
                    indie_mode_str=indie_mode_str,
                    admin_phone=ADMIN_PHONE,
                    admin_password=admin_password,
                    master_password=MASTER_PASSWORD,
                    client_password=CLIENT_PASSWORD,
                    master_results=master_results,
                    client_phones_legacy=list(CLIENT_PHONES_LEGACY),
                    master_phones=list(MASTER_PHONES),
                    clients_per_master=CLIENTS_PER_MASTER,
                )
                print(f"\n[OK] Обновлён артефакт аккаунтов: {artifact_path}")
            except OSError as e:
                print(f"\n[WARN] Не удалось записать TEST_DATA_ACCOUNTS.md: {e}")

        # 11) Post-reseed MASTER_CANON checks (SQLite)
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bookme.db")
        if os.path.exists(db_path):
            completed_count = 0
            try:
                import sqlite3
                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                # Solo: can_work_independently=1 для тестовых мастеров
                placeholders = ",".join("?" * len(MASTER_PHONES))
                cur.execute(
                    f"UPDATE masters SET can_work_independently = 1 WHERE user_id IN (SELECT id FROM users WHERE phone IN ({placeholders}))",
                    MASTER_PHONES,
                )
                conn.commit()
                print("\n--- Post-reseed MASTER_CANON checks ---")
                both_null = cur.execute(
                    "SELECT COUNT(*) FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL"
                ).fetchone()[0]
                master_null = cur.execute("SELECT COUNT(*) FROM bookings WHERE master_id IS NULL").fetchone()[0]
                indie_fav = cur.execute(
                    "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'"
                ).fetchone()[0]
                im_null = cur.execute(
                    "SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL"
                ).fetchone()[0]
                im_dups = cur.execute(
                    """SELECT COUNT(*) FROM (
                        SELECT master_id, COUNT(*) as c FROM indie_masters
                        WHERE master_id IS NOT NULL GROUP BY master_id HAVING c > 1
                    )"""
                ).fetchone()[0]
                completed_count = cur.execute(
                    "SELECT COUNT(*) FROM bookings WHERE status = 'completed'"
                ).fetchone()[0]
                masters_tz_null = cur.execute(
                    "SELECT COUNT(*) FROM masters WHERE timezone IS NULL OR trim(coalesce(timezone,'')) = ''"
                ).fetchone()[0]
                conn.close()
                ok_canon = True
                if both_null > 0:
                    print(f"  [FAIL] bookings both_null: {both_null} (expect 0)")
                    ok_canon = False
                else:
                    print(f"  [OK] bookings both_null: 0")
                if not legacy_indie_bookings:
                    if master_null > 0:
                        print(f"  [FAIL] master-only: master_id NULL: {master_null} (expect 0)")
                        ok_canon = False
                    else:
                        print(f"  [OK] master-only: master_id NULL: 0")
                if indie_fav > 0:
                    print(f"  [FAIL] client_favorites favorite_type=indie_master: {indie_fav} (expect 0)")
                    ok_canon = False
                else:
                    print(f"  [OK] client_favorites favorite_type=indie_master: 0")
                if im_null > 0:
                    print(f"  [FAIL] indie_masters master_id NULL: {im_null} (expect 0)")
                    ok_canon = False
                else:
                    print(f"  [OK] indie_masters master_id NULL: 0")
                if im_dups > 0:
                    print(f"  [FAIL] indie_masters UNIQUE(master_id) violations: {im_dups} (expect 0)")
                    ok_canon = False
                else:
                    print(f"  [OK] indie_masters UNIQUE(master_id) violations: 0")
                if not no_salon and completed_count == 0:
                    print(f"  [FAIL] bookings status=completed: 0 (expect >0, create_completed_bookings failed)")
                    ok_canon = False
                else:
                    print(f"  [OK] bookings status=completed: {completed_count}")
                if masters_tz_null > 0:
                    print(f"  [FAIL] masters timezone NULL/empty: {masters_tz_null} (expect 0)")
                    print(f"  [HINT] fill masters.timezone IANA (e.g. Europe/Moscow); ensure register passes timezone; re-reseed")
                    ok_canon = False
                else:
                    print(f"  [OK] masters timezone: all set")
                if not ok_canon:
                    all_ok = False
                # Явный summary
                print(f"\n--- Reseed summary ---")
                print(f"  mode: {indie_mode_str}")
                print(f"  completed bookings: {completed_count}")
                print(f"  sanity: both_null=0 master_null=0 indie_fav=0 im_null=0 im_dups=0")
            except Exception as ex:
                print(f"  [WARN] Post-reseed checks failed: {ex}")

        if not all_ok:
            print("\n[WARN] Часть проверок не пройдена, см. выше")
        return 0 if all_ok else 2


if __name__ == "__main__":
    sys.exit(main())

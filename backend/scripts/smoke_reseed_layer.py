"""
Слой расширения smoke/QA поверх reseed_local_test_data.py.

Не вызывается напрямую — только из reseed_local_test_data при --smoke-extended (full reseed).

Принципы:
- только HTTP API (как основной reseed);
- идемпотентность: повторный прогон пропускает уже созданные сущности с маркером QA;
- не трогает admin и не меняет канонику MASTER_PHONES / legacy-клиентов.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Callable, Optional

import httpx

# Маркер в description — для поиска и пропуска при повторном reseed
QA_MARK = "[QA SMOKE]"

# Индексы в MASTER_PHONES / master_results (согласовано с PLAN_ASSIGNMENTS в reseed)
# Loyalty API (/api/master/loyalty/settings) требует has_loyalty_access → Premium, не Pro в текущей матрице планов БД
IDX_LOYALTY_HUB = 8  # Premium normal — quick/personal/баллы ON
IDX_LOYALTY_POINTS_OFF = 9  # Premium low — баллы OFF (сравнение)
IDX_CLIENT_NOTE = 4  # Standard normal — заметка у клиента (модуль Клиенты)

# Trace-слой: отдельные телефоны (не пересекаются с +7999{mi}{cccccc} и MASTER_PHONES)
TRACE_DASHBOARD_IDX = 5  # M5 Standard low — только дашборд/список записей (без extStats/finance gate)
TRACE_STATS_FINANCE_IDX = 8  # M8 Premium — stats/finance trace + public slug (один мастер)
TRACE_AUTO_IDX = 2  # Basic normal — auto_confirm_bookings=True
TRACE_MANUAL_IDX = 3  # Basic low — auto_confirm_bookings=False
PUBLIC_SLUG_MASTER_IDX = 8  # то же, что TRACE_STATS_FINANCE_IDX

SMOKE_TRACE_PHONES_M5 = [f"+799912300{i:02d}" for i in range(1, 5)]  # dashboard-only
SMOKE_TRACE_PHONES_M8 = [f"+799912310{i:02d}" for i in range(1, 5)]  # stats/finance trace
# Эталон pre-visit зелёной кнопки: M8 Premium + manual + effective + future created (см. SMOKE_RESEED_MAP.md)
SMOKE_PREVISIT_CANON_PHONE = "+79991231100"
SMOKE_TRACE_PHONE_AUTO = "+79991230101"
SMOKE_TRACE_PHONE_MANUAL = "+79991230102"
PUBLIC_SMOKE_DOMAIN = "qa-smoke-public"

# Изолированные клиенты loyalty smoke на M8: один телефон = один сценарий (без конкурирующих правил).
# Не пересекаются с +7999{mi}{cccccc} и trace +79991231… — не попадают в 7b.
LOYALTY_SMOKE_PASSWORD = "test123"
LOYALTY_SMOKE_PHONE_BIRTHDAY = "+79991500101"
LOYALTY_SMOKE_PHONE_FIRST_VISIT = "+79991500102"
LOYALTY_SMOKE_PHONE_RETURNING = "+79991500103"
LOYALTY_SMOKE_PHONE_REGULAR = "+79991500104"
LOYALTY_SMOKE_PHONE_HH_INACTIVE = "+79991500105"
LOYALTY_SMOKE_PHONE_HH_ACTIVE = "+79991500109"
LOYALTY_SMOKE_PHONE_SERVICE_DISCOUNT = "+79991500106"
LOYALTY_SMOKE_PHONE_PERSONAL = "+79991500107"
LOYALTY_SMOKE_PHONE_CONFLICT = "+79991500108"
LOYALTY_SMOKE_PHONES_ALL: tuple[str, ...] = (
    LOYALTY_SMOKE_PHONE_BIRTHDAY,
    LOYALTY_SMOKE_PHONE_FIRST_VISIT,
    LOYALTY_SMOKE_PHONE_RETURNING,
    LOYALTY_SMOKE_PHONE_REGULAR,
        LOYALTY_SMOKE_PHONE_HH_INACTIVE,
        LOYALTY_SMOKE_PHONE_HH_ACTIVE,
        LOYALTY_SMOKE_PHONE_SERVICE_DISCOUNT,
    LOYALTY_SMOKE_PHONE_PERSONAL,
    LOYALTY_SMOKE_PHONE_CONFLICT,
)


def _loyalty_smoke_birth_same_calendar_day(today: date) -> str:
    """ДР в текущем месяце/дне (год в прошлом) — окно birthday ±7 всегда включает «сегодня»."""
    y = today.year - 28
    d = min(max(today.day, 1), 28)
    return date(y, today.month, d).isoformat()


def _loyalty_smoke_birth_outside_window(today: date) -> str:
    """ДР ~на 6 календарных месяцев вперёд от текущего месяца — вне ±7 относительно сегодня."""
    m = (today.month + 5 - 1) % 12 + 1
    d = min(max(today.day, 1), 28)
    return date(1990, m, d).isoformat()


def _login_client_token(client: httpx.Client, base: str, phone: str, password: str) -> str:
    r = client.post(f"{base}/api/auth/login", json={"phone": phone, "password": password})
    r.raise_for_status()
    tok = r.json().get("access_token")
    if not tok:
        raise RuntimeError("login: no access_token")
    return tok


HH_INACTIVE_CLONE_MARKER = f"{QA_MARK} HH_INACTIVE_CLONE"


def _ensure_hh_inactive_clone_quick_discount(client: httpx.Client, base: str, hub_token: str) -> None:
    """Дубль happy_hours (вт 09–12) с is_active=false — негатив «выключенное правило»; основное HH остаётся активным."""
    try:
        r = client.get(f"{base}/api/loyalty/quick-discounts", headers=_auth_headers(hub_token))
        r.raise_for_status()
        lst = r.json() if isinstance(r.json(), list) else []
    except Exception as e:
        print(f"  [WARN] HH inactive clone: list {e}")
        return
    for d in lst:
        if HH_INACTIVE_CLONE_MARKER in (d.get("description") or ""):
            print("  (skip) quick happy_hours inactive-clone: уже есть")
            return
    body: dict[str, Any] = {
        "discount_type": "quick",
        "name": f"QA happy hours OFF mirror {QA_MARK}",
        "description": f"{HH_INACTIVE_CLONE_MARKER} duplicate Tue 09-12, is_active=false",
        "discount_percent": 13.0,
        "conditions": {
            "condition_type": "happy_hours",
            "parameters": {"days": [2], "intervals": [{"start": "09:00", "end": "12:00"}]},
        },
        "is_active": False,
        "priority": 2,
    }
    try:
        r = client.post(
            f"{base}/api/loyalty/quick-discounts",
            headers=_auth_headers(hub_token),
            json=body,
        )
        r.raise_for_status()
        print(f"  ✓ quick happy_hours inactive-clone id={r.json().get('id')}")
    except Exception as e:
        print(f"  [WARN] quick happy_hours inactive-clone: {e}")


def _register_or_sync_loyalty_smoke_client(
    client: httpx.Client,
    base: str,
    phone: str,
    email: str,
    full_name: str,
    birth_iso: str,
) -> None:
    body = {
        "phone": phone,
        "password": LOYALTY_SMOKE_PASSWORD,
        "role": "client",
        "email": email,
        "full_name": full_name,
        "birth_date": birth_iso,
    }
    r = client.post(f"{base}/api/auth/register", json=body)
    if r.status_code == 200:
        return
    low = (r.text or "").lower()
    if r.status_code == 400 and ("already" in low or "registered" in low or "занят" in low):
        tok = _login_client_token(client, base, phone, LOYALTY_SMOKE_PASSWORD)
        pr = client.put(
            f"{base}/api/client/profile",
            headers=_auth_headers(tok),
            json={"birth_date": birth_iso},
        )
        pr.raise_for_status()
        return
    r.raise_for_status()


def _cleanup_qa_personal_discounts(
    client: httpx.Client,
    base: str,
    hub_token: str,
    phones_to_strip: tuple[str, ...],
) -> None:
    """Удалить персоналки с [QA SMOKE] на указанных телефонах (идемпотентность / смена телефона personal)."""
    try:
        r = client.get(f"{base}/api/loyalty/personal-discounts", headers=_auth_headers(hub_token))
        r.raise_for_status()
        lst = r.json() if isinstance(r.json(), list) else []
    except Exception:
        return
    targets = {p.replace(" ", "") for p in phones_to_strip}
    for p in lst:
        phone = (p.get("client_phone") or "").replace(" ", "")
        if phone not in targets:
            continue
        if QA_MARK not in (p.get("description") or "") and QA_MARK not in (p.get("name") or ""):
            continue
        pid = p.get("id")
        if not pid:
            continue
        try:
            dr = client.delete(
                f"{base}/api/loyalty/personal-discounts/{pid}",
                headers=_auth_headers(hub_token),
            )
            if dr.status_code in (200, 204):
                print(f"  ✓ removed stale personal-discount id={pid} phone={phone}")
        except Exception:
            pass


def _apply_loyalty_smoke_isolated_clients(
    client: httpx.Client,
    base: str,
    admin_headers: dict[str, str],
    hub_mid: int,
    first_service_id: int,
    today: date,
) -> None:
    """
    Отдельные QA-клиенты под каждый loyalty-сценарий на M8 (qa-smoke-public).
    Идемпотентно: delete_smoke_trace_bookings → sync birth_date → create_completed_bookings.
    """
    print("\n  --- 7d-loyalty) Изолированные клиенты под smoke loyalty (M8) ---")
    if not first_service_id:
        print("  [WARN] loyalty smoke: нет first_service_id — пропуск")
        return
    try:
        r = client.post(
            f"{base}/api/dev/testdata/delete_smoke_trace_bookings",
            headers=admin_headers,
            json={"master_id": hub_mid, "client_phones": list(LOYALTY_SMOKE_PHONES_ALL)},
        )
        r.raise_for_status()
        print(f"  ✓ delete_smoke_trace_bookings M8 loyalty phones ({len(LOYALTY_SMOKE_PHONES_ALL)} шт.)")
    except Exception as e:
        print(f"  [WARN] delete loyalty smoke bookings: {e}")

    b_in = _loyalty_smoke_birth_same_calendar_day(today)
    b_out = _loyalty_smoke_birth_outside_window(today)

    clients_spec: list[tuple[str, str, str, str]] = [
        (LOYALTY_SMOKE_PHONE_BIRTHDAY, "loyalty.sm.birthday@example.com", f"{QA_MARK} LOYALTY birthday-only", b_in),
        (LOYALTY_SMOKE_PHONE_FIRST_VISIT, "loyalty.sm.first@example.com", f"{QA_MARK} LOYALTY first-visit", b_out),
        (LOYALTY_SMOKE_PHONE_RETURNING, "loyalty.sm.returning@example.com", f"{QA_MARK} LOYALTY returning", b_out),
        (LOYALTY_SMOKE_PHONE_REGULAR, "loyalty.sm.regular@example.com", f"{QA_MARK} LOYALTY regular-visits", b_out),
        (LOYALTY_SMOKE_PHONE_HH_INACTIVE, "loyalty.sm.hh@example.com", f"{QA_MARK} LOYALTY hh-outside-window", b_out),
        (LOYALTY_SMOKE_PHONE_HH_ACTIVE, "loyalty.sm.hhactive@example.com", f"{QA_MARK} LOYALTY hh-active-slot", b_out),
        (LOYALTY_SMOKE_PHONE_SERVICE_DISCOUNT, "loyalty.sm.sd@example.com", f"{QA_MARK} LOYALTY service-discount", b_out),
        (LOYALTY_SMOKE_PHONE_PERSONAL, "loyalty.sm.personal@example.com", f"{QA_MARK} LOYALTY personal", b_out),
        (LOYALTY_SMOKE_PHONE_CONFLICT, "loyalty.sm.conflict@example.com", f"{QA_MARK} LOYALTY conflict-maxpct", b_in),
    ]
    for phone, em, fn, bd in clients_spec:
        try:
            _register_or_sync_loyalty_smoke_client(client, base, phone, em, fn, bd)
        except Exception as e:
            print(f"  [WARN] register/sync {phone}: {e}")

    sid = first_service_id
    bookings: list[dict[str, Any]] = [
        # returning: ровно 1 completed >30 дней назад
        {
            "client_phone": LOYALTY_SMOKE_PHONE_RETURNING,
            "service_id": sid,
            "days_ago": 35,
            "hour": 11,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY returning 35d",
        },
        # regular: 2 completed в последние 60 дней
        {
            "client_phone": LOYALTY_SMOKE_PHONE_REGULAR,
            "service_id": sid,
            "days_ago": 25,
            "hour": 10,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY regular A",
        },
        {
            "client_phone": LOYALTY_SMOKE_PHONE_REGULAR,
            "service_id": sid,
            "days_ago": 15,
            "hour": 14,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY regular B",
        },
        # HH inactive: 1 completed ~17d — нет first_visit; HH rule off → в HH-слоте 0% на услуге без SD
        {
            "client_phone": LOYALTY_SMOKE_PHONE_HH_INACTIVE,
            "service_id": sid,
            "days_ago": 17,
            "hour": 10,
            "minute": 30,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY hh-inactive clean 17d",
        },
        # service_discount: 1 completed 12–20д — нет first_visit, нет returning (17<30), нет regular (1<2)
        {
            "client_phone": LOYALTY_SMOKE_PHONE_SERVICE_DISCOUNT,
            "service_id": sid,
            "days_ago": 17,
            "hour": 12,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY sd 17d",
        },
        # personal: то же — first_visit off; personal 12% по телефону
        {
            "client_phone": LOYALTY_SMOKE_PHONE_PERSONAL,
            "service_id": sid,
            "days_ago": 17,
            "hour": 13,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY personal 17d",
        },
        # conflict: ДР в окне + 2 completed за 60д → regular 14% > birthday 12%
        {
            "client_phone": LOYALTY_SMOKE_PHONE_CONFLICT,
            "service_id": sid,
            "days_ago": 20,
            "hour": 15,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY conflict A",
        },
        {
            "client_phone": LOYALTY_SMOKE_PHONE_CONFLICT,
            "service_id": sid,
            "days_ago": 11,
            "hour": 16,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} LOYALTY conflict B",
        },
    ]
    try:
        r = client.post(
            f"{base}/api/dev/testdata/create_completed_bookings",
            headers=admin_headers,
            json={"master_id": hub_mid, "bookings": bookings},
        )
        r.raise_for_status()
        print(f"  ✓ loyalty smoke bookings created={r.json().get('created')}")
    except Exception as e:
        print(f"  [WARN] loyalty smoke create_completed_bookings: {e}")

    print(
        "  ℹ Телефоны loyalty smoke (пароль test123): "
        f"birthday={LOYALTY_SMOKE_PHONE_BIRTHDAY}, first_visit={LOYALTY_SMOKE_PHONE_FIRST_VISIT}, "
        f"returning={LOYALTY_SMOKE_PHONE_RETURNING}, regular={LOYALTY_SMOKE_PHONE_REGULAR}, "
        f"hh_outside_window={LOYALTY_SMOKE_PHONE_HH_INACTIVE}, hh_active_slot={LOYALTY_SMOKE_PHONE_HH_ACTIVE}, "
        f"service_discount={LOYALTY_SMOKE_PHONE_SERVICE_DISCOUNT}, "
        f"personal={LOYALTY_SMOKE_PHONE_PERSONAL}, conflict={LOYALTY_SMOKE_PHONE_CONFLICT}"
    )


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _form_encode_profile(fields: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in fields.items():
        if v is None:
            continue
        if isinstance(v, bool):
            out[k] = "true" if v else "false"
        else:
            out[k] = str(v)
    return out


def _put_master_profile_form(
    client: httpx.Client, base: str, token: str, fields: dict[str, Any]
) -> None:
    r = client.put(
        f"{base}/api/master/profile",
        headers={"Authorization": f"Bearer {token}"},
        data=_form_encode_profile(fields),
    )
    r.raise_for_status()


def _client_phone_for_master(master_idx: int, client_idx: int) -> str:
    """Должен совпадать с client_phone_for_master в reseed_local_test_data."""
    return f"+7999{master_idx}{client_idx:06d}"


def _get_quick_condition_type(conditions: Any) -> str | None:
    if not isinstance(conditions, dict):
        return None
    return conditions.get("condition_type")


def _existing_qa_quick_types(discounts: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for d in discounts:
        desc = (d.get("description") or "") + " " + (d.get("name") or "")
        if QA_MARK not in desc:
            continue
        ct = _get_quick_condition_type(d.get("conditions"))
        if ct:
            out.add(ct)
    return out


def _apply_qa_smoke_trace_layer(
    client: httpx.Client,
    base: str,
    admin_headers: dict[str, str],
    master_results: list[dict[str, Any]],
    master_id_to_services: dict[int, list[dict]],
    today: date,
) -> None:
    """
    Реальные trace-брони и расходы (dev_testdata), профили auto/manual/public.
    M5 — только дашборд/записи; M8 (Premium) — stats/finance + тот же public slug.
    Не трогает шаги 7–7c; идемпотентность по броням — через delete_smoke_trace_bookings.
    """
    need = max(
        TRACE_DASHBOARD_IDX,
        TRACE_STATS_FINANCE_IDX,
        TRACE_AUTO_IDX,
        TRACE_MANUAL_IDX,
        PUBLIC_SLUG_MASTER_IDX,
    )
    if len(master_results) <= need:
        print(f"[WARN] qa trace: нужно мастеров 0..{need} — пропуск.")
        return

    m5 = master_results[TRACE_DASHBOARD_IDX]
    m5_id = m5["master_id"]
    sv5 = master_id_to_services.get(m5_id) or []
    if not sv5:
        print("[WARN] qa trace: нет услуг у M5 (--no-salon?) — пропуск trace-броней M5.")
        return
    sid5 = sv5[0]["service_id"]

    m8 = master_results[TRACE_STATS_FINANCE_IDX]
    m8_id = m8["master_id"]
    sv8 = master_id_to_services.get(m8_id) or []
    if not sv8:
        print("[WARN] qa trace: нет услуг у M8 — пропуск stats/finance trace.")
        return
    sid8 = sv8[0]["service_id"]

    print("\n  --- 7d-trace) QA dataset: dashboard (M5) + stats/finance/public (M8) + auto-manual ---")

    m_auto = master_results[TRACE_AUTO_IDX]
    m_man = master_results[TRACE_MANUAL_IDX]
    m_pub = master_results[PUBLIC_SLUG_MASTER_IDX]

    try:
        _put_master_profile_form(
            client, base, m_auto["token"], {"auto_confirm_bookings": True}
        )
        print(f"  ✓ M{TRACE_AUTO_IDX} {m_auto['phone']}: auto_confirm_bookings=True (QA SMOKE AUTO)")
    except Exception as e:
        print(f"  [WARN] profile M{TRACE_AUTO_IDX}: {e}")
    try:
        _put_master_profile_form(
            client, base, m_man["token"], {"auto_confirm_bookings": False}
        )
        print(f"  ✓ M{TRACE_MANUAL_IDX} {m_man['phone']}: auto_confirm_bookings=False (QA SMOKE MANUAL)")
    except Exception as e:
        print(f"  [WARN] profile M{TRACE_MANUAL_IDX}: {e}")
    try:
        _put_master_profile_form(
            client,
            base,
            m_pub["token"],
            {
                "can_work_independently": True,
                "domain": PUBLIC_SMOKE_DOMAIN,
                # Канон pre-visit кнопки: ручной режим + Premium → pre_visit_confirmations_effective (см. docs)
                "auto_confirm_bookings": False,
            },
        )
        print(
            f"  ✓ M{PUBLIC_SLUG_MASTER_IDX} {m_pub['phone']}: domain={PUBLIC_SMOKE_DOMAIN}, "
            f"auto_confirm_bookings=False (PREVISIT CANON anchor)"
        )
    except Exception as e:
        print(f"  [WARN] public domain M{PUBLIC_SLUG_MASTER_IDX}: {e}")

    def _delete(mid: int, phones: list[str]) -> None:
        r = client.post(
            f"{base}/api/dev/testdata/delete_smoke_trace_bookings",
            headers=admin_headers,
            json={"master_id": mid, "client_phones": phones},
        )
        r.raise_for_status()

    try:
        _delete(m5_id, list(SMOKE_TRACE_PHONES_M5))
        _delete(m8_id, list(SMOKE_TRACE_PHONES_M8) + [SMOKE_PREVISIT_CANON_PHONE])
        _delete(m_auto["master_id"], [SMOKE_TRACE_PHONE_AUTO])
        _delete(m_man["master_id"], [SMOKE_TRACE_PHONE_MANUAL])
        print("  ✓ delete_smoke_trace_bookings (M5/M8/M2/M3 trace phones)")
    except Exception as e:
        print(f"  [WARN] delete trace bookings: {e}")

    bookings_m5: list[dict[str, Any]] = [
        {
            "client_phone": SMOKE_TRACE_PHONES_M5[0],
            "service_id": sid5,
            "days_ahead": 6,
            "hour": 10,
            "minute": 0,
            "status": "created",
            "notes": f"{QA_MARK} QA SMOKE DASH — future created",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M5[1],
            "service_id": sid5,
            "days_ahead": 9,
            "hour": 11,
            "minute": 30,
            "status": "confirmed",
            "notes": f"{QA_MARK} QA SMOKE DASH — pre-visit confirmed",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M5[2],
            "service_id": sid5,
            "days_ago": 4,
            "hour": 10,
            "minute": 0,
            "status": "awaiting_confirmation",
            "notes": f"{QA_MARK} QA SMOKE DASH — past awaiting_confirmation",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M5[3],
            "service_id": sid5,
            "days_ago": 10,
            "hour": 14,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} QA SMOKE DASH — past completed",
        },
    ]

    bookings_m8: list[dict[str, Any]] = [
        {
            "client_phone": SMOKE_PREVISIT_CANON_PHONE,
            "service_id": sid8,
            "days_ahead": 5,
            "hour": 9,
            "minute": 0,
            "status": "created",
            "notes": f"{QA_MARK} QA SMOKE PREVISIT CANON — green button MUST show (web+native)",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M8[0],
            "service_id": sid8,
            "days_ago": 12,
            "hour": 14,
            "minute": 0,
            "status": "completed",
            "notes": f"{QA_MARK} QA SMOKE STATS FACT — completed; QA SMOKE FIN CONF",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M8[1],
            "service_id": sid8,
            "days_ago": 20,
            "hour": 15,
            "minute": 30,
            "status": "completed",
            "notes": f"{QA_MARK} QA SMOKE STATS — second date point",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M8[2],
            "service_id": sid8,
            "days_ahead": 14,
            "hour": 16,
            "minute": 0,
            "status": "created",
            "payment_amount": 2500.0,
            "notes": f"{QA_MARK} QA SMOKE FIN EXPECTED — created future",
        },
        {
            "client_phone": SMOKE_TRACE_PHONES_M8[3],
            "service_id": sid8,
            "days_ago": 6,
            "hour": 12,
            "minute": 0,
            "status": "awaiting_confirmation",
            "notes": f"{QA_MARK} QA SMOKE FIN AWAITING — expected without close",
        },
    ]

    try:
        r = client.post(
            f"{base}/api/dev/testdata/create_completed_bookings",
            headers=admin_headers,
            json={"master_id": m5_id, "bookings": bookings_m5},
        )
        r.raise_for_status()
        print(f"  ✓ M{TRACE_DASHBOARD_IDX}: dashboard trace bookings created={r.json().get('created')}")
    except Exception as e:
        print(f"  [WARN] M{TRACE_DASHBOARD_IDX} bookings: {e}")

    try:
        r = client.post(
            f"{base}/api/dev/testdata/create_completed_bookings",
            headers=admin_headers,
            json={"master_id": m8_id, "bookings": bookings_m8},
        )
        r.raise_for_status()
        print(f"  ✓ M{TRACE_STATS_FINANCE_IDX}: stats/finance trace bookings created={r.json().get('created')}")
        print(
            f"  ℹ PREVISIT CANON: {SMOKE_PREVISIT_CANON_PHONE} on M{TRACE_STATS_FINANCE_IDX} — "
            "green button MUST show (GET settings: pre_visit_confirmations_effective=true, manual)"
        )
    except Exception as e:
        print(f"  [WARN] M{TRACE_STATS_FINANCE_IDX} bookings: {e}")

    for mi, phone, hh in (
        (TRACE_AUTO_IDX, SMOKE_TRACE_PHONE_AUTO, 10),
        (TRACE_MANUAL_IDX, SMOKE_TRACE_PHONE_MANUAL, 14),
    ):
        mm = master_results[mi]
        svs = master_id_to_services.get(mm["master_id"]) or []
        if not svs:
            print(f"  [WARN] M{mi}: нет услуг — пропуск auto/manual booking")
            continue
        sid_m = svs[0]["service_id"]
        try:
            r = client.post(
                f"{base}/api/dev/testdata/create_completed_bookings",
                headers=admin_headers,
                json={
                    "master_id": mm["master_id"],
                    "bookings": [
                        {
                            "client_phone": phone,
                            "service_id": sid_m,
                            "days_ahead": 4,
                            "hour": hh,
                            "minute": 0,
                            "status": "created",
                            "notes": f"{QA_MARK} QA SMOKE {'AUTO' if mi == TRACE_AUTO_IDX else 'MANUAL'} — future created",
                        }
                    ],
                },
            )
            r.raise_for_status()
            print(f"  ✓ M{mi}: auto/manual future booking {phone}")
        except Exception as e:
            print(f"  [WARN] M{mi} booking: {e}")

    d_exp1 = (today - timedelta(days=5)).isoformat()
    d_exp2 = (today - timedelta(days=22)).isoformat()
    try:
        r = client.post(
            f"{base}/api/dev/testdata/create_master_expenses",
            headers=admin_headers,
            json={
                "master_id": m8_id,
                "expenses": [
                    {
                        "name": f"{QA_MARK} QA SMOKE EXPENSE rent",
                        "amount": 2500.0,
                        "expense_date": d_exp1,
                        "expense_type": "one_time",
                    },
                    {
                        "name": f"{QA_MARK} QA SMOKE EXPENSE ads",
                        "amount": 900.0,
                        "expense_date": d_exp2,
                        "expense_type": "one_time",
                    },
                ],
            },
        )
        r.raise_for_status()
        print(f"  ✓ M{TRACE_STATS_FINANCE_IDX}: QA expenses {d_exp1}, {d_exp2}")
    except Exception as e:
        print(f"  [WARN] QA expenses M{TRACE_STATS_FINANCE_IDX}: {e}")

    try:
        r = client.patch(
            f"{base}/api/master/clients/{SMOKE_TRACE_PHONES_M8[0]}",
            headers=_auth_headers(m8["token"]),
            json={
                "master_client_name": f"{QA_MARK} QA SMOKE CLIENT — поиск/выручка",
                "note": f"{QA_MARK} карточка для completed-трейса (финансы/клиенты) на M8",
            },
        )
        r.raise_for_status()
        print(f"  ✓ M{TRACE_STATS_FINANCE_IDX}: client metadata {SMOKE_TRACE_PHONES_M8[0]}")
    except Exception as e:
        print(f"  [WARN] PATCH client trace: {e}")

    try:
        pr = client.get(f"{base}/api/public/masters/{PUBLIC_SMOKE_DOMAIN}")
        print(f"  ✓ GET /api/public/masters/{PUBLIC_SMOKE_DOMAIN} → HTTP {pr.status_code}")
    except Exception as e:
        print(f"  [WARN] public GET: {e}")


def run_smoke_reseed_extensions(
    *,
    client: httpx.Client,
    base: str,
    master_results: list[dict[str, Any]],
    master_id_to_services: dict[int, list[dict]],
    today: date,
    client_phone_for_master: Callable[[int, int], str] = _client_phone_for_master,
    admin_headers: Optional[dict[str, str]] = None,
) -> None:
    """
    Вызывается после шагов 7/7a/7b/7c основного reseed (full, не --no-salon).
    """
    if len(master_results) <= max(IDX_LOYALTY_HUB, IDX_LOYALTY_POINTS_OFF, IDX_CLIENT_NOTE):
        print("\n[WARN] smoke_reseed_layer: недостаточно мастеров в master_results — пропуск.")
        return

    hub = master_results[IDX_LOYALTY_HUB]
    off = master_results[IDX_LOYALTY_POINTS_OFF]
    note_m = master_results[IDX_CLIENT_NOTE]

    hub_token = hub["token"]
    off_token = off["token"]
    note_token = note_m["token"]

    hub_mid = hub["master_id"]
    services = master_id_to_services.get(hub_mid) or []
    first_service_id = services[0]["service_id"] if services else None

    print("\n--- 7d) Smoke QA extension (trace + loyalty / clients note) ---")

    if admin_headers:
        try:
            _apply_qa_smoke_trace_layer(
                client,
                base,
                admin_headers,
                master_results,
                master_id_to_services,
                today,
            )
        except Exception as e:
            print(f"  [WARN] QA trace layer: {e}")
    else:
        print(
            "  [WARN] admin_headers не передан — пропуск QA trace (delete/create bookings, expenses). "
            "Проверьте вызов из reseed_local_test_data."
        )

    # --- Loyalty points: ON (hub), OFF (off master) ---
    for label, token, enabled, perc, maxp, life in (
        (
            f"M{IDX_LOYALTY_HUB} {hub['phone']}",
            hub_token,
            True,
            7,
            40,
            90,
        ),
        (
            f"M{IDX_LOYALTY_POINTS_OFF} {off['phone']}",
            off_token,
            False,
            None,
            None,
            None,
        ),
    ):
        body: dict[str, Any] = {"is_enabled": enabled}
        if enabled:
            body["accrual_percent"] = perc
            body["max_payment_percent"] = maxp
            body["points_lifetime_days"] = life
        try:
            r = client.put(
                f"{base}/api/master/loyalty/settings",
                headers=_auth_headers(token),
                json=body,
            )
            r.raise_for_status()
            print(f"  ✓ Loyalty settings: {label} enabled={enabled}")
        except httpx.HTTPStatusError as e:
            print(
                f"  [WARN] Loyalty settings {label}: {e.response.status_code} "
                f"{(e.response.text or '')[:200]}"
            )
        except Exception as e:
            print(f"  [WARN] Loyalty settings {label}: {e}")

    # --- Quick discounts (hub master = Premium: loyalty gate) ---
    try:
        r = client.get(
            f"{base}/api/loyalty/quick-discounts",
            headers=_auth_headers(hub_token),
        )
        r.raise_for_status()
        existing_list = r.json()
    except Exception as e:
        print(f"  [WARN] GET quick-discounts: {e}")
        existing_list = []

    have_ct = _existing_qa_quick_types(existing_list if isinstance(existing_list, list) else [])

    templates: list[dict[str, Any]] = [
        {
            "tid": "first_visit",
            "body": {
                "discount_type": "quick",
                "name": f"QA первый визит {QA_MARK}",
                "description": f"{QA_MARK} first_visit — Лояльность → Правила",
                "discount_percent": 10.0,
                "conditions": {"condition_type": "first_visit", "parameters": {}},
                "is_active": True,
                "priority": 1,
            },
        },
        {
            "tid": "birthday",
            "body": {
                "discount_type": "quick",
                "name": f"QA день рождения {QA_MARK}",
                "description": f"{QA_MARK} birthday (binary)",
                "discount_percent": 12.0,
                "conditions": {
                    "condition_type": "birthday",
                    "parameters": {"days_before": 7, "days_after": 7},
                },
                "is_active": True,
                "priority": 1,
            },
        },
        {
            "tid": "regular_visits",
            "body": {
                "discount_type": "quick",
                "name": f"QA регулярные {QA_MARK}",
                "description": f"{QA_MARK} regular_visits",
                "discount_percent": 14.0,
                "conditions": {
                    "condition_type": "regular_visits",
                    "parameters": {"visits_count": 2, "period_days": 60},
                },
                "is_active": True,
                "priority": 1,
            },
        },
        {
            "tid": "returning_client",
            "body": {
                "discount_type": "quick",
                "name": f"QA возврат {QA_MARK}",
                "description": f"{QA_MARK} returning_client",
                "discount_percent": 11.0,
                "conditions": {
                    "condition_type": "returning_client",
                    "parameters": {
                        "min_days_since_last_visit": 30,
                        "max_days_since_last_visit": None,
                    },
                },
                "is_active": True,
                "priority": 1,
            },
        },
        {
            "tid": "happy_hours",
            "body": {
                "discount_type": "quick",
                "name": f"QA happy hours {QA_MARK}",
                "description": f"{QA_MARK} happy_hours (active Tue 09-12; см. inactive-clone отдельным правилом)",
                "discount_percent": 13.0,
                "conditions": {
                    "condition_type": "happy_hours",
                    "parameters": {
                        # API: strict_happy_hours_single_slot — ровно один день недели и один интервал
                        "days": [2],
                        "intervals": [{"start": "09:00", "end": "12:00"}],
                    },
                },
                "is_active": True,
                "priority": 1,
            },
        },
    ]

    if first_service_id:
        sd_cond = {
            "condition_type": "service_discount",
            "parameters": {
                "items": [{"service_id": first_service_id}],
                "category_ids": [],
            },
        }
        templates.append(
            {
                "tid": "service_discount",
                "body": {
                    "discount_type": "quick",
                    "name": f"QA скидка на услугу {QA_MARK}",
                    "description": f"{QA_MARK} service_discount (service_id={first_service_id})",
                    "discount_percent": 9.0,
                    "conditions": sd_cond,
                    "is_active": True,
                    "priority": 1,
                },
            }
        )
    else:
        print("  [WARN] service_discount: нет service_id у мастера — пропуск")

    for tpl in templates:
        tid = tpl["tid"]
        if tid in have_ct:
            print(f"  (skip) quick {tid}: уже есть QA-правило")
            continue
        try:
            r = client.post(
                f"{base}/api/loyalty/quick-discounts",
                headers=_auth_headers(hub_token),
                json=tpl["body"],
            )
            r.raise_for_status()
            row = r.json()
            did = row.get("id")
            print(f"  ✓ quick-discount {tid} id={did}")
        except httpx.HTTPStatusError as e:
            txt = (e.response.text or "")[:300]
            if e.response.status_code == 409:
                print(f"  (skip) quick {tid}: 409 conflict — возможно уже есть правило типа")
            else:
                print(f"  [WARN] quick {tid}: {e.response.status_code} {txt}")
        except Exception as e:
            print(f"  [WARN] quick {tid}: {e}")

    _ensure_hh_inactive_clone_quick_discount(client, base, hub_token)

    # --- Изолированные QA-клиенты loyalty (1 сценарий = 1 телефон) на M8 ---
    if admin_headers and first_service_id:
        try:
            _apply_loyalty_smoke_isolated_clients(
                client, base, admin_headers, hub_mid, int(first_service_id), today
            )
        except Exception as e:
            print(f"  [WARN] loyalty smoke isolated clients: {e}")
    elif not admin_headers:
        print("  [WARN] loyalty smoke isolated clients: admin_headers отсутствует — пропуск")

    # --- Personal discount на hub: только выделенный loyalty-smoke телефон ---
    _cleanup_qa_personal_discounts(
        client,
        base,
        hub_token,
        (client_phone_for_master(IDX_LOYALTY_HUB, 35), LOYALTY_SMOKE_PHONE_PERSONAL),
    )
    pers_phone = LOYALTY_SMOKE_PHONE_PERSONAL
    try:
        r = client.get(
            f"{base}/api/loyalty/personal-discounts",
            headers=_auth_headers(hub_token),
        )
        r.raise_for_status()
        pers_list = r.json()
    except Exception:
        pers_list = []
    already = False
    for p in pers_list if isinstance(pers_list, list) else []:
        if (p.get("client_phone") or "").replace(" ", "") == pers_phone.replace(" ", ""):
            if QA_MARK in (p.get("description") or "") or p.get("discount_percent") == 12.0:
                already = True
                break
    if not already:
        try:
            r = client.post(
                f"{base}/api/loyalty/personal-discounts",
                headers=_auth_headers(hub_token),
                json={
                    "client_phone": pers_phone,
                    "discount_percent": 12.0,
                    "description": f"{QA_MARK} personal — Лояльность → Персональные",
                    "is_active": True,
                },
            )
            r.raise_for_status()
            print(f"  ✓ personal-discount {pers_phone}")
        except httpx.HTTPStatusError as e:
            print(f"  [WARN] personal-discount: {e.response.status_code} {(e.response.text or '')[:200]}")
        except Exception as e:
            print(f"  [WARN] personal-discount: {e}")
    else:
        print(f"  (skip) personal-discount {pers_phone}: уже есть")

    # --- Заметка + отображаемое имя (модуль «Клиенты»: поиск + карточка) ---
    note_phone = client_phone_for_master(IDX_CLIENT_NOTE, 3)
    note_text = f"{QA_MARK} заметка — поиск/карточка клиента (мастер idx={IDX_CLIENT_NOTE})"
    display_name = f"{QA_MARK} поисковое имя M{IDX_CLIENT_NOTE}"
    try:
        r = client.patch(
            f"{base}/api/master/clients/{note_phone}",
            headers=_auth_headers(note_token),
            json={"note": note_text, "master_client_name": display_name},
        )
        r.raise_for_status()
        print(f"  ✓ client note + display name M{IDX_CLIENT_NOTE} → {note_phone}")
    except httpx.HTTPStatusError as e:
        print(f"  [WARN] PATCH client metadata: {e.response.status_code} {(e.response.text or '')[:200]}")
    except Exception as e:
        print(f"  [WARN] PATCH client metadata: {e}")

    _print_operational_trace_summary(client, base, master_results)

    print(
        f"  ℹ M0 {master_results[0]['phone']}: week-bucket дашборд (legacy). "
        f"M{TRACE_DASHBOARD_IDX}: dashboard QA trace; "
        f"M{TRACE_STATS_FINANCE_IDX}: stats/finance QA trace + public. "
        f"7c legacy + дата «сегодня» reseed: {today.isoformat()}"
    )
    print("  ℹ Полная карта: docs/SMOKE_RESEED_MAP.md")


def _print_operational_trace_summary(
    client: httpx.Client,
    base: str,
    master_results: list[dict[str, Any]],
) -> None:
    """
    Печать в stdout: домен/slug, auto_confirm, pre-visit, флаги подписки, проверка public API.
    Не меняет шаги 7–7c; только GET.
    """
    print("\n--- Smoke trace summary (операционная привязка; см. SMOKE_RESEED_MAP.md) ---")

    trace_indices = (
        (0, "DASH week buckets (legacy M0)"),
        (2, "QA SMOKE AUTO confirm profile"),
        (3, "QA SMOKE MANUAL confirm profile"),
        (4, "CLIENTS note + search name (7d)"),
        (5, "DASHBOARD QA trace bookings (M5)"),
        (8, f"STATS+FINANCE trace + PUBLIC {PUBLIC_SMOKE_DOMAIN} + loyalty hub (M8)"),
        (9, "LOYALTY points OFF + balance smoke (M9)"),
    )

    for idx, role in trace_indices:
        if idx >= len(master_results):
            continue
        m = master_results[idx]
        tok = m["token"]
        label = f"M{idx} {m['phone']}"
        try:
            r = client.get(f"{base}/api/master/subscription/features", headers=_auth_headers(tok))
            r.raise_for_status()
            ff = r.json()
            print(
                f"  [{role}] {label} | plan={ff.get('plan_name')} "
                f"clients={ff.get('has_clients_access')} extStats={ff.get('has_extended_stats')} "
                f"finance={ff.get('has_finance_access')} loyalty={ff.get('has_loyalty_access')}"
            )
        except Exception as e:
            print(f"  [WARN] features {label}: {e}")

        try:
            r = client.get(f"{base}/api/master/settings", headers=_auth_headers(tok))
            r.raise_for_status()
            mast = (r.json() or {}).get("master") or {}
            dom = (mast.get("domain") or "").strip() or None
            print(
                f"       settings: master_id={mast.get('id')} domain={dom or '—'} "
                f"auto_confirm={mast.get('auto_confirm_bookings')} "
                f"pre_visit_effective={mast.get('pre_visit_confirmations_effective')}"
            )
            if dom:
                try:
                    pr = client.get(f"{base}/api/public/masters/{dom}")
                    print(f"       public GET /api/public/masters/{dom} → HTTP {pr.status_code}")
                except Exception as ex:
                    print(f"       [WARN] public profile: {ex}")
        except Exception as e:
            print(f"  [WARN] settings {label}: {e}")

    print("  ℹ M0: build_smoke_master0_dashboard_bookings — недельные bucket’ы (legacy).")
    print(
        f"  ℹ M{TRACE_DASHBOARD_IDX}: тел. {SMOKE_TRACE_PHONES_M5[0]}…{SMOKE_TRACE_PHONES_M5[-1]} (dashboard); "
        f"M{TRACE_STATS_FINANCE_IDX}: тел. {SMOKE_TRACE_PHONES_M8[0]}…{SMOKE_TRACE_PHONES_M8[-1]} (stats/finance); "
        f"auto/manual {SMOKE_TRACE_PHONE_AUTO}/{SMOKE_TRACE_PHONE_MANUAL} — см. SMOKE_RESEED_MAP.md"
    )
    print(
        "  ℹ Финансы 7c (legacy даты) + QA trace расходы/брони на M8 — см. SMOKE_RESEED_MAP.md"
    )

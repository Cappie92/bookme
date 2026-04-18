# Аудит loyalty перед правками (read-only)

**Дата:** 2026-01-28  
**Цель:** проверить три зоны риска (Timezone, прокидка `now`, service_discount + templateMatchesDiscount) перед доработками. Код не меняем.

---

## Summary

- **Timezone:** В `loyalty_discounts` используются `_master_timezone` (fallback **UTC**), `get_master_local_now`, `to_master_local`, `_master_local_to_utc`. Happy hours и birthday считаются по локальному времени мастера; end exclusive. В `client.py` отдельная `get_master_timezone` с fallback **Europe/Moscow** — расхождение с loyalty.
- **Master.timezone:** Есть в `models.Master` (default `Europe/Moscow`), в миграции `3b2ef651469c` — `masters.timezone` nullable, без default в БД.
- **Прокидка `now`:** `evaluate_discount_candidates` и `evaluate_and_prepare_applied_discount` принимают `now`. **Ни один production-вызов** (bookings, client, evaluate) **не передаёт `now`** → везде используется `datetime.utcnow()` внутри. Это единообразно, но явного «master-local-now на момент создания брони» как аргумента нет.
- **service_discount + templateMatchesDiscount:** Web и mobile используют один и тот же контракт (normalize → `service_id`|`category_id`|`_invalid`) и спец-правило «шаблон _invalid ⇒ матчит любую валидную service_discount». **Риск:** при 2+ активных service_discount mobile `findActiveDiscountForTemplate` возвращает **первую** совпавшую (`.find()`), т.е. произвольный выбор при деактивации/редактировании по шаблону.
- **Рекомендации:** Унифицировать fallback timezone (UTC в loyalty vs Moscow в client); при 2+ service_discount — не полагаться на `find` для «найти скидку по шаблону», показывать список или явный выбор.

---

## A. Timezone (master local date/time)

### 1) Где реализовано

| Место | Файл | Фрагмент |
|-------|------|----------|
| Модель Master | `backend/models.py` | `timezone = Column(String, default="Europe/Moscow")` (стр. 177) |
| Модель Salon, IndieMaster | `backend/models.py` | `timezone = Column(String, default="Europe/Moscow")` (стр. 105, 211) |
| Миграция masters.timezone | `alembic/versions/3b2ef651469c_add_city_and_timezone_to_salon_and_.py` | `op.add_column('masters', sa.Column('timezone', sa.String(), nullable=True))` (стр. 25) — default в БД не задан |
| Fallback TZ в loyalty | `backend/utils/loyalty_discounts.py` | `def _master_timezone(master_id, db):` (48–53). Если мастер не найден или `getattr(m, "timezone", None)` пусто → `return "UTC"` |
| Helpers loyalty | `backend/utils/loyalty_discounts.py` | `get_master_local_now` (56–65), `to_master_local` (67–76), `_master_local_to_utc` (79–85) |
| Использование в eval | `backend/utils/loyalty_discounts.py` | regular_visits (396–401): `now_local = get_master_local_now(...)`, окно в local, конвертация в UTC для запросов. birthday (412): `booking_local = to_master_local(booking_start, ...)`, `booking_date = booking_local.date()`. happy_hours (432–434): `booking_local = to_master_local(...)`, `booking_time` / `booking_day` из local |
| TZ в client (не loyalty) | `backend/routers/client.py` | `get_master_timezone(booking)` (39–55): fallback `'Europe/Moscow'` (getattr и except). Используется для past/future bookings, не для evaluate |

### 2) Фактическое поведение

- **loyalty:** «Сейчас» и дата/время брони переводятся в локаль мастера через `get_master_local_now` / `to_master_local`. При отсутствии мастера или `timezone` → **UTC**.
- **Happy hours:** Интервалы проверяются как `st <= booking_time < et` (end **exclusive**) в локальном времени мастера (стр. 439–441).
- **Birthday:** Окно по `booking_date` в локальной дате мастера. Year-wrap в `_birthday_in_window` (170–174): Dec/Jan и сдвиг ref на ±1 год.
- **Client:** Свой `get_master_timezone` с fallback **Europe/Moscow** — к evaluate не подмешивается, но единого «источника истины» по fallback нет.

### 3) Риски и краевые случаи

- **Разные fallback:** loyalty → UTC, client → Europe/Moscow. Пустой/не заданный TZ в разных модулях трактуется по-разному.
- **Пустая строка `timezone`:** `getattr(m, "timezone", None)` даёт `""`, в bool `False` → loyalty вернёт UTC. Корректно.
- **Master не найден:** `_master_timezone` → UTC. Ок для eval (master_id есть у брони), но при сбоях загрузки мастера — единый fallback.

### 4) Чек-лист (acceptance)

- [ ] В БД/модели есть `Master.timezone`; при отсутствии/пустом используется **один** fallback (целевой — UTC).
- [ ] Все расчёты happy_hours и birthday используют **локальную** дату/время мастера.
- [ ] Happy hours: end **exclusive** (`booking_time < end`).
- [ ] Birthday: окно по локальной дате, year-wrap корректен (Dec/Jan).
- [ ] B1 regular_visits: окно от «сейчас» в локальной зоне мастера.

### 5) Расхождения и минимальный фикс (без правок кода)

- **Расхождение:** В `client.get_master_timezone` fallback **Europe/Moscow**, в `loyalty_discounts._master_timezone` — **UTC**. Спека: при не заданном TZ — UTC.
- **Фикс:** В `client.py` в `get_master_timezone` заменить fallback на `'UTC'` (и в getattr, и в except), либо вызывать общий helper из loyalty при необходимости единого TZ. Сейчас client TZ не используется в evaluate.

**Таблица «где используется TZ»:**

| Файл | Функция/место | Назначение |
|------|----------------|------------|
| `utils/loyalty_discounts.py` | `_master_timezone` | Fallback UTC для loyalty eval |
| `utils/loyalty_discounts.py` | `get_master_local_now`, `to_master_local`, `_master_local_to_utc` | B1, birthday, happy_hours |
| `routers/client.py` | `get_master_timezone`, `get_current_time_in_timezone` | Past/future bookings, не evaluate |
| `routers/domain.py` | Ответы API | Отдача `timezone` салона/мастера |
| `models.py` | `Master`, `Salon`, `IndieMaster` | Хранение `timezone` |

---

## B. Прокидывание параметра `now` по booking flow

### 1) Где реализовано

| Место | Файл | Фрагмент |
|-------|------|----------|
| Сигнатура eval | `backend/utils/loyalty_discounts.py` | `evaluate_discount_candidates(..., now: Optional[datetime] = None)` (296). Если `None` → `now = datetime.utcnow()` (303–304) |
| Сигнатура prepare | `backend/utils/loyalty_discounts.py` | `evaluate_and_prepare_applied_discount(..., now: Optional[datetime] = None)` (198), передаёт `now=now` в `evaluate_discount_candidates` (225) |
| Bookings create (auth) | `backend/routers/bookings.py` | Вызов `evaluate_and_prepare_applied_discount(..., db=db)` (231–238). **`now` не передаётся** |
| Bookings create (public) | `backend/routers/bookings.py` | Аналогично (432–439). **`now` не передаётся** |
| Client create | `backend/routers/client.py` | Вызов (524–531). **`now` не передаётся** |
| Client temporary create | `backend/routers/client.py` | Вызов (737–744). **`now` не передаётся** |
| Client confirm temporary | `backend/routers/client.py` | Вызов (796–803). **`now` не передаётся** |
| Evaluate endpoint | `backend/routers/loyalty.py` | `evaluate_discount_candidates(..., db=db)` (513–519). **`now` не передаётся** |
| Тесты | `backend/tests/test_loyalty_discounts.py` | В `test_regular_visits_b1_inject_now` передаётся `now=now` (739–740) |

### 2) Фактическое поведение

- Во всех production-путях (bookings, client, evaluate) `now` не передаётся → в eval всегда `datetime.utcnow()`.
- B1 regular_visits использует `get_master_local_now(master_id, db, now)`; `now` — этот utcnow, затем конвертация в локаль мастера. Окно «сейчас» получается согласованным с текущим моментом в UTC.
- Итог: «сейчас» везде одно и то же (серверный utcnow), логика B1 корректна, но **явного «master-local-now на момент создания брони» как прокидываемого параметра нет**.

### 3) Риски и краевые случаи

- **Нет явного прокидывания `now`:** При гипотетическом кешировании или отложенной обработке брони «сейчас» могло бы отличаться от момента создания. Сейчас такого нет — вызов синхронный.
- **Тесты:** Инжект `now` есть только в одном тесте; остальные опираются на реальный `utcnow()`.

### 4) Чек-лист (acceptance)

- [ ] `evaluate_discount_candidates` и `evaluate_and_prepare_applied_discount` принимают `now`.
- [ ] Все точки создания/подтверждения брони вызывают evaluate с **одним и тем же** правилом формирования «сейчас» (либо передают `now`, либо явно документируют использование utcnow).
- [ ] B1 использует «сейчас» в локали мастера (через `get_master_local_now`).

### 5) Расхождения и минимальный фикс

- **Факт:** Во всех production-вызовах `now` **не прокидывается**.
- **Поведение:** Единообразно используется `utcnow()` внутри eval. Критичным багом это не является.
- **Рекомендация:** Либо явно передавать `now=datetime.utcnow()` (или `get_master_local_now`-эквивалент) из bookings/client, чтобы контракт был явным, либо оставить как есть и зафиксировать в документации, что «сейчас» всегда серверный utcnow, конвертируемый в local внутри eval.

---

## C. service_discount и templateMatchesDiscount (web + mobile)

### 1) Где реализовано

| Место | Файл | Фрагмент |
|-------|------|----------|
| Нормализация service_discount | `mobile/src/utils/loyaltyConditions.ts` | `normalizeParametersForComparison` для `service_discount` (237–281): `service_id` \| `category_id` \| legacy 1 elem → конвертация; >1 → `_invalid` |
| То же (web) | `frontend/src/utils/loyaltyConditions.js` | Аналогично (236–279) |
| templateMatchesDiscount | `mobile/.../loyaltyConditions.ts` (302–326), `frontend/.../loyaltyConditions.js` (301–318) | Сравнение `condition_type` и нормализованных params; `stableStringify(normT) === stableStringify(normD)`. Спец-правило: `service_discount` + `normT._invalid` + `normD` валиден ⇒ `return true` |
| isTemplateActive | `mobile/.../loyaltyConditions.ts` (331–336) | `discounts.some(d => templateMatchesDiscount(template, d))` |
| findActiveDiscountForTemplate | `mobile/.../loyaltyConditions.ts` (344–349) | `discounts.find(d => templateMatchesDiscount(template, d)) ?? null` — **первый** совпавший |
| Использование в UI | `mobile/.../DiscountsQuickTab.tsx` | `isTemplateActive` (82, 185), `findActiveDiscountForTemplate` (100, 266) — деактивация шаблона и обновление % по «найденной» скидке |
| Использование в UI | `frontend/.../LoyaltySystem.jsx` | Только `templateMatchesDiscount` для `isActive` (598). Список «Активные быстрые скидки» — по `discount.id`, без привязки к шаблону |
| Шаблон service_discount | `backend/routers/loyalty.py` | `QUICK_DISCOUNT_TEMPLATES` (300–311): `parameters: { items: [], category_ids: [] }` ⇒ нормализатор даёт `_invalid` |

### 2) Фактическое поведение

- Одно правило = один селекшен (`service_id` | `category_id`); при legacy >1 — `_invalid`. Web и mobile используют одинаковую нормализацию и `stableStringify`.
- Обобщённый шаблон (пустые items/category_ids → `_invalid`) матчит **любую** активную service_discount. «Активна» пока есть хотя бы одна такая скидка.
- **Mobile:** При деактивации/редактировании по шаблону вызывается `findActiveDiscountForTemplate` → берётся **первая** совпавшая скидка. При 2+ service_discount это произвольный выбор.
- **Web:** Редактирование/удаление идёт по конкретной скидке из списка (`discount.id`), без «найти по шаблону» — произвольного выбора нет.

### 3) Риски и краевые случаи

- **2+ service_discount:** Шаблон «Скидка на услуги» активен, но «найти скидку для редактирования по шаблону» на mobile возвращает одну из них (первую в массиве) — недетерминизм с точки зрения пользователя.
- **0 правил:** Шаблон не активен. Корректно.
- **1 правило:** Активен, `find` возвращает его. Корректно.

### 4) Чек-лист (acceptance)

- [ ] Одно правило = один селекшен; нет «на все услуги».
- [ ] 0 service_discount → шаблон не активен.
- [ ] 1 service_discount → активен, возможно однозначно найти скидку по шаблону.
- [ ] 2+ service_discount → шаблон активен, но **не** произвольно выбирать одну скидку для редактирования/деактивации по шаблону; нужен явный выбор или список.

### 5) Расхождения и минимальный фикс

- **Расхождение:** При 2+ service_discount mobile `findActiveDiscountForTemplate` возвращает первую совпавшую → произвольный выбор при деактивации/редактировании по шаблону.
- **Фикс:** Для обобщённого шаблона service_discount (`_invalid`) при 2+ совпадениях не вызывать `find` для «какую скидку деактивировать». Варианты: показывать список совпадающих скидок и требовать выбор; либо для такого шаблона скрывать «деактивировать» и вести только через список «Активные быстрые скидки» с удалением по `discount.id` (как на web). Код не меняем — только рекомендация.

**Сценарная таблица:**

| Сценарий | isTemplateActive | findActiveDiscountForTemplate | Примечание |
|----------|------------------|-------------------------------|------------|
| 0 service_discount | false | null | Ок |
| 1 service_discount | true | эта скидка | Ок |
| 2+ service_discount | true | **первая** из совпавших | Риск: произвольный выбор при деактивации/редактировании по шаблону на mobile |

---

## Дополнительно: Smoke checklist (10–15 пунктов)

1. **API create quick discount:** `POST /api/loyalty/quick-discounts` с `service_discount` и `parameters: { service_id: N }` (N — услуга мастера) → 200.
2. **API create, invalid:** `service_discount` с `parameters: { items: [ { service_id: 1 }, { service_id: 2 } ] }` → 422.
3. **API update quick discount:** `PUT /api/loyalty/quick-discounts/:id` с невалидными `conditions` (например, пересекающиеся happy_hours) → 422.
4. **Booking under happy hours:** Создать бронь в слот happy hours (локаль мастера); проверить, что applied_discount матчит правило и сумма со скидкой.
5. **Booking exactly at end:** Бронь на `end_time` (например, 12:00 при интервале 09:00–12:00) → скидка **не** применяется (end exclusive).
6. **Birthday around year-wrap:** Клиент с ДР 2 января; бронь 30 декабря (в окне 7/7) → матч. Аналогично ДР 30 декабря, бронь 2 января.
7. **Birthday outside window:** Бронь вне окна days_before/days_after → скидка не применяется.
8. **Regular_visits B1:** Окно от «сейчас»; 2 completed визита в последние 60 дней (по локали мастера), бронь в будущем → матч.
9. **service_discount, 0 правил:** Шаблон «Скидка на услуги» не активен (web + mobile).
10. **service_discount, 1 правило:** Шаблон активен; на mobile деактивация по шаблону удаляет именно эту скидку.
11. **service_discount, 2+ правил:** Шаблон активен; проверить, что при деактивации по шаблону на mobile не создаётся путаницы (сейчас — произвольное удаление одной из них).
12. **Web vs mobile:** Одинаковые templates + discounts → совпадение «Активна» / «Не активен» на web и mobile.
13. **Master timezone:** Мастер с `timezone=UTC`; happy hours 09:00–12:00; бронь 10:00 UTC → матч. Мастер `Europe/Moscow`, бронь 10:00 UTC → 13:00 Moscow; при 09–12 Moscow не матч.
14. **Evaluate endpoint:** `POST /api/loyalty/evaluate` с телом по контракту → 200, `candidates` и `best_candidate` соответствуют правилам.
15. **Поведение при пустом timezone:** Мастер с `timezone=null` или `""`; проверка, что loyalty использует fallback UTC и не падает.

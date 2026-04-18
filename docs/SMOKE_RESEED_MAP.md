# Smoke reseed — полная операционная карта

Документ описывает **один** сценарий данных: `backend/scripts/reseed_local_test_data.py` + шаг **7d** (`backend/scripts/smoke_reseed_layer.py`).  
Архитектура продукта здесь **не** объясняется — только **как зайти**, **под кем**, **что увидеть**, **какие сущности это подтверждают**.

---

## 1. Как запускать

```bash
cd /path/to/DeDato
# Backend: ENVIRONMENT=development, админ +79031078685 доступен
python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

| Флаг | Эффект |
|------|--------|
| *(по умолчанию)* | Полный reseed + **шаг 7d** (QA trace-брони/расходы/public slug, loyalty, заметка клиента, **trace summary** в stdout). |
| `--no-smoke-extended` | Без 7d — только «классический» reseed (шаги 1–11 без расширения). |
| `--no-salon` | Только подписки/клиенты без салона, броней и **без** полноценного UI-smoke. |

**Пароли:** мастера/клиенты `test123` (см. автоген `docs/TEST_DATA_ACCOUNTS.md` после прогона).

---

## 2. База: какие шаги старого reseed дают данные

| Шаг | Файл | Что создаёт |
|-----|------|-------------|
| Reset + мастера | `reseed_local_test_data.py` | 10 мастеров `+79990000000`…`09`, планы по `PLAN_ASSIGNMENTS`, балансы. |
| Салон/услуги/слоты | то же | Категории, услуги, расписание Tue/Thu/Sat. |
| **7** | то же | Публичные брони на **всех мастерах, кроме M0** (M0 исключён специально). |
| **7a** | то же | Доп. брони для legacy-клиента `+79990000101` (ЛК). |
| **7b** | то же | Массовые completed/cancelled для модуля «Клиенты» (`+7999{mi}{cccccc}`). |
| **7c** | то же | Финансы: фиксированные брони **2026-02…2026-04** + расходы «(reseed QA)»; **M0 не получает** фиксированные 7c-брони (не ломать week buckets дашборда). |
| 8–11 | то же | Subscription-status в лог, `TEST_DATA_ACCOUNTS.md`, post-reseed SQLite checks. |

**Шаг 7d** (отдельный файл): loyalty settings, quick/personal, заметка + отображаемое имя для поиска, **печать trace summary** (features, `domain`, public HTTP).

---

## 3. Новые шаги расширения (7d)

Слой **не заменяет** шаги 7 / 7a / 7b / 7c — только добавляет данные и настройки поверх них.

### 3.1 QA trace dataset (реальные сущности, не только документация)

| Действие | Где в коде |
|----------|------------|
| `POST /api/dev/testdata/delete_smoke_trace_bookings` — идемпотентная очистка броней по телефонам | `dev_testdata.py` → вызывает `smoke_reseed_layer.py` |
| `POST /api/dev/testdata/create_completed_bookings` — брони с `days_ahead`, статусом `confirmed`, полем `notes` | `dev_testdata.py` |
| `POST /api/dev/testdata/create_master_expenses` — расходы с маркером `[QA SMOKE]` | то же |
| `PUT /api/master/profile` — **M2** auto_confirm, **M3** manual, **M8** `domain=qa-smoke-public` | `smoke_reseed_layer.py` |
| `PATCH /api/master/clients/{phone}` — метаданные QA-клиента на **M8** (финансовый trace) | то же |

### 3.2 Loyalty + клиенты (как раньше)

| Действие | Где в коде |
|----------|------------|
| `PUT /api/master/loyalty/settings` — баллы ON (**M8**), OFF (**M9**) — только мастера с `has_loyalty_access` (Premium) | `smoke_reseed_layer.py` |
| `POST` quick-discounts с маркером `[QA SMOKE]` | то же |
| `POST` personal-discount (**M8** → клиент **`+79998000035`**) | то же |
| `PATCH` клиент M4: заметка + имя для поиска | то же |
| `GET` features/settings + проверка `GET /api/public/masters/{domain}` | то же |

---

## 4. Таблица smoke actors (мастера)

Канон телефонов: **`MASTER_PHONES[i]` = `+7999000000{i}`** (одна цифра индекса в шаблоне — см. скрипт).

| Idx | Телефон | План (назначение в reseed) | Роль в smoke | Разделы UI |
|-----|---------|----------------------------|--------------|------------|
| **0** | `+79990000000` | Free | **Дашборд / недельные bucket’ы**: только данные из `build_smoke_master0_dashboard_bookings` (без шага 7 публичных броней). Статусы: completed, `created` / `awaiting_confirmation` (pending), cancelled. | Дашборд, ближайшие/прошедшие, отчёт недель в логе reseed. Статистика — если доступна по плану (ограничения см. features в логе 7d). |
| **1** | `+79990000001` | Free | Шаг **7** создаёт **будущие** публичные брони; **7c** — финансовые точки на датах 2026; **7b** — прошлые completed. | Календарь/список записей, **публичная запись** (см. §7), Финансы, Статистика (при наличии фич). |
| **2** | `+79990000002` | Basic | **7d:** `auto_confirm_bookings=true`; бронь `+79991230101` (future created). | Сравнение с M3, список записей. |
| **3** | `+79990000003` | Basic | **7d:** `auto_confirm_bookings=false`; бронь `+79991230102` (future created). | Ручное подтверждение в настройках / очередь записей. |
| **4** | `+79990000004` | Standard | **7d**: заметка + **поисковое имя** на клиенте `+79994000003`. | **Клиенты**: поиск по телефону/имени, карточка, заметка. |
| **5** | `+79990000005` | Standard low | **7d:** QA trace **только дашборд/список** — тел. `+79991230001`…`04` (без extStats/finance в плане). | Дашборд, ближайшие/прошедшие по маркерам в notes. |
| **6** | `+79990000006` | Pro | Регрессионный план в reseed; **smoke loyalty не на нём** (нет `has_loyalty_access` в типичной матрице планов). | — |
| **7** | `+79990000007` | Pro low balance | То же. | — |
| **8** | `+79990000008` | Premium | **7d:** `domain=qa-smoke-public` + **stats/finance QA trace** (`+79991231001`…`04`) + расходы + **loyalty hub** (quick/personal/баллы ON). | Статистика, финансы, лояльность, публичная страница. |
| **9** | `+79990000009` | Premium low | **7d:** баллы **OFF** (контраст с M8) + низкий баланс. | Лояльность (выкл. программа), подписка/баланс. |

**Ограниченный функционал:** **M0 (Free)** — без части платных модулей (loyalty/finance/extended stats — см. строку `features` в **логе после 7d** или `GET /api/master/subscription/features`).

---

## 5. Таблица smoke entities

### 5.1 Дашборд / записи (M0)

Источник: **`build_smoke_master0_dashboard_bookings`** + `create_completed_bookings` в 7b.

| Что проверяем | Статусы в данных | Где в UI |
|---------------|------------------|----------|
| Прошедшие завершённые | `completed` в неделях -2, -1, текущая (дни ≤ сегодня) | Блок «Прошедшие» / прошлые недели |
| Будущие / ожидающие | `created`, `awaiting_confirmation` (часть трактуется как pending в агрегатах дашборда) | «Ближайшие», карточки недель **+1 / +2** |
| Отмены | `cancelled` (не в bt) | Отдельный сценарий / не в счётчиках total |
| Pre-visit effective | `pre_visit_confirmations_effective` в **логе 7d** для каждого мастера | Настройки профиля; тумблер pre-visit зависит от плана |

### 5.1b QA trace — дашборд (M5)

**Мастер:** `+79990000005`. **Телефоны:** `+79991230001`…`04` (только сценарии списка записей / дашборда).

| Телефон | Маркер в notes | Статус | Назначение |
|---------|----------------|--------|------------|
| `+79991230001` | `QA SMOKE DASH — future created` | created (будущее) | Ближайшие |
| `+79991230002` | `QA SMOKE DASH — pre-visit confirmed` | confirmed (будущее) | Pre-visit |
| `+79991230003` | `QA SMOKE DASH — past awaiting_confirmation` | awaiting_confirmation (прошлое) | Ожидает исход |
| `+79991230004` | `QA SMOKE DASH — past completed` | completed (прошлое) | Прошедшие завершённые |

### 5.1c QA trace — статистика и финансы (M8, Premium)

**Мастер:** `+79990000008`. **Телефоны:** `+79991231001`…`04` + расходы + PATCH клиента на `+79991231001`.

| Телефон | Маркер в notes | Статус | Назначение |
|---------|----------------|--------|------------|
| `+79991231001` | `QA SMOKE STATS FACT … FIN CONF` | completed | Fact / подтверждённый доход + карточка клиента |
| `+79991231002` | `QA SMOKE STATS — second date point` | completed | Вторая дата на графике |
| `+79991231003` | `QA SMOKE FIN EXPECTED — created future` | created + сумма | Ожидаемое |
| `+79991231004` | `QA SMOKE FIN AWAITING …` | awaiting_confirmation | Ожидаемое без закрытия |

**Auto vs manual:** **M2** / **M3** — как в §5.1b ранее (`+79991230101` / `+79991230102`).

### 5.1d Канон: зелёная кнопка pre-visit (будущая запись)

**Один канонический product rule** (совпадает с `frontend/src/utils/bookingOutcome.js` и `mobile/src/utils/bookingOutcome.ts` после выравнивания):

Зелёная кнопка **pre-visit** показывается **только если одновременно**:

1. `start_time` в будущем (относительно «сейчас» клиента),
2. `status === "created"` (не `confirmed` — запись уже принята до визита),
3. у мастера **ручное** подтверждение: `auto_confirm_bookings` не `true`,
4. `GET /api/master/settings` → **`master.pre_visit_confirmations_effective === true`**  
   (на бэкенде это требует **`has_extended_stats`** у тарифа и (ручной режим **или** legacy-флаг pre-visit), см. `backend/utils/pre_visit_effective.py`).

**Где кнопки не будет — и это не баг:**

| Ситуация | Почему |
|----------|--------|
| **M5** (Standard) и другие без extended stats | `pre_visit_confirmations_effective` = false |
| Future **`confirmed`** | Pre-visit действие уже не применимо; в списке «Ближайшие» запись может быть видна, кнопки нет |
| Future **`created`**, но **auto** (`auto_confirm_bookings === true`), напр. **M2** | `requiresManualConfirmation` = false |
| Future **`awaiting_confirmation`** (если попала в будущие) | Pre-visit только для `created` |

**Канонический smoke-case (ручная проверка web + native):**

| Поле | Значение |
|------|----------|
| Мастер | **M8** `+79990000008` (Premium) |
| Профиль после 7d | `auto_confirm_bookings=false`, `domain=qa-smoke-public`, `pre_visit_confirmations_effective=true` (проверить в `GET /api/master/settings`) |
| Клиент | **`+79991231100`** |
| Бронь | future, **`status=created`**, `days_ahead=5`, 09:00 UTC-naive из reseed, notes: `QA SMOKE PREVISIT CANON` |
| Web | `MasterDashboardStats` → блок **«Ближайшие записи»** — у этой строки **зелёная** кнопка |
| Native | `mobile/app/(master)/index.tsx` — топ-3 ближайших; та же запись при сортировке по времени |

**Негативные эталоны в том же reseed (ожидаемо без зелёной pre-visit):**

- **M5** `+79991230001` future `created` — без effective (Standard).
- **M5** `+79991230002` future `confirmed` — уже подтверждена.
- **M2** `+79991230101` future `created` — auto-режим.

---

### 5.2 Статистика (fact / plan / total)

Источник: **legacy** — брони 7b/7/7c и M0; **новый trace для графиков** — **M8** §5.1c (`has_extended_stats` на Premium).

| Мастер | Зачем | Что смотреть |
|--------|-------|----------------|
| **M8** | QA trace STATS (§5.1c) | Период с датами броней `+79991231…`; подписи `QA SMOKE STATS …` |
| **M1–M9** (не M0 для 7c-дат) | Legacy 7b/7/7c | При наличии фич по плану |
| **M0** | Недельные bucket’ы | Сверка **bt / bc / bp** с логом reseed |

**Фиксированные даты 7c** (2026-02…04) — legacy; **M8** даёт точки на датах относительно дня прогона.

---

### 5.3 Финансы

#### 5.3a Legacy — шаг **7c** (как раньше)

Для каждого мастера **с услугами**, **кроме M0**, создаются брони:

| Дата | Статус | Назначение smoke |
|------|--------|------------------|
| 2026-02-10 | completed | **Confirmed / fact income** (завершённая запись) |
| 2026-02-14 | awaiting_confirmation | **Expected / plan** (ожидает подтверждения) |
| 2026-03-12 | completed | Fact |
| 2026-03-20 | created | Expected (создана) |
| 2026-04-08 | completed + `payment_amount` 1800 | Fact с явной суммой оплаты |
| 2026-04-25 | awaiting_confirmation | Expected |

Клиент для строк: **`client_phone_for_master(mi, 0)`** (например M1 → `+79991000000`).

**Расходы** (одинаковые названия для поиска в списке):

- `Аренда (reseed QA)` — 2026-02-05  
- `Материалы (reseed QA)` — 2026-03-18  
- `Реклама (reseed QA)` — 2026-04-14  

**M0** не получает набор 7c-броней — чтобы не путать week buckets дашборда.

В UI: **Финансы** → период **февраль–апрель 2026** → список операций, **ожидаемое vs подтверждённое**, расходы, нижние графики.

#### 5.3b Новый QA trace на **M8** (шаг 7d)

| Сущность | Описание |
|----------|----------|
| Подтверждённый доход | `+79991231001` completed — notes `FIN CONF`; `BookingConfirmation` для completed. |
| Ожидаемое (future) | `+79991231003` — `QA SMOKE FIN EXPECTED`. |
| Ожидаемое (awaiting) | `+79991231004` — `QA SMOKE FIN AWAITING`. |
| Расходы | **`[QA SMOKE] QA SMOKE EXPENSE rent`** и **`ads`** на master **M8**. |

**Кого открыть:** **M8** `+79990000008` → **Финансы** (`has_finance_access` на Premium).

---

### 5.4 Лояльность (7d)

| Элемент | Мастер | Детали |
|---------|--------|--------|
| Баллы ON, нестандартные % | **M8** | `accrual` 7%, max payment 40%, lifetime 90 дн. |
| Баллы OFF | **M9** | Программа выключена (контраст) |
| Quick rules `[QA SMOKE]` | **M8** | В т.ч. **happy_hours** с **одним** днём недели и **одним** интервалом (требование API) |
| Personal | **M8** | Клиент **`+79998000035`** |

---

### 5.5 Клиенты

| Кейс | Телефон / мастер | Источник |
|------|------------------|----------|
| Много визитов (VIP) | См. stdout reseed: строка `Мастер {i}: VIP …` | 7b |
| Заметка + поиск по имени | Мастер **M4**, клиент **`+79994000003`**, имя содержит **`[QA SMOKE]`** | 7d |
| Персональная скидка (loyalty) | **`+79998000035`** у **M8** | 7d |
| Legacy | `+79990000100` … `102` | всегда |

Сортировка: параметры `sort_by` / `sort_dir` в URL мастерского web (как в приложении).

---

### 5.6 Публичная запись

| Поле | Значение |
|------|----------|
| **Гарантированный smoke-case (7d)** | **M8** `+79990000008` → slug **`qa-smoke-public`** (фиксирован в `smoke_reseed_layer.py`). |
| Доп. мастер со слотами | **M1** `+79990000001` — будущие брони шага **7** (legacy). |
| URL (web) | `{origin}/m/qa-smoke-public` |
| API | `GET /api/public/masters/qa-smoke-public` — после 7d в stdout указан HTTP-код. |
| Услуги / слоты | Как у мастера в кабинете; расписание Tue/Thu/Sat из reseed. |

Поток: открыть **`/m/qa-smoke-public`** → услуга → дата в доступном диапазоне → слот (несколько будущих дней в расписании).

---

### 5.7 Подписка / баланс

| Мастер | Сценарий |
|--------|----------|
| **M9** / low balance | Мало рублей на счёте — проверка предупреждений / `can_continue` |
| **M8–M9** / Premium | Полный коммерческий набор по плану; smoke loyalty на M8/M9 |
| **M0** | Free — базовые ограничения |

После reseed в **stdout**: блок `--- Subscription status ---` и строки **Smoke trace summary** с `plan_name` и флагами.

---

## 6. Минимальный walkthrough (5–10 мин)

1. Запустить reseed (команда выше). В конце прочитать **Smoke trace summary** (фичи M8/M9, `qa-smoke-public`).
2. **Дашборд (legacy):** **M0** → сверить недели с логом `print_smoke_master_week_bucket_report`.
3. **Дашборд (trace):** **M5** → §5.1b.
4. **Финансы / статистика (trace):** **M8** → §5.1c, §5.3b; опционально legacy **7c** на **M1** (2026-02…04).
5. **Лояльность:** **M8** / **M9** — баллы вкл/выкл; quick/personal на **M8**.
6. **Клиенты:** **M4** — заметка; **M8** — клиент `+79991231001` (PATCH trace).
7. **Публичная запись:** `/m/qa-smoke-public` (**M8**).
8. **Подписка / баланс:** **M9** (low) и **M0** (Free).

---

## 7. Расширенный walkthrough по разделам

### Dashboard  
**Кто:** M0 (legacy week buckets), **M5** (новый QA trace §5.1b). **Данные:** `build_smoke_master0_dashboard_bookings` и брони 7d на M5.

### Stats  
**Кто:** **M8** (§5.1c, `has_extended_stats`). **Данные:** §5.2.

### Finance  
**Кто:** **M8** (§5.3b), **M1** (legacy 7c §5.3a). **Что:** подтверждённое / ожидаемое / расходы с `[QA SMOKE]`.

### Loyalty  
**Кто:** **M8** vs **M9**. **Данные:** 7d (§5.4).

### Clients  
**Кто:** M4 (поиск), **M8** (personal `+79998000035`, trace `+79991231001`). **Данные:** 7b + 7d.

### Public booking  
**Кто:** **`qa-smoke-public`** (M8). **Данные:** 7d + расписание reseed.

### Subscription / balance  
**Кто:** M0 (Free), M8 (Premium), M9 (low balance). **Данные:** reseed + строки trace summary.

---

## 8. Файлы

| Файл | Роль |
|------|------|
| `backend/scripts/reseed_local_test_data.py` | База reseed, шаги 7–7c. |
| `backend/scripts/smoke_reseed_layer.py` | Шаг 7d (trace + loyalty + клиенты). |
| `backend/routers/dev_testdata.py` | `create_completed_bookings` (в т.ч. `days_ahead`, `confirmed`, `notes`), `delete_smoke_trace_bookings`, `create_master_expenses`. |
| `docs/TEST_DATA_ACCOUNTS.md` | Аккаунты после прогона. |
| `backend/routers/dev_e2e.py` | Отдельный E2E, не смешивать телефоны. |

---

## 9. Регрессии и идемпотентность

- Повторный **полный** reseed: как правило с reset БД — детерминированный результат.
- Повторный прогон **только 7d** без reset: loyalty quick-правила и personal-discount пропускаются по маркеру `[QA SMOKE]`; **брони trace** перед созданием удаляются через `delete_smoke_trace_bookings` для фиксированных телефонов.
- **Расходы** M8 при повторе без полного reset могут **дублироваться** (нет dev-delete по имени) — для строгой идемпотентности используйте полный reseed.
- Не гонять reseed против production.

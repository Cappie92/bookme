# План миграции к каноничной сущности "master" (Variant A)

**Цель:** Устранить коллизии favorites (одинаковый `master_name`, разные `favKey`: `master:1` vs `indie_master:1`), сделав `master` единственным источником истины. `indie_master` исчезает из рантайма в MVP.

**Принципы:** Обратимая миграция, без костылей, без сопоставления по имени. Стабильный ключ — `user_id`.

---

## 0. Целевая модель (Hard constraints)

### 0.A. IndieMaster → Master bridge

| Ограничение | Значение | Обоснование |
|-------------|----------|-------------|
| `indie_masters.master_id` | NOT NULL, FK на `masters(id)` | Каждый indie_master обязан быть связан с master |
| UNIQUE(`indie_masters.master_id`) | Да (1:1) | Один master — один indie_master. Если нужен 1:many — явно описать и обосновать. |
| После cutover: `indie_master_id` в API | Не отдавать (или только под `MASTER_CANON_DEBUG=1`) | Клиент не должен видеть indie_master_id в ответах bookings |

### 0.B. Backfill алгоритм (стабильный ключ)

**Запрет:** Никаких матчей по имени (`master_name`, `full_name`, `domain` и т.п.).

**Стабильный ключ:** `user_id`. Связь: `IndieMaster.user_id` = `Master.user_id` = `User.id`.

**Алгоритм backfill:**

1. **Сопоставление по user_id:**
   ```sql
   UPDATE indie_masters im
   SET master_id = (SELECT m.id FROM masters m WHERE m.user_id = im.user_id LIMIT 1)
   WHERE im.user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id);
   ```

2. **Если Master не найден (IndieMaster без Master):**
   - Создать запись в `masters` для каждого такого `indie_master`:
     - `user_id` = `indie_master.user_id`
     - `can_work_independently` = True
     - остальные поля — дефолты
   - Затем выполнить шаг 1.

3. **Проверка перед NOT NULL:**
   - `SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL` — должно быть 0.

### 0.C. Favorites миграция + дедуп

**Правило миграции:**
- `favorite_type='indie_master'` → `favorite_type='master'`, `master_id` = `indie_masters.master_id`, `indie_master_id` = NULL.

**Дедуп:**
- Критерий: `(client_id, favorite_type='master', master_id)` — уникален.
- Если у клиента уже есть favorite на `master_id` и мы мигрируем indie-запись на тот же `master_id` — **удалить дубликат** (оставить одну запись).

**Псевдо-SQL:**
```sql
-- 1. Временная таблица миграции
CREATE TEMP TABLE fav_migration AS
SELECT cf.client_favorite_id, cf.client_id, im.master_id AS resolved_master_id
FROM client_favorites cf
JOIN indie_masters im ON im.id = cf.indie_master_id AND im.master_id IS NOT NULL
WHERE cf.favorite_type = 'indie_master';

-- 2. Удалить дубликаты (уже есть master favorite)
DELETE FROM client_favorites
WHERE client_favorite_id IN (
  SELECT fm.client_favorite_id FROM fav_migration fm
  WHERE EXISTS (
    SELECT 1 FROM client_favorites existing
    WHERE existing.client_id = fm.client_id
      AND existing.favorite_type = 'master'
      AND existing.master_id = fm.resolved_master_id
  )
);

-- 3. Мигрировать оставшиеся
UPDATE client_favorites cf
SET favorite_type = 'master', master_id = im.master_id, indie_master_id = NULL
FROM indie_masters im
WHERE cf.indie_master_id = im.id AND cf.favorite_type = 'indie_master'
  AND im.master_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_favorites ex
    WHERE ex.client_id = cf.client_id AND ex.favorite_type = 'master'
      AND ex.master_id = im.master_id AND ex.client_favorite_id != cf.client_favorite_id
  );
```

### 0.D. API совместимость / Guardrails

| Элемент | Поведение |
|---------|-----------|
| **POST /favorites** с `favorite_type != 'master'` | После cutover: **400** "Only master favorites are supported" |
| **GET /favorites/indie-masters** | Deprecated. Срок: 1 релиз после mobile cutover. Поведение: **410 Gone** с `{"detail": "Use /favorites/masters. Indie-masters merged into masters."}` |
| **Удаление эндпоинта** | После 410 — через 1–2 релиза удалить роут |
| **Feature-flag** | `MASTER_CANON_MODE` (ENV): `0` = старое поведение (откат), `1` = резолв в master, master-only |

### 0.E. Порядок работ (этапы 1..N)

| Этап | Название | Содержание | Статус |
|------|----------|------------|--------|
| **1** | Bridge + Backfill | Alembic: добавить `indie_masters.master_id`, backfill по user_id, NOT NULL, UNIQUE | ✅ Выполнен (см. [MASTER_CANON_STAGE1_REPORT.md](./MASTER_CANON_STAGE1_REPORT.md)) |
| **2** | Backend read-resolve | В client router: при отдаче bookings — всегда `master_id`, не отдавать `indie_master_id` (или под DEBUG) | ✅ Выполнен (см. [MASTER_CANON_STAGE2_REPORT.md](./MASTER_CANON_STAGE2_REPORT.md)) |
| **3** | Favorites migration + dedup | Alembic: мигрировать client_favorites indie→master, дедуп | ✅ Выполнен (см. [MASTER_CANON_STAGE3_REPORT.md](./MASTER_CANON_STAGE3_REPORT.md)) |
| **4** | Mobile master-only | Убрать indie-masters hydrate, favKey только `master:N` |
| **5** | Disable/deprecate | 410 на /indie-masters, 400 на POST не-master |

### 0.F. Тест-план (расширенный)

**Сценарии:**

1. **До миграции:** Коллизия `master_name` может существовать (разные favKey для одного имени).
2. **После bridge+resolve:** favKey единый `master:N` для всех записей одного мастера.
3. **После миграции favorites:** У клиента не бывает одновременно master и indie для одного мастера.
4. **Toggle favorite** на любом booking синхронизирует все строки с тем же `master_id`.

**Smoke checks (curl):**
```bash
# До: GET /api/client/bookings/ — есть indie_master_id
# После: GET /api/client/bookings/ — master_id всегда, indie_master_id отсутствует (или под DEBUG)

# GET /api/client/favorites/masters — все избранные
# GET /api/client/favorites/indie-masters — 410 после cutover
```

**DB checks:**
```sql
SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL;  -- 0
SELECT COUNT(*) FROM client_favorites WHERE favorite_type = 'indie_master';  -- 0 после миграции
SELECT client_id, master_id, COUNT(*) FROM client_favorites WHERE favorite_type='master' GROUP BY client_id, master_id HAVING COUNT(*)>1;  -- 0 (нет дублей)
```

**Mobile checks:** Логи `[FAV][hydrate]`, `[FAV][row]` — нет `indie_master:*` в favKey.

**Чек-лист отката:**
- [ ] `alembic downgrade` до миграции bridge
- [ ] `MASTER_CANON_MODE=0` на backend
- [ ] Mobile: откат на версию с indie-masters (если уже задеплоена)

---

## 0.G. PRE-CHECKS (обязательные SQL до миграций)

Выполнить **до** Этапа 1. Все запросы — read-only.

### 0.G.1. Дубли indie_masters.user_id

```sql
-- user_id с несколькими indie_masters
SELECT user_id, COUNT(*) AS cnt
FROM indie_masters
WHERE user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) > 1;
```
**Ожидание:** 0 строк. Если есть — см. раздел 0.H (разрешение коллизий).

### 0.G.2. Потенциальные нарушения 1:1 для master_id

```sql
-- После backfill: сколько masters будут иметь >1 indie_master
-- (если user_id дублируется — один master получит несколько indie_masters)
SELECT m.id AS master_id, COUNT(im.id) AS indie_count
FROM masters m
JOIN indie_masters im ON im.user_id = m.user_id
GROUP BY m.id
HAVING COUNT(im.id) > 1;
```
**Ожидание:** 0 строк (при отсутствии дублей user_id в indie_masters).

### 0.G.3. Статистика indie_masters

```sql
-- Всего indie_masters
SELECT COUNT(*) AS total FROM indie_masters;

-- Без user_id
SELECT COUNT(*) AS no_user_id FROM indie_masters WHERE user_id IS NULL;

-- user_id есть, но User не существует
SELECT COUNT(*) AS orphan_user
FROM indie_masters im
WHERE im.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id);

-- user_id есть, но Master не существует (кандидаты на создание Master)
SELECT COUNT(*) AS no_master
FROM indie_masters im
WHERE im.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
  AND NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id);
```

### 0.G.4. Статистика favorites

```sql
-- Indie-master favorites
SELECT COUNT(*) AS indie_fav_count
FROM client_favorites
WHERE favorite_type = 'indie_master';

-- Сколько indie-favorites после маппинга станут дублями (уже есть master favorite)
SELECT COUNT(*) AS would_be_duplicates
FROM client_favorites cf
JOIN indie_masters im ON im.id = cf.indie_master_id
JOIN masters m ON m.user_id = im.user_id
WHERE cf.favorite_type = 'indie_master'
  AND EXISTS (
    SELECT 1 FROM client_favorites ex
    WHERE ex.client_id = cf.client_id
      AND ex.favorite_type = 'master'
      AND ex.master_id = m.id
  );
```

---

## 0.H. Разрешение коллизий (несколько indie_masters на один user_id)

**Если на один user_id > 1 indie_master:**

1. **Выбор каноничной записи:** оставляем одну — с минимальным `id` (самая старая) или с `domain IS NOT NULL` (приоритет).
2. **Остальные:** не связываем с master напрямую. Варианты:
   - **Архив:** пометить `is_archived=1` (если добавить колонку) и не проставлять master_id;
   - **Дедуп:** удалить дубликаты, перенеся ссылки (bookings, services, etc.) на каноничную запись — сложно и рискованно;
   - **Отложить:** оставить master_id=NULL, зафиксировать в миграции как ошибку, разобрать вручную.

3. **Рекомендация:** Выбрать каноничную по `ORDER BY (domain IS NOT NULL) DESC, id ASC`. Остальным временно не ставить master_id, логировать, разобрать до NOT NULL.

**Влияние на UNIQUE(indie_masters.master_id):**
- UNIQUE ставим **только после** дедупа/разрешения коллизий.
- Если дубли user_id есть — сначала разрешаем (одна запись на user_id получает master_id), затем добавляем UNIQUE.

---

## 0.I. Phased rollout (уточнение)

| Действие | Когда | Условие |
|----------|-------|---------|
| **Скрывать indie_master_id в bookings** | Этап 2 (Backend read-resolve) | Только при `MASTER_CANON_MODE=1`. При `MASTER_CANON_MODE=0` — старое поведение (отдаём оба поля). |
| **410 на GET /favorites/indie-masters** | Этап 5, **после** релиза mobile master-only | Не раньше. Пока mobile может вызывать indie-masters — эндпоинт возвращает данные. Переход: mobile релиз → затем 410. |

**Последовательность:**
1. Этапы 1–3: backend готов, но `MASTER_CANON_MODE=0` по умолчанию.
2. Этап 4: mobile master-only в релизе.
3. Этап 5: включаем `MASTER_CANON_MODE=1`, 410 на indie-masters.

---

## 0.J. Backfill: создание Master для IndieMaster

**Когда:** IndieMaster с `user_id` есть, Master с тем же `user_id` отсутствует.

### Обязательные поля masters

| Поле | Обязательность | Источник | При NULL/отсутствии |
|------|----------------|----------|---------------------|
| `user_id` | NOT NULL | `indie_master.user_id` | Не создаём Master (ошибка) |
| `can_work_independently` | default | True | True |
| `can_work_in_salon` | default | True | True |
| `bio` | nullable | `indie_master.bio` | NULL |
| `experience_years` | nullable | `indie_master.experience_years` | NULL |
| `domain` | unique, nullable | `indie_master.domain` | NULL (или сгенерировать `master-{user_id}-{ts}` если нужен) |
| `address` | nullable | `indie_master.address` | NULL |
| `city` | nullable | `indie_master.city` | NULL или 'Москва' |
| `timezone` | nullable | `indie_master.timezone` | 'Europe/Moscow' |
| `background_color` | default | — | '#ffffff' |
| `timezone_confirmed` | default | — | False |
| `created_at` | default | — | now() |

**Остальные поля:** NULL или default.

**Псевдо-SQL создания:**
```sql
INSERT INTO masters (user_id, can_work_independently, can_work_in_salon, bio, experience_years,
  domain, address, city, timezone, background_color, timezone_confirmed, created_at)
SELECT im.user_id, true, true, im.bio, im.experience_years,
  im.domain, im.address, COALESCE(im.city, 'Москва'), COALESCE(im.timezone, 'Europe/Moscow'),
  '#ffffff', false, datetime('now')
FROM indie_masters im
WHERE im.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
  AND NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id);
```

**Конфликт domain:** если `indie_master.domain` уже занят в masters — использовать NULL или `master-{user_id}`.

---

## 0.K. Чек-лист «Готово к Этапу 1»

- [ ] PRE-CHECKS выполнены, результаты зафиксированы
- [ ] Дубли `indie_masters.user_id`: 0 (или план разрешения по 0.H)
- [ ] Нарушения 1:1: 0
- [ ] IndieMaster без user_id: обработаны (исключены или user_id восстановлен)
- [ ] IndieMaster с user_id, но без User: 0 (или разобраны)
- [ ] IndieMaster без Master: план создания Master (0.J) согласован
- [ ] Статистика favorites зафиксирована
- [ ] Правило разрешения коллизий (0.H) согласовано
- [ ] Phased rollout (0.I) понятен
- [ ] Backfill Master creation (0.J) — поля и источники утверждены

---

## 1. Сканирование и инвентаризация

### 1.1. Инвентаризация: где упоминаются indie_master / favorite_type / endpoints

| Объект | Где используется | Файл / функция |
|--------|-------------------|----------------|
| **indie_master_id** (в booking) | Booking model, API response | `backend/models.py:279` (Booking), `backend/routers/client.py:177,304` (future/past), `backend/schemas.py:172,182,325,335,...` |
| **indie_master_id** (в favorite) | ClientFavorite model, API | `backend/models.py:1566`, `backend/routers/client.py:1746,1776,1966,2026,2081,2144,2213,2285,2291` |
| **indie_master** (таблица) | IndieMaster model, relationships | `backend/models.py:227-251`, Service.indie_master_id, Booking.indie_master_id, ClientFavorite.indie_master_id, ClientRestriction, ExpenseType, Expense, etc. |
| **favorite_type** | ClientFavorite, API | `backend/models.py:1561`, `backend/routers/client.py:1726,1736,1746,1756,1772,1776,1787,1940-1975,2013,2023,2054,2117,2200,2210,2252-2306` |
| **GET /favorites/masters** | Mobile, Frontend | `mobile/src/stores/favoritesStore.ts:55`, `mobile/src/services/api/favorites.ts:73`, `frontend/src/pages/ClientDashboard.jsx:224`, `frontend/src/pages/ClientFavorite.jsx:100` |
| **GET /favorites/indie-masters** | Mobile, Frontend | `mobile/src/stores/favoritesStore.ts:65`, `mobile/src/services/api/favorites.ts:89`, `frontend/src/pages/ClientDashboard.jsx:237`, `frontend/src/pages/ClientFavorite.jsx:109` |
| **DELETE /favorites/{type}/{id}** | Mobile, Frontend | `mobile/src/services/api/favorites.ts:148-151`, `frontend/src/components/FavoriteButton.jsx:193` |
| **Выбор типа из booking** | `master_id ? master : indie_master` | `mobile/src/utils/clientDashboard.ts:156-158` (getFavoriteKeyFromBooking), `frontend/src/pages/ClientDashboard.jsx:134,1124,1269,1874,2007` |

### 1.2. Карта данных (Data Flow)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ БД                                                                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ masters (id, user_id, ...)                                                       │
│ indie_masters (id, user_id, ...)  ← связь через user_id с Master                  │
│ bookings (master_id, indie_master_id, ...)  ← один из двух заполнен              │
│ client_favorites (favorite_type, master_id, indie_master_id)                     │
│ services (master_id, indie_master_id)  ← для indie: indie_master_id              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Backend API                                                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ GET /api/client/bookings/        → BookingFutureShort (master_id, indie_master_id)│
│ GET /api/client/bookings/past    → BookingPastShort (master_id, indie_master_id) │
│ GET /api/client/favorites/masters → [{favorite_type, master_id, master_name}]    │
│ GET /api/client/favorites/indie-masters → [{favorite_type, indie_master_id, ...}]│
│ POST /api/client/favorites       → body: favorite_type, master_id | indie_master_id│
│ DELETE /api/client/favorites/{type}/{id}                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Mobile                                                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│ favoritesStore: hydrateFavorites() → 2 запроса (masters + indie-masters)         │
│   → favoriteKeys = Set<"master:1" | "indie_master:5">                            │
│ getFavoriteKeyFromBooking(booking) → indie_master_id ? "indie_master:N" : "master:N"│
│ addContext = { type: 'master'|'indie_master', itemId, name }                      │
│ toggleFavoriteByKey(key, addContext) → add/remove по key                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ UI (BookingRowFuture, BookingRowPast, FavoriteCard)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ favKey = getFavoriteKeyFromBooking(booking)  ← приоритет indie_master_id над master_id│
│ isFavorite = favoriteKeys.has(favKey)                                             │
│ Коллизия: booking A (master_id=1) → "master:1", booking B (indie_master_id=1) →   │
│           "indie_master:1" — разные ключи при одном display name                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3. Точные файлы и функции

**Backend:**
| Файл | Строки/функции |
|------|----------------|
| `backend/models.py` | IndieMaster (227-251), Booking.indie_master_id (279), Service.indie_master_id (147), ClientFavorite (1554-1586), ClientRestriction.indie_master_id (1247), ExpenseType/Expense/ExpenseTemplate/Income/MissedRevenue.indie_master_id |
| `backend/schemas.py` | BookingFutureShort, BookingPastShort, ClientFavoriteCreate, ClientFavoriteOut — indie_master_id в ~15 схемах |
| `backend/routers/client.py` | get_future_bookings (71-195), get_past_bookings (197-323), add_to_favorites (1708-1810), remove_from_favorites (1926-1995), get_favorite_masters (2054-2112), get_favorite_indie_masters (2118-2172), get_favorites_check (2252-2310), dashboard/stats (1637-1666) |
| `backend/routers/master.py` | get_future_bookings_paginated (263: `Booking.indie_master_id == master.id` — потенциальный баг), _get_indie_master_id_for_restrictions (2754), ClientRestriction CRUD |
| `backend/routers/dev_e2e.py` | seed, reset — indie_master_ids, Booking.indie_master_id |
| `backend/routers/dev_testdata.py` | ensure_indie_master (488), create_indie_service (548) |
| `backend/routers/admin.py` | service.indie_master_id (1286) |

**Mobile:**
| Файл | Строки/функции |
|------|----------------|
| `mobile/src/utils/clientDashboard.ts` | getMasterKey (127), getFavoriteKeyFromBooking (129-139), getFavoriteKeyFromFavorite (146-152), getBookingTypeAndId (168-171), FavoriteType, parseFavoriteKey |
| `mobile/src/stores/favoritesStore.ts` | hydrateFavorites (55-69), toggleFavoriteByKey (86-158) |
| `mobile/src/services/api/favorites.ts` | addToFavorites (129-143), removeFromFavorites (148-155), getAllFavorites (73, 89), getFavoriteDisplayName, getFavoriteItemId |
| `mobile/src/components/client/BookingRowFuture.tsx` | favKey, addContext, isFavorite, useEffect log |
| `mobile/src/components/client/BookingRowPast.tsx` | то же |
| `mobile/src/components/client/FavoriteCard.tsx` | — (использует favKey извне) |
| `mobile/src/components/client/FavoriteButtonControlled.tsx` | — |
| `mobile/app/client/dashboard.tsx` | handleToggleFavorite, collision detection, FavoriteCard map |
| `mobile/app/client/bookings-future.tsx` | handleToggleFavorite |
| `mobile/app/client/bookings-past.tsx` | handleToggleFavorite |
| `mobile/src/services/api/bookings.ts` | Booking interface (indie_master_id) |

**Frontend (web):**
| Файл | Строки/функции |
|------|----------------|
| `frontend/src/pages/ClientDashboard.jsx` | fetch favorites (masters + indie-masters), type/itemId для FavoriteButton, indie_master_id в booking rows |
| `frontend/src/pages/ClientFavorite.jsx` | fetch masters + indie-masters |
| `frontend/src/components/FavoriteButton.jsx` | favorite_type, indie_master_id в body |
| `frontend/src/components/ClientDashboardStats.jsx` | indie_master_id в key |

### 1.4. Тестовые данные / seed

| Источник | Описание |
|----------|----------|
| `backend/scripts/reseed_local_test_data.py` | ensure_indie_master (280), create_indie_service (291), create_completed_bookings с owner_type indie_master (449, 577), indie_master_id в booking (393, 481, 611), indie_sanity (777-793) |
| `backend/routers/dev_testdata.py` | ensure_indie_master (488), create_indie_service (548) |
| `backend/routers/dev_e2e.py` | ensure_indie (278), IndieMasterSchedule, Booking.indie_master_id (330, 347, 361, 377, 390, 406) |

**Связь Master ↔ IndieMaster:** Один User может иметь и Master, и IndieMaster (оба с user_id). Master.id и IndieMaster.id — разные PK. Резолв: `IndieMaster.query.filter(user_id == Master.user_id).first()`.

### 1.5. Инвентаризация (автоматический скан)

**Backend: indie_master_id / favorite_type**

| Файл | Функция/endpoint | Что делает | Что менять |
|------|------------------|------------|------------|
| `models.py` | IndieMaster, Booking, Service, ClientFavorite, ClientRestriction, Expense* | FK, relationships | Добавить IndieMaster.master_id |
| `schemas.py` | BookingFutureShort, BookingPastShort, ClientFavorite* | Pydantic поля | Убрать indie_master_id из client response (или optional) |
| `routers/client.py` | get_future_bookings, get_past_bookings | Возврат master_id, indie_master_id | Read-resolve: всегда master_id |
| `routers/client.py` | add_to_favorites, remove_from_favorites | Обработка indie_master_id | Guard: только master |
| `routers/client.py` | get_favorite_indie_masters | GET /favorites/indie-masters | 410 Gone |
| `routers/client.py` | dashboard/stats | top_indie_masters | Резолв в master или объединение |
| `routers/master.py` | get_future_bookings_paginated | `Booking.indie_master_id == master.id` | Исправить: использовать indie_master.id по user_id |
| `routers/master.py` | _get_indie_master_id_for_restrictions | ClientRestriction по indie_master_id | Оставить (внутренняя логика) |
| `routers/dev_testdata.py` | ensure_indie_master, create_indie_service | Seed | Установить master_id при создании |
| `routers/dev_e2e.py` | seed, reset | E2E данные | Обновить под master_id |
| `scripts/reseed_local_test_data.py` | ensure_indie_master, create_completed_bookings | Reseed | Обновить |

**Backend: favorite_type='indie_master' / /favorites/indie-masters**

| Файл | Строки | Действие |
|------|--------|----------|
| `client.py` | 1746, 1776, 1960-1966, 2026, 2081, 2118-2170, 2144, 2213, 2285-2291 | Резолв, 410, guards |

**Mobile: indie_master_id, favKey "indie_master:*", hydrate indie-masters**

| Файл | Компонент/store | Что делает | Что менять |
|------|----------------|------------|------------|
| `favoritesStore.ts` | hydrateFavorites | GET indie-masters, маппинг type | Убрать запрос, только masters |
| `favoritesStore.ts` | toggleFavoriteByKey | REMOVE по indie_master | Только master |
| `favorites.ts` | getAllFavorites, addToFavorites, removeFromFavorites | indie-masters, body | Только master |
| `clientDashboard.ts` | getFavoriteKeyFromBooking | indie_master_id → "indie_master:N" | Только master_id → "master:N" |
| `clientDashboard.ts` | getFavoriteKeyFromFavorite | type indie_master | Только master_id |
| `BookingRowFuture.tsx` | addContext | type: master \| indie_master | Только master |
| `BookingRowPast.tsx` | addContext | То же | То же |
| `dashboard.tsx` | handleToggleFavorite, FavoriteCard map | addContext, fav.master_id \| indie_master_id | Только master |
| `bookings-future.tsx` | handleToggleFavorite | addContext | Только master |
| `bookings-past.tsx` | handleToggleFavorite | addContext | Только master |
| `bookings.ts` | Booking interface | indie_master_id | Оставить optional, не использовать в favKey |
| `AllBookingsModal.tsx` | favoriteItemId | indie_master_id \|\| master_id | Только master_id |
| `app/bookings/index.tsx` | favoriteItemId | То же | То же |
| `favorites.test.ts` | Mock indie-masters | Тесты | Обновить/удалить |

---

## 2. Целевая модель (Target State)

### 2.1. Booking в API

| Поле | Текущее | Целевое |
|------|---------|---------|
| master_id | Optional, для salon/indie | **Обязателен** (всегда заполнен) |
| indie_master_id | Optional, для indie | **Убрать из контракта** (не возвращать клиенту) |
| master_name | Из master.user или indie_master.user | master_name (источник — резолв через master_id) |
| salon_id | Optional | Optional (nullable) |

**Резолв:** Для записей с `indie_master_id` backend при отдаче клиенту подставляет `master_id` через связь `IndieMaster.user_id → Master.user_id` (или через будущую колонку `indie_masters.master_id`).

### 2.2. Favorites

| Элемент | Текущее | Целевое |
|---------|---------|---------|
| Эндпоинты | /masters, /indie-masters | Один: /masters (все избранные мастера) |
| favorite_type | master, indie_master | Только master (или deprecated, не используется в рантайме) |
| favKey | "master:N" \| "indie_master:N" | Только "master:N" |
| ClientFavorite в БД | favorite_type + master_id \| indie_master_id | Миграция: indie_master → master_id через резолв |

### 2.3. Сущности на бэке после миграции

| Сущность | Действие |
|----------|----------|
| **masters** | Основная таблица. Остаётся. |
| **indie_masters** | Вариант A: **alias/bridge** — оставить таблицу, добавить `master_id` (FK на masters), все API/сервисы резолвят в master_id. Либо Вариант B: слияние данных + remap. |
| **bookings** | Поле `indie_master_id` — nullable, но API всегда отдаёт `master_id`. Внутренняя логика может использовать оба для обратной совместимости. |
| **client_favorites** | Записи с favorite_type='indie_master' мигрировать: установить master_id через IndieMaster→Master, favorite_type='master'. |

---

## 3. План миграции по шагам

### 3.1. Backend: выбор пути

**Рекомендация: Вариант 2 — Alias/Bridge**

| Критерий | Вариант 1 (слияние) | Вариант 2 (alias/bridge) |
|----------|---------------------|--------------------------|
| Риск | Высокий: перенос данных, переписывание FK | Средний: добавляем колонку, резолв на уровне сервисов |
| Объём работ | Большой: миграция всех таблиц с indie_master_id | Умеренный: одна миграция + изменения в роутах |
| Откат | Сложный | Проще: откат резолва |
| Совместимость | Нужно обновить все ссылки сразу | Поэтапно: сначала резолв в API, потом mobile |

**Почему alias/bridge:**
1. IndieMaster и Master связаны через user_id. Добавить `indie_masters.master_id` (FK на masters) и заполнить из `Master.query.filter(user_id=indie.user_id).first()`.
2. Все API, отдающие booking/favorite клиенту, подставляют `master_id` (если пришёл indie_master_id — резолв через indie_masters.master_id).
3. Внутренняя логика (ClientRestriction, Expense и т.д.) может временно оставаться на indie_master_id; критично только клиентский контракт.
4. Контролируемый риск: можно включить резолв за флагом, протестировать, затем выключить старые поля.

### 3.2. Alembic-миграции

| Миграция | Описание |
|----------|----------|
| **1. Добавить indie_masters.master_id** | `ALTER TABLE indie_masters ADD COLUMN master_id INTEGER REFERENCES masters(id)`; заполнить из `Master.id WHERE Master.user_id = IndieMaster.user_id`. |
| **2. Миграция client_favorites** | Для записей с `favorite_type='indie_master'`: установить `master_id` из `IndieMaster.master_id`, `favorite_type='master'`, `indie_master_id=NULL` (или оставить для аудита). Уникальность: `unique_master_favorite` по (client_id, master_id). |
| **3. (Опционально) Индексы** | Индекс на `indie_masters.master_id` для быстрого резолва. |

**Уточнить перед миграцией:**
- Есть ли IndieMaster без соответствующего Master (user_id без Master)?
- Есть ли дубли (один master_id — несколько indie_masters)?

### 3.3. Mobile: конкретные изменения

| Файл | Изменение |
|------|-----------|
| `mobile/src/utils/clientDashboard.ts` | `getFavoriteKeyFromBooking`: всегда `master_id` → `"master:"+id`. Убрать ветку `indie_master_id`. `FavoriteType` = только `'master'`. `getFavoriteKeyFromFavorite`: только master_id. |
| `mobile/src/stores/favoritesStore.ts` | `hydrateFavorites`: один запрос `GET /api/client/favorites/masters`. Убрать запрос indie-masters. `toggleFavoriteByKey`: только master, убрать indie_master. |
| `mobile/src/services/api/favorites.ts` | Убрать `getAllFavorites` вызов indie-masters. `addToFavorites`: только type='master', body.master_id. `removeFromFavorites`: только type='master'. Убрать indie_master из типов. |
| `mobile/src/components/client/BookingRowFuture.tsx` | `addContext`: только `{ type: 'master', itemId: master_id, name }`. Убрать `indie_master` из типов. |
| `mobile/src/components/client/BookingRowPast.tsx` | То же. |
| `mobile/app/client/dashboard.tsx` | `handleToggleFavorite`: addContext только master. FavoriteCard map: только master_id. Collision detection: убрать или упростить (коллизий не будет). |
| `mobile/app/client/bookings-future.tsx` | handleToggleFavorite — addContext master only. |
| `mobile/app/client/bookings-past.tsx` | То же. |
| `mobile/src/services/api/bookings.ts` | Booking: `indie_master_id` оставить в интерфейсе как optional (для обратной совместимости), но не использовать в favKey. |

### 3.4. Совместимость API на переходный период

| Элемент | Действие |
|---------|----------|
| `GET /favorites/indie-masters` | Deprecated. Возвращать пустой массив или 410 Gone. Либо оставить до cutover, затем убрать. |
| `POST /favorites` с `indie_master_id` | Принимать, но резолвить в master_id и сохранять как master. Пометить deprecated. |
| `DELETE /favorites/indie_master/{id}` | Резолвить indie_master_id→master_id, удалять по master_id. Deprecated. |
| Поле `indie_master_id` в booking response | Вариант 1: перестать отдавать. Вариант 2: оставить для отладки, deprecated. |
| **Cutover** | Mobile перестаёт вызывать `/indie-masters` и использовать indie_master в addContext. Backend продолжает принимать старые запросы с резолвом. |

---

## 4. Риски и проверки ДО начала

### 4.1. Риски

| Риск | Описание | Митигация |
|------|----------|-----------|
| Совпадение имён | Разные мастера с одинаковым master_name | Не связано с миграцией; collision по favKey исчезнет. |
| IndieMaster без Master | user_id есть в IndieMaster, нет в Master | Проверка перед миграцией: `SELECT * FROM indie_masters im WHERE NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)`. |
| Дубли master_id | Несколько IndieMaster на одного Master | Обычно 1:1. Проверка: `SELECT master_id, COUNT(*) FROM indie_masters GROUP BY master_id HAVING COUNT(*)>1`. |
| Ссылки в bookings | booking.indie_master_id без master_id | Текущая модель допускает. Резолв: при отдаче подставлять master_id. |
| Favorites в БД | client_favorites с indie_master_id | Миграция в отдельном шаге с проверкой уникальности. |
| Seed / E2E | reseed, dev_e2e создают indie_master | Обновить seed: создавать master_id, при необходимости оба. |

### 4.2. Метрики/логи для контроля (план, не внедрять)

1. **Лог резолва:** при отдаче booking с indie_master_id — логировать `resolved master_id=X from indie_master_id=Y`.
2. **Счётчик миграции favorites:** сколько записей client_favorites переведено из indie_master в master.
3. **Лог deprecated:** вызовы GET /favorites/indie-masters, POST с indie_master_id.
4. **Метрика коллизий:** [FAV][collision] до и после — должно стать 0.
5. **Проверка целостности:** после миграции — все client_favorites с favorite_type='master' и непустым master_id.

### 4.3. Чек-лист готовности

- [ ] Выгружена структура: `indie_masters`, `masters`, `bookings`, `client_favorites` — количество записей, наличие user_id/master_id.
- [ ] Проверка: нет IndieMaster без Master.
- [ ] Проверка: нет дублей master_id в indie_masters (если добавляем колонку).
- [ ] Решение по судьбе GET /favorites/indie-masters (deprecated vs удаление).
- [ ] Согласован порядок деплоя: backend (резолв) → mobile (переход на master only).

---

## 5. Тест-план после изменений

### Acceptance

| Сценарий | Ожидание |
|----------|----------|
| Add favorite на booking (master_id) | Сердце заполнено, favKey=master:N |
| Add favorite на booking (бывший indie_master_id, теперь master_id) | Сердце заполнено, favKey=master:N |
| Remove favorite | Сердце пустое, ключ удалён из Set |
| Синхронизация future/past/favorites | Одинаковый master_id → одно сердце во всех строках |
| [FAV][collision] | Не появляется для master_name (все ключи master:N) |
| Bookings future/past | Корректные данные, без потерь |
| Пустые поля | master_id=null — favKey=null, сердце не показывается |
| Старые записи | Booking с indie_master_id — backend отдаёт master_id (резолв) |
| 404/405 | Нет при корректных запросах |

### Регрессии

- ClientRestriction, Expense и др. — работают (внутренняя логика на indie_master_id может остаться).
- Seed, E2E — проходят после обновления.

---

## Таблицы

### Inventory (объект → где используется → файл/функция)

| Объект | Использование | Файл:функция |
|--------|---------------|--------------|
| indie_master_id (Booking) | API response | client.py:177,304 |
| indie_master_id (ClientFavorite) | CRUD, list | client.py:1746,1776,1966,2026,2081,2144,2213,2285,2291 |
| favorite_type | ADD, DELETE, list | client.py:1726-2306 |
| getFavoriteKeyFromBooking | favKey для UI | clientDashboard.ts:129-139 |
| hydrateFavorites | 2 запроса | favoritesStore.ts:55,65 |
| addContext.type | toggle | BookingRow*.tsx, dashboard.tsx |

### API Contracts: Current vs Target

| Контракт | Current | Target |
|----------|---------|--------|
| Booking response | master_id?, indie_master_id? | master_id (обязателен), indie_master_id не отдавать |
| GET /favorites/masters | Список master favorites | Без изменений |
| GET /favorites/indie-masters | Список indie favorites | Deprecated / пустой |
| favKey | "master:N" \| "indie_master:N" | Только "master:N" |
| addContext | type: master \| indie_master | type: master |

### Migration Steps (Backend/Mobile)

| Шаг | Backend | Mobile |
|-----|---------|--------|
| 1 | Добавить indie_masters.master_id, заполнить | — |
| 2 | Резолв в API: booking/favorite отдавать master_id | — |
| 3 | Миграция client_favorites indie→master | — |
| 4 | Deprecated /favorites/indie-masters | Убрать вызов indie-masters |
| 5 | — | favKey только master, addContext только master |
| 6 | — | Один запрос hydrate, убрать indie ветки |

---

## Summary: ключевые решения

1. **Стабильный ключ — user_id.** Сопоставление IndieMaster↔Master только по `user_id`. Никаких матчей по имени.
2. **IndieMaster без Master:** создаём Master для каждого такого IndieMaster, затем проставляем `master_id`.
3. **1:1 constraint:** UNIQUE(`indie_masters.master_id`) — один master, один indie_master.
4. **API:** после cutover не отдаём `indie_master_id` в bookings (или только под DEBUG). Favorites — только master.
5. **Feature-flag:** `MASTER_CANON_MODE=0|1` для обратимости.
6. **Deprecated:** GET /favorites/indie-masters → 410 Gone после mobile cutover.
7. **Guard:** POST /favorites с `favorite_type != 'master'` → 400.

---

## Риски и как их ловим

| Риск | Как ловим |
|------|-----------|
| IndieMaster без Master | Pre-check: `SELECT * FROM indie_masters im WHERE NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)`. Backfill: создаём Master. |
| Дубли master_id в indie_masters | UNIQUE constraint. Pre-check: `SELECT master_id, COUNT(*) FROM indie_masters GROUP BY master_id HAVING COUNT(*)>1`. |
| Дубли в favorites после миграции | Дедуп в миграции: удаляем indie-запись, если уже есть master-запись на того же master_id. |
| Регрессия ClientRestriction/Expense | Внутренняя логика остаётся на indie_master_id (FK). Не трогаем. |
| Mobile на старой версии после backend cutover | Backend: MASTER_CANON_MODE=0 сохраняет старое поведение до деплоя mobile. |
| Откат | `alembic downgrade` + MASTER_CANON_MODE=0. |

---

## Точный порядок изменений (этапы 1..N)

| # | Этап | Deliverables |
|---|------|--------------|
| 1 | **Bridge + Backfill** | Alembic migration: `indie_masters.master_id` NOT NULL, UNIQUE, backfill по user_id |
| 2 | **Backend read-resolve** | client router: bookings всегда с master_id, без indie_master_id в response |
| 3 | **Favorites migration + dedup** | Alembic migration: client_favorites indie→master, дедуп |
| 4 | **Mobile master-only** | favKey только master:N, один hydrate, убрать indie ветки |
| 5 | **Disable/deprecate** | 410 на /indie-masters, 400 на POST не-master, MASTER_CANON_MODE |
| 6 | **Cleanup** | Seed/E2E, docs, убрать debug-логи |

---

## Что сделать первым (чек-лист)

1. [ ] Выгрузить данные: `indie_masters`, `bookings.indie_master_id`, `client_favorites` с `favorite_type='indie_master'`
2. [ ] Pre-check: нет IndieMaster без Master (или план создания Master)
3. [ ] Pre-check: нет дублей master_id (если 1:1)
4. [ ] Этап 1: Bridge + Backfill
5. [ ] Этап 2: Backend read-resolve
6. [ ] Этап 3: Favorites migration
7. [ ] Этап 4: Mobile master-only
8. [ ] Этап 5: Deprecate + guards

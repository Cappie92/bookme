# LOYALTY UNIFICATION AUDIT

**Дата:** 2026-01-21  
**Цель:** Зафиксировать текущее состояние WEB и MOBILE после Stage 1.x, Stage 2 + bugfix useMasterSubscription

---

## Executive Summary

После всех правок Stage 1.1 (Mobile Discounts Parity), Stage 2 (WEB "Баллы" parity) и bugfix useMasterSubscription:

- **WEB:** Полная реализация "Скидки" (Быстрые/Сложные/Персональные) + "Баллы" (Настройки/Статистика/История). Auth-gating и обработка ошибок добавлены.
- **MOBILE:** Полная реализация "Скидки" (1:1 с WEB) + "Баллы" (Настройки/Статистика/История). Auth-gating и обработка ошибок реализованы.
- **Проблемы:** 
  - WEB "Скидки" не имеет auth-gating (запросы могут уходить без токена) — **P0 блокер**
  - MOBILE "История" не имеет фильтров/пагинации (только `limit: 50` без UI) — **P1 блокер**
  - WEB "Скидки" не обрабатывает 401 с очисткой токена — **P1**
- **Вердикт:** **NOT READY** — требуется добавить auth-gating в WEB LoyaltySystem и фильтры/пагинацию в MOBILE History.

---

## A) WEB — Инвентаризация

### 1. Entrypoint

**Роут:** `/master?tab=loyalty`  
**Файл:** `frontend/src/pages/MasterDashboard.jsx:1985-1991`  
**Компонент:** `LoyaltySystem.jsx` (импортирован как `MasterLoyalty`)

```javascript
{activeTab === 'loyalty' && hasLoyaltyAccess && (
  <MasterLoyalty 
    getAuthHeaders={() => ({...})} 
    hasLoyaltyAccess={hasLoyaltyAccess} 
  />
)}
```

### 2. UI Структура

| Уровень | Табы | Дефолт | Файл/Компонент |
|---------|------|--------|----------------|
| **Верхние табы** | Скидки / Баллы | `'discounts'` | `LoyaltySystem.jsx:9` |
| **Скидки → подтабы** | Быстрые / Сложные / Персональные | `'quick'` | `LoyaltySystem.jsx:11` |
| **Баллы → подтабы** | Настройки / Статистика / История | `'settings'` | `MasterLoyalty.jsx:9` |

**Компоненты:**
- **Скидки:** Встроены в `LoyaltySystem.jsx` (строки 423-463)
- **Баллы:** Отдельные компоненты:
  - `MasterLoyalty.jsx` — Настройки
  - `MasterLoyaltyStats.jsx` — Статистика
  - `MasterLoyaltyHistory.jsx` — История

### 3. Функционал по разделам

#### A.1 Скидки → Быстрые

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Список** | ✅ OK | `LoyaltySystem.jsx:423-440` | Показывает шаблоны + активные скидки |
| **Создать** | ✅ OK | `LoyaltySystem.jsx:179-205` | POST `/api/loyalty/quick-discounts` |
| **Редактировать** | ✅ OK | `LoyaltySystem.jsx:251-277` | PUT `/api/loyalty/quick-discounts/{id}` (inline) |
| **Активировать/деактивировать** | ✅ OK | `LoyaltySystem.jsx:251-277` | Toggle `is_active` через PUT |
| **Удалить** | ✅ OK | `LoyaltySystem.jsx:251-277` | DELETE `/api/loyalty/quick-discounts/{id}` |

#### A.2 Скидки → Сложные

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Список** | ✅ OK | `LoyaltySystem.jsx:441-452` | Показывает активные сложные скидки |
| **Создать** | ✅ OK | `LoyaltySystem.jsx:278-321` | POST `/api/loyalty/complex-discounts` (форма) |
| **Редактировать** | ❌ Missing | — | Нет PUT `/api/loyalty/complex-discounts/{id}` |
| **Активировать/деактивировать** | ❌ Missing | — | Нет toggle `is_active` |
| **Удалить** | ✅ OK | `LoyaltySystem.jsx:322-344` | DELETE `/api/loyalty/complex-discounts/{id}` |

#### A.3 Скидки → Персональные

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Список** | ✅ OK | `LoyaltySystem.jsx:453-463` | Показывает персональные скидки |
| **Создать** | ✅ OK | `LoyaltySystem.jsx:225-250` | POST `/api/loyalty/personal-discounts` |
| **Редактировать** | ❌ Missing | — | Нет PUT `/api/loyalty/personal-discounts/{id}` |
| **Активировать/деактивировать** | ❌ Missing | — | Нет toggle `is_active` |
| **Удалить** | ✅ OK | `LoyaltySystem.jsx:251-277` | DELETE `/api/loyalty/personal-discounts/{id}` |

#### A.4 Баллы → Настройки

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Просмотр** | ✅ OK | `MasterLoyalty.jsx:225-252` | Форма с полями: `is_enabled`, `accrual_percent`, `max_payment_percent`, `points_lifetime_days` |
| **Сохранение** | ✅ OK | `MasterLoyalty.jsx:37-66` | PUT `/api/master/loyalty/settings` |
| **Валидация** | ✅ OK | `MasterLoyalty.jsx:44-55` | Проверка 1-100 для процентов |

#### A.5 Баллы → Статистика

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Просмотр** | ✅ OK | `MasterLoyaltyStats.jsx:63-121` | 4 карточки: выдано/списано/баланс/активных клиентов |

#### A.6 Баллы → История

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Список** | ✅ OK | `MasterLoyaltyHistory.jsx:177-250` | Таблица транзакций |
| **Фильтры** | ✅ OK | `MasterLoyaltyHistory.jsx:99-175` | `client_id`, `transaction_type`, `start_date`, `end_date` |
| **Пагинация** | ✅ OK | `MasterLoyaltyHistory.jsx:252-275` | `skip`/`limit` (50), кнопки "Назад"/"Вперед" |

### 4. API Вызовы

| Endpoint | Method | Где вызывается | Когда | Файл/Строка |
|----------|--------|---------------|-------|--------------|
| `/api/loyalty/templates` | GET | `loadData()` | `useEffect([hasLoyaltyAccess])` | `LoyaltySystem.jsx:56` |
| `/api/loyalty/status` | GET | `loadData()` | `useEffect([hasLoyaltyAccess])` | `LoyaltySystem.jsx:77` |
| `/api/loyalty/quick-discounts` | POST | `handleCreateQuickDiscount()` | При создании быстрой скидки | `LoyaltySystem.jsx:179` |
| `/api/loyalty/quick-discounts/{id}` | PUT | `handleUpdateQuickDiscount()` | При редактировании | `LoyaltySystem.jsx:206` |
| `/api/loyalty/quick-discounts/{id}` | DELETE | `handleDeleteQuickDiscount()` | При удалении | `LoyaltySystem.jsx:251` |
| `/api/loyalty/complex-discounts` | POST | `handleCreateComplexDiscount()` | При создании сложной скидки | `LoyaltySystem.jsx:278` |
| `/api/loyalty/complex-discounts/{id}` | DELETE | `handleDeleteComplexDiscount()` | При удалении | `LoyaltySystem.jsx:322` |
| `/api/loyalty/personal-discounts` | POST | `handleCreatePersonalDiscount()` | При создании персональной скидки | `LoyaltySystem.jsx:225` |
| `/api/loyalty/personal-discounts/{id}` | DELETE | `handleDeletePersonalDiscount()` | При удалении | `LoyaltySystem.jsx:251` |
| `/api/master/loyalty/settings` | GET | `loadSettings()` | `useEffect([authLoading, isAuthenticated])` | `MasterLoyalty.jsx:37` |
| `/api/master/loyalty/settings` | PUT | `handleSave()` | При сохранении настроек | `MasterLoyalty.jsx:57` |
| `/api/master/loyalty/stats` | GET | `loadStats()` | `useEffect([authLoading, isAuthenticated])` | `MasterLoyaltyStats.jsx:32` |
| `/api/master/loyalty/history` | GET | `loadHistory()` | `useEffect([authLoading, isAuthenticated, skip, filters...])` | `MasterLoyaltyHistory.jsx:44` |

### 5. Auth Gating

| Компонент | Статус | Проверка | Файл/Строка |
|-----------|--------|----------|-------------|
| **LoyaltySystem** | ❌ Missing | Нет проверки токена перед запросами | `LoyaltySystem.jsx:32-45` — только `hasLoyaltyAccess` |
| **MasterLoyalty** | ✅ OK | `useAuth()` + проверка `authLoading`/`isAuthenticated` | `MasterLoyalty.jsx:17-24` |
| **MasterLoyaltyStats** | ✅ OK | `useAuth()` + проверка `authLoading`/`isAuthenticated` | `MasterLoyaltyStats.jsx:12-19` |
| **MasterLoyaltyHistory** | ✅ OK | `useAuth()` + проверка `authLoading`/`isAuthenticated` | `MasterLoyaltyHistory.jsx:23-30` |
| **useMasterSubscription** | ✅ OK | `useAuth()` + проверка `authLoading`/`isAuthenticated` | `useMasterSubscription.js:11-27` |

**Проблема:** `LoyaltySystem.jsx` делает запросы в `useEffect([hasLoyaltyAccess])` без проверки токена. Если компонент смонтируется без токена, запросы всё равно уйдут (с пустым Authorization header).

### 6. Обработка ошибок

| Статус | Компонент | Обработка | Файл/Строка |
|--------|-----------|-----------|-------------|
| **401** | MasterLoyalty | ✅ Очистка токенов + redirect `/login` | `MasterLoyalty.jsx:48-56` |
| **401** | MasterLoyaltyStats | ✅ Очистка токенов + redirect `/login` | `MasterLoyaltyStats.jsx:43-51` |
| **401** | MasterLoyaltyHistory | ✅ Очистка токенов + redirect `/login` | `MasterLoyaltyHistory.jsx:62-70` |
| **403** | Все компоненты | ✅ Жёлтый блок + CTA "Обновить подписку" | `MasterLoyalty.jsx:72-74`, `MasterLoyaltyStats.jsx:67-69`, `MasterLoyaltyHistory.jsx:86-88` |
| **409 SCHEMA_OUTDATED** | Все компоненты | ✅ Жёлтый warning блок с hint | `MasterLoyalty.jsx:59-63`, `MasterLoyaltyStats.jsx:54-58`, `MasterLoyaltyHistory.jsx:73-77` |
| **404** | Все компоненты | ✅ Красный error блок | `MasterLoyalty.jsx:66-69`, `MasterLoyaltyStats.jsx:61-64`, `MasterLoyaltyHistory.jsx:80-83` |
| **401/403/409/404** | LoyaltySystem | ⚠️ Partial (403/409/404 есть, но нет 401 с очисткой токена) | `LoyaltySystem.jsx:88-120` — обрабатывает 404/403/409, но не 401 (нет очистки токена при 401) |

---

## B) MOBILE — Инвентаризация

### 1. Entrypoint

**Роут:** `/master/loyalty` (Expo Router)  
**Файл:** `mobile/app/master/loyalty.tsx`  
**Компонент:** `MasterLoyaltyScreen`

### 2. UI Структура

| Уровень | Табы | Дефолт | Файл/Строка |
|---------|------|--------|-------------|
| **Верхние табы** | Скидки / Баллы | `'discounts'` | `loyalty.tsx:64` |
| **Скидки → подтабы** | Быстрые / Сложные / Персональные | `'quick'` | `loyalty.tsx:67` |
| **Баллы → подтабы** | Настройки / Статистика / История | `'settings'` | `loyalty.tsx:70` |

**Компоненты:**
- **Скидки:** Отдельные компоненты:
  - `DiscountsQuickTab.tsx`
  - `DiscountsComplexTab.tsx`
  - `DiscountsPersonalTab.tsx`
- **Баллы:** Встроены в `loyalty.tsx` (строки 743-949)

### 3. Функционал по разделам

#### B.1 Скидки → Быстрые

| Операция | Статус | Файл/Компонент | Примечание |
|----------|--------|----------------|------------|
| **Список** | ✅ OK | `DiscountsQuickTab.tsx` | Показывает шаблоны + активные скидки |
| **Создать** | ✅ OK | `loyalty.tsx:350-375` | POST `/api/loyalty/quick-discounts` |
| **Редактировать** | ✅ OK | `loyalty.tsx:377-401` | PUT `/api/loyalty/quick-discounts/{id}` (inline) |
| **Активировать/деактивировать** | ✅ OK | `loyalty.tsx:377-401` | Toggle `is_active` через PUT |
| **Удалить** | ✅ OK | `loyalty.tsx:403-425` | DELETE `/api/loyalty/quick-discounts/{id}` |

#### B.2 Скидки → Сложные

| Операция | Статус | Файл/Компонент | Примечание |
|----------|--------|----------------|------------|
| **Список** | ✅ OK | `DiscountsComplexTab.tsx` | Показывает активные сложные скидки |
| **Создать** | ✅ OK | `loyalty.tsx:427-453` | POST `/api/loyalty/complex-discounts` (форма) |
| **Редактировать** | ✅ OK | `loyalty_discounts.ts:124-133` | PUT `/api/loyalty/complex-discounts/{id}` (API есть, UI нет) |
| **Активировать/деактивировать** | ❌ Missing | — | Нет toggle `is_active` в UI |
| **Удалить** | ✅ OK | `loyalty.tsx:403-425` | DELETE `/api/loyalty/complex-discounts/{id}` |

#### B.3 Скидки → Персональные

| Операция | Статус | Файл/Компонент | Примечание |
|----------|--------|----------------|------------|
| **Список** | ✅ OK | `DiscountsPersonalTab.tsx` | Показывает персональные скидки |
| **Создать** | ✅ OK | `loyalty.tsx:455-478` | POST `/api/loyalty/personal-discounts` |
| **Редактировать** | ✅ OK | `loyalty_discounts.ts:147-156` | PUT `/api/loyalty/personal-discounts/{id}` (API есть, UI нет) |
| **Активировать/деактивировать** | ❌ Missing | — | Нет toggle `is_active` в UI |
| **Удалить** | ✅ OK | `loyalty.tsx:403-425` | DELETE `/api/loyalty/personal-discounts/{id}` |

#### B.4 Баллы → Настройки

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Просмотр** | ✅ OK | `loyalty.tsx:756-840` | Форма с полями: `is_enabled`, `accrual_percent`, `max_payment_percent`, `points_lifetime_days` |
| **Сохранение** | ✅ OK | `loyalty.tsx:492-540` | PUT `/api/master/loyalty/settings` |
| **Валидация** | ✅ OK | `loyalty.tsx:495-503` | Проверка 1-100 для процентов |

#### B.5 Баллы → Статистика

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Просмотр** | ✅ OK | `loyalty.tsx:844-885` | 4 карточки: выдано/списано/баланс/активных клиентов |

#### B.6 Баллы → История

| Операция | Статус | Файл/Строка | Примечание |
|----------|--------|-------------|------------|
| **Список** | ✅ OK | `loyalty.tsx:887-949` | Список транзакций (Card) |
| **Фильтры** | ❌ Missing | — | Нет фильтров (client_id, transaction_type, dates) |
| **Пагинация** | ❌ Missing | — | Нет skip/limit, только `limit: 50` в запросе |

### 4. API Вызовы

| Endpoint | Method | Где вызывается | Когда | Файл/Строка |
|----------|--------|---------------|-------|--------------|
| `/api/loyalty/templates` | GET | `loadDiscounts()` | `useEffect([mainTab, hasLoyaltyAccess, authLoading, token, isAuthenticated])` | `loyalty.tsx:150` |
| `/api/loyalty/status` | GET | `loadDiscounts()` | `useEffect([mainTab, hasLoyaltyAccess, authLoading, token, isAuthenticated])` | `loyalty.tsx:150` |
| `/api/loyalty/quick-discounts` | POST | `handleCreateQuickDiscount()` | При создании быстрой скидки | `loyalty.tsx:350` |
| `/api/loyalty/quick-discounts/{id}` | PUT | `handleUpdateQuickDiscount()` | При редактировании | `loyalty.tsx:377` |
| `/api/loyalty/quick-discounts/{id}` | DELETE | `handleDeleteDiscount()` | При удалении | `loyalty.tsx:403` |
| `/api/loyalty/complex-discounts` | POST | `handleCreateComplexDiscount()` | При создании сложной скидки | `loyalty.tsx:427` |
| `/api/loyalty/complex-discounts/{id}` | DELETE | `handleDeleteDiscount()` | При удалении | `loyalty.tsx:403` |
| `/api/loyalty/personal-discounts` | POST | `handleCreatePersonalDiscount()` | При создании персональной скидки | `loyalty.tsx:455` |
| `/api/loyalty/personal-discounts/{id}` | DELETE | `handleDeleteDiscount()` | При удалении | `loyalty.tsx:403` |
| `/api/master/loyalty/settings` | GET | `loadSettings()` | `useEffect([featuresLoading, hasLoyaltyAccess, mainTab, token, isAuthenticated])` | `loyalty.tsx:244` |
| `/api/master/loyalty/settings` | PUT | `handleSave()` | При сохранении настроек | `loyalty.tsx:518` |
| `/api/master/loyalty/stats` | GET | `loadStats()` | `useEffect([pointsTab, hasLoyaltyAccess, token, isAuthenticated])` | `loyalty.tsx:274` |
| `/api/master/loyalty/history` | GET | `loadHistory()` | `useEffect([pointsTab, hasLoyaltyAccess, token, isAuthenticated])` | `loyalty.tsx:298` |

### 5. Auth Gating

| Компонент | Статус | Проверка | Файл/Строка |
|-----------|--------|----------|-------------|
| **MasterLoyaltyScreen (Скидки)** | ✅ OK | `!authLoading && token && isAuthenticated` | `loyalty.tsx:227` |
| **MasterLoyaltyScreen (Баллы)** | ✅ OK | `!authLoading && token && isAuthenticated` | `loyalty.tsx:235, 268, 292` |
| **useMasterFeatures** | ✅ OK | Проверка токена в API client | `useMasterFeatures.ts` |

**Статус:** ✅ Все запросы защищены проверкой `authLoading`/`token`/`isAuthenticated`.

### 6. Обработка ошибок

| Статус | Компонент | Обработка | Файл/Строка |
|--------|-----------|-----------|-------------|
| **401** | Все компоненты | ✅ Очистка токенов (через axios interceptor) | `api/client.ts` |
| **403** | Все компоненты | ✅ Locked state + CTA "Управление подпиской" | `loyalty.tsx:644-655` |
| **409 SCHEMA_OUTDATED** | Скидки | ✅ Жёлтый warning блок с hint | `loyalty.tsx:176-181` |
| **404** | Скидки | ✅ Error блок | `loyalty.tsx:184-190` |
| **401/403/409/404** | Баллы | ✅ Частично (через Alert.alert) | `loyalty.tsx:529-536` |

---

## C) Сравнение WEB vs MOBILE

| Раздел | Подраздел | WEB | MOBILE | Блокер? | Что сделать |
|--------|-----------|-----|--------|---------|-------------|
| **Скидки** | Быстрые | ✅ OK (CRUD + toggle) | ✅ OK (CRUD + toggle) | ❌ No | — |
| **Скидки** | Сложные | ⚠️ Partial (нет редактирования) | ⚠️ Partial (нет редактирования в UI, API есть) | ❌ No | Добавить редактирование в UI (опционально) |
| **Скидки** | Персональные | ⚠️ Partial (нет редактирования) | ⚠️ Partial (нет редактирования в UI, API есть) | ❌ No | Добавить редактирование в UI (опционально) |
| **Скидки** | Auth-gating | ❌ Missing | ✅ OK | ✅ **Yes (P0)** | Добавить `useAuth()` в `LoyaltySystem.jsx` (строка 32-45) |
| **Скидки** | Обработка ошибок | ⚠️ Partial (нет 401 с очисткой токена) | ✅ OK | ❌ No | Добавить 401 с очисткой токена в WEB (P1) |
| **Баллы** | Настройки | ✅ OK (полная форма) | ✅ OK (полная форма) | ❌ No | — |
| **Баллы** | Статистика | ✅ OK (4 карточки) | ✅ OK (4 карточки) | ❌ No | — |
| **Баллы** | История | ✅ OK (фильтры + пагинация) | ⚠️ Partial (нет фильтров/пагинации) | ✅ **Yes (P1)** | Добавить фильтры и пагинацию в MOBILE |
| **Баллы** | Auth-gating | ✅ OK | ✅ OK | ❌ No | — |
| **Баллы** | Обработка ошибок | ✅ OK (401/403/409/404) | ⚠️ Partial (через Alert) | ❌ No | Улучшить UI ошибок в MOBILE (P2) |

---

## D) Вердикт "готово к тестированию"

### Блокеры (P0/P1)

#### P0 — Критично (блокирует тестирование)

1. **WEB LoyaltySystem: отсутствует auth-gating**
   - **Проблема:** `LoyaltySystem.jsx` делает запросы без проверки токена
   - **Файл:** `frontend/src/components/LoyaltySystem.jsx:32-45`
   - **Фикс:** Добавить `useAuth()` и проверку `authLoading`/`isAuthenticated` перед запросами
   - **Время:** ~15 минут

#### P1 — Важно (желательно перед тестированием)

2. **MOBILE History: отсутствуют фильтры и пагинация**
   - **Проблема:** История показывает только первые 50 записей без фильтров
   - **Файл:** `mobile/app/master/loyalty.tsx:887-949`
   - **Фикс:** Добавить фильтры (client_id, transaction_type, start_date, end_date) и пагинацию (skip/limit) как в WEB
   - **Время:** ~30 минут

### Smoke Tests (10-15 пунктов)

1. ✅ **WEB: Открытие без токена → нет запросов к /api/loyalty/*** (после фикса P0)
2. ✅ **WEB: Логин → запросы стартуют автоматически** (useMasterSubscription bugfix)
3. ✅ **WEB: Скидки → Быстрые: создать/редактировать/удалить**
4. ✅ **WEB: Скидки → Сложные: создать/удалить**
5. ✅ **WEB: Скидки → Персональные: создать/удалить**
6. ✅ **WEB: Баллы → Настройки: сохранить изменения**
7. ✅ **WEB: Баллы → Статистика: отображаются 4 карточки**
8. ✅ **WEB: Баллы → История: фильтры и пагинация работают**
9. ✅ **MOBILE: Открытие без токена → нет запросов**
10. ✅ **MOBILE: Логин → запросы стартуют автоматически**
11. ✅ **MOBILE: Скидки → Быстрые: создать/редактировать/удалить**
12. ✅ **MOBILE: Скидки → Сложные: создать/удалить**
13. ✅ **MOBILE: Скидки → Персональные: создать/удалить**
14. ✅ **MOBILE: Баллы → Настройки: сохранить изменения**
15. ✅ **MOBILE: Баллы → Статистика: отображаются 4 карточки**
16. ⚠️ **MOBILE: Баллы → История: фильтры и пагинация** (после фикса P1)

### Итоговый статус

**NOT READY FOR TESTING**

**Причины:**
1. **P0:** WEB LoyaltySystem не имеет auth-gating — запросы могут уходить без токена (строка 32-45)
2. **P1:** MOBILE History не имеет фильтров/пагинации — не соответствует WEB (только `limit: 50` в запросе, нет UI)

**После фиксов:**
- P0 фикс → можно тестировать базовый функционал
- P0 + P1 фиксы → **READY FOR TESTING**

**Дополнительные находки:**
- WEB LoyaltySystem обрабатывает 403/409/404, но нет 401 с очисткой токена (строки 88-137)
- MOBILE History использует `getLoyaltyHistory({ limit: 50 })` без фильтров (строка 298)

---

## Затронутые файлы (ключевые)

### WEB
- `frontend/src/components/LoyaltySystem.jsx` — Скидки (нужен auth-gating)
- `frontend/src/components/MasterLoyalty.jsx` — Баллы → Настройки
- `frontend/src/components/MasterLoyaltyStats.jsx` — Баллы → Статистика
- `frontend/src/components/MasterLoyaltyHistory.jsx` — Баллы → История
- `frontend/src/hooks/useMasterSubscription.js` — Features (исправлен)
- `frontend/src/utils/api.js` — Улучшена обработка ошибок
- `frontend/src/pages/MasterDashboard.jsx:1985` — Entrypoint

### MOBILE
- `mobile/app/master/loyalty.tsx` — Главный экран (нужны фильтры/пагинация в History)
- `mobile/src/components/loyalty/DiscountsQuickTab.tsx` — Быстрые скидки
- `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — Сложные скидки
- `mobile/src/components/loyalty/DiscountsPersonalTab.tsx` — Персональные скидки
- `mobile/src/services/api/loyalty_discounts.ts` — API для скидок
- `mobile/src/services/api/master.ts` — API для баллов

---

## Рекомендации

1. **Срочно (P0):** Добавить auth-gating в `LoyaltySystem.jsx`
2. **Важно (P1):** Добавить фильтры и пагинацию в MOBILE History
3. **Опционально (P2):** Добавить редактирование сложных/персональных скидок в UI (WEB и MOBILE)
4. **Опционально (P2):** Улучшить UI ошибок в MOBILE (заменить Alert на Card с warning/error стилями)

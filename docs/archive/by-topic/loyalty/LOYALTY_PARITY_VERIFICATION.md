# Верификация Parity "Скидки" (после P0+P1 фиксов)

**Дата:** 2026-01-21

---

## Матрица операций: Quick / Complex / Personal × List / Create / Update / Toggle / Delete

| Тип скидки | Операция | Backend Endpoint | WEB Вызов | WEB UI | MOBILE Вызов | MOBILE UI | MUST/NICE | Примечание |
|------------|----------|-----------------|-----------|--------|--------------|-----------|-----------|------------|
| **Quick** | List | ✅ GET `/api/loyalty/status` | ✅ `loadData()` | ✅ Список шаблонов + активных | ✅ `loadDiscounts()` | ✅ `DiscountsQuickTab` | **MUST** | — |
| **Quick** | Create | ✅ POST `/api/loyalty/quick-discounts` | ✅ `handleCreateQuickDiscount()` | ✅ Кнопка "Активировать" на шаблоне | ✅ `handleCreateQuickDiscount()` | ✅ Кнопка "Активировать" | **MUST** | — |
| **Quick** | Update | ✅ PUT `/api/loyalty/quick-discounts/{id}` | ✅ `handleUpdateQuickDiscount()` | ✅ Inline редактирование процента | ✅ `handleUpdateQuickDiscount()` | ✅ Inline редактирование | **MUST** | — |
| **Quick** | Toggle | ✅ PUT `/api/loyalty/quick-discounts/{id}` (is_active) | ✅ `handleUpdateQuickDiscount()` | ✅ Toggle через inline edit | ✅ `handleUpdateQuickDiscount()` | ✅ Toggle через inline edit | **MUST** | Backend поддерживает через PUT с `is_active` |
| **Quick** | Delete | ✅ DELETE `/api/loyalty/quick-discounts/{id}` | ✅ `handleDeleteQuickDiscount()` | ✅ Кнопка "Удалить" | ✅ `handleDeleteDiscount()` | ✅ Кнопка "Удалить" | **MUST** | — |
| **Complex** | List | ✅ GET `/api/loyalty/status` | ✅ `loadData()` | ✅ Список активных | ✅ `loadDiscounts()` | ✅ `DiscountsComplexTab` | **MUST** | — |
| **Complex** | Create | ✅ POST `/api/loyalty/complex-discounts` | ✅ `handleCreateComplexDiscount()` | ✅ Форма создания | ✅ `handleCreateComplexDiscount()` | ✅ Форма создания | **MUST** | — |
| **Complex** | Update | ✅ PUT `/api/loyalty/complex-discounts/{id}` | ❌ Missing | ❌ Missing | ✅ `updateComplexDiscount()` (API есть) | ❌ Missing | **NICE** | Backend поддерживает, но UI нет в WEB и MOBILE |
| **Complex** | Toggle | ✅ PUT `/api/loyalty/complex-discounts/{id}` (is_active) | ❌ Missing | ❌ Missing | ✅ `updateComplexDiscount()` (API есть) | ❌ Missing | **NICE** | Backend поддерживает через PUT с `is_active`, но UI нет |
| **Complex** | Delete | ✅ DELETE `/api/loyalty/complex-discounts/{id}` | ✅ `handleDeleteComplexDiscount()` | ✅ Кнопка "Удалить" | ✅ `handleDeleteDiscount()` | ✅ Кнопка "Удалить" | **MUST** | — |
| **Personal** | List | ✅ GET `/api/loyalty/status` | ✅ `loadData()` | ✅ Список персональных | ✅ `loadDiscounts()` | ✅ `DiscountsPersonalTab` | **MUST** | — |
| **Personal** | Create | ✅ POST `/api/loyalty/personal-discounts` | ✅ `handleCreatePersonalDiscount()` | ✅ Форма создания | ✅ `handleCreatePersonalDiscount()` | ✅ Форма создания | **MUST** | — |
| **Personal** | Update | ✅ PUT `/api/loyalty/personal-discounts/{id}` | ❌ Missing | ❌ Missing | ✅ `updatePersonalDiscount()` (API есть) | ❌ Missing | **NICE** | Backend поддерживает, но UI нет в WEB и MOBILE |
| **Personal** | Toggle | ✅ PUT `/api/loyalty/personal-discounts/{id}` (is_active) | ❌ Missing | ❌ Missing | ✅ `updatePersonalDiscount()` (API есть) | ❌ Missing | **NICE** | Backend поддерживает через PUT с `is_active`, но UI нет |
| **Personal** | Delete | ✅ DELETE `/api/loyalty/personal-discounts/{id}` | ✅ `handleDeletePersonalDiscount()` | ✅ Кнопка "Удалить" | ✅ `handleDeleteDiscount()` | ✅ Кнопка "Удалить" | **MUST** | — |

---

## Выводы

### 1. MUST для v1 тестирования (критично)

**Все операции для Quick скидок:**
- ✅ List, Create, Update, Toggle, Delete — полностью реализованы в WEB и MOBILE

**Базовые операции для Complex и Personal:**
- ✅ List, Create, Delete — полностью реализованы в WEB и MOBILE

**Итого:** 13 операций из 15 — **MUST** и реализованы.

### 2. NICE (опционально, можно отложить)

**Update и Toggle для Complex/Personal:**
- ❌ Update Complex — Backend есть (`PUT /api/loyalty/complex-discounts/{id}`), но UI нет в WEB и MOBILE
- ❌ Toggle Complex — Backend есть (через PUT с `is_active`), но UI нет
- ❌ Update Personal — Backend есть (`PUT /api/loyalty/personal-discounts/{id}`), но UI нет в WEB и MOBILE
- ❌ Toggle Personal — Backend есть (через PUT с `is_active`), но UI нет

**Итого:** 4 операции — **NICE**, можно добавить позже.

### 3. Backend поддержка

**Подтверждено:**
- ✅ `PUT /api/loyalty/complex-discounts/{discount_id}` — существует (строка 580)
- ✅ `PUT /api/loyalty/personal-discounts/{discount_id}` — существует (строка 688)
- ✅ Оба endpoint поддерживают `is_active` через `LoyaltyDiscountUpdate` / `PersonalDiscountUpdate`

**Вывод:** Backend готов для Update/Toggle, но UI не реализован. Не делаем "UI в пустоту" — сначала нужно добавить UI в WEB и MOBILE.

### 4. Рекомендации

**Для v1 тестирования:**
- ✅ Все MUST операции работают
- ✅ Можно тестировать полный CRUD для Quick скидок
- ✅ Можно тестировать Create/Delete для Complex/Personal

**Для v2 (опционально):**
- Добавить редактирование Complex скидок (форма редактирования)
- Добавить редактирование Personal скидок (форма редактирования)
- Добавить toggle `is_active` для Complex/Personal (чекбокс или кнопка)

### 5. Статус после P0+P1 фиксов

**READY FOR TESTING:**
- ✅ P0: Auth-gating в WEB добавлен
- ✅ P1: Фильтры и пагинация в MOBILE History добавлены
- ✅ Все MUST операции реализованы
- ✅ Backend поддерживает все операции (включая NICE)

**Блокеров нет.** Можно начинать тестирование.

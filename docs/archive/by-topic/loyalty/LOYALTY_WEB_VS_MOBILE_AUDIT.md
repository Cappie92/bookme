# Аудит: Лояльность WEB vs MOBILE (Discounts vs Points)

**Дата:** 2026-01-21  
**Цель:** Выяснить, почему в mobile отображаются баллы/points, хотя в web правильная версия — фиксированные скидки.

---

## 1. WEB: Страница лояльности мастера

### URL/Роут
- **Роут:** `/master?tab=loyalty` (через React Router)
- **Компонент:** `frontend/src/pages/MasterDashboard.jsx` → `LoyaltySystem` (импортирован как `MasterLoyalty`)
- **Файл компонента:** `frontend/src/components/LoyaltySystem.jsx`

### API-запросы (из Network)

**При загрузке страницы:**
1. `GET /api/loyalty/templates` — шаблоны быстрых скидок (опционально, может быть 404)
2. `GET /api/loyalty/status` — статус системы лояльности (возвращает quick_discounts, complex_discounts, personal_discounts)

**При создании/редактировании скидок:**
3. `POST /api/loyalty/quick-discounts` — создать быструю скидку
4. `PUT /api/loyalty/quick-discounts/{discountId}` — обновить быструю скидку
5. `DELETE /api/loyalty/quick-discounts/{discountId}` — удалить быструю скидку
6. `POST /api/loyalty/complex-discounts` — создать сложную скидку
7. `DELETE /api/loyalty/complex-discounts/{discountId}` — удалить сложную скидку
8. `POST /api/loyalty/personal-discounts` — создать персональную скидку

**Итого:** 8 эндпоинтов, все про **DISCOUNTS** (скидки), не про points (баллы).

---

## 2. MOBILE: Экран лояльности мастера

### Роут
- **Роут:** `/master/loyalty` (Expo Router)
- **Файл:** `mobile/app/master/loyalty.tsx`

### API-запросы

**При загрузке экрана:**
1. `GET /api/master/loyalty/settings` — настройки программы лояльности (is_enabled, accrual_percent, max_payment_percent, points_lifetime_days)
2. `GET /api/master/loyalty/stats` — статистика (total_earned, total_spent, current_balance, active_clients_count) — **это про POINTS**
3. `GET /api/master/loyalty/history` — история транзакций (earned/spent points) — **это про POINTS**

**При сохранении настроек:**
4. `PUT /api/master/loyalty/settings` — обновить настройки

**Итого:** 4 эндпоинта, все про **POINTS** (баллы), не про discounts (скидки).

---

## 3. DIFF: Что отличается

| Аспект | WEB | MOBILE |
|--------|-----|--------|
| **Концепция** | Фиксированные скидки (discounts) | Баллы/points (начисление/списание) |
| **Эндпоинты** | `/api/loyalty/*` (discounts) | `/api/master/loyalty/*` (points) |
| **Основные сущности** | LoyaltyDiscount, PersonalDiscount, AppliedDiscount | LoyaltySettings, LoyaltyTransaction, LoyaltyStats |
| **UI вкладки** | Быстрые скидки / Сложные скидки / Персональные скидки | Настройки / Статистика / История |
| **Настройки** | Нет настроек (только CRUD скидок) | is_enabled, accrual_percent, max_payment_percent, points_lifetime_days |
| **Статистика** | Нет статистики | total_earned, total_spent, current_balance, active_clients_count |
| **История** | Нет истории | История транзакций earned/spent |

**Вывод:** Это **РАЗНЫЕ КОНТУРЫ**:
- **WEB:** Система фиксированных скидок (discounts) — правила скидок, которые применяются к бронированиям
- **MOBILE:** Система баллов (points) — начисление/списание баллов, статистика, история транзакций

---

## 4. ROOT CAUSE: Почему points появились в mobile

### Источник логики баллов

**Файлы:**
1. `mobile/src/services/api/master.ts` (строки 595-640):
   - `getLoyaltySettings()` → `GET /api/master/loyalty/settings`
   - `updateLoyaltySettings()` → `PUT /api/master/loyalty/settings`
   - `getLoyaltyStats()` → `GET /api/master/loyalty/stats`
   - `getLoyaltyHistory()` → `GET /api/master/loyalty/history`

2. `mobile/src/services/api/loyalty.ts` (весь файл):
   - Типы: `LoyaltySettings`, `LoyaltyStatsOut`, `LoyaltyTransaction`, `ClientLoyaltyPointsOut`
   - Функции для работы с баллами клиента: `getClientLoyaltyPoints()`, `getAvailablePoints()`
   - Утилиты: `formatLoyaltyPoints()`, `calculateMaxSpendable()`

3. `mobile/app/master/loyalty.tsx`:
   - Использует `getLoyaltySettings()`, `getLoyaltyStats()`, `getLoyaltyHistory()` из `@src/services/api/master`
   - Отображает настройки баллов (accrual_percent, max_payment_percent, points_lifetime_days)
   - Отображает статистику баллов (total_earned, total_spent, current_balance)
   - Отображает историю транзакций баллов (earned/spent)

### Связь с /api/master/subscription/features

**Файл:** `mobile/app/master/loyalty.tsx` (строка 56):
```typescript
const hasLoyaltyAccess = features?.has_loyalty_access === true;
```

**Логика:**
- Экран лояльности проверяет фичу `has_loyalty_access` из `/api/master/subscription/features`
- Если фича включена → загружаются настройки/статистика/история через `/api/master/loyalty/*`
- Если фича выключена → показывается locked state

**Проблема:** Фича `has_loyalty_access` контролирует доступ к **системе баллов**, а не к **системе скидок**.

---

## 5. DELETE PLAN: Удаление следов points из mobile

### Файлы для удаления/отключения

#### A. API сервисы (удалить или закомментировать)

1. **`mobile/src/services/api/loyalty.ts`** (весь файл)
   - Типы: `LoyaltyTransactionType`, `LoyaltyTransaction`, `ClientLoyaltyPointsOut`, `LoyaltyStatsOut`, `AvailableLoyaltyPointsOut`
   - Функции: `getClientLoyaltyPoints()`, `getAvailablePoints()`, `getMasterLoyaltyStats()`, `getMasterLoyaltyHistory()`
   - Утилиты: `formatLoyaltyPoints()`, `calculateMaxSpendable()`, `formatExpiresDate()`, `getTransactionTypeColor()`, `getTransactionTypeLabel()`
   - **Действие:** Удалить файл полностью

2. **`mobile/src/services/api/master.ts`** (строки 595-640)
   - `getLoyaltySettings()` → `GET /api/master/loyalty/settings`
   - `updateLoyaltySettings()` → `PUT /api/master/loyalty/settings`
   - `getLoyaltyStats()` → `GET /api/master/loyalty/stats`
   - `getLoyaltyHistory()` → `GET /api/master/loyalty/history`
   - Типы: `LoyaltySettings`, `LoyaltySettingsUpdate`, `LoyaltyStats`, `LoyaltyTransaction`, `LoyaltyHistoryFilters`
   - **Действие:** Удалить функции и типы (строки 595-640)

#### B. Компоненты/экраны (переписать)

3. **`mobile/app/master/loyalty.tsx`** (весь файл)
   - Использует `getLoyaltySettings()`, `getLoyaltyStats()`, `getLoyaltyHistory()` из `@src/services/api/master`
   - Отображает настройки баллов, статистику баллов, историю транзакций
   - **Действие:** Переписать полностью на логику скидок (см. Migration Plan)

#### C. Компоненты (если есть)

4. **`mobile/src/components/loyalty/MasterLoyaltyInfo.tsx`** (если существует)
   - Проверить, используется ли для отображения информации о баллах
   - **Действие:** Удалить или переписать

#### D. Компоненты loyalty (удалить или переписать)

4. **`mobile/src/components/loyalty/MasterLoyaltyInfo.tsx`**
   - Использует `getMasterLoyaltySettingsPublic()` из `@src/services/api/loyalty`
   - Отображает информацию о баллах (accrual_percent, max_payment_percent, points_lifetime_days)
   - Используется в: `mobile/app/bookings/[id].tsx`
   - **Действие:** Переписать на отображение информации о скидках (или удалить, если не нужен)

5. **`mobile/src/components/loyalty/LoyaltyTransactionItem.tsx`**
   - Отображает транзакцию баллов (earned/spent)
   - **Действие:** Удалить (не нужен для скидок)

6. **`mobile/src/components/loyalty/LoyaltyTransactionsList.tsx`**
   - Список транзакций баллов
   - **Действие:** Удалить (не нужен для скидок)

7. **`mobile/src/components/loyalty/LoyaltyMasterCard.tsx`**
   - Карточка мастера с информацией о баллах клиента
   - **Действие:** Удалить или переписать (если нужен для клиента)

8. **`mobile/src/components/loyalty/LoyaltyPointsScreen.tsx`**
   - Экран баллов клиента
   - **Действие:** Удалить (не нужен для скидок)

9. **`mobile/src/components/loyalty/UseLoyaltyPointsToggle.tsx`**
   - Переключатель использования баллов при бронировании
   - **Действие:** Удалить (не нужен для скидок)

#### E. Хуки (удалить)

10. **`mobile/src/hooks/useLoyaltyPoints.ts`**
    - Хук для работы с баллами клиента
    - **Действие:** Удалить

11. **`mobile/src/hooks/useAvailableLoyaltyPoints.ts`**
    - Хук для получения доступных баллов при бронировании
    - **Действие:** Удалить

#### F. Импорты и зависимости

12. **Поиск всех импортов:**
    ```bash
    grep -r "from '@src/services/api/loyalty'" mobile/
    grep -r "getLoyaltySettings\|getLoyaltyStats\|getLoyaltyHistory" mobile/
    grep -r "LoyaltySettings\|LoyaltyStats\|LoyaltyTransaction" mobile/
    ```
    - **Действие:** Удалить все импорты и использования

#### G. Типы/интерфейсы (если экспортируются)

13. **Проверить экспорты:**
    ```bash
    grep -r "export.*Loyalty" mobile/src/
    ```
    - **Действие:** Удалить экспорты типов points

---

## 6. MIGRATION PLAN: Перенос правильной веб-версии скидок в mobile

### Шаг 1: Создать API сервис для скидок

**Файл:** `mobile/src/services/api/loyalty_discounts.ts` (новый)

**Эндпоинты (из web):**
1. `GET /api/loyalty/templates` — шаблоны быстрых скидок (опционально)
2. `GET /api/loyalty/status` — статус системы (quick_discounts, complex_discounts, personal_discounts)
3. `POST /api/loyalty/quick-discounts` — создать быструю скидку
4. `PUT /api/loyalty/quick-discounts/{id}` — обновить быструю скидку
5. `DELETE /api/loyalty/quick-discounts/{id}` — удалить быструю скидку
6. `POST /api/loyalty/complex-discounts` — создать сложную скидку
7. `DELETE /api/loyalty/complex-discounts/{id}` — удалить сложную скидку
8. `POST /api/loyalty/personal-discounts` — создать персональную скидку

**DTO (из backend/schemas.py):**
- `LoyaltyDiscount` (quick/complex)
- `PersonalDiscount`
- `LoyaltySystemStatus`
- `QuickDiscountTemplate`
- `ComplexDiscountCondition`
- `DiscountEvaluationRequest` (опционально, для preview)

### Шаг 2: Переписать экран лояльности

**Файл:** `mobile/app/master/loyalty.tsx` (полная переписка)

**Структура экрана:**
1. **Вкладки:**
   - Быстрые скидки
   - Сложные скидки
   - Персональные скидки

2. **Быстрые скидки:**
   - Список активных скидок (из `status.quick_discounts`)
   - Кнопка "Создать из шаблона" (если есть templates)
   - Редактирование процента скидки (inline)
   - Удаление скидки

3. **Сложные скидки:**
   - Список активных скидок (из `status.complex_discounts`)
   - Кнопка "Создать сложную скидку"
   - Форма создания: name, description, discount_percent, conditions
   - Удаление скидки

4. **Персональные скидки:**
   - Список активных скидок (из `status.personal_discounts`)
   - Кнопка "Создать персональную скидку"
   - Форма создания: client_phone, discount_percent, max_discount_amount
   - Удаление скидки

### Шаг 3: Удалить старую логику points

1. Удалить `mobile/src/services/api/loyalty.ts`
2. Удалить функции points из `mobile/src/services/api/master.ts`
3. Удалить все импорты и использования points в mobile

### Шаг 4: Обновить проверку доступа

**Файл:** `mobile/app/master/loyalty.tsx`

**Логика:**
- Проверять `features?.has_loyalty_access === true` (как сейчас)
- Но использовать эндпоинты `/api/loyalty/*` вместо `/api/master/loyalty/*`

---

## 7. Примеры Network запросов (WEB)

### URL правильной страницы лояльности в вебе:
- **Роут:** `/master?tab=loyalty`
- **Полный URL:** `http://localhost:5173/master?tab=loyalty` (или production domain)
- **Компонент:** `frontend/src/pages/MasterDashboard.jsx` → вкладка `loyalty` → рендерит `LoyaltySystem`

### При открытии `/master?tab=loyalty` (3–5 строк из Network):

```
1. GET /api/loyalty/templates
   Status: 200 OK (или 404, если не реализован)
   Response: QuickDiscountTemplate[]

2. GET /api/loyalty/status
   Status: 200 OK
   Response: {
     quick_discounts: LoyaltyDiscount[],
     complex_discounts: LoyaltyDiscount[],
     personal_discounts: PersonalDiscount[]
   }
```

### При создании быстрой скидки:

```
3. POST /api/loyalty/quick-discounts
   Body: {
     discount_type: "quick",
     name: "...",
     discount_percent: 10,
     conditions: [...],
     is_active: true,
     priority: 1
   }
   Response: LoyaltyDiscount
```

### При обновлении/удалении скидки:

```
4. PUT /api/loyalty/quick-discounts/{id}
   Body: { discount_percent: 15 }
   Response: LoyaltyDiscount

5. DELETE /api/loyalty/quick-discounts/{id}
   Status: 200 OK
```

---

## Итоговый вывод

### Проблема
- **WEB:** Использует систему **фиксированных скидок** (discounts) через `/api/loyalty/*`
- **MOBILE:** Использует систему **баллов** (points) через `/api/master/loyalty/*`
- Это **разные контуры**, не связанные друг с другом

### ROOT CAUSE
- В mobile была реализована система баллов (points) вместо системы скидок (discounts)
- Источник: `mobile/src/services/api/loyalty.ts` и `mobile/src/services/api/master.ts` (функции для points)
- Экран `mobile/app/master/loyalty.tsx` использует API points вместо API discounts

### DELETE PLAN (детальный список)

#### Файлы для удаления:
1. `mobile/src/services/api/loyalty.ts` — весь файл (API для points)
2. `mobile/src/hooks/useLoyaltyPoints.ts` — хук для баллов клиента
3. `mobile/src/hooks/useAvailableLoyaltyPoints.ts` — хук для доступных баллов
4. `mobile/src/components/loyalty/LoyaltyTransactionItem.tsx` — компонент транзакции
5. `mobile/src/components/loyalty/LoyaltyTransactionsList.tsx` — список транзакций
6. `mobile/src/components/loyalty/LoyaltyPointsScreen.tsx` — экран баллов клиента
7. `mobile/src/components/loyalty/UseLoyaltyPointsToggle.tsx` — переключатель баллов

#### Файлы для частичного удаления:
8. `mobile/src/services/api/master.ts` — удалить строки 545-642 (типы и функции points)
9. `mobile/app/master/loyalty.tsx` — переписать полностью на логику скидок

#### Файлы для переписывания (если используются):
10. `mobile/src/components/loyalty/MasterLoyaltyInfo.tsx` — переписать на отображение скидок (или удалить)
    - Используется в: `mobile/app/bookings/[id].tsx` (строка 298)
    - Отображает информацию о баллах мастера (accrual_percent, max_payment_percent, points_lifetime_days)
    - **Действие:** Переписать на отображение информации о скидках мастера (или удалить, если не нужен для клиента)
11. `mobile/src/components/loyalty/LoyaltyMasterCard.tsx` — переписать или удалить
    - Карточка мастера с балансом баллов клиента
    - **Действие:** Удалить (не нужен для скидок)
12. `mobile/app/bookings/[id].tsx` — удалить или обновить использование `MasterLoyaltyInfo`
    - Строка 9: `import { MasterLoyaltyInfo } from '@src/components/loyalty/MasterLoyaltyInfo';`
    - Строка 298: `<MasterLoyaltyInfo masterId={booking.master_id} />`
    - **Действие:** Удалить импорт и использование, если компонент удаляется, или обновить, если переписывается

#### Импорты для удаления:
- Все `import ... from '@src/services/api/loyalty'`
- Все `import { getLoyaltySettings, getLoyaltyStats, getLoyaltyHistory } from '@src/services/api/master'`
- Все использования типов `LoyaltySettings`, `LoyaltyStats`, `LoyaltyTransaction`, `ClientLoyaltyPointsOut`

### MIGRATION PLAN
1. Создать `mobile/src/services/api/loyalty_discounts.ts` с эндпоинтами `/api/loyalty/*`
2. Переписать `mobile/app/master/loyalty.tsx` на 3 вкладки: Быстрые / Сложные / Персональные скидки
3. Использовать те же эндпоинты, что и в web: `/api/loyalty/status`, `/api/loyalty/quick-discounts`, и т.д.
4. Удалить всю логику points

---

**Готово к реализации:** План миграции готов, можно приступать к переписыванию экрана лояльности в mobile на логику скидок.

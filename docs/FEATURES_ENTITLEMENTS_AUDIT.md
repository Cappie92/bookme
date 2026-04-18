# Аудит: «Функции тарифа» (entitlements / service_functions)

## 1. Краткое резюме

Система платных функций реализована через таблицу `service_functions` и JSON-поле `plan.features.service_functions` (массив ID). Backend имеет центральный механизм `check_feature_access()` и хелперы `has_extended_stats`, `has_loyalty_access` и т.д. Проверки применяются точечно: часть роутеров защищена (loyalty, stats, domain), часть — нет (accounting/finance, master_clients). Модуль «Клиенты» не является платной функцией и не защищён. Web и mobile получают фичи через `GET /api/master/subscription/features` и используют их для UI (демо-режим, плашка «Перейти к тарифам»).

---

## 2. Схема данных

### Модели

| Сущность | Таблица | Ключевые поля |
|----------|---------|---------------|
| **SubscriptionPlan** | `subscription_plans` | `features` (JSON), `limits` (JSON) |
| **ServiceFunction** | `service_functions` | `id`, `name`, `display_name`, `function_type` (FREE/SUBSCRIPTION/VOLUME_BASED), `is_active`, `display_order` |

### Связь plan → functions

- **Тип связи:** many-to-many через JSON, не отдельная таблица.
- **Хранение:** `plan.features = { "service_functions": [1, 2, 3, 4, 5, 6], "max_page_modules": N, "stats_retention_days": N }`
- **Маппинг ID → ключ:** `backend/utils/subscription_features.py`:

```
1 → has_booking_page        (Страница бронирования мастера)
2 → has_extended_stats      (Статистика)
3 → has_loyalty_access      (Лояльность)
4 → has_finance_access      (Финансы)
5 → has_client_restrictions (Стоп-листы и предоплата)
6 → can_customize_domain    (Персональный домен)
```

### Seed / миграция

- `alembic/versions/20251224_recreate_service_functions.py` — создаёт 6 функций с id 1–6.
- `alembic/versions/20260128_populate_service_functions_and_plans.py` — восстанавливает `service_functions` в планах при пустой базе.

---

## 3. Точки входа админки

| Действие | Маршрут | Файл |
|----------|---------|------|
| Список service_functions | `GET /api/admin/service-functions` | `routers/service_functions.py` |
| Список с фильтром | `GET /api/admin/service-functions?function_type=SUBSCRIPTION&is_active=true` | то же |
| Создание функции | `POST /api/admin/service-functions` | то же |
| Обновление функции | `PUT /api/admin/service-functions/{id}` | то же |
| Удаление функции | `DELETE /api/admin/service-functions/{id}` | то же |
| Создание плана | `POST /api/admin/subscription-plans` | `routers/subscription_plans.py` |
| Обновление плана (в т.ч. чекбоксы) | `PUT /api/admin/subscription-plans/{id}` | то же |

Чекбоксы «Функции тарифа» в карточке плана:

- **Файл:** `frontend/src/components/SubscriptionPlanForm.jsx`
- **Данные:** `formData.features.service_functions` — массив ID
- **Загрузка функций:** `apiGet('/api/admin/service-functions')` с фильтром по `function_type=SUBSCRIPTION`
- **Сохранение:** при submit формы плана `service_functions` уходят в `features.service_functions`

---

## 4. Точки потребления (Web / Mobile)

### API

| Endpoint | Описание |
|----------|----------|
| `GET /api/master/subscription/features` | Возвращает `has_booking_page`, `has_extended_stats`, `has_loyalty_access`, `has_finance_access`, `has_client_restrictions`, `can_customize_domain`, `plan_name`, `plan_id` |

### Web

- **Хук:** `frontend/src/hooks/useMasterSubscription.js` — читает `features` и exposes `hasExtendedStats`, `hasLoyaltyAccess`, `hasFinanceAccess`, `hasClientRestrictions`, `canCustomizeDomain`
- **Страницы:** MasterDashboard, MasterStats, MasterFinance и др. — используют эти флаги для показа/скрытия разделов и демо-режима

### Mobile

- **Хук:** `mobile/src/hooks/useMasterFeatures.ts` — `GET /api/master/subscription/features`, кэш `@master_features:{user.id}`
- **Меню:** `MasterHamburgerMenu.tsx` — пункты с `feature: 'has_extended_stats'` и т.д.
- **Компонент:** `FeatureLock.tsx` — обёртка для экранов без доступа
- **Маппинг:** `mobile/src/utils/featureAccess.ts` — `FEATURE_TO_SERVICE_FUNCTION_ID` для `getCheapestPlanForFeature`

---

## 5. Единый механизм проверки

**YES.** Backend использует центральный guard:

- **Файл:** `backend/utils/subscription_features.py`
- **Функции:** `check_feature_access(db, user_id, feature_key)`, `has_extended_stats()`, `has_loyalty_access()`, `has_finance_access()`, `has_client_restrictions()`, `can_customize_domain()`
- **Проверка:** `plan.features.service_functions` + маппинг `FEATURE_TO_SERVICE_FUNCTION`

Доступ применяется **точечно** в роутерах, а не через общий middleware.

---

## 6. Таблица: Feature → где проверяется

| Функция | Backend guard | Web route/menu | Mobile guard |
|---------|---------------|----------------|--------------|
| **Статистика** | `has_extended_stats` в `master.py` (~4041) для расширенной статистики | useMasterSubscription → MasterStats | `useMasterFeatures`, stats.tsx, isPro |
| **Правила/стоп-листы** | `has_client_restrictions` в `master_loyalty.py` (restrictions) и `master.py` (restrictions) | useMasterSubscription | `useFeatureAccess('has_client_restrictions')` в client-restrictions.tsx |
| **Лояльность** | `has_loyalty_access` в `master_loyalty.py` (все эндпоинты) | useMasterSubscription | `hasLoyaltyAccess` в loyalty.tsx |
| **Финансы** | **Отсутствует** — `routers/accounting.py` не проверяет `has_finance_access` | useMasterSubscription → демо-режим в MasterFinance | `hasFinanceAccess` в finance.tsx → демо/полный режим |
| **Страница бронирования** | `has_booking_page` — базовая, по умолчанию доступна | FeatureLock в services | FeatureLock в services.tsx |
| **Персональный домен** | `can_customize_domain` в `master.py` (~951) для PATCH domain | useMasterSubscription | — |

### Явные пропуски проверки

1. **Финансы (accounting):** `routers/accounting.py` не вызывает `has_finance_access`. Любой мастер с токеном может вызывать эндпоинты бухгалтерии. UI ограничивает показ данных, но API — нет.
2. **Клиенты:** `routers/master_clients.py` не проверяет доступ по тарифу. Модуль «Клиенты» доступен всем мастерам.

---

## 7. Рекомендация: добавить «Клиенты» как платную функцию

### Шаги (без реализации кода)

1. **Backend**
   - Добавить в `service_functions` новую запись (например id=7): `name="clients"`, `display_name="Клиенты"`, `function_type="SUBSCRIPTION"`.
   - В `subscription_features.py`: добавить `7: "has_clients_access"` в `SERVICE_FUNCTION_TO_FEATURE`, функцию `has_clients_access()`, возвращать `has_clients_access` в `get_master_features()`.
   - В `master_clients.py`: в начале каждого эндпоинта вызывать `has_clients_access(db, current_user.id)` и при `False` возвращать 403.

2. **Admin**
   - В админке появится новый чекбокс «Клиенты» в «Функции тарифа» (SubscriptionPlanForm подтягивает список из `GET /api/admin/service-functions`).

3. **Web**
   - В `useMasterSubscription.js` добавить `hasClientsAccess`.
   - На странице/вкладке «Клиенты» проверять флаг и при отсутствии доступа показывать демо-режим или плашку «Перейти к тарифам».

4. **Mobile**
   - В `featureAccess.ts` добавить `has_clients_access: 7`.
   - В `MasterHamburgerMenu` — пункт «Клиенты» с `feature: 'has_clients_access'`.
   - Экран clients.tsx обернуть в `FeatureLock` или проверять `has_clients_access` и показывать демо.

### Риски

- **Роуты клиентов:** Сейчас `/api/master/clients*` доступны без проверки тарифа. Нужна явная защита на backend, чтобы избежать обхода через API.
- **Обратная совместимость:** Планы без id=7 в `service_functions` не будут иметь доступ. Нужно решить, давать ли функцию старым планам по умолчанию или только новым.

---

## 8. Ключевые файлы

| Назначение | Путь |
|------------|------|
| Маппинг и guard | `backend/utils/subscription_features.py` |
| Модели | `backend/models.py` (SubscriptionPlan, ServiceFunction) |
| Admin service_functions | `backend/routers/service_functions.py` |
| Admin планы | `backend/routers/subscription_plans.py` |
| API features | `backend/routers/master.py` (get_master_subscription_features, get_master_service_functions) |
| Loyalty guard | `backend/routers/master_loyalty.py` |
| Accounting (без guard) | `backend/routers/accounting.py` |
| Clients (без guard) | `backend/routers/master_clients.py` |
| Domain guard | `backend/routers/master.py` (PATCH domain) |
| Админка форма плана | `frontend/src/components/SubscriptionPlanForm.jsx` |
| Web хук | `frontend/src/hooks/useMasterSubscription.js` |
| Mobile хук | `mobile/src/hooks/useMasterFeatures.ts` |
| Mobile feature access | `mobile/src/utils/featureAccess.ts` |
| Mobile FeatureLock | `mobile/src/components/FeatureLock.tsx` |

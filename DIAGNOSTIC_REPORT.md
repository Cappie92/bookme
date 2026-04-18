# ДИАГНОСТИЧЕСКИЙ ОТЧЁТ: Feature Gates и Ограничения по Тарифам

## ЧАСТЬ 0: ДИАГНОСТИКА СУЩЕСТВУЮЩЕЙ РЕАЛИЗАЦИИ

### 1. Backend: Источник данных

**Endpoint:** `GET /api/master/subscription/features`
- **Файл:** `backend/routers/master.py:485-509`
- **Функция:** `get_master_subscription_features()`
- **Использует:** `utils.subscription_features.get_master_features()`

**Структура ответа:**
```json
{
  "has_booking_page": boolean,
  "has_unlimited_bookings": boolean,
  "has_extended_stats": boolean,
  "has_loyalty_access": boolean,
  "has_finance_access": boolean,
  "has_client_restrictions": boolean,
  "can_customize_domain": boolean,
  "max_page_modules": number,
  "stats_retention_days": number,
  "plan_name": string | null,
  "plan_id": number | null,
  "current_page_modules": number,
  "can_add_more_modules": boolean
}
```

**Логика определения доступа:**
- Файл: `backend/utils/subscription_features.py`
- Функция: `get_master_features(db, user_id)`
- Маппинг service_function ID → feature key:
  - `1` → `has_booking_page`
  - `2` → `has_extended_stats`
  - `3` → `has_loyalty_access`
  - `4` → `has_finance_access`
  - `5` → `has_client_restrictions`
  - `6` → `can_customize_domain`
- Проверка: План подписки содержит `features.service_functions` массив с ID функций
- Специальные случаи:
  - `is_always_free` пользователи → все функции доступны
  - Без подписки → только `has_booking_page = true`, остальное `false`

**Дополнительный endpoint для получения планов:**
- `GET /api/subscription-plans/available?subscription_type=master`
- Возвращает список планов с `features.service_functions` и `display_name`
- Используется для функции `getCheapestPlanForFeature()`

---

### 2. Web Frontend: Реализация

**Хук:** `frontend/src/hooks/useMasterSubscription.js`
- Вызывает: `GET /api/master/subscription/features`
- Возвращает булевы флаги:
  - `hasFinanceAccess`
  - `hasExtendedStats`
  - `hasLoyaltyAccess`
  - `hasClientRestrictions`
  - `canCustomizeDomain`
  - и др.

**Использование в компонентах:**
- `frontend/src/pages/MasterDashboard.jsx:1024`
  - `const { hasFinanceAccess, hasExtendedStats, hasLoyaltyAccess } = useMasterSubscription()`
  - Условный рендеринг кнопок в сайдбаре
  - Для недоступных функций: disabled UI + tooltip с текстом "Доступно в подписке {planName}"

**Утилита для получения названия плана:**
- `frontend/src/utils/getCheapestPlanForFeature.js`
- `getCheapestPlanForFeature(plans, serviceFunctionId)`
- Находит самый дешевый план с нужной функцией
- Используется для текста подсказки

**Пример использования в вебе:**
```jsx
{hasFinanceAccess ? (
  <button onClick={...}>💰 Финансы</button>
) : (
  <div className="cursor-not-allowed">
    💰 Финансы
    <span className="tooltip">
      {getCheapestPlanForFeature(subscriptionPlans, 4)}
    </span>
  </div>
)}
```

---

### 3. Mobile: Текущее состояние

**Существующие API сервисы:**
- `mobile/src/services/api/subscriptions.ts` - есть `fetchCurrentSubscription()`, `fetchAvailableSubscriptions()`
- `mobile/src/services/api/master.ts` - есть методы для услуг, статистики, баланса

**Отсутствует:**
- ❌ Метод для получения features (`/api/master/subscription/features`)
- ❌ Хук `useFeatureAccess` или аналог
- ❌ Компонент `FeatureLock`
- ❌ Интеграция feature gates в экраны

**Текущие экраны:**
- `mobile/app/master/services.tsx` - список услуг (не компактный)
- `mobile/app/master/finance.tsx` - финансы (базовый функционал)
- `mobile/app/master/stats.tsx` - статистика (базовый функционал)
- `mobile/app/master/loyalty.tsx` - лояльность (базовый функционал)

**Утилита форматирования денег:**
- ✅ `mobile/src/utils/money.ts` - `formatMoney()` уже существует и соответствует требованиям

---

## ЧАСТЬ 1: ПЛАН РАБОТЫ

### Задача 1: Компактная верстка "Мои услуги"

**Файлы для изменения:**
- `mobile/app/master/services.tsx`

**Текущая структура:**
- Категории отображаются как `Card` компоненты
- Услуги внутри категорий как отдельные строки
- Много вертикального пространства

**Требуемые изменения:**
1. Accordion для категорий (сворачиваемые по умолчанию)
2. Компактные строки услуг (название + цена справа, длительность мелко)
3. Swipe actions для редактирования/удаления
4. Применить `formatMoney()` для цен
5. Минимальная высота строки: 44pt

**Новые компоненты:**
- `ServiceRow` - компактная строка услуги
- `CategoryAccordion` - сворачиваемая категория

---

### Задача 2: Feature Access Layer

**Новые файлы:**
1. `mobile/src/services/api/master.ts` - добавить метод:
   ```typescript
   export interface MasterFeatures {
     has_booking_page: boolean;
     has_unlimited_bookings: boolean;
     has_extended_stats: boolean;
     has_loyalty_access: boolean;
     has_finance_access: boolean;
     has_client_restrictions: boolean;
     can_customize_domain: boolean;
     max_page_modules: number;
     stats_retention_days: number;
     plan_name: string | null;
     plan_id: number | null;
     current_page_modules: number;
     can_add_more_modules: boolean;
   }
   
   export async function getMasterFeatures(): Promise<MasterFeatures>
   ```

2. `mobile/src/hooks/useFeatureAccess.ts` - хук:
   ```typescript
   export function useFeatureAccess(featureKey: string): {
     allowed: boolean;
     planName: string | null;
     message: string;
   }
   ```

3. `mobile/src/components/FeatureLock.tsx` - компонент-обертка:
   ```typescript
   <FeatureLock feature="has_finance_access" fallbackMessage="...">
     <Button>...</Button>
   </FeatureLock>
   ```

**Интеграция:**
- `mobile/app/master/services.tsx` - ограничить создание/редактирование
- `mobile/app/master/finance.tsx` - ограничить действия (вывод средств)
- `mobile/app/master/stats.tsx` - ограничить экспорт
- `mobile/app/master/loyalty.tsx` - ограничить управление программой

**Для получения названия плана:**
- Добавить метод `getCheapestPlanForFeature()` в `mobile/src/utils/featureAccess.ts`
- Использовать `fetchAvailableSubscriptions()` для получения списка планов

---

### Задача 3: Наполнение экранов

**Финансы (`mobile/app/master/finance.tsx`):**
- ✅ Баланс уже есть
- ✅ Операции уже есть
- ➕ Добавить: сводку за период (доходы/расходы/прибыль)
- ➕ Добавить: кнопку "Вывести средства" (с feature gate)

**Статистика (`mobile/app/master/stats.tsx`):**
- ✅ Базовые метрики уже есть
- ✅ Топ услуг уже есть (из `DashboardStats`)
- ➕ Улучшить: переключатель "По записям / По доходу" (уже есть в дашборде)

**Лояльность (`mobile/app/master/loyalty.tsx`):**
- ✅ Базовый функционал есть
- ➕ Улучшить: обработка пустых состояний
- ➕ Добавить: feature gates для управления

---

## ЧАСТЬ 2: КРИТИЧЕСКИЕ МОМЕНТЫ

### ⚠️ НЕ ХАРДКОДИТЬ:
- ❌ Список feature keys (использовать из API)
- ❌ Названия тарифов (использовать `plan_name` из API)
- ❌ Маппинг "если Free → нельзя" (использовать булевы флаги из API)

### ✅ ИСПОЛЬЗОВАТЬ:
- ✅ Endpoint `/api/master/subscription/features` как единственный источник правды
- ✅ Булевы флаги из ответа API
- ✅ `plan_name` из ответа для текста подсказки
- ✅ `getCheapestPlanForFeature()` для получения названия плана (если нужен другой план)

### 🔄 КЕШИРОВАНИЕ:
- Использовать `AsyncStorage` для кеширования features
- Обновлять при:
  - Старте приложения
  - Фокусе экрана (опционально)
  - После покупки подписки

---

## ЧАСТЬ 3: ПОРЯДОК РЕАЛИЗАЦИИ

1. **Feature Access Layer** (приоритет 1)
   - Добавить API метод
   - Создать хук
   - Создать компонент FeatureLock
   - Протестировать на одном экране

2. **Компактная верстка услуг** (приоритет 2)
   - Accordion для категорий
   - Компактные строки
   - Swipe actions

3. **Наполнение экранов** (приоритет 3)
   - Финансы: сводка + кнопка вывода
   - Статистика: улучшить UI
   - Лояльность: улучшить обработку ошибок

4. **Интеграция feature gates** (приоритет 4)
   - Применить FeatureLock ко всем экранам
   - Добавить подсказки при тапе на disabled элементы

---

## ЧАСТЬ 4: ПРИМЕРЫ PAYLOAD

**GET /api/master/subscription/features:**
```json
{
  "has_booking_page": true,
  "has_unlimited_bookings": false,
  "has_extended_stats": false,
  "has_loyalty_access": false,
  "has_finance_access": false,
  "has_client_restrictions": false,
  "can_customize_domain": false,
  "max_page_modules": 0,
  "stats_retention_days": 30,
  "plan_name": null,
  "plan_id": null,
  "current_page_modules": 0,
  "can_add_more_modules": false
}
```

**GET /api/subscription-plans/available?subscription_type=master:**
```json
[
  {
    "id": 1,
    "name": "Free",
    "display_name": "Бесплатный",
    "price_1month": 0,
    "features": {
      "service_functions": [1],
      "max_page_modules": 0
    },
    "limits": {
      "max_future_bookings": 30
    }
  },
  {
    "id": 2,
    "name": "Basic",
    "display_name": "Базовый",
    "price_1month": 500,
    "features": {
      "service_functions": [1, 4],
      "max_page_modules": 3
    },
    "limits": {
      "max_future_bookings": null
    }
  }
]
```

---

## ИТОГ

✅ Система feature gates полностью динамическая
✅ Backend уже реализован и работает
✅ Web frontend использует правильный подход
✅ Mobile нужно перенести логику без хардкода
✅ Все данные доступны через API


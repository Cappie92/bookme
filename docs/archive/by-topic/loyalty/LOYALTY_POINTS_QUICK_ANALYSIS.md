# LOYALTY Points & Quick Discounts: Анализ текущей структуры

**Дата:** 2026-01-21  
**Цель:** Сбор информации для рефакторинга POINTS (одна страница) и QUICK DISCOUNTS (grid 2x3)

---

## ШАГ 0: СБОР ИНФОРМАЦИИ

### 1. POINTS (WEB) — Текущая структура

**Файлы:**
- `frontend/src/components/MasterLoyalty.jsx` — главный компонент с табами
- `frontend/src/components/MasterLoyaltyStats.jsx` — компонент статистики
- `frontend/src/components/MasterLoyaltyHistory.jsx` — компонент истории

**Текущая структура:**
- **Табы:** `activeTab` state: `'settings' | 'stats' | 'history'` (строки 9, 172-204)
- **Загрузка settings:** `useEffect([authLoading, isAuthenticated])` → `loadSettings()` (строки 17-24, 26-84)
- **Загрузка stats:** Условный рендер `<MasterLoyaltyStats />` (строка 316) — компонент сам грузит данные
- **Загрузка history:** Условный рендер `<MasterLoyaltyHistory />` (строка 317) — компонент сам грузит данные

**UI компоненты для модалок:**
- Используется паттерн `useModal` hook (`frontend/src/hooks/useModal.js`)
- Примеры модалок: `SubscriptionModal.jsx`, `AllIssuesModal.jsx`, `AllBookingsModal.jsx`
- Паттерн: `fixed inset-0 bg-black bg-opacity-50` + `useModal` hook

**Проблемы:**
- ❌ Stats и History грузятся только при переключении таба (ленивая загрузка)
- ❌ При объединении в одну страницу нужно загружать все 3 секции сразу
- ⚠️ История имеет фильтры в UI (строки 151-226 в MasterLoyaltyHistory.jsx), которые триггерят `loadHistory()` при каждом изменении (строка 30)

---

### 2. POINTS (MOBILE) — Текущая структура

**Файл:** `mobile/app/master/loyalty.tsx`

**Текущая структура:**
- **Подтабы:** `pointsTab` state: `'settings' | 'stats' | 'history'` (строки 70, 760-785)
- **Загрузка settings:** `useEffect([featuresLoading, hasLoyaltyAccess, mainTab, token, isAuthenticated])` → `loadSettings()` (строки 353-363, 244-275)
- **Загрузка stats:** `useEffect([pointsTab, hasLoyaltyAccess, token, isAuthenticated])` → `loadStats()` только если `pointsTab === 'stats' && !stats` (строки 365-369, 277-299)
- **Загрузка history:** `useEffect([pointsTab, hasLoyaltyAccess, token, isAuthenticated, historySkip, historyClientId, historyTransactionType, historyStartDate, historyEndDate])` → `loadHistory()` только если `pointsTab === 'history'` (строки 371-376, 301-343)

**UI компоненты для модалок:**
- Используется `Modal` из `react-native` (пример: `ExpenseModal.tsx`)
- Паттерн: `<Modal visible={...} onRequestClose={...}>` + `ScrollView` внутри

**Фильтры истории:**
- Сейчас фильтры в UI (строки 936-1049)
- При изменении любого фильтра вызывается `setHistorySkip(0)` и триггерится `useEffect` → `loadHistory()` (строка 376)
- **Проблема:** При каждом вводе в TextInput происходит запрос

**Проблемы:**
- ❌ Stats грузится только при переключении на таб 'stats' и только если `!stats`
- ❌ History грузится при каждом изменении фильтров (ввод в TextInput)
- ⚠️ При объединении в одну страницу нужно загружать все 3 секции сразу, но без дублей

---

### 3. QUICK DISCOUNTS (MOBILE) — Текущая структура

**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Текущая структура:**
- **Сетка шаблонов:** `ScrollView horizontal` (строка 93)
- **Стили:** `templatesGrid: flexDirection: 'row'` (строка 282)
- **Карточки:** `templateCard: width: 160` (строка 287)
- **Описание:** `templateDescription` без ограничения строк (строка 110)

**Проблемы:**
- ❌ Горизонтальный ScrollView вместо сетки 2xN
- ❌ Карточки фиксированной ширины (160px), не адаптивные
- ❌ Описание не обрезается

---

### 4. API Contract для Points

**Backend:** `backend/routers/master_loyalty.py`

#### GET /api/master/loyalty/settings
- **Метод:** GET
- **Auth:** `require_master` (Depends)
- **Response:** `LoyaltySettingsOut` (строки 26-59)
  - `is_enabled: bool`
  - `accrual_percent: Optional[int]`
  - `max_payment_percent: Optional[int]`
  - `points_lifetime_days: Optional[int]` (может быть null для "бесконечно")

#### PUT /api/master/loyalty/settings
- **Метод:** PUT
- **Auth:** `require_master`
- **Request:** `LoyaltySettingsUpdate` (Pydantic schema)
  - `is_enabled: Optional[bool]`
  - `accrual_percent: Optional[int]` (1-100)
  - `max_payment_percent: Optional[int]` (1-100)
  - `points_lifetime_days: Optional[int]` (14/30/60/90/180/365 или null)
- **Response:** `LoyaltySettingsOut`

#### GET /api/master/loyalty/stats
- **Метод:** GET
- **Auth:** `require_master`
- **Response:** `LoyaltyStatsOut` (строки 198-220)
  - `total_earned: int`
  - `total_spent: int`
  - `current_balance: int`
  - `active_clients_count: int`

#### GET /api/master/loyalty/history
- **Метод:** GET
- **Auth:** `require_master`
- **Query params:**
  - `skip: int = 0` (пагинация)
  - `limit: int = 50` (пагинация)
  - `client_id: Optional[int]` (фильтр)
  - `transaction_type: Optional[str]` ('earned' | 'spent')
  - `start_date: Optional[str]` (YYYY-MM-DD)
  - `end_date: Optional[str]` (YYYY-MM-DD)
- **Response:** `List[LoyaltyTransactionOut]` (строки 123-197)
  - `id: int`
  - `client_id: int`
  - `client_name: Optional[str]`
  - `points: int`
  - `transaction_type: str` ('earned' | 'spent')
  - `earned_at: datetime`
  - `expires_at: Optional[datetime]`
  - `service_name: Optional[str]`
  - `booking_id: Optional[int]`

---

### 5. Потенциальные места для двойных запросов

**WEB:**
- ⚠️ При монтировании `MasterLoyalty` → `loadSettings()` (строка 23)
- ⚠️ При монтировании `MasterLoyaltyStats` → `loadStats()` (отдельный useEffect в компоненте)
- ⚠️ При монтировании `MasterLoyaltyHistory` → `loadHistory()` (отдельный useEffect в компоненте)
- ⚠️ При изменении фильтров истории → `loadHistory()` (строка 30 в MasterLoyaltyHistory.jsx: зависимости включают все фильтры)

**MOBILE:**
- ⚠️ При монтировании `mainTab === 'points'` → `loadSettings()` (строка 360)
- ⚠️ При переключении `pointsTab === 'stats'` → `loadStats()` (строка 366, но только если `!stats`)
- ⚠️ При переключении `pointsTab === 'history'` → `loadHistory()` (строка 372)
- ⚠️ При изменении любого фильтра истории → `loadHistory()` (строка 376: все фильтры в зависимостях)

**Риски после рефакторинга:**
1. Если объединить в одну страницу и загружать все 3 секции при монтировании → может быть 3 запроса одновременно (но это нормально, если они независимые)
2. Если фильтры истории останутся в зависимостях useEffect → будет запрос при каждом вводе
3. Если stats/history будут грузиться при монтировании, но потом при изменении `is_enabled` не перезагружаться → может быть устаревшая статистика

---

## ПЛАН ИСПРАВЛЕНИЙ

### A) POINTS ONE-PAGE (WEB)

**Изменения:**
1. Убрать табы (строки 172-204)
2. Объединить контент в одну страницу:
   - Switch "Баллы включены" (сверху)
   - Компактная форма настроек (если `is_enabled`)
   - Статистика (всегда видима, но можно disabled если `!is_enabled`)
   - История (всегда видима)
3. Фильтры истории → в модалку (кнопка "Фильтры")
4. Загрузка: при монтировании загружать settings + stats + history (если auth готов)
5. Фильтры истории: не триггерить запрос при вводе, только после "Применить" в модалке

**Файлы для изменения:**
- `frontend/src/components/MasterLoyalty.jsx` — основной рефакторинг
- `frontend/src/components/MasterLoyaltyStats.jsx` — можно оставить как компонент, но убрать отдельную загрузку
- `frontend/src/components/MasterLoyaltyHistory.jsx` — можно оставить как компонент, но убрать отдельную загрузку и фильтры из UI

---

### B) POINTS ONE-PAGE (MOBILE)

**Изменения:**
1. Убрать подтабы (строки 760-785)
2. Объединить контент в одну страницу (ScrollView)
3. Фильтры истории → в Modal (кнопка "Фильтры")
4. Загрузка: при монтировании `mainTab === 'points'` загружать settings + stats + history
5. Фильтры истории: не триггерить запрос при вводе, только после "Применить"

**Файлы для изменения:**
- `mobile/app/master/loyalty.tsx` — основной рефакторинг
- Создать `mobile/src/components/loyalty/HistoryFiltersModal.tsx` — новый компонент модалки

---

### C) QUICK DISCOUNTS GRID 2 COLS (MOBILE)

**Изменения:**
1. Заменить `ScrollView horizontal` на `FlatList` с `numColumns={2}`
2. Карточки: `minHeight: 180-220`, `flex: 1` для равной ширины
3. Описание: `numberOfLines={3}`

**Файлы для изменения:**
- `mobile/src/components/loyalty/DiscountsQuickTab.tsx` — строки 92-178

---

## СЛЕДУЮЩИЕ ШАГИ

После этого анализа переходим к реализации:
1. ШАГ 1: POINTS ONE-PAGE (WEB)
2. ШАГ 2: POINTS ONE-PAGE (MOBILE)
3. ШАГ 3: QUICK DISCOUNTS GRID (MOBILE)
4. ШАГ 4: SMOKE CHECKLIST

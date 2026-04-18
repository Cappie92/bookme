# Gap-отчёт: Дашборд мастера WEB vs MOBILE

## Оглавление

**Часть A. Baseline (до правок)**
- [1. Карта дашборда WEB](#1-карта-дашборда-web)
- [2. Карта дашборда MOBILE (baseline)](#2-карта-дашборда-mobile-baseline)
- [3. Сравнительная таблица по блокам (baseline)](#3-сравнительная-таблица-по-блокам-baseline)
- [4. Список GAP'ов (baseline)](#4-список-gapов-baseline)
- [5. Приоритизация P0/P1/P2](#5-приоритизация-p0p1p2)

**Часть B. After changes (после правок)**
- [6. Внесённые изменения](#6-внесённые-изменения)
- [7. Smoke-тест](#7-smoke-тест)
- [8. Status по P0/P1](#8-status-по-p0p1)

**Дополнительно**
- [9. Риски и расхождения](#9-риски-и-расхождения)
- [10. План работ / Pending](#10-план-работ--pending)

---

# Часть A. Baseline (до правок)

Состояние MOBILE до внесения правок P0/P1.

---

## 1. Карта дашборда WEB

### Компоненты
| Компонент | Путь | Назначение |
|-----------|------|------------|
| Главная страница | `frontend/src/pages/MasterDashboard.jsx` | Контейнер с табами, загрузка баланса/подписки/предупреждений |
| Блок статистики дашборда | `frontend/src/components/MasterDashboardStats.jsx` | Ближайшие/прошедшие записи, статистика услуг, кнопка «Статистика» |
| Модалка «Все записи» | `frontend/src/components/AllBookingsModal.jsx` | 3 секции, «Показать ещё», фильтры |
| Popover заметки | `frontend/src/components/ui/NotePopover.jsx` | Отображение заметки клиента без модалки |
| Утилиты | `frontend/src/utils/bookingStatusDisplay.js`, `dateFormat.js`, `bookingOutcome.js` | Маппинг статусов, формат дат, логика подтверждения |

### API-вызовы (WEB)
| Блок | Endpoint | Где вызывается |
|------|----------|----------------|
| Ближайшие записи | `GET /api/master/dashboard/stats?period=week&offset=0` | MasterDashboardStats.loadDashboardStats → `stats.next_bookings_list` |
| Прошедшие записи (3 шт) | `GET /api/master/past-appointments?page=1&limit=3` | MasterDashboardStats.loadPastBookings → `data.appointments` |
| Модалка «Все записи» | `GET /api/master/bookings/future?page=1&limit=50` | AllBookingsModal.loadAllData |
| | `GET /api/master/past-appointments?page=1&limit=100` | AllBookingsModal.loadAllData |
| Настройки мастера | `GET /api/master/settings` | MasterDashboardStats.loadMasterSettings, AllBookingsModal (для auto_confirm) |
| Баланс | `GET /api/balance/` | MasterDashboard.loadBalanceAndSubscription |
| Подписка | `GET /api/balance/subscription-status` | MasterDashboard.loadBalanceAndSubscription |
| Планы подписки | `GET /api/subscription-plans/available?subscription_type=master` | MasterDashboard.loadBalanceAndSubscription |
| Неподтверждённые | `GET /api/master/accounting/pending-confirmations` | MasterSidebar (счётчик) |

### Поля из ответов (WEB)
- **dashboard/stats**: `next_bookings_list`, `top_services_by_bookings`, `top_services_by_earnings`, `weeks_data`, `top_period_range`
- **past-appointments**: `appointments` с полями: `id`, `date`, `time`, `start_time`, `client_display_name`, `client_phone`, `client_master_alias`, `client_account_name`, `has_client_note`, `client_note`, `service_name`, `status`
- **bookings/future**: `bookings` с аналогичной структурой

---

## 2. Карта дашборда MOBILE (baseline)

Состояние до правок P0/P1.

### Компоненты
| Компонент | Путь | Назначение |
|-----------|------|------------|
| Главный экран (дашборд) | `mobile/app/index.tsx` | HomeScreen — карточки ближайших/прошедших, подписка, внимание, статистика услуг |
| Модалка «Все записи» | `mobile/src/components/dashboard/AllBookingsModal.tsx` | Список с секциями, фильтры |
| Карточка записи | `mobile/src/components/bookings/BookingCardCompact.tsx` | Компактная карточка с клиентом, статусом, кнопками |
| Экран статистики | `mobile/app/master/stats.tsx` | Отдельный экран «Статистика» (графики, KPI) |

### API-вызовы (MOBILE, baseline)
| Блок | Endpoint | Проблема (baseline) |
|------|----------|---------------------|
| Ближайшие записи | `GET /api/master/bookings/detailed` | OK |
| Прошедшие записи | `getUserBookings` (detailed) + фильтр | OK |
| Модалка «Все записи» | `GET /api/master/bookings/detailed` | OK |
| **Статистика услуг** | `GET /api/master/dashboard/stats?period=week&offset=0` | ❌ `loadServicesStats` не вызывался в loadData |

### Поля (baseline)
- **bookings/detailed**: backend отдаёт `client_master_alias`, `client_account_name`, но mobile типы и UI их не использовали
- **Заметка**: Alert при клике по (i)

---

## 3. Сравнительная таблица по блокам (baseline)

| Блок | WEB | MOBILE (baseline) |
|------|-----|-------------------|
| **F) Статистика услуг** | ✅ Блок отображается | ❌ Блок не показывался (loadServicesStats не вызывался) |
| **D) AllBookingsModal** | pendingKeys, past исключает pending | ❌ Возможен дубль pending/past |
| **E) Имя клиента** | client_master_alias (зелёный), client_account_name + phone | ❌ Только client_name/phone, без alias |
| **E) Заметка** | NotePopover | ❌ Alert |
| **F) stripIndiePrefix** | ✅ В статистике услуг | ❌ Нет |

---

## 4. Список GAP'ов (baseline)

| # | GAP | Приоритет |
|---|-----|-----------|
| 1 | loadServicesStats не вызывается — блок «Статистика услуг» не отображается | P0 |
| 2 | Взаимоисключение pending/past в AllBookingsModal | P0 |
| 3 | client_master_alias / client_account_name — нет в UI | P1 |
| 4 | Заметка через Alert вместо popover/sheet | P1 |
| 5 | stripIndiePrefix для названий услуг | P1 |
| 6 | Кнопка «Статистика» на дашборде | P1 |
| 7 | Пагинация «Показать ещё» в AllBookingsModal | P2 |
| 8 | Переход на future + past-appointments | P2 |
| 9 | BookingConfirmations | P2 |

---

## 5. Приоритизация P0/P1/P2

| # | GAP | Приоритет | Обоснование |
|---|-----|-----------|-------------|
| 1 | Вызов loadServicesStats в mobile index | **P0** | Блок «Статистика услуг» не отображается — очевидный баг |
| 2 | Взаимоисключение B/C в mobile AllBookingsModal | **P0** | Дублирование записей в разных секциях — логическая ошибка |
| 3 | client_master_alias / client_account_name в mobile | **P1** | Консистентность отображения имён и alias |
| 4 | NotePopover вместо Alert в mobile | **P1** | Единообразие UX |
| 5 | stripIndiePrefix в mobile статистике | **P1** | Убрать «Инди:» в названиях |
| 6 | Кнопка «Статистика» на mobile дашборде | **P1** | Быстрый переход к графикам |
| 7–10 | Пагинация, future/past, BookingConfirmations, терминология | **P2** | Расширение / продуктовые решения |

---

# Часть B. After changes (после правок)

Правки P0/P1 внесены в код. Дата: 2025-02-05.

---

## 6. Внесённые изменения

### Изменённые файлы (mobile)

| Файл | Что поменялось |
|------|----------------|
| `mobile/app/index.tsx` | `loadServicesStats()` в loadData; NoteSheet + onNotePress; stripIndiePrefix; **WeeklyStatsCharts** внизу дашборда; getPastStatusLabel для «Прошедшие» |
| `mobile/src/components/dashboard/AllBookingsModal.tsx` | pendingKeys; NoteSheet + onNotePress; getPastStatusLabel/getPastStatusColor для pending/past; убраны showPrice |
| `mobile/src/components/dashboard/WeeklyStatsCharts.tsx` | **Новый** — блок «Статистика за неделю» (графики bookings + income), данные из servicesStats.weeks_data |
| `mobile/src/components/bookings/BookingCardCompact.tsx` | client_master_alias, client_account_name; onNotePress; **убраны длительность и стоимость** (showPrice/showDuration удалены) |
| `mobile/src/components/bookings/NoteSheet.tsx` | **Новый** — bottom-sheet для заметки |
| `mobile/src/components/schedule/DayDrawer.tsx` | NoteSheet + onNotePress |
| `mobile/src/services/api/bookings.ts` | Поля `client_master_alias`, `client_account_name`, `client_display_name` |
| `mobile/src/utils/bookingStatusDisplay.ts` | **Новый** — getPastStatusLabel, getPastStatusColor: Подтверждено/Отменено/Требует подтверждения (вместо «Завершено») |
| `mobile/src/utils/stripIndiePrefix.ts` | **Новый** — stripIndiePrefix(name) |

### Endpoints и поля (после правок)

| Блок | Endpoint | Используемые поля |
|------|----------|-------------------|
| Статистика услуг + графики | `GET /api/master/dashboard/stats?period=week&offset=0` | `top_services_by_bookings`, `top_services_by_earnings`, **weeks_data**; service_name через stripIndiePrefix |
| Ближайшие/Прошедшие/AllBookingsModal | `GET /api/master/bookings/detailed` | `id`, `start_time`, `end_time`, `status`, `service_name`, `client_master_alias`, `client_account_name`, `client_phone`, `client_name`, `has_client_note`, `client_note`, `payment_amount` и др. |

### Проверка в коде (grep)

| Проверка | Результат |
|----------|-----------|
| loadServicesStats() в loadData | ✅ `mobile/app/index.tsx:98` — в Promise.all |
| pendingKeys и past исключает pending | ✅ `AllBookingsModal.tsx:50-70` — getBookingKey, pendingKeys Set, `if (pendingKeys.has(getBookingKey(b))) continue` |
| client_master_alias, client_account_name в Booking | ✅ `bookings.ts:49-50`; `BookingCardCompact.tsx:57-59` — alias зелёным, иначе account + phone |
| NoteSheet вместо Alert | ✅ `NoteSheet.tsx`; подключён в `index.tsx`, `AllBookingsModal.tsx`, `DayDrawer.tsx` |
| stripIndiePrefix | ✅ `stripIndiePrefix.ts`; `index.tsx:565,581` — для service_name в статистике |

---

## 7. Smoke-тест

### Шаги проверки

1. **Ресэд (при необходимости) + логин мастером.**
2. **Дашборд (mobile/app/index.tsx):**
   - В прошедших карточках **нет** строки с длительностью/стоимостью.
   - У прошедших записей бейджи: **Подтверждено** / **Отменено** / **Требует подтверждения** (без «Завершено»).
   - Прокрутить вниз → блок «Статистика услуг» виден; переключатель «По записям» / «По доходу» работает.
   - В названиях услуг нет префикса «Инди:».
   - **Самый низ дашборда**: блок «Статистика за неделю» с двумя графиками (записи, доход), данные отображаются.
3. **AllBookingsModal («Все записи»):**
   - Нет duration/price в карточках; статусы: Подтверждено / Отменено / Требует подтверждения; терминология единая.
   - Одна и та же запись не в двух секциях.
   - Имя клиента: при наличии alias — зелёным; иначе account_name + phone.
4. **Заметка (i):** открывается NoteSheet (не Alert); закрытие: тап вне или ✕; пустая → «Заметки нет».

5. **Проверка:** нигде в прошедших списках не осталось «Завершено».

### Визуальные изменения

| До | После |
|----|-------|
| Блок «Статистика услуг» отсутствует | Блок виден с топ-5 услуг (2 вкладки) |
| «Инди: Стрижка» в статистике | «Стрижка» |
| Одна запись в двух секциях модалки | Запись только в одной секции |
| «Клиент» или client_name без alias | Alias зелёным или account_name · phone |
| Alert при клике (i) | NoteSheet (bottom-sheet) |
| Карточки: 30 мин · 1000 ₽ | **Убрано** — только услуга, клиент, дата/время, статус, действия |
| Статус «Завершено» в прошедших | **«Подтверждено»** (completed/confirmed → Подтверждено; cancelled → Отменено; pending → Требует подтверждения) |
| Нет графиков на дашборде | **Блок «Статистика за неделю»** внизу (записи + доход), данные из weeks_data |

---

## 8. Status по P0/P1

| # | GAP | Status | Примечание |
|---|-----|--------|------------|
| 1 | loadServicesStats в loadData | ✅ done | Вызов в Promise.all, блок отображается |
| 2 | pendingKeys в AllBookingsModal | ✅ done | past исключает pending |
| 3 | client_master_alias / client_account_name | ✅ done | Alias зелёным, account + phone |
| 4 | NoteSheet вместо Alert | ✅ done | NoteSheet в index, AllBookingsModal, DayDrawer |
| 5 | stripIndiePrefix | ✅ done | Утилита + применение в статистике |
| 6 | Кнопка «Статистика» | ⏳ not done | P1, не реализовано |
| 6a | Графики «Статистика за неделю» на дашборде | ✅ done | WeeklyStatsCharts внизу, weeks_data из loadServicesStats |
| 6b | Минимализм карточек (без duration/price) | ✅ done | Убрано из BookingCardCompact |
| 6c | Статусы: Подтверждено вместо Завершено | ✅ done | bookingStatusDisplay.ts, getPastStatusLabel |
| 7–10 | Пагинация, future/past, BookingConfirmations, терминология | ⏳ not done | P2 |

---

## 9. Риски и расхождения

### Источники данных
- WEB: next_bookings_list, past-appointments (разные endpoints).
- MOBILE: detailed (один endpoint, фильтрация на клиенте).

### Таймзоны
- Frontend: `new Date()`. Backend: `datetime.utcnow()` — возможны расхождения.

### Пагинация
- MOBILE: один запрос detailed — при 500+ записях возможны задержки.

---

## 10. План работ / Pending

### P1 (не сделано)
- Кнопка «Статистика» на дашборде → `router.push('/master/stats')`.

### P2
- Пагинация «Показать ещё» в AllBookingsModal.
- Переход mobile на future + past-appointments.
- BookingConfirmations.
- Унификация терминологии.

### Референс (WEB)
- `frontend/src/components/MasterDashboardStats.jsx`
- `frontend/src/components/AllBookingsModal.jsx`
- `frontend/src/utils/bookingStatusDisplay.js`
- `frontend/src/components/ui/NotePopover.jsx`

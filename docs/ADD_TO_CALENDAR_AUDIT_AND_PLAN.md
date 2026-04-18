# Add to Calendar — Аудит и план реализации

## 1) AUDIT ANSWERS

### Q1. Какая каноническая форма времени у booking в API?

**Хранение в БД:** `Booking.start_time`, `Booking.end_time` — колонки `DateTime` без timezone (naive). По конвенции проекта используется **UTC** (см. `datetime.utcnow` в `backend/models.py`, `backend/routers/*.py`).

**Сериализация в API:** Python `datetime.isoformat()` — ISO 8601 без суффикса `Z` (naive интерпретируется как UTC). Пример: `"2025-02-05T14:30:00"`.

**Конвертация таймзоны:**
- `backend/routers/client.py:49-66` — `get_master_timezone(booking)` возвращает IANA TZID мастера (или салона/indie fallback).
- `backend/routers/client.py:132-137` — при `tzinfo is None` время трактуется как UTC: `pytz.UTC.localize(b.start_time).astimezone(pytz.timezone(master_timezone))`.
- Конвертация выполняется только на read-path (future/past) для сравнения «прошло/будущее»; в ответ API уходит исходный naive datetime (ISO без Z).

**Вывод:** В API — naive ISO datetime (подразумевается UTC). Для ICS нужна конвертация в таймзону мастера на стороне генератора.

---

### Q2. Где хранится таймзона мастера?

| Слой | Поле | Формат |
|------|------|--------|
| **DB** | `masters.timezone` | `backend/models.py:177` — `Column(String, nullable=True)` |
| **DB** | `indie_masters.timezone` | `backend/models.py:237` — default `"Europe/Moscow"` |
| **DB** | `salons.timezone` | `backend/models.py:105` — default `"Europe/Moscow"` |
| **API** | В payload профиля мастера | `backend/routers/master.py:656` — `"timezone": master.timezone` |
| **API** | В client bookings | **Нет** — `BookingFutureShortCanon` / `BookingPastShortCanon` не содержат `master_timezone` |

**Формат:** IANA TZID (например `Europe/Moscow`), не offset.

**Reseed:** `backend/scripts/reseed_local_test_data.py:28-29` — `TIMEZONE = "Europe/Moscow"`, `CITY = "Москва"`; при регистрации мастера передаётся `"timezone": TIMEZONE` (стр. 215).

**Команды reseed:**
```bash
# Из корня репозитория:
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Из папки backend/:
cd backend && python3 scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

**Гард на write-path:** `backend/routers/loyalty.py:234-240` — при `timezone` пустом или `timezone_confirmed=False` лояльность отклоняется. Прямого гарда «без timezone нельзя принимать записи» в `bookings`/`client` нет; логика опирается на `timezone_confirmed` в онбординге (`backend/routers/auth.py:104-106`, `backend/routers/master.py:983-988`).

---

### Q3. Есть ли эндпоинт «детали записи» и что он отдаёт по location/адресу?

**Эндпоинт:** `GET /api/bookings/{booking_id}` — `backend/routers/bookings.py:840-893`.

**Авторизация:** Клиент — только если `db_booking.client_id == current_user.id` (стр. 857-858).

**Схема ответа:** `BookingSchema` (`backend/schemas.py:395-426`):
- `branch_name`, `branch_address` — опциональные, заполняются из `booking.branch` при наличии.
- `get_booking` возвращает `db_booking` без явного `joinedload(Booking.branch)` — `branch_name`/`branch_address` могут быть `None`, если не подгружены через relationship.

**Location:** Адрес берётся из `SalonBranch.address` (`backend/models.py` — модель `SalonBranch`). Для solo-мастера (без салона) — `Master.address` (`backend/models.py:174`). В ответе `get_booking` эти поля могут отсутствовать, если не добавлена явная подгрузка и маппинг.

---

### Q4. Есть ли утилиты/сервисы отправки email?

**Да.** `backend/services/email_service.py`:
- Абстрактный `EmailService` с `send_email(to_email, subject, html_content)` (стр. 22).
- `MockEmailService` — заглушка, логирует в консоль (стр. 37-47).
- Глобальный экземпляр: `email_service = MockEmailService()` (стр. 99).
- `get_email_service()`, `set_email_service()` для подмены (стр. 102-108).

**Использование:** `VerificationService` (`backend/services/verification_service.py`) — `send_verification_email`, `send_password_reset_email`.

**Рекомендация:** Добавить в `EmailService` метод `send_ics_to_email(to_email, subject, ics_content, filename)` и вызывать его из нового эндпоинта «Отправить ICS на email». Реализацию можно начать с заглушки в `MockEmailService`.

---

### Q5. Где в backend меняется статус записи?

| Эндпоинт | Файл:строки | Роль | Действие |
|----------|-------------|------|----------|
| `DELETE /api/client/bookings/{id}` | `backend/routers/client.py:701-727` | client | Отмена: `booking.status = CANCELLED` |
| `PUT /api/client/bookings/{id}` | `backend/routers/client.py:628-677` | client | Обновление (в т.ч. время); статус не меняется напрямую |
| `PUT /api/bookings/{id}` | `backend/routers/bookings.py:555-633` | client/master | Обновление записи |
| `POST /api/accounting/confirm-booking/{id}` | `backend/routers/accounting.py:798-947` | master | CREATED/AWAITING_CONFIRMATION → COMPLETED |
| `POST /api/accounting/cancel-booking/{id}` | `backend/routers/accounting.py:1014-1068` | master | CREATED/CONFIRMED/AWAITING_CONFIRMATION → CANCELLED |
| Pre-visit confirm (master) | `backend/routers/master.py` (логика подтверждения) | master | created → confirmed |

**Точки для UPDATE/CANCEL ICS (шаг 2):**
- После `client.cancel_booking` (стр. 726) — отправить CANCEL.
- После `accounting.confirm_booking` (стр. 880+) — отправить UPDATE (CONFIRMED).
- После `accounting.cancel_booking` (стр. 1053) — отправить CANCEL.
- При pre-visit confirm — отправить UPDATE.

---

## 2) RECOMMENDED DESIGN

### Где генерировать ICS: backend vs frontend

**Рекомендация: BACKEND.**

Обоснование:
1. **Таймзона:** На backend есть `get_master_timezone(booking)` и pytz; конвертация в TZ мастера надёжнее, чем на frontend (риск локальной TZ пользователя).
2. **Единый источник:** Время и статус хранятся в БД; backend гарантирует консистентность.
3. **Email:** Отправка ICS по email естественно делается на backend.
4. **Без новых зависимостей:** ICS — текстовый формат, генерация через шаблон/конкатенацию.

### Эндпоинты (backend)

```
GET  /api/client/bookings/{id}/calendar.ics
```
- **Авторизация:** `require_client`, `booking.client_id == current_user.id`.
- **Условие:** Только будущие записи (`start_time` в TZ мастера > now). Иначе 400.
- **Ответ:** `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="booking-{id}.ics"`.
- **Тело:** ICS с UID, DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION, STATUS, VALARM.

```
POST /api/client/bookings/{id}/calendar/email
Body: { "email": "user@example.com" }
```
- **Авторизация:** то же.
- **Поведение:** Генерация ICS + вызов `email_service.send_ics_to_email(...)`. Пока — заглушка (логирование).
- **Если у клиента нет email:** UI спрашивает «на какую почту отправить» и передаёт в body.

### Google Calendar URL

Формат: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&location=...`

**Даты:** `YYYYMMDDTHHMMSSZ` (UTC). Backend конвертирует `start_time`/`end_time` из UTC в UTC же (они уже в UTC), но для отображения в календаре пользователя нужно, чтобы Google интерпретировал время корректно. Безопасный вариант: передавать в UTC (`Z`), тогда Google покажет в TZ пользователя. Альтернатива: передавать в TZ мастера — тогда нужен offset в URL (сложнее). **Рекомендация:** использовать UTC в URL; пользователь увидит время в своей TZ в Google Calendar.

### Поля ICS-события

| Поле | Значение |
|------|----------|
| UID | `dedato-booking-{id}@dedato` (стабильный) |
| DTSTART | В TZ мастера: `TZID=Europe/Moscow:20250205T143000` или UTC: `20250205T113000Z` |
| DTEND | Аналогично |
| SUMMARY | `{service_name} — {master_name}` |
| DESCRIPTION | Опционально: салон, филиал, контакты |
| LOCATION | `branch_address` или `master.address` или пусто |
| STATUS | TENTATIVE (created/awaiting) / CONFIRMED (confirmed) / CANCELLED |
| SEQUENCE | 0 при создании; инкремент при UPDATE |
| VALARM | TRIGGER:-PT60M (за 1 час) по умолчанию |

### UPDATE/CANCEL (шаг 2)

- Тот же UID, SEQUENCE++, STATUS=CANCELLED или CONFIRMED.
- Триггер: после `client.cancel_booking`, `accounting.confirm_booking`, `accounting.cancel_booking`.
- Механизм: очередь задач или синхронный вызов сервиса «отправить ICS update» (пока заглушка). Клиенты, уже импортировавшие ICS, получат обновление при следующей синхронизации (если календарь поддерживает).

---

## 3) UI PLAN (WEB)

### Компонент

`frontend/src/pages/ClientDashboard.jsx` — таблица «Будущие записи» (стр. 1034-1178).

Столбец «Действия» (стр. 1115-1166): кнопки Favorite, Edit (PencilIcon), Delete (TrashIcon).

### Изменения

1. **Добавить кнопку «Календарь»** в `flex` с Edit и Delete (стр. 1147-1165).
2. **При клике:** открыть `DropdownMenu` или `Popover`:
   - «Google Calendar» — `window.open(googleCalendarUrl)`.
   - «Скачать .ics» — `fetch(/api/client/bookings/${id}/calendar.ics)` с credentials, затем `blob()` + создание ссылки на скачивание.
   - «Отправить на email…» — открыть модалку с полем email.
3. **Модалка email:**
   - Если `currentUser.email` есть — подставлять по умолчанию, кнопка «Отправить».
   - Если нет — placeholder «Введите email», обязательное поле.
   - При отправке: `POST /api/client/bookings/{id}/calendar/email` с `{ "email": "..." }`.
4. **Источник данных:**
   - `master_timezone` — **отсутствует** в `futureBookings`. Нужно добавить в API или получать из `GET /api/bookings/{id}` при открытии меню.
   - **Минимальное изменение API:** добавить `master_timezone` в `BookingFutureShortCanon` (backend) и в ответ `GET /api/client/bookings/`.
   - `branch_address` / `master.address` — уже есть в `branch_address` для салонных записей; для solo — можно добавить `master_address` в схему при необходимости.

### Файлы

- `frontend/src/pages/ClientDashboard.jsx` — кнопка, меню, модалка.
- `frontend/src/utils/api.js` — при необходимости обёртки для `getCalendarIcs`, `sendCalendarEmail`.
- Новый компонент `AddToCalendarMenu.jsx` или инлайн в ClientDashboard.

---

## 4) UI PLAN (MOBILE)

### Компоненты

- `mobile/app/client/dashboard.tsx` — список будущих записей (стр. 155-176).
- `mobile/src/components/client/BookingRowFuture.tsx` — карточка с раскрывающимся блоком (Правка, Отмена).

### Изменения

1. **Добавить кнопку «Добавить в календарь»** в `actionsPanel` (стр. 111-136 в `BookingRowFuture.tsx`), рядом с Правка/Отмена.
2. **При нажатии:** `ActionSheet` (или аналог):
   - «Google Calendar» — `Linking.openURL(googleCalendarUrl)`.
   - «Скачать .ics» / «Поделиться» — `Share.share` с `url` от `GET .../calendar.ics` (нужен публичный URL или data URL; проще — сохранить в файл и `Share.share` с file).
   - «Отправить на email» — навигация к экрану/модалке ввода email, затем `POST .../calendar/email`.
3. **Источник данных:**
   - `master_timezone` — как и для web, нужен в ответе API.
   - `branch_address` — уже есть в `booking.branch_address`.

### Файлы

- `mobile/src/components/client/BookingRowFuture.tsx` — кнопка в `actionsPanel`, вызов ActionSheet.
- `mobile/app/client/dashboard.tsx` — при необходимости колбэк `onAddToCalendar(booking)`.
- Новый хук или утилита `useAddToCalendar(booking)` для формирования URL и вызова API.

---

## 5) GAPS / TODO

| Проблема | Решение |
|----------|---------|
| `master_timezone` отсутствует в client bookings API | Добавить в `BookingFutureShortCanon` и в логику сборки ответа в `client.py` (из `get_master_timezone(b)`). |
| `GET /api/bookings/{id}` может не возвращать `branch_address` | Добавить `joinedload(Booking.branch)` и при необходимости `joinedload(Booking.master)` в `get_booking`; убедиться, что schema получает `branch_name`, `branch_address` из relationship. |
| Email у клиента | Проверить наличие `current_user.email` в API; при отсутствии — UI всегда показывает поле ввода. |
| Гард «мастер без timezone не принимает записи» | Добавить проверку в write-path создания брони (например в `bookings.py` или `client.py`): если у мастера нет `timezone` или `timezone_confirmed` — 400. |
| Google Calendar URL с TZ | Использовать UTC в `dates=...Z`; пользователь увидит время в своей TZ. Для точного отображения в TZ мастера потребуется отдельная логика (опционально). |

### Минимальные правки API

1. **BookingFutureShortCanon** (`backend/schemas.py`): добавить `master_timezone: Optional[str] = None`.
2. **client.py** `get_future_bookings` / `get_past_bookings`: передавать `master_timezone=get_master_timezone(b)` в каждый элемент.
3. **Новый роутер** `client/bookings/{id}/calendar.ics` и `client/bookings/{id}/calendar/email` в `backend/routers/client.py` (или отдельный модуль).
4. **EmailService**: метод `send_ics_to_email` (заглушка в MockEmailService).

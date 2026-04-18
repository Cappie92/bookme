# LOYALTY Test Readiness Pack (WEB + MOBILE)

**Дата:** 2026-01-21  
**Версия:** После P0 + P1 фиксов  
**Статус:** READY FOR TESTING

---

## 1. Manual Test Plan (20-25 шагов)

### WEB: Discounts (Quick) — Full CRUD + Toggle

#### Test 1: List Quick Discounts
**Шаги:**
1. Открыть `/master?tab=loyalty` (или эквивалентный роут)
2. Перейти на вкладку "Скидки"
3. Выбрать подвкладку "Быстрые"

**Expected Results:**
- ✅ Список быстрых скидок отображается
- ✅ Видны шаблоны (если есть) и активные скидки
- ✅ Нет ошибок в консоли

**Network Calls:**
- `GET /api/loyalty/templates` (может быть 404 — это ок)
- `GET /api/loyalty/status` → `quick_discounts` в ответе

---

#### Test 2: Create Quick Discount (из шаблона)
**Шаги:**
1. В разделе "Быстрые" найти шаблон (например, "Первое посещение")
2. Нажать кнопку "Активировать" (или эквивалентную)
3. Подтвердить создание

**Expected Results:**
- ✅ Скидка создана и появилась в списке активных
- ✅ Скидка имеет `is_active: true`
- ✅ После создания список обновлён

**Network Calls:**
- `POST /api/loyalty/quick-discounts` с payload:
  ```json
  {
    "discount_type": "quick",
    "name": "...",
    "description": "...",
    "discount_percent": 10,
    "max_discount_amount": null,
    "conditions": [...],
    "is_active": true,
    "priority": 1
  }
  ```
- `GET /api/loyalty/status` (refresh после создания)

---

#### Test 3: Update Quick Discount (процент)
**Шаги:**
1. В списке активных быстрых скидок найти скидку
2. Нажать кнопку редактирования (карандаш) или inline edit
3. Изменить процент скидки (например, с 10% на 15%)
4. Сохранить изменения

**Expected Results:**
- ✅ Процент обновлён в UI
- ✅ Список обновлён после сохранения
- ✅ Нет ошибок валидации

**Network Calls:**
- `PUT /api/loyalty/quick-discounts/{id}` с payload:
  ```json
  {
    "discount_percent": 15
  }
  ```
- `GET /api/loyalty/status` (refresh)

---

#### Test 4: Toggle Quick Discount (is_active)
**Шаги:**
1. В списке активных быстрых скидок найти скидку с `is_active: true`
2. Нажать toggle/чекбокс для деактивации
3. Проверить, что скидка исчезла из активных (или помечена как неактивная)

**Expected Results:**
- ✅ `is_active` изменён на `false`
- ✅ Скидка не применяется (или визуально помечена)
- ✅ Список обновлён

**Network Calls:**
- `PUT /api/loyalty/quick-discounts/{id}` с payload:
  ```json
  {
    "is_active": false
  }
  ```
- `GET /api/loyalty/status` (refresh)

---

#### Test 5: Delete Quick Discount
**Шаги:**
1. В списке активных быстрых скидок найти скидку
2. Нажать кнопку "Удалить" (корзина)
3. Подтвердить удаление в диалоге

**Expected Results:**
- ✅ Скидка удалена из списка
- ✅ Список обновлён
- ✅ Нет ошибок

**Network Calls:**
- `DELETE /api/loyalty/quick-discounts/{id}`
- `GET /api/loyalty/status` (refresh)

---

### WEB: Discounts (Complex) — Create + Delete

#### Test 6: List Complex Discounts
**Шаги:**
1. Перейти на подвкладку "Сложные"

**Expected Results:**
- ✅ Список сложных скидок отображается
- ✅ Видны условия (conditions) в человекочитаемом виде

**Network Calls:**
- `GET /api/loyalty/status` → `complex_discounts` в ответе

---

#### Test 7: Create Complex Discount
**Шаги:**
1. Нажать кнопку "Создать сложную скидку"
2. Заполнить форму:
   - Название
   - Описание
   - Процент скидки
   - Условия (conditions)
3. Сохранить

**Expected Results:**
- ✅ Скидка создана и появилась в списке
- ✅ Условия отображаются корректно
- ✅ Список обновлён

**Network Calls:**
- `POST /api/loyalty/complex-discounts` с payload:
  ```json
  {
    "discount_type": "complex",
    "name": "...",
    "description": "...",
    "discount_percent": 15,
    "max_discount_amount": null,
    "conditions": [...],
    "is_active": true,
    "priority": 1
  }
  ```
- `GET /api/loyalty/status` (refresh)

---

#### Test 8: Delete Complex Discount
**Шаги:**
1. В списке сложных скидок найти скидку
2. Нажать "Удалить"
3. Подтвердить

**Expected Results:**
- ✅ Скидка удалена
- ✅ Список обновлён

**Network Calls:**
- `DELETE /api/loyalty/complex-discounts/{id}`
- `GET /api/loyalty/status` (refresh)

---

### WEB: Discounts (Personal) — Create + Delete

#### Test 9: List Personal Discounts
**Шаги:**
1. Перейти на подвкладку "Персональные"

**Expected Results:**
- ✅ Список персональных скидок отображается
- ✅ Видны client_phone, discount_percent

**Network Calls:**
- `GET /api/loyalty/status` → `personal_discounts` в ответе

---

#### Test 10: Create Personal Discount
**Шаги:**
1. Нажать "Создать персональную скидку"
2. Заполнить форму:
   - Телефон клиента
   - Процент скидки
   - Максимальная сумма (опционально)
   - Описание
3. Сохранить

**Expected Results:**
- ✅ Скидка создана
- ✅ Клиент найден по телефону (или ошибка 404 если не найден)
- ✅ Список обновлён

**Network Calls:**
- `POST /api/loyalty/personal-discounts` с payload:
  ```json
  {
    "client_phone": "+79991234567",
    "discount_percent": 20,
    "max_discount_amount": null,
    "description": "...",
    "is_active": true
  }
  ```
- `GET /api/loyalty/status` (refresh)

---

#### Test 11: Delete Personal Discount
**Шаги:**
1. В списке персональных скидок найти скидку
2. Нажать "Удалить"
3. Подтвердить

**Expected Results:**
- ✅ Скидка удалена
- ✅ Список обновлён

**Network Calls:**
- `DELETE /api/loyalty/personal-discounts/{id}`
- `GET /api/loyalty/status` (refresh)

---

### WEB: Points — Settings / Stats / History

#### Test 12: Points Settings
**Шаги:**
1. Перейти на вкладку "Баллы"
2. Выбрать подвкладку "Настройки"
3. Изменить параметры:
   - `is_enabled` (чекбокс)
   - `accrual_percent` (1-100)
   - `max_payment_percent` (1-100)
   - `points_lifetime_days` (14/30/60/90/180/365)
4. Сохранить

**Expected Results:**
- ✅ Форма отображается со всеми полями
- ✅ Валидация работает (проценты 1-100)
- ✅ Сохранение успешно
- ✅ Success message отображается

**Network Calls:**
- `GET /api/master/loyalty/settings` (загрузка)
- `PUT /api/master/loyalty/settings` с payload:
  ```json
  {
    "is_enabled": true,
    "accrual_percent": 5,
    "max_payment_percent": 50,
    "points_lifetime_days": 30
  }
  ```

---

#### Test 13: Points Stats
**Шаги:**
1. Перейти на подвкладку "Статистика"

**Expected Results:**
- ✅ Отображаются метрики:
  - Выдано баллов (total_earned)
  - Списано баллов (total_spent)
  - Текущий баланс (current_balance)
  - Активных клиентов (active_clients_count)

**Network Calls:**
- `GET /api/master/loyalty/stats`

---

#### Test 14: Points History (с фильтрами и пагинацией)
**Шаги:**
1. Перейти на подвкладку "История"
2. Применить фильтры:
   - client_id: 123
   - transaction_type: "earned"
   - start_date: 2026-01-01
   - end_date: 2026-01-31
3. Нажать "Сбросить фильтры"
4. Нажать "Вперед" для пагинации
5. Нажать "Назад"

**Expected Results:**
- ✅ Фильтры применяются корректно
- ✅ Список обновляется при изменении фильтров
- ✅ `skip` сбрасывается в 0 при изменении фильтров
- ✅ Пагинация работает (Назад/Вперед)
- ✅ Отображается диапазон "Показано X - Y операций"

**Network Calls:**
- `GET /api/master/loyalty/history?skip=0&limit=50` (базовая загрузка)
- `GET /api/master/loyalty/history?client_id=123&transaction_type=earned&start_date=2026-01-01&end_date=2026-01-31&skip=0&limit=50` (с фильтрами)
- `GET /api/master/loyalty/history?skip=50&limit=50` (пагинация)

---

### MOBILE: Discounts (Quick) — Full CRUD + Toggle

#### Test 15: List Quick Discounts (Mobile)
**Шаги:**
1. Открыть экран `/master/loyalty` в мобильном приложении
2. Перейти на вкладку "Скидки"
3. Выбрать подвкладку "Быстрые"

**Expected Results:**
- ✅ Список отображается
- ✅ Нет ошибок

**Network Calls:**
- `GET /api/loyalty/templates` (может быть 404)
- `GET /api/loyalty/status` → `quick_discounts`

---

#### Test 16: Create Quick Discount (Mobile)
**Шаги:**
1. Нажать "Активировать" на шаблоне
2. Подтвердить

**Expected Results:**
- ✅ Скидка создана
- ✅ Список обновлён

**Network Calls:**
- `POST /api/loyalty/quick-discounts`
- `GET /api/loyalty/status` (refresh)

---

#### Test 17: Update/Toggle/Delete Quick Discount (Mobile)
**Шаги:**
1. Редактировать процент скидки
2. Toggle is_active
3. Удалить скидку

**Expected Results:**
- ✅ Все операции работают
- ✅ Список обновляется

**Network Calls:**
- `PUT /api/loyalty/quick-discounts/{id}` (update/toggle)
- `DELETE /api/loyalty/quick-discounts/{id}` (delete)
- `GET /api/loyalty/status` (refresh после каждой операции)

---

### MOBILE: Discounts (Complex/Personal) — Create + Delete

#### Test 18: Create/Delete Complex Discount (Mobile)
**Шаги:**
1. Перейти на подвкладку "Сложные"
2. Создать сложную скидку
3. Удалить скидку

**Expected Results:**
- ✅ Create работает
- ✅ Delete работает

**Network Calls:**
- `POST /api/loyalty/complex-discounts`
- `DELETE /api/loyalty/complex-discounts/{id}`
- `GET /api/loyalty/status` (refresh)

---

#### Test 19: Create/Delete Personal Discount (Mobile)
**Шаги:**
1. Перейти на подвкладку "Персональные"
2. Создать персональную скидку
3. Удалить скидку

**Expected Results:**
- ✅ Create работает
- ✅ Delete работает

**Network Calls:**
- `POST /api/loyalty/personal-discounts`
- `DELETE /api/loyalty/personal-discounts/{id}`
- `GET /api/loyalty/status` (refresh)

---

### MOBILE: Points — Settings / Stats / History

#### Test 20: Points Settings (Mobile)
**Шаги:**
1. Перейти на вкладку "Баллы"
2. Выбрать подвкладку "Настройки"
3. Изменить параметры и сохранить

**Expected Results:**
- ✅ Форма отображается
- ✅ Сохранение работает

**Network Calls:**
- `GET /api/master/loyalty/settings`
- `PUT /api/master/loyalty/settings`

---

#### Test 21: Points Stats (Mobile)
**Шаги:**
1. Перейти на подвкладку "Статистика"

**Expected Results:**
- ✅ Метрики отображаются

**Network Calls:**
- `GET /api/master/loyalty/stats`

---

#### Test 22: Points History с фильтрами и пагинацией (Mobile)
**Шаги:**
1. Перейти на подвкладку "История"
2. Применить фильтры (client_id, transaction_type, dates)
3. Использовать пагинацию

**Expected Results:**
- ✅ Фильтры работают
- ✅ Пагинация работает
- ✅ `skip` сбрасывается при изменении фильтров

**Network Calls:**
- `GET /api/master/loyalty/history?skip=0&limit=50` (базовая)
- `GET /api/master/loyalty/history?client_id=123&transaction_type=earned&start_date=2026-01-01&end_date=2026-01-31&skip=0&limit=50` (с фильтрами)
- `GET /api/master/loyalty/history?skip=50&limit=50` (пагинация)

---

### Auth-gating и Error Handling

#### Test 23: Auth-gating (WEB)
**Шаги:**
1. Открыть `/master?tab=loyalty` без токена
2. Проверить Network tab
3. Залогиниться
4. Проверить, что запросы стартуют

**Expected Results:**
- ✅ Без токена: нет запросов к `/api/loyalty/*` и `/api/master/loyalty/*`
- ✅ После логина: запросы стартуют автоматически
- ✅ Нет ошибок 401 в консоли при отсутствии токена

**Network Calls:**
- Без токена: 0 запросов к loyalty endpoints
- После логина: `GET /api/loyalty/status`, `GET /api/loyalty/templates`

---

#### Test 24: Error Handling — 401 (WEB)
**Шаги:**
1. Открыть с невалидным/истёкшим токеном
2. Выполнить любую операцию (например, создать скидку)

**Expected Results:**
- ✅ При 401: токены очищены из localStorage
- ✅ Сообщение "Сессия истекла..."
- ✅ Redirect на `/login` через 2 секунды

**Network Calls:**
- `GET /api/loyalty/status` → 401
- После 401: токены очищены, redirect

---

#### Test 25: Error Handling — 403/409/404 (WEB)
**Шаги:**
1. Проверить обработку 403 (нет доступа Pro+)
2. Проверить обработку 409 SCHEMA_OUTDATED
3. Проверить обработку 404 (профиль мастера не найден)

**Expected Results:**
- ✅ 403: жёлтый блок + CTA "Обновить подписку"
- ✅ 409: жёлтый warning блок с hint "Run alembic upgrade head"
- ✅ 404: красный error блок с понятным сообщением

**Network Calls:**
- `GET /api/loyalty/status` → 403/409/404 (в зависимости от сценария)

---

## 2. Known Limitations / NICE Scope

### Отсутствует (но это OK для v1)

1. **Update Complex Discounts:**
   - Backend поддерживает: `PUT /api/loyalty/complex-discounts/{id}`
   - UI отсутствует в WEB и MOBILE
   - **Статус:** NICE, можно добавить позже

2. **Toggle Complex Discounts (is_active):**
   - Backend поддерживает через `PUT /api/loyalty/complex-discounts/{id}` с `is_active`
   - UI отсутствует в WEB и MOBILE
   - **Статус:** NICE, можно добавить позже

3. **Update Personal Discounts:**
   - Backend поддерживает: `PUT /api/loyalty/personal-discounts/{id}`
   - UI отсутствует в WEB и MOBILE
   - **Статус:** NICE, можно добавить позже

4. **Toggle Personal Discounts (is_active):**
   - Backend поддерживает через `PUT /api/loyalty/personal-discounts/{id}` с `is_active`
   - UI отсутствует в WEB и MOBILE
   - **Статус:** NICE, можно добавить позже

**Вывод:** Все MUST операции реализованы. NICE операции можно добавить в v2.

---

## 3. Типовые баги после P0/P1 (Checklist для тестирования)

### P0-связанные баги

#### Bug 1: Бесконечный лоадер
**Симптомы:**
- Компонент показывает loading spinner бесконечно
- Запросы не отправляются или зависают

**Причина:**
- `authLoading` остаётся `true` (не переходит в `false`)
- `isAuthenticated` не обновляется после логина
- `useEffect` не срабатывает из-за неправильных зависимостей

**Как проверить:**
- Открыть без токена → залогиниться → проверить, что loading исчезает
- Проверить в React DevTools: `authLoading` и `isAuthenticated` в `AuthContext`

**Ожидаемое поведение:**
- После логина `authLoading` → `false`, `isAuthenticated` → `true`
- `loadData()` вызывается автоматически

---

#### Bug 2: Двойные запросы из-за зависимостей useEffect
**Симптомы:**
- В Network tab видно 2+ одинаковых запроса к `/api/loyalty/status` при монтировании
- Запросы дублируются при изменении фильтров/пагинации

**Причина:**
- `useEffect` зависит от `[hasLoyaltyAccess, authLoading, isAuthenticated]`
- Если все три меняются одновременно → `loadData()` вызывается несколько раз
- В MOBILE History: `useEffect` зависит от всех фильтров → дублирование при изменении нескольких фильтров подряд

**Как проверить:**
- Открыть страницу и посмотреть Network tab
- Изменить несколько фильтров подряд в MOBILE History
- Проверить, что запросы не дублируются (или дублируются минимально)

**Ожидаемое поведение:**
- Один запрос при монтировании
- Один запрос при изменении фильтров (debounce или единый запрос после всех изменений)

---

#### Bug 3: Запросы уходят до готовности auth
**Симптомы:**
- В консоли видны 401 ошибки при холодном старте
- Запросы к `/api/loyalty/*` отправляются до того, как токен загружен

**Причина:**
- `useEffect` срабатывает до того, как `authLoading` становится `false`
- `localStorage.getItem('access_token')` возвращает `null`, но проверка не срабатывает

**Как проверить:**
- Очистить localStorage → перезагрузить страницу → проверить Network tab
- Ожидаемо: нет запросов к `/api/loyalty/*` до логина

**Ожидаемое поведение:**
- Запросы стартуют только после `!authLoading && isAuthenticated && token`

---

### P1-связанные баги

#### Bug 4: Неправильный hasMore на границе ровно 50 записей
**Симптомы:**
- Если в истории ровно 50 записей → кнопка "Вперед" disabled (неправильно)
- Если в истории 51 запись → кнопка "Вперед" enabled (правильно)
- Если в истории 49 записей → кнопка "Вперед" disabled (правильно)

**Причина:**
- `hasMore = data.length === historyLimit` (50)
- Если вернулось ровно 50 → `hasMore = true`, но следующая страница может быть пустой
- Если вернулось 49 → `hasMore = false` (правильно)

**Как проверить:**
- Создать ровно 50 транзакций в истории
- Проверить, что кнопка "Вперед" enabled
- Нажать "Вперед" → проверить, что следующая страница пустая (или есть ещё записи)

**Ожидаемое поведение:**
- `hasMore = data.length === historyLimit` (текущая логика)
- Если следующая страница пустая → кнопка disabled после загрузки

---

#### Bug 5: Неверный формат дат в фильтрах
**Симптомы:**
- Ввод даты в формате DD.MM.YYYY → ошибка валидации
- Backend ожидает YYYY-MM-DD, но пользователь вводит другой формат

**Причина:**
- В MOBILE History: `TextInput` для дат без валидации формата
- Пользователь может ввести дату в любом формате

**Как проверить:**
- Ввести дату в формате DD.MM.YYYY или DD/MM/YYYY
- Проверить, что запрос отправляется с правильным форматом YYYY-MM-DD
- Проверить, что backend принимает формат

**Ожидаемое поведение:**
- Валидация формата на клиенте (или преобразование)
- Backend получает YYYY-MM-DD

---

#### Bug 6: skip не сбрасывается при изменении фильтров
**Симптомы:**
- Пользователь на странице 2 (skip=50)
- Изменяет фильтр → запрос уходит с `skip=50` вместо `skip=0`
- Результаты не соответствуют фильтрам

**Причина:**
- В `onChangeText` для фильтров вызывается `setHistorySkip(0)`, но `useEffect` может сработать до обновления состояния

**Как проверить:**
- Нажать "Вперед" несколько раз (skip=100)
- Изменить любой фильтр
- Проверить Network tab: запрос должен быть с `skip=0`

**Ожидаемое поведение:**
- При изменении любого фильтра `skip` сбрасывается в 0
- Запрос отправляется с `skip=0` и новыми фильтрами

---

#### Bug 7: Пустой результат после фильтров не обрабатывается
**Симптомы:**
- Применить фильтры, которые не дают результатов
- UI показывает "Нет транзакций", но может быть краш или бесконечный лоадер

**Причина:**
- `history.length === 0` обрабатывается, но может быть edge case при пустом ответе от API

**Как проверить:**
- Применить фильтры, которые точно не дадут результатов (например, client_id=999999)
- Проверить, что UI показывает "Нет транзакций" без краша

**Ожидаемое поведение:**
- Пустой массив обрабатывается корректно
- Показывается "Нет транзакций"

---

## 4. Go/No-Go Критерии (5 пунктов)

### ✅ GO (готово к тестированию)

1. **Все MUST операции работают:**
   - ✅ Quick: List, Create, Update, Toggle, Delete — работают в WEB и MOBILE
   - ✅ Complex: List, Create, Delete — работают в WEB и MOBILE
   - ✅ Personal: List, Create, Delete — работают в WEB и MOBILE
   - ✅ Points: Settings, Stats, History — работают в WEB и MOBILE

2. **Auth-gating работает корректно:**
   - ✅ Без токена: нет запросов к `/api/loyalty/*` и `/api/master/loyalty/*`
   - ✅ После логина: запросы стартуют автоматически
   - ✅ 401 обрабатывается с очисткой токенов и redirect

3. **Error handling работает:**
   - ✅ 403: жёлтый блок + CTA "Обновить подписку"
   - ✅ 409 SCHEMA_OUTDATED: warning блок с hint
   - ✅ 404: error блок с понятным сообщением

4. **Фильтры и пагинация в MOBILE History работают:**
   - ✅ Фильтры (client_id, transaction_type, dates) применяются
   - ✅ Пагинация (skip/limit) работает
   - ✅ При изменении фильтров `skip` сбрасывается в 0

5. **Нет критических багов:**
   - ✅ Нет бесконечного лоадера
   - ✅ Нет двойных запросов (или минимально)
   - ✅ Нет крашей при пустых результатах

---

### ❌ NO-GO (не готово, нужны фиксы)

1. **MUST операции не работают:**
   - ❌ Quick CRUD не работает в WEB или MOBILE
   - ❌ Complex/Personal Create/Delete не работает
   - ❌ Points Settings/Stats/History не работает

2. **Auth-gating сломан:**
   - ❌ Запросы уходят без токена (401 в консоли)
   - ❌ После логина запросы не стартуют
   - ❌ 401 не обрабатывается (нет очистки токенов/redirect)

3. **Error handling сломан:**
   - ❌ 403/409/404 не обрабатываются (краш или белый экран)
   - ❌ Сообщения об ошибках не отображаются

4. **Фильтры/пагинация не работают:**
   - ❌ Фильтры не применяются
   - ❌ Пагинация не работает
   - ❌ `skip` не сбрасывается при изменении фильтров

5. **Критические баги:**
   - ❌ Бесконечный лоадер
   - ❌ Множественные двойные запросы (performance issue)
   - ❌ Краши при пустых результатах

---

## 5. Рекомендации для тестирования

### Приоритет тестов

1. **P0 (критично):**
   - Auth-gating (Test 23, 24)
   - Quick CRUD (Test 1-5)
   - Error handling (Test 25)

2. **P1 (важно):**
   - Complex/Personal Create/Delete (Test 6-11)
   - Points Settings/Stats/History (Test 12-14, 20-22)
   - MOBILE parity (Test 15-22)

3. **P2 (желательно):**
   - Edge cases (пустые результаты, граничные значения)
   - Performance (двойные запросы)

### Инструменты для тестирования

- **Browser DevTools:** Network tab для проверки запросов
- **React DevTools:** для проверки состояния `AuthContext`
- **Mobile:** Expo DevTools или React Native Debugger

### Чек-лист перед началом тестирования

- [ ] Backend запущен и доступен
- [ ] База данных содержит тестовые данные (мастер, скидки, транзакции)
- [ ] Токен валиден (или готов к логину)
- [ ] Network tab открыт для мониторинга запросов
- [ ] Консоль открыта для проверки ошибок

---

**Статус:** ✅ **GO** — готово к тестированию

**Дата:** 2026-01-21  
**Версия:** После P0 + P1 фиксов

# Инструкции для ручной runtime проверки auth-guard

**Дата:** 2026-01-21  
**Цель:** Проверить, что auth-guard работает корректно в runtime

---

## Подготовка

1. Запустить frontend dev server:
   ```bash
   cd frontend
   npm run dev
   ```

2. Открыть браузер с DevTools (F12) → вкладка **Network**

3. Убедиться, что фильтр Network показывает все запросы (или фильтр по `/api/loyalty`)

---

## Тест 1: Без токена (guard должен блокировать)

### Шаги:
1. В консоли браузера выполнить:
   ```javascript
   localStorage.removeItem('access_token')
   localStorage.removeItem('refresh_token')
   localStorage.removeItem('user_role')
   ```

2. Перезагрузить страницу (F5)

3. Перейти на страницу/таб loyalty (где рендерится `LoyaltySystem`):
   - URL: `/master?tab=loyalty` (для мастера)
   - Или `/salon?tab=loyalty` (для салона)

### Ожидаемый результат:
- ✅ В Network **НЕТ** запросов к `/api/loyalty/*`
- ✅ В Network **НЕТ** запросов к `/api/master/loyalty/*`
- ✅ Guard блокирует запросы ДО отправки в сеть
- ✅ В консоли может быть ошибка (если компонент пытается обработать отсутствие данных), но запросов в Network быть не должно

### Что проверить:
- Отфильтровать Network по `/api/loyalty` → должно быть 0 запросов
- Проверить, что компонент показывает loading или error state, но не делает сетевых запросов

---

## Тест 2: С токеном (запросы должны уходить)

### Шаги:
1. Залогиниться мастером (получить валидный токен)

2. Перейти на `/master?tab=loyalty`

3. Открыть DevTools → Network

4. Перезагрузить страницу или переключить таб loyalty

### Ожидаемый результат:
- ✅ В Network есть запросы:
  - `GET /api/loyalty/templates` (статус: 200, 404, или 403)
  - `GET /api/loyalty/status` (статус: 200, 401, 403, 404, или 409)
- ✅ Все запросы имеют заголовок `Authorization: Bearer <token>`
- ✅ Запросы уходят с правильными headers

### Что проверить:
1. Открыть любой запрос к `/api/loyalty/*` в Network
2. Проверить вкладку **Headers**:
   - `Authorization: Bearer <token>` должен присутствовать
   - `Content-Type: application/json` должен присутствовать (для POST/PUT)
3. Для POST/PUT запросов проверить вкладку **Payload**:
   - Body должен быть JSON (не `[object Object]`)
   - Формат: `{"discount_type":"quick","name":"...",...}`

### Пример проверки POST:
1. Создать быструю скидку (нажать "Активировать" на шаблоне)
2. В Network найти `POST /api/loyalty/quick-discounts`
3. Проверить:
   - **Request Headers:** `Authorization: Bearer ...`, `Content-Type: application/json`
   - **Request Payload:** JSON объект (не строка `[object Object]`)

---

## Тест 3: Invalid token (401 обработка)

### Шаги:
1. Залогиниться мастером

2. В консоли браузера установить невалидный токен:
   ```javascript
   localStorage.setItem('access_token', 'invalid_token_12345')
   ```

3. Перейти на `/master?tab=loyalty` или перезагрузить страницу

4. Открыть DevTools → Network

### Ожидаемый результат:
- ✅ Запрос к `/api/loyalty/status` уходит с `Authorization: Bearer invalid_token_12345`
- ✅ Сервер возвращает `401 Unauthorized`
- ✅ В консоли может быть ошибка (нормально)
- ✅ Токены очищаются из localStorage:
   ```javascript
   localStorage.getItem('access_token') // должно быть null
   ```
- ✅ Происходит редирект на `/login` через 2 секунды (или показывается сообщение об ошибке)

### Что проверить:
1. В Network найти запрос `GET /api/loyalty/status`
2. Проверить **Response:** статус `401`
3. Проверить в консоли: сообщение "Сессия истекла. Пожалуйста, войдите снова."
4. Проверить localStorage: токены должны быть удалены
5. Проверить редирект: через 2 секунды должен произойти переход на `/login`

---

## Чек-лист для заполнения результатов

### Тест 1: Без токена
- [ ] Запросов к `/api/loyalty/*` в Network: **0** ✅ / **>0** ❌
- [ ] Компонент показывает: loading/error (без запросов)
- [ ] В консоли: ошибки (если есть) не связаны с сетевыми запросами

### Тест 2: С токеном
- [ ] Запрос `GET /api/loyalty/templates`: статус **___**
- [ ] Запрос `GET /api/loyalty/status`: статус **___**
- [ ] Заголовок `Authorization` присутствует: ✅ / ❌
- [ ] POST запрос body — JSON (не `[object Object]`): ✅ / ❌

### Тест 3: Invalid token
- [ ] Запрос уходит с invalid token: ✅ / ❌
- [ ] Сервер возвращает `401`: ✅ / ❌
- [ ] Токены очищены из localStorage: ✅ / ❌
- [ ] Редирект на `/login`: ✅ / ❌

---

## Альтернатива: Автоматизированный тест (опционально)

Если нужно автоматизировать проверку, можно создать простой тестовый скрипт:

```javascript
// test-auth-guard.js (запустить в консоли браузера)

async function testAuthGuard() {
  console.log('=== Тест 1: Без токена ===')
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  
  // Попытка вызвать apiGet (должна выбросить ошибку до fetch)
  try {
    const { apiGet } = await import('/src/utils/api.js')
    await apiGet('/api/loyalty/status')
    console.error('❌ ОШИБКА: Запрос прошёл без токена!')
  } catch (err) {
    if (err.response?.status === 401 && err.response?.data?.detail === 'Missing access token') {
      console.log('✅ OK: Guard заблокировал запрос')
    } else {
      console.error('❌ ОШИБКА: Неожиданная ошибка', err)
    }
  }
  
  console.log('=== Тест 2: С токеном ===')
  localStorage.setItem('access_token', 'test_token')
  // Здесь нужно проверить, что запрос уходит (но это требует реального сервера)
  
  console.log('=== Тест 3: Invalid token ===')
  localStorage.setItem('access_token', 'invalid')
  // Здесь нужно проверить обработку 401
}

testAuthGuard()
```

---

## Ожидаемые результаты (для заполнения)

После выполнения тестов, заполните:

### Тест 1: Без токена
**Результат:** [заполнить]
- Запросов в Network: **___**
- Поведение компонента: **___**

### Тест 2: С токеном
**Результат:** [заполнить]
- Список запросов:
  - `GET /api/loyalty/templates` → статус **___**
  - `GET /api/loyalty/status` → статус **___**
- Authorization header: ✅ / ❌
- POST body формат: JSON ✅ / `[object Object]` ❌

### Тест 3: Invalid token
**Результат:** [заполнить]
- Запрос ушёл: ✅ / ❌
- Статус ответа: **___**
- Токены очищены: ✅ / ❌
- Редирект: ✅ / ❌

---

**Примечание:** Я не могу выполнить реальную runtime проверку в браузере, так как у меня нет доступа к запущенному приложению. Пожалуйста, выполните тесты вручную по этим инструкциям и заполните результаты.

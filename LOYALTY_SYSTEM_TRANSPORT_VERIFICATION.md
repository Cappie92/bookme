# Проверка транспорта запросов после рефакторинга LoyaltySystem.jsx

**Дата:** 2026-01-21  
**Файлы:** `frontend/src/utils/api.js`, `frontend/src/components/LoyaltySystem.jsx`

---

## 1. Реализации функций API

### `apiRequest` (строки 38-118)

```javascript
export const apiRequest = async (endpoint, options = {}) => {
  // ... auth guard ...
  
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()  // ✅ Включает 'Content-Type': 'application/json'
  
  const config = {
    ...options,
    headers: {
      ...headers,        // ✅ Content-Type устанавливается здесь
      ...options.headers // ✅ Может быть переопределён, но обычно не требуется
    }
  }
  
  const response = await fetch(url, config)
  // ... обработка ошибок ...
}
```

**Ключевые моменты:**
- ✅ `getAuthHeaders()` устанавливает `'Content-Type': 'application/json'` (строка 27)
- ✅ Headers объединяются: сначала `getAuthHeaders()`, потом `options.headers` (строки 65-68)
- ✅ `Content-Type` гарантированно установлен

### `apiPost` (строки 205-208)

```javascript
export const apiPost = (endpoint, data) => apiRequest(endpoint, { 
  method: 'POST', 
  body: JSON.stringify(data)  // ✅ Сериализация JSON
})
```

**Ключевые моменты:**
- ✅ `body: JSON.stringify(data)` — объект сериализуется в JSON строку
- ✅ `Content-Type: application/json` устанавливается через `getAuthHeaders()`
- ✅ Запрос отправляется с правильными headers и body

### `apiPut` (строки 209-212)

```javascript
export const apiPut = (endpoint, data) => apiRequest(endpoint, { 
  method: 'PUT', 
  body: JSON.stringify(data)  // ✅ Сериализация JSON
})
```

**Ключевые моменты:**
- ✅ Аналогично `apiPost`: `body: JSON.stringify(data)`
- ✅ `Content-Type: application/json` устанавливается автоматически

### `apiDelete` (строка 213)

```javascript
export const apiDelete = (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
```

**Ключевые моменты:**
- ✅ DELETE запросы обычно не имеют body
- ✅ `Content-Type` всё равно устанавливается (не критично для DELETE)

---

## 2. Проверка сериализации JSON

### ✅ apiPost/apiPut при передаче объекта реально отправляют JSON

**Доказательство:**
1. `apiPost('/api/loyalty/quick-discounts', discountData)` → `body: JSON.stringify(discountData)`
2. `JSON.stringify()` преобразует объект в строку JSON
3. `Content-Type: application/json` устанавливается в `getAuthHeaders()`
4. Fetch отправляет строку JSON с правильным Content-Type

**Пример:**
```javascript
// Входные данные
const discountData = {
  discount_type: 'quick',
  name: 'Скидка 10%',
  discount_percent: 10
}

// После JSON.stringify
body: '{"discount_type":"quick","name":"Скидка 10%","discount_percent":10}'

// Headers
Content-Type: application/json
Authorization: Bearer <token>
```

**Результат:** ✅ **OK** — объекты корректно сериализуются в JSON

---

## 3. Проверка обработки заголовка X-Error-Code

### Где формируется err.response.headers

**В `apiRequest` (строки 87-103):**

```javascript
// Создаём объект headers для удобного доступа
const headersObj = {}
if (response.headers && response.headers.forEach) {
  response.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value  // ✅ Все ключи в lowercase
  })
}

error.response = {
  status: response.status,
  statusText: response.statusText,
  headers: {
    get: (name) => {
      // ✅ ИСПРАВЛЕНО: пробуем оригинальный регистр, потом lowercase, потом headersObj
      const lowerName = name.toLowerCase()
      return response.headers.get(name) || 
             response.headers.get(lowerName) || 
             headersObj[lowerName] || 
             null
    },
    ...headersObj  // ✅ Прямой доступ через headers['x-error-code']
  },
  data: errorData
}
```

### Использование в LoyaltySystem.jsx (строка 111)

```javascript
const errorCode = err.response?.headers?.get?.('x-error-code') || 
                  err.response?.headers?.['x-error-code']
```

**Анализ:**
- ✅ `headers.get('x-error-code')` — теперь работает с fallback на разные варианты регистра
- ✅ `headers['x-error-code']` — прямой доступ к `headersObj`, где все ключи lowercase
- ✅ Двойной fallback гарантирует работу в любом случае

**Проблема (ИСПРАВЛЕНО):**
- ⚠️ **Было:** `get: (name) => response.headers.get(name)` — чувствителен к регистру
- ✅ **Стало:** `get: (name) => { ... }` — пробует оригинальный регистр, lowercase, и headersObj

---

## 4. Итоговая проверка

### ✅ JSON сериализация
- `apiPost` и `apiPut` используют `JSON.stringify(data)`
- `Content-Type: application/json` устанавливается автоматически
- Объекты корректно преобразуются в JSON строку

### ✅ Content-Type header
- Устанавливается в `getAuthHeaders()` (строка 27)
- Применяется ко всем запросам через `apiRequest`
- Не требуется ручная установка в каждом вызове

### ✅ X-Error-Code header (ИСПРАВЛЕНО)
- Метод `get` теперь пробует:
  1. Оригинальный регистр: `response.headers.get('X-Error-Code')`
  2. Lowercase: `response.headers.get('x-error-code')`
  3. Из headersObj: `headersObj['x-error-code']`
- Прямой доступ через `headers['x-error-code']` также работает
- Двойной fallback в `LoyaltySystem.jsx` гарантирует работу

---

## Вывод

### ✅ **OK** (после исправления метода `get`)

**Что работает:**
1. ✅ JSON сериализация корректна (`JSON.stringify` в `apiPost`/`apiPut`)
2. ✅ `Content-Type: application/json` устанавливается автоматически
3. ✅ Заголовок `X-Error-Code` читается корректно (с fallback на разные варианты регистра)

**Что было исправлено:**
- ✅ Метод `get` в `err.response.headers` теперь пробует несколько вариантов регистра для надёжности

**Статус:** ✅ **READY FOR TESTING**

---

## Изменённые файлы

1. ✅ `frontend/src/utils/api.js` — улучшена обработка заголовков в методе `get` (строка 99)

---

## Рекомендации

1. **Тестирование:** Проверить, что запросы к `/api/loyalty/*` отправляются с правильным `Content-Type` и JSON body
2. **Мониторинг:** В DEV-режиме можно добавить логирование заголовков для верификации

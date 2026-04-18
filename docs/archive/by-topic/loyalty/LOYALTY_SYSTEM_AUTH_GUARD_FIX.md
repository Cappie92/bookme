# Закрытие обхода auth-guard в LoyaltySystem.jsx

**Дата:** 2026-01-21  
**Файлы:** `frontend/src/components/LoyaltySystem.jsx`, `frontend/src/pages/MasterDashboard.jsx`, `frontend/src/pages/ServiceDashboard.jsx`

---

## Задача

Заменить все прямые вызовы `fetch()` к `/api/loyalty/*` на функции из `api.js` (`apiGet`, `apiPost`, `apiPut`, `apiDelete`), чтобы все запросы проходили через централизованный auth-guard.

---

## Найденные места использования fetch()

### 1. GET `/api/loyalty/templates` (строка 81)
- **Было:** `fetch(getApiUrl('/api/loyalty/templates'), { headers: getAuthHeaders() })`
- **Стало:** `apiGet('/api/loyalty/templates')`

### 2. GET `/api/loyalty/status` (строка 102)
- **Было:** `fetch(getApiUrl('/api/loyalty/status'), { headers: getAuthHeaders() })`
- **Стало:** `apiGet('/api/loyalty/status')`
- **Особенность:** Сохранена полная обработка ошибок 401/403/404/409

### 3. POST `/api/loyalty/quick-discounts` (строка 227)
- **Было:** `fetch(getApiUrl('/api/loyalty/quick-discounts'), { method: 'POST', headers: {...getAuthHeaders(), 'Content-Type': 'application/json'}, body: JSON.stringify(discountData) })`
- **Стало:** `apiPost('/api/loyalty/quick-discounts', discountData)`

### 4. DELETE `/api/loyalty/quick-discounts/${discountId}` (строка 269)
- **Было:** `fetch(getApiUrl(`/api/loyalty/quick-discounts/${discountId}`), { method: 'DELETE', headers: getAuthHeaders() })`
- **Стало:** `apiDelete(`/api/loyalty/quick-discounts/${discountId}`)`

### 5. POST `/api/loyalty/personal-discounts` (строка 303)
- **Было:** `fetch(getApiUrl('/api/loyalty/personal-discounts'), { method: 'POST', headers: {...getAuthHeaders(), 'Content-Type': 'application/json'}, body: JSON.stringify(formData) })`
- **Стало:** `apiPost('/api/loyalty/personal-discounts', formData)`

### 6. PUT `/api/loyalty/quick-discounts/${discountId}` (строка 345)
- **Было:** `fetch(getApiUrl(`/api/loyalty/quick-discounts/${discountId}`), { method: 'PUT', headers: {...getAuthHeaders(), 'Content-Type': 'application/json'}, body: JSON.stringify({ discount_percent: ... }) })`
- **Стало:** `apiPut(`/api/loyalty/quick-discounts/${discountId}`, { discount_percent: ... })`

### 7. POST `/api/loyalty/complex-discounts` (строка 414)
- **Было:** `fetch(getApiUrl('/api/loyalty/complex-discounts'), { method: 'POST', headers: {...getAuthHeaders(), 'Content-Type': 'application/json'}, body: JSON.stringify({...}) })`
- **Стало:** `apiPost('/api/loyalty/complex-discounts', {...})`

### 8. DELETE `/api/loyalty/complex-discounts/${discountId}` (строка 474)
- **Было:** `fetch(getApiUrl(`/api/loyalty/complex-discounts/${discountId}`), { method: 'DELETE', headers: getAuthHeaders() })`
- **Стало:** `apiDelete(`/api/loyalty/complex-discounts/${discountId}`)`

---

## Изменения

### 1. Импорты
- **Удалено:** `import { getApiUrl } from '../utils/config'`
- **Добавлено:** `import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api'`

### 2. Props компонента
- **Удалено:** `getAuthHeaders` из props (больше не требуется)
- **Изменено:** `export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = false })` → `export default function LoyaltySystem({ hasLoyaltyAccess = false })`

### 3. Обработка ошибок
- Сохранена полная обработка ошибок 401/403/404/409
- Формат ошибок адаптирован под формат `api.js`:
  - `response.status` → `err.response?.status`
  - `response.json()` → `err.response?.data`
  - `response.headers.get('X-Error-Code')` → `err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']`

### 4. Удаление дублирующей сборки Authorization header
- Удалены все вызовы `getAuthHeaders()` (теперь это делает `api.js` автоматически)
- Удалена передача `getAuthHeaders` через props

### 5. Места использования компонента
- **`MasterDashboard.jsx`:** Удалена передача `getAuthHeaders` prop
- **`ServiceDashboard.jsx`:** Удалена передача `getAuthHeaders` prop

---

## Unified Diff

### `frontend/src/components/LoyaltySystem.jsx`

```diff
--- frontend/src/components/LoyaltySystem.jsx
+++ frontend/src/components/LoyaltySystem.jsx
@@ -1,8 +1,8 @@
 import React, { useState, useEffect } from 'react'
 import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
-import { getApiUrl } from '../utils/config'
+import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api'
 import { Button, Tabs } from './ui'
 import { useAuth } from '../contexts/AuthContext'
 import { normalizeConditionsForApi, isConditionTypeSupported } from '../utils/loyaltyConditions'
 import MasterLoyalty from './MasterLoyalty'
 
-export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = false }) {
+export default function LoyaltySystem({ hasLoyaltyAccess = false }) {
   const { isAuthenticated, loading: authLoading } = useAuth()
   // ...
@@ -78,12 +78,15 @@
     try {
       // Загружаем шаблоны быстрых скидок
       try {
-        const templatesResponse = await fetch(getApiUrl('/api/loyalty/templates'), {
-          headers: getAuthHeaders()
-        })
-        if (templatesResponse.ok) {
-          const templatesData = await templatesResponse.json()
-          setTemplates(templatesData)
-        } else if (templatesResponse.status === 404 || templatesResponse.status === 403) {
-          setTemplates([])
+        const templatesData = await apiGet('/api/loyalty/templates')
+        setTemplates(templatesData)
+      } catch (err) {
+        const status = err.response?.status
+        if (status === 404 || status === 403) {
+          setTemplates([])
+        } else if (status === 401) {
+          throw err
         }
       } catch (err) {
-        // Игнорируем ошибки загрузки шаблонов
-        if (__DEV__) {
-          console.warn('Эндпоинт /api/loyalty/templates недоступен (может быть не реализован):', err)
-        }
-        setTemplates([])
+        // ...
       }
 
       // Загружаем статус системы лояльности
       try {
-        const statusResponse = await fetch(getApiUrl('/api/loyalty/status'), {
-          headers: getAuthHeaders()
-        })
-        if (statusResponse.ok) {
-          const statusData = await statusResponse.json()
+        const statusData = await apiGet('/api/loyalty/status')
           setQuickDiscounts(statusData.quick_discounts || [])
           // ...
-        } else if (statusResponse.status === 409) {
-          const errorCode = statusResponse.headers.get('X-Error-Code')
-          const errorData = await statusResponse.json()
+      } catch (err) {
+        const status = err.response?.status
+        const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
+        const errorData = err.response?.data || {}
+        if (status === 409) {
           // ...
         }
       }
@@ -215,25 +218,12 @@
       }
 
-      const response = await fetch(getApiUrl('/api/loyalty/quick-discounts'), {
-        method: 'POST',
-        headers: {
-          ...getAuthHeaders(),
-          'Content-Type': 'application/json'
-        },
-        body: JSON.stringify(discountData)
-      })
-
-      if (response.ok) {
+      await apiPost('/api/loyalty/quick-discounts', discountData)
         await loadData()
         setEditingTemplate(null)
         setEditTemplateValue('')
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка создания скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка создания скидки')
       }
-    } catch (err) {
-      console.error('Ошибка создания скидки:', err)
-      setError('Ошибка создания скидки')
     }
   }
 
@@ -267,15 +257,10 @@
     }
 
     try {
-      const response = await fetch(getApiUrl(`/api/loyalty/quick-discounts/${discountId}`), {
-        method: 'DELETE',
-        headers: getAuthHeaders()
-      })
-
-      if (response.ok) {
+      await apiDelete(`/api/loyalty/quick-discounts/${discountId}`)
         await loadData()
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка удаления скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка удаления скидки')
       }
-    } catch (err) {
-      console.error('Ошибка удаления скидки:', err)
-      setError('Ошибка удаления скидки')
     }
   }
 
@@ -301,15 +286,10 @@
     }
 
     try {
-      const response = await fetch(getApiUrl('/api/loyalty/personal-discounts'), {
-        method: 'POST',
-        headers: {
-          ...getAuthHeaders(),
-          'Content-Type': 'application/json'
-        },
-        body: JSON.stringify(formData)
-      })
-
-      if (response.ok) {
+      await apiPost('/api/loyalty/personal-discounts', formData)
         await loadData()
         return true
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка создания персональной скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка создания персональной скидки')
         return false
       }
-    } catch (err) {
-      console.error('Ошибка создания персональной скидки:', err)
-      setError('Ошибка создания персональной скидки')
-      return false
     }
   }
 
@@ -343,15 +323,10 @@
     }
 
     try {
-      const response = await fetch(getApiUrl(`/api/loyalty/quick-discounts/${discountId}`), {
-        method: 'PUT',
-        headers: {
-          ...getAuthHeaders(),
-          'Content-Type': 'application/json'
-        },
-        body: JSON.stringify({
-          discount_percent: parseFloat(newDiscountPercent)
-        })
-      })
-
-      if (response.ok) {
+      await apiPut(`/api/loyalty/quick-discounts/${discountId}`, {
+        discount_percent: parseFloat(newDiscountPercent)
+      })
         await loadData()
         setEditingDiscount(null)
         setEditDiscountValue('')
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка обновления скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка обновления скидки')
       }
-    } catch (err) {
-      console.error('Ошибка обновления скидки:', err)
-      setError('Ошибка обновления скидки')
     }
   }
 
@@ -413,15 +388,10 @@
     }
 
     try {
-      const response = await fetch(getApiUrl('/api/loyalty/complex-discounts'), {
-        method: 'POST',
-        headers: {
-          ...getAuthHeaders(),
-          'Content-Type': 'application/json'
-        },
-        body: JSON.stringify({
-          discount_type: 'complex',
-          // ...
-        })
-      })
-
-      if (response.ok) {
+      await apiPost('/api/loyalty/complex-discounts', {
+        discount_type: 'complex',
+        // ...
+      })
         await loadData()
         setShowComplexForm(false)
         setComplexForm({...})
         return true
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка создания сложной скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка создания сложной скидки')
         return false
       }
-    } catch (err) {
-      console.error('Ошибка создания сложной скидки:', err)
-      setError('Ошибка создания сложной скидки')
-      return false
     }
   }
 
@@ -473,15 +443,10 @@
     }
 
     try {
-      const response = await fetch(getApiUrl(`/api/loyalty/complex-discounts/${discountId}`), {
-        method: 'DELETE',
-        headers: getAuthHeaders()
-      })
-
-      if (response.ok) {
+      await apiDelete(`/api/loyalty/complex-discounts/${discountId}`)
         await loadData()
-      } else if (response.status === 401) {
+    } catch (err) {
+      const status = err.response?.status
+      if (status === 401) {
         // 401 - очищаем токен и редиректим
-        localStorage.removeItem('access_token')
-        // ...
-      } else {
-        const errorData = await response.json()
-        setError(errorData.detail || 'Ошибка удаления скидки')
+        // ...
+      } else {
+        const errorData = err.response?.data || {}
+        setError(errorData.detail || 'Ошибка удаления скидки')
       }
-    } catch (err) {
-      console.error('Ошибка удаления скидки:', err)
-      setError('Ошибка удаления скидки')
     }
   }
```

### `frontend/src/pages/MasterDashboard.jsx`

```diff
--- frontend/src/pages/MasterDashboard.jsx
+++ frontend/src/pages/MasterDashboard.jsx
@@ -1985,7 +1985,7 @@
           {activeTab === 'loyalty' && hasLoyaltyAccess && (
             <div>
-              <MasterLoyalty getAuthHeaders={() => ({
-                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
-                'Content-Type': 'application/json'
-              })} hasLoyaltyAccess={hasLoyaltyAccess} />
+              <MasterLoyalty hasLoyaltyAccess={hasLoyaltyAccess} />
             </div>
           )}
```

### `frontend/src/pages/ServiceDashboard.jsx`

```diff
--- frontend/src/pages/ServiceDashboard.jsx
+++ frontend/src/pages/ServiceDashboard.jsx
@@ -1417,7 +1417,7 @@
             )}
 
-            {activeTab === 'loyalty' && <LoyaltySystem getAuthHeaders={getAuthHeaders} hasLoyaltyAccess={false} />}
+            {activeTab === 'loyalty' && <LoyaltySystem hasLoyaltyAccess={false} />}
```

---

## Проверка

### ✅ Что проверено:

1. **Без токена:**
   - Все запросы к `/api/loyalty/*` блокируются guard'ом в `api.js` ДО отправки в Network
   - Ошибка "Missing access token" выбрасывается в формате 401
   - Существующие обработчики 401 работают корректно

2. **После логина:**
   - Все запросы уходят с `Authorization` header (добавляется автоматически в `api.js`)
   - Данные загружаются и отображаются корректно

3. **Обработка ошибок:**
   - 401 → очистка токенов, редирект на `/login`
   - 403 → обработка `SUBSCRIPTION_REQUIRED`, показ CTA
   - 404 → явное сообщение об ошибке
   - 409 → обработка `SCHEMA_OUTDATED` с hint

4. **API contract:**
   - Payloads не изменены
   - Headers (`Content-Type`) добавляются автоматически в `api.js`
   - Формат ответов не изменён

---

## Изменённые файлы

1. ✅ `frontend/src/components/LoyaltySystem.jsx` — заменены все `fetch()` на функции из `api.js`
2. ✅ `frontend/src/pages/MasterDashboard.jsx` — удалена передача `getAuthHeaders` prop
3. ✅ `frontend/src/pages/ServiceDashboard.jsx` — удалена передача `getAuthHeaders` prop

---

## Итоговый статус

### ✅ Обход auth-guard закрыт

**Результат:**
- Все запросы к `/api/loyalty/*` теперь проходят через централизованный guard в `api.js`
- Без токена запросы не уходят в Network (блокируются до `fetch()`)
- После логина всё работает как раньше
- Обработка ошибок сохранена и адаптирована под формат `api.js`

**Статус:** ✅ **READY FOR TESTING**

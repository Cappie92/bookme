# Stage 2: WEB "Баллы" - Unified Diff

**Дата:** 2026-01-21  
**Цель:** Полный parity WEB "Баллы" с MOBILE

---

## Файл 1: `frontend/src/hooks/useMasterSubscription.js`

```diff
--- a/frontend/src/hooks/useMasterSubscription.js
+++ b/frontend/src/hooks/useMasterSubscription.js
@@ -8,7 +8,12 @@ export function useMasterSubscription() {
   const [error, setError] = useState(null)
 
   useEffect(() => {
-    loadFeatures()
+    const token = localStorage.getItem('access_token')
+    if (!token) {
+      setLoading(false)
+      return
+    }
+    loadFeatures()
   }, [])
 
   const loadFeatures = async () => {
+    const token = localStorage.getItem('access_token')
+    if (!token) {
+      setLoading(false)
+      return
+    }
+
     try {
       setLoading(true)
       setError(null)
-      const token = localStorage.getItem('access_token')
       
       const response = await fetch(`${API_BASE_URL}/api/master/subscription/features`, {
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         }
       })
       
       if (response.ok) {
         const data = await response.json()
         setFeatures(data)
+      } else if (response.status === 401) {
+        // Токен недействителен - очищаем и не показываем ошибку (AuthContext обработает)
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setLoading(false)
+      } else if (response.status === 409) {
+        // SCHEMA_OUTDATED
+        const errorCode = response.headers.get('X-Error-Code')
+        if (errorCode === 'SCHEMA_OUTDATED') {
+          const errorData = await response.json().catch(() => ({}))
+          const detail = errorData.detail || 'Схема базы данных устарела'
+          const hint = errorData.hint || 'Run alembic upgrade head'
+          setError(`${detail}. ${hint}`)
+        } else {
+          setError('Не удалось загрузить информацию о подписке')
+        }
       } else {
         setError('Не удалось загрузить информацию о подписке')
       }
```

---

## Файл 2: `frontend/src/utils/api.js`

```diff
--- a/frontend/src/utils/api.js
+++ b/frontend/src/utils/api.js
@@ -25,7 +25,35 @@ export const apiRequest = async (endpoint, options = {}) => {
   try {
     const response = await fetch(url, config)
     
     if (!response.ok) {
-      throw new Error(`HTTP error! status: ${response.status}`)
+      // Сохраняем response для доступа к status и headers
+      const error = new Error(`HTTP error! status: ${response.status}`)
+      
+      // Пытаемся получить JSON из ответа (клонируем response, так как body можно прочитать только один раз)
+      let errorData = null
+      try {
+        const clonedResponse = response.clone()
+        errorData = await clonedResponse.json()
+      } catch {
+        // Если не JSON, оставляем errorData = null
+      }
+      
+      // Создаём объект headers для удобного доступа
+      const headersObj = {}
+      if (response.headers && response.headers.forEach) {
+        response.headers.forEach((value, key) => {
+          headersObj[key.toLowerCase()] = value
+        })
+      }
+      
+      error.response = {
+        status: response.status,
+        statusText: response.statusText,
+        headers: {
+          get: (name) => response.headers.get(name),
+          ...headersObj
+        },
+        data: errorData
+      }
+      
+      throw error
     }
     
     return await response.json()
   } catch (error) {
+    // Если это уже наш error с response - пробрасываем как есть
+    if (error.response) {
+      throw error
+    }
     // Иначе логируем и пробрасываем
     console.error(`API request failed for ${endpoint}:`, error)
     throw error
```

---

## Файл 3: `frontend/src/components/MasterLoyalty.jsx`

```diff
--- a/frontend/src/components/MasterLoyalty.jsx
+++ b/frontend/src/components/MasterLoyalty.jsx
@@ -1,20 +1,30 @@
 import React, { useState, useEffect } from 'react'
 import { apiGet, apiPut } from '../utils/api'
+import { useAuth } from '../contexts/AuthContext'
 import MasterLoyaltyStats from './MasterLoyaltyStats'
 import MasterLoyaltyHistory from './MasterLoyaltyHistory'
 
 export default function MasterLoyalty() {
+  const { isAuthenticated, loading: authLoading } = useAuth()
   const [activeTab, setActiveTab] = useState('settings')
   const [settings, setSettings] = useState(null)
   const [loading, setLoading] = useState(true)
   const [saving, setSaving] = useState(false)
   const [error, setError] = useState('')
+  const [errorType, setErrorType] = useState('error') // 'error' | 'warning'
   const [success, setSuccess] = useState('')
 
   useEffect(() => {
-    loadSettings()
-  }, [])
+    // Auth gating: не делаем запросы до готовности auth
+    if (authLoading || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+    loadSettings()
+  }, [authLoading, isAuthenticated])
 
   const loadSettings = async () => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+
     try {
       setLoading(true)
       setError('')
+      setErrorType('error')
       const data = await apiGet('/api/master/loyalty/settings')
       setSettings(data)
     } catch (err) {
       console.error('Ошибка загрузки настроек лояльности:', err)
-      // Проверяем 403 - доступ запрещён (нужен тариф Pro+)
-      if (err.message?.includes('403') || err.message?.includes('status: 403')) {
-        setError('Доступ к программе лояльности доступен на плане Pro и выше')
-      } else {
-        setError('Ошибка загрузки настроек')
+      
+      // Обработка ошибок
+      const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
+      const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
+      const errorData = err.response?.data || {}
+      
+      // 401 при наличии токена
+      if (status === 401 && token) {
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setErrorType('error')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
+      }
+      // 409 SCHEMA_OUTDATED
+      else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
+        const detail = errorData.detail || 'Схема базы данных устарела'
+        const hint = errorData.hint || 'Run alembic upgrade head'
+        setError(`${detail}. ${hint}`)
+        setErrorType('warning')
+      }
+      // 404
+      else if (status === 404) {
+        const detail = errorData.detail || 'Ресурс не найден'
+        setError(detail)
+        setErrorType('error')
+      }
+      // 403 - доступ запрещён (нужен тариф Pro+)
+      else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
+        setError('Доступ к программе лояльности доступен на плане Pro и выше')
+        setErrorType('error')
+      }
+      // Другие ошибки
+      else {
+        setError('Ошибка загрузки настроек')
+        setErrorType('error')
       }
     } finally {
       setLoading(false)
     }
   }
@@ -93,6 +103,13 @@ export default function MasterLoyalty() {
   if (!settings && !loading) {
     // Показываем ошибку с CTA, если это 403
     if (error && error.includes('Доступ к программе лояльности')) {
       return (
         <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
           <p className="text-yellow-800 mb-2">{error}</p>
           <a href="/master?tab=tariff" className="text-blue-600 underline font-medium">
             Обновить подписку
           </a>
         </div>
       )
     }
+    // Показываем warning для 409
+    if (errorType === 'warning') {
+      return (
+        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
+          <p className="text-yellow-800">{error || 'Схема базы данных устарела'}</p>
+        </div>
+      )
+    }
     return (
       <div className="bg-red-50 border border-red-200 rounded-lg p-6">
         <p className="text-red-800">{error || 'Ошибка загрузки настроек'}</p>
@@ -154,7 +171,11 @@ export default function MasterLoyalty() {
         <>
           {/* Сообщения об ошибках и успехе */}
           {error && (
-            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
-              <p className="text-red-800">{error}</p>
+            <div className={errorType === 'warning' 
+              ? "bg-yellow-50 border border-yellow-200 rounded-lg p-4"
+              : "bg-red-50 border border-red-200 rounded-lg p-4"
+            }>
+              <p className={errorType === 'warning' ? "text-yellow-800" : "text-red-800"}>{error}</p>
             </div>
           )}
```

---

## Файл 4: `frontend/src/components/MasterLoyaltyStats.jsx`

```diff
--- a/frontend/src/components/MasterLoyaltyStats.jsx
+++ b/frontend/src/components/MasterLoyaltyStats.jsx
@@ -1,20 +1,30 @@
 import React, { useState, useEffect } from 'react'
 import { apiGet } from '../utils/api'
+import { useAuth } from '../contexts/AuthContext'
 
 export default function MasterLoyaltyStats() {
+  const { isAuthenticated, loading: authLoading } = useAuth()
   const [stats, setStats] = useState(null)
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState('')
+  const [errorType, setErrorType] = useState('error') // 'error' | 'warning'
 
   useEffect(() => {
-    loadStats()
-  }, [])
+    // Auth gating: не делаем запросы до готовности auth
+    if (authLoading || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+    loadStats()
+  }, [authLoading, isAuthenticated])
 
   const loadStats = async () => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+
     try {
       setLoading(true)
       setError('')
+      setErrorType('error')
       const data = await apiGet('/api/master/loyalty/stats')
       setStats(data)
     } catch (err) {
       console.error('Ошибка загрузки статистики:', err)
-      // Проверяем 403 - доступ запрещён (нужен тариф Pro+)
-      if (err.message?.includes('403') || err.message?.includes('status: 403')) {
-        setError('Доступ к программе лояльности доступен на плане Pro и выше')
-      } else {
-        setError('Ошибка загрузки статистики')
+      
+      // Обработка ошибок
+      const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
+      const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
+      const errorData = err.response?.data || {}
+      
+      // 401 при наличии токена
+      if (status === 401 && token) {
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setErrorType('error')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
+      }
+      // 409 SCHEMA_OUTDATED
+      else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
+        const detail = errorData.detail || 'Схема базы данных устарела'
+        const hint = errorData.hint || 'Run alembic upgrade head'
+        setError(`${detail}. ${hint}`)
+        setErrorType('warning')
+      }
+      // 404
+      else if (status === 404) {
+        const detail = errorData.detail || 'Ресурс не найден'
+        setError(detail)
+        setErrorType('error')
+      }
+      // 403 - доступ запрещён (нужен тариф Pro+)
+      else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
+        setError('Доступ к программе лояльности доступен на плане Pro и выше')
+        setErrorType('error')
+      }
+      // Другие ошибки
+      else {
+        setError('Ошибка загрузки статистики')
+        setErrorType('error')
+      }
     } finally {
       setLoading(false)
     }
   }
@@ -40,6 +50,13 @@ export default function MasterLoyaltyStats() {
   if (error) {
     // Показываем CTA для 403
     if (error.includes('Доступ к программе лояльности')) {
       return (
         <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
           <p className="text-yellow-800 mb-2">{error}</p>
           <a href="/master?tab=tariff" className="text-blue-600 underline font-medium">
             Обновить подписку
           </a>
         </div>
       )
     }
+    // Показываем warning для 409
+    if (errorType === 'warning') {
+      return (
+        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
+          <p className="text-yellow-800">{error}</p>
+        </div>
+      )
+    }
     return (
       <div className="bg-red-50 border border-red-200 rounded-lg p-6">
         <p className="text-red-800">{error}</p>
```

---

## Файл 5: `frontend/src/components/MasterLoyaltyHistory.jsx`

```diff
--- a/frontend/src/components/MasterLoyaltyHistory.jsx
+++ b/frontend/src/components/MasterLoyaltyHistory.jsx
@@ -1,6 +1,7 @@
 import React, { useState, useEffect } from 'react'
 import { apiGet } from '../utils/api'
+import { useAuth } from '../contexts/AuthContext'
 
 export default function MasterLoyaltyHistory() {
+  const { isAuthenticated, loading: authLoading } = useAuth()
   const [transactions, setTransactions] = useState([])
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState('')
+  const [errorType, setErrorType] = useState('error') // 'error' | 'warning'
   
   // Фильтры
   const [clientId, setClientId] = useState('')
@@ -20,7 +21,12 @@ export default function MasterLoyaltyHistory() {
   const [hasMore, setHasMore] = useState(false)
 
   useEffect(() => {
-    loadHistory()
-  }, [skip, clientId, transactionType, startDate, endDate])
+    // Auth gating: не делаем запросы до готовности auth
+    if (authLoading || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+    loadHistory()
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [authLoading, isAuthenticated, skip, clientId, transactionType, startDate, endDate])
 
   const loadHistory = async () => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+
     try {
       setLoading(true)
       setError('')
+      setErrorType('error')
       
       let url = `/api/master/loyalty/history?skip=${skip}&limit=${limit}`
       if (clientId) url += `&client_id=${clientId}`
       if (transactionType) url += `&transaction_type=${transactionType}`
       if (startDate) url += `&start_date=${startDate}`
       if (endDate) url += `&end_date=${endDate}`
       
       const data = await apiGet(url)
       setTransactions(data || [])
       setHasMore((data || []).length === limit)
     } catch (err) {
       console.error('Ошибка загрузки истории:', err)
-      // Проверяем 403 - доступ запрещён (нужен тариф Pro+)
-      if (err.message?.includes('403') || err.message?.includes('status: 403')) {
-        setError('Доступ к программе лояльности доступен на плане Pro и выше')
-      } else {
-        setError('Ошибка загрузки истории операций')
+      
+      // Обработка ошибок
+      const status = err.response?.status || (err.message?.match(/status: (\d+)/)?.[1] ? parseInt(err.message.match(/status: (\d+)/)[1]) : null)
+      const errorCode = err.response?.headers?.get?.('x-error-code') || err.response?.headers?.['x-error-code']
+      const errorData = err.response?.data || {}
+      
+      // 401 при наличии токена
+      if (status === 401 && token) {
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setErrorType('error')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
+      }
+      // 409 SCHEMA_OUTDATED
+      else if (status === 409 && errorCode === 'SCHEMA_OUTDATED') {
+        const detail = errorData.detail || 'Схема базы данных устарела'
+        const hint = errorData.hint || 'Run alembic upgrade head'
+        setError(`${detail}. ${hint}`)
+        setErrorType('warning')
+      }
+      // 404
+      else if (status === 404) {
+        const detail = errorData.detail || 'Ресурс не найден'
+        setError(detail)
+        setErrorType('error')
+      }
+      // 403 - доступ запрещён (нужен тариф Pro+)
+      else if (status === 403 || err.message?.includes('403') || err.message?.includes('status: 403')) {
+        setError('Доступ к программе лояльности доступен на плане Pro и выше')
+        setErrorType('error')
+      }
+      // Другие ошибки
+      else {
+        setError('Ошибка загрузки истории операций')
+        setErrorType('error')
       }
     } finally {
       setLoading(false)
     }
   }
@@ -80,7 +86,11 @@ export default function MasterLoyaltyHistory() {
       {error && (
         <div className={error.includes('Доступ к программе лояльности') 
+          || errorType === 'warning'
           ? "bg-yellow-50 border border-yellow-200 rounded-lg p-4"
           : "bg-red-50 border border-red-200 rounded-lg p-4"
         }>
           <p className={error.includes('Доступ к программе лояльности') 
+            || errorType === 'warning'
             ? "text-yellow-800 mb-2"
             : "text-red-800"
           }>
```

---

## Итоговый статус

**Все исправления применены:**
- ✅ Auth-gating во всех компонентах
- ✅ Обработка ошибок 401/403/409/404
- ✅ Форма настроек полная (уже была)
- ✅ History фильтры и пагинация (уже были)

**Статус:** ✅ ГОТОВО К ТЕСТИРОВАНИЮ

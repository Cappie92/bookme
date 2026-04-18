# Stage 2 Bugfix: useMasterSubscription перезагрузка после логина

**Дата:** 2026-01-21  
**Проблема:** `useMasterSubscription` не перезагружает features после логина, если компонент смонтировался без токена.

---

## Unified Diff

```diff
--- a/frontend/src/hooks/useMasterSubscription.js
+++ b/frontend/src/hooks/useMasterSubscription.js
@@ -1,20 +1,30 @@
 import { useState, useEffect } from 'react'
 import { API_BASE_URL } from '../utils/config'
+import { useAuth } from '../contexts/AuthContext'
 
 export function useMasterSubscription() {
+  const { isAuthenticated, loading: authLoading } = useAuth()
   const [features, setFeatures] = useState(null)
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState(null)
 
   useEffect(() => {
-    const token = localStorage.getItem('access_token')
-    if (!token) {
-      setLoading(false)
-      return
-    }
-    loadFeatures()
-  }, [])
+    // Пока auth загружается — ничего не делаем
+    if (authLoading) {
+      return
+    }
+
+    // Если пользователь не авторизован — сбрасываем состояние
+    if (!isAuthenticated) {
+      setFeatures(null)
+      setLoading(false)
+      setError(null)
+      return
+    }
+
+    // Если пользователь авторизован — загружаем features
+    loadFeatures()
+  }, [authLoading, isAuthenticated])
 
   const loadFeatures = async () => {
     const token = localStorage.getItem('access_token')
     if (!token) {
       setLoading(false)
       return
     }
 
     try {
       setLoading(true)
       setError(null)
       
       const response = await fetch(`${API_BASE_URL}/api/master/subscription/features`, {
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         }
       })
       
       if (response.ok) {
         const data = await response.json()
         setFeatures(data)
       } else if (response.status === 401) {
         // Токен недействителен - очищаем и не показываем ошибку (AuthContext обработает)
         localStorage.removeItem('access_token')
         localStorage.removeItem('refresh_token')
         localStorage.removeItem('user_role')
         setLoading(false)
       } else if (response.status === 409) {
         // SCHEMA_OUTDATED
         const errorCode = response.headers.get('X-Error-Code')
         if (errorCode === 'SCHEMA_OUTDATED') {
           const errorData = await response.json().catch(() => ({}))
           const detail = errorData.detail || 'Схема базы данных устарела'
           const hint = errorData.hint || 'Run alembic upgrade head'
           setError(`${detail}. ${hint}`)
         } else {
           setError('Не удалось загрузить информацию о подписке')
         }
       } else {
         setError('Не удалось загрузить информацию о подписке')
       }
     } catch (err) {
       console.error('Ошибка при загрузке функций подписки:', err)
       setError('Ошибка сети')
     } finally {
       setLoading(false)
     }
   }
```

---

## Изменения

1. **Добавлен импорт `useAuth`** из `AuthContext`
2. **Добавлена зависимость от `authLoading` и `isAuthenticated`** в `useEffect`
3. **Логика в `useEffect`:**
   - Пока `authLoading=true` → ничего не делаем
   - Когда `isAuthenticated=false` → сбрасываем состояние (`features=null`, `loading=false`, `error=null`)
   - Когда `isAuthenticated=true` → вызываем `loadFeatures()`
4. **Удалена проверка токена в `useEffect`** — оставлена только в `loadFeatures()`

---

## Smoke Test

### Сценарий: Открытие без токена → Логин → Запросы стартуют

**Шаги:**
1. Открыть `/master?tab=loyalty` без токена в localStorage
2. Залогиниться (через модалку или отдельную страницу)
3. Убедиться, что:
   - GET `/api/master/subscription/features` отправляется после логина
   - Вкладка "Баллы" открывается без 401 ошибок
   - `hasLoyaltyAccess` определяется корректно

**Ожидаемое поведение:**
- При монтировании без токена: `authLoading=true` → ничего не грузится
- После логина: `isAuthenticated=true` → `loadFeatures()` вызывается автоматически
- Features загружаются → `hasLoyaltyAccess` обновляется → вкладка "Баллы" работает

---

## Статус

✅ **Исправлено:** `useMasterSubscription` теперь реагирует на изменения `isAuthenticated` и перезагружает features после логина.

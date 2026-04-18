# Исправление загрузки features при старте мобильного приложения

**Дата:** 2026-01-21  
**Проблема:** При старте приложения на iOS симуляторе делается GET `/api/master/subscription/features` без токена, что приводит к 401 ошибке.

---

## Unified Diff

### 1. mobile/src/hooks/useMasterFeatures.ts

```diff
--- a/mobile/src/hooks/useMasterFeatures.ts
+++ b/mobile/src/hooks/useMasterFeatures.ts
@@ -1,6 +1,7 @@
 import { useState, useEffect, useCallback } from 'react';
 import { AppState, AppStateStatus } from 'react-native';
 import AsyncStorage from '@react-native-async-storage/async-storage';
 import { getMasterFeatures, MasterFeatures } from '@src/services/api/master';
+import { useAuth } from '@src/auth/AuthContext';
 
@@ -18,6 +19,7 @@ interface CachedData<T> {
  */
 export function useMasterFeatures() {
+  const { user, token, isAuthenticated } = useAuth();
   const [features, setFeatures] = useState<MasterFeatures | null>(null);
   const [loading, setLoading] = useState(true);
   const inFlightRef = (globalThis as any).__masterFeaturesInFlightRef || ((globalThis as any).__masterFeaturesInFlightRef = { p: null as Promise<MasterFeatures> | null });
 
   const loadFeatures = useCallback(async (forceRefresh = false) => {
+    // Не загружаем features, если нет токена, пользователя или роль не master
+    if (!token || !user || user.role !== 'master') {
+      if (__DEV__) {
+        console.log('[FEATURES] Пропуск загрузки - нет токена/пользователя/роли master', {
+          hasToken: !!token,
+          hasUser: !!user,
+          userRole: user?.role,
+        });
+      }
+      setLoading(false);
+      return;
+    }
     try {
       // ... existing code ...
     } finally {
       setLoading(false);
     }
-  }, []);
+  }, [token, user]);
 
   useEffect(() => {
-    loadFeatures();
+    // Загружаем features только если есть токен, пользователь и роль master
+    if (token && user && user.role === 'master') {
+      loadFeatures();
+    } else {
+      setLoading(false);
+    }
     
     // Обновляем при фокусе приложения
     const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
-      if (nextAppState === 'active') {
+      if (nextAppState === 'active' && token && user && user.role === 'master') {
         loadFeatures(true);
       }
     });
 
     return () => {
       subscription.remove();
     };
-  }, [loadFeatures]);
+  }, [loadFeatures, token, user]);
```

---

### 2. mobile/src/hooks/useFeatureAccess.ts

```diff
--- a/mobile/src/hooks/useFeatureAccess.ts
+++ b/mobile/src/hooks/useFeatureAccess.ts
@@ -1,6 +1,7 @@
 import { useState, useEffect, useCallback } from 'react';
 import { AppState, AppStateStatus } from 'react-native';
 import AsyncStorage from '@react-native-async-storage/async-storage';
 import { getMasterFeatures, MasterFeatures } from '@src/services/api/master';
 import { fetchAvailableSubscriptions, SubscriptionPlan, SubscriptionType } from '@src/services/api/subscriptions';
 import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
+import { useAuth } from '@src/auth/AuthContext';
 
@@ -28,6 +29,7 @@ interface FeatureAccessResult {
  */
 export function useFeatureAccess(featureKey: string): FeatureAccessResult {
+  const { user, token } = useAuth();
   const [features, setFeatures] = useState<MasterFeatures | null>(null);
   const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
   const [loading, setLoading] = useState(true);
 
   const loadFeatures = useCallback(async (forceRefresh = false) => {
+    // Не загружаем features, если нет токена, пользователя или роль не master
+    if (!token || !user || user.role !== 'master') {
+      if (__DEV__) {
+        console.log('[FEATURE ACCESS] Пропуск загрузки - нет токена/пользователя/роли master', {
+          hasToken: !!token,
+          hasUser: !!user,
+          userRole: user?.role,
+        });
+      }
+      setLoading(false);
+      return;
+    }
     try {
       // ... existing code ...
     } finally {
       setLoading(false);
     }
-  }, []);
+  }, [token, user]);
 
   const loadPlans = useCallback(async (forceRefresh = false) => {
+    // Не загружаем plans, если нет токена, пользователя или роль не master
+    if (!token || !user || user.role !== 'master') {
+      return;
+    }
     try {
       // ... existing code ...
     } catch (error) {
       // ... existing code ...
     }
-  }, []);
+  }, [token, user]);
 
   useEffect(() => {
-    loadFeatures();
-    loadPlans();
+    // Загружаем features и plans только если есть токен, пользователь и роль master
+    if (token && user && user.role === 'master') {
+      loadFeatures();
+      loadPlans();
+    } else {
+      setLoading(false);
+    }
 
     // Обновляем при фокусе приложения
     const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
-      if (nextAppState === 'active') {
+      if (nextAppState === 'active' && token && user && user.role === 'master') {
         loadFeatures(true);
         loadPlans(true);
       }
     });
 
     return () => {
       subscription.remove();
     };
-  }, [loadFeatures, loadPlans]);
+  }, [loadFeatures, loadPlans, token, user]);
```

---

### 3. mobile/src/services/api/client.ts

```diff
--- a/mobile/src/services/api/client.ts
+++ b/mobile/src/services/api/client.ts
@@ -69,6 +69,11 @@ apiClient.interceptors.response.use(
   async (error: AxiosError) => {
     const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
 
+    // Проверяем, был ли токен в запросе
+    const hadToken = originalRequest.headers?.Authorization || apiClient.defaults.headers.common['Authorization'];
+
     // Обработка 401 Unauthorized - токен невалиден
     if (error.response?.status === 401 && !originalRequest._retry) {
       originalRequest._retry = true;
@@ -76,7 +81,13 @@ apiClient.interceptors.response.use(
       // Очищаем токен из хранилища, если это не запрос /api/auth/users/me при загрузке
       // (чтобы избежать двойной очистки - AuthContext сам очистит при ошибке getCurrentUser)
       const isAuthMeRequest = originalRequest.url === '/api/auth/users/me' || originalRequest.url?.includes('/api/auth/users/me');
       
+      // Если токена не было, не логируем как ERROR и не очищаем токен
+      if (!hadToken) {
+        if (__DEV__) {
+          console.log('🔑 [API] 401 без токена (ожидаемо) - URL:', originalRequest.url);
+        }
+        // Не логируем как ошибку и не очищаем токен, если его не было
+      } else if (!isAuthMeRequest) {
-      if (!isAuthMeRequest) {
         try {
           // Очищаем токен из SecureStore
           try {
@@ -107,6 +118,9 @@ apiClient.interceptors.response.use(
       const status = error.response.status;
       const data = error.response.data as any;
       const url = originalRequest?.url || '';
       
+      // Проверяем, был ли токен в запросе
+      const hadToken = originalRequest.headers?.Authorization || apiClient.defaults.headers.common['Authorization'];
+      
+      // Не логируем 401 как ERROR, если токена не было (ожидаемое поведение)
+      const is401WithoutToken = status === 401 && !hadToken;
       
       // Не логируем 404 для endpoints, которые могут быть еще не реализованы
       const silent404Endpoints = [
@@ -115,7 +129,7 @@ apiClient.interceptors.response.use(
         '/api/master/loyalty/status',
       ];
       
       const isSilent404 = status === 404 && silent404Endpoints.some(endpoint => url.includes(endpoint));
       
-      if (!isSilent404) {
+      if (!isSilent404 && !is401WithoutToken) {
         console.error('API Error:', {
           status,
           message: data?.detail || data?.message || error.message,
```

---

## Smoke Plan

### Тест 1: Старт без токена → нет ошибок

**Шаги:**
1. Удалить токен из AsyncStorage/SecureStore (или запустить приложение впервые)
2. Запустить приложение на iOS симуляторе
3. Проверить логи консоли

**Ожидаемый результат:**
- ✅ Нет запроса к `/api/master/subscription/features`
- ✅ Нет ошибок 401 в консоли
- ✅ В логах (если `__DEV__`) видно: `[FEATURES] Пропуск загрузки - нет токена/пользователя/роли master`
- ✅ Приложение запускается без ошибок

**Проверка:**
```bash
# В логах не должно быть:
# ❌ GET /api/master/subscription/features 401
# ❌ API Error: 401 Unauthorized

# Должно быть (если __DEV__):
# ✅ [FEATURES] Пропуск загрузки - нет токена/пользователя/роли master
```

---

### Тест 2: Логин мастером → features грузятся успешно

**Шаги:**
1. Запустить приложение
2. Войти как мастер (с валидными credentials)
3. Дождаться загрузки `/api/auth/users/me`
4. Проверить логи консоли

**Ожидаемый результат:**
- ✅ После успешного логина и загрузки пользователя делается запрос к `/api/master/subscription/features`
- ✅ Запрос содержит токен в заголовке `Authorization: Bearer <token>`
- ✅ Запрос возвращает 200 OK с данными features
- ✅ Features загружаются и сохраняются в кеш

**Проверка:**
```bash
# В логах должно быть:
# ✅ GET /api/master/subscription/features 200
# ✅ [FEATURES] source: network
# ✅ Features загружены успешно
```

---

### Тест 3: Логин клиентом → features не грузятся

**Шаги:**
1. Запустить приложение
2. Войти как клиент (с валидными credentials)
3. Дождаться загрузки `/api/auth/users/me`
4. Проверить логи консоли

**Ожидаемый результат:**
- ✅ Нет запроса к `/api/master/subscription/features` (роль не master)
- ✅ В логах (если `__DEV__`) видно: `[FEATURES] Пропуск загрузки - нет токена/пользователя/роли master` с `userRole: 'client'`

**Проверка:**
```bash
# В логах не должно быть:
# ❌ GET /api/master/subscription/features

# Должно быть (если __DEV__):
# ✅ [FEATURES] Пропуск загрузки - нет токена/пользователя/роли master { userRole: 'client' }
```

---

## Итоговый вывод

✅ **Исправлено:**
1. Добавлена проверка токена/пользователя/роли перед загрузкой features в `useMasterFeatures`
2. Добавлена проверка токена/пользователя/роли перед загрузкой features в `useFeatureAccess`
3. Добавлена безопасная обработка 401 в axios interceptor (не логирует как ERROR и не очищает токен, если токена не было)
4. Features загружаются только после успешного логина и только для мастера

✅ **Готово к тестированию:**
- Старт без токена → нет ошибок
- Логин мастером → features грузятся успешно
- Логин клиентом → features не грузятся

---

**Файлы изменены:**
- `mobile/src/hooks/useMasterFeatures.ts`
- `mobile/src/hooks/useFeatureAccess.ts`
- `mobile/src/services/api/client.ts`

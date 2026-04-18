# P0 + P1 Fixes: Unified Diff

**Дата:** 2026-01-21

---

## P0 Fix: Auth-gating в WEB LoyaltySystem.jsx

```diff
--- a/frontend/src/components/LoyaltySystem.jsx
+++ b/frontend/src/components/LoyaltySystem.jsx
@@ -1,9 +1,11 @@
 import React, { useState, useEffect } from 'react'
 import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
 import { getApiUrl } from '../utils/config'
 import { Button, Tabs } from './ui'
+import { useAuth } from '../contexts/AuthContext'
 import MasterLoyalty from './MasterLoyalty'
 
 export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = false }) {
+  const { isAuthenticated, loading: authLoading } = useAuth()
   // Верхние табы: Скидки / Баллы
   const [mainTab, setMainTab] = useState('discounts') // 'discounts' | 'points'
   // Подтабы для Скидок
@@ -32,7 +34,20 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fal
 
   useEffect(() => {
-    // Не делаем запросы, если нет доступа к лояльности
-    // Эти эндпоинты могут не существовать или требовать доступа Pro+
+    // Auth gating: не делаем запросы до готовности auth
+    if (authLoading) {
+      return
+    }
+
+    // Не делаем запросы, если нет доступа к лояльности
     if (hasLoyaltyAccess === false) {
       setLoading(false)
       setTemplates([])
       setQuickDiscounts([])
       setComplexDiscounts([])
       setPersonalDiscounts([])
       return
     }
+
+    // Проверяем токен и авторизацию
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated) {
+      setLoading(false)
+      setTemplates([])
+      setQuickDiscounts([])
+      setComplexDiscounts([])
+      setPersonalDiscounts([])
+      return
+    }
+
     loadData()
-    // eslint-disable-next-line react-hooks/exhaustive-deps
-  }, [hasLoyaltyAccess])
+  }, [hasLoyaltyAccess, authLoading, isAuthenticated])
 
   const loadData = async () => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated) {
+      setLoading(false)
+      return
+    }
+
     setLoading(true)
     setError('')
     setErrorType('error')
     setSubscriptionRequired(false)
     
     try {
       // ... existing code ...
       } else if (statusResponse.status === 409) {
         // ... existing code ...
-      } else if (statusResponse.status === 404) {
+      } else if (statusResponse.status === 401) {
+        // 401 при наличии токена - очищаем токен и редиректим
+        const token = localStorage.getItem('access_token')
+        if (token) {
+          localStorage.removeItem('access_token')
+          localStorage.removeItem('refresh_token')
+          localStorage.removeItem('user_role')
+          setError('Сессия истекла. Пожалуйста, войдите снова.')
+          setErrorType('error')
+          setSubscriptionRequired(false)
+          setQuickDiscounts([])
+          setComplexDiscounts([])
+          setPersonalDiscounts([])
+          setTimeout(() => {
+            window.location.href = '/login'
+          }, 2000)
+        }
+      } else if (statusResponse.status === 404) {
         // ... existing code ...
       } else if (statusResponse.status === 403) {
         // ... existing code ...
@@ -166,6 +201,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleCreateQuickDiscount = async (template, customDiscountPercent = null) => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
         setEditingTemplate(null)
         setEditTemplateValue('')
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка создания скидки')
@@ -202,6 +243,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleDeleteQuickDiscount = async (discountId) => {
     if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return
 
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка удаления скидки')
@@ -223,6 +270,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleCreatePersonalDiscount = async (formData) => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return false
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
         return true
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
+        return false
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка создания персональной скидки')
@@ -249,6 +302,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleUpdateQuickDiscount = async (discountId, newDiscountPercent) => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
         setEditingDiscount(null)
         setEditDiscountValue('')
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка обновления скидки')
@@ -276,6 +335,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleCreateComplexDiscount = async (formData) => {
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return false
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
         setShowComplexForm(false)
         setComplexForm({
           name: '',
           description: '',
           discount_percent: '',
           conditions: []
         })
         return true
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
+        return false
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка создания сложной скидки')
@@ -318,6 +383,12 @@ export default function LoyaltySystem({ getAuthHeaders, hasLoyaltyAccess = fals
 
   const handleDeleteComplexDiscount = async (discountId) => {
     if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return
 
+    const token = localStorage.getItem('access_token')
+    if (!token || !isAuthenticated || authLoading) {
+      setError('Необходима авторизация')
+      return
+    }
+
     try {
       // ... existing code ...
       if (response.ok) {
         await loadData()
+      } else if (response.status === 401) {
+        // 401 - очищаем токен и редиректим
+        localStorage.removeItem('access_token')
+        localStorage.removeItem('refresh_token')
+        localStorage.removeItem('user_role')
+        setError('Сессия истекла. Пожалуйста, войдите снова.')
+        setTimeout(() => {
+          window.location.href = '/login'
+        }, 2000)
       } else {
         const errorData = await response.json()
         setError(errorData.detail || 'Ошибка удаления скидки')
```

---

## P1 Fix: Фильтры и пагинация в MOBILE History

```diff
--- a/mobile/app/master/loyalty.tsx
+++ b/mobile/app/master/loyalty.tsx
@@ -115,6 +115,15 @@ export default function MasterLoyaltyScreen() {
   const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
   const [historyLoading, setHistoryLoading] = useState(false);
   const [historyError, setHistoryError] = useState<string | null>(null);
+  
+  // Фильтры и пагинация для истории
+  const [historyClientId, setHistoryClientId] = useState<string>('');
+  const [historyTransactionType, setHistoryTransactionType] = useState<'earned' | 'spent' | ''>('');
+  const [historyStartDate, setHistoryStartDate] = useState<string>('');
+  const [historyEndDate, setHistoryEndDate] = useState<string>('');
+  const [historySkip, setHistorySkip] = useState(0);
+  const [historyLimit] = useState(50);
+  const [historyHasMore, setHistoryHasMore] = useState(false);
 
   const hasLoyaltyAccess = features?.has_loyalty_access === true;
 
@@ -292,7 +301,25 @@ export default function MasterLoyaltyScreen() {
   const loadHistory = async () => {
     if (!hasLoyaltyAccess || !token || !isAuthenticated) return;
 
     try {
       setHistoryError(null);
       setHistoryLoading(true);
-      const data = await getLoyaltyHistory({ limit: 50 });
+      
+      const filters: any = {
+        skip: historySkip,
+        limit: historyLimit,
+      };
+      
+      if (historyClientId) {
+        filters.client_id = parseInt(historyClientId, 10);
+      }
+      if (historyTransactionType) {
+        filters.transaction_type = historyTransactionType;
+      }
+      if (historyStartDate) {
+        filters.start_date = historyStartDate;
+      }
+      if (historyEndDate) {
+        filters.end_date = historyEndDate;
+      }
+      
+      const data = await getLoyaltyHistory(filters);
       setHistory(data);
+      setHistoryHasMore(data.length === historyLimit);
       
       if (__DEV__) {
         console.log('[LOYALTY] History loaded:', data.length, 'transactions');
@@ -311,7 +338,17 @@ export default function MasterLoyaltyScreen() {
     }
   };
 
+  const handleResetHistoryFilters = () => {
+    setHistoryClientId('');
+    setHistoryTransactionType('');
+    setHistoryStartDate('');
+    setHistoryEndDate('');
+    setHistorySkip(0);
+  };
+
   useEffect(() => {
-    if (pointsTab === 'history' && hasLoyaltyAccess && token && isAuthenticated && history.length === 0) {
+    if (pointsTab === 'history' && hasLoyaltyAccess && token && isAuthenticated) {
       loadHistory();
     }
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [pointsTab, hasLoyaltyAccess, token, isAuthenticated, historySkip, historyClientId, historyTransactionType, historyStartDate, historyEndDate]);
 
   useEffect(() => {
@@ -882,6 +919,100 @@ export default function MasterLoyaltyScreen() {
             {pointsTab === 'history' && (
               <>
+                {historyError && (
+                  <Card style={styles.errorCard}>
+                    <Text style={styles.errorText}>{historyError}</Text>
+                  </Card>
+                )}
+
+                {/* Фильтры */}
+                <Card style={styles.card}>
+                  <Text style={styles.cardTitle}>Фильтры</Text>
+                  <View style={styles.filtersContainer}>
+                    <View style={styles.filterRow}>
+                      <Text style={styles.filterLabel}>Клиент (ID)</Text>
+                      <TextInput
+                        style={styles.filterInput}
+                        value={historyClientId}
+                        onChangeText={(text) => {
+                          setHistoryClientId(text);
+                          setHistorySkip(0);
+                        }}
+                        placeholder="ID клиента"
+                        keyboardType="numeric"
+                      />
+                    </View>
+
+                    <View style={styles.filterRow}>
+                      <Text style={styles.filterLabel}>Тип операции</Text>
+                      <View style={styles.filterSelectContainer}>
+                        <TouchableOpacity
+                          style={[
+                            styles.filterSelectOption,
+                            historyTransactionType === '' && styles.filterSelectOptionActive,
+                          ]}
+                          onPress={() => {
+                            setHistoryTransactionType('');
+                            setHistorySkip(0);
+                          }}
+                        >
+                          <Text style={[styles.filterSelectText, historyTransactionType === '' && styles.filterSelectTextActive]}>
+                            Все
+                          </Text>
+                        </TouchableOpacity>
+                        <TouchableOpacity
+                          style={[
+                            styles.filterSelectOption,
+                            historyTransactionType === 'earned' && styles.filterSelectOptionActive,
+                          ]}
+                          onPress={() => {
+                            setHistoryTransactionType('earned');
+                            setHistorySkip(0);
+                          }}
+                        >
+                          <Text style={[styles.filterSelectText, historyTransactionType === 'earned' && styles.filterSelectTextActive]}>
+                            Начисление
+                          </Text>
+                        </TouchableOpacity>
+                        <TouchableOpacity
+                          style={[
+                            styles.filterSelectOption,
+                            historyTransactionType === 'spent' && styles.filterSelectOptionActive,
+                          ]}
+                          onPress={() => {
+                            setHistoryTransactionType('spent');
+                            setHistorySkip(0);
+                          }}
+                        >
+                          <Text style={[styles.filterSelectText, historyTransactionType === 'spent' && styles.filterSelectTextActive]}>
+                            Списание
+                          </Text>
+                        </TouchableOpacity>
+                      </View>
+                    </View>
+
+                    <View style={styles.filterRow}>
+                      <Text style={styles.filterLabel}>Дата начала</Text>
+                      <TextInput
+                        style={styles.filterInput}
+                        value={historyStartDate}
+                        onChangeText={(text) => {
+                          setHistoryStartDate(text);
+                          setHistorySkip(0);
+                        }}
+                        placeholder="YYYY-MM-DD"
+                      />
+                    </View>
+
+                    <View style={styles.filterRow}>
+                      <Text style={styles.filterLabel}>Дата конца</Text>
+                      <TextInput
+                        style={styles.filterInput}
+                        value={historyEndDate}
+                        onChangeText={(text) => {
+                          setHistoryEndDate(text);
+                          setHistorySkip(0);
+                        }}
+                        placeholder="YYYY-MM-DD"
+                      />
+                    </View>
+                  </View>
+
+                  <TouchableOpacity
+                    style={styles.resetFiltersButton}
+                    onPress={handleResetHistoryFilters}
+                  >
+                    <Text style={styles.resetFiltersText}>Сбросить фильтры</Text>
+                  </TouchableOpacity>
+                </Card>
+
                 {historyLoading ? (
                   <View style={styles.centerContainer}>
                     <ActivityIndicator size="large" color="#4CAF50" />
@@ -897,6 +1038,25 @@ export default function MasterLoyaltyScreen() {
                         </Text>
                       </Card>
                     ))}
                   </View>
+
+                  {/* Пагинация */}
+                  {history.length > 0 && (
+                    <View style={styles.paginationContainer}>
+                      <Text style={styles.paginationText}>
+                        Показано {historySkip + 1} - {historySkip + history.length} операций
+                      </Text>
+                      <View style={styles.paginationButtons}>
+                        <TouchableOpacity
+                          style={[styles.paginationButton, historySkip === 0 && styles.paginationButtonDisabled]}
+                          onPress={() => setHistorySkip(Math.max(0, historySkip - historyLimit))}
+                          disabled={historySkip === 0}
+                        >
+                          <Text style={[styles.paginationButtonText, historySkip === 0 && styles.paginationButtonTextDisabled]}>Назад</Text>
+                        </TouchableOpacity>
+                        <TouchableOpacity
+                          style={[styles.paginationButton, !historyHasMore && styles.paginationButtonDisabled]}
+                          onPress={() => setHistorySkip(historySkip + historyLimit)}
+                          disabled={!historyHasMore}
+                        >
+                          <Text style={[styles.paginationButtonText, !historyHasMore && styles.paginationButtonTextDisabled]}>Вперед</Text>
+                        </TouchableOpacity>
+                      </View>
+                    </View>
+                  )}
                 )}
               </>
             )}
@@ -1546,6 +1706,50 @@ export default function MasterLoyaltyScreen() {
   discountMaxAmount: {
     fontSize: 12,
     color: '#999',
     marginTop: 8,
   },
+  filtersContainer: {
+    gap: 16,
+  },
+  filterRow: {
+    marginBottom: 16,
+  },
+  filterLabel: {
+    fontSize: 14,
+    fontWeight: '500',
+    color: '#333',
+    marginBottom: 8,
+  },
+  filterInput: {
+    borderWidth: 1,
+    borderColor: '#E0E0E0',
+    borderRadius: 8,
+    padding: 12,
+    fontSize: 16,
+    backgroundColor: '#FFF',
+  },
+  filterSelectContainer: {
+    flexDirection: 'row',
+    gap: 8,
+  },
+  filterSelectOption: {
+    flex: 1,
+    padding: 12,
+    borderWidth: 1,
+    borderColor: '#E0E0E0',
+    borderRadius: 8,
+    backgroundColor: '#FFF',
+    alignItems: 'center',
+  },
+  filterSelectOptionActive: {
+    borderColor: '#4CAF50',
+    backgroundColor: '#E8F5E9',
+  },
+  filterSelectText: {
+    fontSize: 14,
+    color: '#666',
+  },
+  filterSelectTextActive: {
+    color: '#4CAF50',
+    fontWeight: '600',
+  },
+  resetFiltersButton: {
+    marginTop: 8,
+    paddingVertical: 8,
+  },
+  resetFiltersText: {
+    fontSize: 14,
+    color: '#666',
+    textDecorationLine: 'underline',
+  },
+  paginationContainer: {
+    marginTop: 16,
+    padding: 16,
+    backgroundColor: '#F5F5F5',
+    borderRadius: 8,
+    flexDirection: 'row',
+    justifyContent: 'space-between',
+    alignItems: 'center',
+  },
+  paginationText: {
+    fontSize: 14,
+    color: '#666',
+  },
+  paginationButtons: {
+    flexDirection: 'row',
+    gap: 8,
+  },
+  paginationButton: {
+    paddingHorizontal: 16,
+    paddingVertical: 8,
+    borderWidth: 1,
+    borderColor: '#E0E0E0',
+    borderRadius: 8,
+    backgroundColor: '#FFF',
+  },
+  paginationButtonDisabled: {
+    opacity: 0.5,
+  },
+  paginationButtonText: {
+    fontSize: 14,
+    color: '#333',
+  },
+  paginationButtonTextDisabled: {
+    color: '#999',
+  },
 });
```

---

## P0 Smoke Checklist (5 пунктов)

1. ✅ **Открытие без токена → нет запросов**
   - Открыть `/master?tab=loyalty` без токена
   - Ожидаемо: нет запросов к `/api/loyalty/*` в Network tab
   - Ожидаемо: нет ошибок в консоли

2. ✅ **Логин → запросы стартуют**
   - Открыть без токена → залогиниться
   - Ожидаемо: после логина запросы к `/api/loyalty/status` и `/api/loyalty/templates` отправляются автоматически

3. ✅ **401 при наличии токена → очистка + redirect**
   - Открыть с невалидным токеном (или истёкшим)
   - Ожидаемо: GET `/api/loyalty/status` → 401
   - Ожидаемо: токены очищены из localStorage
   - Ожидаемо: сообщение "Сессия истекла..."
   - Ожидаемо: через 2 сек → redirect на `/login`

4. ✅ **403/409/404 обрабатываются корректно**
   - 403 → жёлтый блок + CTA "Обновить подписку"
   - 409 SCHEMA_OUTDATED → жёлтый warning блок с hint
   - 404 → красный error блок

5. ✅ **CRUD операции защищены auth-gating**
   - Создать/редактировать/удалить скидку без токена → ошибка "Необходима авторизация"
   - Создать/редактировать/удалить скидку с токеном → работает

---

## P1 Smoke Checklist (7-10 пунктов)

1. ✅ **Фильтры отображаются**
   - Открыть "Баллы → История"
   - Ожидаемо: видны фильтры (Клиент ID, Тип операции, Дата начала, Дата конца, кнопка "Сбросить")

2. ✅ **Фильтр по client_id**
   - Ввести client_id → изменить значение
   - Ожидаемо: запрос отправляется с `&client_id=123`
   - Ожидаемо: `skip` сбрасывается в 0

3. ✅ **Фильтр по transaction_type**
   - Выбрать "Начисление" / "Списание"
   - Ожидаемо: запрос отправляется с `&transaction_type=earned` или `&transaction_type=spent`
   - Ожидаемо: `skip` сбрасывается в 0

4. ✅ **Фильтр по датам**
   - Ввести start_date и end_date (YYYY-MM-DD)
   - Ожидаемо: запрос отправляется с `&start_date=2026-01-01&end_date=2026-01-31`
   - Ожидаемо: `skip` сбрасывается в 0

5. ✅ **Сброс фильтров**
   - Заполнить все фильтры → нажать "Сбросить фильтры"
   - Ожидаемо: все фильтры очищены, `skip=0`
   - Ожидаемо: запрос отправляется без параметров фильтров

6. ✅ **Пагинация: Назад/Вперед**
   - Нажать "Вперед" → `skip` увеличивается на 50
   - Нажать "Назад" → `skip` уменьшается на 50
   - Ожидаемо: кнопка "Назад" disabled если `skip === 0`
   - Ожидаемо: кнопка "Вперед" disabled если `!hasMore`

7. ✅ **Пагинация: отображение диапазона**
   - Ожидаемо: "Показано 1 - 50 операций" (или другой диапазон)

8. ✅ **Изменение фильтра сбрасывает skip**
   - Нажать "Вперед" несколько раз (skip=100)
   - Изменить любой фильтр
   - Ожидаемо: `skip` сбрасывается в 0, запрос отправляется с новыми фильтрами

9. ✅ **Auth-gating сохранён**
   - Открыть без токена → нет запросов
   - Залогиниться → запросы стартуют

10. ✅ **Пустой результат**
    - Применить фильтры, которые не дают результатов
    - Ожидаемо: "Нет транзакций" (без краша)

# 401 при PUT /api/master/profile — Diff-Summary

## Почему было 401

**Причина:** В `apiFetch` при отправке FormData вместо полных `headers` (из `getAuthHeaders()`) подставлялся пустой объект `{}`:

```javascript
// БЫЛО (баг):
headers: {
  ...(isFormData ? {} : headers),  // для FormData = {} — терялся Authorization!
  ...options.headers
}
```

В результате **заголовок `Authorization: Bearer <token>` не отправлялся** при PUT с FormData.  
`MasterSettings` использует `apiFetch` с `body: formData` для сохранения профиля (фото, логотип, FormData).  
Остальные запросы (GET pending-confirmations, POST confirm-booking и т.д.) используют `apiRequest`/`apiGet`/`apiPost`, где headers задаются полностью — поэтому они возвращали 200.

## Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `frontend/src/utils/api.js` | 1) В `apiFetch`: для FormData оставляем `Authorization`, убираем только `Content-Type`. 2) В `apiRequest` и `apiRequestSilent`: добавлен `credentials: 'include'`. 3) Dev-диагностика 401: при статусе 401 логируется `method`, `url`, `hasAuthHeader`, `credentials`, `detail` (без токенов). |

## Smoke Checklist

1. **Залогиниться мастером** → открыть Настройки.
2. **Изменить параметр** (например, auto_confirm_bookings или pre_visit_confirmations_enabled) → Сохранить.
3. **Проверить:** PUT /api/master/profile = 200, UI показывает «Профиль успешно обновлен», после перезагрузки настройка сохранена.
4. **Проверить:** GET pending-confirmations, future/past bookings, демо-режимы работают без 401.
5. **Проверить (DevTools):** в запросе PUT /api/master/profile есть заголовок `Authorization: Bearer ...`.

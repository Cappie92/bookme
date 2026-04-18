# MASTER_CANON — Mobile master-only план (diff checklist)

**Цель:** favKey только `"master:N"`, hydrate только `/favorites/masters`, убрать indie_master из UI/логики.

**Статус:** План без применения кода. Выполнять после деплоя backend с MASTER_CANON_MODE=1.

---

## 1. Список файлов mobile, затрагивающих favorites/favKey

| Файл | Роль |
|------|------|
| `mobile/src/utils/clientDashboard.ts` | getFavoriteKeyFromBooking, getFavoriteKeyFromFavorite, FavoriteType, parseFavoriteKey |
| `mobile/src/stores/favoritesStore.ts` | hydrateFavorites (2 запроса), toggleFavoriteByKey |
| `mobile/src/services/api/favorites.ts` | getAllFavorites, addToFavorites, removeFromFavorites, FavoriteType |
| `mobile/src/components/client/BookingRowFuture.tsx` | favKey, addContext type |
| `mobile/src/components/client/BookingRowPast.tsx` | favKey, addContext type |
| `mobile/app/client/dashboard.tsx` | handleToggleFavorite, FavoriteCard map, collision detection |
| `mobile/app/client/bookings-future.tsx` | handleToggleFavorite |
| `mobile/app/client/bookings-past.tsx` | handleToggleFavorite |
| `mobile/app/bookings/index.tsx` | getFavoriteType, favoriteItemId (indie-master) |

---

## 2. Diff checklist по файлам

### 2.1. `mobile/src/utils/clientDashboard.ts`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 142 | `FavoriteType = 'master' \| 'indie_master'` → `FavoriteType = 'master'` |
| **Заменить** | 155-165 | `getFavoriteKeyFromBooking`: убрать ветку `indie_master_id`. Использовать только `master_id` → `getFavoriteKey('master', id)` |
| **Заменить** | 171-176 | `getFavoriteKeyFromFavorite`: убрать `indie_master`. Всегда `type='master'`, `itemId=fav.master_id` |
| **Заменить** | 182-186 | `parseFavoriteKey`: убрать `indie_master`. Только `type === 'master'` |
| **Заменить** | 194-196 | `getBookingTypeAndId`: после смены getFavoriteKeyFromBooking — автоматически только master |

**Итог:** favKey всегда `"master:N"`.

---

### 2.2. `mobile/src/stores/favoritesStore.ts`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Удалить** | 64-72 | Блок `apiClient.get('/api/client/favorites/indie-masters')` и `allFavorites.push(...indie.map(...))` |
| **Заменить** | 80 | `logFav`: убрать `indieFavoritesCount`, оставить `mastersFavoritesCount` |
| **Заменить** | 139-142 | `toggleFavoriteByKey` REMOVE: убрать ветку `indie_master`. Всегда `favType='master'`, `favItemId=matched.master_id` |

**Итог:** hydrate только `/favorites/masters`, toggle только master.

---

### 2.3. `mobile/src/services/api/favorites.ts`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 4 | `FavoriteType`: убрать `'indie-master' \| 'indie_master'` |
| **Удалить** | 86-99 | Блок загрузки indie-masters в `getAllFavorites` |
| **Заменить** | 130-140 | `addToFavorites`: убрать `indie_master`. Только `master`, `salon`, `service` |
| **Заменить** | 148-152 | `removeFromFavorites`: убрать нормализацию `indie-master`/`indie_master` |
| **Заменить** | 164-167 | `getFavoriteName`: убрать ветку `indie-master` |
| **Заменить** | 183-186 | `getFavoriteItemId`: убрать ветку `indie-master` |

**Итог:** API только master.

---

### 2.4. `mobile/src/components/client/BookingRowFuture.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 21 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `addContext?: { type: 'master'; ... }` |
| **Заменить** | 44-47 | `resolvedType`: убрать `indie_master`, только `master` |
| **Заменить** | 55 | Лог: убрать `indie_master_id` (опционально) |

---

### 2.5. `mobile/src/components/client/BookingRowPast.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 21 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `addContext?: { type: 'master'; ... }` |
| **Заменить** | 44-47 | `resolvedType`: убрать `indie_master` |

---

### 2.6. `mobile/app/client/dashboard.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 102 | `handleToggleFavorite`: `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |
| **Удалить/упростить** | 81-102 | Collision detection по master_name — можно убрать (коллизий не будет) |
| **Заменить** | 234-245 | FavoriteCard map: `fav.master_id ?? fav.indie_master_id` → только `fav.master_id` |

---

### 2.7. `mobile/app/client/bookings-future.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 51 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |

---

### 2.8. `mobile/app/client/bookings-past.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 51 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |

---

### 2.9. `mobile/app/bookings/index.tsx`

| Действие | Строки | Изменение |
|----------|--------|-----------|
| **Заменить** | 64-69 | `getFavoriteType`: убрать `if (item.indie_master_id) return 'indie-master'`. Только `master`, `salon` |
| **Заменить** | 72 | `favoriteItemId`: `item.master_id || item.salon_id` (убрать indie_master_id) |
| **Заменить** | 83 | Условие: `favoriteType === 'master'` (убрать `indie-master`) |

---

## 3. Порядок применения

1. **clientDashboard.ts** — базовая логика favKey
2. **favoritesStore.ts** — hydrate + toggle
3. **favorites.ts** — API
4. **BookingRowFuture.tsx, BookingRowPast.tsx** — типы
5. **dashboard.tsx, bookings-future.tsx, bookings-past.tsx** — handleToggleFavorite
6. **bookings/index.tsx** — список бронирований

---

## 4. Проверки после применения

- [ ] `[FAV][hydrate]` — один запрос `/favorites/masters`, нет indie
- [ ] `[FAV][row]` — favKey только `master:N`
- [ ] Toggle favorite на booking (master) — работает
- [ ] Toggle favorite на booking (бывший indie) — работает (backend отдаёт master_id)
- [ ] Нет `indie_master:*` в логах

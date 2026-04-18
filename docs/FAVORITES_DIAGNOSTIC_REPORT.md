# Диагностический отчёт: Favorites (mobile ↔ backend)

## 1. BACKEND: точный контракт favorites

### 1.1. Роуты и методы

**Файл:** `backend/routers/client.py`  
**Роутер:** `profile_router` (prefix=`/client`), включён в `main.py` с prefix=`/api`).  
**Итоговый базовый путь:** `/api/client`

| Метод | Путь | Файл:строки |
|-------|------|-------------|
| **POST** | `/favorites` | client.py:1708-1709 |
| **DELETE** | `/favorites/{favorite_type}/{item_id}` | client.py:1926-1927 |
| **GET** | `/favorites/salons` | client.py:1999 |
| **GET** | `/favorites/masters` | client.py:2054 |
| **GET** | `/favorites/indie-masters` | client.py:2117 |
| **GET** | `/favorites/services` | client.py:2182 |
| **GET** | `/favorites/check/{favorite_type}/{item_id}` | client.py:2252 |

**Полные URL:**
- ADD: `POST /api/client/favorites`
- REMOVE: `DELETE /api/client/favorites/{favorite_type}/{item_id}`
- LIST masters: `GET /api/client/favorites/masters`
- LIST indie-masters: `GET /api/client/favorites/indie-masters`

---

### 1.2. Схемы запроса/ответа

**POST body (ClientFavoriteCreate):**

```python
# backend/schemas.py:2156-2165
class ClientFavoriteBase(BaseModel):
    favorite_type: str
    favorite_name: str

class ClientFavoriteCreate(ClientFavoriteBase):
    salon_id: Optional[int] = None
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    service_id: Optional[int] = None
```

**Поля:**
- `favorite_type` — строка
- `favorite_name` — строка
- `master_id` — опционально, для master
- `indie_master_id` — опционально, для indie_master
- `salon_id`, `service_id` — для salon/service

**POST response (client.py:1799):**
```python
return {"message": "Item added to favorites successfully", "favorite": {"id": new_favorite.client_favorite_id}}
```

---

### 1.3. Допустимые значения favorite_type

В backend нет явного enum. Используются строки:

- `salon` — salon_id
- `master` — master_id
- `indie_master` — indie_master_id
- `service` — service_id

Для DELETE backend принимает дополнительные варианты (client.py:1940-1969):

- `master` / `masters`
- `indie_master` / `indie-masters` / `indieMasters`
- `salon` / `salons`
- `service` / `services`

---

### 1.4. Логика DELETE

```python
# backend/routers/client.py:1926-1968
@profile_router.delete("/favorites/{favorite_type}/{item_id}", response_model=dict)
def remove_from_favorites(
    favorite_type: str,
    item_id: int,
    ...
):
    # Поиск по client_id + favorite_type (в БД) + item_id (в соответствующем поле)
    if favorite_type == 'master' or favorite_type == 'masters':
        favorite = db.query(ClientFavorite).filter(
            ClientFavorite.client_id == current_user.id,
            ClientFavorite.favorite_type == 'master',
            ClientFavorite.master_id == item_id
        ).first()
    elif favorite_type == 'indie_master' or favorite_type == 'indie-masters' or favorite_type == 'indieMasters':
        favorite = db.query(ClientFavorite).filter(
            ClientFavorite.client_id == current_user.id,
            ClientFavorite.favorite_type == 'indie_master',
            ClientFavorite.indie_master_id == item_id
        ).first()
    # ...
```

**item_id:**
- master: `master_id`
- indie_master: `indie_master_id`

---

## 2. MOBILE: фактический HTTP-трафик favorites

### 2.1. Реальные запросы

**Файл:** `mobile/src/services/api/favorites.ts`

**addToFavorites:**

```typescript
// favorites.ts:129-143
export async function addToFavorites(type: FavoriteType, itemId: number, itemName?: string): Promise<void> {
  const normalizedType = type === 'indie-master' || type === 'indie_master' ? 'indie_master' : type;
  const body: any = {
    favorite_type: normalizedType,
    favorite_name: itemName || 'Избранное',
  };

  if (normalizedType === 'salon') body.salon_id = itemId;
  else if (normalizedType === 'master') body.master_id = itemId;
  else if (normalizedType === 'indie_master') body.indie_master_id = itemId;
  else if (normalizedType === 'service') body.service_id = itemId;

  await apiClient.post('/api/client/favorites', body);
}
```

- **Метод:** POST  
- **URL:** `/api/client/favorites`  
- **Body:** `{ favorite_type, favorite_name, master_id? | indie_master_id? }`

**removeFromFavorites:**

```typescript
// favorites.ts:148-152
export async function removeFromFavorites(type: FavoriteType, itemId: number): Promise<void> {
  const apiType = type === 'indie-master' || type === 'indie_master' ? 'indie_master' : type;
  await apiClient.delete(`/api/client/favorites/${apiType}/${itemId}`);
}
```

- **Метод:** DELETE  
- **URL:** `/api/client/favorites/{favorite_type}/{item_id}` — `favorite_type` = `master` или `indie_master`

**LIST (hydrate):** `hydrateFavorites` в store вызывает:
- `GET /api/client/favorites/masters`
- `GET /api/client/favorites/indie-masters`

---

### 2.2. Axios/ApiClient интерсепторы

**Файл:** `mobile/src/services/api/client.ts`

**Строки 136-138:**
```typescript
const isSilent404 = status === 404 && (
  silent404Endpoints.some(endpoint => url.includes(endpoint)) ||
  (url.includes('/api/client/favorites/') && (originalRequest?.method || '').toLowerCase() === 'delete')
);
```

- 404 для DELETE `/api/client/favorites/` обрабатывается как «тихий» (не логируется как ERROR).
- 405 и другие ошибки логируются через `console.error('API Error:', { status, message, url })`.
- При ошибке всегда возвращается `Promise.reject(error)`.

---

### 2.3. Zustand store

**Файл:** `mobile/src/stores/favoritesStore.ts`

**Состояние:**
- `favoriteKeys: Set<string>` — ключи вида `"master:12"`, `"indie_master:5"`
- `favorites: any[]` — массив объектов из favorites API

**hydrateFavorites (строки 40-86):**
```typescript
// GET /api/client/favorites/masters → маппинг type: 'master'
// GET /api/client/favorites/indie-masters → маппинг type: 'indie_master'
// Собирает favorites, строит favoriteKeys через getFavoriteKeyStringFromFavorite(fav)
```

**toggleFavoriteByDisplayKey (строки 137-180):**
- При add: вызывает `toggleFavorite(addContext.type, addContext.id, addContext.name)`.
- При remove: `findFavoriteForDisplayKey(displayKey)` → `matched` → берёт `favType` и `favId` из `matched` → `removeFromFavorites(favType, favId)`.

**findFavoriteForDisplayKey (строки 87-94):**
```typescript
const key = displayKey.toLowerCase()
return favorites.find(fav => {
  const favKey = getCanonicalDisplayKeyFromFavorite(fav)
  return favKey && favKey.toLowerCase() === key
}) ?? null
```

**Поля при remove:**
- `favType = matched.type === 'indie_master' ? 'indie_master' : 'master'`
- `favId = matched.indie_master_id` или `matched.master_id`

---

## 3. displayKey: риск рассинхрона и склейки

### 3.1. Реализация

**Файл:** `mobile/src/utils/clientDashboard.ts`

**getCanonicalDisplayKeyFromBooking (строки 172-183):**
```typescript
export function getCanonicalDisplayKeyFromBooking(booking: any): string {
  const domain = booking.master_domain || booking.master?.domain || booking.indie_master?.domain
  if (domain) return `domain:${normalizeForDisplayKey(domain)}`

  const name = booking.master_name || booking.master?.user?.full_name || booking.indie_master?.user?.full_name
  if (name) return `name:${normalizeForDisplayKey(name)}`

  const typeAndId = getBookingTypeAndId(booking)
  if (typeAndId) return getFavoriteKey(typeAndId.type, typeAndId.id)

  return `unknown:${booking.id ?? 0}`
}
```

**getCanonicalDisplayKeyFromFavorite (строки 188-200):**
```typescript
export function getCanonicalDisplayKeyFromFavorite(fav: any): string {
  const domain = fav.master?.domain ?? fav.indie_master?.domain
  if (domain) return `domain:${normalizeForDisplayKey(domain)}`

  const name = fav.favorite_name || fav.master?.user?.full_name || fav.indie_master?.user?.full_name
  if (name) return `name:${normalizeForDisplayKey(name)}`

  const type = fav.type === 'indie_master' ? 'indie_master' : 'master'
  const id = type === 'indie_master' ? fav.indie_master_id : fav.master_id
  const numId = Number(id)
  if (!isNaN(numId) && numId !== 0) return getFavoriteKey(type as FavoriteType, numId)

  return `unknown:${fav.client_favorite_id ?? 0}`
}
```

**Приоритеты:**
1. `domain:` — нормализованный domain
2. `name:` — нормализованное имя (lowercase, trim, collapse spaces)
3. `master:id` или `indie_master:id`
4. `unknown:{id}`

**normalizeForDisplayKey:** `(s || '').toLowerCase().trim().replace(/\s+/g, ' ')`

---

### 3.2. Места использования

| Файл | Функция | Использование |
|------|---------|---------------|
| `mobile/app/client/dashboard.tsx` | `getCanonicalDisplayKeyFromBooking` | для futureBookings, pastBookings |
| `mobile/app/client/dashboard.tsx` | `getCanonicalDisplayKeyFromFavorite` | для FavoriteCard |
| `mobile/app/client/bookings-future.tsx` | `getCanonicalDisplayKeyFromBooking` | для каждой строки |
| `mobile/app/client/bookings-past.tsx` | `getCanonicalDisplayKeyFromBooking` | для каждой строки |
| `mobile/src/stores/favoritesStore.ts` | `getCanonicalDisplayKeyFromFavorite` | в `findFavoriteForDisplayKey` |

---

### 3.3. Риски

**1. Один мастер в bookings (master_id) и в favorites (indie_master_id):**

- Разные `type:id` → `master:1` vs `indie_master:1` — разные ключи.
- Если есть общий domain: `domain:xxx` → одинаковый displayKey.
- Если domain нет: booking — `master:1`, favorite — `indie_master:1` → разные ключи, возможен рассинхрон.

**2. Склейка по `name:`:**

- Разные мастера с одинаковым `full_name` (например, «Иван Иванов») получат один `name:иван иванов`.
- Риск: склейка разных мастеров.

**3. Разные источники имени:**

- Booking: `master_name` или `master.user.full_name`.
- Favorite: `favorite_name` или `master.user.full_name`.
- Нормализация может дать разные результаты при разных пробелах/регистре.

---

## 4. Runtime DEBUG (временный)

**Файл:** `mobile/src/stores/favoritesStore.ts`

**Флаг:** `const DEBUG_FAVORITES = true;` (строка 8)

**Логи:**

1. **Перед ADD (toggleFavorite):**
   ```typescript
   console.log('[FAV DEBUG] ADD:', { displayKey: key, type, id: itemId, name: itemName, body, url: 'POST /api/client/favorites' })
   ```

2. **Перед REMOVE (toggleFavorite):**
   ```typescript
   console.log('[FAV DEBUG] REMOVE (toggleFavorite):', { displayKey: key, matchedFavorite: { type, id: itemId }, url: `DELETE /api/client/favorites/${type}/${itemId}` })
   ```

3. **Перед REMOVE (toggleFavoriteByDisplayKey):**
   ```typescript
   console.log('[FAV DEBUG] REMOVE (toggleByDisplayKey):', { displayKey, matchedFavorite: { type: favType, id: favId }, url: `DELETE /api/client/favorites/${favType}/${favId}` })
   ```

4. **После hydrate:**
   ```typescript
   console.log('[FAV DEBUG] hydrate:', { favoritesCount: allFavorites.length, first3: [...] })
   ```

Логи обёрнуты в `if (DEBUG_FAVORITES)`. Для отключения: `DEBUG_FAVORITES = false`.

---

## 5. Итоговый отчёт: корректность фикса

### 5.1. Совпадение backend ↔ mobile

| Аспект | Backend | Mobile | Совпадение |
|--------|---------|--------|------------|
| ADD URL | `POST /api/client/favorites` | `POST /api/client/favorites` | ✅ |
| ADD метод | POST | POST | ✅ |
| ADD body | `favorite_type`, `favorite_name`, `master_id`/`indie_master_id` | `favorite_type`, `favorite_name`, `master_id`/`indie_master_id` | ✅ |
| REMOVE URL | `DELETE /api/client/favorites/{favorite_type}/{item_id}` | `DELETE /api/client/favorites/${apiType}/${itemId}` | ✅ |
| REMOVE метод | DELETE | DELETE | ✅ |
| favorite_type | `master`, `indie_master` | `master`, `indie_master` | ✅ |
| item_id для master | `master_id` | `master_id` | ✅ |
| item_id для indie_master | `indie_master_id` | `indie_master_id` | ✅ |
| LIST masters | `GET /api/client/favorites/masters` | `GET /api/client/favorites/masters` | ✅ |
| LIST indie-masters | `GET /api/client/favorites/indie-masters` | `GET /api/client/favorites/indie-masters` | ✅ |

### 5.2. Выводы

- Контракт backend ↔ mobile по URL, методам и структуре body совпадает.
- Фикс 405 корректен: mobile использует POST с body вместо POST с id в пути.

### 5.3. «Красные флаги» по displayKey

1. **Склейка по `name:`:** разные мастера с одинаковым именем могут склеиваться.
2. **Рассинхрон master vs indie_master:** без domain один и тот же человек может быть `master:1` и `indie_master:1` — разные displayKey.
3. **Backend:** в GET `/favorites/masters` и `/favorites/indie-masters` есть `master.domain` и `indie_master.domain`; в bookings — `master_domain`. Если эти поля заполнены, `domain:` даёт стабильный ключ.

### 5.4. Несоответствия (только факты)

- Нет: URL, методы, body, favorite_type, id соответствуют backend.
- Есть: риски displayKey (см. п. 5.3).

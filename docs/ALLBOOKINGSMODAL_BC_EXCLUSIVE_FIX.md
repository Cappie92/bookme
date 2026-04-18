# AllBookingsModal — блоки B и C взаимоисключающие

## Проблема
Одна и та же прошедшая запись попадала одновременно в блок B «Прошедшие — требуют подтверждения» и блок C «Прошедшие — подтверждённые/отклонённые».

## Решение

### 1. `frontend/src/utils/bookingOutcome.js`
- Добавлен экспорт `isNeedsConfirmation` = `needsOutcome` — единый предикат для блока B.
- Комментарий к `needsOutcome`: «Предикат для блока B».

### 2. `frontend/src/components/AllBookingsModal.jsx`

**Фрагмент useMemo (строки ~286–320):**

1. Первый проход: собираем `pending` (блок B) и `future` (блок A) через `getBookingTab`.
2. `pendingKeys = new Set(p.map(getBookingKey))` — множество ключей записей блока B.
3. Второй проход: собираем `past` (блок C) — в `past` попадают только записи с `tab === 'past'` **и** `!pendingKeys.has(getBookingKey(b))`.
4. Dev-only: если пересечение B ∩ C не пустое → `console.warn('[AllBookingsModal] overlap between B and C', ids)`.

**Ключ:** `getBookingKey(b)` = `${id}-${start_time}-${client_id|client_phone}` (тот же, что React key).

## Логика
- Блок B: `getBookingTab === 'pending'` ⇔ `needsOutcome(booking, master, now)`.
- Блок C: `getBookingTab === 'past'` **и** запись не входит в B (явная фильтрация).

## QA-чеклист
- [ ] Запись из блока B не отображается в блоке C.
- [ ] created/confirmed/awaiting_confirmation в прошлом — только в B.
- [ ] completed/cancelled — только в C.
- [ ] В консоли нет overlap warning.
- [ ] Нет React warning про duplicate keys.

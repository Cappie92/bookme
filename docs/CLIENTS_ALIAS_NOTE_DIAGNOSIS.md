# Диагностика: alias/note и отображение имён

## 1. Единственный источник истины

**Модель:** `MasterClientMetadata` (таблица `master_client_metadata`)

| Поле | Тип | Описание |
|------|-----|----------|
| master_id | int | FK masters.id (салонный мастер) |
| client_phone | str | Телефон клиента (ключ вместе с master_id) |
| alias_name | str? | Отображаемое имя (alias), max 255 |
| note | str? | Заметка мастера о клиенте, max 280 |

**Обновление:** PATCH `/api/master/clients/{client_key}` → `update_client_metadata()` → `meta.alias_name = ...`, `meta.note = ...` → `db.commit()`.

## 2. PATCH /api/master/clients/{client_key}

- **Принимает:** `MasterClientMetadataUpdate` → `alias_name: Optional[str]`, `note: Optional[str]`
- **Пишет в БД:** `meta.alias_name`, `meta.note` (через `body.alias_name.strip() or None`, `body.note.strip() or None`)
- **Риск:** `body.alias_name.strip()` падает, если `body.alias_name` есть но не str; при `None` блок `if body.alias_name is not None` не выполняется — OK
- **Возвращает:** `{"alias_name": ..., "note": ...}` — нет `has_note`

## 3. Frontend MasterClients

- **Payload:** `{ alias_name: editAlias.trim() || null, note: editNote.slice(0, 280).trim() || null }`
- **Потенциальная потеря note:** при `editNote = ""` → `null`; при вводе "текст" → "текст". OK
- **Проблема:** если PATCH 404 (indie-only мастер без Master) или client_phone не совпадает — note не сохранится

## 4. Booking endpoints для WEB

| Endpoint | client_name | client_phone | has_client_note | client_note |
|----------|-------------|--------------|-----------------|-------------|
| /api/master/stats (next_bookings_list) | ✓ get_client_display_name | ✗ нет | ✓ | ✓ |
| /api/master/bookings/future | ✓ | ✓ | ✓ | ✓ |
| /api/master/bookings/detailed | ✓ | ✓ | ✓ | ✓ |
| /api/master/past-appointments | ✓ | ✓ | ✓ | ✓ |

**Вывод:** `client_phone` уже добавлен в future/past. Stats использует inline-логику, не get_client_display_name. Meta_map ищется по `client_phone` — при несовпадении формата (напр. +7 vs 7) meta не находится, alias не подставляется.

## Почему note не сохраняется

1. **Несовпадение client_phone:** metadata ищется по `client_phone`. Если при PATCH и при выборке booking используется разный формат телефона (User.phone vs нормализованный), запись создаётся с одним ключом, а читается по другому.
2. **Indie-only мастер:** `_get_master()` возвращает Master (салон). У indie-only мастера Master может отсутствовать → 404 на PATCH.
3. **Ошибка на фронте:** PATCH может не доходить (CORS, неверный URL, 401).

## Почему alias не попадает на дашборд/в модалку

1. **client_phone не совпадает:** meta_map строится по `m.client_phone`, поиск — по `client.phone`. Разный формат → meta не находится.
2. **Stats не использует get_client_display_name:** используется свой inline-код, но логика та же (alias → full_name → phone).
3. **Фронт показывает client_name:** если бэкенд отдаёт "Клиент" или phone, фронт это и показывает. Нужно гарантировать единый display_name и нормализацию phone.

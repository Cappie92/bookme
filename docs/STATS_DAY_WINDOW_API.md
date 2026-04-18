# Day window mode — API статистики мастера

## Endpoint

`GET /api/master/dashboard/stats`

## Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| period | str | week | day, week, month, quarter, year |
| offset | int | 0 | Смещение для навигации (для week/month и т.д.) |
| anchor_date | str | — | YYYY-MM-DD, якорная дата для day |
| window_before | int | — | 0..31, дней до anchor (для day) |
| window_after | int | — | 0..31, дней после anchor (для day) |

## Day window mode

При `period=day` и наличии `window_before` или `window_after`:

- `anchor_date` — якорная дата (по умолчанию сегодня)
- `window_before` — дней до anchor (по умолчанию 9)
- `window_after` — дней после anchor (по умолчанию 9)
- Диапазон: `[anchor_date - window_before, anchor_date + window_after]`
- Количество точек: `window_before + 1 + window_after` (по умолчанию 19)

## Пример запроса

```http
GET /api/master/dashboard/stats?period=day&anchor_date=2026-01-15&window_before=9&window_after=9
Authorization: Bearer <token>
```

## Пример ответа (day window)

```json
{
  "weeks_data": [
    {
      "period_label": "06-01",
      "period_start": "2026-01-06",
      "period_end": "2026-01-06",
      "bookings": 0,
      "income": 0,
      "is_current": false,
      "is_past": true,
      "is_future": false
    },
    ...
  ],
  "anchor_date": "2026-01-15",
  "range_start": "2026-01-06",
  "range_end": "2026-01-24",
  "selected_index": 9,
  "period": "day",
  ...
}
```

## Backward compatibility

Без `window_before`/`window_after` для `period=day` используется прежняя логика (5 точек: -2..+2 дня).

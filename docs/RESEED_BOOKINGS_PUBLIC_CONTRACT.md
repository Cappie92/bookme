# Контракт POST /api/bookings/public и reseed

## 1. Сигнатура endpoint

**Файл:** `backend/routers/bookings.py`

```python
@router.post("/public")
async def create_booking_public(
    booking: BookingCreate,   # body (Pydantic)
    client_phone: str,        # Query param (по умолчанию для str без Body)
    db: Session = Depends(get_db),
):
```

- **client_phone:** передаётся как **query-параметр** (FastAPI по умолчанию трактует простые типы без Body как query).
- **booking:** передаётся в **теле запроса** как JSON (Pydantic model).

**Обёртки нет** — body = плоский объект с полями BookingCreate. Не `{"booking": {...}, "client_phone": "..."}`.

## 2. Схема BookingCreate

**Файл:** `backend/schemas.py`

```python
class BookingBase(BaseModel):
    service_id: int
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: BookingStatus = BookingStatus.CREATED
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    payment_amount: Optional[float] = None

class BookingCreate(BookingBase):
    client_name: str
    service_name: str
    service_duration: int
    service_price: float
    use_loyalty_points: Optional[bool] = False
```

## 3. Корректный вызов из reseed

```python
client.post(
    f"{base}/api/bookings/public",
    params={"client_phone": cphone},
    json={
        "master_id": mid,
        "service_id": sid,
        "start_time": st.isoformat(),
        "end_time": et.isoformat(),
        "client_name": f"Клиент {cphone}",
        "service_name": svc["name"],
        "service_duration": duration,
        "service_price": svc["price"],
    },
)
```

## 4. available-slots-repeat: формат start_time/end_time

Слоты возвращаются как datetime в ISO (`"2026-01-29T10:00:00"`). Pydantic принимает ISO-строки для `datetime`. Конвертация `st.isoformat()` / `et.isoformat()` подходит.

## 5. scheduling.py — правка Date vs datetime

В `get_available_slots` для MasterSchedule используется:
```python
_date = date.date() if isinstance(date, datetime) else date
MasterSchedule.date == _date
```
`MasterSchedule.date` — `Column(Date)`, параметр `date` — `datetime`. Сравнение `Date == datetime` может давать неверный результат. Исправление оставлено.

## 6. Примеры успешных запросов

**Запрос:**
```
POST /api/bookings/public?client_phone=%2B79990000100
Content-Type: application/json

{
  "master_id": 2,
  "service_id": 5,
  "start_time": "2026-01-29T10:00:00",
  "end_time": "2026-01-29T11:00:00",
  "client_name": "Клиент +79990000100",
  "service_name": "Стрижка женская",
  "service_duration": 60,
  "service_price": 1500.0
}
```

**Успешный ответ (200):**
```json
{
  "booking": { ... },
  "access_token": "...",
  "is_new_client": true,
  "needs_password_setup": true,
  "needs_phone_verification": true,
  "client": { ... }
}
```

## 7. Что изменено в reseed_local_test_data.py

1. **Логирование при ошибке:** при `HTTPStatusError` и других исключениях логируются `status_code`, первые 300 символов `response.text`, payload (с маскировкой phone) и идентификаторы master/day.
2. Контракт (params для client_phone, json для booking) уже был верным.

## 8. Smoke checklist

- [ ] reseed проходит без ошибок
- [ ] Все мастера имеют bookings_created > 0
- [ ] При ошибке в логах видно status, body и payload

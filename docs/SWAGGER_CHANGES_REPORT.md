# Отчёт: точечные изменения Swagger/OpenAPI (по shortlist)

**Основа:** docs/SWAGGER_ACTIONABLE_SHORTLIST.md  
**Ограничения:** без изменения бизнес-логики и фактического поведения API.

---

## 1. Список изменённых файлов

| Файл | Что изменено | Зачем | Риск побочного эффекта |
|------|---------------|-------|-------------------------|
| `backend/main.py` | Добавлен `OPENAPI_TAGS` и `openapi_tags=OPENAPI_TAGS` в FastAPI() | Группировка операций в /docs по тегам с описаниями | Нет — только метаданные OpenAPI |
| `backend/schemas.py` | Добавлены HTTPErrorDetail, MessageOut, PublicBookingCreateOut, AvailableSlotOut, DomainSubdomainInfoOut | Типизированные ответы для Swagger и контрактов | Нет — только новые классы, существующие не трогались |
| `backend/routers/public_master.py` | response_model, summary, responses для GET profile/availability, POST bookings; схемы ClientNoteOut, EligibilityOut; возврат PublicBookingCreateOut, ClientNoteOut, EligibilityOut | Явный контракт публичной записи и смежных эндпоинтов | Низкий — форма ответа та же (id/status, note_text, eligibility поля); только типизация |
| `backend/routers/bookings.py` | response_model=List[AvailableSlotOut] для available-slots, available-slots-repeat, available-slots-any-master; summary, responses; 401 на роутере | Слоты в Swagger с полями start_time/end_time | Нет — сервис по-прежнему возвращает list of dict с теми же ключами |
| `backend/routers/auth.py` | responses и summary для login, register, refresh, users/me; response_model=MessageOut для change-password, set-password, verify-password; возврат MessageOut вместо dict | Ошибки и ответы auth видны в Swagger | Нет — тело ответов то же |
| `backend/routers/domain.py` | response_model=DomainSubdomainInfoOut для GET /{subdomain}/info; summary; responses 404 на роутере | Контракт поддомена в OpenAPI | Низкий — схема с extra="allow", все три варианта ответа проходят |
| `backend/routers/master.py` | responses={401} на уровне APIRouter | В Swagger видно, что нужна авторизация | Нет |
| `backend/routers/payments.py` | responses={401} на роутере; summary и responses для POST /subscription/init | Документация платежей | Нет |
| `backend/routers/subscriptions.py` | responses={401} на роутере; summary и responses для GET /my | Документация подписок | Нет |

---

## 2. Ключевые фрагменты (диффы)

### main.py
```python
OPENAPI_TAGS = [
    {"name": "auth", "description": "Авторизация, регистрация, токены"},
    {"name": "bookings", "description": "Бронирования (список, создание, слоты)"},
    # ... остальные теги
]
app = FastAPI(..., openapi_tags=OPENAPI_TAGS)
```

### schemas.py
```python
class HTTPErrorDetail(BaseModel):
    detail: str

class MessageOut(BaseModel):
    message: str

class PublicBookingCreateOut(BaseModel):
    id: int
    status: str

class AvailableSlotOut(BaseModel):
    start_time: datetime
    end_time: datetime

class DomainSubdomainInfoOut(BaseModel):
    owner_type: str
    owner_id: int
    name: Optional[str] = None
    # ... остальные опциональные поля
    class Config:
        extra = "allow"
```

### public_master.py — POST booking
```python
@router.post(
    "/{slug}/bookings",
    response_model=PublicBookingCreateOut,
    summary="Создать бронирование с публичной страницы",
    responses={400: ..., 403: ..., 404: ..., 422: ...},
)
def create_public_booking(...):
    ...
    return PublicBookingCreateOut(id=booking.id, status=status_val)
```

### bookings.py — слоты
```python
@router.get(
    "/available-slots",
    response_model=List[AvailableSlotOut],
    summary="Доступные слоты для бронирования",
    responses={401: {...}, 422: {...}},
)
async def get_available_slots_endpoint(...):
    return get_available_slots(...)  # список dict с start_time, end_time — валидируется в AvailableSlotOut
```

### auth.py — пример
```python
@router.post(
    "/change-password",
    response_model=MessageOut,
    summary="Изменение пароля",
    responses={400: {...}, 401: {...}},
)
def change_password(...):
    return MessageOut(message="Пароль успешно изменен")
```

---

## 3. Что удалось улучшить

- **openapi_tags:** В /docs все операции сгруппированы по 23 тегам с описаниями.
- **Публичная запись:** POST /api/public/masters/{slug}/bookings — явный response_model PublicBookingCreateOut, summary и responses 400/403/404/422.
- **Слоты:** GET available-slots, available-slots-repeat, available-slots-any-master — response_model=List[AvailableSlotOut], в Swagger видна структура слота (start_time, end_time).
- **Auth:** login, register, refresh, users/me — добавлены responses; change-password, set-password, verify-password — response_model=MessageOut и responses.
- **Domain:** GET /api/domain/{subdomain}/info — response_model=DomainSubdomainInfoOut, summary, 404 на роутере.
- **public_master:** GET profile, GET availability, GET client-note, GET eligibility — summary и при необходимости response_model (ClientNoteOut, EligibilityOut).
- **Роутеры bookings, master, payments, subscriptions:** общий responses={401} на уровне APIRouter; у ключевых эндпоинтов payments/subscriptions — summary и responses.

---

## 4. Что осталось нерешённым

- Много эндпоинтов в admin, master, salon, loyalty, client без response_model или с возвратом dict — оставлены без изменений в этом проходе (P2/shortlist).
- Эндпоинты payments: POST robokassa/result, POST {id}/activate-subscription — без response_model (редирект или сложный ответ); не типизированы.
- master: GET /settings, GET /dashboard/stats, GET /bookings/detailed и др. — без response_model; не трогались.
- Явная схема для 4xx/5xx (HTTPErrorDetail) добавлена в schemas, но в `responses={}` везде использованы только описания (description), без `model=HTTPErrorDetail` — чтобы не менять формат ответов FastAPI.

---

## 5. Где сознательно не меняли код

- **Логика возврата слотов:** `get_available_slots` и `get_available_slots_any_master_logic` по-прежнему возвращают list of dict; только в роутере указан `response_model=List[AvailableSlotOut]` — FastAPI валидирует и сериализует. Менять сервисы не стали.
- **Domain:** Три ветки (salon, indie_master, master) по-прежнему возвращают dict; к роутеру добавлен только `response_model=DomainSubdomainInfoOut` с `extra="allow"`, чтобы не ломать разные наборы полей.
- **Exception handling:** Глобальный обработчик SchemaOutdatedError и стандартные HTTPException не трогали — не вводили общий error schema в ответы.
- **Роутеры dev_testdata, dev_e2e, blog, moderator, accounting, tax_rates, client_loyalty и др.:** dict-ответы и отсутствие response_model оставлены без изменений, чтобы ограничить объём правок и риск.

---

## 6. Runbook проверки после изменений

### Как поднять backend
```bash
cd backend
# Минимальный env (или скопировать .env.example в .env)
export JWT_SECRET_KEY=your-secret
export DATABASE_URL=sqlite:///./bookme.db
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Что открыть в Swagger
- Браузер: **http://localhost:8000/docs**
- Убедиться, что сверху отображаются группы по тегам (auth, bookings, public_master, master, payments, subscriptions, domain и т.д.).

### 5–10 эндпоинтов для первой ручной проверки
1. **GET /api/public/masters/{slug}** — без auth; подставить реальный slug; проверить 200 и тело с master_id, services и т.д.
2. **GET /api/public/masters/{slug}/availability** — без auth; проверить 200 и массив slots с start_time, end_time.
3. **POST /api/public/masters/{slug}/bookings** — с Bearer (клиент); body: service_id, start_time, end_time; проверить 200 и ответ с полями id, status.
4. **GET /api/bookings/available-slots** — с Bearer; query: owner_type, owner_id, date, service_duration; проверить 200 и массив объектов с start_time, end_time.
5. **POST /api/auth/login** — body: phone, password; проверить 200 и Token (access_token, refresh_token, token_type).
6. **GET /api/auth/users/me** — с Bearer; проверить 200 и объект пользователя.
7. **POST /api/auth/change-password** — с Bearer; body: old_password, new_password; проверить 200 и объект с полем message.
8. **GET /api/domain/{subdomain}/info** — без auth; подставить реальный subdomain; проверить 200 и объект с owner_type, owner_id и др.
9. **GET /api/subscriptions/my** — с Bearer (мастер/салон); проверить 200 или 404.
10. **POST /api/payments/subscription/init** — с Bearer; body: plan_id, duration_months и т.д.; проверить 200 (payment_url или requires_payment=false) или 400/404.

Ожидаемые статусы: 200 для успеха; 401 без токена где нужна авторизация; 404 где ресурс не найден; 422 при невалидном теле/параметрах.

# Аудит формата телефона (backend + web + mobile)

## 1. Сводка ограничений по слоям

| Слой | Ожидаемый формат | Нормализация | Источник |
|------|------------------|--------------|----------|
| **Backend Pydantic** | `^\+?1?\d{9,15}$` (9–15 цифр) | Нет | schemas.py |
| **Backend zvonok** | `+7` + ровно 10 цифр, len=12 | Да → `+7XXXXXXXXXX` | zvonok_service.py |
| **Frontend Auth/Login** | `^\+7\d{10}$` | formatPhone → `+7` + 10 цифр | AuthModal.jsx |
| **Mobile Login** | `^\+7\d{10}$` | formatPhone → `+7` + 10 цифр | login.tsx |
| **master_clients** | Поиск: digits-only или exact | _normalize_phone → digits only | master_clients.py |
| **DB users.phone** | String, unique, без length | Как передано | models.py |

---

## 2. Детали по каждому месту

### 2.1 Backend — Pydantic (регистрация, логин, верификация)

**Файл:** `backend/schemas.py`

| Схема | Строка | Pattern | Примеры |
|-------|--------|---------|---------|
| UserBase.phone | 16 | `^\+?1?\d{9,15}$` | `+79991234567`, `79991234567`, `89991234567` (9–15 цифр) |
| UserCreate.phone | 23 | `^\+?1?\d{9,15}$` | То же |
| PhoneVerificationRequest.phone | 1449 | `^\+?1?\d{9,15}$` | То же |
| VerifyPhoneRequest.phone | 1460 | `^\+?1?\d{9,15}$` | То же |
| client_phone (разные схемы) | 1547, 1559, 1744 | `^\+?1?\d{9,15}$` | То же |

**Интерпретация:** optional `+`, optional `1`, затем 9–15 цифр. В БД сохраняется то, что пришло, без нормализации.

---

### 2.2 Backend — zvonok_service (телефон для звонков)

**Файл:** `backend/services/zvonok_service.py`, строки 270–289

```python
def _clean_phone_number(self, phone: str) -> Optional[str]:
    clean = ''.join(c for c in phone if c.isdigit() or c == '+')
    if clean.startswith('8') and len(clean) == 11:
        clean = '+7' + clean[1:]
    if clean.startswith('7') and len(clean) == 11:
        clean = '+' + clean
    if clean.startswith('+7') and len(clean) == 12:
        return clean
    return None
```

**Формат:** строго `+7` + 10 цифр, длина 12. Если номер не подходит — возвращается `None` (звонок не уходит).

---

### 2.3 Backend — master_clients._normalize_phone

**Файл:** `backend/routers/master_clients.py`, строки 36–39

```python
def _normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))
```

**Формат:** только цифры (без `+`). Используется для поиска `User.phone == phone`. Если в БД `+79991234567`, а в запросе `79991234567`, точного совпадения не будет.

---

### 2.4 Backend — Auth (регистрация / логин)

**Файл:** `backend/routers/auth.py`

- Регистрация: `User(phone=user_in.phone)` — без нормализации (строки 78, 607).
- Логин: `User.phone == login_data.phone` — точное совпадение (строка 200).

В БД сохраняется значение, прошедшее Pydantic.

---

### 2.5 Backend — БД

**Файл:** `backend/models.py`, строка 52

```python
phone = Column(String, unique=True)
```

**Тип:** `String`, без ограничения длины и без CHECK.

---

### 2.6 Frontend — AuthModal (логин, регистрация)

**Файл:** `frontend/src/modals/AuthModal.jsx`

| Элемент | Строки | Логика |
|---------|--------|--------|
| validatePhone | 42–44 | `/^\+7\d{10}$/` — ровно `+7` и 10 цифр |
| formatPhone | 45–51 | Оставляет цифры, 8→7, обрезает до 10, добавляет `+7` |
| placeholder | 52–54 | `+7 (999) 999 99 99` |
| Исходное значение | 82, 86 | `phone: '+7'` |

**Отправка:** `+7XXXXXXXXXX` (12 символов).

---

### 2.7 Frontend — MasterBookingModule, BranchBookingModule, SalonMasters

**Файлы:** `MasterBookingModule.jsx`, `BranchBookingModule.jsx`, `SalonMasters.jsx`

- validatePhone: `/^\+7\d{10}$/`
- formatPhone: аналогично AuthModal (цифры → `+7` + 10 цифр).

---

### 2.8 Mobile — login.tsx

**Файл:** `mobile/app/login.tsx`, строки 48–53, 76–81, 144–149

- validatePhone: `/^\+7\d{10}$/`
- formatPhone: цифры, `7` в начале убирается, до 10 цифр, добавляется `+7`.

---

### 2.9 Mobile — client-restrictions.tsx

**Файл:** `mobile/app/master/client-restrictions.tsx`, строки 122–128

```ts
const phone = restrictionForm.client_phone.replace(/\D/g, '');
if (phone.length < 10) { ... }
client_phone: phone.startsWith('7') ? `+${phone}` : `+7${phone}`,
```

Нормализация: digits-only, затем `+7` или `+` перед числом. Риск: при 9 цифрах получается `+7999700000` — не проходит `/^\+7\d{10}$/` в других местах.

---

### 2.10 Mobile — EditProfileModal

**Файл:** `mobile/src/components/modals/EditProfileModal.tsx`, строка 85

```ts
/^\+?[1-9]\d{9,14}$/.test(form.phone.replace(/\s/g, ''))
```

Более мягкая проверка (9–15 цифр, с опциональным `+`).

---

## 3. Канонический формат

На основе кода:

**Канонический формат:** `+7` + 10 цифр = **12 символов**, например `+79991234567`.

**Обоснование:**

1. `zvonok_service._clean_phone_number` принимает только `len(clean) == 12` и `startswith('+7')`.
2. Web и mobile login/registration жёстко требуют `/^\+7\d{10}$/`.
3. В web и mobile formatPhone приводит к `+7` + 10 цифр.
4. Pydantic допускает более широкий формат, но для consistency и верификации нужен именно он.

---

## 4. Хранение в БД

- Сохраняется как есть (без принудительной нормализации).
- Рекомендуется единообразно хранить в формате `+7XXXXXXXXXX`, чтобы:
  - совпадать с web/mobile;
  - работать с zvonok;
  - избежать проблем с `_normalize_phone` (digits-only) при поиске.

---

## 5. Рекомендация для reseed

Генерировать номера **строго** в формате `+7` + 10 цифр:

- Шаблон: `+7` + `{10 цифр}`.
- Примеры: `+79991234567`, `+79990000001`, `+79991000000`.

---

## 6. Фикс reseed (актуально)

**Проблема 1 (раньше):** слишком короткий номер (9 цифр после `+7`).

**Проблема 2 (10 мастеров):** шаблон `+7999{1+master_idx}000{client_idx:03d}` при `master_idx=9` подставлял `1+9=10` (две цифры) → **11 цифр** после `+7` (неканонично).

**Исправление:** без `1+master_idx` (иначе при master 9 — двузначное «10»). После `+7` должно быть ровно 10 цифр; литерал `+7999` даёт только **три** девятки после кода страны, поэтому клиентская часть — **6** цифр (`:06d`), не 5:
```python
return f"+7999{master_idx}{client_idx:06d}"  # 3+1+6=10 цифр после +7
```

**Места генерации телефонов в reseed:**
- `ADMIN_PHONE` — константа (уже каноническая)
- `MASTER_PHONES` — `f"+7999000000{i}"` для i in 0..9 ✓
- `CLIENT_PHONES_LEGACY` — константы ✓
- `client_phone_for_master(mi, ci)` — см. шаблон выше ✓

**Sanity-check:** В конце reseed вызывается `is_canonical_phone()` из `utils.phone` для всех сгенерированных номеров.

---

## 7. Чеклист ручной проверки

### 7.1 Регистрация

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79991234567","password":"test123","role":"client","full_name":"Test"}'
```

Ожидается: 200, пользователь создан. В БД: `phone = '+79991234567'`.

### 7.2 Логин

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79991234567","password":"test123"}'
```

Ожидается: 200, `access_token` в ответе.

### 7.3 SQL

```sql
-- Все телефоны users в каноническом формате (12 символов, +7 + 10 цифр)
SELECT id, phone, length(phone) as len 
FROM users 
WHERE length(phone) != 12 OR phone NOT LIKE '+7%';

-- Должно быть 0 строк.
```

```sql
-- Проверка формата (regex для SQLite упрощён)
SELECT phone FROM users WHERE phone NOT GLOB '+7[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';
```

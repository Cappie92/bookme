# End-to-End Ready Report

## Выполнено

### Phase 1: Stub-режимы и критические фиксы

| Задача | Статус | Файлы |
|--------|--------|-------|
| Zvonok: убран api_key из `/zvonok/balance` | ✅ | `backend/routers/auth.py` |
| Zvonok: `ZVONOK_MODE=stub` | ✅ | `backend/services/zvonok_service.py` |
| Robokassa: `ROBOKASSA_MODE=stub` | ✅ | `backend/routers/payments.py`, `utils/robokassa.py` |
| Plusofon: `PLUSOFON_MODE=stub` | ✅ | `backend/services/plusofon_service.py` |

### Stub-режимы

- **ZVONOK_MODE=stub:** `send_verification_call` возвращает `call_id=stub-call-0001`, `verify_phone_digits` принимает `digits=1234`.
- **ROBOKASSA_MODE=stub:** `init` возвращает `payment_url` на `/api/payments/robokassa/stub-complete?invoice_id=...`; GET по этому URL применяет оплату и редиректит на success.
- **PLUSOFON_MODE=stub:** `initiate_call` возвращает `call_id=stub-plusofon-0001` без реального звонка.

---

## ENV переменные

### Stub-режимы (только для dev/test)

```env
ZVONOK_MODE=stub
ROBOKASSA_MODE=stub
PLUSOFON_MODE=stub
API_BASE_URL=http://localhost:8000   # для Robokassa stub-complete
```

### Robokassa (production / тест без stub)

```env
ROBOKASSA_MERCHANT_LOGIN=...
ROBOKASSA_PASSWORD_1=...
ROBOKASSA_PASSWORD_2=...
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=https://...
ROBOKASSA_SUCCESS_URL=https://.../payment/success
ROBOKASSA_FAIL_URL=https://.../payment/failed
```

---

## Команды запуска

### Backend tests

```bash
cd backend
# Обычные тесты
python3 -m pytest tests/ -v

# С stub-режимами
ZVONOK_MODE=stub ROBOKASSA_MODE=stub python3 -m pytest tests/ -v
```


### Playwright E2E (web)

**Playwright реализован** — 8 сценариев в `frontend/e2e/`.

```bash
# Установка (один раз)
cd frontend && npm install && npx playwright install

# Запуск при уже работающих backend (8000) и frontend (5173)
cd frontend && npm run test:e2e

# Полный прогон: поднимает backend + frontend + seed + Playwright
./scripts/e2e_full.sh
```

**ENV для e2e_full.sh:**
- `DEV_E2E=true` — включает seed endpoint
- `ZVONOK_MODE=stub`, `ROBOKASSA_MODE=stub`, `PLUSOFON_MODE=stub`
- `E2E_DATABASE_PATH` (опционально) — путь к e2e.db
- `BACKEND_PORT` / `FRONTEND_PORT` (опционально) — порты; иначе скрипт сам выбирает свободные (5173/8000 или следующие)

**Сценарии 1–8:**
1. Master login → dashboard
2. Free plan: LockedNavItem → «Открыть демо» → демо без API
3. Settings: изменение и сохранение
4. Post-visit confirmations
5. Pre-visit: Free — нет кнопок; Master B — есть
6. Public page `/domain/e2e-master-a` без логина
7. Robokassa stub: покупка плана → success
8. Client: запись → «Мои записи» → отмена

---

## Чеклист ручной проверки (минимум)

1. **Auth + FormData 401:** Master Settings → изменить настройку → Сохранить (без 401).
2. **Post-visit confirmations:** Запись в прошлом → pending-confirmations → Confirm → COMPLETED.
3. **Manual confirm switch:** Включить «Подтверждать вручную» → старые pending автоподтверждены.
4. **Public page:** `/domain/{subdomain}` без логина → карта, CTA «Записаться».
5. **Robokassa stub:** `ROBOKASSA_MODE=stub` → купить план → редирект на success → подписка активна.
6. **Zvonok stub:** `ZVONOK_MODE=stub` → forgot-password по телефону → verify digits 1234.
7. **Client cabinet:** Клиент создал запись → видит в «Мои записи» → отмена.
8. **Free plan:** Платные разделы серые, демо без API-запросов.

---

## Документы

- `docs/E2E_STATUS_AUDIT.md` — аудит пунктов (3)–(6)
- `docs/E2E_PHASED_PLAN.md` — план фаз
- `docs/MASTER_SETTINGS_PAYMENT_SMOKE_CHECKLIST.md` — smoke-чеклист настроек

# Диагностика: balance=25₽, days_remaining=28 для +79990000007

## Итоговый вывод

**Причина рассинхрона: работающий backend использует СТАРУЮ версию кода** (формула `calendar_days` вместо `min(balance_days, calendar_days)`). Код в репозитории уже исправлен, но процесс не перезапущен или используется другая инстанция (Docker, прод-сервер).

---

## 1) Mobile: endpoint и ответ API

- **Endpoint**: `fetchCurrentSubscription()` → `GET /api/subscriptions/my`
- **Баланс**: `getBalance()` → `GET /api/balance/` (поле `available_balance`)
- **Mobile config**: `API_URL=http://localhost:8000` (mobile/.env)

Добавлен временный `console.log` в `mobile/src/services/api/subscriptions.ts` для вывода ответа в DEV. При следующем запросе в консоли будет:
```
📊 [SUBSCRIPTION /api/subscriptions/my] {"daily_rate":50,"days_remaining":28,"end_date":"2026-03-01T00:00:00",...}
```

---

## 2) Данные user +79990000007 в БД (backend/bookme.db)

| Таблица | Поле | Значение |
|---------|------|----------|
| users | id, phone | 10, +79990000007 |
| user_balances | balance | **24.99** (≈25₽) |
| subscriptions | plan_id, daily_rate, price, end_date | 3 (Pro), **50.0**, 1500.0, 2026-03-01 |
| subscription_plans | id=3 (Pro) | price_1m=1500 (не 3000!) |

**План Pro в БД**: price_1m=1500 → daily_rate=50. В аудите ожидалось Pro ~3000₽ (daily_rate~100), но в текущей БД Pro=1500₽.

**Расчёт по новой формуле**:
- balance_rub = 24.99
- daily_rate = 50
- balance_days = floor(24.99/50) = **0**
- calendar_days = 28
- **days_remaining = min(0, 28) = 0** ✓

---

## 3) Реальный ответ API (localhost:8000)

```json
{
  "daily_rate": 50.0,
  "days_remaining": 28,   // ← ОШИБКА: должно быть 0
  "balance": —            // balance не в этом endpoint, приходит из /api/balance/
}
```

**Факт**: API возвращает `days_remaining=28`. При новой формуле должно быть 0. Значит **запущенный backend использует старый код**.

---

## 4) Код в backend/routers/subscriptions.py (текущая ветка)

Фрагмент расчёта (стр. 153–172):

```python
# days_remaining: min(balance_days, calendar_days)
user_balance = get_or_create_user_balance(db, current_user.id)
balance_rub = float(user_balance.balance or 0.0)
...
if daily_rate > 0:
    balance_days = int(balance_rub // daily_rate)
    days_remaining = max(0, min(balance_days, calendar_days))
```

Код корректен. Добавлен лог при `SUBSCRIPTION_DAYS_DEBUG=1`:
```
subscription/my days_remaining user_id=... balance_rub=... daily_rate=... balance_days=... calendar_days=... days_remaining=...
```

---

## 5) Reseed

- **Ожидание для Pro low-balance**: `balance = ceil(daily_rate * 1.2) ≈ 60` (при daily_rate=50)
- **В БД**: balance ≈ 25₽
- **Вывод**: reseed не применялся к этой БД или к другому base-url.

Проверить base-url при reseed:
```bash
python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

---

## Минимальный фикс (шаги)

1. **Перезапустить backend**, чтобы подтянуть новый код:
   ```bash
   # Остановить текущий процесс (Ctrl+C или pkill)
   cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Проверить после рестарта**:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"phone":"+79990000007","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/subscriptions/my | python3 -m json.tool | grep days_remaining
   ```
   Ожидаемое значение: `"days_remaining": 0`.

3. **Если mobile подключается к другому серверу** (Docker, прод): задеплоить обновлённый код и перезапустить контейнер/сервис.

4. **Опционально: обновить reseed** для проверки low-balance:
   ```bash
   python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
   ```

5. **Удалить временный код** после проверки:
   - `mobile/src/services/api/subscriptions.ts`: убрать блок с `console.log`
   - `backend/routers/subscriptions.py`: убрать блок с `SUBSCRIPTION_DAYS_DEBUG`

---

## Файлы для диагностики

- `backend/scripts/diagnose_user_07.py` — скрипт проверки БД (запуск: `python backend/scripts/diagnose_user_07.py`)
- `docs/DIAG_USER_07_DAYS_REMAINING.md` — этот отчёт

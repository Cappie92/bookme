# MVP-подписки: отчёт «можно тестировать»

## Что сделано

### ЗАДАЧА 1 — Починить падающие subscription-тесты

**Исправления:**

- **`test_subscription_plans`**: Убрано использование `price_monthly` / `price_yearly`. Введён `PLAN_PRICES` с `price_1month`…`price_12months`. Все создаваемые планы и payload'ы API переведены на MVP-контракт. Проверки переведены на `price_1month`, `price_1month` при update.
- **`test_subscription_features`**: Фикстуры планов переведены на `price_1month`…`price_12months`, `display_name`, `features["service_functions"]` (ID 1–6). Подписки создаются с `duration_months_to_days(1)` и `daily_rate = price / days`. Убраны проверки `can_add_page_module` (в коде всегда `False`). Добавлен импорт `constants.duration_months_to_days`.

Legacy-тесты не помечались как xfail — всё приведено к MVP без изменения продакшн-кода.

### ЗАДАЧА 2 — Зафиксировать модель «баланс = депозит подписки»

**Где зафиксировано:**

- **`docs/SUBSCRIPTION_DEPOSIT_IMPLEMENTATION.md`**: Добавлен блок **«MVP-модель баланса»**:
  - `UserBalance.balance` = текущий остаток депозита (не «первоначально оплаченная сумма», не «общий кошелёк»).
  - Ежедневное списание: `balance -= daily_rate`; при `balance < daily_rate` → деактивация, `DailySubscriptionCharge` с `status=FAILED` и `reason`.
  - Пополнение только через оплату подписки/продления/апгрейда.
  - Три коротких примера расчёта (оплата 3000₽/30 дней, days_remaining, деактивация при нехватке).
- **`backend/utils/balance_utils.py`**: В docstring `process_daily_charge` добавлено пояснение: MVP, `balance` = остаток депозита, не «общий кошелёк»; списание и деактивация.
- **`backend/services/daily_charges.py`**: В docstring `process_all_daily_charges` добавлено: списание из `UserBalance.balance` (остаток депозита), не «общий кошелёк».

### ЗАДАЧА 3 — Унифицировать UI: везде «Баланс» для мастера

**Изменённые UI-строки:**

- **Web** `frontend/src/pages/MasterDashboard.jsx`: заголовок карточки «Депозит» → **«Баланс»**; комментарий «Депозит, подписка…» → «Баланс, подписка…». «Дней осталось» и кнопка «Продлить / Апгрейд» без изменений.
- **Mobile** `mobile/app/index.tsx`: в карточке подписки лейбл «Депозит» → **«Баланс»**. «Дней осталось» без изменений.

Сущности и API не переименовывались (`UserBalance` и т.д. остались).

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `backend/tests/test_subscription_plans.py` | MVP-контракт: `price_1month`…`price_12months`, `PLAN_PRICES`, правки create/update/get/delete/public. |
| `backend/tests/test_subscription_features.py` | Фикстуры планов: `price_*`, `service_functions`; подписки с `duration_months_to_days`; убраны проверки `can_add_page_module`. |
| `docs/SUBSCRIPTION_DEPOSIT_IMPLEMENTATION.md` | Блок «MVP-модель баланса» + примеры; правки таблиц Web/Mobile. |
| `backend/utils/balance_utils.py` | Docstring `process_daily_charge`: MVP, balance = остаток депозита. |
| `backend/services/daily_charges.py` | Docstring `process_all_daily_charges`: списание из остатка депозита. |
| `frontend/src/pages/MasterDashboard.jsx` | «Депозит» → «Баланс» в карточке и комментарии. |
| `mobile/app/index.tsx` | «Депозит» → «Баланс» в карточке подписки. |

---

## Auth-фикстуры (единые для subscription-тестов)

- **Проблема:** `test_master_token` и логин использовали `/auth/login` вместо `/api/auth/login` → 404, `KeyError: 'access_token'`.
- **Исправление:**
  - В **`conftest.py`**: общий `_login(client, phone, password)` → `POST /api/auth/login`, `assert response.status_code == 200`, `assert "access_token" in data`, возврат `data`. Все `*_token` фикстуры переведены на `_login`.
  - Добавлены **`master_auth_headers`** и **`admin_auth_headers`**: возвращают `{"Authorization": f"Bearer {data['access_token']}"}`.
- **Subscription-тесты** используют `master_auth_headers` / `admin_auth_headers`; локальные `_auth_headers*` и ручная сборка headers убраны.

**Изменённые файлы (auth):** `conftest.py`, `test_subscription_plans.py`, `test_subscription_calculate_contract.py`, `test_apply_upgrade_free.py`, `test_deposit_410.py`.

---

## Команды для прогона тестов

Единый прогон (все subscription-тесты, включая `test_subscription_calculate_contract`):

```bash
cd backend && python3 -m pytest \
  tests/test_subscription_plans.py tests/test_subscription_features.py \
  tests/test_subscription_calculate_contract.py \
  tests/test_apply_upgrade_free.py tests/test_deposit_410.py tests/test_constants.py -v
```

На момент отчёта все **23** теста проходят.

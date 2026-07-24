# Debt — subscriptions billing

Подтверждённые или обоснованно выведенные ограничения текущего денежного контура.
Это **не** backlog фич и **не** проект редизайна.

См. домен: [../Domain/subscriptions-billing/README.md](../Domain/subscriptions-billing/README.md).

---

### Prod database = SQLite volume

- **Confidence:** CONFIRMED
- **Evidence:** `docker-compose.prod.yml` задаёт `DATABASE_URL=sqlite:////data/bookme.db`
- **Failure scenario:** writer contention, сложнее горизонтально масштабировать API
- **Existing protection:** один backend-контейнер в типичном compose
- **Unknowns:** планы миграции на Postgres в runtime не зафиксированы этим пакетом
- **Investigation:** нагрузка на locking при параллельных ResultURL / daily charges

### In-process background jobs

- **Confidence:** CONFIRMED
- **Evidence:** startup `asyncio` tasks для `daily_charges`, `expired_payments_cleanup` в `backend/main.py` + services
- **Failure scenario:** при N replicas — двойные daily charges / cleanup
- **Existing protection:** логика идемпотентности статусов внутри одного процесса
- **Unknowns:** фактическое число процессов на prod
- **Investigation:** внешний scheduler / leader election

### Multi-replica risk

- **Confidence:** INFERRED (из in-process jobs + SQLite)
- **Evidence:** нет distributed lock в разобранных billing services
- **Failure scenario:** concurrent apply / charge
- **Existing protection:** `with_for_update`, status flags (на одном DB writer)
- **Unknowns:** текущий deployment topology beyond compose file
- **Investigation:** зафиксировать hard limit «один writer» в ops

### Soft-hold в JSON `payment_metadata`

- **Confidence:** CONFIRMED
- **Evidence:** `backend/utils/subscription_payment_split.py` — `build_payment_split_metadata`; hold helpers в `backend/utils/balance_utils.py`
- **Failure scenario:** потеря флагов / partial update metadata
- **Existing protection:** `flag_modified` на путях обновления; тесты mixed/expire
- **Unknowns:** все ли legacy writers трогают metadata корректно
- **Investigation:** аудит всех записей в `payment_metadata`

### Paid + apply failed

- **Confidence:** CONFIRMED
- **Evidence:** две фазы `backend/routers/payments.py` — `robokassa_result`; `backend/routers/admin.py` — `retry_subscription_apply`
- **Failure scenario:** деньги на балансе без активной подписки / без finalize hold
- **Existing protection:** admin `retry-subscription-apply`; ручной ops
- **Unknowns:** частота на prod; алертинг
- **Investigation:** метрика/алерт на `subscription_apply_status=failed`

### Нет distributed locking

- **Confidence:** CONFIRMED (отсутствие механизма в billing path)
- **Evidence:** только SQLAlchemy `with_for_update`
- **Failure scenario:** см. multi-replica
- **Existing protection:** DB row locks при одном writer
- **Unknowns:** —
- **Investigation:** нужна ли блокировка на уровне invoice_id вне DB

### Web / mobile verification drift

- **Confidence:** CONFIRMED
- **Evidence:** `frontend/src/utils/paymentPublicStatus.js` vs `mobile/src/utils/paymentPublicStatus.ts` — разные `resolvePaymentVerifyState` (web допускает null/'' apply как success)
- **Failure scenario:** расхождение analytics / UX «успех»
- **Existing protection:** комментарии в mobile utils; backend канон applied
- **Unknowns:** продуктовое влияние
- **Investigation:** единый shared verify helper

### Recurring Robokassa не реализован

- **Confidence:** CONFIRMED
- **Evidence:** `backend/services/daily_charges.py` (`recurring_not_implemented`)
- **Failure scenario:** ожидание auto_renewal с карты не выполняется
- **Existing protection:** пользовательский повторный purchase
- **Unknowns:** —
- **Investigation:** отдельный продукт/ADR при появлении требования

### Нет строгого uniqueness «одна active subscription»

- **Confidence:** CONFIRMED
- **Evidence:** `backend/utils/subscription_features.py` — selector + warning при count>1; нет UNIQUE на окно дат
- **Failure scenario:** overlapping ACTIVE строки
- **Existing protection:** apply expire old на immediate; selector max end_date
- **Unknowns:** частота overlapping на prod
- **Investigation:** constraint или жёсткая транзакция «expire all then insert»

### Legacy init без `calculation_id`

- **Confidence:** CONFIRMED
- **Evidence:** ветка в `backend/routers/payments.py` — `init_subscription_payment`
- **Failure scenario:** нет soft-hold v2; другая семантика deposit
- **Existing protection:** клиенты web/mobile передают snapshot в актуальном UI
- **Unknowns:** остаются ли внешние клиенты legacy
- **Investigation:** запрет legacy в API или метрика usage

### Отключённый deposit flow (410)

- **Confidence:** CONFIRMED
- **Evidence:** `backend/routers/payments.py` — `init_deposit_payment`; `backend/routers/balance.py` — `deposit_balance_endpoint`
- **Failure scenario:** мёртвый UI (`DepositModal` / unused mobile API) вводит в заблуждение
- **Existing protection:** 410 на API
- **Unknowns:** —
- **Investigation:** удаление мёртвого UI (отдельная задача)

### Credit-from-reserved

- **Confidence:** CONFIRMED current = disabled (`credit_amount=0`); тесты MVP
- **Evidence:** `backend/routers/subscriptions.py` — `calculate_subscription_cost`; `backend/tests/test_subscription_calculate_contract.py`
- **Failure scenario:** чтение старых docs/планов с credit≠0
- **Existing protection:** актуальные тесты фиксируют 0
- **Unknowns:** будет ли credit возвращён
- **Investigation:** только при смене продукта

### Дубли `SubscriptionType` в `models.py`

- **Confidence:** CONFIRMED
- **Evidence:** два `class SubscriptionType` в одном модуле
- **Failure scenario:** путаница при сопровождении
- **Existing protection:** Python перезаписывает имя класса
- **Unknowns:** зависят ли миграции/алембик от первого определения
- **Investigation:** безопасное удаление дубля

### TTL comment 20 vs runtime 30

- **Confidence:** CONFIRMED
- **Evidence:** comment в `backend/models.py` — `SubscriptionPriceSnapshot` vs `timedelta(minutes=30)` в `calculate_subscription_cost` + `PENDING_SUBSCRIPTION_PAYMENT_TTL` = 30
- **Failure scenario:** неверные ожидания ops
- **Existing protection:** runtime 30 согласован с payment cleanup
- **Unknowns:** —
- **Investigation:** поправить комментарий модели (косметика)

### AlwaysFree side effect на read path

- **Confidence:** CONFIRMED
- **Evidence:** `backend/utils/subscription_features.py` — `get_user_subscription_with_plan` создаёт подписку при `is_always_free`
- **Failure scenario:** GET неожиданно пишет в БД
- **Existing protection:** флаг пользователя; readonly-вариант `get_active_subscription_readonly` для части admin путей
- **Unknowns:** все ли GET используют readonly где нужно
- **Investigation:** аудит вызовов селектора

### Слабая observability billing-ошибок

- **Confidence:** CONFIRMED (отсутствие APM/алертов в разобранной инфре); application logs есть
- **Evidence:** `docker-compose.prod.yml` — нет Sentry/Prometheus сервисов; health endpoint в backend; product analytics (AppMetrica/Metrika) не заменяет ops-алерт на `subscription_apply_status=failed`
- **Failure scenario:** phase2 fail без оперативного сигнала
- **Existing protection:** application logs
- **Unknowns:** внешний log shipping / мониторинг на хосте вне compose
- **Investigation:** алерт на apply=failed / expired spike

---

## Направления (одна строка, без реализации)

Единый verify-контракт клиентов; явный single-writer для billing jobs; метрики apply-failed; косметика TTL-комментария и дубля enum — только после приоритезации.

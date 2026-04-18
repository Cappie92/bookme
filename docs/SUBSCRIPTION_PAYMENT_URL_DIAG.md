# Диагностика payment_url (Robokassa, в т.ч. KZ)

## Назначение

Одна структурированная лог-строка для поиска в логах: что именно ушло в Robokassa (домены, env, merchant, test). Без query-параметров.

## TAG и формат

Ищите в логах бэкенда строку:

```
TAG: payment_url_diag
```

Формат одной строки:

```
TAG: payment_url_diag user_id=... phone=... env=... merchant_login=... is_test=... payment_url_domain=... success_url_domain=... fail_url_domain=... result_url_domain=...
```

- **user_id** — ID пользователя
- **phone** — телефон
- **env** — `ENVIRONMENT` (development / production)
- **merchant_login** — логин мерчанта (обрезано до 20 символов + "...")
- **is_test** — тестовый режим Robokassa
- **payment_url_domain** — схема + хост + path сгенерированного `payment_url` (без query)
- **success_url_domain** — домен SuccessURL
- **fail_url_domain** — домен FailURL
- **result_url_domain** — домен ResultURL (callback)

## Где формируется

- **Файл:** `backend/routers/payments.py`
- **Функция:** `init_subscription_payment` (POST `/api/payments/subscription/init`).
- Лог пишется сразу после `generate_payment_url(...)`, перед `return PaymentInitResponse(...)`.

## Когда пишется

Лог выводится только если выполняется одно из:

- `PAYMENT_URL_DEBUG=1`
- `ENVIRONMENT=development`

Иначе строка не логируется.

## Где смотреть

- **Backend:** stdout/stderr процесса API (uvicorn, gunicorn и т.п.) или централизованные логи приложения.
- **Поиск:** `grep "TAG: payment_url_diag"` или `grep "payment_url_domain"` в лог-файлах.

## Mobile (__DEV__)

В мобильном приложении перед `Linking.openURL(payment_url)` в `SubscriptionPurchaseModal` в __DEV__ логируется домен:

```
🧾 [PAYMENT] Opening payment_url { domain: "...", origin: "..." }
```

Так можно проверить, какой домен реально открывается в браузере/WebView (в т.ч. при редиректах на KZ).

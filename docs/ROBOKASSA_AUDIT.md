# Аудит: Robokassa (оплата подписки)

## 1. Краткое резюме

Интеграция Robokassa реализована: инициация платежа через `POST /api/payments/subscription/init`, callback через `POST /api/payments/robokassa/result`, подпись проверяется (password_2), тестовый режим включается через `ROBOKASSA_IS_TEST=true`. После успешной оплаты подписка создаётся, баланс пополняется. End-to-end flow можно тестировать при корректных ENV и доступном Result URL извне.

---

## 2. Что уже есть

### Конфиг / ENV

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `ROBOKASSA_MERCHANT_LOGIN` | Логин мерчанта | — |
| `ROBOKASSA_PASSWORD_1` | Пароль #1 (подпись запроса, Success/Fail URL) | — |
| `ROBOKASSA_PASSWORD_2` | Пароль #2 (проверка Result URL) | — |
| `ROBOKASSA_IS_TEST` | Тестовый режим | `"true"` (строка) |
| `ROBOKASSA_RESULT_URL` | URL для callback от Robokassa | — |
| `ROBOKASSA_SUCCESS_URL` | Редирект после успешной оплаты | — |
| `ROBOKASSA_FAIL_URL` | Редирект после неуспешной оплаты | — |

**Файл конфига:** `backend/utils/robokassa.py` → `get_robokassa_config()`

### Backend-маршруты

| Маршрут | Метод | Назначение |
|---------|-------|------------|
| `/api/payments/subscription/init` | POST | Создание Payment, генерация payment_url (Robokassa) |
| `/api/payments/robokassa/result` | POST | Callback (Result URL): проверка подписи, маркировка paid, депозит, apply подписки |
| `/api/payments/deposit/init` | POST | 410 Gone — пополнение отключено |
| `/api/payments/status` | GET | Список платежей пользователя/админа |

### Генерация URL и подпись

- **Файл:** `backend/utils/robokassa.py`
- **Генерация подписи запроса:** `generate_signature(merchant_login, amount, invoice_id, password_1)` — формат `MerchantLogin:OutSum:InvId:Password#1`
- **Проверка Result URL:** `verify_result_notification(amount, invoice_id, signature, password_2)` — формат `OutSum:InvId:Password#2`
- **Базовый URL формы:** `https://auth.robokassa.ru/Merchant/Index.aspx` (и test, и prod)

### Логика robokassa_result

1. **Подпись:** проверяется `verify_result_notification`; при неверной — `"ERROR: Invalid signature"`.
2. **Фаза 1:** `status='paid'`, зачисление депозита (UserBalance) идемпотентно по `subscription_deposit_applied` в metadata.
3. **Фаза 2:** apply подписки по `calculation_id` из snapshot; создание Subscription, обновление `subscription_apply_status='applied'`.
4. **Идемпотентность:** при повторном webhook возвращается `OK{invoice_id}` без повторных действий.

---

## 3. Чего не хватает

1. **Success/Fail URL:** Не используются для проверки подписи на редиректе (на бэкенде). Пользователь только перенаправляется на фронт. Это допустимо, но дополнительная проверка подписи на Success URL могла бы усилить безопасность.
2. **Документация ENV:** Нет явного списка обязательных переменных в одном месте (кроме упоминаний в docs).
3. **Отдельный KZ-домен:** В коде только `auth.robokassa.ru`. Редирект на `.kz` возможен со стороны Robokassa по geo — в коде это не контролируется.

---

## 4. Как тестировать сейчас

### Необходимые ENV (dev/stage)

```env
ROBOKASSA_MERCHANT_LOGIN=<ваш мерчант>
ROBOKASSA_PASSWORD_1=<пароль 1>
ROBOKASSA_PASSWORD_2=<пароль 2>
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=https://<ваш-домен>/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=https://<фронт>/payment/success
ROBOKASSA_FAIL_URL=https://<фронт>/payment/failed
```

### Требования к Result URL

- Должен быть доступен **извне** (Robokassa делает POST на этот URL).
- Для localhost нужен туннель (ngrok и т.п.) и подстановка его URL в `ROBOKASSA_RESULT_URL`.

### Пошаговый сценарий

1. Логин как мастер.
2. Перейти в «Мой тариф» / «Подписки».
3. Выбрать платный план, период, нажать «Оплатить».
4. Backend вызывает `POST /api/payments/subscription/init` → в ответе `payment_url`.
5. Открыть `payment_url` (форма Robokassa).
6. В тестовом режиме провести оплату тестовыми данными Robokassa.
7. Robokassa делает POST на `ROBOKASSA_RESULT_URL` с OutSum, InvId, SignatureValue и др.
8. Проверить: Payment.status = 'paid', Subscription создана/продлена, UserBalance увеличен.
9. Редирект на Success URL с `?payment_id=...`.

### Проверка подписки после оплаты

- `GET /api/subscriptions/my` — активная подписка.
- `GET /api/master/subscription/features` — флаги `has_*` соответствуют плану.

---

## 5. Критические риски

| Риск | Статус | Комментарий |
|------|--------|-------------|
| **Подпись не проверяется** | Нет | Подпись проверяется в `robokassa_result` до любой логики |
| **Идемпотентность** | Частично | Повторные webhook обрабатываются идемпотентно (`OK{invoice_id}`) |
| **Повторные webhook** | OK | По `subscription_apply_status` и `subscription_deposit_applied` повторные действия не выполняются |
| **Race conditions** | Смягчено | `with_for_update()` при обновлении Payment и UserBalance |
| **Утечка паролей** | — | Пароли только в env, не в коде. В логах `PAYMENT_URL_DEBUG` маскируется merchant_login |

---

## 6. Ключевые файлы

| Назначение | Путь |
|------------|------|
| Утилиты Robokassa | `backend/utils/robokassa.py` |
| Роутер платежей | `backend/routers/payments.py` |
| Модель Payment | `backend/models.py` |
| Схемы | `backend/schemas.py` (SubscriptionPaymentInitRequest, PaymentInitResponse и др.) |

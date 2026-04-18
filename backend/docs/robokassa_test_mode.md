# Robokassa: локальный тестовый режим (runbook)

Краткая инструкция для **ручного** тестирования платежей в тестовом режиме Robokassa без смешения с production.

## A. Как включить тестовый режим

1. В каталоге `backend/` создайте файл **`.env.robokassa-test.local`** из шаблона:
   ```bash
   cd backend
   cp .env.robokassa-test.local.example .env.robokassa-test.local
   ```
2. Заполните **обязательные** переменные:
   - `ROBOKASSA_MERCHANT_LOGIN` — логин магазина
   - `ROBOKASSA_TEST_PASSWORD_1` и `ROBOKASSA_TEST_PASSWORD_2` — **тестовые** пароли из ЛК Robokassa (раздел теста / тестовые настройки)
   - `API_BASE_URL`, `ROBOKASSA_RESULT_URL`, `ROBOKASSA_SUCCESS_URL`, `ROBOKASSA_FAIL_URL` — с **публичным** хостом (см. раздел ResultURL ниже)
3. Убедитесь, что в этом файле:
   - `ROBOKASSA_IS_TEST=true`
   - `ROBOKASSA_MODE=production` (не `stub`, если нужен реальный тестовый checkout на стороне Robokassa)
   - боевые `ROBOKASSA_PASSWORD_1` / `ROBOKASSA_PASSWORD_2` **пустые** (шаблон так и задуман)

4. Базовый `backend/.env` (JWT, БД и т.д.) при запуске через скрипт подхватывается **первым**, затем значения из `.env.robokassa-test.local` **перекрывают** только совпадающие ключи.

## B. Что важно помнить

| Тема | Пояснение |
|------|-----------|
| Отдельные тестовые пароли | Подпись init и ResultURL считаются по **тестовым** паролям, пока `ROBOKASSA_IS_TEST=true`. Боевые пароли в том же env не заполняйте. |
| `ROBOKASSA_IS_TEST` | Должен быть `true` для тестового режима (`IsTest=1` в запросе к Robokassa). |
| `ROBOKASSA_MODE` | Для реального перехода на форму оплаты Robokassa — **`production`**. Режим **`stub`** только для локальной симуляции без вызова Robokassa. |
| Production шаблон | См. **`backend/.env.production.example`** — там `ROBOKASSA_IS_TEST=false` и боевые плейсхолдеры. |

## C. ResultURL и публичный адрес

Robokassa отправляет **POST** на `ROBOKASSA_RESULT_URL` **со своих серверов**. Адрес вида `http://localhost:8000/...` **недоступен** из интернета, callback не придёт.

Нужен **публичный HTTPS URL** до вашего backend, например:

- [ngrok](https://ngrok.com/): `ngrok http 8000` → подставьте выданный хост в `API_BASE_URL` и во все `ROBOKASSA_*_URL`, где указан backend.
- Аналоги: Cloudflare Tunnel, localtunnel и т.п.

Пример (замените на свой URL туннеля):

```text
API_BASE_URL=https://abcd-12-34-56-78.ngrok-free.app
ROBOKASSA_RESULT_URL=https://abcd-12-34-56-78.ngrok-free.app/api/payments/robokassa/result
```

Страницы успеха/неуспеха (`SUCCESS` / `FAIL`) должны открываться в браузере пользователя; их тоже укажите на тот же публичный хост, если фронт проксируется тем же туннелем, или на ваш локальный фронт — главное, чтобы **ResultURL** вёл на доступный снаружи API.

## D. Как тестировать (сценарий)

1. Настроить `.env.robokassa-test.local` и при необходимости базовый `.env`.
2. Запустить backend скриптом (см. ниже) или эквивалентом.
3. Поднять туннель к порту backend (например `8000`) и обновить URL в env, перезапустить backend.
4. В UI инициировать оплату подписки (или сценарий, который бьёт в Robokassa).
5. Пройти тестовый checkout на стороне Robokassa (тестовые карты / методы по их документации).
6. Убедиться, что сработал callback: в логах backend — успешная обработка `robokassa/result`, статус платежа обновлён.
7. В личном кабинете Robokassa проверить, что операция помечена как **тестовая**, без реального списания с боевого баланса.

## Запуск backend с тестовым env

Рекомендуемый способ (загрузка `backend/.env`, затем перекрытие `backend/.env.robokassa-test.local`):

```bash
cd backend
python3 scripts/run_backend_robokassa_test.py
```

Порт по умолчанию `8000`; переопределение: `PORT=8010 python3 scripts/run_backend_robokassa_test.py`.

Через Make:

```bash
cd backend && make run-robokassa-test
```

Альтернатива без скрипта (только если уверены в порядке переменных):

```bash
cd backend
python3 -m dotenv -f .env -f .env.robokassa-test.local run --override -- python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Проверьте версию `python-dotenv`: множественные `-f` поддерживаются не везде; при сбое используйте **`scripts/run_backend_robokassa_test.py`**.

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `backend/.env.robokassa-test.local.example` | Шаблон локального теста (не prod) |
| `backend/.env.production.example` | Шаблон боевых настроек Robokassa |
| `backend/utils/robokassa.py` | Подписи, `IsTest`, конфиг |

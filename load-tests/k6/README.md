# k6 — read-only availability

Изолированный HTTP-сценарий для проверки **availability** публичной карточки мастера на тестовом стенде `https://test.dedato.ru`.

Это **не** полный пользовательский профиль нагрузки. Цель — безопасный smoke / availability baseline без изменения данных.

## Что делает сценарий

Разрешены только:

1. `GET /api/health` — liveness backend (один раз в `setup()`).
2. `GET /api/public/masters/{slug}` — публичная карточка мастера (один раз в `setup()`), чтобы взять `services[].id`.
3. `GET /api/public/masters/{slug}/availability` — единственный запрос в VU-итерации.

## Явно исключено

Сценарий **не** вызывает и не должен расширяться на:

* login и регистрацию;
* phone / email verification;
* Yandex OAuth;
* `booking-price-preview`;
* создание, изменение, подтверждение, завершение или отмену записей;
* платежи и payment callbacks;
* loyalty spend / earn;
* любые внешние интеграции (письма, звонки, карты как HTTP-вызовы и т.п.);
* методы `POST` / `PUT` / `PATCH` / `DELETE`.

## Почему `/api/health`, а не публичный `/health`

На стенде с frontend nginx:

* `GET /api/health` проксируется на backend FastAPI `GET /health` и подтверждает живость **API-процесса**;
* публичный `GET /health` на frontend-контейнере может отвечать статическим `healthy` от nginx и **не** проверять backend.

Для readiness БД `/api/health` всё равно недостаточен (это liveness), но для gate перед availability он корректнее, чем frontend-only `/health`.

## Почему профиль мастера только в `setup()`

`services[].id` нужен как `service_id` для availability. Карточка читается **один раз** до VU, чтобы:

* не смешивать latency профиля с метрикой availability;
* не дублировать лишние GET на каждом VU;
* зафиксировать выбранный `service_id` на весь прогон.

## Переменные окружения и защитные флаги

| Переменная | Обязательность | Описание |
|------------|----------------|----------|
| `BASE_URL` | да | Только `https://test.dedato.ru` (path `/` или пустой). Любой другой host/protocol/port/path/query/credentials → ошибка до HTTP. |
| `MASTER_SLUG` | да | Публичный slug мастера (`masters.domain`). Не захардкожен. |
| `CONFIRM_STAGING` | да | Должно быть ровно `YES`. |
| `PROFILE` | нет (default `smoke`) | `smoke` или `baseline`. Иное значение → ошибка. |
| `CONFIRM_BASELINE` | для `baseline` | Должно быть ровно `YES`, иначе baseline не стартует (до любых HTTP). |
| `SERVICE_ID` | нет | Положительный id услуги из карточки. Если не задан — берётся первая услуга с валидным `id`. |
| `FROM_DATE` | нет | `YYYY-MM-DD`. Если не задан — текущая **UTC**-дата. Несуществующие даты отклоняются. |
| `TO_DATE` | запрещена | `to_date` всегда считается скриптом как `from_date + 14 дней`. |

**Нельзя** задавать VU / duration через environment: режимы зафиксированы в скрипте.

### Режимы

* **smoke** (по умолчанию): `shared-iterations`, 1 VU, 1 iteration, `maxDuration` 1m. Без think-time.
* **baseline**: `constant-vus`, ровно 10 VU, ровно 5 минут, `gracefulStop` 15s; случайная пауза **4–12 с** после availability. Лестница 25/50/100/200 VU не предусмотрена.

### Окно дат

Клиентский контракт: `from_date` … `from_date + 14 дней` → **15 календарных дат inclusive**.
`to_date` пользователем не задаётся и не расширяется.

## Как получить `MASTER_SLUG`

Из публичной тестовой ссылки карточки мастера:

```text
https://test.dedato.ru/m/{slug}
```

Значение `{slug}` и есть `MASTER_SLUG` (без ведущих/хвостовых слэшей).

## `SERVICE_ID`

Можно не задавать. Тогда в `setup()` выбирается первая услуга из `services[]` с валидным положительным `id`.
Если `SERVICE_ID` задан — он должен присутствовать в `services[]` этой карточки, иначе `setup()` падает.

## Пороги SLO (только availability VU)

Custom metrics (запросы `setup()` в них **не** входят):

* Trend `availability_duration`
* Rate `availability_errors`
* Counter `availability_5xx`

Пороги:

* `p(95) < 1000 ms`
* `p(99) < 2000 ms`
* error rate `< 1%`
* число `5xx` строго `0` (немедленный abort)

Для latency и error rate включён `abortOnFail` с `delayAbortEval: 30s`, чтобы baseline не рвался из-за одного стартового замера; `5xx` останавливает сразу.

## Примеры команд (НЕ ЗАПУСКАТЬ СЕЙЧАС)

> **Крупное предупреждение**
>
> * Эти команды приведены как черновик на будущее — **сейчас не запускать**.
> * Перед любым прогоном отдельно подтвердить: deployed commit стенда, тип БД, nginx/Uvicorn topology и серверный мониторинг.
> * **Baseline** разрешён только отдельным явным решением после smoke и проверки стенда.
> * Не устанавливайте k6 в рамках этого этапа — установка будет отдельным шагом.

Smoke (пример):

```bash
CONFIRM_STAGING=YES \
BASE_URL='https://test.dedato.ru' \
MASTER_SLUG='YOUR_TEST_MASTER_SLUG' \
PROFILE=smoke \
k6 run load-tests/k6/availability-readonly.js
```

Baseline (пример; только после отдельного разрешения):

```bash
CONFIRM_STAGING=YES \
CONFIRM_BASELINE=YES \
BASE_URL='https://test.dedato.ru' \
MASTER_SLUG='YOUR_TEST_MASTER_SLUG' \
PROFILE=baseline \
k6 run load-tests/k6/availability-readonly.js
```

Опционально: `SERVICE_ID=…`, `FROM_DATE=YYYY-MM-DD`.

## Секреты

* Не записывать телефоны, пароли, JWT, `.env` или credentials в команды, файлы репозитория или Git.
* Этот сценарий **не** использует auth — секреты для него не нужны.

## Что сохранять после будущего прогона

* UTC-время старта/финиша;
* локальный git commit (ветка сценария);
* deployed commit стенда;
* профиль (`smoke` / `baseline`);
* использованные `MASTER_SLUG` и `service_id`;
* версию k6;
* p50 / p95 / p99 availability;
* error rate и число `5xx`;
* при наличии SSH: CPU / RAM / SQLite (или иная БД) / server logs за окно прогона.

## Файлы

* `availability-readonly.js` — скрипт k6
* `README.md` — этот документ

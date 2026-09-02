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
| `PROFILE` | нет (default `smoke`) | `smoke`, `baseline`, `staircase` или `ramp`. Иное значение → ошибка. |
| `CONFIRM_BASELINE` | для `baseline` | Должно быть ровно `YES`, иначе baseline не стартует (до любых HTTP). Для `staircase`/`ramp` не требуется. |
| `CONFIRM_STAIRCASE` | для `staircase` | Должно быть ровно `YES`, иначе staircase не стартует (до любых HTTP). |
| `CONFIRM_STAIRCASE_OBSERVE` | только `staircase` | Если задана — только ровно `YES`. Наблюдательный режим: latency SLO не abort'ит. Для smoke/baseline/`ramp` запрещена. |
| `CONFIRM_RAMP` | для `ramp` | Должно быть ровно `YES`, иначе ramp не стартует (до любых HTTP). Для smoke/baseline/staircase запрещена. |
| `SERVICE_ID` | нет | Положительный id услуги из карточки. Если не задан — берётся первая услуга с валидным `id`. |
| `FROM_DATE` | нет | `YYYY-MM-DD`. Если не задан — текущая **UTC**-дата. Несуществующие даты отклоняются. |
| `TO_DATE` | запрещена | `to_date` всегда считается скриптом как `from_date + 14 дней`. |

**Нельзя** задавать VU / duration через environment: режимы зафиксированы в скрипте.

### Режимы

* **smoke** (по умолчанию): `shared-iterations`, 1 VU, 1 iteration, `maxDuration` 1m. Без think-time.
* **baseline**: `constant-vus`, ровно 10 VU, ровно 5 минут, `gracefulStop` 15s; случайная пауза **4–12 с** после availability.
* **staircase**: четыре последовательных `constant-vus` ступени 10 → 20 → 30 → 40 VU. Требует `CONFIRM_STAIRCASE=YES`. Не запускать без отдельного разрешения после ревью.
* **ramp**: один непрерывный `ramping-vus` scenario `availability_ramp` до 40 VU. Требует `CONFIRM_RAMP=YES`. Контроль устойчивых плато без синхронного перезапуска всех VU на каждой ступени. Это **не** утверждение, что 40 VU — предел системы; потолок тот же, что уже смотрели наблюдательным staircase. Не запускать без отдельного разрешения после ревью.

Точное расписание staircase:

| Scenario | startTime | VU | duration | gracefulStop |
| -------- | --------: | -: | -------: | -----------: |
| `availability_step_10` | `0s` | 10 | `2m` | `10s` |
| `availability_step_20` | `2m15s` | 20 | `2m` | `10s` |
| `availability_step_30` | `4m30s` | 30 | `2m` | `10s` |
| `availability_step_40` | `6m45s` | 40 | `2m` | `10s` |

Между концом `duration + gracefulStop` предыдущей ступени и `startTime` следующей остаётся **5 секунд**, поэтому ступени не пересекаются даже при полном gracefulStop. Максимальная длительность всего запуска — около **8m55s** (`6m45s + 2m + 10s`). Ориентировочно **1400–1600** availability-запросов (не фиксированное обязательное число). Пауза **4–12 с** после каждого availability. `setup()` выполняется один раз.

Каждая staircase-итерация явно ставит тег `load_step=<имя scenario>` на HTTP availability и на custom metrics `availability_duration`, `availability_errors`, `availability_5xx`. Thresholds считаются **отдельно по каждой ступени**. Любой 5xx останавливает весь запуск (tagged `count==0` без delay плюс общий untagged `availability_5xx`). Для latency/error rate в обычном staircase `abortOnFail` с `delayAbortEval` от начала теста: 10 VU → `30s`, 20 VU → `2m45s`, 30 VU → `5m`, 40 VU → `7m15s`.

**Наблюдательный staircase** (`CONFIRM_STAIRCASE=YES` и `CONFIRM_STAIRCASE_OBSERVE=YES`): те же ступени, HTTP, паузы и теги. Tagged latency `p(95)<1000` / `p(99)<2000` остаются, но `abortOnFail` выключен — превышение latency фиксируется как failed threshold и **не** рвёт ступени. Итоговый exit code k6 может быть ненулевым после полного прогона из‑за latency SLO — это ожидаемо. Thresholds `availability_5xx count==0` по-прежнему с немедленным `abortOnFail`; `availability_errors rate<0.01` сохраняет `abortOnFail` и те же `delayAbortEval`. Без `CONFIRM_STAIRCASE_OBSERVE=YES` поведение обычного staircase не меняется.

Точные stages ramp (сумма **9m30s**), `startVUs: 0`, `gracefulRampDown: 15s`, `gracefulStop: 15s`:

| Фаза | duration | target |
| ---- | -------: | -----: |
| плавный старт | `30s` | 10 |
| удержание 10 VU | `2m` | 10 |
| рост | `15s` | 20 |
| удержание 20 VU | `2m` | 20 |
| рост | `15s` | 30 |
| удержание 30 VU | `2m` | 30 |
| рост | `15s` | 40 |
| удержание 40 VU | `2m` | 40 |
| плавная остановка | `15s` | 0 |

`gracefulRampDown: 15s` совпадает с длительностью последней стадии и покрывает think-time 4–12 с плюс типичный запрос: при снижении VU уже начатая итерация может завершиться, не меняя таблицу stages. `gracefulStop: 15s` начинается **после** 9m30s stages и тоже не сдвигает stages.

`load_step` для ramp считается **непосредственно перед** GET availability по `Date.now() - exec.scenario.startTime` (`k6/execution`). Фазы роста и остановки **не** входят в latency SLO.

| От начала scenario | `load_step` |
| ------------------ | ----------- |
| `[0s,30s)` | `ramp_to_10` |
| `[30s,150s)` | `availability_hold_10` |
| `[150s,165s)` | `ramp_to_20` |
| `[165s,285s)` | `availability_hold_20` |
| `[285s,300s)` | `ramp_to_30` |
| `[300s,420s)` | `availability_hold_30` |
| `[420s,435s)` | `ramp_to_40` |
| `[435s,555s)` | `availability_hold_40` |
| `[555s,570s]` (и leftover graceful) | `ramp_down` |

Официальный SLO (`p(95)<1000`, `p(99)<2000`, errors `rate<0.01`, 5xx `count==0`) для ramp считается **только на плато** `availability_hold_*`. Latency плато — `abortOnFail=false`: прогон должен пройти все плато; итоговый exit code может быть `99`. Tagged errors плато сохраняют `abortOnFail` с `delayAbortEval` = старт плато + 30s (`1m` / `3m15s` / `5m30s` / `7m45s`). Tagged и общий untagged 5xx — немедленный abort. Общий untagged `availability_errors` — abort с `delayAbortEval: 30s` на весь ramp, включая переходные фазы. Пауза **4–12 с**. `setup()` один раз.

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

Для `smoke` и `baseline`: latency и error rate — `abortOnFail` с `delayAbortEval: 30s`, чтобы прогон не рвался из-за одного стартового замера; `5xx` (`count==0`) без delay.

Для `staircase` те же SLO применяются к каждой ступени через tagged thresholds `metric{load_step:availability_step_N}`; общий `availability_5xx count==0` без delay остаётся страховкой на весь запуск.

Для `ramp` latency SLO применяется только к `availability_hold_10/20/30/40` и не abort'ит. Samples `ramp_to_*` / `ramp_down` в эти thresholds не входят. Errors/5xx abort сохраняются как выше.

## Примеры команд (НЕ ЗАПУСКАТЬ СЕЙЧАС)

> **Крупное предупреждение**
>
> * Эти команды приведены как черновик на будущее — **сейчас не запускать**.
> * Перед любым прогоном отдельно подтвердить: deployed commit стенда, тип БД, nginx/Uvicorn topology и серверный мониторинг.
> * **Baseline** и **staircase** разрешены только отдельным явным решением после ревью и проверки стенда.
> * Не запускайте `PROFILE=staircase` без отдельного разрешения.
> * Наблюдательный staircase (`CONFIRM_STAIRCASE_OBSERVE=YES`) тоже только по отдельному разрешению.
> * `PROFILE=ramp` (`CONFIRM_RAMP=YES`) только по отдельному разрешению после ревью.

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

Staircase (пример; **не запускать без отдельного разрешения**):

```bash
CONFIRM_STAGING=YES \
CONFIRM_STAIRCASE=YES \
BASE_URL='https://test.dedato.ru' \
MASTER_SLUG='YOUR_TEST_MASTER_SLUG' \
PROFILE=staircase \
k6 run load-tests/k6/availability-readonly.js
```

Наблюдательный staircase (пример; **не запускать без отдельного разрешения**). Latency SLO не abort'ит; 5xx и error rate по-прежнему abort. После полного прогона exit code может быть ненулевым из‑за failed `p(95)`/`p(99)`. Для точечных samples используйте `--out json` только во **временный** путь вне репозитория (не коммитить). JSON нужен для времени каждого metric sample, сопоставления задержек с `load_step`, поиска отдельных медленных запросов и последующей корреляции с серверными событиями. Этот `--out` не добавляйте к smoke или baseline.

```bash
CONFIRM_STAGING=YES \
CONFIRM_STAIRCASE=YES \
CONFIRM_STAIRCASE_OBSERVE=YES \
BASE_URL='https://test.dedato.ru' \
MASTER_SLUG='YOUR_TEST_MASTER_SLUG' \
PROFILE=staircase \
k6 run --out json=/tmp/dedato-staircase-observe.json \
  load-tests/k6/availability-readonly.js
```

Ramp (пример; **не запускать без отдельного разрешения**). Один `ramping-vus` scenario; SLO по плато; latency не abort'ит (возможен exit `99`); 5xx/errors abort. JSON только во **временный** путь вне репозитория (не коммитить). `--out json` не добавляйте к smoke или baseline.

```bash
CONFIRM_STAGING=YES \
CONFIRM_RAMP=YES \
BASE_URL='https://test.dedato.ru' \
MASTER_SLUG='YOUR_TEST_MASTER_SLUG' \
PROFILE=ramp \
k6 run --out json=/tmp/dedato-ramp.json \
  load-tests/k6/availability-readonly.js
```

Опционально: `SERVICE_ID=…`, `FROM_DATE=YYYY-MM-DD`.

## Секреты

* Не записывать телефоны, пароли, JWT, `.env` или credentials в команды, файлы репозитория или Git.
* Этот сценарий **не** использует auth — секреты для него не нужны.

## Что сохранять после будущего прогона

* UTC-время старта/финиша;
* локальный git commit (ветка сценария);
* deployed commit стенда;
* профиль (`smoke` / `baseline` / `staircase` / `ramp`);
* использованные `MASTER_SLUG` и `service_id`;
* версию k6;
* p50 / p95 / p99 availability (для staircase — отдельно по каждому `load_step`);
* error rate и число `5xx` (для staircase — отдельно по ступени и общий);
* при наличии SSH: CPU / RAM / SQLite (или иная БД) / server logs за окно прогона.

## Файлы

* `availability-readonly.js` — скрипт k6
* `README.md` — этот документ

# Campaign Overlay Enrichment Guide

Цель: получить расширенный QA-датасет для `contact preferences` и вкладки мастера `Клиенты -> Рассылки` **без изменения канонического baseline reseed по умолчанию**.

## Принцип

- Baseline остаётся каноническим: `backend/scripts/reseed_local_test_data.py`.
- Overlay enrichment запускается отдельным шагом после baseline.
- Enrichment только **добавляет** данные (новые клиенты + completed bookings), ничего не удаляет.

## Entry point

- Скрипт: `backend/scripts/enrich_campaign_test_data.py`

## Что делает enrichment

Для выбранных мастеров:

1. Считает текущих `completed-eligible` клиентов (клиент с >=1 completed booking у мастера).
2. Считает effective channel по той же детерминированной логике, что в frontend (`shared/contactChannels.js`):
   - push
   - email
   - sms  
   (каждый eligible-клиент попадает ровно в один канал по приоритету; отдельного «none» нет.)
3. Если `push/email/sms` ниже целевого минимума, добавляет overlay-клиентов и по одной completed booking.
4. Печатает отчёт `BEFORE/AFTER`.

## One-shot (основная команда для локального QA)

Из корня репозитория:

```bash
make enrich-campaign-qa
```

Что делает по умолчанию:

1. **Пропускает** baseline reseed (ожидается, что БД уже после `reseed_local_test_data.py`).
2. Запускает **overlay enrichment**.
3. Запускает **`--verify-only`** с теми же дефолтными параметрами.

Полный цикл «с нуля» (reseed + enrichment + verify) — нужен запущенный backend с `ENVIRONMENT=development`, `ENABLE_DEV_TESTDATA=1`:

```bash
WITH_RESEED=1 make enrich-campaign-qa
# при другом порте API:
# WITH_RESEED=1 API_BASE_URL=http://127.0.0.1:8001 make enrich-campaign-qa
```

**Успех:** команда завершается с **exit code 0**, в конце verify видно `[OK] verify-only: all masters meet min_per_channel=...`, затем `Campaign QA one-shot: OK`.

Альтернатива без Make: `bash scripts/enrich_campaign_qa.sh` (те же переменные `WITH_RESEED`, `API_BASE_URL`).

## Запуск по шагам

### 1) Baseline reseed

```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

### 2) Overlay enrichment

```bash
python3 backend/scripts/enrich_campaign_test_data.py
```

По умолчанию:

- таргет-мастера: `+79990000000`, `+79990000001`, `+79990000002`
- минимум: `8` completed-eligible клиентов на каждый канал `push/email/sms`

### 3) Verify-only

```bash
python3 backend/scripts/enrich_campaign_test_data.py --verify-only
```

Возвращает non-zero code, если цели не достигнуты.

## Настройка параметров

```bash
python3 backend/scripts/enrich_campaign_test_data.py \
  --master-phones +79990000000 +79990000001 +79990000002 \
  --min-per-channel 10 \
  --max-new-clients-per-master 80
```

## Что enrichment не делает (non-goals)

- Не внедряет backend persistence для contact preferences.
- Не меняет backend REST-контракты кампаний.
- Не меняет baseline-поведение `reseed_local_test_data.py` по умолчанию.
- Не трогает low-balance/legacy-спецсценарии baseline.


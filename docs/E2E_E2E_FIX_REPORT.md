# Отчёт по E2E-тестам

## Выполненные изменения

### Часть 1 — Seed (backend/routers/dev_e2e.py)

- **Master A (FREE):**
  - `auto_confirm_bookings=false`, `manual_confirm_enabled_at=now-7days`
  - Домен `e2e-master-a`, 2 услуги ("E2E Стрижка", "E2E Окрашивание")
  - Расписание для всех дней 1–7 (пн–вс), 10:00–20:00
  - Прошлая запись AWAITING_CONFIRMATION с `created_at >= manual_confirm_enabled_at` (под pending-confirmations)
  - Будущая запись CONFIRMED для client cancel flow

- **Master B (Pro):**
  - `pre_visit_confirmations_enabled=true`, `auto_confirm_bookings=false`
  - Будущая запись в статусе CREATED (для pre-visit confirm)

- Идемпотентность: существующие записи обновляются, не создаются дубли
- В ответе seed добавлен `smoke` с slug, услугами, booking IDs, статусами

### Часть 2 — data-testid в UI

| Элемент | data-testid |
|--------|-------------|
| Публичная страница — имя мастера | `public-master-name` |
| Публичная страница — адрес | `public-master-address` |
| Публичная страница — кнопка записи | `public-book-button` |
| Выбор услуги | `service-select` |
| Навигация: дашборд | `nav-dashboard` |
| Навигация: расписание | `nav-schedule` |
| Навигация: настройки | `nav-settings` |
| Навигация: статистика | `nav-stats` |
| Навигация: финансы | `nav-finance` |
| Locked: статистика | `locked-stats` |
| Locked: финансы | `locked-finance` |
| Locked: popover | `locked-popover` |
| Locked: «Открыть демо» | `locked-open-demo` |
| Locked: «Перейти к тарифам» | `locked-go-tariffs` |
| Настройки: сохранить | `settings-save` |
| Настройки: режим подтверждения | `toggle-auto-confirm` |
| Настройки: вход в редактирование | `settings-edit` |
| Post-visit секция | `postvisit-section` |
| Post-visit: первая кнопка подтвердить | `postvisit-confirm-first` |

### Часть 3 — Обновления Playwright

- `master.spec.ts` — переход на data-testid
- `client.spec.ts` — `public-book-button`, `service-select`, корректный flow записи
- `public.spec.ts` — `public-master-name`, `public-master-address`
- `robokassa.spec.ts` — без изменений в структуре, сохранён текущий сценарий

### Дополнительно

- **MasterBookingModule:** передаётся `ownerType` из SubdomainPage для indie_master
- **available-slots:** вызов API переведён на `/api/bookings/available-slots-repeat` с параметрами `year`, `month`, `day`

## Результат прогона (прерван по timeout)

```
✘ client creates and cancels booking (21.1s)
✘ master login opens dashboard (5.6s)
✘ free plan shows locked items and demo (30.0s)
✘ master settings save (30.0s)
```

## Возможные причины падений

1. **master login opens dashboard** — после логина долго загружаются настройки (`settingsLoading`), sidebar появляется с задержкой.
2. **free plan / master settings** — возможна рассинхронизация по `locked-stats` / `locked-finance` или по ожиданию элементов.
3. **client creates and cancels booking** — возможны проблемы с доступными слотами или с выбором даты/времени.

## Рекомендации

1. Увеличить таймауты для `nav-dashboard` (например, до 15s).
2. В client.spec: перед выбором даты дождаться загрузки календаря (зелёных дат).
3. Запустить тесты локально и посмотреть скриншоты/трассировки при падении.

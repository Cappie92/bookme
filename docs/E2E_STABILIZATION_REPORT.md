# Отчёт по стабилизации E2E

## Внесённые правки

### (1) helpers.ts — loginViaUI

- Убран `waitForURL` как основной критерий успеха
- После клика «Войти» ожидаются:
  - ответ на `/api/auth/login` со статусом 200
  - ответ на `/api/auth/users/me` со статусом 200
  - появление `nav-dashboard` (data-testid) или «Мои записи»/«Записи» (для клиента) с timeout 20s
- При ответе login != 200 — логируются статус и body (токены замаскированы)
- Общий timeout loginViaUI: 45s

### (2) playwright.config.ts

- `timeout`: 60000
- `expect.timeout`: 20000
- `use.actionTimeout`: 20000
- `use.navigationTimeout`: 30000
- `use.trace`: 'retain-on-failure'
- `use.screenshot`: 'only-on-failure'
- `use.video`: 'retain-on-failure'

### (3) client.spec.ts и master.spec.ts

- Все клики только по `data-testid` (где есть)
- Ожидание `public-book-button` вместо поиска по тексту «Записаться»
- Выбор даты/времени: ожидание появления слотов, выбор первого через `slot-time-first`
- Locked demo: клик по `locked-finance`/`locked-stats` → ожидание `locked-popover` → клик `locked-open-demo` → ожидание «Демонстрационный доступ»
- Settings: клик `nav-settings` → ожидание `settings-edit` или `settings-save` → изменение `toggle-auto-confirm` → клик `settings-save` → ожидание toast/успеха

### (4) data-testid в UI

- `service-item-e2e-haircut` — опция услуги «E2E Стрижка» в select
- `slot-time-first` — первая кнопка времени слота

## Результат прогона

```
✘ client creates and cancels booking (21.8s)
✘ master login opens dashboard (21.1s)
✘ free plan shows locked items and demo (21.1s)
✘ master settings save (21.0s)
✘ post-visit confirm booking (21.0s)
✘ pre-visit free plan has no buttons (21.1s)
✘ pre-visit Master B has confirm buttons (21.1s)
✘ public master page loads and shows address (10.5s)
```

**Итого: 0 passed, 8+ failed** (robokassa мог не успеть выполниться)

## Trace первого падения

Падение: `client creates and cancels booking` (запуск №1)

Путь к trace: `frontend/test-results/client-client-creates-and-cancels-booking-chromium/trace.zip`

Для просмотра: `npx playwright show-trace frontend/test-results/client-client-creates-and-cancels-booking-chromium/trace.zip`

## Trace падения master login

Путь: `frontend/test-results/master-master-login-opens-dashboard-chromium/trace.zip`

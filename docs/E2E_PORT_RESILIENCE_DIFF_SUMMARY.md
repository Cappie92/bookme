# E2E Port Resilience — Diff Summary

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `scripts/e2e_full.sh` | `find_free_port()`, `wait_http_ok()`, `fail_with_logs()`; авто-выбор портов; логи в tmp; trap с выводом PIDs и логов |
| `frontend/playwright.config.ts` | baseURL = E2E_BASE_URL \|\| PLAYWRIGHT_BASE_URL \|\| default |
| `docs/E2E_RUNBOOK.md` | Описание авто-выбора портов; BACKEND_PORT/FRONTEND_PORT; E2E_BASE_URL |
| `docs/END_TO_END_READY_REPORT.md` | BACKEND_PORT/FRONTEND_PORT в ENV |

## Не изменялись

- `frontend/vite.config.js` — proxy уже использует `VITE_API_BASE_URL`
- E2E тесты — без изменений

## Пример успешного лога (порты 8000/5173 заняты)

```
=== E2E ports: backend=8001 frontend=5174 ===
=== Starting backend on port 8001 ===
Backend PID: 4168
=== Starting frontend on port 5174 ===
Frontend PID: 4169
=== Waiting for services ===
Backend ready
Frontend ready
=== Running E2E seed ===
Seed OK
=== Running Playwright (baseURL=http://localhost:5174) ===
...
=== E2E complete ===
```

При падении скрипт выводит: PIDs, порты, последние 50 строк backend.log и frontend.log.

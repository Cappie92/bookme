# E2E Runbook

## Быстрый старт

```bash
# 1. Установка зависимостей и браузеров Playwright
cd frontend && npm install && npx playwright install

# 2. Полный прогон (backend + frontend + seed + Playwright)
./scripts/e2e_full.sh
```

**Скрипт сам выбирает свободные порты** — можно держать запущенные dev-сервера; если 5173/8000 заняты, будут использованы 5174/8001 и т.д.

## Ручной запуск (backend и frontend уже запущены)

```bash
# Backend на 8000, frontend на 5173
export DEV_E2E=true ZVONOK_MODE=stub ROBOKASSA_MODE=stub PLUSOFON_MODE=stub

# Seed (один раз)
curl -X POST http://localhost:8000/api/dev/e2e/seed

# Playwright
cd frontend && E2E_BASE_URL=http://localhost:5173 npx playwright test
```

## ENV

| Переменная | Описание |
|------------|----------|
| `DEV_E2E` | `true` — включает `/api/dev/e2e/seed` |
| `ZVONOK_MODE` | `stub` — без реальных звонков |
| `ROBOKASSA_MODE` | `stub` — без реальных платежей |
| `PLUSOFON_MODE` | `stub` — без реальных звонков |
| `E2E_DATABASE_PATH` | Путь к e2e.db (опционально) |
| `E2E_BASE_URL` | URL фронтенда для Playwright (по умолчанию http://localhost:5173) |
| `BACKEND_PORT` | Порт backend (опционально; иначе — авто-выбор свободного) |
| `FRONTEND_PORT` | Порт frontend (опционально; иначе — авто-выбор свободного) |

## Учётные данные E2E (из seed)

- **Master A (Free):** +79991111111 / e2e123, domain e2e-master-a
- **Master B (Pro):** +79992222222 / e2e123, domain e2e-master-b
- **Client C:** +79993333333 / e2e123

## Smoke: seed + users/me

После seed email E2E‑пользователей валиден (@example.com). Проверка:

```bash
cd backend
DEV_E2E=1 pytest tests/test_e2e_seed_users_me.py -v
```

Ожидание: `passed`, `email` в ответе `/api/auth/users/me` содержит `@example.com`.

## Ожидаемый вывод

```
=== E2E complete ===
  9 passed
```

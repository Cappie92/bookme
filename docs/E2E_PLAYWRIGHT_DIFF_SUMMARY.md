# E2E Playwright — Diff Summary

## Файлы для добавления

| Файл | Описание |
|------|----------|
| `backend/routers/dev_e2e.py` | Роутер с POST `/api/dev/e2e/seed` (DEV_E2E=true, без auth) |
| `backend/scripts/seed_e2e_db.py` | CLI seed для e2e.db (миграции + данные) |
| `frontend/playwright.config.ts` | Конфиг Playwright (baseURL, retries, timeout) |
| `frontend/e2e/*.spec.ts` | 8 E2E тестов (или e2e/master.spec.ts и др.) |
| `scripts/e2e_full.sh` | Единый скрипт: backend + frontend + seed + Playwright |
| `docs/E2E_RUNBOOK.md` | Runbook с командами и ENV |

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `backend/main.py` | Подключить `dev_e2e` роутер при DEV_E2E=true |
| `backend/database.py` | Поддержка `DATABASE_URL` из env (для e2e.db) |
| `frontend/package.json` | Добавить `@playwright/test`, scripts: `test:e2e`, `test:e2e:headed` |
| `docs/END_TO_END_READY_REPORT.md` | Секция Playwright E2E, убрать "все фазы завершены" |

## E2E Seed — данные

- **Master A**: phone +79991111111, password e2e123, Free plan, IndieMaster, domain e2e-master-a
- **Master B**: phone +79992222222, password e2e123, Pro plan, IndieMaster, domain e2e-master-b, pre_visit_confirmations_enabled=true
- **Client C**: phone +79993333333, password e2e123
- 2 услуги для Master A (indie)
- Расписание (среда, пятница — доступные слоты)
- Запись «прошлая»: AWAITING_CONFIRMATION, now-2h, Master A, Client C
- Запись «будущая»: CONFIRMED, now+2h, Master B, Client C

## Playwright сценарии 1–8

1. Master login → dashboard загружается
2. Free plan: LockedNavItem → «Открыть демо» → демо без API
3. Settings: изменить auto_confirm_bookings → сохранить → refresh
4. Post-visit: confirm → запись COMPLETED
5. Pre-visit: Free — нет кнопок; Master B — кнопки есть
6. Public page: /domain/e2e-master-a без логина, адрес, заглушка карты
7. Robokassa stub: купить план → stub-complete → features обновились
8. Client: логин → публичная страница → запись → «Мои записи» → отмена → мастер видит отмену

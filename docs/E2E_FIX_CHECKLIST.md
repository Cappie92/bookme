# E2E Fix Checklist

## Часть A — Backend (выполнено)

- [x] dev_e2e.py: email `@e2e.test` заменён на `@example.com`
- [x] masterA: e2e.master.a@example.com, masterB: e2e.master.b@example.com, clientC: e2e.client.c@example.com
- [x] При обновлении user обновляется и email
- [x] test_e2e_seed_users_me.py: smoke (требует bookme.db с миграциями)

## Часть B — Playwright (выполнено)

- [x] master.spec: `text=DeDato` заменён на `getByRole('button', { name: /Дашборд|Расписание/i })`
- [x] master.spec: меню — `getByRole('button').or(getByRole('link'))`
- [x] client.spec: `Записаться` — `getByRole('button').or(getByRole('link')).waitFor + click`

## Команды и ожидания

### 1. Backend smoke (после seed)

```bash
cd backend
DEV_E2E=1 pytest tests/test_e2e_seed_users_me.py -v
```

**Ожидание:** `passed` (или `skipped` если нет subscription plans в test.db).

Ручной smoke с реальным backend:
```bash
curl -X POST http://localhost:8000/api/dev/e2e/seed
curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"phone":"+79991111111","password":"e2e123"}'
# access_token из ответа:
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/auth/users/me
```
**Ожидание:** 200, email содержит `@example.com`.

### 2. Полный E2E прогон

```bash
./scripts/e2e_full.sh
```

**Ожидание:** минимум `master login opens dashboard` и `pre-visit free plan has no buttons` проходят.

### 3. Результаты последнего прогона

- **2 passed:** master login opens dashboard, pre-visit free plan has no buttons
- **7 failed:** client creates and cancels, free plan locked demo, master settings, post-visit confirm, pre-visit Master B, public page, robokassa stub

Причины падений: селекторы/таймауты, структура UI (тариф, публичная страница). Требуется донастройка селекторов под текущий UI.

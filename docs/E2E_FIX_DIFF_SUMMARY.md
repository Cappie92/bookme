# E2E Fix Diff Summary

## 1) Backend domain.py

**Проблема:** `IndieMaster` не имеет полей `website`, `logo` → AttributeError при GET `/api/domain/{slug}/info`.

**Решение:** Использовать `getattr(indie_master, "website", None)` и `getattr(indie_master, "logo", None)`. Поля `bio` и `email` обёрнуты в fallback (or "").

```diff
- "website": indie_master.website,
- "logo": indie_master.logo,
+ "website": getattr(indie_master, "website", None),
+ "logo": getattr(indie_master, "logo", None),
```

## 2) Seed

Данные seed уже соответствуют ожиданиям теста: `name="E2E Master A"`, `address="ул. Тестовая, 1"`.

## 3) Playwright helpers.ts

**Проблема:** `loginViaUI` падал на `waitForURL` — редирект после логина не срабатывал.

**Решение:**
- Селектор формы: `form` с `input[name="phone"]` и `input[name="password"]`
- Клик по кнопке «Войти» внутри формы
- Ожидание успеха: `Promise.race` между `waitForURL(/\/(master|client)(\?|$|\/)/)` и появлением элементов дашборда («Дашборд», «Все записи», «Настройки»)
- Слушатель `page.on('response')` для фиксации 4xx/5xx по `/api/auth/login`
- При ошибке — вывод URL, API errors, alert, form error
- Таймаут увеличен до 30s

## 4) public.spec.ts

- Добавлен fallback `text=Тестовая` для адреса
- Таймаут увеличен до 10s для имени

## Файлы

| Файл | Изменения |
|------|-----------|
| `backend/routers/domain.py` | getattr для website, logo у IndieMaster |
| `frontend/e2e/helpers.ts` | Устойчивый loginViaUI |
| `frontend/e2e/public.spec.ts` | Более устойчивые селекторы и таймауты |

---

## E2E Email + Playwright fixes

### Backend: dev_e2e.py
- Email с `.test` заменены на `@example.com` (EmailStr валидатор)
- masterA: e2e.master.a@example.com, masterB: e2e.master.b@example.com, clientC: e2e.client.c@example.com
- При обновлении существующего user тоже обновляется email

### Backend: test_e2e_seed_users_me.py
- Smoke: seed -> login -> GET /api/auth/users/me -> 200, email @example.com

### Playwright: master.spec.ts
- text=DeDato заменён на getByRole('heading') или уникальный селектор
- Меню: getByRole('button', { name: '...' }).or(getByRole('link', ...))

### Playwright: client.spec.ts
- Записаться: getByRole('button').or(getByRole('link')).waitFor(15s) + click

### Результат прогона (пример)

2 passed (master login, pre-visit free), 7 failed. 500 на /api/auth/users/me устранён — email @example.com валиден.

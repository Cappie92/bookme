# Тестовые аккаунты DeDato (автогенерация)

> **Не редактировать вручную.** Файл перезаписывается `backend/scripts/reseed_local_test_data.py` после каждого reseed.

- **Сгенерировано:** 2026-04-15 00:02:44 UTC
- **Режим reseed:** `full` (`--no-salon`=нет)
- **Indie / брони:** `master-only`
- **Макс. коммерческий план мастера в БД:** `Premium` (план `AlwaysFree` — служебный, в публичном списке не показывается).

## Администратор

| Role | Phone | Email | Full name | Plan | Balance / scenario | Password | Notes |
|------|-------|-------|-----------|------|-------------------|----------|-------|
| admin | +79031078685 | (см. БД) | (см. БД) | — | — | test123 | NOT DELETED при reset |

## Мастера (подписка + флаги `/api/master/subscription/features`)

| Role | Phone | Email | Full name | Plan | Balance type | Expected behavior | Password | has_clients | ext.stats | finance | restrictions | loyalty | domain | max_modules | API plan_name |
|------|-------|-------|-----------|------|--------------|-------------------|----------|------------|-----------|---------|----------------|---------|--------|-------------|---------------|
| master | +79990000000 | master0@example.com | Мастер Free 0 | Free | — | can_continue=true | test123 | no | no | no | no | no | no | 0 | Free |
| master | +79990000001 | master1@example.com | Мастер Free 1 | Free | — | can_continue=true | test123 | no | no | no | no | no | no | 0 | Free |
| master | +79990000002 | master2@example.com | Мастер Basic 2 | Basic | normal | 20+ дней подписки | test123 | yes | no | no | no | no | yes | 1 | Basic |
| master | +79990000003 | master3@example.com | Мастер Basic 3 | Basic | low | деактивация после daily job | test123 | yes | no | no | no | no | yes | 1 | Basic |
| master | +79990000004 | master4@example.com | Мастер Standard 4 | Standard | normal | 20+ дней подписки | test123 | yes | no | no | no | no | yes | 1 | Basic |
| master | +79990000005 | master5@example.com | Мастер Standard 5 | Standard | low | деактивация после daily job | test123 | yes | no | no | no | no | yes | 1 | Basic |
| master | +79990000006 | master6@example.com | Мастер Pro 6 | Pro | normal | 20+ дней подписки | test123 | yes | yes | no | yes | no | yes | 3 | Pro |
| master | +79990000007 | master7@example.com | Мастер Pro 7 | Pro | low | деактивация после daily job | test123 | yes | yes | no | yes | no | yes | 3 | Pro |
| master | +79990000008 | master8@example.com | Мастер Premium 8 | Premium | normal | 20+ дней подписки | test123 | yes | yes | yes | yes | yes | yes | 999999 | Premium |
| master | +79990000009 | master9@example.com | Мастер Premium 9 | Premium | low | деактивация после daily job | test123 | yes | yes | yes | yes | yes | yes | 999999 | Premium |

## Клиенты (legacy, всегда регистрируются)

| Role | Phone | Email | Full name | Plan | Password | Notes |
|------|-------|-------|-----------|------|----------|-------|
| client | +79990000100 | client0@79990000100.example.com | Клиент +79990000100 | — | test123 | логин, ЛК |
| client | +79990000101 | client1@79990000101.example.com | Клиент +79990000101 | — | test123 | логин, ЛК |
| client | +79990000102 | client2@79990000102.example.com | Клиент +79990000102 | — | test123 | логин, ЛК |

## Модуль «Клиенты» — дополнительные клиенты (только полный reseed)

По **40** клиентов на каждого из **10** мастеров. Телефон: `+7999{master_idx}{client_idx:06d}`, `master_idx` 0…9, `client_idx` 0…39. Пароль: `test123`.

| Назначение | Пример телефона |
|------------|-----------------|
| Мастер idx=0 (+79990000000) VIP + обычный | `+79990000000`, `+79990000001` |
| Мастер idx=1 (+79990000001) VIP + обычный | `+79991000000`, `+79991000001` |
| Мастер idx=2 (+79990000002) VIP + обычный | `+79992000000`, `+79992000001` |

---

*Конец автогенерации.*

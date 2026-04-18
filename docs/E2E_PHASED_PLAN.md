# План фаз: E2E готовность

## Phase 1: Stub-режимы и критические фиксы (приоритет)

**Цель:** Локальное тестирование без внешних сервисов и устранение утечки секретов.

| Задача | Риск | Оценка |
|--------|------|--------|
| Zvonok: убрать api_key из `/zvonok/balance` | Критический | 0.5ч |
| Zvonok: `ZVONOK_MODE=stub` — предсказуемый call_id, фиксированный digits | Средний | 1ч |
| Robokassa: `ROBOKASSA_MODE=stub` — init возвращает stub URL, тест-хелпер для result | Средний | 1.5ч |
| Plusofon: `PLUSOFON_MODE=stub` (если используется) | Низкий | 0.5ч |

**Результат:** Все stub включаются только при явном ENV; production не затрагивается.

---

## Phase 2: Доработки flow

**Цель:** Завершить flow восстановления пароля по телефону.

| Задача | Риск | Оценка |
|--------|------|--------|
| reset-password-by-phone: после verify-phone (call_id+digits) разрешить смену пароля | Средний | 1ч |
| AuthModal: поддержка flow «forgot by phone → verify → reset» | Низкий | 1ч |

---

## Phase 3: Публичная страница и Robokassa UI

**Цель:** SEO и UI оплаты.

| Задача | Риск | Оценка |
|--------|------|--------|
| YandexMap: заглушка при отсутствии ключа | Низкий | 0.5ч |
| robots.txt: не блокировать /domain/* | Низкий | 0.5ч |
| Robokassa UI: кнопка оплаты, статусы, success/fail | Низкий | проверка |

---

## Phase 4: Тесты и E2E

**Цель:** Backend + Web E2E.

| Задача | Риск | Оценка |
|--------|------|--------|
| Backend: тесты auth (stub), payments (stub), bookings, accounting | Средний | 2ч |
| Playwright: установка, 8 сценариев | Средний | 2–3ч |
| scripts/test_e2e.sh, E2E_RUNBOOK.md | Низкий | 0.5ч |

---

## Порядок выполнения

1. **Phase 1** — stub + фикс zvonok/balance (можно тестировать без реальных звонков и Robokassa).
2. **Phase 2** — reset-by-phone (полный flow восстановления).
3. **Phase 3** — мелкие доработки UI/SEO.
4. **Phase 4** — тесты и runbook.

---

## Оценка рисков

| Риск | Митигация |
|------|-----------|
| Stub ломает production | Проверка `if os.getenv("X_MODE") == "stub"`; по умолчанию — обычный режим |
| Утечка api_key | Полностью убрать из ответа zvonok/balance или endpoint только dev |
| E2E нестабильны | Таймауты, retry, изолированные тест-данные |

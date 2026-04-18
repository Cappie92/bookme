# Шаг 2 — Унификация timezone и блокировка скидок без TZ

## 2.1 Backend

### Изменения

- **`routers/client.py` — `get_master_timezone`:** Fallback заменён с `Europe/Moscow` на `UTC`. Используется `getattr(..., None) or fallback` и в `except`. Унификация с `loyalty_discounts._master_timezone`.
- **`routers/loyalty.py`:**
  - Добавлена `_require_master_timezone(master_id, db)`: при пустом/отсутствующем `Master.timezone` выбрасывается `HTTP 400` с текстом «Укажите город и часовой пояс в настройках профиля. Скидки недоступны без заданного timezone.»
  - Вызов `_require_master_timezone` в `create_quick_discount` и `update_quick_discount` перед валидацией условий.
- **`utils/loyalty_discounts._master_timezone`:** Без изменений. Fallback `UTC` при отсутствии мастера или пустом `timezone`.

### Тесты

- `test_require_master_timezone_rejects_empty`: при `timezone is None` и `timezone == ""` — 400; при заданном `Europe/Moscow` — исключения нет.

---

## 2.2 Web

### Изменения

- **`pages/MasterDashboard.jsx`:**
  - В `checkProfileCompleteness` добавлена проверка timezone: при пустом `master.timezone` — предупреждение «Не указан часовой пояс» с `link: 'settings'`.
  - В таб «Лояльность» передаются `masterSettings` и `onOpenSettings={() => handleTabChange('settings')}` в `LoyaltySystem`.
- **`components/LoyaltySystem.jsx`:**
  - Новые пропсы: `masterSettings`, `onOpenSettings`.
  - `hasTimezone = Boolean(masterSettings?.timezone?.trim())`, `createDisabled = hasLoyaltyAccess && !hasTimezone`.
  - При `createDisabled`: баннер «Укажите город и часовой пояс в настройках профиля. Создание скидок недоступно до их указания.» и кнопка «Перейти в настройки» → `onOpenSettings()`.
  - В `QuickDiscountsTab`, `ComplexDiscountsTab`, `PersonalDiscountsTab` передаётся `createDisabled`.
- **Табы скидок:**
  - **Quick:** при `createDisabled` блокируются «Активировать», «Сохранить» (при создании) и карандаш для неактивных шаблонов.
  - **Complex:** блокируется «Создать сложную скидку».
  - **Personal:** блокируется «Добавить пользователя».

---

## 2.3 Mobile

### Изменения

- **`app/master/loyalty.tsx`:**
  - Импорт `getMasterSettings`, `MasterSettings`.
  - Стейт `masterSettings`, загрузка через `getMasterSettings` при `hasLoyaltyAccess` и авторизации.
  - `hasTimezone`, `createDisabled` (аналогично web).
  - При `createDisabled`: баннер и кнопка «Настройки» → `router.push('/master/settings')`.
  - В `DiscountsQuickTab`, `DiscountsComplexTab`, `DiscountsPersonalTab` передаётся `createDisabled`.
- **`DiscountsQuickTab`:**
  - Проп `createDisabled`. При `createDisabled && !isActive`: `Switch` disabled, карандаш скрыт, «Сохранить» (создание) disabled.
- **`DiscountsComplexTab`:** проп `createDisabled`, кнопка «Создать сложную скидку» при `createDisabled` disabled.
- **`DiscountsPersonalTab`:** проп `createDisabled`, кнопка «Добавить пользователя» при `createDisabled` disabled.

---

## 2.4 Smoke checklist (шаг 2 — timezone)

- [ ] `pytest backend/tests/test_loyalty_discounts.py` — все тесты зелёные, в т.ч. `test_require_master_timezone_rejects_empty`.
- [ ] **Backend:** `POST /api/loyalty/quick-discounts` при пустом `Master.timezone` → 400, в `detail` сообщение про city/timezone.
- [ ] **Backend:** `PUT /api/loyalty/quick-discounts/:id` при пустом timezone → 400.
- [ ] **Web:** Мастер без timezone в настройках → в «Лояльность» показывается баннер, кнопки создания скидок неактивны, есть «Перейти в настройки».
- [ ] **Web:** После указания города/timezone в настройках и возврата в «Лояльность» баннер исчезает, создание скидок доступно.
- [ ] **Web:** В блоке «Заполненность профиля» есть предупреждение «Не указан часовой пояс» при пустом timezone.
- [ ] **Mobile:** Аналогично web: баннер и блокировка создания при отсутствии timezone, переход в настройки по кнопке.
- [ ] **Унификация fallback:** В `client.get_master_timezone` используется fallback `UTC` (не `Europe/Moscow`).

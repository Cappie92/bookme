# Архитектура «Ограничения клиентов» / «Правила»

## Карта

### Web

| Элемент | Файл | Описание |
|---------|------|----------|
| Страница | `MasterDashboard` | `/master?tab=restrictions` — контент таба |
| Компонент | `ClientRestrictionsManager.jsx` | Авто-правила + ограничения + черный список + предоплата |
| Sidebar | `MasterDashboard` (внутр. MasterSidebar) | Пункт «⛔ Правила» уже в сайдбаре (gating: hasClientRestrictions) |
| В настройках | `MasterSettings.jsx` | Дублирует блок «Ограничения клиентов» (строки 1170–1187) |

**API, вызываемые Web:**
- `GET /api/master/restrictions` → `{ blacklist, advance_payment_only, total_restrictions }`
- `POST /api/master/restrictions` — создание ограничения
- `PUT /api/master/restrictions/{id}` — обновление
- `DELETE /api/master/restrictions/{id}` — удаление
- `GET /api/master/restriction-rules` → список авто-правил
- `POST /api/master/restriction-rules` — создание правила
- `PUT /api/master/restriction-rules/{id}` — обновление
- `DELETE /api/master/restriction-rules/{id}` — удаление

### Mobile

| Элемент | Файл | Описание |
|---------|------|----------|
| Экран | `mobile/app/master/client-restrictions.tsx` | Заглушка: gating + текст «будет добавлено» |
| Меню | `MasterHamburgerMenu.tsx` | Пункт «Правила» → `/master/client-restrictions` |
| API-слой | `mobile/src/services/api/master.ts` | Нет вызовов restrictions |

### Backend

| Endpoint | Файл | Модель |
|----------|------|--------|
| `GET /api/master/restrictions` | `routers/master.py` ~2643 | ClientRestriction |
| `POST /api/master/restrictions` | ~2673 | ClientRestrictionCreate |
| `PUT /api/master/restrictions/{id}` | ~2713 | ClientRestrictionUpdate |
| `DELETE /api/master/restrictions/{id}` | ~2763 | — |
| `GET /api/master/restriction-rules` | ~2822 | ClientRestrictionRule |
| `POST /api/master/restriction-rules` | ~2839 | ClientRestrictionRuleCreate |
| `PUT /api/master/restriction-rules/{id}` | ~2887 | ClientRestrictionRuleUpdate |
| `DELETE /api/master/restriction-rules/{id}` | ~2962 | — |

**Типы:** `blacklist`, `advance_payment_only`  
**Правила:** `cancellation_reason`, `cancel_count`, `period_days`, `restriction_type`

---

## План изменений

### B) Web
1. Удалить блок «Ограничения клиентов» из `MasterSettings.jsx`.
2. Добавить ссылку в настройках: «Ограничения клиентов →» → `handleTabChange('restrictions')` или `navigate('/master?tab=restrictions')`.
3. Поддержать старый URL: если пользователь открывал настройки ради ограничений — по ссылке переходит в таб.

### A) Mobile
1. Добавить API-клиент в `mobile/src/services/api/master.ts`:
   - `getRestrictions()`, `createRestriction()`, `updateRestriction()`, `deleteRestriction()`
   - `getRestrictionRules()`, `createRestrictionRule()`, `updateRestrictionRule()`, `deleteRestrictionRule()`
2. Реализовать экран `client-restrictions.tsx`:
   - блок «Автоматические правила» + «Добавить правило» + список
   - блок «Ограничения клиентов» + «Добавить ограничение»
   - карточки «Черный список», «Только предоплата»
   - инфоблок «Как работают ограничения»
   - модалки/экраны для создания/редактирования (адаптивно под мобильный)

---

## MVP переноса

- Web: убрать дублирование из настроек, оставить одну точку входа — sidebar. ✅
- Mobile: полный CRUD ограничений и правил через те же API. ✅

---

## Реализация (выполнено)

### Web
- В `MasterSettings.jsx`: блок «Ограничения клиентов» заменён на компактную карточку со ссылкой «Перейти в раздел «Правила» →» (`Link to="/master?tab=restrictions"`).
- Пункт «⛔ Правила» уже был в sidebar `MasterDashboard` (gating: hasClientRestrictions).

### Mobile
- `mobile/src/services/api/master.ts`: добавлены API-функции `getRestrictions`, `createRestriction`, `updateRestriction`, `deleteRestriction`, `getRestrictionRules`, `createRestrictionRule`, `updateRestrictionRule`, `deleteRestrictionRule`.
- `mobile/app/master/client-restrictions.tsx`: экран с блоками «Автоматические правила» и «Ограничения клиентов», CRUD через модалки, карточки «Черный список» и «Только предоплата», инфоблок «Как работают ограничения».

### Команды проверки
```bash
# Backend (тесты restrictions)
cd backend && python3 -m pytest tests/test_master_restrictions_api.py -v

# Web: npm run dev, открыть /master?tab=restrictions
# Mobile: npx expo start, пункт «Правила» в меню
```

### Чеклист ручной проверки
1. Web: пункт «Правила» в sidebar → открывается экран → CRUD работает.
2. Web: Настройки → ссылка «Перейти в раздел «Правила»» → переход на tab=restrictions.
3. Mobile: вкладка «Правила» → видны блоки/списки → добавить ограничение/правило → появилось в списке.
4. Проверить на пустой базе и с данными.
5. Проверить gating: без доступа (Free) показывается «Недоступно на вашем тарифе».

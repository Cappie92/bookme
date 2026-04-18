# Отчёт: DEMO-режим для платных разделов

## Обзор

Реализован единый DEMO-режим для разделов: **Клиенты**, **Статистика**, **Правила**, **Лояльность**, **Финансы** в web и mobile. При отсутствии доступа показываются демо-данные (статичные) + плашка с CTA.

## Изменённые файлы

### Shared (модуль демо-данных)
| Файл | Описание |
|------|----------|
| `shared/demo/clients.js` | 13 демо-клиентов |
| `shared/demo/finance.js` | Сводка и операции (20–30 записей) |
| `shared/demo/loyalty.js` | Скидки, статистика, история |
| `shared/demo/rules.js` | Черный список, предоплата, автоправила |
| `shared/demo/stats.js` | Показатели, графики, топы услуг |
| `shared/demo/index.js` | Barrel-экспорт |

### Web (frontend)
| Файл | Изменения |
|------|-----------|
| `frontend/vite.config.js` | Алиас `shared` → `../shared` |
| `frontend/src/components/DemoAccessBanner.jsx` | **Новый** — плашка «Демонстрационный доступ» + CTA |
| `frontend/src/components/MasterClientsDemo.jsx` | **Новый** — таблица клиентов на shared/demo |
| `frontend/src/components/MasterAccountingDemo.jsx` | **Новый** — сводка и операции |
| `frontend/src/components/MasterLoyaltyDemo.jsx` | **Новый** — скидки и баллы |
| `frontend/src/components/MasterStatsDemo.jsx` | **Новый** — показатели и топы |
| `frontend/src/components/ClientRestrictionsDemo.jsx` | **Новый** — ограничения и правила |
| `frontend/src/pages/MasterDashboard.jsx` | Подключение DemoAccessBanner и *Demo-компонентов для всех разделов |

### Mobile
| Файл | Изменения |
|------|-----------|
| `mobile/babel.config.js` | Алиас `shared` → `../shared` |
| `mobile/src/components/DemoAccessBanner.tsx` | **Новый** — мобильная плашка |
| `mobile/app/master/clients.tsx` | Lock заменён на DemoAccessBanner + FlatList с clientsDemo |
| `mobile/app/master/finance.tsx` | Upgrade Card заменён на DemoAccessBanner |
| `mobile/app/master/loyalty.tsx` | Lock заменён на DemoAccessBanner + демо-контент |
| `mobile/app/master/stats.tsx` | При !hasExtendedStats — DemoAccessBanner + statsDemo |
| `mobile/app/master/client-restrictions.tsx` | Lock заменён на DemoAccessBanner + rulesDemo |

## CTA и маршруты

- **Web:** `handleTabChange('tariff')` или `/master?tab=tariff`
- **Mobile:** `router.push('/subscriptions')`

## Как проверить

### Без доступа (демо-режим)
1. Войти как мастер с планом без нужных фич.
2. Открыть разделы: Клиенты, Статистика, Правила, Лояльность, Финансы.
3. Должны быть:
   - Плашка «Демонстрационный доступ» сверху
   - Демо-контент (таблицы/карточки/графики)
   - Кнопка «Перейти к тарифам»
4. В Network не должно быть запросов к `/api/master/clients`, `/api/master/accounting/*`, `/api/master/loyalty/*`, `/api/master/restrictions*` (при демо).

### С доступом
1. Войти как мастер с планом, включающим все фичи.
2. Разделы работают как раньше: реальные API, реальные данные, без плашки.

### Чеклист ручной проверки
- [ ] Без доступа: демо-данные отображаются, плашка видна, CTA ведёт на оплату
- [ ] Network: при демо нет успешных вызовов защищённых endpoints
- [ ] С доступом: демо исчезает, данные загружаются как раньше
- [ ] Web: все 5 разделов показывают демо при !has*Access
- [ ] Mobile: все 5 экранов показывают демо при !has*Access
- [ ] Пункты меню остаются видимыми всегда

## Команды

```bash
# Frontend build
cd frontend && npm run build

# Mobile (Expo)
cd mobile && npx expo start
```

## Безопасность

- Backend возвращает 403 на clients и finance без доступа (guards).
- В демо-режиме frontend/mobile не вызывают защищённые endpoints.
- Логика: `if (!has*Access) { render DemoAccessBanner + demoContent; return }` — API не вызываются.

# Отчёт: Route groups — железобетонное разделение master/client

## 1. Route groups

| Группа | Путь | Содержимое |
|--------|------|------------|
| `(master)` | `/`, `/master/*`, `/subscriptions`, `/bookings` | MasterMenuProvider, MasterHamburgerMenu, BottomNavigationCarousel, все master-экраны |
| `(client)` | `/client/*`, `/settings`, `/notes`, `/bookings/[id]` | ClientBottomNav (без useMasterMenu), client-экраны |
| `(public)` | `/m/[slug]` | Публичная страница записи без авторизации |

## 2. Перемещённые файлы

| Было | Стало |
|------|-------|
| `app/index.tsx` | `app/(master)/index.tsx` |
| `app/master/*` | `app/(master)/master/*` |
| `app/subscriptions/*` | `app/(master)/subscriptions/*` |
| `app/bookings/*` | `app/(master)/bookings/*` |
| `app/client/*` | `app/(client)/client/*` |
| `app/settings/*` | `app/(client)/settings/*` |
| `app/notes/*` | `app/(client)/notes/*` |
| `app/bookings/[id].tsx` | `app/(client)/bookings/[id].tsx` |
| `app/m/[slug].tsx` | `app/(public)/m/[slug].tsx` |

## 3. Удалено из старых редиректов

- Эвристики `isOnMasterRoute` по segments — убраны
- Условный рендер `{isMaster && <MasterHamburgerMenu />}` — заменён на разделение layout: MasterHamburgerMenu только в `(master)/_layout.tsx`
- MasterMenuProvider в корне — убран; монтируется только в `(master)/_layout.tsx`

## 4. Новые/изменённые файлы

| Файл | Изменения |
|------|-----------|
| `app/_layout.tsx` | AuthGate: Splash при loading, редирект в useEffect по роли. Stack: login, (master), (client), (public). Без MasterMenuProvider, MasterHamburgerMenu |
| `app/(master)/_layout.tsx` | MasterMenuProvider, MasterHamburgerMenu, BottomNavigationCarousel, Stack |
| `app/(client)/_layout.tsx` | ClientBottomNav, Stack. Без master-импортов |
| `app/(public)/_layout.tsx` | Stack для /m/[slug] |
| `src/components/ClientBottomNav.tsx` | Новая: нижняя навигация для client без useMasterMenu |
| `src/contexts/MasterMenuContext.tsx` | Добавлен MasterMenuProviderNoOp (для совместимости, client layout его не использует) |
| `src/services/api/client.ts` | Request interceptor: при role=client и URL /api/master/* — throw в __DEV__ |
| `src/services/api/master.ts` | getMasterSettings: stack trace при DEBUG_HTTP=1 |

## 5. Проверка

```bash
cd mobile
# В .env: DEBUG_HTTP=1 для трассировки
npx expo start
```

### Шаги
1. **Cold start client:** Выйти → закрыть app → открыть. Должен открыться /client/dashboard, 0 запросов /api/master/*
2. **Logout → login client:** +79990000101 / test123. No /api/master/* requests
3. **Login master:** /api/master/settings вызывается
4. **/m/[slug]:** Открывается без авторизации, без нижней навигации
5. **DEBUG_HTTP=1:** При вызове getMasterSettings — stack trace в логах

# Client Dashboard - Инструкция по запуску

## Что реализовано

Полный перенос функционала ClientDashboard с web на mobile:

### Структура файлов

```
mobile/
├── src/
│   ├── stores/
│   │   └── favoritesStore.ts          # Zustand store для синхронизации favorites
│   ├── utils/
│   │   └── clientDashboard.ts         # Утилиты форматирования дат и getMasterKey
│   ├── services/api/
│   │   └── clientDashboard.ts         # API методы для loyalty points
│   └── components/client/
│       ├── FavoriteButtonControlled.tsx   # Controlled FavoriteButton
│       ├── SectionCard.tsx                # Обёртка для секций
│       ├── BookingRowFuture.tsx           # Строка будущей записи
│       ├── BookingRowPast.tsx             # Строка прошедшей записи
│       └── FavoriteCard.tsx               # Карточка избранного мастера
└── app/client/
    ├── _layout.tsx                    # Layout для client секции
    ├── dashboard.tsx                  # Главный экран (4 секции)
    ├── bookings-future.tsx            # Все будущие записи
    ├── bookings-past.tsx              # Все прошедшие записи
    ├── loyalty-points.tsx             # Все баллы
    └── loyalty-history.tsx            # История транзакций
```

### Функционал

1. **ClientDashboard** (`/client/dashboard`):
   - Секция "Будущие записи" (3 записи + "Посмотреть все")
   - Секция "Прошедшие записи" (3 записи + "Посмотреть все")
   - Секция "Избранные" (карточки мастеров, до 6 шт)
   - Секция "Мои баллы" (3 мастера + "Посмотреть все" + "История")

2. **Синхронизация favorites**:
   - Единый source of truth: `favoritesStore` (Zustand)
   - Toggle сердечка в любой секции мгновенно обновляет все остальные
   - Optimistic update + API call + rollback on error

3. **Экраны "Посмотреть все"**:
   - `/client/bookings-future` - полный список будущих
   - `/client/bookings-past` - полный список прошедших
   - `/client/loyalty-points` - полный список баллов по мастерам
   - `/client/loyalty-history?masterId=X` - история транзакций

4. **Форматирование дат**:
   - Будущие: `ДД.ММ.ГГ, ЧЧ:ММ`
   - Прошедшие: `ДД.ММ.ГГ`

5. **Зелёная тема**:
   - Все ссылки/кнопки/акценты в `#16a34a` (зелёный)
   - Белые карточки с тенями
   - Консистентный UI с web

---

## Установка зависимостей

### 1. Установить недостающие пакеты

```bash
cd mobile

# Zustand для state management
npm install zustand

# Lucide icons для React Native
# lucide-react-native удалён — иконки через @expo/vector-icons (Ionicons)
```

### 2. Проверить установку

```bash
npm list zustand
```

Должно показать:
```
└── zustand@X.X.X
```

---

## Настройка окружения

### 1. API URL

В файле `mobile/src/config/env.ts` убедитесь, что `API_URL` правильно настроен:

**Для iOS Simulator:**
```typescript
export const env = {
  API_URL: 'http://localhost:8000',  // localhost работает на iOS Simulator
  // ...
}
```

**Для Android Emulator:**
```typescript
export const env = {
  API_URL: 'http://10.0.2.2:8000',  // 10.0.2.2 = localhost для Android Emulator
  // ...
}
```

**Для реального устройства (через LAN):**
```typescript
export const env = {
  API_URL: 'http://192.168.X.X:8000',  // Замените на ваш LAN IP
  // ...
}
```

**Как узнать свой LAN IP:**
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

### 2. Backend должен быть запущен

```bash
cd backend
ENVIRONMENT=development ENABLE_DEV_TESTDATA=1 uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Важно:** `--host 0.0.0.0` нужен для доступа с реального устройства через LAN.

---

## Запуск приложения

### Вариант 1: iOS Simulator (macOS only)

```bash
cd mobile

# Запустить Metro bundler
npm start

# В другом терминале запустить iOS Simulator
npm run ios

# Или вручную:
# 1. npm start
# 2. Нажать 'i' в терминале Metro
```

### Вариант 2: Android Emulator

```bash
cd mobile

# Убедитесь, что Android Emulator запущен
# (откройте Android Studio -> AVD Manager -> запустите эмулятор)

# Запустить приложение
npm run android
```

### Вариант 3: Реальное устройство (Expo Go)

```bash
cd mobile

# Запустить Expo
npm start

# Отсканировать QR-код в Expo Go приложении
# iOS: Camera app
# Android: Expo Go app
```

**Важно для реального устройства:**
- Устройство и компьютер должны быть в одной Wi-Fi сети
- В `env.ts` должен быть указан LAN IP (не localhost)
- Backend должен слушать `0.0.0.0` (не `127.0.0.1`)

---

## Проверка работы

### 1. Логин

1. Откройте приложение
2. Если не залогинены → откроется экран логина
3. Введите тестовые данные:
   - **Телефон:** `+79990000101`
   - **Пароль:** `test123`
4. Нажмите "Войти"

### 2. Навигация к Client Dashboard

После логина:
- Если роль `client` → автоматически перенаправит на `/client/dashboard`
- Если другая роль → вручную перейдите: `/client/dashboard`

**Способы навигации (для тестирования):**
```typescript
// В любом компоненте:
import { useRouter } from 'expo-router'

const router = useRouter()
router.push('/client/dashboard')
```

### 3. Проверка функционала

**Секция "Будущие записи":**
- ✅ Отображаются 3 записи (если есть)
- ✅ Кнопка "Посмотреть все" → переход на `/client/bookings-future`
- ✅ Иконки: сердечко (favorite), edit, cancel
- ✅ Дата в формате `ДД.ММ.ГГ, ЧЧ:ММ`

**Секция "Прошедшие записи":**
- ✅ Отображаются 3 записи (если есть)
- ✅ Кнопка "Посмотреть все" → переход на `/client/bookings-past`
- ✅ Иконки: сердечко, repeat, dislike
- ✅ Дата в формате `ДД.ММ.ГГ`
- ✅ Tooltip dislike: "Не понравилось. Отобразится при следующем бронировании"

**Секция "Избранные":**
- ✅ Карточки мастеров (до 6 шт)
- ✅ Сердечко в правом верхнем углу карточки
- ✅ Клик на карточку → переход на мастера (TODO: реализовать)

**Секция "Мои баллы":**
- ✅ Показывает `total_balance` и список мастеров (до 3)
- ✅ Кнопка "Посмотреть все" → `/client/loyalty-points`
- ✅ Кнопка "История" → `/client/loyalty-history`
- ✅ Имя мастера кликабельно (зелёное)

**Синхронизация favorites:**
- ✅ Toggle сердечка в "Будущих" → сердечко в "Прошедших" обновляется
- ✅ Toggle сердечка в "Прошедших" → сердечко в "Будущих" обновляется
- ✅ Toggle сердечка → карточка появляется/исчезает в "Избранных"
- ✅ Без перезагрузки страницы

### 4. Pull-to-refresh

В каждом экране:
- Потяните вниз → данные перезагрузятся
- Индикатор загрузки зелёный (`#16a34a`)

---

## Troubleshooting

### Проблема: "Network Error" или "ECONNREFUSED"

**Причина:** Приложение не может подключиться к backend.

**Решение:**
1. Проверьте, что backend запущен:
   ```bash
   curl http://localhost:8000/api/health
   # Должно вернуть: {"status":"ok"}
   ```

2. Проверьте `API_URL` в `mobile/src/config/env.ts`:
   - iOS Simulator: `http://localhost:8000`
   - Android Emulator: `http://10.0.2.2:8000`
   - Реальное устройство: `http://192.168.X.X:8000` (ваш LAN IP)

3. Убедитесь, что backend слушает `0.0.0.0`:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

### Проблема: "Cannot find module 'zustand'"

**Решение:**
```bash
cd mobile
npm install zustand
```

### Проблема: "Cannot find module 'lucide-react-native'"

**Решение:** lucide-react-native удалён. Иконки через @expo/vector-icons (Ionicons).

### Проблема: Favorites не синхронизируются

**Причина:** Store не инициализирован или разные типы ID (string vs number).

**Решение:**
1. Проверьте, что `hydrateFavorites()` вызывается в `ClientDashboard`:
   ```typescript
   useEffect(() => {
     loadData()  // Внутри вызывается hydrateFavorites()
   }, [])
   ```

2. Проверьте в консоли логи:
   ```
   [Favorites] Ошибка загрузки мастеров: ...
   [getMasterKey] Invalid master ID: ...
   ```

3. Убедитесь, что backend возвращает `master_id` или `indie_master_id` в bookings.

### Проблема: "Пока нет начисленных баллов" (хотя должны быть)

**Причина:** Данные не созданы в БД.

**Решение:**
```bash
# Из корня репозитория:
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Или из папки backend/:
cd backend && python3 scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

Проверьте:
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/client/loyalty/points
```

### Проблема: TypeScript ошибки

**Решение:**
```bash
cd mobile
npm run tsc --noEmit
```

Если есть ошибки импорта — убедитесь, что пути в `tsconfig.json` настроены:
```json
{
  "compilerOptions": {
    "paths": {
      "@src/*": ["./src/*"]
    }
  }
}
```

---

## Следующие шаги (TODO)

### 1. Реализовать действия (actions)

В `ClientDashboard.tsx` есть заглушки:
- `handleEditBooking` → открыть модалку редактирования
- `handleCancelBooking` → открыть модалку отмены
- `handleRepeatBooking` → повторить запись
- `handleDislikeBooking` → отправить dislike
- `handlePressFavorite` → переход на страницу мастера

**Рекомендация:** Переиспользовать существующие компоненты из `mobile/src/components/`:
- `BookingTimeEditModal.tsx` для редактирования
- `CancelReasonSheet.tsx` для отмены

### 2. Добавить навигацию на страницу мастера

В `handlePressFavorite` и при клике на имя мастера:
```typescript
const handlePressMaster = (masterId: number, masterDomain?: string) => {
  if (masterDomain) {
    router.push(`/domain/${masterDomain}`)
  } else {
    router.push(`/masters/${masterId}`)
  }
}
```

### 3. Добавить фильтры/сортировку

Для экранов "Посмотреть все":
- Фильтр по статусу (будущие)
- Фильтр по дате
- Сортировка

### 4. Добавить пагинацию

Если записей много:
- FlatList с `onEndReached`
- Подгрузка следующей страницы

### 5. Добавить скелетоны загрузки

Вместо пустого экрана при `isLoading`:
- Skeleton для строк bookings
- Skeleton для карточек favorites

### 6. E2E тесты

Добавить Maestro тесты для Client Dashboard:
```yaml
# .maestro/flows/client-dashboard.yaml
appId: com.yourcompany.dedato
---
- launchApp
- tapOn: "Войти"
- inputText: "+79990000101"
- tapOn: "Пароль"
- inputText: "test123"
- tapOn: "Войти"
- assertVisible: "Мой кабинет"
- assertVisible: "Будущие записи"
- assertVisible: "Прошедшие записи"
- assertVisible: "Избранные"
- assertVisible: "Мои баллы"
```

---

## Контакты и поддержка

Если возникли проблемы:
1. Проверьте логи Metro bundler (терминал с `npm start`)
2. Проверьте логи backend (терминал с `uvicorn`)
3. Проверьте логи в приложении (React Native Debugger или console.log)
4. Проверьте сеть: `curl http://<API_URL>/api/health`

---

## Итоговый чеклист запуска

- [ ] Backend запущен: `uvicorn main:app --host 0.0.0.0 --port 8000`
- [ ] Тестовые данные созданы: `python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000`
- [ ] Установлены зависимости: `npm install zustand`
- [ ] `API_URL` настроен правильно в `mobile/src/config/env.ts`
- [ ] Приложение запущено: `npm start` + `npm run ios` (или `android`)
- [ ] Логин под `+79990000101 / test123`
- [ ] Переход на `/client/dashboard`
- [ ] Проверка 4 секций: Будущие, Прошедшие, Избранные, Мои баллы
- [ ] Проверка синхронизации favorites (toggle в одной секции → обновляется в других)
- [ ] Проверка "Посмотреть все" для каждой секции
- [ ] Проверка "История" в секции "Мои баллы"

**Готово! 🎉**

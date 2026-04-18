# План автоматизированного тестирования мобильного приложения

## 1. Обзор

### 1.1. Цель
Создать набор автоматизированных тестов для проверки основного функционала мобильного приложения DeDato.

### 1.2. Инструменты
- **Detox** или **Appium** - для E2E тестирования React Native
- **Jest** - для unit и integration тестов
- **React Native Testing Library** - для тестирования компонентов

## 2. Архитектура тестов

### 2.1. Структура тестов
```
mobile/
├── __tests__/
│   ├── unit/              # Unit тесты
│   ├── integration/        # Integration тесты
│   └── e2e/               # E2E тесты
├── test-utils/            # Утилиты для тестов
└── test-data/             # Тестовые данные
```

### 2.2. Типы тестов
1. **Unit тесты** - тестирование отдельных функций и компонентов
2. **Integration тесты** - тестирование взаимодействия компонентов
3. **E2E тесты** - тестирование полных пользовательских сценариев

## 3. План реализации по этапам

### Этап 1: Настройка инфраструктуры

#### 1.1. Установка зависимостей
```bash
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native
npm install --save-dev detox detox-circus
```

#### 1.2. Конфигурация Jest
- Создать `jest.config.js`
- Настроить моки для React Native модулей
- Настроить моки для Expo модулей
- Настроить пути алиасов (@src, @assets)

#### 1.3. Конфигурация Detox
- Создать `.detoxrc.js`
- Настроить эмуляторы/симуляторы
- Настроить сборку тестового приложения

#### 1.4. Тестовые утилиты
- Создать моки для API клиента
- Создать моки для AuthContext
- Создать helper функции для тестов

### Этап 2: Unit тесты

#### 2.1. Тестирование API сервисов
**Файлы для тестирования:**
- `src/services/api/auth.ts`
- `src/services/api/bookings.ts`
- `src/services/api/favorites.ts`
- `src/services/api/notes.ts`
- `src/services/api/profile.ts`

**Тестовые сценарии:**
- [ ] `auth.ts`: login() успешно возвращает токен
- [ ] `auth.ts`: login() обрабатывает ошибки
- [ ] `auth.ts`: register() создает пользователя
- [ ] `bookings.ts`: getUserBookings() определяет правильный endpoint по роли
- [ ] `bookings.ts`: getFutureBookings() возвращает только будущие бронирования
- [ ] `bookings.ts`: getPastBookings() возвращает только прошедшие бронирования
- [ ] `favorites.ts`: getAllFavorites() объединяет все типы избранного
- [ ] `favorites.ts`: addToFavorites() добавляет элемент
- [ ] `favorites.ts`: removeFromFavorites() удаляет элемент
- [ ] `notes.ts`: getAllNotes() возвращает все заметки
- [ ] `notes.ts`: createOrUpdateMasterNote() создает/обновляет заметку
- [ ] `profile.ts`: updateClientProfile() обновляет профиль
- [ ] `profile.ts`: changePassword() меняет пароль
- [ ] `profile.ts`: deleteAccount() удаляет аккаунт

#### 2.2. Тестирование утилит
**Файлы для тестирования:**
- `src/services/api/bookings.ts` (getStatusLabel, getStatusColor)
- `src/services/api/favorites.ts` (getFavoriteName, getFavoriteItemId)

**Тестовые сценарии:**
- [ ] getStatusLabel() возвращает правильные названия статусов
- [ ] getStatusColor() возвращает правильные цвета
- [ ] getFavoriteName() возвращает правильное имя
- [ ] getFavoriteItemId() возвращает правильный ID

#### 2.3. Тестирование компонентов
**Компоненты для тестирования:**
- `src/components/FavoriteButton.tsx`
- `src/components/FavoritesModal.tsx`
- `src/components/AllBookingsModal.tsx`
- `src/components/BookingTimeEditModal.tsx`
- `src/components/BottomNavigationCarousel.tsx`

**Тестовые сценарии:**
- [ ] FavoriteButton: отображается правильно
- [ ] FavoriteButton: переключает состояние при нажатии
- [ ] FavoritesModal: отображает список избранного
- [ ] FavoritesModal: пагинация работает
- [ ] AllBookingsModal: отображает бронирования
- [ ] BookingTimeEditModal: календарь начинается с понедельника
- [ ] BottomNavigationCarousel: определяет активную страницу

### Этап 3: Integration тесты

#### 3.1. Тестирование экранов
**Экраны для тестирования:**
- `app/login.tsx`
- `app/index.tsx`
- `app/bookings/index.tsx`
- `app/bookings/[id].tsx`
- `app/notes/index.tsx`
- `app/settings/index.tsx`

**Тестовые сценарии:**
- [ ] login.tsx: форма входа валидируется
- [ ] login.tsx: форма регистрации валидируется
- [ ] login.tsx: переключение между вкладками работает
- [ ] index.tsx: загружает данные при монтировании
- [ ] index.tsx: отображает избранное
- [ ] index.tsx: отображает прошедшие записи
- [ ] bookings/index.tsx: загружает будущие бронирования
- [ ] bookings/[id].tsx: загружает детали бронирования
- [ ] bookings/[id].tsx: кнопки редактирования показываются только для будущих
- [ ] notes/index.tsx: загружает заметки
- [ ] notes/index.tsx: редактирование заметки работает
- [ ] settings/index.tsx: редактирование профиля работает
- [ ] settings/index.tsx: смена пароля работает

### Этап 4: E2E тесты (Detox)

#### 4.1. Сценарии аутентификации
```javascript
describe('Authentication Flow', () => {
  it('should login successfully', async () => {
    // 1. Открыть экран логина
    // 2. Ввести телефон и пароль
    // 3. Нажать "Войти"
    // 4. Проверить редирект на главный экран
  });

  it('should register new user', async () => {
    // 1. Открыть экран регистрации
    // 2. Выбрать роль "Клиент"
    // 3. Заполнить все поля
    // 4. Нажать "Зарегистрироваться"
    // 5. Проверить редирект на главный экран
  });

  it('should show validation errors', async () => {
    // 1. Попытаться зарегистрироваться с невалидными данными
    // 2. Проверить отображение ошибок валидации
  });
});
```

#### 4.2. Сценарии работы с избранным
```javascript
describe('Favorites Flow', () => {
  it('should add item to favorites', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть страницу бронирований
    // 3. Нажать на кнопку избранного у мастера
    // 4. Проверить, что элемент добавился в избранное
    // 5. Проверить отображение на главном экране
  });

  it('should remove item from favorites', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть модальное окно избранного
    // 3. Нажать на кнопку удаления
    // 4. Проверить, что элемент удален
  });

  it('should paginate favorites', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть модальное окно избранного
    // 3. Проверить наличие кнопок пагинации
    // 4. Перейти на следующую страницу
    // 5. Проверить отображение элементов
  });
});
```

#### 4.3. Сценарии работы с бронированиями
```javascript
describe('Bookings Flow', () => {
  it('should view booking details', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть страницу бронирований
    // 3. Нажать на элемент бронирования
    // 4. Проверить отображение деталей
  });

  it('should edit booking time', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть детали будущего бронирования
    // 3. Нажать "Изменить время"
    // 4. Выбрать новую дату и время
    // 5. Сохранить изменения
    // 6. Проверить обновление времени
  });

  it('should cancel booking', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть детали будущего бронирования
    // 3. Нажать "Отменить бронирование"
    // 4. Подтвердить отмену
    // 5. Проверить редирект
  });
});
```

#### 4.4. Сценарии работы с заметками
```javascript
describe('Notes Flow', () => {
  it('should view notes list', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть страницу заметок через нижнюю навигацию
    // 3. Проверить отображение списка заметок
  });

  it('should edit note', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть страницу заметок
    // 3. Нажать на кнопку редактирования
    // 4. Изменить текст
    // 5. Сохранить
    // 6. Проверить обновление
  });

  it('should delete note', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть страницу заметок
    // 3. Нажать на кнопку удаления
    // 4. Подтвердить удаление
    // 5. Проверить удаление из списка
  });
});
```

#### 4.5. Сценарии работы с профилем
```javascript
describe('Profile Flow', () => {
  it('should edit profile', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть настройки
    // 3. Нажать "Редактировать профиль"
    // 4. Изменить email или телефон
    // 5. Сохранить
    // 6. Проверить обновление данных
  });

  it('should change password', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть настройки
    // 3. Нажать "Изменить пароль"
    // 4. Ввести текущий и новый пароль
    // 5. Сохранить
    // 6. Проверить успешное изменение
  });

  it('should delete account', async () => {
    // 1. Войти в аккаунт
    // 2. Открыть настройки
    // 3. Нажать "Удалить аккаунт"
    // 4. Ввести пароль
    // 5. Подтвердить удаление
    // 6. Проверить редирект на логин
  });
});
```

#### 4.6. Сценарии навигации
```javascript
describe('Navigation Flow', () => {
  it('should navigate via bottom carousel', async () => {
    // 1. Войти в аккаунт
    // 2. Нажать на "Мои заметки" в карусели
    // 3. Проверить переход на страницу заметок
    // 4. Нажать на "Настройки"
    // 5. Проверить переход на страницу настроек
    // 6. Нажать на "Мой профиль"
    // 7. Проверить переход на главный экран
  });

  it('should highlight active page', async () => {
    // 1. Войти в аккаунт
    // 2. Проверить подсветку "Мой профиль"
    // 3. Перейти на "Мои заметки"
    // 4. Проверить подсветку "Мои заметки"
    // 5. Проверить зеленое подчеркивание
  });
});
```

## 4. Тестовые данные

### 4.1. Моки API
```javascript
// test-utils/api-mocks.js
export const mockBookings = [
  {
    id: 1,
    service_name: 'Тестовая услуга',
    master_name: 'Тестовый мастер',
    start_time: '2025-12-25T16:20:00Z',
    end_time: '2025-12-25T16:50:00Z',
    status: 'created',
    // ...
  },
  // ...
];

export const mockFavorites = [
  {
    id: 1,
    type: 'master',
    master_id: 1,
    favorite_name: 'Тестовый мастер',
    // ...
  },
  // ...
];
```

### 4.2. Тестовые пользователи
```javascript
// test-data/users.js
export const testUsers = {
  client: {
    phone: '+79999999999',
    email: 'test@client.com',
    password: 'test123',
    role: 'client',
  },
  master: {
    phone: '+78888888888',
    email: 'test@master.com',
    password: 'test123',
    role: 'master',
  },
};
```

## 5. CI/CD интеграция

### 5.1. GitHub Actions / GitLab CI
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
```

### 5.2. Скрипты в package.json
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "detox test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

## 6. Приоритеты реализации

### Высокий приоритет (MVP)
1. ✅ Настройка инфраструктуры
2. ✅ Unit тесты для API сервисов
3. ✅ E2E тесты для критических сценариев:
   - Вход/Регистрация
   - Просмотр бронирований
   - Редактирование времени бронирования
   - Работа с избранным

### Средний приоритет
1. Integration тесты для экранов
2. E2E тесты для всех основных сценариев
3. Тесты компонентов

### Низкий приоритет
1. Тесты производительности
2. Тесты доступности (accessibility)
3. Визуальные регрессионные тесты

## 7. Метрики покрытия

### Целевые показатели
- **Unit тесты**: 80% покрытия кода
- **Integration тесты**: 70% покрытия экранов
- **E2E тесты**: 100% критических сценариев

### Инструменты
- Jest coverage reports
- Codecov для отслеживания покрытия
- Detox test reports

## 8. Поддержка и обновление

### 8.1. Регулярные обновления
- Обновлять тесты при добавлении нового функционала
- Рефакторить тесты при изменении архитектуры
- Удалять устаревшие тесты

### 8.2. Документация
- Документировать новые тесты
- Обновлять план тестирования
- Ведение базы знаний о тестах

## 9. Примеры тестов

### 9.1. Unit тест (API сервис)
```javascript
// __tests__/unit/api/bookings.test.ts
import { getUserBookings, getFutureBookings } from '@src/services/api/bookings';
import { apiClient } from '@src/services/api/client';

jest.mock('@src/services/api/client');

describe('Bookings API', () => {
  it('should get future bookings for client', async () => {
    const mockBookings = [{ id: 1, start_time: '2025-12-25T16:20:00Z' }];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

    const result = await getFutureBookings('client');

    expect(apiClient.get).toHaveBeenCalledWith('/api/client/bookings/');
    expect(result).toEqual(mockBookings);
  });
});
```

### 9.2. Integration тест (Экран)
```javascript
// __tests__/integration/screens/index.test.tsx
import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from '@app/index';
import { AuthProvider } from '@src/auth/AuthContext';

describe('HomeScreen', () => {
  it('should load and display bookings', async () => {
    const { getByText } = render(
      <AuthProvider>
        <HomeScreen />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByText('Ближайшая запись')).toBeTruthy();
    });
  });
});
```

### 9.3. E2E тест (Detox)
```javascript
// e2e/auth.e2e.js
describe('Authentication', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should login successfully', async () => {
    await element(by.id('phone-input')).typeText('+79999999999');
    await element(by.id('password-input')).typeText('test123');
    await element(by.id('login-button')).tap();
    
    await waitFor(element(by.text('Привет')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

## 10. Чек-лист для запуска тестов

### Перед запуском
- [ ] Установлены все зависимости (`npm install`)
- [ ] Настроены переменные окружения для тестов
- [ ] Запущен эмулятор/симулятор (для E2E тестов)
- [ ] Собрано тестовое приложение (для E2E тестов)

### Запуск тестов
- [ ] Unit тесты: `npm run test:unit`
- [ ] Integration тесты: `npm run test:integration`
- [ ] E2E тесты: `npm run test:e2e`
- [ ] Все тесты: `npm test`

### После запуска
- [ ] Проверить отчеты о покрытии
- [ ] Исправить упавшие тесты
- [ ] Обновить тесты при необходимости


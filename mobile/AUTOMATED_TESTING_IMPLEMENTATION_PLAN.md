# План реализации автоматизированного тестирования

## 1. Обзор проекта

### 1.1. Текущее состояние
- ✅ React Native приложение с Expo
- ✅ TypeScript
- ✅ Expo Router для навигации
- ❌ Тесты отсутствуют
- ❌ Инфраструктура тестирования не настроена

### 1.2. Цели тестирования
- Покрыть критический функционал автоматизированными тестами
- Обеспечить стабильность при добавлении новых функций
- Ускорить процесс проверки перед релизом
- Выявить регрессии на ранних этапах

## 2. Выбор инструментов

### 2.1. Unit и Integration тесты
**Инструмент: Jest + React Native Testing Library**

**Преимущества:**
- Стандартный инструмент для React Native
- Хорошая интеграция с TypeScript
- Поддержка моков и snapshot тестирования
- Быстрое выполнение

**Установка:**
```bash
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native jest-expo
npm install --save-dev @types/jest
```

### 2.2. E2E тесты
**Инструмент: Detox**

**Преимущества:**
- Специально для React Native
- Работает на реальных устройствах и эмуляторах
- Стабильные селекторы
- Хорошая документация

**Альтернатива: Appium** (если Detox не подойдет)

**Установка:**
```bash
npm install --save-dev detox detox-circus
```

## 3. Структура тестов

### 3.1. Организация файлов
```
mobile/
├── __tests__/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── api/
│   │   │   │   ├── auth.test.ts
│   │   │   │   ├── bookings.test.ts
│   │   │   │   ├── favorites.test.ts
│   │   │   │   ├── notes.test.ts
│   │   │   │   └── profile.test.ts
│   │   │   └── client.test.ts
│   │   └── utils/
│   │       ├── date.test.ts
│   │       └── validation.test.ts
│   ├── integration/
│   │   ├── components/
│   │   │   ├── FavoriteButton.test.tsx
│   │   │   ├── FavoritesModal.test.tsx
│   │   │   ├── BookingTimeEditModal.test.tsx
│   │   │   └── BottomNavigationCarousel.test.tsx
│   │   └── screens/
│   │       ├── login.test.tsx
│   │       ├── home.test.tsx
│   │       ├── bookings.test.tsx
│   │       ├── notes.test.tsx
│   │       └── settings.test.tsx
│   └── e2e/
│       ├── auth.e2e.js
│       ├── favorites.e2e.js
│       ├── bookings.e2e.js
│       ├── notes.e2e.js
│       └── profile.e2e.js
├── test-utils/
│   ├── mocks/
│   │   ├── api-client.mock.ts
│   │   ├── auth-context.mock.tsx
│   │   └── navigation.mock.ts
│   ├── helpers/
│   │   ├── render-helpers.tsx
│   │   └── test-data.ts
│   └── setup.ts
└── jest.config.js
```

## 4. Этап 1: Настройка инфраструктуры

### 4.1. Установка зависимостей

#### Шаг 1.1: Установка Jest и React Native Testing Library
```bash
cd mobile
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native jest-expo @types/jest
```

#### Шаг 1.2: Установка дополнительных утилит
```bash
npm install --save-dev @testing-library/react-hooks
npm install --save-dev react-test-renderer
```

#### Шаг 1.3: Установка Detox (для E2E)
```bash
npm install --save-dev detox detox-circus
```

### 4.2. Конфигурация Jest

#### Файл: `jest.config.js`
```javascript
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-vector-icons)',
  ],
  setupFilesAfterEnv: ['<rootDir>/test-utils/setup.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@assets/(.*)$': '<rootDir>/assets/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/?(*.)+(spec|test).{ts,tsx}',
  ],
};
```

### 4.3. Настройка тестового окружения

#### Файл: `test-utils/setup.ts`
```typescript
import '@testing-library/jest-native/extend-expect';

// Моки для React Native модулей
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Моки для Expo модулей
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
  Stack: {
    Screen: ({ children }: any) => children,
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));
```

### 4.4. Создание моков

#### Файл: `test-utils/mocks/api-client.mock.ts`
```typescript
export const mockApiClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
};

jest.mock('@src/services/api/client', () => ({
  apiClient: mockApiClient,
}));
```

#### Файл: `test-utils/mocks/auth-context.mock.tsx`
```typescript
import React from 'react';
import { AuthContextType } from '@src/auth/AuthContext';

export const mockUser = {
  id: 1,
  email: 'test@test.com',
  phone: '+79999999999',
  full_name: 'Test User',
  role: 'client',
};

export const mockAuthContext: AuthContextType = {
  user: mockUser,
  token: 'mock-token',
  isLoading: false,
  isAuthenticated: true,
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  refreshUser: jest.fn(),
};

export const MockAuthProvider = ({ children, value = mockAuthContext }: any) => {
  const AuthContext = require('@src/auth/AuthContext').AuthContext;
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 4.5. Тестовые данные

#### Файл: `test-utils/helpers/test-data.ts`
```typescript
export const mockBookings = [
  {
    id: 1,
    service_name: 'Стрижка',
    master_name: 'Иван Иванов',
    salon_name: 'Салон красоты',
    start_time: '2025-12-25T16:00:00Z',
    end_time: '2025-12-25T16:30:00Z',
    status: 'created',
    service_duration: 30,
    payment_amount: 1000,
    is_paid: false,
    master_id: 1,
    salon_id: 1,
  },
  {
    id: 2,
    service_name: 'Окрашивание',
    master_name: 'Мария Петрова',
    start_time: '2025-12-20T14:00:00Z',
    end_time: '2025-12-20T16:00:00Z',
    status: 'completed',
    service_duration: 120,
    payment_amount: 3000,
    is_paid: true,
    master_id: 2,
  },
];

export const mockFavorites = [
  {
    id: 1,
    type: 'master',
    master_id: 1,
    favorite_name: 'Иван Иванов',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    type: 'salon',
    salon_id: 1,
    favorite_name: 'Салон красоты',
    created_at: '2025-01-02T00:00:00Z',
  },
];

export const mockNotes = [
  {
    id: 'master_1',
    type: 'master',
    master_id: 1,
    master_name: 'Иван Иванов',
    note: 'Отличный мастер, всегда делает качественно',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];
```

### 4.6. Обновление package.json

#### Добавление скриптов
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "detox test",
    "test:e2e:build": "detox build",
    "test:e2e:build:android": "detox build --configuration android.emu.debug"
  }
}
```

## 5. Этап 2: Unit тесты для API сервисов

### 5.1. Тесты для auth.ts

#### Файл: `__tests__/unit/services/api/auth.test.ts`
```typescript
import { login, register, RegisterCredentials } from '@src/services/api/auth';
import { mockApiClient } from '../../../../test-utils/mocks/api-client.mock';

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        access_token: 'test-token',
        user: { id: 1, email: 'test@test.com' },
      };
      (mockApiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await login({ phone: '+79999999999', password: 'password123' });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/auth/login', {
        phone: '+79999999999',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle login error', async () => {
      const error = new Error('Invalid credentials');
      (mockApiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(login({ phone: '+79999999999', password: 'wrong' })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const credentials: RegisterCredentials = {
        email: 'new@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'New User',
        role: 'client',
      };
      const mockResponse = {
        access_token: 'test-token',
        user: { id: 2, email: 'new@test.com' },
      };
      (mockApiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await register(credentials);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/auth/register', credentials);
      expect(result).toEqual(mockResponse);
    });
  });
});
```

### 5.2. Тесты для bookings.ts

#### Файл: `__tests__/unit/services/api/bookings.test.ts`
```typescript
import { getUserBookings, getFutureBookings, getPastBookings, updateBooking, cancelBooking } from '@src/services/api/bookings';
import { mockApiClient } from '../../../../test-utils/mocks/api-client.mock';
import { mockBookings } from '../../../../test-utils/helpers/test-data';

describe('Bookings API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserBookings', () => {
    it('should use correct endpoint for client', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'client');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/client/bookings/');
    });

    it('should use correct endpoint for master', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'master');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/master/bookings/detailed');
    });
  });

  describe('getFutureBookings', () => {
    it('should return only future bookings', async () => {
      const futureBooking = {
        ...mockBookings[0],
        start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };
      (mockApiClient.get as jest.Mock).mockResolvedValue({ data: [futureBooking] });

      const result = await getFutureBookings('client');

      expect(result).toHaveLength(1);
      expect(new Date(result[0].start_time).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('updateBooking', () => {
    it('should update booking time', async () => {
      const newStartTime = '2025-12-26T16:00:00Z';
      const updatedBooking = { ...mockBookings[0], start_time: newStartTime };
      (mockApiClient.put as jest.Mock).mockResolvedValue({ data: updatedBooking });

      const result = await updateBooking(1, newStartTime);

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/client/bookings/1', {
        start_time: newStartTime,
      });
      expect(result.start_time).toBe(newStartTime);
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking', async () => {
      const cancelledBooking = { ...mockBookings[0], status: 'cancelled' };
      (mockApiClient.delete as jest.Mock).mockResolvedValue({ data: cancelledBooking });

      const result = await cancelBooking(1);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/client/bookings/1');
      expect(result.status).toBe('cancelled');
    });
  });
});
```

### 5.3. Тесты для favorites.ts

#### Файл: `__tests__/unit/services/api/favorites.test.ts`
```typescript
import { getAllFavorites, addToFavorites, removeFromFavorites } from '@src/services/api/favorites';
import { mockApiClient } from '../../../../test-utils/mocks/api-client.mock';
import { mockFavorites } from '../../../../test-utils/helpers/test-data';

describe('Favorites API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllFavorites', () => {
    it('should combine all favorite types', async () => {
      (mockApiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: [{ salon_id: 1, favorite_name: 'Salon' }] })
        .mockResolvedValueOnce({ data: [{ master_id: 1, favorite_name: 'Master' }] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getAllFavorites();

      expect(result.length).toBeGreaterThan(0);
      expect(mockApiClient.get).toHaveBeenCalledTimes(4);
    });
  });

  describe('addToFavorites', () => {
    it('should add master to favorites', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });

      await addToFavorites('master', 1, 'Test Master');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/client/favorites', {
        favorite_type: 'master',
        master_id: 1,
        favorite_name: 'Test Master',
      });
    });
  });

  describe('removeFromFavorites', () => {
    it('should remove favorite', async () => {
      (mockApiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await removeFromFavorites('master', 1);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/client/favorites/master/1');
    });
  });
});
```

## 6. Этап 3: Integration тесты для компонентов

### 6.1. Тесты для FavoriteButton

#### Файл: `__tests__/integration/components/FavoriteButton.test.tsx`
```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FavoriteButton } from '@src/components/FavoriteButton';
import { getAllFavorites, addToFavorites, removeFromFavorites } from '@src/services/api/favorites';
import { MockAuthProvider } from '../../../test-utils/mocks/auth-context.mock';

jest.mock('@src/services/api/favorites');

describe('FavoriteButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render favorite button', () => {
    (getAllFavorites as jest.Mock).mockResolvedValue([]);

    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test Master" />
      </MockAuthProvider>
    );

    expect(getByTestId('favorite-button')).toBeTruthy();
  });

  it('should add to favorites when clicked', async () => {
    (getAllFavorites as jest.Mock).mockResolvedValue([]);
    (addToFavorites as jest.Mock).mockResolvedValue({});

    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test Master" />
      </MockAuthProvider>
    );

    await waitFor(() => {
      const button = getByTestId('favorite-button');
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(addToFavorites).toHaveBeenCalledWith('master', 1, 'Test Master');
    });
  });

  it('should remove from favorites when clicked again', async () => {
    (getAllFavorites as jest.Mock).mockResolvedValue([
      { type: 'master', id: 1, master_id: 1 },
    ]);
    (removeFromFavorites as jest.Mock).mockResolvedValue({});

    const { getByTestId } = render(
      <MockAuthProvider>
        <FavoriteButton type="master" itemId={1} itemName="Test Master" />
      </MockAuthProvider>
    );

    await waitFor(() => {
      const button = getByTestId('favorite-button');
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(removeFromFavorites).toHaveBeenCalledWith('master', 1);
    });
  });
});
```

### 6.2. Тесты для FavoritesModal

#### Файл: `__tests__/integration/components/FavoritesModal.test.tsx`
```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FavoritesModal } from '@src/components/FavoritesModal';
import { mockFavorites } from '../../../test-utils/helpers/test-data';
import { removeFromFavorites, getAllFavorites } from '@src/services/api/favorites';

jest.mock('@src/services/api/favorites');

describe('FavoritesModal', () => {
  it('should display favorites', () => {
    const { getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
        onFavoriteRemoved={jest.fn()}
      />
    );

    expect(getByText('Моё избранное')).toBeTruthy();
    expect(getByText('Иван Иванов')).toBeTruthy();
  });

  it('should paginate favorites', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
    }));

    const { getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
        onFavoriteRemoved={jest.fn()}
      />
    );

    expect(getByText('1 / 2')).toBeTruthy();
  });

  it('should remove favorite', async () => {
    (removeFromFavorites as jest.Mock).mockResolvedValue({});
    (getAllFavorites as jest.Mock).mockResolvedValue([]);

    const onFavoriteRemoved = jest.fn();
    const { getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
        onFavoriteRemoved={onFavoriteRemoved}
      />
    );

    const removeButton = getByText('✕');
    fireEvent.press(removeButton);

    await waitFor(() => {
      expect(removeFromFavorites).toHaveBeenCalled();
      expect(onFavoriteRemoved).toHaveBeenCalled();
    });
  });
});
```

## 7. Этап 4: E2E тесты (Detox)

### 7.1. Конфигурация Detox

#### Файл: `.detoxrc.js`
```javascript
module.exports = {
  testRunner: {
    args: {
      '$0': 'node_modules/.bin/jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/YourApp.app',
      build: 'xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build'
    },
    'android.emu.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081]
    }
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 14'
      }
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_4_API_30'
      }
    }
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug'
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.emu.debug'
    }
  }
};
```

### 7.2. E2E тест для аутентификации

#### Файл: `__tests__/e2e/auth.e2e.js`
```javascript
describe('Authentication Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should login successfully', async () => {
    // Проверяем, что мы на экране логина
    await expect(element(by.id('login-screen'))).toBeVisible();

    // Вводим телефон
    await element(by.id('phone-input')).typeText('+79999999999');
    
    // Вводим пароль
    await element(by.id('password-input')).typeText('test123');
    
    // Нажимаем кнопку входа
    await element(by.id('login-button')).tap();
    
    // Ждем перехода на главный экран
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should register new user', async () => {
    // Переключаемся на вкладку регистрации
    await element(by.id('register-tab')).tap();
    
    // Выбираем роль "Клиент"
    await element(by.id('role-client')).tap();
    
    // Заполняем форму
    await element(by.id('full-name-input')).typeText('Test User');
    await element(by.id('email-input')).typeText('test@test.com');
    await element(by.id('phone-input')).typeText('+78888888888');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('confirm-password-input')).typeText('password123');
    
    // Соглашаемся с условиями
    await element(by.id('agreement-checkbox')).tap();
    
    // Нажимаем кнопку регистрации
    await element(by.id('register-button')).tap();
    
    // Ждем перехода на главный экран
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

### 7.3. E2E тест для избранного

#### Файл: `__tests__/e2e/favorites.e2e.js`
```javascript
describe('Favorites Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
    // Предполагаем, что пользователь уже залогинен
    await loginUser();
  });

  it('should add item to favorites', async () => {
    // Переходим на страницу бронирований
    await element(by.id('bookings-button')).tap();
    
    // Нажимаем на кнопку избранного у первого мастера
    await element(by.id('favorite-button-master-1')).tap();
    
    // Проверяем, что кнопка стала активной (заполненное сердечко)
    await expect(element(by.id('favorite-button-master-1-filled'))).toBeVisible();
    
    // Возвращаемся на главный экран
    await element(by.id('back-button')).tap();
    
    // Проверяем, что элемент появился в избранном
    await element(by.id('favorites-expand-button')).tap();
    await expect(element(by.text('Test Master'))).toBeVisible();
  });

  it('should open favorites modal and paginate', async () => {
    // Раскрываем секцию избранного
    await element(by.id('favorites-expand-button')).tap();
    
    // Нажимаем "Ещё"
    await element(by.id('favorites-more-button')).tap();
    
    // Проверяем, что модальное окно открылось
    await expect(element(by.id('favorites-modal'))).toBeVisible();
    
    // Переходим на следующую страницу
    await element(by.id('favorites-next-button')).tap();
    
    // Проверяем номер страницы
    await expect(element(by.text('2 / 2'))).toBeVisible();
  });
});
```

## 8. Этап 5: Добавление testID для E2E тестов

### 8.1. Обновление компонентов

Необходимо добавить `testID` к ключевым элементам:

#### Пример для login.tsx
```typescript
<View testID="login-screen">
  <TextInput testID="phone-input" ... />
  <TextInput testID="password-input" ... />
  <TouchableOpacity testID="login-button" ... />
</View>
```

#### Пример для FavoriteButton
```typescript
<TouchableOpacity testID={`favorite-button-${type}-${itemId}`} ... />
```

## 9. План реализации по приоритетам

### Приоритет 1 (Критический функционал)
1. ✅ Настройка инфраструктуры
2. ✅ Unit тесты для API сервисов (auth, bookings, favorites)
3. ✅ Integration тесты для FavoriteButton
4. ✅ E2E тесты для аутентификации

### Приоритет 2 (Важный функционал)
1. Unit тесты для notes и profile API
2. Integration тесты для модальных окон
3. E2E тесты для работы с бронированиями
4. E2E тесты для избранного

### Приоритет 3 (Дополнительный функционал)
1. Integration тесты для всех экранов
2. E2E тесты для заметок и профиля
3. Тесты производительности
4. Визуальные регрессионные тесты

## 10. Метрики успеха

### Покрытие кода
- **Unit тесты**: минимум 80% покрытия API сервисов
- **Integration тесты**: минимум 70% покрытия компонентов
- **E2E тесты**: 100% критических пользовательских сценариев

### Время выполнения
- **Unit тесты**: < 30 секунд
- **Integration тесты**: < 2 минут
- **E2E тесты**: < 10 минут

### Стабильность
- Все тесты должны проходить стабильно (не флакать)
- E2E тесты должны проходить на CI/CD

## 11. CI/CD интеграция

### GitHub Actions пример

#### Файл: `.github/workflows/test.yml`
```yaml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd mobile && npm install
      - run: cd mobile && npm run test:unit
      - uses: codecov/codecov-action@v3
        with:
          files: ./mobile/coverage/lcov.info

  e2e-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd mobile && npm install
      - run: cd mobile && npm run test:e2e:build:android
      - run: cd mobile && npm run test:e2e
```

## 12. Чек-лист для начала реализации

### Перед началом
- [ ] Установлены все зависимости
- [ ] Настроен Jest
- [ ] Настроен Detox (если нужен)
- [ ] Создана структура папок для тестов
- [ ] Созданы моки и утилиты

### Первые тесты
- [ ] Написан первый unit тест (auth.test.ts)
- [ ] Написан первый integration тест (FavoriteButton.test.tsx)
- [ ] Все тесты проходят локально

### Готовность к E2E
- [ ] Добавлены testID ко всем ключевым элементам
- [ ] Настроен эмулятор/симулятор
- [ ] Написан первый E2E тест
- [ ] E2E тест проходит локально

---

## Примечания

1. **Начните с unit тестов** - они самые быстрые и простые
2. **Добавляйте testID постепенно** - не нужно добавлять все сразу
3. **Используйте моки** - не делайте реальные API запросы в тестах
4. **Пишите стабильные тесты** - избегайте хардкода времени ожидания
5. **Документируйте тесты** - используйте понятные названия и описания

---

## Следующие шаги

После утверждения плана:
1. Установить зависимости
2. Настроить конфигурацию
3. Создать структуру папок
4. Написать первые тесты
5. Интегрировать в CI/CD


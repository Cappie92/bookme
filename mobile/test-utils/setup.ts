// Моки для Expo модулей (должны быть до других моков)
jest.mock('expo', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('expo/src/winter/runtime.native', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('expo/src/winter/installGlobal', () => ({
  __esModule: true,
  default: {},
  getValue: jest.fn(() => ({})),
}));

// Мок для env конфига
jest.mock('@src/config/env', () => ({
  env: {
    API_URL: 'http://localhost:8001',
  },
}));

// Мок для apiClient должен быть первым
jest.mock('@src/services/api/client', () => {
  const mockApiClient = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    apiClient: mockApiClient,
    default: mockApiClient,
  };
});

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
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
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
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));



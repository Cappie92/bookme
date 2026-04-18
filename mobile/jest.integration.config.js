module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test-utils/setup.integration.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@assets/(.*)$': '<rootDir>/assets/$1',
    '^@env$': '<rootDir>/test-utils/mocks/env.mock.ts',
    '^react-native-vector-icons/(.*)$': '@expo/vector-icons/$1',
  },
  testMatch: [
    '**/__tests__/integration/**/*.test.{ts,tsx}',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-vector-icons)',
  ],
  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};


const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  setupFiles: [
    ...(expoPreset.setupFiles || []),
    '<rootDir>/test-utils/setup.integration.winter.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/test-utils/setup.integration.ts'],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper || {}),
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@assets/(.*)$': '<rootDir>/assets/$1',
    '^@env$': '<rootDir>/test-utils/mocks/env.mock.ts',
    '^shared/(.*)$': '<rootDir>/../shared/$1',
    '^react-native-vector-icons$': '@expo/vector-icons',
    '^react-native-vector-icons/(.*)': '@expo/vector-icons/$1',
  },
  testMatch: ['**/__tests__/integration/**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};

import { defineConfig } from '@playwright/test'

// Fully local fixture-only gate: no account, real backend or provider required.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ios-hardening.spec.ts',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/ios-hardening-report.json' }]],
  use: { baseURL: 'http://127.0.0.1:5197', viewport: { width: 1180, height: 900 } },
  webServer: {
    command: 'npx vite --config vite.ios-hardening.config.js',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: false,
  },
})

import { test, expect } from '@playwright/test'
import { MASTER_A } from './fixtures'

// 6) Public master page: /m/e2e-master-a without login
test('public master page loads and shows address', async ({ page }) => {
  await page.goto('/m/e2e-master-a')
  await expect(page.locator('[data-testid="public-master-name"]')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid="public-master-address"]')).toBeVisible({ timeout: 5000 })
})

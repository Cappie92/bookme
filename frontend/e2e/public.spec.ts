import { test, expect } from '@playwright/test'
import { MASTER_A } from './fixtures'

test('public master page loads and shows address', async ({ page }) => {
  await page.goto(`/m/${MASTER_A.domain}`)
  const sidebar = page.getByTestId('public-booking-sidebar')
  await expect(sidebar).toBeVisible()
  await expect(sidebar).toContainText('E2E Master A')
  await expect(page.getByTestId('public-master-address')).toBeVisible()
})

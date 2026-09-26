import { test, expect } from '@playwright/test'
import { CLIENT_C } from './fixtures'
import { loginViaUI } from './helpers'

test('client cancels a seeded upcoming booking', async ({ page }) => {
  await loginViaUI(page, CLIENT_C.phone, CLIENT_C.password)
  await page.goto('/client')
  await expect(page.getByTestId('client-page')).toBeVisible()
  await expect(page.getByTestId('client-future-bookings-section')).toBeVisible()
  await expect(page.getByTestId('client-bookings-list')).toBeVisible()

  const items = page
    .getByTestId('client-bookings-list')
    .locator('[data-testid^="client-booking-item-"]')
    .filter({ visible: true })
  const itemsBefore = await items.count()
  expect(itemsBefore).toBeGreaterThan(0)

  await page.getByTestId('client-booking-cancel-btn').first().click()
  await page.getByTestId('client-booking-cancel-confirm').click()

  const expectedCount = itemsBefore - 1
  if (expectedCount === 0) {
    await expect(page.getByTestId('client-bookings-empty')).toBeVisible()
  } else {
    await expect(items).toHaveCount(expectedCount)
  }
})

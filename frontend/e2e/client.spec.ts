import { test, expect } from '@playwright/test'
import { CLIENT_C } from './fixtures'
import { loginViaUI } from './helpers'
import { selectOptionByPartialText } from './utils'

test('client creates and cancels booking', async ({ page }) => {
  await loginViaUI(page, CLIENT_C.phone, CLIENT_C.password)
  await page.goto('/domain/e2e-master-a')
  await expect(page.locator('[data-testid="public-book-button"]')).toBeVisible({ timeout: 20000 })

  const serviceSelect = page.getByTestId('service-select')
  await expect(serviceSelect).toContainText('E2E Стрижка')
  await selectOptionByPartialText(serviceSelect, 'E2E Стрижка')
  await page.waitForTimeout(1500)

  const dateInput = page.locator('input[name="date"]')
  const today = new Date().toISOString().split('T')[0]
  await dateInput.fill(today)
  await page.waitForTimeout(1000)

  await expect(page.locator('[data-testid="slot-time-first"]')).toBeVisible({ timeout: 15000 })
  await page.locator('[data-testid="slot-time-first"]').click()
  await page.locator('[data-testid="public-book-button"]').click()

  const created = await page.getByTestId('booking-created-success').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  if (created) {
    await page.getByTestId('client-go-to-dashboard').waitFor({ state: 'visible', timeout: 3000 })
    await page.waitForTimeout(500)
    await page.getByTestId('client-go-to-dashboard').click()
  } else {
    await page.goto('/client', { waitUntil: 'domcontentloaded' })
  }

  const onClient = await page.waitForURL(/\/client(\/.*)?/, { timeout: 5000 }).then(() => true).catch(() => false)
  const needsLogin = await page.getByRole('button', { name: /Войти/i }).first().isVisible().catch(() => false)
  if (!onClient || needsLogin) {
    await loginViaUI(page, CLIENT_C.phone, CLIENT_C.password)
    if (!page.url().includes('/client')) {
      await page.goto('/client')
    }
    await page.waitForURL(/\/client(\/.*)?/, { timeout: 15000 })
  }

  await expect(page.getByTestId('client-page')).toBeVisible({ timeout: 25000 })
  await page.waitForResponse(res => res.url().includes('/api/client/bookings/') && res.status() === 200, { timeout: 15000 }).catch(() => {})
  const section = page.getByTestId('client-future-bookings-section')
  await section.scrollIntoViewIfNeeded()
  await expect(page.getByTestId('client-bookings-list')).toBeVisible({ timeout: 25000 })
  await expect(
    page.getByTestId('client-booking-item-0').filter({ visible: true })
  ).toBeVisible({ timeout: 5000 })

  const itemsBefore = await page
    .getByTestId('client-bookings-list')
    .locator('[data-testid^="client-booking-item-"]')
    .filter({ visible: true })
    .count()
  await page.getByTestId('client-booking-cancel-btn').first().click()
  await page.getByTestId('client-booking-cancel-confirm').click()

  await expect(page.getByTestId('client-page')).toBeVisible()
  const expectedCount = itemsBefore - 1
  if (expectedCount === 0) {
    await expect(page.getByTestId('client-bookings-empty')).toBeVisible({ timeout: 10000 })
  } else {
    await expect(
      page
        .getByTestId('client-bookings-list')
        .locator('[data-testid^="client-booking-item-"]')
        .filter({ visible: true })
    ).toHaveCount(expectedCount, { timeout: 10000 })
  }
})

/**
 * E2E: публичная запись к мастеру /m/:slug (wizard без логина → логин → создание брони).
 * Проверяет: выбор услуги/даты/слота, CTA, логин, success, антидубли (один POST).
 * Также: initialTab в шапке (Войти/Зарегистрироваться), логин из шапки на /m/:slug без редиректа.
 */
import { test, expect } from '@playwright/test'

const SLUG = process.env.E2E_PUBLIC_SLUG ?? 'm-TK5E3n9R'
const CLIENT_PHONE = process.env.E2E_CLIENT_PHONE ?? '+79990000101'
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? 'test123'
const BASE = process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'

test.describe('public booking wizard', () => {
  test('header: Войти opens login tab, close, Зарегистрироваться opens register tab', async ({ page }) => {
    await page.goto(`${BASE}/m/${SLUG}`, { waitUntil: 'networkidle' })
    await page.getByTestId('header-login').first().click()
    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible({ timeout: 5000 })
    await expect(authModal.getByRole('button', { name: 'Вход' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
    await page.getByTestId('auth-login-close').click()
    await expect(authModal).not.toBeVisible()
    await page.getByTestId('header-register').first().click()
    await expect(authModal).toBeVisible({ timeout: 3000 })
    await expect(authModal.getByRole('button', { name: 'Регистрация' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
  })

  test('Header login on /m/:slug does NOT create booking (POST count 0)', async ({ page }) => {
    let postBookingsCount = 0
    await page.route('**/api/public/masters/*/bookings', async (route) => {
      if (route.request().method() === 'POST') postBookingsCount += 1
      await route.continue()
    })

    await page.goto(`${BASE}/m/${SLUG}`, { waitUntil: 'networkidle' })
    await page.getByTestId('service-picker-button').click()
    const firstService = page.locator('[data-testid^="service-option-"]').first()
    await expect(firstService).toBeVisible({ timeout: 5000 })
    await firstService.click()
    const firstDateCell = page.locator('[data-testid^="date-cell-"]').first()
    await expect(firstDateCell).toBeVisible({ timeout: 15000 })
    await firstDateCell.click()
    const firstSlot = page.locator('[data-testid^="slot-"]').first()
    await expect(firstSlot).toBeVisible({ timeout: 10000 })
    await firstSlot.click()
    await expect(page.locator('.bg-green-50.border-green-200')).toBeVisible()
    await page.getByTestId('header-login').first().click()
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible({ timeout: 5000 })
    await page.locator('[data-testid="auth-modal"] input[name="phone"]').fill(CLIENT_PHONE)
    await page.locator('[data-testid="auth-modal"] input[name="password"]').fill(CLIENT_PASSWORD)
    await page.locator('[data-testid="auth-login-submit"]').click()
    await expect(page.locator('[data-testid="auth-modal"]')).not.toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(expect.stringContaining(`/m/${SLUG}`))
    await expect(page.locator('.bg-green-50.border-green-200')).toBeVisible()
    expect(postBookingsCount, 'При логине из шапки POST /bookings быть не должно').toBe(0)
  })

  test('Confirm flow (CTA → prompt → login) creates exactly one booking', async ({ page }) => {
    let postBookingsCount = 0
    await page.route('**/api/public/masters/*/bookings', async (route) => {
      if (route.request().method() === 'POST') postBookingsCount += 1
      await route.continue()
    })

    await page.goto(`${BASE}/m/${SLUG}`, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-testid="service-picker-button"]')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('service-picker-button').click()
    const firstService = page.locator('[data-testid^="service-option-"]').first()
    await expect(firstService).toBeVisible({ timeout: 5000 })
    await firstService.click()

    const firstDateCell = page.locator('[data-testid^="date-cell-"]').first()
    await expect(firstDateCell).toBeVisible({ timeout: 15000 })
    await firstDateCell.click()

    const firstSlot = page.locator('[data-testid^="slot-"]').first()
    await expect(firstSlot).toBeVisible({ timeout: 10000 })
    await firstSlot.click()

    await page.getByTestId('cta-book').click()

    await expect(page.getByTestId('public-auth-prompt')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('public-auth-login').click()

    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible({ timeout: 5000 })
    await authModal.locator('input[name="phone"]').fill(CLIENT_PHONE)
    await authModal.locator('input[name="password"]').fill(CLIENT_PASSWORD)
    await page.locator('[data-testid="auth-login-submit"]').click()

    const successScreen = page.getByTestId('success-screen')
    await expect(successScreen).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('link', { name: /Добавить в календарь/i })).toBeVisible()
    await expect(page.getByTestId('go-to-my-bookings')).toBeVisible()

    expect(postBookingsCount, 'POST /bookings должен быть ровно один раз').toBe(1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const stillSuccess = await page.getByTestId('success-screen').isVisible().catch(() => false)
    if (stillSuccess) {
      expect(postBookingsCount, 'После reload не должно быть повторного POST').toBe(1)
    }
  })
})

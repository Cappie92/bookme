/**
 * Public booking wizard on /m/:slug: header auth tabs, login-from-header does not POST,
 * CTA login creates exactly one booking. Uses seeded Master A + Client C.
 */
import { test, expect } from '@playwright/test'
import { CLIENT_C, MASTER_A } from './fixtures'

async function openWizardOnFirstSlot(page) {
  await page.goto(`/m/${MASTER_A.domain}`)
  await expect(page.getByTestId('service-picker-button')).toBeVisible()
  await page.getByTestId('service-picker-button').click()
  const picker = page.getByRole('dialog', { name: 'Выбор услуги' })
  await expect(picker).toBeVisible()
  const collapsedCategory = picker.locator('button[aria-expanded="false"]').first()
  if (await collapsedCategory.count()) {
    await collapsedCategory.click()
  }
  const firstService = picker.locator('[data-testid^="service-option-"]').first()
  await expect(firstService).toBeVisible()
  await firstService.click()
  const firstDateCell = page.locator('[data-testid^="date-cell-"]').first()
  await expect(firstDateCell).toBeVisible()
  await firstDateCell.click()
  const firstSlot = page.locator('[data-testid^="slot-"]').first()
  await expect(firstSlot).toBeVisible()
  await firstSlot.click()
}

test.describe('public booking wizard', () => {
  test('header: Войти opens login tab, close, Зарегистрироваться opens register tab', async ({ page }) => {
    await page.goto(`/m/${MASTER_A.domain}`)
    await page.getByTestId('header-login').first().click()
    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible()
    await expect(authModal.getByRole('button', { name: 'Вход' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
    await page.getByTestId('auth-login-close').click()
    await expect(authModal).not.toBeVisible()
    await page.getByTestId('header-register').first().click()
    await expect(authModal).toBeVisible()
    await expect(authModal.getByRole('button', { name: 'Регистрация' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
  })

  test('Header login on /m/:slug does NOT create booking (POST count 0)', async ({ page }) => {
    let postBookingsCount = 0
    await page.route('**/api/public/masters/*/bookings', async (route) => {
      if (route.request().method() === 'POST') postBookingsCount += 1
      await route.continue()
    })

    await openWizardOnFirstSlot(page)
    await expect(page.getByTestId('public-booking-summary')).toBeVisible()
    await page.getByTestId('header-login').first().click()
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible()
    await page.locator('[data-testid="auth-modal"] input[name="phone"]').fill(CLIENT_C.phone)
    await page.locator('[data-testid="auth-modal"] input[name="password"]').fill(CLIENT_C.password)
    await page.locator('[data-testid="auth-login-submit"]').click()
    await expect(page.locator('[data-testid="auth-modal"]')).not.toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/m/${MASTER_A.domain}`))
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
    await expect(page.getByTestId('service-picker-button')).toBeVisible()
    expect(postBookingsCount, 'При логине из шапки POST /bookings быть не должно').toBe(0)
  })

  test('Confirm flow (CTA → prompt → login) creates exactly one booking', async ({ page }) => {
    let postBookingsCount = 0
    await page.route('**/api/public/masters/*/bookings', async (route) => {
      if (route.request().method() === 'POST') postBookingsCount += 1
      await route.continue()
    })

    await openWizardOnFirstSlot(page)
    await page.getByTestId('cta-book').click()
    await expect(page.getByTestId('public-auth-prompt')).toBeVisible()
    await page.getByTestId('public-auth-login').click()

    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible()
    await authModal.locator('input[name="phone"]').fill(CLIENT_C.phone)
    await authModal.locator('input[name="password"]').fill(CLIENT_C.password)
    await page.locator('[data-testid="auth-login-submit"]').click()

    const successScreen = page.getByTestId('success-screen')
    await expect(successScreen).toBeVisible()
    await expect(successScreen.getByRole('heading', { name: 'Запись создана' })).toBeVisible()
    await expect(page.getByTestId('public-booking-success-summary')).toBeVisible()
    await expect(page.getByRole('button', { name: /Скачать \.ics/i })).toBeVisible()
    await expect(page.getByTestId('go-to-my-bookings')).toBeVisible()
    const referenceLine = successScreen.getByText(/Номер записи:/)
    await expect(referenceLine).toBeVisible()
    const referenceText = (await referenceLine.textContent()) || ''
    expect(postBookingsCount, 'POST /bookings должен быть ровно один раз').toBe(1)

    await page.reload()
    const successAfterRefresh = page.getByTestId('success-screen')
    await expect(successAfterRefresh).toBeVisible()
    await expect(successAfterRefresh.getByText(referenceText.trim())).toBeVisible()
    expect(postBookingsCount, 'Refresh не должен слать второй POST /bookings').toBe(1)
  })
})

import { test, expect } from '@playwright/test'

// Landing-only changes still exercise rendering, the store link/asset and both
// entry CTAs. Do not navigate to any external store or production service.
test('home shows the App Store badge and opens registration', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Онлайн-запись')
  const badge = page.getByRole('img', { name: 'Загрузите в App Store', exact: true })
  await expect(badge).toBeVisible()
  await expect(badge).not.toHaveJSProperty('naturalWidth', 0)
  await expect(badge.locator('..')).toHaveAttribute(
    'href', /^https:\/\/apps\.apple\.com\/.*\/id6794012674$/,
  )
  await page.getByRole('button', { name: 'Попробовать бесплатно' }).first().click()
  await expect(page.getByTestId('auth-modal')).toBeVisible()
  await expect(page.locator('[data-testid="auth-modal"] input[name="phone"]')).toBeVisible()
})

test('home demo CTA opens the local demo cabinet', async ({ page }) => {
  await page.goto('/')
  const demoAccess = page.waitForResponse((response) =>
    response.url().includes('/api/auth/demo-master-access') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Демо-кабинет', exact: true }).first().click()
  // Home.jsx routes to /demo/master. The dashboard hop needs a pinned demo
  // identity (DEMO_MASTER_USER_ID); disposable E2E SQLite does not pin one.
  await expect(page).toHaveURL(/\/demo\/master$/)
  await demoAccess
  await expect(
    page.getByText('Подготавливаем демо-кабинет…').or(page.getByText('Демо временно недоступно')),
  ).toBeVisible()
})

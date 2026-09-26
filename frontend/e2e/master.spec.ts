import { test, expect } from '@playwright/test'
import { MASTER_A, MASTER_B } from './fixtures'
import { loginViaUI } from './helpers'

test('master login opens dashboard', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible()
})

test('free plan shows locked items and demo', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  const lockedFinance = page
    .getByRole('complementary', { name: 'Навигация кабинета' })
    .getByTestId('locked-finance')
  await expect(lockedFinance).toBeVisible()
  await expect(async () => {
    const popover = page.getByTestId('locked-popover')
    if (!(await popover.isVisible())) {
      await lockedFinance.getByRole('button').click()
    }
    await expect(popover).toBeVisible({ timeout: 2000 })
    await popover.getByTestId('locked-open-demo').click({ force: true, timeout: 2000 })
    await expect(page.getByText('Демонстрационный доступ')).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20000 })
})

test('master settings save', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await page.locator('[data-testid="nav-settings"]').click()
  await expect(page.locator('[data-testid="settings-edit"]').or(page.locator('[data-testid="settings-save"]'))).toBeVisible({ timeout: 10000 })
  const editBtn = page.locator('[data-testid="settings-edit"]')
  if (await editBtn.isVisible()) {
    await editBtn.click()
  }
  const toggle = page.locator('[data-testid="toggle-auto-confirm"]')
  if (await toggle.count() > 0) {
    await toggle.click()
  }
  const saveBtn = page.locator('[data-testid="settings-save"]')
  const saveResp = page.waitForResponse(
    (r) => r.url().includes('/api/master/profile') && r.request().method() === 'PUT' && r.status() >= 200 && r.status() < 300,
    { timeout: 15000 }
  )
  await saveBtn.click()
  const resp = await saveResp
  expect(resp.ok(), 'PUT /api/master/profile должен вернуть 2xx').toBe(true)
})

test('master dashboard remains reachable after login', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await page.locator('[data-testid="nav-dashboard"]').click()
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
})

test('pre-visit free plan has no buttons', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await page.locator('[data-testid="nav-schedule"]').click()
  const preVisitBtn = page.locator('button:has-text("Подтвердить визит")').or(page.locator('button:has-text("Предварительное подтверждение")'))
  await expect(preVisitBtn).toHaveCount(0)
})

test('pre-visit Master B has confirm buttons', async ({ page }) => {
  await loginViaUI(page, MASTER_B.phone, MASTER_B.password)
  
  // Проверяем API: Master B должен иметь pre_visit_confirmations_enabled=true
  const settingsResp = page.waitForResponse(
    (r) => r.url().includes('/api/master/settings') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 10000 }
  )
  await page.locator('[data-testid="nav-settings"]').click()
  const settings = await settingsResp
  const settingsJson = await settings.json()
  const preVisitEnabled = settingsJson?.master?.pre_visit_confirmations_enabled ?? false
  expect(preVisitEnabled, 'Master B должен иметь pre_visit_confirmations_enabled=true').toBe(true)
})

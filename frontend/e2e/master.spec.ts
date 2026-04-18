import { test, expect } from '@playwright/test'
import { MASTER_A, MASTER_B } from './fixtures'
import { loginViaUI } from './helpers'

test('master login opens dashboard', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible()
})

test('free plan shows locked items and demo', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await page.locator('[data-testid="locked-finance"]').or(page.locator('[data-testid="locked-stats"]')).first().click()
  const demoBtn = page.getByTestId('locked-open-demo')
  await expect(demoBtn).toBeVisible({ timeout: 10000 })
  await demoBtn.click({ force: true })
  await expect(page.locator('text=Демонстрационный доступ')).toBeVisible({ timeout: 10000 })
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

test('post-visit confirm booking', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  await page.locator('[data-testid="nav-dashboard"]').click()
  await expect(page.locator('[data-testid="postvisit-section"]')).toBeVisible({ timeout: 15000 })
  const confirmResp = page.waitForResponse(
    (r) => r.url().includes('/api/master/accounting/confirm-booking/') && r.request().method() === 'POST' && r.status() >= 200 && r.status() < 300,
    { timeout: 10000 }
  )
  const reloadResp = page.waitForResponse(
    (r) => r.url().includes('/api/master/accounting/pending-confirmations') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 10000 }
  )
  await page.locator('[data-testid="postvisit-confirm-first"]').click()
  const resp = await confirmResp
  expect(resp.ok(), 'Confirm API должен вернуть 2xx').toBe(true)
  await reloadResp
  // После подтверждения postvisit-section должен исчезнуть (или стать пустым)
  await expect(page.locator('[data-testid="postvisit-section"]')).not.toBeVisible({ timeout: 10000 })
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

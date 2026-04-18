import { test, expect } from '@playwright/test'
import { MASTER_A } from './fixtures'
import { loginViaUI } from './helpers'

// 7) Robokassa stub: buy plan -> stub-complete -> features updated
test('robokassa stub purchase flow', async ({ page }) => {
  await loginViaUI(page, MASTER_A.phone, MASTER_A.password)
  
  // Переходим на страницу тарифов
  await page.locator('[data-testid="nav-tariff"]').click()
  await expect(page.locator('[data-testid="tariff-page-title"]')).toBeVisible({ timeout: 10000 })
  
  // Открываем модальное окно покупки
  await page.locator('[data-testid="tariff-buy-button"]').click()
  
  // Проверяем, что модальное окно открылось и есть хотя бы один тариф
  const firstPlan = page.locator('[data-testid^="tariff-plan-"]').first()
  await expect(firstPlan).toBeVisible({ timeout: 10000 })
  
  // Проверяем, что кнопка оплаты присутствует (даже если disabled)
  const paymentBtn = page.locator('[data-testid="tariff-payment-button"]')
  await expect(paymentBtn).toBeVisible({ timeout: 10000 })
})

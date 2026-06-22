import { test, expect } from '@playwright/test'

test.describe('promo-engine web UI', () => {
  test('/register promo query opens master registration with prefilled promo code', async ({ page }) => {
    await page.goto('/register?promo_code=REF123')

    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible({ timeout: 5000 })
    await expect(authModal.getByRole('button', { name: 'Регистрация' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
    await expect(authModal.getByRole('button', { name: 'Мастер' })).toHaveClass(/bg-\[#4CAF50\]/)
    await expect(authModal.locator('input[name="promo_code"]')).toHaveValue('REF123')

    await authModal.getByRole('button', { name: 'Клиент' }).click()
    await expect(authModal.locator('input[name="promo_code"]')).toHaveCount(0)
  })
})
